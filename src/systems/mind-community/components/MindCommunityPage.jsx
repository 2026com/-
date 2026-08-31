import React, { useState } from 'react'
import EmotionTab from './EmotionTab.jsx'
import CommunityTab from './CommunityTab.jsx'
import ChatTab from './ChatTab.jsx'

/**
 * 情绪心理 + 社区聊天（系统七）页面
 * ============================================================================
 * - 页内三条 Tab（情绪 / 社区 / 聊天），样式复刻全局 BottomTabs：
 *   图标+文字竖排、三项均分、选中靛蓝高亮；
 * - 本板块路由下 App.jsx 会隐藏全局底栏，由本页底部 Tab 接管（接线见 App.jsx）；
 * - Tab 切换为页面内部状态（不走路由）：各 Tab 数据独立、互不依赖；
 * - 数据层第一期全部本地模拟（见 services/communityStorage.js 注释）。
 */

const SUB_TABS = [
  { id: 'emotion',   name: '情绪', icon: '💗' },
  { id: 'community', name: '社区', icon: '🌍' },
  { id: 'chat',      name: '聊天', icon: '💬' },
]

export default function MindCommunityPage() {
  // 默认落在「社区」（当前主推功能）
  const [activeTab, setActiveTab] = useState('community')

  return (
    <div className="h-full w-full flex flex-col bg-system-bg overflow-hidden">
      {/* 页内标题栏 */}
      <header className="h-11 shrink-0 bg-white border-b border-slate-200 flex items-center justify-center">
        <span className="text-sm font-bold text-slate-800">情绪与心理</span>
      </header>

      {/* Tab 内容区 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'emotion' && <EmotionTab />}
        {activeTab === 'community' && <CommunityTab />}
        {activeTab === 'chat' && <ChatTab />}
      </div>

      {/* 页内底部三条 Tab（复刻全局 BottomTabs 样式） */}
      <nav
        className="w-full bg-white border-t border-slate-200 flex items-center justify-around z-30 bottombar-safe"
        style={{ minHeight: 'var(--bottombar-total, 64px)', paddingBottom: 'var(--safe-bottom, 0px)' }}
      >
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              h-full w-[calc(100vw/3)] flex flex-col items-center justify-center gap-1 touch-feedback transition-colors cursor-pointer
              ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}
            `}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className={`text-xs ${activeTab === tab.id ? 'font-semibold' : 'font-normal'}`}>{tab.name}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
