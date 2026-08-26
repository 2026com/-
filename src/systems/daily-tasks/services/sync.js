/**
 * 幕布 ↔ 打卡 手动同步服务（规则1：仅手动同步）
 *
 * 变更记录：
 * - 原 dailyTasksReducer 内 TOGGLE_CHECKIN / BATCH_CHECKIN / FINISH_TIMER_RECORD 的
 *   「打卡 → 幕布节点进度」自动同步代码已移除；
 * - 本模块提供手动同步的纯函数工具，供后续 UI（如节点详情页「下发到打卡」按钮 /
 *   打卡卡片「关联幕布进度」按钮）显式调用。
 *
 * 注意：幕布当前处于休眠待重设计状态（见 components/mindmap/），UI 入口暂未接线。
 */

/**
 * 由打卡情况推导幕布节点的状态补丁
 * @param {{ doneCount:number, totalDays?:number }} params 打卡完成次数与统计窗口天数
 * @returns {{ progress:number, status:'todo'|'progress'|'done' }} UPDATE_NODE payload 片段
 */
export function habitCheckinToNodePatch({ doneCount, totalDays = 7 }) {
  if (doneCount <= 0) return { progress: 0, status: 'todo' }
  if (doneCount >= totalDays) return { progress: 100, status: 'done' }
  return {
    progress: Math.max(1, Math.round((doneCount / Math.max(1, totalDays)) * 80)),
    status: 'progress',
  }
}

/**
 * 由番茄钟时长推导幕布节点的进度增量（原规则：1 小时 ≈ 2%）
 * @param {number} minutes 专注分钟数
 * @returns {number} 进度增量（0-100 封顶由调用方处理）
 */
export function pomodoroMinutesToProgressInc(minutes) {
  const min = Number(minutes) || 0
  if (min <= 0) return 0
  return Math.min(100, Math.round((min / 60) * 2))
}

/**
 * 手动同步入口（示例签名，UI 接线时按需调整）：
 * dispatch({ type:'UPDATE_NODE', id: node.id, payload: habitCheckinToNodePatch({...}) })
 */