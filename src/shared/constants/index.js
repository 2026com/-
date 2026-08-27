// 全局常量定义 V1.0
// V2.0预留：批量处理、云同步、七大系统互通等仅做注释，不实现

// 七大成长系统定义（按用户指定顺序命名，侧边栏自动同步）
export const SEVEN_SYSTEMS = [
  { id: 'shenti',    name: '身体状态',   icon: '🧘', color: '#8b5cf6' },
  { id: 'qingxu',    name: '情绪与心理', icon: '💬', color: '#ec4899' },
  { id: 'nengli',    name: '能力成长',   icon: '💼', color: '#3b82f6' },
  { id: 'renji',     name: '人际网络',   icon: '👥', color: '#06b6d4' },
  { id: 'caiwu',     name: '财务记账',   icon: '💰', color: '#f59e0b' },
  { id: 'richeng',   name: '任务日程',   icon: '📅', color: '#10b981' },
  { id: 'zhishi',    name: '知识思考库', icon: '🧠', color: '#ef4444' },
]

// 习惯难度（日常打卡新增/编辑表单用）
export const HABIT_DIFFICULTY = [
  { k: 'easy',   label: '简单', badge: '🟢 简单' },
  { k: 'normal', label: '普通', badge: '🔵 普通' },
  { k: 'hard',   label: '困难', badge: '🔴 困难' },
]

// 任务五色状态（T1 扩 5 态：待开始/进行中/暂停/已完成/放弃搁置）
export const NODE_STATUS = {
  TODO:    { key: 'todo',    label: '待开始',   short: '待开', color: '#3b82f6', dot: '🔵' },
  PROGRESS:{ key: 'progress',label: '进行中',   short: '进行', color: '#06b6d4', dot: '🩵' },
  PAUSED:  { key: 'paused',  label: '暂停',     short: '暂停', color: '#f97316', dot: '🟠' },
  DONE:    { key: 'done',    label: '已完成',   short: '已完', color: '#22c55e', dot: '🟢' },
  ABORTED: { key: 'aborted', label: '放弃搁置', short: '放弃', color: '#ef4444', dot: '🔴' },
}

// 三阶段分期（笛子路线图式：初期 33% / 中期 33% / 后期 34%）
export const STAGE_PHASES = [
  { key: 'early',  name: '前期 · 建立基础', bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.30)', text: '#4338ca' },
  { key: 'middle', name: '中期 · 进阶攻坚', bg: 'rgba(14,165,233,0.06)', border: 'rgba(14,165,233,0.30)', text: '#0369a1' },
  { key: 'late',   name: '后期 · 表演巩固', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.30)', text: '#047857' },
]

// 四种AI学习方法论 V1.0强制限定（约束规则第4条）
export const AI_METHODS = {
  POMODORO: {
    key: 'pomodoro',
    name: '番茄工作法',
    match: ['练琴', '刷题', '实操', '重复', '训练', '背诵', '记忆'],
    desc: '25分钟专注+5分钟休息循环，适合重复性技能训练',
    singleTime: 25,
    restTime: 5,
    steps: ['设定今日目标任务', '启动25分钟番茄钟', '任务结束休息5分钟', '每4个番茄长休15分钟']
  },
  FEYNMAN: {
    key: 'feynman',
    name: '费曼学习法',
    match: ['复盘', '讲解', '梳理', '总结', '输出', '内化', '知识'],
    desc: '以教代学，用通俗语言讲清概念，暴露知识盲区',
    singleTime: 40,
    restTime: 10,
    steps: ['选定学习主题', '用大白话向他人讲解', '发现卡壳处回查原知识', '简化语言+类比']
  },
  FIRST_PRINCIPLE: {
    key: 'first_principle',
    name: '第一性原理',
    match: ['架构', '原理', '底层', '钻研', '理论', '设计', '本质'],
    desc: '拆解至最基础事实，从零推演，避免类比思维的偏见',
    singleTime: 60,
    restTime: 15,
    steps: ['界定问题核心', '拆解至不可再分的基本要素', '从零开始重新构建方案', '验证并迭代']
  },
  DELIBERATE: {
    key: 'deliberate',
    name: '刻意练习',
    match: ['打磨', '迭代', '精进', '技能', '长期', '进阶', '精通'],
    desc: '走出舒适区，聚焦薄弱环节，获得即时反馈',
    singleTime: 45,
    restTime: 10,
    steps: ['明确技能短板', '针对性设计练习任务', '获得即时反馈并修正', '重复+拓展边界']
  }
}

