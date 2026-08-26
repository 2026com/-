import { storage, uid } from '../../utils/storage.js'
import { STORAGE_KEYS } from '../../utils/constants.js'

/**
 * 复盘报告 领域 reducer —— 自 AppContext.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 */
export function reviewReducer(state, action) {
  switch (action.type) {
    // 复盘报告
    case 'ADD_REPORT': {
      const reports = [...state.reports, { id: uid('rpt'), ...action.payload, createdAt: Date.now() }]
      storage.set(STORAGE_KEYS.REPORTS, reports)
      return { ...state, reports }
    }

    default:
      return state
  }
}