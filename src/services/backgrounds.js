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

// ===== 可调参数白名单（AI set_params 指令与本地面板共用；[min, max, 默认]） =====
export const PARAM_DEFS = {
  knowledge: {
    starDensity:    { label: '星空密度', min: 0.3, max: 3, def: 1 },
    starBrightness: { label: '星光亮度', min: 0.3, max: 3, def: 1 },
    linkBrightness: { label: '连线亮度', min: 0.2, max: 3, def: 1 },
    glowIntensity:  { label: '辉光强度', min: 0,   max: 3, def: 1 },  // 仅高清画质档生效（Bloom）
    fogDensity:     { label: '星云雾感', min: 0.2, max: 2, def: 1 },
  },
  memory: {
    rotateSpeed:    { label: '旋转速度', min: 0.2, max: 5, def: 1 },  // 1 = 每 100 秒转一圈
    dustBrightness: { label: '星尘亮度', min: 0.2, max: 3, def: 1 },
    textBrightness: { label: '文字亮度', min: 0.3, max: 2, def: 1 },
  },
  notebook: {
    lineSpacing:    { label: '行距',     min: 0.8, max: 1.6, def: 1 },  // 1 = 37px 标准行高
    fontSize:       { label: '字号',     min: 0.8, max: 1.4, def: 1 },  // 1 = 15.5px 标准字号
  },
}

function loadAll() {
  try {
    const v = storage.get(STORAGE_KEYS.BACKGROUNDS, {})
    if (!v || typeof v !== 'object') return {}
    // 兼容 v1 形状（值直接是背景对象 {type:...}）→ 统一为 v2 { bg, params }
    const out = {}
    Object.entries(v).forEach(([k, val]) => {
      if (val && val.type) out[k] = { bg: val, params: {} }
      else if (val && typeof val === 'object') out[k] = { bg: val.bg || null, params: val.params || {} }
    })
    return out
  } catch (e) { return {} }
}

function saveAll(all) {
  try { storage.set(STORAGE_KEYS.BACKGROUNDS, all) } catch (e) { /* 写失败不阻塞，下次重试 */ }
}

/** 读取某页面的外观设置 { bg: 背景值|null, params: 参数对象 } */
export function getSurfaceSettings(surface) {
  if (!SURFACES.includes(surface)) return { bg: null, params: {} }
  const s = loadAll()[surface] || {}
  return { bg: s.bg || null, params: s.params || {} }
}

/** 读取某页面参数（逐项校验范围，非法回落默认） */
export function getParams(surface) {
  const defs = PARAM_DEFS[surface] || {}
  const raw = getSurfaceSettings(surface).params || {}
  const out = {}
  Object.entries(defs).forEach(([k, d]) => {
    const n = Number(raw[k])
    out[k] = Number.isFinite(n) ? Math.min(d.max, Math.max(d.min, n)) : d.def
  })
  return out
}

/** 合并写入参数（仅白名单内的键生效，越界自动夹取） */
export function setParams(surface, params) {
  if (!SURFACES.includes(surface)) return false
  const defs = PARAM_DEFS[surface] || {}
  const all = loadAll()
  const cur = all[surface] || { bg: null, params: {} }
  const nextParams = { ...(cur.params || {}) }
  Object.entries(params || {}).forEach(([k, v]) => {
    if (!defs[k]) return // 白名单外的参数直接丢弃
    const n = Number(v)
    if (Number.isFinite(n)) nextParams[k] = Math.min(defs[k].max, Math.max(defs[k].min, n))
  })
  all[surface] = { bg: cur.bg || null, params: nextParams }
  saveAll(all)
  try { window.dispatchEvent(new CustomEvent(BG_EVENT, { detail: { surface } })) } catch (e) { /* ignore */ }
  return true
}

/** 读取某页面背景（未设置/非法值返回 null = 使用各页面默认外观） */
export function getBackground(surface) {
  if (!SURFACES.includes(surface)) return null
  return getSurfaceSettings(surface).bg
}

/** 设置某页面背景（图片请先经 compressImageForBackground 压缩） */
export function setBackground(surface, bg) {
  if (!SURFACES.includes(surface) || !bg || !bg.type) return false
  const all = loadAll()
  const cur = all[surface] || { bg: null, params: {} }
  all[surface] = { bg, params: cur.params || {} }
  saveAll(all)
  try { window.dispatchEvent(new CustomEvent(BG_EVENT, { detail: { surface } })) } catch (e) { /* ignore */ }
  return true
}

/** 恢复某页面默认外观（背景 + 参数一并还原）；surface='all' 时全部还原 */
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

/** React hook：某页面当前参数（已按白名单+默认值归一；调整后即时生效） */
export function useSurfaceParams(surface) {
  const [params, setP] = useState(() => getParams(surface))
  useEffect(() => {
    setP(getParams(surface))
    return onBackgroundsChanged(() => setP(getParams(surface)))
  }, [surface])
  return params
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
