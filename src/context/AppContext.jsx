import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import { storage, uid, calcProgress } from '../utils/storage.js'
import { STORAGE_KEYS, DEFAULT_SETTINGS, SEVEN_SYSTEMS, DATA_VERSION } from '../utils/constants.js'
import { initMockData } from '../data/mockData.js'

const AppStateContext = createContext(null)
const AppDispatchContext = createContext(null)

const initialState = () => {
  // 数据版本号不一致 → 结构升级 → 清除旧存储，强制重新加载最新mock示例数据
  const savedVersion = storage.get(STORAGE_KEYS.DATA_VERSION, '')
  if (savedVersion !== DATA_VERSION) {
    storage.clearAll()
    initMockData()
    storage.set(STORAGE_KEYS.DATA_VERSION, DATA_VERSION)
  } else {
    // 版本匹配，但首次启动仍需初始化数据（兼容老版本无DATA_VERSION的场景）
    const hasInit = storage.get(STORAGE_KEYS.SETTINGS)
    if (!hasInit) {
      initMockData()
      storage.set(STORAGE_KEYS.DATA_VERSION, DATA_VERSION)
    }
  }
  return {
    settings: storage.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
    nodes: storage.get(STORAGE_KEYS.NODES, []),
    habits: storage.get(STORAGE_KEYS.HABITS, []),
    tempTasks: storage.get(STORAGE_KEYS.TEMP_TASKS, []),
    checkins: storage.get(STORAGE_KEYS.CHECKINS, {}),
    timerRecords: storage.get(STORAGE_KEYS.TIMER_RECORDS, []),
    aiHistory: storage.get(STORAGE_KEYS.AI_HISTORY, []),
    aiConfig: storage.get(STORAGE_KEYS.AI_CONFIG, {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      modelId: 'deepseek-chat',
      apiKey: ''
    }),
    reports: storage.get(STORAGE_KEYS.REPORTS, []),
    // UI状态
    ui: {
      selectedNodeId: null,
      activeTab: 'goals',
      calendarOpen: false,
      dashboardOpen: false,
      modalStack: [],
      // AI重构撤销栈（约束规则第3条：AI操作必须可撤回）
      undoStack: [],
      redoStack: [],
    }
  }
}

