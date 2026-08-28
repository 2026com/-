import { chatCompletionJSON } from '../../../modules/ai-assistant/services/aiClient.js'
import { GRAPH_CATEGORIES } from './mockKnowledgeGraph.js'
import { loadUserNodes, saveUserNodes, makeKnowledgeId } from './userKnowledge.js'
import { getShareInbox, setShareInbox } from '../../../services/db.js'

/**
 * 链接 → 知识节点 导入管线 V1.0
 * ============================================================================
 * 链路：URL → Jina Reader 解析（标题+正文）→ DeepSeek 拆解为多个知识节点
 *       → 6 大图谱分类（GRAPH_CATEGORIES）→ saveUserNodes 入库（IndexedDB，
 *       经 storage 门面）→ window 事件 knowledge:nodes-added 通知 3D 图谱刷新。
 *
 * 设计要点：
 *  - 解析：r.jina.ai 免 Key 档（Accept: application/json → { data: { title, content } }），
 *    20s 超时；失败/限流错误码化交由 UI 呈现，不阻塞主流程；
 *  - 拆解：chatCompletionJSON（JSON 模式 + 截断容错），category 只允许 GRAPH_CATEGORIES
 *    的 6 个 id，非法值兜底为 'cs'；节点数按内容量 1~8 个；
 *  - 幂等：按 sourceUrl 去重（同链接不重复入库）；入库后派发全局事件，
 *    KnowledgeGraph3D 监听后 setUserNodes(loadUserNodes()) 复用既有渲染管线；
 *  - 扩展字段：summary / keywords / sourceUrl / source 随节点存储，
 *    不影响图谱现有 { id, name, category, createdAt } 消费。
 */

const VALID_CATEGORIES = new Set(GRAPH_CATEGORIES.map(c => c.id))
const CATEGORY_FALLBACK = 'cs'
const CONTENT_LIMIT = 12000        // 送入 LLM 的正文上限（字符）
const FETCH_TIMEOUT_MS = 20000
const SPLIT_TIMEOUT_MS = 60000
const MAX_NODES = 8

/** 错误码 → 用户可读文案（UI 直接消费） */
export function describeImportError(err) {
  const code = err && err.code
  const map = {
    invalid_url: { title: '链接格式不正确', hint: '请粘贴以 http(s):// 开头的完整链接' },
    no_api_key: { title: '尚未配置 AI 模型', hint: '点右上角 ⚙️ 配置 DeepSeek API Key 后再试（拆解需要大模型）' },
    duplicate: { title: '该链接已导入过', hint: '同一链接不会重复生成节点；可换一篇内容试试' },
    parse_failed: { title: '解析服务暂时不可用', hint: '网页抓取失败或触发限流（免费档约 20 次/分钟），请稍后重试' },
    split_failed: { title: '内容拆解失败', hint: '模型没有返回有效的知识点，请重试；若持续失败请检查模型配置' },
    save_failed: { title: '入库失败', hint: '本地存储写入异常，请重试' },
  }
  return map[code] || { title: '导入失败', hint: (err && err.message) ? String(err.message).slice(0, 160) : '未知错误，请重试' }
}

/** 规范化用户输入的链接：补协议 + 校验 http(s) */
export function normalizeUrl(raw) {
  let url = String(raw || '').trim()
  if (!url) throw Object.assign(new Error('链接为空'), { code: 'invalid_url' })
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) throw new Error('bad protocol')
    return u.href
  } catch {
    throw Object.assign(new Error('链接格式不正确'), { code: 'invalid_url' })
  }
}

/** 从分享文本中提取第一个 URL（pending 快捷选用用） */
export function extractFirstUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s，,。）)】"']+/)
  return m ? m[0] : ''
}

/** Jina Reader 解析：返回 { title, content }（content 为 Markdown 文本） */
export async function fetchArticle(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    if (!resp.ok) throw Object.assign(new Error(`解析服务返回 ${resp.status}`), { code: 'parse_failed' })
    const raw = await resp.text()
    let title = ''
    let content = ''
    try {
      const json = JSON.parse(raw)
      const data = json && json.data ? json.data : json
      title = String(data?.title || '')
      content = String(data?.content || data?.text || '')
    } catch {
      // 纯文本回退：Title: / Markdown Content: 头格式
      const t = raw.match(/^Title:\s*(.+)$/m)
      const c = raw.match(/^Markdown Content:\s*([\s\S]*)$/m)
      title = t ? t[1].trim() : ''
      content = c ? c[1] : raw
    }
    if (!content.trim()) {
      throw Object.assign(new Error('页面无可提取正文'), { code: 'parse_failed' })
    }
    if (!title) {
      try { title = new URL(url).hostname } catch { title = '未命名内容' }
    }
    return { title, content: content.slice(0, CONTENT_LIMIT) }
  } catch (err) {
    if (err && err.code) throw err
    if (err && err.name === 'AbortError') {
      throw Object.assign(new Error('解析超时'), { code: 'parse_failed' })
    }
    throw Object.assign(new Error(err && err.message ? err.message : '解析失败'), { code: 'parse_failed' })
  } finally {
    clearTimeout(timer)
  }
}

