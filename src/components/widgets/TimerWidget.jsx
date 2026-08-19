import React, { useEffect, useState, useRef } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { notifyNow } from '../../utils/notify.js'

/**
 * 阶段4：全局浮动计时器（番茄钟/秒表双模式）
 * 支持：后台运行、到时通知
 */
export default function TimerWidget() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  // 取最新的未完成计时
  const active = [...state.timerRecords].reverse().find(t => !t.done)
  const [, forceTick] = useState(0)
  const [open, setOpen] = useState(false)
  const intervalRef = useRef(null)

  // 派生数据（须在 hooks 之前计算，供下方 effect 使用，避免 TDZ）
  const node = active ? state.nodes.find(n => n.id === active.nodeId) : null
  const isPomodoro = active ? active.type === 'pomodoro' : false
  const totalSec = active ? (isPomodoro ? (active.minutes || 25) : 0) * 60 : 0
  const elapsed = active ? Math.max(0, Math.floor((Date.now() - (active.started || Date.now())) / 1000)) : 0
  const remain = active ? Math.max(0, totalSec - elapsed) : 0

  useEffect(() => {
    if (!active) return
    intervalRef.current = setInterval(() => forceTick(t => t + 1), 1000)
    return () => clearInterval(intervalRef.current)
  }, [active?.id])

  // 倒计时归零（首次）：页面内弹提醒 + 系统通知（切到后台/锁屏也能收到）
  const doneNotifiedRef = useRef(null)
  useEffect(() => {
    if (!active || totalSec <= 0) return
    if (remain > 0) return
    if (doneNotifiedRef.current === active.id) return
    doneNotifiedRef.current = active.id
    const name = node?.title || '自由任务'
    const title = isPomodoro ? '🍅 番茄钟结束' : '⏱ 计时结束'
    const msg = isPomodoro
      ? `「${name}」${active.minutes || 25} 分钟专注完成，休息一下吧`
      : `「${name}」计时结束`
    notifyNow(title, msg)
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'alert', title, message: msg } })
  }, [remain, active?.id, totalSec])

  if (!active) return null

  const h = Math.floor(remain / 3600), m = Math.floor((remain % 3600) / 60), s = remain % 60
  const pad = (n) => String(n).padStart(2, '0')
  const progress = totalSec > 0 ? Math.min(100, elapsed / totalSec * 100) : Math.min(100, elapsed / 3600 * 10)

  const stop = (completed = true) => {
    // 阶段1 修复：统一走 reducer 的 FINISH_TIMER_RECORD，不再 dispatch 错误 action / 不 hack localStorage / 不整页刷新
    dispatch({
      type: 'FINISH_TIMER_RECORD',
      payload: { id: active.id, completed },
    })
    setOpen(false)
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: completed ? `✅ 计时完成：${active.minutes || 25}分钟` : `⏹ 手动结束：${Math.max(1, Math.round(elapsed / 60))}分钟` } })
  }

  if (!open) {
    // 迷你悬浮球
    return (
      <div
        onClick={() => setOpen(true)}
        className="fixed z-40 right-3 bottom-24 w-14 h-14 rounded-full shadow-2xl text-white flex flex-col items-center justify-center touch-feedback"
        style={{ background: isPomodoro ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
      >
        <div className="text-[10px] leading-none">{isPomodoro ? '🍅' : '⏱'}</div>
        <div className="text-xs font-bold leading-tight mt-0.5">{pad(m)}:{pad(s)}</div>
      </div>
    )
  }

  return (
    <div className="fixed z-50 inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden animate-in zoom-in-95">
        <div className={`p-6 text-center text-white ${isPomodoro ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
          <div className="text-xs opacity-80 mb-1">{isPomodoro ? '🍅 番茄工作法' : '⏱ 手动秒表计时'}</div>
          <div className="text-sm opacity-90 mb-3">{node?.title || '自由任务'}</div>
          <div className="text-5xl font-black tabular-nums tracking-wider">
            {h > 0 && `${pad(h)}:`}{pad(m)}:{pad(s)}
          </div>
          <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="p-5 flex gap-2">
          <button onClick={() => stop(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm touch-feedback">
            ⏹ 提前结束
          </button>
          <button onClick={() => stop(true)} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold text-sm touch-feedback">
            ✅ 完成
          </button>
        </div>
      </div>
    </div>
  )
}
