/**
 * 通用 AI 客户端（浏览器端 fetch，单一调用入口）—— 拆分后组合入口
 * 目标：
 *  1. 真正打通侧边 AI 对话和【AI写执行方案】，都复用这一套用户配置的模型
 *  2. 默认 DeepSeek，预留其他市面模型扩展（配置面板已支持 qwen/glm/custom）
 *  3. 密钥 100% 从浏览器 localStorage（aiConfig）读取，绝不硬编码
 *  4. 健壮性：AbortController 超时、错误状态码解析、返回 JSON/字符串兼容兜底
 *  5. 可选：JSON 模式（让 LLM 直接输出 JSON 数组，便于「AI写执行方案」生成结构化子节点）
 *
 * 拆分说明（只移动代码位置，不改业务逻辑）：
 * - 网络请求/超时/错误格式化 → ./network.js
 * - 输出 content 提取 / JSON 校验与截断修复 → ./streamParser.js
 * - 本文件保留原有导出签名（chatCompletion / chatCompletionJSON），所有既有引用零改动
 */
import { chatCompletion, DEFAULT_TIMEOUT } from './network.js'
import { parseModelJSON } from './streamParser.js'

export { chatCompletion, DEFAULT_TIMEOUT };

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

  // 多级容错解析（原样等价迁移至 streamParser.parseModelJSON）
  const data = parseModelJSON(text, fallbackParser);
  return { data, content, raw };
}