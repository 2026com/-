import React from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { useMemo } from 'react'

/**
 * 顶部状态栏
 * - 历史复盘视图时展示：年度完成率、有效工作时间
 * - 右侧常驻：打卡日历开关、配色/模式
 */
export default function TopStatusBar() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const { activeTab } = state.ui

  const stats = useMemo(() => {
    const yearRate = 52 // 默认示例数据
    const totalHours = 186
    const streak = 25
    return { yearRate, totalHours, streak }
  }, [state.nodes, state.timerRecords])

  return (
    <header
      className="w-full bg-gradient-to-r from-slate-800 to-slate-700 text-white flex items-center justify-between px-4 z-30 shrink-0"
      style={{ height: 52, paddingTop: 'var(--safe-top)' }}
    >
      {/* 左侧：页签标题 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">
          {activeTab === 'daily' && '日常习惯视图'}
          {activeTab === 'goals' && '长期目标视图'}
          {activeTab === 'review' && (
            <span className="flex items-center gap-2">
              历史复盘视图
              <span className="text-xs bg-white/10 px-2 py-0.5 rounded">年度完成率 {stats.yearRate}%</span>
              <span className="text-xs bg-white/10 px-2 py-0.5 rounded">有效工作时间 {stats.totalHours}小时</span>
            </span>
          )}
        </span>
      </div>

      {/* 右侧：功能按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_CALENDAR' })}
          className={`px-3 py-1.5 text-xs rounded-md touch-feedback transition-colors ${state.ui.calendarOpen ? 'bg-yellow-400 text-slate-900 font-semibold' : 'bg-white/10 hover:bg-white/20'}`}
        >
          🗓 月度打卡日历
        </button>
        {activeTab === 'review' && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_DASHBOARD' })}
            className="px-3 py-1.5 text-xs rounded-md bg-indigo-500 hover:bg-indigo-400 touch-feedback font-semibold"
          >
            📊 {state.ui.dashboardOpen ? '收起仪表盘' : '打开数据仪表盘'}
          </button>
        )}
      </div>
    </header>
  )
}
