import { storage, uid } from '../../utils/storage.js'
import { STORAGE_KEYS } from '../../utils/constants.js'

/**
 * AI 对话/配置 领域 reducer —— 自 AppContext.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 */
export function aiAssistantReducer(state, action) {
  switch (action.type) {
    // AI对话历史（新版API）
    case 'APPEND_AI_MESSAGE': {
      const newHistory = [...state.aiHistory, action.payload.message].slice(-200)
      storage.set(STORAGE_KEYS.AI_HISTORY, newHistory)
      return { ...state, aiHistory: newHistory }
    }
    case 'RESET_AI_HISTORY': {
      storage.set(STORAGE_KEYS.AI_HISTORY, [])
      return { ...state, aiHistory: [] }
    }
    case 'UPDATE_AI_CONFIG': {
      const newConfig = { ...state.aiConfig, ...action.payload }
      if (newConfig.baseUrl && !/^https?:\/\//.test(newConfig.baseUrl)) {
        return state
      }
      storage.set(STORAGE_KEYS.AI_CONFIG, newConfig)
      return { ...state, aiConfig: newConfig }
    }
    // AI对话历史（旧API兼容别名，AIChatPanel仍在用）
    case 'ADD_AI_MESSAGE': {
      const msg = { id: uid('ai'), time: Date.now(), ...action.payload }
      const newHistory = [...state.aiHistory, msg].slice(-200)
      storage.set(STORAGE_KEYS.AI_HISTORY, newHistory)
      return { ...state, aiHistory: newHistory }
    }
    case 'CLEAR_AI_HISTORY': {
      storage.set(STORAGE_KEYS.AI_HISTORY, [])
      return { ...state, aiHistory: [] }
    }

    default:
      return state
  }
}