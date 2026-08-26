import { useState, useEffect } from 'react'

/**
 * 通用防抖 hook —— 共享层（被多个系统使用的通用工具）
 *
 * @template T
 * @param {T} value        原始值
 * @param {number} delay   防抖毫秒数（默认 500）
 * @returns {T} 防抖后的值
 */
export default function useDebounce(value, delay = 500) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), Math.max(0, Number(delay) || 0))
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}