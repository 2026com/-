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
// 系统二~七：骨架页已就位（功能开发时替换各 Page 组件内容）
import { SkillTreePage } from './systems/skill-tree/index.js'
import { FinancePage } from './systems/finance/index.js'
import { SocialGraphPage } from './systems/social-graph/index.js'
import { KnowledgeBasePage } from './systems/knowledge-base/index.js'
import { HealthPage } from './systems/health/index.js'
import { MindCommunityPage } from './systems/mind-community/index.js'
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
      <BottomTabs />
      <ModalRoot />
      <TimerWidget />
    </div>
  )
}
