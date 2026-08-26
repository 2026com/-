import { storage, uid } from '../../utils/storage.js'
import { STORAGE_KEYS } from '../../shared/constants/index.js'

/**
 * 日常待办 领域 reducer —— 自 AppContext.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：习惯打卡 / 临时任务 / 番茄计时记录
 * 命中本领域的 action 时返回新 state；未命中原样返回 state（由上层链式分发到其他领域）
 */
export function dailyTasksReducer(state, action) {
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
      // 规则1：原「打卡 → 幕布节点进度」自动同步已移除，改为手动同步
      // （纯函数工具见 systems/daily-tasks/services/sync.js；幕布休眠待重设计，UI 入口暂未接线）
      return { ...state, checkins }
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
      // 规则1：「批量打卡 → 幕布节点」自动同步已移除（手动同步见 systems/daily-tasks/services/sync.js）
      return { ...state, checkins }
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
      // 规则1：「计时 → 关联节点进度」自动增长已移除，改为手动同步（见 sync.js 的 pomodoroMinutesToProgressInc）
      return { ...state, timerRecords: records }
    }

    default:
      return state
  }
}