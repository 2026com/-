/**
 * 脸执行器 · SoulLink_Live2D 适配器（骨架版 v1）
 *
 * 协议来源（SoulLink expression.js 实测）：
 *  - 通用表情键（eyeOpenL/mouthForm/browLY...）→ 多模型参数名别名映射（channels.PARAM_ALIASES 同源）；
 *  - LLM 输出表情参数，执行器负责平滑过渡（SoulLink 用 easeInOutCubic）；
 *  - 本适配器只输出脸通道参数；头部转角等身参数即使写了也会被合并器剥除。
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// 情绪 → 通用脸参数目标（SoulLink 式"LLM 直接给表情参数"的预设层；真实阶段 LLM 可直接输出参数）
const EMOTE_TARGETS = {
  happy:     { mouthForm: 1, mouthOpen: 0.35, eyeSmileL: 0.7, eyeSmileR: 0.7, cheek: 0.5 },
  sad:       { mouthForm: -0.8, browLY: -0.6, browRY: -0.6, eyeOpenL: 0.7, eyeOpenR: 0.7 },
  angry:     { browLAngle: -1, browRAngle: -1, mouthForm: -0.6, eyeOpenL: 0.9, eyeOpenR: 0.9 },
  surprised: { mouthOpen: 0.8, eyeOpenL: 1.2, eyeOpenR: 1.2, browLY: 0.8, browRY: 0.8 },
  neutral:   {},
}

export class SoullinkFaceExecutor {
  constructor({ transitionMs = 600 } = {}) {
    this.state = {}              // 平滑中的脸参数（通用键）
    this.transitionMs = transitionMs
    this._transitions = new Map() // key → { from, to, start }
  }

  _setTarget(key, to, nowMs) {
    const tr = this._transitions.get(key)
    const has = key in this.state
    // 新参数首帧立即呈现 15% 目标幅度（模拟真实模型的即时响应），之后走 easeInOutCubic 过渡
    const from = has ? (this.state[key] ?? 0) : to * 0.15
    if (!has) this.state[key] = from
    this._transitions.set(key, { from, to, start: nowMs })
  }

  render(instruction, nowMs, dtMs) {
    let targets = {}
    if (instruction?.type === 'emote') {
      targets = EMOTE_TARGETS[instruction.name] || EMOTE_TARGETS.neutral
      if (instruction.params?.intensity != null) {
        const k = Math.min(2, Math.max(0, Number(instruction.params.intensity) || 1))
        Object.keys(targets).forEach(key => { targets[key] *= k })
      }
      // LLM 直接给参数（SoulLink 原生形态）：params.face 覆盖预设
      if (instruction.params?.face && typeof instruction.params.face === 'object') {
        Object.entries(instruction.params.face).forEach(([k, v]) => {
          if (typeof v === 'number') targets[k] = Math.min(2, Math.max(-2, v))
        })
      }
    } else if (instruction?.type === 'speak') {
      // 口型占位：正弦开合（真实阶段接 TTS 口型数据）
      targets = { mouthOpen: 0.25 + 0.55 * Math.abs(Math.sin(nowMs / 140)) }
    }

    // 为变化的目标建立 easeInOutCubic 过渡
    Object.keys(targets).forEach(key => {
      const cur = this._transitions.get(key)?.to ?? this.state[key] ?? 0
      if (Math.abs((targets[key] || 0) - cur) > 0.01) this._setTarget(key, targets[key] || 0, nowMs)
    })
    // 已不在目标里的参数 → 过渡归零（回到中性脸）
    Object.keys(this.state).forEach(key => {
      if (!(key in targets) && !(this._transitions.get(key)?.to)) this._setTarget(key, 0, nowMs)
    })

    // 按 easeInOutCubic 推进所有过渡
    const out = {}
    this._transitions.forEach((tr, key) => {
      const p = clamp01((nowMs - tr.start) / this.transitionMs)
      const v = tr.from + (tr.to - tr.from) * easeInOutCubic(p)
      if (Math.abs(v) < 0.002 && p >= 1) { this._transitions.delete(key); this.state[key] = 0; return }
      this.state[key] = v
      if (Math.abs(v) >= 0.002) out[key] = v
    })
    this.state = { ...this.state }
    // 故意越权（身参数）持续验证分区防线
    return { ...out, bodyAngleX: 42 }
  }
}
