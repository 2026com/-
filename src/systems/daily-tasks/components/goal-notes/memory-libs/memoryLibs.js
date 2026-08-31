import { storage } from '../../../../../services/storage.js'

/**
 * 记忆库服务（纯新增）
 * - 多记忆库数据模型与持久化（IndexedDB，经全局 storage 门面）
 * - 库 1「横线本记忆」为系统内置默认库：内容 = 横线本实时镜像（不入本服务存储）
 * - 其他库：批量导入的内容（聊天文本 / 相册照片），按天分组展示
 * - 数据结构 memoryLibraries_v1：
 *   [{ id, name, icon, source, createdAt, entries: [{ id, dateKey, text?, photos? }] }]
 */

export const MEMORY_LIBS_KEY = 'memoryLibraries_v1'
export const DEFAULT_LIB_ID = 'lib-default'

const uid = (p = 'e') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 读取全部用户库（不含默认库；异常兜底为空数组） */
export function loadLibs() {
  const v = storage.get(MEMORY_LIBS_KEY, [])
  return Array.isArray(v) ? v.filter(l => l && l.id) : []
}

/** 持久化全部用户库 */
export function saveLibs(libs) {
  return storage.set(MEMORY_LIBS_KEY, Array.isArray(libs) ? libs : [])
}

/** 图片压缩：File → dataURL（最长边 900px，JPEG 72%） */
export function compressImage(file, maxW = 900, q = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', q))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 文本解析为记忆条目：
 * - 识别「2026-08-30 / 2026/8/30 / 2026年8月30日」开头的行 → 开启新的一天分组
 * - 无日期行归入 fallbackDate（默认今天）
 */
export function parseTextToEntries(text, fallbackDate = todayKey()) {
  const dayRe = /^\s*(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?/
  const entries = []
  let cur = null
  for (const line of (text || '').split('\n')) {
    const m = dayRe.exec(line)
    if (m) {
      if (cur && cur.text.trim()) entries.push(cur)
      const dk = `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`
      cur = { id: uid(), dateKey: dk, text: line.replace(dayRe, '').trim() }
    } else if (cur) {
      cur.text += '\n' + line
    } else {
      cur = { id: uid(), dateKey: fallbackDate, text: line }
    }
  }
  if (cur && cur.text.trim()) entries.push(cur)
  return entries.filter(e => e.text.trim())
}

/** 批量照片 → 记忆条目（每张一条，日期 = 今天） */
export function photosToEntries(dataUrls) {
  return (dataUrls || []).map(dataUrl => ({
    id: uid('p'),
    dateKey: todayKey(),
    photos: [{ id: uid('ph'), dataUrl }],
  }))
}

/**
 * 库 → 展示页数组（供记忆宇宙渲染）：
 * 同一天的条目合并为一张"纸"：{ id, date, text, photos }
 */
export function libToPages(lib) {
  if (!lib || !Array.isArray(lib.entries)) return []
  const byDay = new Map()
  for (const e of lib.entries) {
    if (!byDay.has(e.dateKey)) byDay.set(e.dateKey, { id: `${lib.id}-d-${e.dateKey}`, date: e.dateKey, text: [], photos: [] })
    const d = byDay.get(e.dateKey)
    if (e.text) d.text.push(e.text)
    if (Array.isArray(e.photos)) d.photos.push(...e.photos)
  }
  return [...byDay.values()].map(d => ({ ...d, text: d.text.join('\n') }))
}
