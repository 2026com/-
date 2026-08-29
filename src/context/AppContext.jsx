import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import { storage, uid, calcProgress } from '../utils/storage.js'
import { STORAGE_KEYS, DEFAULT_SETTINGS, SEVEN_SYSTEMS, DATA_VERSION } from '../utils/constants.js'
import { initMockData } from '../data/mockData.js'
import { ensureNotifyPermission, notifyNow, notifyNativeNow, fireNativeDueNow, playAlertSound, initNativeNotifications, scheduleNativeNotification, cancelNativeNotification } from '../utils/notify.js'
import { bootInitialState, readAllState } from './appStorage.js'
import { dailyTasksReducer } from './reducers/dailyTasksReducer.js'
import { reviewReducer } from './reducers/reviewReducer.js'
import { aiAssistantReducer } from './reducers/aiAssistantReducer.js'
import { skillTreeReducer } from './reducers/skillTreeReducer.js'
import { financeReducer } from './reducers/financeReducer.js'
import { socialGraphReducer } from './reducers/socialGraphReducer.js'
import { knowledgeBaseReducer } from './reducers/knowledgeBaseReducer.js'
import { healthReducer } from './reducers/healthReducer.js'
import { mindCommunityReducer } from './reducers/mindCommunityReducer.js'
import { collectAllDescendantIds, recalcParentProgress } from './reducers/nodeHelpers.js'

const AppStateContext = createContext(null)
const AppDispatchContext = createContext(null)


