/**
 * AI 网络请求模块 —— 自 aiClient.js 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：HTTP 请求封装（OpenAI 兼容 /chat/completions）、AbortController 超时处理、
 *       错误状态码解析与错误信息格式化、响应体 JSON/纯文本兼容兜底
 */
import { extractModelContent } from './streamParser.js'

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

  let raw;
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

    // 提取 content（结构解析在 streamParser.extractModelContent，原样等价迁移）
    const content = extractModelContent(raw);
    return { content, raw };
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒），请检查网络或稍后重试`, { cause: e });
    }
    throw e;
  }
}

export { DEFAULT_TIMEOUT };