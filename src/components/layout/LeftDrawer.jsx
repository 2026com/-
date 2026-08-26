import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { getSEVEN_SYSTEMS_EFFECTIVE } from '../../utils/constants.js'
import AIChatSidebar from '../../modules/ai-assistant/components/ChatInterface.jsx'

/**
 * 左侧全局可收起抽屉 双模式一键切换（V2：只保留 7 个指定系统）
 * 模式1：七大成长系统导航菜单（仅 7 系统 + 向内/向外两组分组 + 任务日程收纳三大页面）
 * 模式2：AI独立对话面板
 */

// 七大系统固定分组顺序（按 FR-10 要求）
const NAV_GROUPS = [
  {
    groupTitle: '向外 · 现实战斗力',
    subtitle: '现实世界打胜仗',
    ids: ['nengli', 'renji', 'caiwu', 'richeng', 'zhishi']
  },
  {
    groupTitle: '向内 · 内核定力',
    subtitle: '内核稳定不摇晃',
    ids: ['shenti', 'qingxu']
  }
]

// 三大任务路由（收纳到「任务日程」子菜单）
const RICHENG_SUB_ROUTES = [
  { id: 'daily',  name: '日常打卡',   icon: '📅', path: '/daily',  tab: 'daily'  },
  { id: 'goals',  name: '长期规划',   icon: '🎯', path: '/goals',  tab: 'goals'  },
  { id: 'review', name: '历史复盘',   icon: '📊', path: '/review', tab: 'review' },
]

