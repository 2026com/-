import React, { useState } from 'react'

/**
 * 批量打卡弹窗 —— 自 DailyHabitsPage.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 自绘 overlay，不经过 ModalRoot.payload 传递，避免 JSON clone 序列化风险
 */
export default function BatchCheckinModal({ habits, checkins, today, onClose, onSubmit }) {
  const [selected, setSelected] = useState(() => {
    // 默认勾选出今日未完成的习惯
    return habits.filter(h => !checkins[`${today}_${h.id}`]).map(h => h.id)
  })
  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  const allIds = habits.map(h => h.id)

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
          <div className="text-base font-bold text-slate-800">✅ 批量打卡 · {habits.length} 个习惯</div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center text-lg">×</button>
        </div>
        <div className="p-5 max-h-80 overflow-y-auto no-scrollbar space-y-2">
          {habits.length === 0 && <div className="text-center text-sm text-slate-400 py-6">暂无习惯</div>}
          {habits.map(h => {
            const done = !!checkins[`${today}_${h.id}`]
            const isSel = selected.includes(h.id) || done
            return (
              <label
                key={h.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} cursor-pointer hover:border-indigo-300`}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  disabled={done}
                  onChange={() => !done && toggle(h.id)}
                  className="w-4 h-4 accent-emerald-600"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${done ? 'line-through text-emerald-600' : 'text-slate-800'}`}>{h.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {h.estMinutes ? `${h.estMinutes} 分钟` : ''}
                    {h.reminder ? ` · 🔔 ${h.reminder}` : ''}
                    {done ? ' · 今日已完成' : ''}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">取消</button>
          <button
            onClick={() => {
              // 一键全部打卡：包含今日已完成和未完成的所有ID（已完成的checkin不会重复写入因为是相同 key，但这里 value=true 覆盖也行，没副作用）
              onSubmit(allIds, true)
            }}
            className="px-4 py-2 rounded-lg text-sm bg-emerald-100 hover:bg-emerald-200 text-emerald-700 touch-feedback"
          >一键全部打卡</button>
          <button
            onClick={() => onSubmit(selected, false)}
            className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-feedback"
          >确认勾选打卡 {selected.length > 0 ? `(${selected.length})` : ''}</button>
        </div>
      </div>
    </div>
  )
}