/**
 * OpenAI 适配器（预留）
 * 规则5：当前阶段只确保能接入大模型 API，不过度设计。
 */
export const openaiAdapter = {
  id: 'openai',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModelId: 'gpt-4o-mini',
}