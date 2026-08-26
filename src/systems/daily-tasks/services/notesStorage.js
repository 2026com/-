import { storage, uid } from '../../../services/storage.js'

/**
 * 长期目标 · 纯文本记事本 存储模块
 * - 独立存储 Key：growth_app_notes_v1（不继承旧节点数据）
 * - 数据结构：{ id, title, content, updatedAt, createdAt }
 * - 仅新增方法，不修改 storage.js 既有逻辑（复用其 get/set 与 uid）
 */

export const NOTES_STORAGE_KEY = 'growth_app_notes_v1'

/** 读取全部笔记（异常/脏数据兜底为空数组） */
export function loadNotes() {
  const v = storage.get(NOTES_STORAGE_KEY, [])
  return Array.isArray(v) ? v.filter(n => n && n.id) : []
}

/** 持久化全部笔记 */
export function persistNotes(notes) {
  return storage.set(NOTES_STORAGE_KEY, notes || [])
}

/** 创建一条新笔记对象（不落盘，由调用方统一保存） */
export function createNoteObj(title = '') {
  const now = Date.now()
  return {
    id: uid('note'),
    title: (title || '').trim() || '未命名笔记',
    content: '',
    updatedAt: now,
    createdAt: now,
  }
}

/** 更新时间格式化：MM-DD HH:mm */
export function formatUpdatedAt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}