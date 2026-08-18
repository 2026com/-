/**
 * 通用 AI 客户端（浏览器端 fetch，单一调用入口）
 * 目标：
 *  1. 真正打通侧边 AI 对话和【AI写执行方案】，都复用这一套用户配置的模型
 *  2. 默认 DeepSeek，预留其他市面模型扩展（配置面板已支持 qwen/glm/custom）
 *  3. 密钥 100% 从浏览器 localStorage（aiConfig）读取，绝不硬编码
 *  4. 健壮性：AbortController 超时、错误状态码解析、返回 JSON/字符串兼容兜底
 *  5. 可选：JSON 模式（让 LLM 直接输出 JSON 数组，便于「AI写执行方案」生成结构化子节点）
 */

const DEFAULT_TIMEOUT = 15000; // 默认 15 秒超时（AI生成结构化内容比聊天稍长，给足时间）

/**
 * 聊天补全（OpenAI 兼容协议 /chat/completions）
 *
 * @param {object}   config              来自 state.aiConfig 的对象（provider/baseUrl/modelId/apiKey）
 * @param {object[]} messages            [{ role: 'system'|'user'|'assistant', content: string }, ...]
 * @param {object}   options
 * @param {number}   options.timeoutMs   超时毫秒（默认 15000）
 * @param {number}   options.temperature 默认 0.7
 * @param {boolean}  options.jsonMode    true = 要求模型返回合法 JSON（默认 false）
 * @param {number}   options.maxTokens   最大输出 token（可选）
 * @returns {Promise<{ content: string, raw: any }>}  解析后的 content 字段 + 原始响应体
 */
export async function chatCompletion(config, messages, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT,
    temperature = 0.7,
    jsonMode = false,
    maxTokens = undefined
  } = options;

  if (!config || typeof config !== 'object') {
    throw new Error('缺少模型配置对象 aiConfig');
  }
  const baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '');
  const modelId = String(config.modelId || '').trim();
  const apiKey = String(config.apiKey || '').trim();

  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    throw new Error('Base URL 必须以 http:// 或 https:// 开头，请在 ⚙️ 配置面板检查');
  }
  if (!modelId) {
    throw new Error('未配置 Model ID（模型名称），请在 ⚙️ 配置面板检查');
  }
  if (!apiKey) {
    // 公益模型（mode=public）暂未内置 Key 时给出更友好提示，方便 AIChatSidebar / aiLogic 走本地模板兜底
    if (config.mode === 'public') {
      throw new Error('所选公益模型暂未内置密钥，已自动切本地模板兜底。可在 ⚙️ 配置面板 → 公益模型切换其他模型。');
    }
    throw new Error('未配置 API Key，请在 ⚙️ 配置面板填写您的 DeepSeek / 第三方密钥');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages 不能为空');
  }

  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: modelId,
    messages,
    temperature: Math.max(0, Math.min(2, Number(temperature) || 0)),
    stream: false
  };
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_tokens = Math.floor(maxTokens);
  }
  // DeepSeek / Qwen / GLM 均支持 "response_format": { "type": "json_object" }（若不支持也会忽略，兼容性较好）
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(3000, timeoutMs));

  let raw = null;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    const text = await resp.text();
    // 解析 JSON（兼容某些网关返回纯文本错误）
    try { raw = JSON.parse(text); } catch (_) { raw = { _plainText: text }; }

    if (!resp.ok) {
      const errMsg =
        (raw && raw.error && (raw.error.message || raw.error)) ||
        (typeof raw._plainText === 'string' ? raw._plainText.slice(0, 200) : '') ||
        `HTTP ${resp.status}`;
      throw new Error(`请求失败(${resp.status})：${String(errMsg).replace(/\s+/g, ' ').slice(0, 260)}`);
    }

    // 提取 content（OpenAI 标准结构 / 部分厂商兼容结构）
    let content = '';
    if (raw && Array.isArray(raw.choices) && raw.choices[0]) {
      const c0 = raw.choices[0];
      content =
        (c0.message && (typeof c0.message.content === 'string' ? c0.message.content : '')) ||
        (typeof c0.text === 'string' ? c0.text : '') ||
        (c0.delta && typeof c0.delta.content === 'string' ? c0.delta.content : '') ||
        '';
    }
    if (!content && typeof raw?._plainText === 'string') {
      content = raw._plainText;
    }
    if (!content && typeof raw === 'string') {
      content = raw;
    }

    return { content: String(content || ''), raw };
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒），请检查网络或稍后重试`);
    }
    throw e;
  }
}

/**
 * 便捷函数：要求 LLM 返回 JSON，并进行健壮解析（含兜底 + 容错修复常见截断）
 * @template T
 * @param {object} config
 * @param {object[]} messages
 * @param {object} options
 * @param {(plainText:string)=>T} [options.fallbackParser]   当 JSON 解析失败时，允许用正则/兜底再试一次
 * @returns {Promise<{ data: T, content: string, raw: any }>}
 */
export async function chatCompletionJSON(config, messages, options = {}) {
  const { fallbackParser = null, timeoutMs = DEFAULT_TIMEOUT, temperature = 0.4, maxTokens = 3000 } = options;
  const { content, raw } = await chatCompletion(config, messages, {
    timeoutMs,
    temperature: Math.min(temperature, 0.6), // JSON 模式温度低一点更稳定
    jsonMode: true,
    maxTokens
  });
  const text = String(content || '').trim();

  // 1) 尝试直接 parse
  try { return { data: JSON.parse(text), content, raw }; } catch (_) {}

  // 2) 剥离 ```json ... ``` 包裹
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return { data: JSON.parse(fenceMatch[1].trim()), content, raw }; } catch (_) {}
  }

  // 3) 尝试截到第一个完整对象/数组：{...} 或 [...]
  const arr = text.match(/\[[\s\S]*\]/);
  const obj = text.match(/\{[\s\S]*\}/);
  const tryThese = [arr && arr[0], obj && obj[0]].filter(Boolean);
  for (const cand of tryThese) {
    try { return { data: JSON.parse(cand), content, raw }; } catch (_) {}
  }

  // 4) 修复常见截断（末尾缺少 ] / } 或多余逗号）
  const repairs = [];
  repairs.push(text.endsWith(',') ? text + ']' : null);
  // 统计括号平衡，尝试补齐
  let open = 0, close = 0;
  for (const ch of text) { if (ch === '[') open++; if (ch === ']') close++; if (ch === '{') open++; if (ch === '}') close--; }
  if (text.includes('[') && !text.includes(']')) repairs.push(text + ']');
  if (open > close) repairs.push(text + '}'.repeat(open - close));
  for (const cand of repairs) {
    if (!cand) continue;
    try { return { data: JSON.parse(cand), content, raw }; } catch (_) {}
  }

  // 5) 最后调用外部 fallbackParser（比如用正则每行取 title）
  if (typeof fallbackParser === 'function') {
    try {
      const fb = fallbackParser(text);
      if (fb != null) return { data: fb, content, raw };
    } catch (_) {}
  }

  const err = new Error('模型返回内容无法解析为 JSON，请重试或降低 maxTokens');
  err.rawContent = text;
  throw err;
}