export default function LeftDrawer() {
  const { settings, ui } = useAppState()
  const dispatch = useAppDispatch()
  const { drawerOpen, drawerMode } = settings

  const width = !drawerOpen ? 60 : drawerMode === 'ai' ? 380 : 248

  return (
    <aside
      className="drawer-transition h-full bg-white border-r border-slate-200 flex flex-col overflow-hidden z-20"
      style={{ width }}
    >
      {/* 头部：标题 + 收起/展开 + 模式切换 */}
      <div className="h-12 min-h-[48px] flex items-center px-3 border-b border-slate-200 gap-2 shrink-0">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_DRAWER' })}
          className="w-8 h-8 rounded-lg hover:bg-slate-100 touch-feedback flex items-center justify-center text-slate-600 text-lg shrink-0"
          title={drawerOpen ? '收起' : '展开'}
        >
          {drawerOpen ? '«' : '»'}
        </button>
        {drawerOpen && (
          <>
            <span className="font-bold text-slate-800 text-sm shrink-0">
              {drawerMode === 'nav' ? '七大系统' : 'AI对话'}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => dispatch({ type: 'TOGGLE_DRAWER_MODE' })}
              className="px-2 py-1 text-xs rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 touch-feedback shrink-0"
            >
              {drawerMode === 'nav' ? '切换到AI对话' : '切换到导航'}
            </button>
          </>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {drawerMode === 'nav' ? (
          <NavContent collapsed={!drawerOpen} />
        ) : (
          /* 阶段1：统一使用新版真实 DeepSeek AI 面板（embedded 内嵌模式） */
          drawerOpen && <AIChatSidebar embedded />
        )}
      </div>
    </aside>
  )
}

function NavContent({ collapsed }) {
  const dispatch = useAppDispatch()
  const { settings, ui } = useAppState()
  const navigate = useNavigate()
  const [richengOpen, setRichengOpen] = useState(true)  // 任务日程子菜单默认展开，用户一眼可见
  const [editingId, setEditingId] = useState(null)       // 正在重命名的系统 id
  const [editingValue, setEditingValue] = useState('')

  // 实际生效的 7 系统数组（优先自定义名）
  const systems = useMemo(() => getSEVEN_SYSTEMS_EFFECTIVE(settings), [settings])
  const sysById = useMemo(() => {
    const m = new Map()
    systems.forEach(s => m.set(s.id, s))
    return m
  }, [systems])

  // 开始重命名
  const startEdit = (id, currentName, e) => {
    if (e) e.stopPropagation()
    setEditingId(id)
    setEditingValue(currentName)
  }
  // 提交重命名
  const commitEdit = () => {
    if (!editingId) return
    const next = { ...(settings.customSystemNames || {}) }
    const trimmed = editingValue.trim()
    if (trimmed) next[editingId] = trimmed
    else delete next[editingId]
    dispatch({ type: 'UPDATE_SETTINGS', payload: { customSystemNames: next } })
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: trimmed ? `✅ 已重命名为：${trimmed}` : '已恢复默认名称' } })
    setEditingId(null)
    setEditingValue('')
  }
  // 取消编辑
  const cancelEdit = () => {
    setEditingId(null)
    setEditingValue('')
  }
  // 一键恢复默认
  const restoreDefaults = () => {
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '恢复 7 系统默认名称？',
        message: '所有自定义命名将被清除，回到：身体状态 / 情绪与心理 / 能力成长 等默认名称。是否继续？',
        okText: '恢复默认',
        onOk: () => {
          dispatch({ type: 'UPDATE_SETTINGS', payload: { customSystemNames: {} } })
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已恢复 7 系统默认名称' } })
        }
      }
    })
  }
  // 跳转子路由 + 设置 activeTab
  const go = (path, tabId) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tabId })
    navigate(path)
  }

  return (
    <div className="py-2 relative">
      {NAV_GROUPS.map(group => (
        <div key={group.groupTitle} className="mb-2.5 last:mb-1">
          {/* 分组标题（仅展开时可见，折叠时省略） */}
          {!collapsed && (
            <div className="px-4 pt-2 pb-1">
              <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{group.groupTitle}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{group.subtitle}</div>
            </div>
          )}
          {/* 分组内菜单项 */}
          <div className="px-2 space-y-0.5">
            {group.ids.map(id => {
              const sys = sysById.get(id)
              if (!sys) return null
              const isRicheng = id === 'richeng'
              const isEditing = editingId === id

              return (
                <div key={id}>
                  {/* 7 系统菜单行 */}
                  <div
                    className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl touch-feedback transition-colors cursor-default ${
                      isRicheng && richengOpen
                        ? 'bg-indigo-50/60 text-indigo-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => { if (isRicheng) setRichengOpen(o => !o) }}
                  >
                    {/* 图标 */}
                    <span className="w-6 h-6 shrink-0 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center text-base">
                      {sys.icon}
                    </span>
                    {/* 名称（折叠模式省略） */}
                    {!collapsed && !isEditing && (
                      <div className="flex-1 text-sm font-semibold truncate">{sys.name}</div>
                    )}
                    {!collapsed && isEditing && (
                      <input
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-1 rounded-md border border-indigo-300 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {/* 任务日程父菜单：展开/折叠小箭头（仅展开模式） */}
                    {!collapsed && isRicheng && !isEditing && (
                      <span className={`shrink-0 text-[10px] text-slate-400 transition-transform ${richengOpen ? 'rotate-0' : '-rotate-90'}`}>▾</span>
                    )}
                    {/* 重命名铅笔（hover 才出现；折叠模式不可编辑） */}
                    {!collapsed && !isEditing && (
                      <button
                        className="shrink-0 w-6 h-6 rounded-md text-slate-400 hover:bg-white hover:text-indigo-600 hover:border hover:border-indigo-100 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity touch-feedback"
                        title={`重命名「${sys.name}」`}
                        onClick={(e) => startEdit(id, sys.name, e)}
                      >✏️</button>
                    )}
                  </div>
                  {/* 任务日程子菜单（3 大路由：日常打卡 / 长期规划 / 历史复盘） */}
                  {isRicheng && richengOpen && !collapsed && (
                    <div className="ml-5 mt-0.5 mb-1 space-y-0.5 pl-3 border-l border-slate-100">
                      {RICHENG_SUB_ROUTES.map(sub => (
                        <button
                          key={sub.id}
                          onClick={() => go(sub.path, sub.tab)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left touch-feedback transition-colors ${
                            ui.activeTab === sub.tab
                              ? 'bg-indigo-500/10 text-indigo-700 font-semibold'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-sm w-5 text-center shrink-0">{sub.icon}</span>
                          <span className="text-sm truncate">{sub.name}</span>
                          {ui.activeTab === sub.tab && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* 底部：恢复默认命名（仅展开模式） */}
      {!collapsed && (
        <div className="px-4 pt-2 mt-2 border-t border-slate-100">
          <button
            onClick={restoreDefaults}
            className="w-full text-[10px] text-slate-400 hover:text-indigo-600 py-1.5 touch-feedback leading-tight"
          >💡 恢复 7 系统默认名称</button>
        </div>
      )}
    </div>
  )
}
