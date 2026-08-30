import React, { useEffect, useState } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { useMemo } from 'react'
import { dateUtil } from '../../utils/storage.js'
import { useAppTheme, toggleTheme } from '../../services/theme.js'
import { getReminderStatus, openChannelSettings, openFullScreenIntentSettings, openAppDetailsSettings, openMiuiPermissionEditor } from '../../services/device.js'
import { notifyNativeNow, scheduleNativeNotification } from '../../utils/notify.js'
import { pushBackHandler } from '../../utils/backStack.js'
import { BUILD_TAG } from '../../buildInfo.js'

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

  // ===== 提醒链路状态（顶栏🔔）：挂载/回前台刷新；面板打开时注册返回键关闭 =====
  const [remPanel, setRemPanel] = useState(false)
  const [remSt, setRemSt] = useState(null)
  const [testing, setTesting] = useState(false)
  useEffect(() => {
    let alive = true
    const refresh = () => { getReminderStatus().then((s) => { if (alive && s) setRemSt(s) }) }
    refresh()
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [])
  useEffect(() => {
    if (!remPanel) return undefined
    return pushBackHandler(() => setRemPanel(false))
  }, [remPanel])
  const remOk = !!remSt && remSt.notificationsEnabled && remSt.fsiGranted && remSt.batteryIgnored && remSt.guardRunning
  const testBanner = async () => {
    setTesting(true)
    try { await notifyNativeNow('🔔 测试横幅', '看到这条从顶部弹出 = App 外提醒通道畅通 ✅') } catch (e) { /* ignore */ }
    setTimeout(() => setTesting(false), 2000)
  }
  const cleanReload = () => {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {})
      }
      if (window.caches && caches.keys) {
        caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {})
      }
    } catch (e) { /* ignore */ }
    setTimeout(() => window.location.reload(), 300)
  }
  // 后台横幅测试：排定 5 秒后触发 → 用户回桌面/熄屏 → 验证「后台发出的通知」有没有横幅
  const testBgBanner = async () => {
    const ok = await scheduleNativeNotification({
      id: 'bgtest-' + Date.now(),
      title: '⏱ 后台横幅测试',
      body: '在桌面/熄屏看到此横幅 = 后台提醒链路畅通 ✅',
      at: Date.now() + 5000,
    })
    setRemPanel(false)
    setTimeout(() => {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: ok ? '⏱ 已排定 5 秒测试：请立刻回桌面（或熄屏）等待横幅' : '⚠️ 仅 APK 环境可测', duration: 3000 } })
    }, 200)
  }
  const rmark = (ok) => (remSt ? (ok ? '✅' : '❌') : '…')

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
          onClick={() => setRemPanel(true)}
          className="relative px-2.5 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 touch-feedback transition-colors"
          title="提醒状态 / 测试横幅"
        >
          🔔
          <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${remOk ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        </button>
        <button
          onClick={() => toggleTheme()}
          title={theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
          className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 touch-feedback transition-colors"
        >
          {theme === 'dark' ? '☀️ 浅色' : '🌙 深色'}
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

        {/* 提醒状态面板（顶栏🔔，所有页面可开） */}
        {remPanel && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setRemPanel(false)}>
            <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-base font-bold text-slate-800 dark:text-slate-100">🔔 提醒状态 <span className="text-[10px] text-slate-400 font-normal">{BUILD_TAG}</span></div>
                <button onClick={() => setRemPanel(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex items-center justify-center text-sm">✕</button>
              </div>
              <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <span>{rmark(remSt ? remSt.notificationsEnabled : false)} 渠道「悬浮/锁屏/声音」</span>
                  <button onClick={() => openChannelSettings()} className="px-2 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 touch-feedback">去开启 ›</button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{rmark(remSt ? remSt.fsiGranted : false)} 全屏通知（熄屏点亮弹出）</span>
                  <button onClick={() => openFullScreenIntentSettings()} className="px-2 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 touch-feedback">去开启 ›</button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>· 后台弹出界面（MIUI 特有）</span>
                  <button onClick={() => openMiuiPermissionEditor()} className="px-2 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 touch-feedback">去开启 ›</button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{rmark(remSt ? remSt.batteryIgnored : false)} 自启动 / 省电策略</span>
                  <button onClick={() => openAppDetailsSettings()} className="px-2 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 touch-feedback">去开启 ›</button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{rmark(remSt ? remSt.guardRunning : false)} 守护服务{remSt && remSt.guardRunning ? `（待触发 ${remSt.pendingCount >= 0 ? remSt.pendingCount : '?'} 条）` : ''}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={testBanner} className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white touch-feedback">{testing ? '已发送…' : '📢 测试横幅(前台)'}</button>
                <button onClick={cleanReload} className="px-3 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 touch-feedback" title="反注册SW+清缓存后重载（排查旧包残留）">🧹 清缓存重载</button>
              </div>
              <div className="mt-2">
                <button onClick={testBgBanner} className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white touch-feedback">⏱ 后台横幅测试（点后立刻回桌面/熄屏，5 秒后应弹横幅）</button>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                「悬浮通知」是 MIUI 手动开关：点📢测试若不弹横幅，回第①项把渠道「悬浮通知」打开即可。面板顶部的版本号用于确认手机上跑的是不是新包。
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
