import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import BottomTabs from './components/layout/BottomTabs.jsx'
import LeftDrawer from './components/layout/LeftDrawer.jsx'
import TopStatusBar from './components/layout/TopStatusBar.jsx'
import CalendarDrawer from './components/layout/CalendarDrawer.jsx'
import DashboardPanel from './components/dashboard/DashboardPanel.jsx'
import ModalRoot from './components/common/ModalRoot.jsx'
import TimerWidget from './components/widgets/TimerWidget.jsx'
import StreakAlert from './components/widgets/StreakAlert.jsx'
import ExportToolsMount from './utils/exportTools.jsx'
import SystemPlaceholder from './shared/components/SystemPlaceholder.jsx'
// 系统一：日常待办（含长期目标横线本 / 历史复盘）
import { DailyHabitsPage, LongTermGoalsPage, HistoryReviewPage } from './systems/daily-tasks/index.js'
import { useAppState, useAppDispatch } from './context/AppContext.jsx'

export default function App() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const location = useLocation()

  useEffect(() => {
    const path = location.pathname
    if (path.includes('daily')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'daily' })
    else if (path.includes('goals')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'goals' })
    else if (path.includes('review')) dispatch({ type: 'SET_ACTIVE_TAB', payload: 'review' })
  }, [location.pathname])

  return (
    <div className="h-full w-full flex flex-col bg-system-bg overflow-hidden relative">
      {/* 全局工具挂载 */}
      <ExportToolsMount />
      <StreakAlert />

      <TopStatusBar />

      <div className="flex-1 flex overflow-hidden relative">
        <LeftDrawer />

        <main className="flex-1 overflow-hidden relative">
          <div className="h-full w-full tab-enter" key={location.pathname}>
            <Routes>
              {/* ===== 系统一：日常待办（已迁移） ===== */}
              <Route path="/" element={<Navigate to="/goals" replace />} />
              <Route path="/daily" element={<DailyHabitsPage />} />
              <Route path="/goals" element={<LongTermGoalsPage />} />
              <Route path="/review" element={<HistoryReviewPage />} />

              {/* ===== 系统二~七：建设中占位（按系统逐个迁移后替换） ===== */}
              <Route path="/skill-tree" element={<SystemPlaceholder name="技能树" icon="🌳" description="系统二 · 建设中" />} />
              <Route path="/finance" element={<SystemPlaceholder name="财务记账" icon="💰" description="系统三 · 建设中" />} />
              <Route path="/social-graph" element={<SystemPlaceholder name="人际关系网络" icon="🕸️" description="系统四 · 建设中" />} />
              <Route path="/knowledge-base" element={<SystemPlaceholder name="3D 知识库" icon="🧠" description="系统五 · 建设中" />} />
              <Route path="/health" element={<SystemPlaceholder name="身体状态" icon="❤️" description="系统六 · 建设中" />} />
              <Route path="/mind-community" element={<SystemPlaceholder name="情绪心理 + 社区聊天" icon="💬" description="系统七 · 建设中" />} />

              <Route path="*" element={<Navigate to="/goals" replace />} />
            </Routes>
          </div>
        </main>

        <CalendarDrawer />
        {state.ui.activeTab === 'review' && <DashboardPanel />}
      </div>

      {/* AI 助手为独立模块，入口挂在全局左侧抽屉（LeftDrawer → modules/ai-assistant/ChatInterface） */}
      <BottomTabs />
      <ModalRoot />
      <TimerWidget />
    </div>
  )
}
