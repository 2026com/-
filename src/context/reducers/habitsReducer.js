import { storage, uid } from '../../utils/storage.js'
import { STORAGE_KEYS } from '../../utils/constants.js'
import { recalcParentProgress } from './nodeHelpers.js'

/**
 * 习惯/打卡/临时任务/计时记录 领域 reducer —— 自 AppContext.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 命中本领域的 action 时返回新 state；未命中原样返回 state（由上层链式分发到其他领域）
 */
export function habitsReducer(state, action) {
  switch (action.type) {
    // 习惯、打卡、计时记录
    case 'ADD_HABIT': {
      const habits = [...state.habits, { id: uid('hab'), ...action.payload, createdAt: Date.now() }]
      storage.set(STORAGE_KEYS.HABITS, habits)
      return { ...state, habits }
    }
    case 'UPDATE_HABIT': {
      const habits = state.habits.map(h => h.id === action.id ? { ...h, ...action.payload } : h)
      storage.set(STORAGE_KEYS.HABITS, habits)
      return { ...state, habits }
    }
    case 'TOGGLE_CHECKIN': {
      const { date, habitId } = action.payload
      const key = `${date}_${habitId}`
      const checkins = { ...state.checkins }
      const wasChecked = !!checkins[key]
      if (wasChecked) delete checkins[key]
      else checkins[key] = { date, habitId, time: Date.now() }
      storage.set(STORAGE_KEYS.CHECKINS, checkins)

      // ========= T5 双向同步：日常打卡 → 幕布节点状态 & 进度 =========
      let nodes = state.nodes
      const habit = state.habits.find(h => h.id === habitId)
      if (habit && habit.sourceNodeId) {
        nodes = state.nodes.map(n => ({ ...n }))
        const target = nodes.find(n => n.id === habit.sourceNodeId)
        if (target) {
          // 1) 叶子节点本身状态：全部"未来连续天数"都打卡了 → done；有任意今日及之前未打 → todo/progress
          const nowChecked = !wasChecked  // 本次 toggle 后的结果
          const relevantKeys = Object.keys(checkins).filter(k => k.endsWith('_' + habitId))
          const totalDays = 7  // 以"近 7 天 + 未来"的完成度近似估状态
          const checkedDays = relevantKeys.length
          if (nowChecked) {
            target.progress = 100
            target.status = 'done'
          } else {
            // 取消打卡：按历史情况降级
            const ratio = checkedDays / Math.max(1, totalDays)
            if (ratio <= 0) { target.progress = 0; target.status = 'todo' }
            else { target.progress = Math.max(1, Math.round(ratio * 80)); target.status = 'progress' }
          }
          // 2) 递归更新父节点进度（搁置/放弃已在 recalcParentProgress 内部排除）
          if (target.parentId) recalcParentProgress(nodes, target.parentId, state.settings.progressMode)
          storage.set(STORAGE_KEYS.NODES, nodes)
        }
      }
      return { ...state, checkins, nodes }
    }
    case 'BATCH_CHECKIN': {
      const { date, habitIds, value = true } = action.payload || {}
      if (!Array.isArray(habitIds) || habitIds.length === 0) return state
      const checkins = { ...state.checkins }
      habitIds.forEach(habitId => {
        const key = `${date}_${habitId}`
        if (value) checkins[key] = { date, habitId, time: Date.now() }
        else delete checkins[key]
      })
      storage.set(STORAGE_KEYS.CHECKINS, checkins)

      // ========= T5 双向同步：批量打卡 → 幕布节点 =========
      let nodes = state.nodes
      let nodesChanged = false
      habitIds.forEach(habitId => {
        const habit = state.habits.find(h => h.id === habitId)
        if (!habit || !habit.sourceNodeId) return
        if (!nodesChanged) { nodes = state.nodes.map(n => ({ ...n })); nodesChanged = true }
        const target = nodes.find(n => n.id === habit.sourceNodeId)
        if (!target) return
        if (value) {
          target.progress = 100
          target.status = 'done'
        } else {
          target.progress = 0
          target.status = 'todo'
        }
        if (target.parentId) recalcParentProgress(nodes, target.parentId, state.settings.progressMode)
      })
      if (nodesChanged) storage.set(STORAGE_KEYS.NODES, nodes)
      return { ...state, checkins, nodes: nodesChanged ? nodes : state.nodes }
    }
    case 'DELETE_HABIT': {
      const habits = state.habits.filter(h => h.id !== action.id)
      // 同步清理该习惯所有日期的打卡记录（避免 checkins 对象无限膨胀）
      const suffix = `_${action.id}`
      const checkins = { ...state.checkins }
      Object.keys(checkins).forEach(k => {
        if (k.endsWith(suffix)) delete checkins[k]
      })
      storage.set(STORAGE_KEYS.HABITS, habits)
      storage.set(STORAGE_KEYS.CHECKINS, checkins)
      return { ...state, habits, checkins }
    }

    // 临时打卡任务（日常/临时视图之二）
    case 'ADD_TEMP_TASK': {
      const tempTasks = [...state.tempTasks, { id: uid('tmp'), reminder: true, done: false, ...action.payload, createdAt: Date.now() }]
      storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
      return { ...state, tempTasks }
    }
    case 'UPDATE_TEMP_TASK': {
      const tempTasks = state.tempTasks.map(t => t.id === action.id ? { ...t, ...action.payload } : t)
      storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
      return { ...state, tempTasks }
    }
    case 'DELETE_TEMP_TASK': {
      const tempTasks = state.tempTasks.filter(t => t.id !== action.id)
      storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
      return { ...state, tempTasks }
    }
    case 'TOGGLE_TEMP_TASK_DONE': {
      const tempTasks = state.tempTasks.map(t => t.id === action.id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : undefined } : t)
      storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
      return { ...state, tempTasks }
    }

    case 'ADD_TIMER_RECORD': {
      const p = action.payload || {}
      // 归一化：统一 type/started/startAt（历史数据可能只带 startAt 或缺 type，导致番茄钟不倒数/不结束）
      const t0 = p.started || p.startAt || Date.now()
      const rec = {
        id: uid('t'),
        done: false,
        ...p,
        type: p.type || 'pomodoro',
        nodeId: p.nodeId || p.habitId || null,
        started: t0,
        startAt: t0,
        createdAt: Date.now(),
      }
      const records = [...state.timerRecords, rec]
      storage.set(STORAGE_KEYS.TIMER_RECORDS, records)
      return { ...state, timerRecords: records }
    }
    // 阶段1 修复：计时结束（TimerWidget 使用）——统一走 reducer，不再 hack localStorage + location.reload
    case 'FINISH_TIMER_RECORD': {
      const { id, completed = true } = action.payload || {}
      const target = state.timerRecords.find(t => t.id === id && !t.done)
      if (!target) return state
      const isPomodoro = target.type === 'pomodoro'
      const elapsedMin = Math.max(1, Math.round((Date.now() - (target.started || Date.now())) / 60000))
      const finalMin = isPomodoro && completed ? (Number(target.minutes) || 25) : elapsedMin
      const records = state.timerRecords.map(t =>
        t.id === id ? { ...t, done: true, minutes: finalMin, endAt: Date.now() } : t
      )
      storage.set(STORAGE_KEYS.TIMER_RECORDS, records)
      // 若该计时关联了节点，则给节点增加进度（按分钟 → 进度增量，1h ≈ 2%）
      let nodes = state.nodes
      if (target.nodeId && finalMin > 0) {
        const inc = Math.min(100, Math.round(finalMin / 60 * 2))
        nodes = state.nodes.map(n => n.id === target.nodeId
          ? { ...n, progress: Math.min(100, Number(n.progress || 0) + inc) }
          : n)
        storage.set(STORAGE_KEYS.NODES, nodes)
      }
      return { ...state, timerRecords: records, nodes }
    }

    default:
      return state
  }
}