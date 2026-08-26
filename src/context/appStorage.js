import { storage } from '../utils/storage.js'
import { STORAGE_KEYS, DEFAULT_SETTINGS, DATA_VERSION } from '../utils/constants.js'
import { initMockData } from '../data/mockData.js'

/**
 * 全局状态 · 存储处理层 —— 自 AppContext.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：启动初始化（数据版本检查 / mock 初始化 / 设置归一化）、全量状态读取（备份恢复用）
 */

// AI 配置默认值（initialState 与 IMPORT_ALL 共用）
export const DEFAULT_AI_CONFIG = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  modelId: 'deepseek-chat',
  apiKey: ''
}

/** 启动初始化：返回全局 state 初值（原 AppContext 的 initialState 函数体，原样迁移） */
export function bootInitialState() {
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
  // [修复] 幕布样式归一化：历史版本 localStorage 可能缺 canvasStyle 或存了非法值，
  // 导致画布显示成纯白。启动时统一兜底为 'lined'（横线草稿格），并回写保证后续启动一致。
  const savedSettings = storage.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS) || {}
  const bootSettings = { ...DEFAULT_SETTINGS, ...savedSettings }
  if (bootSettings.canvasStyle !== 'plain') bootSettings.canvasStyle = 'lined'
  storage.set(STORAGE_KEYS.SETTINGS, bootSettings)
  return {
    settings: bootSettings,
    nodes: storage.get(STORAGE_KEYS.NODES, []),
    habits: storage.get(STORAGE_KEYS.HABITS, []),
    tempTasks: storage.get(STORAGE_KEYS.TEMP_TASKS, []),
    checkins: storage.get(STORAGE_KEYS.CHECKINS, {}),
    timerRecords: storage.get(STORAGE_KEYS.TIMER_RECORDS, []),
    aiHistory: storage.get(STORAGE_KEYS.AI_HISTORY, []),
    aiConfig: storage.get(STORAGE_KEYS.AI_CONFIG, DEFAULT_AI_CONFIG),
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
      // V5：AI 生成执行方案后需要自动展开的节点 id（仅内存态，不落盘）
      autoExpandIds: [],
      // V5：AI 生成执行方案后需要自动适配的时间范围（仅内存态，不落盘）
      focusPlan: null,
      // 各幕布的视图快照（每块幕布独立的 windowStart/offsetY/zoom/expandedIds，切换后精确还原）
      canvasViews: {},
      // 切换幕布后待恢复的视图
      pendingCanvasView: null,
      // 新建幕布后要聚焦的根节点 id（切换视图到新幕布）
      focusRootId: null,
      // [修复] 新创建节点后要滚动定位的节点 id（移动端窄视口下新节点默认落在视区外）
      focusNodeId: null,
      // 当前激活的幕布（根节点 id）：切换后只显示该幕布的节点；null=全部
      activeCanvasId: null,
    }
  }
}

/** 全量状态读取：备份恢复（IMPORT_ALL）后从 localStorage 重建整棵 state（UI 状态保留内存现值） */
export function readAllState(ui) {
  return {
    settings: storage.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
    nodes: storage.get(STORAGE_KEYS.NODES, []),
    habits: storage.get(STORAGE_KEYS.HABITS, []),
    tempTasks: storage.get(STORAGE_KEYS.TEMP_TASKS, []),
    checkins: storage.get(STORAGE_KEYS.CHECKINS, {}),
    timerRecords: storage.get(STORAGE_KEYS.TIMER_RECORDS, []),
    aiHistory: storage.get(STORAGE_KEYS.AI_HISTORY, []),
    aiConfig: storage.get(STORAGE_KEYS.AI_CONFIG, DEFAULT_AI_CONFIG),
    reports: storage.get(STORAGE_KEYS.REPORTS, []),
    ui
  }
}