function reducer(state, action) {
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
      return { ...state, nodes }
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
    // P1：AI 完整学习路线 —— 一次性批处理写入：根节点元信息（routeTitle/Subtitle/FinalFlag/Mantra）
    // + 3 条主线阶段胶囊节点 + 每条挂 8 个"上下悬挂白框"子节点（上面4+下面4，含分类前缀）
    // + 最右端旗帜终点节点；保证父子节点 ID 连续落盘、父子 parentId 100% 正确。
    case 'ADD_ROUTE_TREE': {
      const undo = { nodes: JSON.parse(JSON.stringify(state.nodes)) }
      const nodes = state.nodes.slice()
      const rootNode = nodes.find(n => n.id === action.rootNodeId)
      if (!rootNode) return state
      const route = action.route || {}
      const baseISO = String(action.baseISO || new Date().toISOString().slice(0, 10))
      const startISO = String(action.overrideStartDate || rootNode.startDate || rootNode.dueDate || baseISO)
      const baseObj = new Date(startISO + 'T00:00:00'); baseObj.setHours(0,0,0,0)
      const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x }
      const iso = (d) => d.toISOString().slice(0,10)
      const sysId = action.systemId || rootNode.systemId || 'zhuye'
      const parentLevel = Number(action.parentLevel ?? (rootNode.level||0))
      const parentXY = action.parentNodeXY || { x: rootNode.x||0, y: rootNode.y||0 }
      const phases = Array.isArray(route.phases) ? route.phases.slice(0,3) : []
      while (phases.length < 3) phases.push({
        phaseLabel: (['前期｜建立基础','中期','后期｜达到目标水平'])[phases.length],
        stage: (['early','middle','late'])[phases.length],
        nodeTitle: (['建立基础','能力进阶','稳定输出'])[phases.length],
        days: 30,
        above: {'训练项目':'','技能要点':'','工具物料':'','曲目/案例':''},
        below: {'能力目标':'','需要攻克的问题':'','练习重点':'','达成标准':''},
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
      // 2) 3 阶段累计日区间
      let cursor = 0
      const stageMetas = []
      phases.forEach((ph) => {
        const days = Math.max(1, Number(ph.days) || 30)
        const s = cursor
        const e = cursor + days - 1
        cursor += days
        stageMetas.push({ phase: ph, startDay: s, endDay: e, days })
      })
      const stageIds = []
      stageMetas.forEach((m, i) => {
        const sid = uid('node')
        stageIds.push(sid)
        nodes.push({
          id: sid,
          parentId: action.rootNodeId,
          systemId: sysId,
          title: m.phase.nodeTitle,
          phaseLabel: m.phase.phaseLabel,
          stagePhase: m.phase.stage,
          status: 'todo', progress: 0,
          x: parentXY.x + 180 + i * 380,
          y: parentXY.y + (i - 1) * 4,
          level: parentLevel + 1,
          startDate: iso(addDays(baseObj, m.startDay)),
          dueDate:   iso(addDays(baseObj, m.endDay)),
          estimatedHours: Math.max(10, m.days * 4),
          difficulty: 1, value: 1, weight: 20,
          isRouteStageNode: true,
          createdAt: Date.now(),
        })
        // 上下 8 个分类白框（4 上 + 4 下）：标题带「🔼 分类名：」/「🔽 分类名：」前缀 + routeGroup/routeCategory 字段便于布局
        const aboveKeys = ['训练项目','技能要点','工具物料','曲目/案例']
        const belowKeys = ['能力目标','需要攻克的问题','练习重点','达成标准']
        const L = parentLevel + 2
        aboveKeys.forEach((key, j) => {
          nodes.push({
            id: uid('node'),
            parentId: sid,
            systemId: sysId,
            title: '🔼 ' + key + '：' + String((m.phase.above||{})[key] ?? ''),
            routeGroup: 'above',
            routeCategory: key,
            status: 'todo', progress: 0,
            x: parentXY.x + 220 + i * 380,
            y: parentXY.y - 30 - (aboveKeys.length - j) * 18,
            level: L,
            startDate: iso(addDays(baseObj, m.startDay)),
            dueDate:   iso(addDays(baseObj, Math.max(m.startDay, Math.floor((m.startDay+m.endDay)/2)))),
            estimatedHours: Math.max(2, Math.ceil(m.days * 4 / aboveKeys.length)),
            difficulty: 1, value: 1, weight: 5,
            createdAt: Date.now(),
          })
        })
        belowKeys.forEach((key, j) => {
          nodes.push({
            id: uid('node'),
            parentId: sid,
            systemId: sysId,
            title: '🔽 ' + key + '：' + String((m.phase.below||{})[key] ?? ''),
            routeGroup: 'below',
            routeCategory: key,
            status: 'todo', progress: 0,
            x: parentXY.x + 220 + i * 380,
            y: parentXY.y + 30 + j * 18,
            level: L,
            startDate: iso(addDays(baseObj, Math.ceil((m.startDay+m.endDay)/2))),
            dueDate:   iso(addDays(baseObj, m.endDay)),
            estimatedHours: Math.max(2, Math.ceil(m.days * 4 / belowKeys.length)),
            difficulty: 1, value: 1, weight: 5,
            createdAt: Date.now(),
          })
        })
      })
      // 3) 主线最右端旗帜节点（放在第 3 阶段 end+1 天）
      const last = stageMetas[stageMetas.length-1]
      const flagDay = addDays(baseObj, last.endDay+1)
      nodes.push({
        id: uid('node'),
        parentId: action.rootNodeId,
        systemId: sysId,
        title: '🚩 ' + String(route.finalFlag || '可独立达成目标'),
        stagePhase: 'late',
        status: 'todo', progress: 0,
        x: parentXY.x + 180 + stageMetas.length*380 + 80,
        y: parentXY.y,
        level: parentLevel + 1,
        startDate: iso(flagDay),
        dueDate:   iso(flagDay),
        estimatedHours: 2, difficulty: 1, value: 1, weight: 5,
        isRouteFlagNode: true,
        createdAt: Date.now(),
      })
      storage.set(STORAGE_KEYS.NODES, nodes)
      return {
        ...state,
        nodes,
        ui: { ...state.ui, undoStack: [...state.ui.undoStack, undo], redoStack: [] }
      }
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

    // 习惯、打卡、计时记录
    case 'ADD_HABIT': {
      const habits = [...state.habits, { id: uid('hab'), ...action.payload, createdAt: Date.now() }]
      storage.set(STORAGE_KEYS.HABITS, habits)
      return { ...state, habits }
    }
    case 'UPDATE_HABIT': {
      const habits = state.habits.map(h => h.id === action.id ? { ...h, ...action.payload } : h)
      storage.set(STORAGE_KEYS.HABITS, habits)
      return { ...state, habits }
    }
    case 'TOGGLE_CHECKIN': {
      const { date, habitId } = action.payload
      const key = `${date}_${habitId}`
      const checkins = { ...state.checkins }
      const wasChecked = !!checkins[key]
      if (wasChecked) delete checkins[key]
      else checkins[key] = { date, habitId, time: Date.now() }
      storage.set(STORAGE_KEYS.CHECKINS, checkins)

      // ========= T5 双向同步：日常打卡 → 幕布节点状态 & 进度 =========
      let nodes = state.nodes
      const habit = state.habits.find(h => h.id === habitId)
      if (habit && habit.sourceNodeId) {
        nodes = state.nodes.map(n => ({ ...n }))
        const target = nodes.find(n => n.id === habit.sourceNodeId)
        if (target) {
          // 1) 叶子节点本身状态：全部"未来连续天数"都打卡了 → done；有任意今日及之前未打 → todo/progress
          const nowChecked = !wasChecked  // 本次 toggle 后的结果
          const relevantKeys = Object.keys(checkins).filter(k => k.endsWith('_' + habitId))
          const totalDays = 7  // 以"近 7 天 + 未来"的完成度近似估状态
          const checkedDays = relevantKeys.length
          if (nowChecked) {
            target.progress = 100
            target.status = 'done'
          } else {
            // 取消打卡：按历史情况降级
            const ratio = checkedDays / Math.max(1, totalDays)
            if (ratio <= 0) { target.progress = 0; target.status = 'todo' }
            else { target.progress = Math.max(1, Math.round(ratio * 80)); target.status = 'progress' }
          }
          // 2) 递归更新父节点进度（搁置/放弃已在 recalcParentProgress 内部排除）
          if (target.parentId) recalcParentProgress(nodes, target.parentId, state.settings.progressMode)
          storage.set(STORAGE_KEYS.NODES, nodes)
        }
      }
      return { ...state, checkins, nodes }
    }
    case 'BATCH_CHECKIN': {
      const { date, habitIds, value = true } = action.payload || {}
      if (!Array.isArray(habitIds) || habitIds.length === 0) return state
      const checkins = { ...state.checkins }
      habitIds.forEach(habitId => {
        const key = `${date}_${habitId}`
        if (value) checkins[key] = { date, habitId, time: Date.now() }
        else delete checkins[key]
      })
      storage.set(STORAGE_KEYS.CHECKINS, checkins)

      // ========= T5 双向同步：批量打卡 → 幕布节点 =========
      let nodes = state.nodes
      let nodesChanged = false
      habitIds.forEach(habitId => {
        const habit = state.habits.find(h => h.id === habitId)
        if (!habit || !habit.sourceNodeId) return
        if (!nodesChanged) { nodes = state.nodes.map(n => ({ ...n })); nodesChanged = true }
        const target = nodes.find(n => n.id === habit.sourceNodeId)
        if (!target) return
        if (value) {
          target.progress = 100
          target.status = 'done'
        } else {
          target.progress = 0
          target.status = 'todo'
        }
        if (target.parentId) recalcParentProgress(nodes, target.parentId, state.settings.progressMode)
      })
      if (nodesChanged) storage.set(STORAGE_KEYS.NODES, nodes)
      return { ...state, checkins, nodes: nodesChanged ? nodes : state.nodes }
    }
    case 'DELETE_HABIT': {
      const habits = state.habits.filter(h => h.id !== action.id)
      // 同步清理该习惯所有日期的打卡记录（避免 checkins 对象无限膨胀）
      const suffix = `_${action.id}`
      const checkins = { ...state.checkins }
      Object.keys(checkins).forEach(k => {
        if (k.endsWith(suffix)) delete checkins[k]
      })
      storage.set(STORAGE_KEYS.HABITS, habits)
      storage.set(STORAGE_KEYS.CHECKINS, checkins)
      return { ...state, habits, checkins }
    }

    // 临时打卡任务（日常/临时视图之二）
    case 'ADD_TEMP_TASK': {
      const tempTasks = [...state.tempTasks, { id: uid('tmp'), reminder: true, done: false, ...action.payload, createdAt: Date.now() }]
      storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
      return { ...state, tempTasks }
    }
    case 'UPDATE_TEMP_TASK': {
      const tempTasks = state.tempTasks.map(t => t.id === action.id ? { ...t, ...action.payload } : t)
      storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
      return { ...state, tempTasks }
    }
    case 'DELETE_TEMP_TASK': {
      const tempTasks = state.tempTasks.filter(t => t.id !== action.id)
      storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
      return { ...state, tempTasks }
    }
    case 'TOGGLE_TEMP_TASK_DONE': {
      const tempTasks = state.tempTasks.map(t => t.id === action.id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : undefined } : t)
      storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
      return { ...state, tempTasks }
    }

    case 'ADD_TIMER_RECORD': {
      const records = [...state.timerRecords, { id: uid('t'), done: false, ...action.payload, createdAt: Date.now() }]
      storage.set(STORAGE_KEYS.TIMER_RECORDS, records)
      return { ...state, timerRecords: records }
    }
    // 阶段1 修复：计时结束（TimerWidget 使用）——统一走 reducer，不再 hack localStorage + location.reload
    case 'FINISH_TIMER_RECORD': {
      const { id, completed = true } = action.payload || {}
      const target = state.timerRecords.find(t => t.id === id && !t.done)
      if (!target) return state
      const isPomodoro = target.type === 'pomodoro'
      const elapsedMin = Math.max(1, Math.round((Date.now() - (target.started || Date.now())) / 60000))
      const finalMin = isPomodoro && completed ? (Number(target.minutes) || 25) : elapsedMin
      const records = state.timerRecords.map(t =>
        t.id === id ? { ...t, done: true, minutes: finalMin, endAt: Date.now() } : t
      )
      storage.set(STORAGE_KEYS.TIMER_RECORDS, records)
      // 若该计时关联了节点，则给节点增加进度（按分钟 → 进度增量，1h ≈ 2%）
      let nodes = state.nodes
      if (target.nodeId && finalMin > 0) {
        const inc = Math.min(100, Math.round(finalMin / 60 * 2))
        nodes = state.nodes.map(n => n.id === target.nodeId
          ? { ...n, progress: Math.min(100, Number(n.progress || 0) + inc) }
          : n)
        storage.set(STORAGE_KEYS.NODES, nodes)
      }
      return { ...state, timerRecords: records, nodes }
    }

    // AI对话历史（新版API）
    case 'APPEND_AI_MESSAGE': {
      const newHistory = [...state.aiHistory, action.payload.message].slice(-200)
      storage.set(STORAGE_KEYS.AI_HISTORY, newHistory)
      return { ...state, aiHistory: newHistory }
    }
    case 'RESET_AI_HISTORY': {
      storage.set(STORAGE_KEYS.AI_HISTORY, [])
      return { ...state, aiHistory: [] }
    }
    case 'UPDATE_AI_CONFIG': {
      const newConfig = { ...state.aiConfig, ...action.payload }
      if (newConfig.baseUrl && !/^https?:\/\//.test(newConfig.baseUrl)) {
        return state
      }
      storage.set(STORAGE_KEYS.AI_CONFIG, newConfig)
      return { ...state, aiConfig: newConfig }
    }
    // AI对话历史（旧API兼容别名，AIChatPanel仍在用）
    case 'ADD_AI_MESSAGE': {
      const msg = { id: uid('ai'), time: Date.now(), ...action.payload }
      const newHistory = [...state.aiHistory, msg].slice(-200)
      storage.set(STORAGE_KEYS.AI_HISTORY, newHistory)
      return { ...state, aiHistory: newHistory }
    }
    case 'CLEAR_AI_HISTORY': {
      storage.set(STORAGE_KEYS.AI_HISTORY, [])
      return { ...state, aiHistory: [] }
    }

    // 复盘报告
    case 'ADD_REPORT': {
      const reports = [...state.reports, { id: uid('rpt'), ...action.payload, createdAt: Date.now() }]
      storage.set(STORAGE_KEYS.REPORTS, reports)
      return { ...state, reports }
    }

    // UI控制
    case 'TOGGLE_CALENDAR':
      return { ...state, ui: { ...state.ui, calendarOpen: !state.ui.calendarOpen } }
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
      return {
        settings: storage.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
        nodes: storage.get(STORAGE_KEYS.NODES, []),
        habits: storage.get(STORAGE_KEYS.HABITS, []),
        tempTasks: storage.get(STORAGE_KEYS.TEMP_TASKS, []),
        checkins: storage.get(STORAGE_KEYS.CHECKINS, {}),
        timerRecords: storage.get(STORAGE_KEYS.TIMER_RECORDS, []),
        aiHistory: storage.get(STORAGE_KEYS.AI_HISTORY, []),
        aiConfig: storage.get(STORAGE_KEYS.AI_CONFIG, {
          provider: 'deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          modelId: 'deepseek-chat',
          apiKey: ''
        }),
        reports: storage.get(STORAGE_KEYS.REPORTS, []),
        ui: state.ui
      }
    }

    default:
      return state
  }
}

