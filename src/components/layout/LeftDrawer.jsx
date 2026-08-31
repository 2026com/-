import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { getSEVEN_SYSTEMS_EFFECTIVE } from '../../utils/constants.js'
import AIChatSidebar from '../../modules/ai-assistant/components/ChatInterface.jsx'
import { AccountPanel } from '../../modules/account/index.js'
import { getSession } from '../../modules/account/services/accountService.js'

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

// 七大系统 → 路由映射（点击系统菜单行跳转到右侧对应页面）
// 注意：richeng（任务日程）为父菜单，点击只展开/折叠子菜单，不直接跳转
const SYSTEM_ROUTES = {
  nengli:  { path: '/skill-tree',     tab: 'skill-tree' },
  renji:   { path: '/social-graph',   tab: 'social-graph' },
  caiwu:   { path: '/finance',        tab: 'finance' },
  richeng: { path: '',                tab: '',          submenu: true },
  zhishi:  { path: '/knowledge-base', tab: 'knowledge-base' },
  shenti:  { path: '/health',         tab: 'health' },
  qingxu:  { path: '/mind-community', tab: 'mind-community' },
}

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

  // 移动端（<768px）抽屉改为浮层覆盖（不挤压右侧内容，修复打卡界面被挤爆堆叠的问题）
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ===== 滑动返回手势：展开状态下在抽屉内「向右大幅滑动」收起 =====
  const swipeRef = useRef(null)
  const onDrawerTouchStart = (e) => {
    const t = e.touches[0]
    swipeRef.current = { x: t.clientX, y: t.clientY }
  }
  const onDrawerTouchEnd = (e) => {
    if (!swipeRef.current || !drawerOpen) return
    const t = e.changedTouches[0]
    const dx = t.clientX - swipeRef.current.x
    const dy = t.clientY - swipeRef.current.y
    swipeRef.current = null
    // 大幅横滑（>90px 且横向位移明显大于纵向）→ 收起抽屉
    if (dx > 90 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      dispatch({ type: 'TOGGLE_DRAWER' })
    }
  }

  // 收起：整条侧栏完全隐藏，只留一颗悬浮 » 按钮 —— 可拖动（避免挡住横线本等内容），位置记忆
  const [fabPos, setFabPos] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('goalFabPos') || 'null')
      if (v && typeof v.x === 'number' && typeof v.y === 'number') return v
    } catch (e) { /* ignore */ }
    return null // null = 默认位置（左上）
  })
  const fabDrag = useRef(null)
  if (!drawerOpen) {
    const FAB = 40
    const onFabDown = (e) => {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      const r = e.currentTarget.getBoundingClientRect()
      fabDrag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, lx: e.clientX, ly: e.clientY, moved: false }
    }
    const onFabMove = (e) => {
      const d = fabDrag.current
      if (!d) return
      if (!d.moved && Math.abs(e.clientX - d.lx) + Math.abs(e.clientY - d.ly) > 6) d.moved = true
      if (!d.moved) return
      const x = Math.min(window.innerWidth - FAB - 4, Math.max(4, e.clientX - d.dx))
      const y = Math.min(window.innerHeight - FAB - 4, Math.max(4, e.clientY - d.dy))
      setFabPos({ x, y })
    }
    const onFabUp = () => {
      const d = fabDrag.current
      fabDrag.current = null
      if (!d) return
      if (!d.moved) { dispatch({ type: 'TOGGLE_DRAWER' }); return }   // 未移动 = 点击 → 展开
      setFabPos(p => {
        const pos = p || { x: 6, y: 56 }
        try { localStorage.setItem('goalFabPos', JSON.stringify(pos)) } catch (err) { /* ignore */ }
        return pos
      })
    }
    return (
      <button
        onPointerDown={onFabDown}
        onPointerMove={onFabMove}
        onPointerUp={onFabUp}
        onPointerCancel={onFabUp}
        className="fixed z-20 w-10 h-10 rounded-xl bg-white/95 border border-slate-200 shadow-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center text-base select-none"
        style={{ left: fabPos ? fabPos.x : 6, top: fabPos ? fabPos.y : 56, touchAction: 'none' }}
        title="拖动调整位置 · 点击展开菜单"
        aria-label="展开菜单"
      >»</button>
    )
  }

  const width = isMobile
    ? (drawerMode === 'ai' ? 'min(85vw, 380px)' : 'min(78vw, 280px)')
    : (drawerMode === 'ai' ? 380 : 248)

  return (
    <>
      {/* 移动端展开时的半透明遮罩（点击空白收起，抽屉为浮层不挤压内容） */}
      {isMobile && (
        <div
          className="absolute inset-0 bg-slate-900/25 z-30"
          onClick={() => dispatch({ type: 'TOGGLE_DRAWER' })}
          aria-hidden="true"
        />
      )}
      <aside
        onTouchStart={onDrawerTouchStart}
        onTouchEnd={onDrawerTouchEnd}
        className={`drawer-transition h-full bg-white border-r border-slate-200 flex flex-col overflow-hidden ${
          isMobile ? 'absolute inset-y-0 left-0 shadow-2xl z-40' : 'relative z-20'
        }`}
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
            {/* AI 对话全屏开关（纯新增）：点击广播事件，全屏状态与渲染由 ChatInterface 自己处理 */}
            {drawerMode === 'ai' && (
              <button
                onClick={() => { try { window.dispatchEvent(new CustomEvent('app:ai-fullscreen-toggle')) } catch (e) { /* ignore */ } }}
                className="w-7 h-7 rounded-md hover:bg-slate-100 text-slate-600 hover:text-indigo-600 flex items-center justify-center touch-feedback shrink-0"
                title="全屏对话"
                aria-label="AI 对话全屏"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" />
                  <path d="M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>
            )}
            <button
              onClick={() => dispatch({ type: 'TOGGLE_DRAWER_MODE' })}
              className="px-2 py-1 text-xs rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 touch-feedback shrink-0"
            >
              {drawerMode === 'nav' ? '切换到AI对话' : '切换到导航'}
            </button>
          </>
        )}
      </div>

      {/* 内容区（收起时只显示顶部 » 按钮，用户点击即可展开完整抽屉） */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {drawerOpen && (drawerMode === 'nav' ? (
          <NavContent collapsed={false} />
        ) : (
          /* 阶段1：统一使用新版真实 DeepSeek AI 面板（embedded 内嵌模式） */
          <AIChatSidebar embedded />
        ))}
      </div>
    </aside>
    </>
  )
}

