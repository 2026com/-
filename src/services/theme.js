import { useState, useEffect } from 'react'
import { dbGet, dbSet } from './db.js'

/**
 * 全局主题（浅色/深色）服务 V1.0
 * - 持久化：IndexedDB（growth_app_v1_theme，经 db.js 内存镜像，同步可读）
 * - 应用方式：html 根元素挂 .theme-dark 类 → index.css 中的深色映射生效
 * - 深色色值对齐 3D 知识库背景（#0a1030 / #141b36 / #252b38 家族）
 */

export const THEME_KEY = 'growth_app_v1_theme'
const EVENT = 'app:theme-changed'

/** 读取当前主题（'light' | 'dark'） */
export function getTheme() {
  try {
    return dbGet(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** 把主题应用到文档根元素（幂等） */
export function applyTheme(theme) {
  try {
    const dark = theme === 'dark'
    document.documentElement.classList.toggle('theme-dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  } catch { /* ignore */ }
}

/** 设置并持久化主题，广播变化事件 */
export function setTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light'
  try { dbSet(THEME_KEY, t) } catch { /* 持久化失败不影响当次生效 */ }
  applyTheme(t)
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { theme: t } })) } catch { /* ignore */ }
}

/** 切换主题，返回切换后的主题 */
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

/** 启动时恢复持久化主题（main.jsx：dbReady 之后、首次渲染之前调用，避免闪白） */
export function initTheme() {
  applyTheme(getTheme())
}

/** React 侧订阅：主题变化时触发重渲染 */
export function useAppTheme() {
  const [theme, setLocal] = useState(getTheme)
  useEffect(() => {
    const handler = (e) => setLocal((e.detail && e.detail.theme) || getTheme())
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])
  return theme
}