// 收集某节点及其所有后代ID
function collectAllDescendantIds(nodes, rootId) {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    nodes.forEach(n => {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id)
        changed = true
      }
    })
  }
  return ids
}

// 递归更新父级进度
// T1：先过滤 paused / aborted（同 calcProgress 一致，避免分子分母漂移）
const EXCLUDED_FOR_PARENT = new Set(['paused', 'aborted'])
function recalcParentProgress(nodes, parentId, mode) {
  const parent = nodes.find(n => n.id === parentId)
  if (!parent) return
  const children = nodes.filter(n => n.parentId === parentId && !EXCLUDED_FOR_PARENT.has(n.status))
  parent.progress = calcProgress(children, mode)
  if (parent.parentId) recalcParentProgress(nodes, parent.parentId, mode)
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, initialState)

  // ========= T2：节点闹钟提醒轮询（全局只跑一份 interval）=========
  // reminder 结构：{ enabled, isoTime (YYYY-MM-DDTHH:mm), notified:boolean }
  // 存储：已经是节点属性 → nodes[n].reminder，写入节点就自动 localStorage 持久化（见 reducer 的 storage.set）。
  const stateRef = useRef(state)
  stateRef.current = state
  const pollTimerRef = useRef(null)
  useEffect(() => {
    const checkDue = () => {
      const now = Date.now()
      const nodes = stateRef.current.nodes || []
      const toMark = []
      nodes.forEach(n => {
        const r = n.reminder
        if (!r || !r.enabled || r.notified || !r.isoTime) return
        // isoTime 格式是 YYYY-MM-DDTHH:mm（本地时区的 datetime-local），转成本地时间戳
        const m = String(r.isoTime).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
        if (!m) return
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0)
        const due = d.getTime()
        if (!Number.isNaN(due) && now >= due) toMark.push({ id: n.id, title: n.title, isoTime: r.isoTime })
      })
      if (toMark.length === 0) return
      // 1) 更新节点 notified=true（持久化到 localStorage）
      toMark.forEach(({ id }) => {
        storage.set(STORAGE_KEYS.NODES, (stateRef.current.nodes || []).map(n =>
          n.id === id ? { ...n, reminder: { ...(n.reminder || {}), notified: true } } : n
        ))
      })
      // 注意：reducer 中 UPDATE_NODE 也会写 storage，但为了避免 15s 轮询污染
      // 撤销栈/事件推送，我们直接改 nodes+写入后，手动 dispatch 一次 REPLACE_NODES 保证状态刷新
      // 为了最简&不触发副作用栈，直接 dispatch UPDATE_NODE
      toMark.forEach(({ id }) => {
        dispatch({ type: 'UPDATE_NODE', id, payload: { reminder: { ...((stateRef.current.nodes || []).find(n => n.id === id)?.reminder || {}), notified: true } } })
      })
      // 2) 逐一弹出页面内提醒 Modal（ModalRoot 本身已支持队列堆叠）
      toMark.forEach(({ title, isoTime }) => {
        dispatch({
          type: 'PUSH_MODAL',
          payload: {
            type: 'alert',
            title: '🔔 节点闹钟提醒',
            message: `任务「${title || '未命名节点'}」到达设定时间：${formatReminderTime(isoTime)}，请及时开始或延后。`,
          }
        })
      })
    }
    // 启动：立即执行一次（避免进入页面刚好错过 15s 窗口），然后每 15 秒扫描
    checkDue()
    pollTimerRef.current = setInterval(checkDue, 15 * 1000)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
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
