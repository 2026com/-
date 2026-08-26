/**
 * DeepSeek 适配器（预留）
 * 规则5：当前阶段只确保能接入大模型 API，不过度设计。
 * DeepSeek 使用 OpenAI 兼容协议 /chat/completions，与通用请求入口（network.js）无差异；
 * 未来若需差异化处理（特殊参数/接口），在 adapter 内实现 buildRequest 并由 aiClient 分发。
 */
export const deepseekAdapter = {
  id: 'deepseek',
  defaultBaseUrl: 'https://api.deepseek.com/v1',
  defaultModelId: 'deepseek-chat',
}