/** DeepSeek 拆解：网页内容 → 独立知识节点数组（标题/摘要/关键词/分类） */
export async function splitIntoNodes({ title, content }, aiConfig) {
  if (!aiConfig?.baseUrl || !aiConfig?.apiKey || !aiConfig?.modelId) {
    throw Object.assign(new Error('未配置模型'), { code: 'no_api_key' })
  }
  const categoryList = GRAPH_CATEGORIES.map(c => `${c.id}=${c.name}`).join(', ')
  const system = [
    '你是知识拆解助手，把一篇网页内容拆解为若干个独立的知识点节点，供 3D 知识图谱渲染。',
    '规则：',
    '1. 只输出 JSON 数组，不要输出任何解释文字或代码块标记；',
    `2. 节点数量按内容信息量决定：内容短则 1~3 个，内容长最多 ${MAX_NODES} 个；`,
    '3. 每个节点格式：{"title":"节点标题，不超过12个字","summary":"一句话摘要，不超过60个字","keywords":["关键词1","关键词2"],"category":"类别id"}；',
    `4. category 必须严格取自：${categoryList}；`,
    '5. 节点之间相互独立、不重复，只基于原文内容，不编造原文没有的信息。',
  ].join('\n')
  const user = `【标题】${title || '（无标题）'}\n【正文】\n${content}`

  const { data } = await chatCompletionJSON(
    aiConfig,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    {
      timeoutMs: SPLIT_TIMEOUT_MS,
      temperature: 0.3,
      maxTokens: 3000,
      fallbackParser: (text) => {
        const m = String(text || '').match(/\[[\s\S]*\]/)
        return m ? JSON.parse(m[0]) : []
      },
    }
  )
  const list = Array.isArray(data) ? data : []
  const nodes = list
    .map((it) => ({
      title: String(it?.title || '').trim(),
      summary: String(it?.summary || '').trim().slice(0, 120),
      keywords: Array.isArray(it?.keywords) ? it.keywords.map(k => String(k).trim()).filter(Boolean).slice(0, 5) : [],
      category: VALID_CATEGORIES.has(it?.category) ? it.category : CATEGORY_FALLBACK,
    }))
    .filter(it => it.title)
    .slice(0, MAX_NODES)
  if (nodes.length === 0) {
    throw Object.assign(new Error('模型未返回有效知识点'), { code: 'split_failed' })
  }
  return nodes
}

/**
 * 完整管线：URL → 解析 → 拆解 → 入库（IndexedDB）→ 广播图谱刷新
 * @param {string} rawUrl 用户粘贴的链接
 * @param {object} opts { aiConfig, onStatus({stage, detail}), inboxItemId }
 * @returns {Promise<{ nodes: Array, title: string }>}
 */
export async function importKnowledgeFromUrl(rawUrl, { aiConfig, onStatus, inboxItemId } = {}) {
  const report = (stage, detail) => { try { onStatus && onStatus({ stage, detail }) } catch { /* 回调异常不影响管线 */ } }
  const url = normalizeUrl(rawUrl)

  // 幂等（快速路径）：同 sourceUrl 不重复入库
  const before = loadUserNodes()
  if (before.some(n => n && n.sourceUrl === url)) {
    throw Object.assign(new Error('该链接已导入过'), { code: 'duplicate' })
  }

  report('parsing')
  const article = await fetchArticle(url)

  report('splitting', { title: article.title })
  const split = await splitIntoNodes(article, aiConfig)

  report('saving')
  try {
    // 落库前重读一次，避免管线期间外部变更被覆盖
    const current = loadUserNodes()
    if (current.some(n => n && n.sourceUrl === url)) {
      throw Object.assign(new Error('该链接已导入过'), { code: 'duplicate' })
    }
    const now = Date.now()
    const newNodes = split.map((it, i) => ({
      id: makeKnowledgeId(it.title),
      name: it.title,
      category: it.category,
      createdAt: now + i, // 同批节点时间有序
      summary: it.summary,
      keywords: it.keywords,
      sourceUrl: url,
      source: 'link_import',
    }))
    saveUserNodes([...current, ...newNodes])

    // 分享收件箱联动：对应 pending 条目标记为已导入（保留痕迹）
    if (inboxItemId) {
      try {
        const inbox = await getShareInbox()
        await setShareInbox((inbox || []).map(it => (
          it && it.id === inboxItemId ? { ...it, status: 'imported' } : it
        )))
      } catch { /* 收件箱联动失败不影响导入结果 */ }
    }

    // 广播：3D 图谱（若挂载中）立即刷新；未挂载时下次进入页面自然加载
    try { window.dispatchEvent(new CustomEvent('knowledge:nodes-added', { detail: { count: newNodes.length, sourceUrl: url } })) } catch { /* 忽略 */ }

    report('done', { count: newNodes.length, nodes: newNodes, title: article.title })
    return { nodes: newNodes, title: article.title }
  } catch (err) {
    if (err && err.code) throw err
    throw Object.assign(new Error(err && err.message ? err.message : '入库失败'), { code: 'save_failed' })
  }
}