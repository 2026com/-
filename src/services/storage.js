import { STORAGE_KEYS } from '../shared/constants/index.js'

// LocalStorage 封装工具 V1.0
// 禁止任何云端操作，所有读写均走本地

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null || raw === undefined) return fallback
      return JSON.parse(raw)
    } catch (e) {
      console.warn('[storage get fail]', key, e)
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (e) {
      console.warn('[storage set fail]', key, e)
      return false
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key)
      return true
    } catch (e) {
      return false
    }
  },
  clearAll() {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k))
  }
}

// UUID生成
export function uid(prefix = 'n') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// 日期工具
export const dateUtil = {
  today() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },
  format(d) {
    const date = typeof d === 'string' ? new Date(d) : d
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },
  getMonthDays(year, month) {
    return new Date(year, month, 0).getDate()
  },
  getFirstWeekday(year, month) {
    return new Date(year, month - 1, 1).getDay()
  },
  diffDays(a, b) {
    const d1 = new Date(a).setHours(0, 0, 0, 0)
    const d2 = new Date(b).setHours(0, 0, 0, 0)
    return Math.round((d2 - d1) / 86400000)
  }
}

// 进度加权计算 V1.0双模式（约束规则第10条）
// T1 修复：搁置(paused)/放弃(aborted) 的子节点不计入父进度分子/分母（停更任务不影响主干进度）
const EXCLUDED_FROM_PROGRESS = new Set(['paused', 'aborted'])
export function calcProgress(children, mode = 'auto') {
  const list = (children || []).filter(c => !EXCLUDED_FROM_PROGRESS.has(c && c.status))
  if (list.length === 0) return 0
  if (mode === 'manual') {
    const total = list.reduce((s, c) => s + (Number(c.weight) || 0), 0) || 1
    const sum = list.reduce((s, c) => s + (Number(c.progress) || 0) * (Number(c.weight) || 0), 0)
    return Math.min(100, Math.round(sum / total))
  }
  const weights = list.map(c => {
    const time = Number(c.estimatedHours) || 1
    const diff = Number(c.difficulty) || 1
    const val = Number(c.value) || 1
    return time * diff * val
  })
  const totalW = weights.reduce((a, b) => a + b, 0) || 1
  const sum = list.reduce((s, c, i) => s + (Number(c.progress) || 0) * weights[i], 0)
  return Math.min(100, Math.round(sum / totalW))
}
