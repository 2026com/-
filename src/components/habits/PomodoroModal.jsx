import React, { useState } from 'react'

/**
 * 番茄计时弹窗（极简版：选习惯+启动，不做倒计时挂钟）
 * —— 自 DailyHabitsPage.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 自绘 overlay，不经过 ModalRoot.payload 传递，避免 JSON clone 序列化风险
 */
export default function PomodoroModal({ habits, onClose, onSubmit }) {
  const [habitId, setHabitId] = useState(habits[0]?.id || '')
  const [minutes, setMinutes] = useState(25)
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-base font-bold text-slate-800">🍅 番茄计时 · 启动</div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center text-lg">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">选择要专注的习惯</label>
            <select
              value={habitId}
              onChange={(e) => setHabitId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-rose-400"
            >
              {habits.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">专注时长（分钟）</label>
            <div className="grid grid-cols-4 gap-2">
              {[15, 25, 45, 60].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`py-2 rounded-lg text-xs font-medium border ${
                    minutes === m ? 'bg-rose-500 text-white border-rose-500' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-rose-300'
                  }`}
                >{m}分钟</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">取消</button>
            <button
              onClick={() => habitId && onSubmit(habitId, minutes)}
              className="px-4 py-2 rounded-lg text-sm bg-rose-500 hover:bg-rose-400 text-white font-medium touch-feedback"
            >🚀 开始专注</button>
          </div>
        </div>
      </div>
    </div>
  )
}