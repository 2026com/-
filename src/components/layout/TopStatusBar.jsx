import React from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { useMemo } from 'react'
import { dateUtil } from '../../utils/storage.js'

/**
 * 顶部状态栏
 * - 历史复盘视图时展示：年度完成率、有效工作时间
 * - 右侧常驻：打卡日历开关、配色/模式
 * 阶段1 修复：统计从硬编码改为真实数据计算
 */
export default function TopStatusBar() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const { activeTab } = state.ui

  const stats = useMemo(() => {
    // ===== 有效工作时间：真实计时记录汇总（分钟 → 小时） =====
    const doneMinutes = (state.timerRecords || [])
      .filter(t => t.done)
      .reduce((s, t) => s + (Number(t.minutes) || 0), 0)
    const totalHours = Math.round(doneMinutes / 60 * 10) / 10

    // ===== 年度完成率：所有根节点进度的加权平均 =====
    const roots = (state.nodes || []).filter(n => !n.parentId)
    const yearRate = roots.length > 0
      ? Math.round(roots.reduce((s, r) => s + (Number(r.progress) || 0), 0) / roots.length)
      : 0

    // ===== 连续打卡天数：从今天往前数，有任意打卡即不断 =====
    const today = new Date(dateUtil.today())
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const ds = dateUtil.format(d)
      const anyDone = (state.habits || []).some(h => state.checkins[`${ds}_${h.id}`])
      if (anyDone) streak++
      else if (i === 0) streak = 0
      else break
    }

    return { yearRate, totalHours, streak }
  }, [state.nodes, state.timerRecords, state.habits, state.checkins])

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
