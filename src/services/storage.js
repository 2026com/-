import { STORAGE_KEYS } from '../shared/constants/index.js'
import { dbGet, dbSet, dbRemove, dbClearAll } from './db.js'

// 存储封装工具 V2.0（IndexedDB 迁移：内存镜像适配层）
// 禁止任何云端操作，所有读写均走本地（IndexedDB，统一经 services/db.js）
// 对外 API 与 V1.0（localStorage 版）完全一致：同步签名、失败不抛异常。
// 数据物理存储在 IndexedDB（首次运行自动从旧 localStorage 迁移），
// 本层仅是 db.js 内存镜像的同步门面 —— 全部业务调用方零改动。

export const storage = {
  get(key, fallback = null) {
    try {
      return dbGet(key, fallback)
    } catch (e) {
      console.warn('[storage get fail]', key, e)
      return fallback
    }
  },
  set(key, value) {
    try {
      return dbSet(key, value)
    } catch (e) {
      console.warn('[storage set fail]', key, e)
      return false
    }
  },
  remove(key) {
    try {
      return dbRemove(key)
    } catch (e) {
      return false
    }
  },
  clearAll() {
    try {
      return dbClearAll(Object.values(STORAGE_KEYS))
    } catch (e) {
      return false
    }
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
