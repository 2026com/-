import React, { useEffect, useState } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { useMemo } from 'react'
import { dateUtil } from '../../utils/storage.js'
import { useAppTheme, toggleTheme } from '../../services/theme.js'
import { reminderSelfTest } from '../../utils/notify.js'
import { isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimization } from '../../services/device.js'
import ReminderSoundPanel from './ReminderSoundPanel.jsx'

/**
 * 顶部状态栏 V2（手机端适配）
 * - CSS env(safe-area-inset-top) 优先；Android Chrome 等返回 0 时用 JS 检测兜底
 * - 兜底策略：移动 UA → 至少 24px 顶部补偿，防止与系统时间/电池图标重叠
 * - 横屏时自动压缩为紧凑高度
 */
function detectSafeTop() {
  if (typeof window === 'undefined') return 0
  // 1) 先测 CSS env() 实际值
  try {
    const probe = document.createElement('div')
    probe.style.position = 'fixed'
    probe.style.visibility = 'hidden'
    probe.style.paddingTop = 'env(safe-area-inset-top, 0px)'
    document.body.appendChild(probe)
    const cssVal = parseInt(window.getComputedStyle(probe).paddingTop, 10) || 0
    document.body.removeChild(probe)
    if (cssVal > 0) return cssVal
  } catch { /* 忽略 */ }
  // 2) env() 无效时的 UA 兜底：仅移动端需要补偿系统状态栏
  const ua = navigator.userAgent || ''
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
  const isLandscape = window.innerWidth >= window.innerHeight
  if ((isMobileUA || isStandalone) && !isLandscape) return 28 // 移动竖屏兜底：28px
  if ((isMobileUA || isStandalone) && isLandscape) return 8   // 移动横屏兜底：8px
  return 0 // 桌面浏览器无需补偿
}

/**
 * 顶部状态栏
 * - 历史复盘视图时展示：年度完成率、有效工作时间
 * - 右侧常驻：打卡日历开关、配色/模式
 */
export default function TopStatusBar() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const { activeTab } = state.ui
  const theme = useAppTheme()

  // ===== 提醒自检（自包含浮层：点击立即反馈，不依赖 ModalRoot）=====
  const [selfTest, setSelfTest] = useState(null) // null | {loading:true} | {lines:[...]} | {error:'...'}
  // ===== 提醒铃声设置浮层 =====
  const [soundPanel, setSoundPanel] = useState(false)
  const runSelfTest = async () => {
    console.log('[selftest] clicked')
    setSelfTest({ loading: true })
    try {
      const withTimeout = (p, ms) => Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('自检总耗时过长（有步骤卡住，结果会标出卡点）')), ms)),
      ])
      const lines = await withTimeout(reminderSelfTest(), 45000)
      setSelfTest({ lines })
    } catch (e) {
      setSelfTest({ error: String((e && e.message) || e) })
    }
  }

  // ===== V2：安全区顶部补偿（CSS env 失效时 JS 兜底）=====
  const [safeTop, setSafeTop] = useState(() => detectSafeTop())
  useEffect(() => {
    const recompute = () => setSafeTop(detectSafeTop())
    window.addEventListener('resize', recompute)
    window.addEventListener('orientationchange', recompute)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('orientationchange', recompute)
    }
  }, [])
  // 把 JS 检测结果写入全局变量，供 responsive.css 的 topbar-safe/bottombar-safe 使用
  useEffect(() => {
    document.documentElement.style.setProperty('--safe-top-js', `${safeTop}px`)
  }, [safeTop])

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
      className="w-full bg-gradient-to-r from-slate-800 to-slate-700 text-white flex items-center justify-between px-4 z-30 shrink-0 topbar-safe"
      style={{ paddingTop: 'var(--safe-top-js, var(--safe-top, 0px))' }}
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
          {activeTab === 'skill-tree' && '能力成长 · 技能树'}
          {activeTab === 'social-graph' && '人际网络'}
          {activeTab === 'finance' && '财务记账'}
          {activeTab === 'knowledge-base' && '知识思考库 · 3D知识库'}
          {activeTab === 'health' && '身体状态'}
          {activeTab === 'mind-community' && '情绪与心理'}
        </span>
      </div>

      {/* 右侧：功能按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => toggleTheme()}
          title={theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
          className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 touch-feedback transition-colors"
        >
          {theme === 'dark' ? '☀️ 浅色' : '🌙 深色'}
        </button>
        <button
          onClick={() => setSoundPanel(true)}
          title="提醒铃声：App 内选择打卡/闹钟提醒的提示音"
          className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 touch-feedback transition-colors"
        >
          🔊 铃声
        </button>
        <button
          onClick={runSelfTest}
          title="一键诊断：通知权限 / 渠道 / 调度，并 3 秒后发出测试通知"
          className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 touch-feedback transition-colors"
        >
          🔔 自检
        </button>
        <button
          onClick={async () => {
            try {
              const ignored = await isIgnoringBatteryOptimizations()
              if (ignored === true) {
                dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已在电池优化白名单中，提醒可准时响铃' } })
                return
              }
              const s = await requestIgnoreBatteryOptimization()
              if (s === 'launched') {
                dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '🔋 请在系统弹窗中点「允许」，锁屏/杀进程后提醒也能准时响铃' } })
              } else if (s === 'already') {
                dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已在电池优化白名单中' } })
              } else {
                dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 当前环境不支持该项设置' } })
              }
            } catch { /* ignore */ }
          }}
          title="提醒保活：加入电池优化白名单（各品牌通用），确保锁屏/杀进程后提醒准时响铃"
          className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 touch-feedback transition-colors"
        >
          🔋 保活
        </button>
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

        {/* 提醒铃声设置浮层 */}
        {soundPanel && <ReminderSoundPanel onClose={() => setSoundPanel(false)} />}

        {/* 提醒自检浮层（自包含：点击立即显示，15s 超时保护，异常可视化） */}
        {selfTest && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setSelfTest(null)}
          >
            <div
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-base font-bold text-slate-800">🔔 提醒链路自检</div>
                <button
                  onClick={() => setSelfTest(null)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center text-sm"
                >✕</button>
              </div>
              {selfTest.loading && (
                <div className="text-sm text-slate-500 flex items-center justify-center gap-2 py-6">
                  <span className="w-4 h-4 rounded-full border-2 border-indigo-300 border-t-indigo-500 animate-spin" />
                  正在逐项检测（权限 / 渠道 / 调度）…
                </div>
              )}
              {selfTest.error && (
                <div className="text-sm text-rose-600 bg-rose-50 rounded-xl p-3 leading-relaxed break-words">
                  ❌ {selfTest.error}
                </div>
              )}
              {selfTest.lines && (
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selfTest.lines.join('\n')}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
