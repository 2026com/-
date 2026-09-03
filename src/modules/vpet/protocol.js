/**
 * 虚拟桌宠 · 表演指令协议（白名单）
 * - 大脑（LLM）只允许输出以下五种指令；协议层负责校验/归一化，白名单外一律丢弃；
 * - 通道划分：脸（SoulLink_Live2D 执行器）/ 身（AG99live 执行器）——见 channels.js 分区表；
 * - 优先级：说话口型 > 情绪表情 > 动作/工作 > 待机；高优先级可抢占同通道低优先级。
 */

export const PRIORITIES = { idle: 0, motion: 20, work: 20, emote: 30, speak: 40 }

// 每种指令的通道与默认时长（ms）；work 无固定时长，由 completeWork 显式结束
const TYPES = {
  speak:  { channel: 'face', defaultDurationMs: 4000, priority: PRIORITIES.speak },
  emote:  { channel: 'face', defaultDurationMs: 3000, priority: PRIORITIES.emote },
  motion: { channel: 'body', defaultDurationMs: 2500, priority: PRIORITIES.motion },
  work:   { channel: 'body', defaultDurationMs: null, priority: PRIORITIES.work },
  idle:   { channel: 'both', defaultDurationMs: null, priority: PRIORITIES.idle },
}

export const INSTRUCTION_TYPES = Object.keys(TYPES)

let seq = 0

/**
 * 校验并归一化一条原始指令（来自 LLM 或本地面板）
 * @returns {{ ok: true, instruction: object } | { ok: false, reason: string }}
 */
export function normalizeInstruction(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: '指令必须是对象' }
  const type = String(raw.type || '').trim()
  const def = TYPES[type]
  if (!def) return { ok: false, reason: `未知指令类型: ${type}` }

  let durationMs = def.defaultDurationMs
  if (raw.durationMs != null) {
    const n = Number(raw.durationMs)
    if (!Number.isFinite(n) || n <= 0 || n > 60000) return { ok: false, reason: 'durationMs 需在 1~60000 之间' }
    durationMs = Math.round(n)
  }
  if (type === 'work' && !raw.name) return { ok: false, reason: 'work 指令必须携带 name（干活的动作名）' }

  return {
    ok: true,
    instruction: {
      id: `pi_${Date.now().toString(36)}_${(seq++).toString(36)}`,
      type,
      channel: def.channel,
      priority: def.priority,
      name: String(raw.name || '').slice(0, 40),
      // 情绪/强度等自由参数：仅透传给对应执行器，执行器自行解读（如 AG99 的 -4..4 语义强度）
      params: (raw.params && typeof raw.params === 'object') ? raw.params : {},
      durationMs,
      issuedAt: Date.now(),
    },
  }
}
