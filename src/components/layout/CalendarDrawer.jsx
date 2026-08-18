import React, { useState, useMemo } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { dateUtil } from '../../utils/storage.js'

/**
 * 页面右上角：可折叠收起【月度彩色打卡日历抽屉】
 * 需求说明书模块3第57条
 */
export default function CalendarDrawer() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const { calendarOpen } = state.ui
  const [current, setCurrent] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })

  const stats = useMemo(() => {
    const days = dateUtil.getMonthDays(current.year, current.month)
    const first = dateUtil.getFirstWeekday(current.year, current.month)
    const cells = []
    // 前置空白
    for (let i = 0; i < first; i++) cells.push(null)
    // 日期
    for (let d = 1; d <= days; d++) {
      const dateStr = `${current.year}-${String(current.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      // 计算当日完成度
      const habitCount = state.habits.length || 1
      let checked = 0
      state.habits.forEach(h => {
        if (state.checkins[`${dateStr}_${h.id}`]) checked++
      })
      const rate = checked / habitCount
      let cls = 'cal-none'
      if (rate >= 0.99) cls = 'cal-done'
      else if (rate > 0) cls = 'cal-partial'
      cells.push({ date: d, dateStr, cls, rate: Math.round(rate * 100) })
    }
    // 连续打卡
    const today = dateUtil.today()
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const ds = dateUtil.format(d)
      const allDone = state.habits.length > 0 && state.habits.every(h => state.checkins[`${ds}_${h.id}`])
      if (allDone) streak++
      else if (i > 0) break
    }
    // 本月完成率
    const monthRate = Math.round(cells.reduce((s, c) => s + (c ? c.rate : 0), 0) / days)
    return { cells, streak, monthRate }
  }, [current, state.habits, state.checkins])

  if (!calendarOpen) {
    // 收起状态：仅显示入口按钮（在顶部栏，这里只渲染展开后的抽屉）
    return null
  }

  const goMonth = (delta) => {
    let { year, month } = current
    month += delta
    if (month < 1) { month = 12; year-- }
    if (month > 12) { month = 1; year++ }
    setCurrent({ year, month })
  }

  return (
    <div className="absolute top-0 right-0 h-full w-[300px] bg-white border-l border-slate-200 shadow-xl z-25 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
      {/* 头部 */}
      <div className="h-11 border-b border-slate-200 flex items-center justify-between px-3 shrink-0">
        <button onClick={() => goMonth(-1)} className="text-slate-500 hover:text-slate-700 w-7 h-7 rounded hover:bg-slate-100 touch-feedback">‹</button>
        <div className="text-sm font-semibold text-slate-800">{current.year}年{current.month}月</div>
        <button onClick={() => goMonth(1)} className="text-slate-500 hover:text-slate-700 w-7 h-7 rounded hover:bg-slate-100 touch-feedback">›</button>
      </div>

      {/* 统计卡 */}
      <div className="p-3 border-b border-slate-100 grid grid-cols-2 gap-2 text-xs shrink-0">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-2 rounded">
          <div className="text-slate-500">本月完成率</div>
          <div className="text-lg font-bold text-indigo-700">{stats.monthRate}%</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-2 rounded">
          <div className="text-slate-500">连续打卡</div>
          <div className="text-lg font-bold text-emerald-700">🔥 {stats.streak}天</div>
        </div>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 text-center text-xs text-slate-400 py-2 shrink-0">
        {['日','一','二','三','四','五','六'].map(d => <div key={d}>{d}</div>)}
      </div>

      {/* 日期格 */}
      <div className="grid grid-cols-7 gap-1 p-2 flex-1 content-start">
        {stats.cells.map((c, i) => (
          <div
            key={i}
            className={`aspect-square flex flex-col items-center justify-center rounded text-xs relative ${c ? c.cls : ''} ${c ? 'touch-feedback cursor-pointer hover:ring-2 ring-indigo-300' : ''}`}
            title={c ? `${c.dateStr} 完成度${c.rate}%` : ''}
          >
            {c && <>
              <span className="font-medium">{c.date}</span>
              {c.rate > 0 && c.rate < 100 && <span className="text-[10px] opacity-80">{c.rate}%</span>}
            </>}
          </div>
        ))}
      </div>

      {/* 图例 */}
      <div className="p-3 border-t border-slate-100 text-xs text-slate-500 flex gap-3 justify-center shrink-0">
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded cal-done inline-block" />全额完成</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded cal-partial inline-block" />部分完成</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded cal-none inline-block" />未执行</span>
      </div>
    </div>
  )
}
