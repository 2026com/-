import React, { useEffect, useState } from 'react'

/**
 * 应用内「顶部横幅提醒」（微信式）：到点提醒不再用居中大弹窗，改为从手机顶部滑下的横幅。
 * - showTopReminder(title, message)：全局广播函数（可在任意模块直接调用，不依赖 React 上下文）；
 * - 组件挂载在 App 根部（z-[80] 置顶），每条横幅 6 秒自动消失，点击任意处关闭；
 * - App 外的可见性由系统通知（横幅/全屏意图）负责，App 内由本组件负责——内外体验一致。
 */
let _seq = 0
const listeners = new Set()

export function showTopReminder(title, message) {
  const item = { id: ++_seq, title: String(title || '成长提醒'), message: String(message || ''), at: Date.now() }
  listeners.forEach((fn) => { try { fn(item) } catch (e) { /* 单个订阅者异常不影响其余 */ } })
}

export default function TopReminderBanner() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const onItem = (it) => setItems((list) => [...list, it])
    listeners.add(onItem)
    return () => listeners.delete(onItem)
  }, [])

  // 每条 6 秒自动消失
  useEffect(() => {
    if (items.length === 0) return undefined
    const timers = items.map((it) => setTimeout(() => {
      setItems((list) => list.filter((x) => x.id !== it.id))
    }, 6000))
    return () => timers.forEach(clearTimeout)
  }, [items])

  const dismiss = (id) => setItems((list) => list.filter((x) => x.id !== id))

  return (
    <div className="fixed top-0 inset-x-0 z-[80] pointer-events-none" aria-live="polite">
      {items.map((it) => (
        <div
          key={it.id}
          className="pointer-events-auto mx-2 mt-2 bg-slate-900/95 backdrop-blur text-white rounded-2xl shadow-2xl border border-white/10 px-4 py-3 flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300"
          onClick={() => dismiss(it.id)}
          role="alert"
        >
          <div className="text-xl leading-none mt-0.5 shrink-0">🔔</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{it.title}</div>
            <div className="text-xs text-slate-300 mt-0.5 break-words" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {it.message}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); dismiss(it.id) }}
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 text-xs flex items-center justify-center shrink-0"
            title="关闭"
          >✕</button>
        </div>
      ))}
    </div>
  )
}
