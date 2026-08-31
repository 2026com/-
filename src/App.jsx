import React, { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import BottomTabs from './components/layout/BottomTabs.jsx'
import LeftDrawer from './components/layout/LeftDrawer.jsx'
import TopStatusBar from './components/layout/TopStatusBar.jsx'
import DisplayControls from './components/layout/DisplayControls.jsx'
import CalendarDrawer from './components/layout/CalendarDrawer.jsx'
import DashboardPanel from './components/dashboard/DashboardPanel.jsx'
import ModalRoot from './components/common/ModalRoot.jsx'
import TopReminderBanner from './components/widgets/TopReminderBanner.jsx'
import TimerWidget from './components/widgets/TimerWidget.jsx'
import StreakAlert from './components/widgets/StreakAlert.jsx'
import ExportToolsMount from './utils/exportTools.jsx'
import SystemPlaceholder from './shared/components/SystemPlaceholder.jsx'
// 系统一：日常待办（含长期目标横线本 / 历史复盘）
import { DailyHabitsPage, LongTermGoalsPage, HistoryReviewPage } from './systems/daily-tasks/index.js'
// 系统二~七：骨架页已就位（功能开发时替换各 Page 组件内容）
import { SkillTreePage } from './systems/skill-tree/index.js'
import { FinancePage } from './systems/finance/index.js'
import { SocialGraphPage } from './systems/social-graph/index.js'
import { KnowledgeBasePage } from './systems/knowledge-base/index.js'
import { HealthPage } from './systems/health/index.js'
import { MindCommunityPage } from './systems/mind-community/index.js'
import { useAppState, useAppDispatch } from './context/AppContext.jsx'
import { initShareReceiver, disposeShareReceiver, flushPendingShares } from './services/shareReceiver.js'
import { Clipboard } from '@capacitor/clipboard'
import { registerPlugin } from '@capacitor/core'
import { runTopBackHandler } from './utils/backStack.js'
import { dbGet, dbSet, getShareInbox, setShareInbox } from './services/db.js'
import { extractFirstUrl } from './systems/knowledge-base/services/knowledgeImport.js'

/** 原生壳（Capacitor APK）判定：返回键/退出仅原生环境有意义 */
const IS_NATIVE = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
const AppBridge = registerPlugin('AppBridge')

export default function App() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const location = useLocation()
  const navigate = useNavigate()
  // 纯净模式：隐藏顶栏/抽屉/底部 Tab（由显示控制悬浮球切换，仅横线本与 3D 知识库提供入口）
  const [pureMode, setPureMode] = useState(false)

  useEffect(() => {
    const path = location.pathname
    if (path.includes('daily')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'daily' })
    else if (path.includes('goals')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'goals' })
    else if (path.includes('review')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'review' })
    else if (path.includes('skill-tree')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'skill-tree' })
    else if (path.includes('social-graph')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'social-graph' })
    else if (path.includes('finance')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'finance' })
    else if (path.includes('knowledge-base')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'knowledge-base' })
    else if (path.includes('health')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'health' })
    else if (path.includes('mind-community')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'mind-community' })
  }, [location.pathname])

  // ===== 系统分享接收（CapacitorShareTarget）：注册监听，分享内容暂存到内存 =====
  // 说明：冷启动时插件会保留事件并在监听注册后补发；暂存内容的落库
  // （IndexedDB pending 区）由启动检查逻辑负责（见下方 useEffect）
  useEffect(() => {
    initShareReceiver().catch((e) => console.warn('[shareReceiver] 初始化失败', e))
    return () => {
      disposeShareReceiver().catch(() => {})
    }
  }, [])

  // ===== 启动检查：暂存的系统分享内容 → 清空暂存 → 落库 IndexedDB pending 区 =====
  // （冷启动时插件在监听注册后补发事件，事件回调内亦会触发落库；此处兜底残留暂存）
  useEffect(() => {
    flushPendingShares().catch((e) => console.warn('[shareReceiver] 启动检查失败', e))
  }, [])

  // ===== 剪贴板链接检测（抖音等 App 只能“复制链接”）=====
  // 启动 2s 后 + 每次回到前台时读取剪贴板：若为链接且与上次检测不同 →
  // 弹窗询问是否加入「待处理」队列（growth_app_v1_share_inbox），
  // 之后在 AI 助手 → 添加知识 面板顶部可一键选用导入。
  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        if (!mounted || document.visibilityState !== 'visible') return
        const { value } = await Clipboard.read()
        const text = String(value || '').trim()
        if (!text) return
        const url = extractFirstUrl(text)
        if (!url) return
        const last = dbGet('growth_app_v1_last_clipboard', '')
        if (last === url) return // 已询问过同一链接，不重复打扰
        dbSet('growth_app_v1_last_clipboard', url)
        dispatch({
          type: 'PUSH_MODAL',
          payload: {
            type: 'confirm',
            title: '📋 检测到剪贴板链接',
            message: `${url.slice(0, 80)}${url.length > 80 ? '…' : ''}\n\n是否加入待处理？之后可在 AI 助手 → 添加知识 中导入为知识节点。`,
            okText: '加入待处理',
            onOk: async () => {
              try {
                const inbox = await getShareInbox()
                if ((inbox || []).some(it => it && it.content === url && it.status === 'pending')) {
                  dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: 'ℹ️ 该链接已在待处理列表中' } })
                  return
                }
                await setShareInbox([...(inbox || []), { id: Date.now(), content: url, source: 'clipboard', receivedAt: Date.now() }])
                dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已加入待处理：AI 助手 → 添加知识 中可选用了' } })
              } catch (e) {
                dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 写入失败，请重试' } })
              }
            }
          }
        })
      } catch (e) { /* 无剪贴板权限/不支持 → 静默跳过 */ }
    }
    const timer = setTimeout(check, 2000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      mounted = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [dispatch])

  // ===== 安卓返回键 / 侧滑返回手势：一级关浮层 → 二级回首页 → 三级双击退出 =====
  // 原生侧（MainActivity）拦截返回事件并派发 window 'backbutton'，这里统一决策，
  // 杜绝「一按返回就退出 App」；退出必须 2 秒内连按两次。
  const backStateRef = useRef(null)
  backStateRef.current = {
    modalCount: state.ui.modalStack.length,
    dashboardOpen: state.ui.dashboardOpen,
    calendarOpen: state.ui.calendarOpen,
    drawerOpen: state.settings?.drawerOpen,
    pathname: location.pathname,
  }
  const lastBackAtRef = useRef(0)
  useEffect(() => {
    if (!IS_NATIVE) return undefined
    const onBack = () => {
      const s = backStateRef.current || {}
      // ① 全局弹窗栈（ModalRoot：confirm / alert / toast / 报告…）
      if ((s.modalCount || 0) > 0) { dispatch({ type: 'POP_MODAL' }); return }
      // ② 页面局部自绘浮层（时间选择器 / 习惯&临时任务表单 / 自检面板…后开先关）
      if (runTopBackHandler()) return
      // ③ 全局面板：仪表盘 / 打卡日历 / 左侧抽屉
      if (s.dashboardOpen) { dispatch({ type: 'TOGGLE_DASHBOARD' }); return }
      if (s.calendarOpen) { dispatch({ type: 'CLOSE_CALENDAR' }); return }
      if (s.drawerOpen) { dispatch({ type: 'TOGGLE_DRAWER' }); return }
      // ④ 页面级返回：非首页 → 回首页（长期目标为默认主页）
      if (s.pathname && s.pathname !== '/goals') { navigate('/goals'); return }
      // ⑤ 已在首页：2 秒内连按两次 → 退出 App
      const now = Date.now()
      if (now - lastBackAtRef.current < 2000) {
        try { AppBridge.exitApp() } catch (e) { /* web 环境无此桥，忽略 */ }
      } else {
        lastBackAtRef.current = now
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '再按一次返回键退出小美', duration: 1600 } })
      }
    }
    window.addEventListener('backbutton', onBack)
    return () => window.removeEventListener('backbutton', onBack)
  }, [dispatch, navigate])

  return (
    <div className="h-full w-full flex flex-col bg-system-bg overflow-hidden relative">
      {/* 全局工具挂载 */}
      <ExportToolsMount />
      <StreakAlert />

      {/* 纯净模式：隐藏顶部状态栏 / 左侧抽屉 / 底部 Tab / 计时悬浮窗 */}
      {!pureMode && <TopStatusBar />}

      <div className="flex-1 flex overflow-hidden relative">
        {!pureMode && <LeftDrawer />}

        <main className="flex-1 overflow-hidden relative">
          <div className="h-full w-full tab-enter" key={location.pathname}>
            <Routes>
              {/* ===== 系统一：日常待办（已迁移） ===== */}
              <Route path="/" element={<Navigate to="/goals" replace />} />
              <Route path="/daily" element={<DailyHabitsPage />} />
              <Route path="/goals" element={<LongTermGoalsPage />} />
              <Route path="/review" element={<HistoryReviewPage />} />

              {/* ===== 系统二~七：骨架页（按系统逐个开发后替换内容） ===== */}
              <Route path="/skill-tree" element={<SkillTreePage />} />
              <Route path="/finance" element={<FinancePage />} />
              <Route path="/social-graph" element={<SocialGraphPage />} />
              <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
              <Route path="/health" element={<HealthPage />} />
              <Route path="/mind-community" element={<MindCommunityPage />} />

              <Route path="*" element={<Navigate to="/goals" replace />} />
            </Routes>
          </div>
        </main>

        <CalendarDrawer />
        {state.ui.activeTab === 'review' && <DashboardPanel />}
      </div>

      {/* AI 助手为独立模块，入口挂在全局左侧抽屉（LeftDrawer → modules/ai-assistant/ChatInterface） */}
      {/* 心理情绪板块自带页内三条 Tab（情绪/社区/聊天），该路由下隐藏全局底栏避免双底栏 */}
      {!pureMode && !location.pathname.startsWith('/mind-community') && <BottomTabs />}
      <ModalRoot />
      {/* 到点提醒的顶部横幅（应用内，微信式；App 外由系统通知横幅负责） */}
      <TopReminderBanner />
      {!pureMode && <TimerWidget />}

      {/* 显示控制悬浮球（仅长期目标横线本 / 3D 知识库页提供）：纯净模式、横竖屏切换、深浅色主题 */}
      {(location.pathname.startsWith('/goals') || location.pathname.startsWith('/knowledge-base')) && (
        <DisplayControls pureMode={pureMode} onTogglePure={() => setPureMode(v => {
          const next = !v
          // 广播给页内组件（3D 知识库隐藏标题卡/右上按钮列/底部图例）
          try { window.dispatchEvent(new CustomEvent('app:pure-mode', { detail: { on: next } })) } catch { /* ignore */ }
          return next
        })} />
      )}
    </div>
  )
}
