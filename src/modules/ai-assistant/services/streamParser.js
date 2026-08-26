/**
 * 模型输出解析模块 —— 自 aiClient.js 的 chatCompletionJSON 原样拆分（只移动代码位置，不改业务逻辑）
 * 说明：当前项目所有请求均为非流式（stream:false），本模块承担「模型输出的健壮解析」职责：
 *       content 提取、JSON 校验、```json 围栏剥离、截断修复；
 *       若后续引入 SSE 流式响应，其增量解析逻辑应扩展在本模块内。
 */

/** 从模型响应体提取文本 content（OpenAI 标准结构 / 部分厂商兼容结构 / 纯文本兜底） */
export function extractModelContent(raw) {
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
  return String(content || '');
}

/**
 * 把模型输出文本解析为 JSON（多级容错）：
 * 1) 直接 parse
 * 2) 剥离 ```json ... ``` 包裹
 * 3) 截取第一个完整对象/数组：{...} 或 [...]
 * 4) 修复常见截断（末尾缺少 ] / } 或多余逗号）
 * 5) 最后调用外部 fallbackParser（比如用正则每行取 title）
 *
 * @param {string} text              模型输出文本（已 trim）
 * @param {(plainText:string)=>T} [fallbackParser]
 * @returns {T} 解析后的数据
 * @throws {Error} 全部策略失败时抛错（err.rawContent 携带原文）
 */
export function parseModelJSON(text, fallbackParser = null) {
  // 1) 尝试直接 parse
  try { return JSON.parse(text); } catch (_) {}

  // 2) 剥离 ```json ... ``` 包裹
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }

  // 3) 尝试截到第一个完整对象/数组：{...} 或 [...]
  const arr = text.match(/\[[\s\S]*\]/);
  const obj = text.match(/\{[\s\S]*\}/);
  const tryThese = [arr && arr[0], obj && obj[0]].filter(Boolean);
  for (const cand of tryThese) {
    try { return JSON.parse(cand); } catch (_) {}
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
    try { return JSON.parse(cand); } catch (_) {}
  }

  // 5) 最后调用外部 fallbackParser（比如用正则每行取 title）
  if (typeof fallbackParser === 'function') {
    try {
      const fb = fallbackParser(text);
      if (fb != null) return fb;
    } catch (_) {}
  }

  const err = new Error('模型返回内容无法解析为 JSON，请重试或降低 maxTokens');
  err.rawContent = text;
  throw err;
}