// 底部3大Tab
export const MAIN_TABS = [
  { id: 'daily', name: '日常习惯', icon: '📅', path: '/daily' },
  { id: 'goals', name: '长期目标', icon: '🎯', path: '/goals' },
  { id: 'review', name: '历史复盘', icon: '📊', path: '/review' },
]

// V1.0 数据结构版本号（每次 mockData/存储结构变更时递增，自动刷新用户本地旧数据）
export const DATA_VERSION = '1.2.2-20260815-date-reminder-3phase'

// LocalStorage Key
export const STORAGE_KEYS = {
  NODES: 'growth_app_v1_nodes',
  HABITS: 'growth_app_v1_habits',
  TEMP_TASKS: 'growth_app_v1_temp_tasks',
  CHECKINS: 'growth_app_v1_checkins',
  TIMER_RECORDS: 'growth_app_v1_timer_records',
  AI_HISTORY: 'growth_app_v1_ai_history',
  AI_CONFIG: 'growth_app_v1_ai_config',
  REPORTS: 'growth_app_v1_reports',
  SETTINGS: 'growth_app_v1_settings',
  BACKUP: 'growth_app_v1_backup',
  DATA_VERSION: 'growth_app_v1_data_version',
  /** 3D 知识库：用户知识点元数据 [{ id, name, category, createdAt }]（生长结果由 knowledge-base 服务独立缓存） */
  KNOWLEDGE_BASE: 'growth_app_v1_knowledge_nodes',
}

// 默认设置
export const DEFAULT_SETTINGS = {
  canvasStyle: 'lined', // 'plain' | 'lined'  双样式画布
  drawerMode: 'nav',    // 'nav' | 'ai'
  drawerOpen: true,
  progressMode: 'auto', // 'auto'自动加权 | 'manual'手动权重
  reminderEnabled: true,
  pomodoroMinutes: 25,
  customSystemNames: {}, // { [systemId]: customName } — 7 系统用户自定义重命名
}

// 根据设置合并出"实际生效"的 7 系统数组（优先自定义名）
export function getSEVEN_SYSTEMS_EFFECTIVE(settings) {
  const custom = (settings && settings.customSystemNames) || {}
  return SEVEN_SYSTEMS.map(s => ({
    ...s,
    name: (typeof custom[s.id] === 'string' && custom[s.id].trim())
      ? custom[s.id].trim()
      : s.name
  }))
}

// 思维导图节点矩形尺寸（统一公式，MindNode / NodeLinks 两处共用，避免漂移）
// T6 最终常量：DAY_W=24，要求根节点宽度 ≤ 2 × DAY_W = 48 → 取 h=34, w=46 (46 ≤ 48)
export function getNodeRect(level) {
  const lv = Math.max(0, Number(level) || 0)
  const h = Math.max(24, 34 - Math.floor(lv * 2.5))  // 根34 / 层1 31 / 层2 29 / 层3 26 / 更深 24
  const w = Math.round(h * 1.35)                     // 根≈46 / 层1≈42 / 层2≈39 / 更深≈32
  return { w, h }
}

// AI固定复盘提示词模板 V1.0内置
export const REVIEW_PROMPT_TEMPLATES = {
  monthly: (data) => `请基于以下${data.month}月数据生成结构化成长复盘：
1. 核心成果摘要（3-5条）
2. 六大能力雷达分析（优势/短板）
3. 未完成任务根因归类与解决建议
4. 下月可执行落地优化方案（不少于3条）
数据概览：总打卡${data.totalCheckins}天，连续打卡${data.streak}天，有效工作时间${data.totalHours}小时，任务完成率${data.completeRate}%`,
  yearly: (data) => `请基于${data.year}年度数据生成完整成长复盘：
1. 全年里程碑事件（按季度回顾）
2. 六大能力雷达年度演化与跃迁总结
3. 时间投入结构分析（内核定力/外在战斗力/情商）
4. 未完成目标归因分析（按类别统计）
5. 下一年度成长策略建议（具体可执行项）
数据：年度完成率${data.yearRate}%，总有效时间${data.totalHours}小时，最擅长领域${data.topDomain}，最薄弱领域${data.weakDomain}`
}

/*
========================== V2.0二期预留（仅注释，V1.0不实现）==========================
1. ACCOUNT: 账号系统、多端云同步
2. BATCH_OPS: AI批量节点处理、批量归档
3. EMOTION: 内核修行模块（情绪日记、正念训练）
4. EQ_SIM: 情商AI情景对话模拟、人际冲突推演
5. SNAPSHOT: 长期项目版本快照、历史规划迭代对比
6. TEMPLATE: 七大系统成套模板库一键套用
=====================================================================================
*/
