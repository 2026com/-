import { APP_ACTION_PROTOCOL } from './appActions.js'

/**
 * 对话历史管理模块 —— 自 AIChatSidebar.jsx / AppContext 原样拆分（只移动代码位置，不改业务逻辑）
 * 职责：系统提示词构造、发送前上下文窗口组装、历史条数裁剪。
 * 注：历史的持久化仍由 AppContext（APPEND_AI_MESSAGE 等 action → localStorage）承担，
 *     本模块是纯粹的历史上下文管理层，不直接读写存储。
 */

/** 发送请求时携带的最近消息条数（原 AIChatSidebar 内 slice(-12) 的常量化） */
export const HISTORY_CONTEXT_LIMIT = 12

/** 历史持久化上限（AppContext 各 reducer 内 slice(-200) 的常量化） */
export const HISTORY_STORAGE_LIMIT = 200

/**
 * 系统提示词（让聊天更贴近"成长助手"定位）—— 仅在每次请求的首条附加
 */
export function buildSystemPrompt() {
  return {
    role: 'system',
    content: `你是用户的「个人成长助手」，对话简洁、落地、有可执行性，避免空泛。
当前 APP 是一个个人成长管理系统，包含：
- 日常打卡：日常习惯 3x3 网格 + 临时任务 5 列，点击空白方格新建；
- 长期目标：幕布思维导图（父子级树状节点、节点带进度条、顶部日度时间轴），节点可一键下发到日常打卡；
- AI 写执行方案：父节点输出 3~5 个宏观框架子标题，子节点输出 4~6 条具体到分钟/次数的原子动作步骤；
- 全部数据保存在用户本地 localStorage，不会上传。
- 你还控制着一个 PNG 虚拟形象（白发小人，屏幕左下角）：通过 perform 指令可以让它做
  开心/难过/惊讶/中性表情，和点头/摇头/思考/张望/挥手/干活等动作。它的形象目前不支持
  眨眼（等 Live2D 模型升级后支持）——用户要求眨眼时，诚实说明并用点头/歪头等动作代替。
回答中文，分点输出时建议用 1. 2. 3. 列表，避免长篇大段；遇到不确定的不要编。
${APP_ACTION_PROTOCOL}`
  }
}

/**
 * 组装发送给模型的消息数组：[system, ...最近 N 条历史, 本次用户消息]
 * @param {Array<{role:string,content:string}>} history 完整历史（state.aiHistory）
 * @param {string} userContent 本次用户输入
 * @param {number} [limit] 携带的最近消息条数（默认 12）
 */
export function buildContextMessages(history, userContent, limit = HISTORY_CONTEXT_LIMIT) {
  const h = Array.isArray(history) ? history : []
  const trimmed = h.slice(-limit).map(m => ({ role: m.role, content: m.content }))
  return [buildSystemPrompt(), ...trimmed, { role: 'user', content: userContent }]
}

/**
 * 历史裁剪：保留最近 max 条（与 AppContext reducer 内 slice(-200) 行为一致）
 */
export function trimHistory(history, max = HISTORY_STORAGE_LIMIT) {
  return [...(Array.isArray(history) ? history : [])].slice(-max)
}