function NavContent({ collapsed }) {
  const dispatch = useAppDispatch()
  const { settings, ui } = useAppState()
  const navigate = useNavigate()
  const [richengOpen, setRichengOpen] = useState(true)  // 任务日程子菜单默认展开，用户一眼可见
  const [editingId, setEditingId] = useState(null)       // 正在重命名的系统 id
  const [editingValue, setEditingValue] = useState('')
  // 账号面板开关（账号系统模块 AccountPanel）+ 登录态标签（getSession 同步读内存镜像）
  const [showAccount, setShowAccount] = useState(false)
  const sess = getSession()
  const accountLabel = sess ? `账号：${sess.nickname}` : '登录 / 注册'

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
              // 系统路由：点击系统行跳转到右侧对应页面（任务日程为父菜单，仅展开子菜单）
              const route = SYSTEM_ROUTES[id]
              const isRouteActive = !!route && !!route.tab && ui.activeTab === route.tab
              const isActive = (isRicheng && richengOpen) || isRouteActive

              return (
                <div key={id}>
                  {/* 7 系统菜单行 */}
                  <div
                    className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl touch-feedback transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-50/60 text-indigo-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      if (isRicheng) { setRichengOpen(o => !o); return }
                      if (route) go(route.path, route.tab)
                    }}
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

      {/* 底部：账号入口 + 恢复默认命名（仅展开模式） */}
      {!collapsed && (
        <div className="px-4 pt-2 mt-2 border-t border-slate-100">
          <button
            onClick={() => setShowAccount(true)}
            className="w-full flex items-center gap-2 px-1 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 touch-feedback"
          >
            <span className="w-5 text-center shrink-0">👤</span>
            <span className="truncate">{accountLabel}</span>
          </button>
          <button
            onClick={restoreDefaults}
            className="w-full text-[10px] text-slate-400 hover:text-indigo-600 py-1.5 touch-feedback leading-tight"
          >💡 恢复 7 系统默认名称</button>
        </div>
      )}

      {/* 账号面板（登录/注册/云备份/恢复，账号系统模块） */}
      <AccountPanel open={showAccount} onClose={() => setShowAccount(false)} />
    </div>
  )
}
