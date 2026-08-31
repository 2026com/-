import React, { useEffect, useState } from 'react'
import { STORAGE_KEYS } from '../shared/constants/index.js'
import { storage } from './storage.js'

/**
 * 背景/皮肤服务（纯新增，不改任何既有存储逻辑）
 * - 三个可换背景的页面（surface）：3D 知识库 / 记忆库 / 横线本；
 * - 每处背景值：{ type:'default' } | { type:'color', value } | { type:'gradient', from, to, angle } | { type:'image', dataUrl }；
 * - 持久化：STORAGE_KEYS.BACKGROUNDS（IndexedDB，自动纳入账号云备份与全量导入导出）；
 * - 变更广播：window 'app:backgrounds-changed'（detail:{ surface }），打开中的页面即时换肤；
 * - 图片背景在写入前压缩（最长边 1600 / JPEG 0.8），控制存储体积。
 */

export const SURFACES = ['knowledge', 'memory', 'notebook']
export const SURFACE_NAMES = { knowledge: '3D 知识库', memory: '记忆库', notebook: '横线本' }
export const BG_EVENT = 'app:backgrounds-changed'

function loadAll() {
  try {
    const v = storage.get(STORAGE_KEYS.BACKGROUNDS, {})
    return (v && typeof v === 'object') ? v : {}
  } catch (e) { return {} }
}

function saveAll(all) {
  try { storage.set(STORAGE_KEYS.BACKGROUNDS, all) } catch (e) { /* 写失败不阻塞，下次重试 */ }
}

/** 读取某页面背景（未设置/非法值返回 null = 使用各页面默认外观） */
export function getBackground(surface) {
  if (!SURFACES.includes(surface)) return null
  const bg = loadAll()[surface]
  return (bg && bg.type) ? bg : null
}

/** 设置某页面背景（图片请先经 compressImageForBackground 压缩） */
export function setBackground(surface, bg) {
  if (!SURFACES.includes(surface) || !bg || !bg.type) return false
  const all = loadAll()
  all[surface] = bg
  saveAll(all)
  try { window.dispatchEvent(new CustomEvent(BG_EVENT, { detail: { surface } })) } catch (e) { /* ignore */ }
  return true
}

/** 恢复某页面默认外观；surface='all' 时全部还原 */
export function resetBackground(surface) {
  const all = loadAll()
  const targets = surface === 'all' ? SURFACES : [surface]
  targets.forEach(s => { if (SURFACES.includes(s)) delete all[s] })
  saveAll(all)
  try { window.dispatchEvent(new CustomEvent(BG_EVENT, { detail: { surface } })) } catch (e) { /* ignore */ }
  return true
}

/** 背景值 → CSS background 字符串；默认/null 返回 null（调用方保留原样） */
export function getBackgroundCss(surface) {
  const bg = getBackground(surface)
  if (!bg) return null
  if (bg.type === 'color') return bg.value
  if (bg.type === 'gradient') return `linear-gradient(${Number(bg.angle) || 160}deg, ${bg.from}, ${bg.to})`
  if (bg.type === 'image') return `url(${bg.dataUrl}) center / cover no-repeat`
  return null
}

/**
 * 订阅背景变更（页面挂载时用；返回解绑函数）
 * 事件与 storage 跨标签页不同步（IndexedDB 无 storage 事件），本订阅覆盖同页实时换肤。
 */
export function onBackgroundsChanged(cb) {
  const handler = (e) => cb(e.detail || {})
  try {
    window.addEventListener(BG_EVENT, handler)
    return () => window.removeEventListener(BG_EVENT, handler)
  } catch (e) { return () => {} }
}

/** React hook：某页面当前背景 CSS（默认返回 null；换背景后所在页面即时生效） */
export function useSurfaceBackground(surface) {
  const [css, setCss] = useState(() => getBackgroundCss(surface))
  useEffect(() => {
    setCss(getBackgroundCss(surface))
    return onBackgroundsChanged(() => setCss(getBackgroundCss(surface)))
  }, [surface])
  return css
}

/** 图片文件 → 压缩后的背景 dataURL（最长边 1600，JPEG 0.8；竖图横图均按比例） */
export function compressImageForBackground(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('不是图片文件')); return }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1600
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = () => reject(new Error('图片解析失败'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}
