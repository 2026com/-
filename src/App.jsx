import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import BottomTabs from './components/layout/BottomTabs.jsx'
import LeftDrawer from './components/layout/LeftDrawer.jsx'
import TopStatusBar from './components/layout/TopStatusBar.jsx'
import CalendarDrawer from './components/layout/CalendarDrawer.jsx'
import DailyHabitsPage from './pages/DailyHabitsPage.jsx'
import LongTermGoalsPage from './pages/LongTermGoalsPage.jsx'
import HistoryReviewPage from './pages/HistoryReviewPage.jsx'
import DashboardPanel from './components/dashboard/DashboardPanel.jsx'
import ModalRoot from './components/common/ModalRoot.jsx'
import TimerWidget from './components/widgets/TimerWidget.jsx'
import StreakAlert from './components/widgets/StreakAlert.jsx'
import ExportToolsMount from './utils/exportTools.jsx'
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
              <Route path="/" element={<Navigate to="/goals" replace />} />
              <Route path="/daily" element={<DailyHabitsPage />} />
              <Route path="/goals" element={<LongTermGoalsPage />} />
              <Route path="/review" element={<HistoryReviewPage />} />
              <Route path="*" element={<Navigate to="/goals" replace />} />
            </Routes>
          </div>
        </main>

        <CalendarDrawer />
        {state.ui.activeTab === 'review' && <DashboardPanel />}
      </div>

      <BottomTabs />
      <ModalRoot />
      <TimerWidget />
    </div>
  )
}