function reducer(state, action) {
  // ====== 拆分迁移：领域 reducer 链式分发（命中即返回；未命中依次透传，与原单 switch 语义一致） ======
  const h = dailyTasksReducer(state, action); if (h !== state) return h
  const r = reviewReducer(state, action); if (r !== state) return r
  const a = aiAssistantReducer(state, action); if (a !== state) return a
  // 系统二~七：占位 reducer（恒等返回，接入实际功能后在此实现各自领域 state 更新）
  const s1 = skillTreeReducer(state, action); if (s1 !== state) return s1
  const s2 = financeReducer(state, action); if (s2 !== state) return s2
  const s3 = socialGraphReducer(state, action); if (s3 !== state) return s3
  const s4 = knowledgeBaseReducer(state, action); if (s4 !== state) return s4
  const s5 = healthReducer(state, action); if (s5 !== state) return s5
  const s6 = mindCommunityReducer(state, action); if (s6 !== state) return s6
  switch (action.type) {
    case 'UPDATE_SETTINGS': {
      const s = { ...state.settings, ...action.payload }
      storage.set(STORAGE_KEYS.SETTINGS, s)
      return { ...state, settings: s }
    }
    case 'TOGGLE_DRAWER_MODE': {
      const mode = state.settings.drawerMode === 'nav' ? 'ai' : 'nav'
      const s = { ...state.settings, drawerMode: mode }
      storage.set(STORAGE_KEYS.SETTINGS, s)
      return { ...state, settings: s }
    }
    case 'TOGGLE_DRAWER': {
      const s = { ...state.settings, drawerOpen: !state.settings.drawerOpen }
      storage.set(STORAGE_KEYS.SETTINGS, s)
      return { ...state, settings: s }
    }
    case 'SET_ACTIVE_TAB':
      return { ...state, ui: { ...state.ui, activeTab: action.payload } }
    case 'SET_SELECTED_NODE':
      return { ...state, ui: { ...state.ui, selectedNodeId: action.payload } }

    // 节点操作
    case 'ADD_NODE': {
      // W3/W4：创建节点默认绑定到具体某一天的时间轴位置
      const today = new Date(); today.setHours(0,0,0,0)
      const isoToday = today.toISOString().slice(0, 10)
      const estHours = Number(action.payload.estimatedHours) || 2
      const estDays = Math.max(1, Math.ceil(estHours / 4))
      const dueDateObj = new Date(today.getTime() + estDays * 86400000)
      const isoDue = dueDateObj.toISOString().slice(0, 10)
      const payloadExtra = {
        startDate: action.payload.startDate || isoToday,
        dueDate:   action.payload.dueDate   || isoDue,
      }
      const newNode = { id: uid('node'), ...payloadExtra, ...action.payload, createdAt: action.payload.createdAt || Date.now() }
      const nodes = [...state.nodes, newNode]
      // 若有父节点，更新父级进度
      if (action.payload.parentId) {
        recalcParentProgress(nodes, action.payload.parentId, state.settings.progressMode)
      }
      storage.set(STORAGE_KEYS.NODES, nodes)
      // [修复] 新节点创建成功后：标记待滚动定位（MindMapCanvas 消费后清除）。
      // 除非调用方显式 focusScroll:false（例如 AI 批量生成，视图交给 AUTO_EXPAND/focusPlan 接管）。
      if (action.payload.focusScroll !== false) {
        return { ...state, nodes, ui: { ...state.ui, focusNodeId: newNode.id } }
      }
      return { ...state, nodes }
    }
    // [修复] 外部手动设置待聚焦节点（例如创建后需要定位）
    case 'SET_FOCUS_NODE': {
      return { ...state, ui: { ...state.ui, focusNodeId: action.payload || null } }
    }
    case 'CLEAR_FOCUS_NODE': {
      if (!state.ui.focusNodeId) return state
      return { ...state, ui: { ...state.ui, focusNodeId: null } }
    }
    case 'UPDATE_NODE': {
      const nodes = state.nodes.map(n => n.id === action.id ? { ...n, ...action.payload } : n)
      const target = nodes.find(n => n.id === action.id)
      if (target && target.parentId) {
        recalcParentProgress(nodes, target.parentId, state.settings.progressMode)
      }
      storage.set(STORAGE_KEYS.NODES, nodes)
      return { ...state, nodes }
    }
    case 'DELETE_NODE': {
      const ids = collectAllDescendantIds(state.nodes, action.id)
      const nodes = state.nodes.filter(n => !ids.has(n.id))
      storage.set(STORAGE_KEYS.NODES, nodes)
      return { ...state, nodes, ui: { ...state.ui, selectedNodeId: null } }
    }
    // 画布自动布局/批量替换节点（不进撤销栈，仅布局计算或初始化用）
    case 'REPLACE_NODES': {
      const newNodes = Array.isArray(action.payload) ? action.payload : state.nodes
      storage.set(STORAGE_KEYS.NODES, newNodes)
      return { ...state, nodes: newNodes }
    }
    // V5：AI 三层嵌套执行方案 —— 一次性批处理写入：根节点元信息（routeTitle/Subtitle）
    // + 3 个阶段节点（前期/中期/后期）+ 每阶段步骤节点（编号+名称+知识点数量）
    // + 每步骤 3 个详细板块（知识点清单/学习建议/达成标准）+ 板块下的具体条目；
    // 保证父子节点 ID 连续落盘、父子 parentId 100% 正确。
    case 'ADD_ROUTE_TREE': {
      const undo = { nodes: JSON.parse(JSON.stringify(state.nodes)) }
      const nodes = state.nodes.slice()
      const rootNode = nodes.find(n => n.id === action.rootNodeId)
      if (!rootNode) return state
      const route = action.route || {}
      const baseISO = String(action.baseISO || new Date().toISOString().slice(0, 10))
      const startISO = String(action.overrideStartDate || rootNode.startDate || rootNode.dueDate || baseISO)
      // 容错日期解析：只取「YYYY-MM-DD」日期部分（兼容带时间 T / 斜杠 / 空格等格式），解析失败回退今天，杜绝 Invalid time value
      const dateOnlyMatch = String(startISO).match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
      const baseObj = dateOnlyMatch
        ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
        : (() => { const d = new Date(startISO); return isNaN(d.getTime()) ? new Date() : d })()
      baseObj.setHours(0, 0, 0, 0)
      const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x }
      const iso = (d) => d.toISOString().slice(0,10)
      const sysId = action.systemId || rootNode.systemId || 'zhuye'
      const parentLevel = Number(action.parentLevel ?? (rootNode.level||0))
      const parentXY = action.parentNodeXY || { x: rootNode.x||0, y: rootNode.y||0 }
      const phases = Array.isArray(route.phases) ? route.phases.slice(0,3) : []
      while (phases.length < 3) phases.push({
        stage: (['early','middle','late'])[phases.length],
        phaseLabel: (['前期','中期','后期'])[phases.length],
        nodeTitle: (['前期','中期','后期'])[phases.length],
        days: 30,
        steps: [],
      })
      // 1) 更新根节点元数据（写路线字段 + hasRoute=true + startDate 保底）
      const rootIdx = nodes.findIndex(n => n.id === action.rootNodeId)
      nodes[rootIdx] = {
        ...rootNode,
        startDate: rootNode.startDate || startISO,
        routeTitle:    route.routeTitle    || rootNode.routeTitle,
        routeSubtitle: route.routeSubtitle || rootNode.routeSubtitle,
        routeFinalFlag:route.finalFlag     || rootNode.routeFinalFlag,
        routeMantra:   Array.isArray(route.mantra) ? route.mantra.slice(0,6) : (rootNode.routeMantra || []),
        hasRoute:      true,
      }
      // 2) 3 阶段累计日区间 + 生成节点树
      let cursor = 0
      const phaseIds = []
      const phaseRecs = phases.map((ph, i) => {
        const days = Math.max(1, Number(ph.days) || 30)
        const rec = {
          phase: ph,
          stage:      ph.stage      || (['early','middle','late'])[i],
          phaseLabel: ph.phaseLabel || (['前期','中期','后期'])[i],
          nodeTitle:  ph.nodeTitle  || (['前期','中期','后期'])[i],
          steps:      Array.isArray(ph.steps) ? ph.steps : [],
          startDay: cursor,
          endDay: cursor + days - 1,
          days,
        }
        cursor += days
        return rec
      })
      phaseRecs.forEach((m, i) => {
        // 阶段节点（第一层）：固定名「前期/中期/后期」
        const sid = uid('node')
        phaseIds.push(sid)
        nodes.push({
          id: sid,
          parentId: action.rootNodeId,
          systemId: sysId,
          title: m.nodeTitle,
          phaseLabel: m.phaseLabel,
          stagePhase: m.stage,
          status: 'todo', progress: 0,
          x: parentXY.x + 200 + i * 380,
          y: parentXY.y + (i - 1) * 4,
          level: parentLevel + 1,
          startDate: iso(addDays(baseObj, m.startDay)),
          dueDate:   iso(addDays(baseObj, m.endDay)),
          estimatedHours: Math.max(10, m.days * 4),
          difficulty: 1, value: 1, weight: 20,
          isRouteStageNode: true,
          createdAt: Date.now(),
        })
        // 步骤节点（第二层）：编号 + 名称 + 知识点数量
        const steps = m.steps
        const stepBaseEst = Math.max(3, Math.ceil(m.days * 4 / Math.max(1, steps.length)))
        steps.forEach((step, j) => {
          const stepId = uid('node')
          const stepName = String(step.name || '')
          const stepPoints = Math.max(1, Number(step.points) || (Array.isArray(step.items) ? step.items.length : 0) || 5)
          // 步骤标题直接用「主要学习内容 + 知识点数量」；先后顺序按主轴上的日期距离判断，不再用「第X步」编号
          const stepTitle = `${stepName}（${stepPoints}个知识点）`.trim() || '未命名步骤'
          // 步骤日期在该阶段区间内均匀分布（步骤 1 靠前、步骤 N 靠后），画布上横向错开不重叠
          const total = Math.max(1, steps.length)
          const stepStart = m.startDay + Math.floor((j * m.days) / total)
          const stepEnd   = m.startDay + Math.floor(((j + 1) * m.days) / total) - 1
          const sStartISO = iso(addDays(baseObj, stepStart))
          const sEndISO   = iso(addDays(baseObj, Math.max(stepStart, stepEnd)))
          nodes.push({
            id: stepId,
            parentId: sid,
            systemId: sysId,
            title: stepTitle,
            status: 'todo', progress: 0,
            x: parentXY.x + 300 + j * 30,
            y: parentXY.y + 70 + j * 90,
            level: parentLevel + 2,
            startDate: sStartISO,
            dueDate:   sEndISO,
            estimatedHours: stepBaseEst,
            difficulty: 1, value: 1, weight: 10,
            createdAt: Date.now(),
          })
          // 详细内容（第三层）：知识点清单 / 学习建议 / 达成标准 三个板块
          const sections = [
            { title: '📚 知识点清单', items: Array.isArray(step.items) ? step.items : [] },
            { title: '💡 学习建议',  items: step.advice ? [String(step.advice)] : [] },
            { title: '🏁 达成标准',  items: step.standard ? [String(step.standard)] : [] },
          ].filter(sec => sec.items.length > 0)
          sections.forEach((sec, k) => {
            const secId = uid('node')
            nodes.push({
              id: secId,
              parentId: stepId,
              systemId: sysId,
              title: sec.title,
              status: 'todo', progress: 0,
              x: parentXY.x + 420,
              y: parentXY.y + 60 + j * 90 + (k + 1) * 46,
              level: parentLevel + 3,
              startDate: sStartISO,
              dueDate:   sEndISO,
              estimatedHours: 2, difficulty: 1, value: 1, weight: 5,
              createdAt: Date.now(),
            })
            sec.items.forEach((it, q) => {
              nodes.push({
                id: uid('node'),
                parentId: secId,
                systemId: sysId,
                title: String(it),
                status: 'todo', progress: 0,
                x: parentXY.x + 520,
                y: parentXY.y + 60 + j * 90 + (k + 1) * 46 + (q + 1) * 34,
                level: parentLevel + 4,
                startDate: sStartISO,
                dueDate:   sEndISO,
                estimatedHours: 1, difficulty: 1, value: 1, weight: 3,
                createdAt: Date.now(),
              })
            })
          })
        })
      })
      storage.set(STORAGE_KEYS.NODES, nodes)
      return {
        ...state,
        nodes,
        // 默认只显示第一层（阶段）+ 第二层（步骤）：自动展开根节点与阶段节点，步骤仍收起
        ui: {
          ...state.ui,
          autoExpandIds: [action.rootNodeId, ...phaseIds],
          // 生成后让幕布自动适配到方案时间范围（minDay=0 今天为起点）
          focusPlan: { minDay: 0, maxDay: Math.max(6, cursor - 1), at: Date.now() },
          undoStack: [...state.ui.undoStack, undo],
          redoStack: [],
        }
      }
    }
    // V5：追加需要自动展开的节点（AI 在阶段下生成步骤 / 在步骤下生成详情后调用）
    case 'AUTO_EXPAND': {
      const ids = Array.isArray(action.payload) ? action.payload : (action.payload ? [action.payload] : [])
      if (ids.length === 0) return state
      const merged = Array.from(new Set([...(state.ui.autoExpandIds || []), ...ids]))
      return { ...state, ui: { ...state.ui, autoExpandIds: merged } }
    }
    case 'CLEAR_AUTO_EXPAND': {
      if (!state.ui.autoExpandIds || state.ui.autoExpandIds.length === 0) return state
      return { ...state, ui: { ...state.ui, autoExpandIds: [] } }
    }
    case 'CLEAR_FOCUS_PLAN': {
      if (!state.ui.focusPlan) return state
      return { ...state, ui: { ...state.ui, focusPlan: null } }
    }
    // 保存某幕布的视图快照（精确到位置/缩放/展开）
    case 'SAVE_CANVAS_VIEW': {
      const { canvasId, view } = action.payload || {}
      if (!canvasId) return state
      return {
        ...state,
        ui: {
          ...state.ui,
          canvasViews: { ...(state.ui.canvasViews || {}), [canvasId]: { ...(state.ui.canvasViews?.[canvasId] || {}), ...(view || {}) } },
        }
      }
    }
    // 切换幕布：保存当前幕布视图 → 激活目标幕布 → 标记待恢复目标视图
    case 'SWITCH_CANVAS': {
      const { fromId, toId, fromView } = action.payload || {}
      if (!toId || toId === state.ui.activeCanvasId) return state
      const canvasViews = { ...(state.ui.canvasViews || {}) }
      if (fromId && fromView) canvasViews[fromId] = { ...(canvasViews[fromId] || {}), ...fromView }
      return {
        ...state,
        ui: {
          ...state.ui,
          canvasViews,
          activeCanvasId: toId,
          pendingCanvasView: { canvasId: toId, view: canvasViews[toId] || null },
        }
      }
    }
    case 'CLEAR_PENDING_CANVAS_VIEW': {
      if (!state.ui.pendingCanvasView) return state
      return { ...state, ui: { ...state.ui, pendingCanvasView: null } }
    }
    // 新建幕布后：聚焦到新根节点（视图切到新幕布）
    case 'SET_FOCUS_ROOT': {
      return { ...state, ui: { ...state.ui, focusRootId: action.payload || null } }
    }
    case 'CLEAR_FOCUS_ROOT': {
      if (!state.ui.focusRootId) return state
      return { ...state, ui: { ...state.ui, focusRootId: null } }
    }
    // 切换当前幕布（null=显示全部）
    case 'SET_ACTIVE_CANVAS': {
      return { ...state, ui: { ...state.ui, activeCanvasId: action.payload || null } }
    }
    case 'AI_RESTRUCTURE_NODES': {
      // 重构前保存撤销栈
      const undo = { nodes: JSON.parse(JSON.stringify(state.nodes)) }
      const newState = {
        ...state,
        nodes: action.payload,
        ui: { ...state.ui, undoStack: [...state.ui.undoStack, undo], redoStack: [] }
      }
      storage.set(STORAGE_KEYS.NODES, action.payload)
      return newState
    }
    case 'UNDO_NODES': {
      if (state.ui.undoStack.length === 0) return state
      const undo = state.ui.undoStack[state.ui.undoStack.length - 1]
      const newUndo = state.ui.undoStack.slice(0, -1)
      const redo = { nodes: JSON.parse(JSON.stringify(state.nodes)) }
      storage.set(STORAGE_KEYS.NODES, undo.nodes)
      return {
        ...state,
        nodes: undo.nodes,
        ui: { ...state.ui, undoStack: newUndo, redoStack: [...state.ui.redoStack, redo] }
      }
    }
    case 'REDO_NODES': {
      if (state.ui.redoStack.length === 0) return state
      const redo = state.ui.redoStack[state.ui.redoStack.length - 1]
      const newRedo = state.ui.redoStack.slice(0, -1)
      const undo = { nodes: JSON.parse(JSON.stringify(state.nodes)) }
      storage.set(STORAGE_KEYS.NODES, redo.nodes)
      return {
        ...state,
        nodes: redo.nodes,
        ui: { ...state.ui, undoStack: [...state.ui.undoStack, undo], redoStack: newRedo }
      }
    }

    // UI控制
    case 'TOGGLE_CALENDAR':
      return { ...state, ui: { ...state.ui, calendarOpen: !state.ui.calendarOpen } }
    case 'OPEN_CALENDAR':
      if (state.ui.calendarOpen) return state
      return { ...state, ui: { ...state.ui, calendarOpen: true } }
    case 'CLOSE_CALENDAR':
      if (!state.ui.calendarOpen) return state
      return { ...state, ui: { ...state.ui, calendarOpen: false } }
    case 'TOGGLE_DASHBOARD':
      return { ...state, ui: { ...state.ui, dashboardOpen: !state.ui.dashboardOpen } }
    case 'PUSH_MODAL':
      return { ...state, ui: { ...state.ui, modalStack: [...state.ui.modalStack, action.payload] } }
    case 'POP_MODAL':
      return { ...state, ui: { ...state.ui, modalStack: state.ui.modalStack.slice(0, -1) } }

    // 全量导入（备份恢复）
    case 'IMPORT_ALL': {
      const { payload } = action
      Object.entries(payload).forEach(([k, v]) => storage.set(k, v))
      // 拆分迁移：全量状态重建读取 → appStorage.readAllState（逻辑等价）
      return readAllState(state.ui)
    }

    default:
      return state
  }
}
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, bootInitialState)

  // ========= T2：闹钟提醒轮询（节点闹钟 + 习惯提醒 + 临时任务提醒，全局只跑一份 interval）=========
  // 节点闹钟 reminder 结构：{ enabled, isoTime (YYYY-MM-DDTHH:mm), notified:boolean }（持久化在节点上）
  // 习惯 reminder = "HH:MM" 字符串；临时任务 reminderTime = "HH:MM" + reminder:boolean
  // 触发时：页面内弹 Modal + 页面在后台时发系统通知（PWA 通知权限）
  const stateRef = useRef(state)
  stateRef.current = state
  const pollTimerRef = useRef(null)
  const nextTimeoutRef = useRef(null)
  useEffect(() => {
    // 首次用户交互时申请系统通知权限（浏览器要求尽量在手势里请求）
    const requestPerm = () => ensureNotifyPermission()
    window.addEventListener('pointerdown', requestPerm, { once: true })
    window.addEventListener('keydown', requestPerm, { once: true })
    // 原生（Capacitor/APK）：初始化通知渠道（Android 8+，幂等）
    initNativeNotifications()
    // ===== 原生未来提醒调度：把 48h 内的提醒注册到 Android 系统时钟，
    // 锁屏、应用被杀也能准时触发（PWA 纯前端无法做到）=====
    const nativeScheduled = new Set()
    let nativeSyncing = false
    const isCapRun = () => {
      try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) } catch (e) { return false }
    }
    const syncNativeReminders = async () => {
      const s = stateRef.current
      if (!s) return
      if (!isCapRun()) return
      if (nativeSyncing) return
      nativeSyncing = true
      try {
        const now = Date.now()
        const HORIZON = 48 * 3600000
        const today0 = new Date(); today0.setHours(0, 0, 0, 0)
        const target = new Map() // key -> { title, body, at }
        // 1) 节点闹钟（isoTime 未来 48h 内）
        ;(s.nodes || []).forEach(n => {
          const r = n.reminder
          if (!r || !r.enabled || r.notified || !r.isoTime) return
          const m = String(r.isoTime).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
          if (!m) return
          const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0).getTime()
          if (!Number.isNaN(d) && d > now && d < now + HORIZON) {
            target.set('node:' + n.id, { title: '🔔 节点闹钟提醒', body: `任务「${n.title || '未命名节点'}」到达设定时间 ${new Date(d).toLocaleString()}，请及时开始或延后。`, at: d })
          }
        })
        // 2) 习惯提醒 + 3) 临时任务提醒（HH:mm → 今天/明天最近一次）
        const hmMs = (hm) => {
          const m2 = String(hm).match(/^(\d{2}):(\d{2})$/)
          if (!m2) return null
          return Number(m2[1]) * 3600000 + Number(m2[2]) * 60000
        }
        const nextHmTs = (hm) => {
          const ms = hmMs(hm)
          if (ms == null) return null
          let t = today0.getTime() + ms
          if (t <= now) t += 86400000
          return (t < now + HORIZON) ? t : null
        }
        ;(s.habits || []).forEach(h => {
          if (!h.reminder) return
          const t = nextHmTs(h.reminder)
          if (t) target.set('habit:' + h.id, { title: '🔔 打卡提醒', body: `「${h.title || '未命名任务'}」到了提醒时间 ${h.reminder}，记得完成打卡哦。`, at: t })
        })
        ;(s.tempTasks || []).forEach(t => {
          if (!t.reminderTime || t.reminder === false || t.done) return
          const ts = nextHmTs(t.reminderTime)
          if (ts) target.set('temp:' + t.id, { title: '🔔 临时任务提醒', body: `「${t.title || '未命名任务'}」到了提醒时间 ${t.reminderTime}，记得完成哦。`, at: ts })
        })
        // 4) 进行中的番茄钟（结束时提醒）
        const act = [...(s.timerRecords || [])].reverse().find(x => !x.done)
        if (act && act.type === 'pomodoro') {
          const startAt = act.started ? Date.parse(act.started) : Date.now()
          const endAt = (Number.isNaN(startAt) ? Date.now() : startAt) + (act.minutes || 25) * 60000
          if (endAt > now && endAt < now + HORIZON) {
            const nm = (s.nodes || []).find(n => n.id === act.nodeId)?.title || '自由任务'
            target.set('timer:' + act.id, { title: '🍅 番茄钟结束', body: `「${nm}」${act.minutes || 25} 分钟专注完成，休息一下吧`, at: endAt })
          }
        }
        // 差集同步：先取消已失效，再调度新增
        const toCancel = [...nativeScheduled].filter(k => !target.has(k))
        const toAdd = [...target.keys()].filter(k => !nativeScheduled.has(k))
        for (const k of toCancel) {
          try { await cancelNativeNotification(k) } catch (e) { /* ignore */ }
          nativeScheduled.delete(k)
        }
        for (const k of toAdd) {
          const ev = target.get(k)
          const ok = await scheduleNativeNotification({ id: k, title: ev.title, body: ev.body, at: ev.at })
          if (ok) nativeScheduled.add(k)
        }
      } catch (e) { /* 原生同步失败静默（网页环境会因 isCapRun 提前返回） */ }
      finally { nativeSyncing = false }
    }
    const checkDue = async () => {
      const now = Date.now()
      const s = stateRef.current
      if (!s) return
      if (s.settings?.reminderEnabled === false) return // 设置里关闭提醒 → 不扫描不打扰
      const nodes = s.nodes || []
      const habits = s.habits || []
      const tempTasks = s.tempTasks || []
      const today0 = new Date(); today0.setHours(0, 0, 0, 0)
      const pad2 = (x) => String(x).padStart(2, '0')
      const todayStr = `${today0.getFullYear()}-${pad2(today0.getMonth() + 1)}-${pad2(today0.getDate())}`
      const hmDue = (hm) => {
        const m = String(hm).match(/^(\d{2}):(\d{2})$/)
        if (!m) return false
        return now >= today0.getTime() + (Number(m[1]) * 3600000 + Number(m[2]) * 60000)
      }
      const toMark = []
      // 1) 节点闹钟
      nodes.forEach(n => {
        const r = n.reminder
        if (!r || !r.enabled || r.notified || !r.isoTime) return
        // isoTime 格式是 YYYY-MM-DDTHH:mm（本地时区的 datetime-local），转成本地时间戳
        const m = String(r.isoTime).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
        if (!m) return
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0)
        const due = d.getTime()
        if (!Number.isNaN(due) && now >= due) toMark.push({ id: n.id, title: n.title, isoTime: r.isoTime, kind: 'node' })
      })
      // 2) 习惯提醒（今日该时刻已到，且今天未提醒过）
      habits.forEach(h => {
        if (!h.reminder || h._notifiedDate === todayStr) return
        if (hmDue(h.reminder)) toMark.push({ id: h.id, title: h.title, hm: h.reminder, kind: 'habit' })
      })
      // 3) 临时任务提醒
      tempTasks.forEach(t => {
        if (!t.reminderTime || t.reminder === false || t.done || t._notifiedDate === todayStr) return
        if (hmDue(t.reminderTime)) toMark.push({ id: t.id, title: t.title, hm: t.reminderTime, kind: 'temp' })
      })
      if (toMark.length === 0) return
      // 标记已提醒（走 reducer 双写持久化，避免 15s 轮询重复弹）
      toMark.forEach(item => {
        if (item.kind === 'node') {
          dispatch({ type: 'UPDATE_NODE', id: item.id, payload: { reminder: { ...((stateRef.current.nodes || []).find(n => n.id === item.id)?.reminder || {}), notified: true } } })
        } else if (item.kind === 'habit') {
          dispatch({ type: 'UPDATE_HABIT', id: item.id, payload: { _notifiedDate: todayStr } })
        } else if (item.kind === 'temp') {
          dispatch({ type: 'UPDATE_TEMP_TASK', id: item.id, payload: { _notifiedDate: todayStr } })
        }
      })
      // 页面内弹提醒；系统通知的声音路径分环境：
      // - APK：立即触发原生到期扫描（弹出 pending 中「已到期且闹钟未触发过」的条目，防双响）；
      //   原生扫描失败再降级为直弹通知（同一渠道，实测有声）。
      //   [修复] 此前走 notifyNow（1 秒后闹钟路径），K60 上 setAlarmClock 被 ROM 吞 →
      //   到点只有应用内弹窗、系统通知永远不来（无声）。
      // - PWA：页面不可见/未聚焦时弹浏览器系统通知。
      const toFire = []
      toMark.forEach(item => {
        const title = item.kind === 'node' ? '🔔 节点闹钟提醒' : '🔔 打卡提醒'
        const message = item.kind === 'node'
          ? `任务「${item.title || '未命名节点'}」到达设定时间：${formatReminderTime(item.isoTime)}，请及时开始或延后。`
          : `「${item.title || '未命名任务'}」到了提醒时间 ${item.hm}，记得完成打卡哦。`
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'alert', title, message } })
        toFire.push({ title, message })
      })
      // 微信式前台提示音：与通知渠道/闹钟/权限完全解耦，App 在前台时直接播放（必响）。
      // 这就是微信/QQ 收到消息那声"叮"的实现方式——不依赖系统放行。
      playAlertSound()
      if (isCapRun()) {
        const fired = await fireNativeDueNow()
        if (!fired) toFire.forEach(x => notifyNativeNow(x.title, x.message))
      } else {
        toFire.forEach(x => notifyNow(x.title, x.message))
      }
      // 原生壳（APK）：把未来提醒同步注册到 Android 系统时钟（锁屏/杀进程可靠触发）
      syncNativeReminders()
    }
    // [修复] 启动：立即执行一次，然后使用精确 setTimeout 调度
    // 代替 setInterval（浏览器在后台 tab 会大幅节流 setInterval 至 1 次/分钟）
    const scheduleNext = () => {
      const now = Date.now()
      const msUntilNext = 15000 - (now % 15000) + 100
      if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current)
      nextTimeoutRef.current = setTimeout(() => {
        checkDue()
        scheduleNext()
      }, Math.max(1000, msUntilNext))
    }
    checkDue()
    scheduleNext()
    return () => {
      if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current)
      window.removeEventListener('pointerdown', requestPerm)
      window.removeEventListener('keydown', requestPerm)
    }
    // 只在 mount/unmount 周期启动/停止，内部用 stateRef 拿最新 nodes
  }, [])

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  )
}

// T2：提醒时间的 iso(YYYY-MM-DDTHH:mm) → 用户可读（2026/08/15 19:30）
function formatReminderTime(iso) {
  if (!iso) return '—'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return String(iso)
  return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`
}

export const useAppState = () => {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used in AppProvider')
  return ctx
}
export const useAppDispatch = () => {
  const ctx = useContext(AppDispatchContext)
  if (!ctx) throw new Error('useAppDispatch must be used in AppProvider')
  return ctx
}
