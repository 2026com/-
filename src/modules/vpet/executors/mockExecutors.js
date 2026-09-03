/**
 * 虚拟桌宠 · Mock 执行器（阶段一联调用；阶段二由 SoulLink/AG99 真实适配器替换）
 * - 实现与真实适配器完全相同的 render(instruction, nowMs, dtMs) 契约；
 * - 用简单的平滑趋近（速度阻尼）模拟 SoulLink 的 easeInOutCubic 过渡感；
 * - 输出的参数对象会被 channels.js 按通道分区过滤，这里故意塞入一个越权参数
 *   （身执行器输出 ParamMouthForm）以持续验证分区防线有效。
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ease = (cur, target, dtMs, speedPerSec = 6) => {
  const k = clamp01(dtMs / 1000 * speedPerSec)
  return cur + (target - cur) * k
}

// 情绪 → 脸参数目标（示意值；真实模型接入后按模型实际参数调整）
const EMOTE_TARGETS = {
  happy:  { ParamMouthForm: 1, ParamMouthOpenY: 0.35, ParamEyeLSmile: 0.7, ParamEyeRSmile: 0.7, ParamCheek: 0.5 },
  sad:    { ParamMouthForm: -0.8, ParamBrowLY: -0.6, ParamBrowRY: -0.6, ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7 },
  angry:  { ParamBrowLForm: -1, ParamBrowRForm: -1, ParamMouthForm: -0.6, ParamEyeLOpen: 0.9, ParamEyeROpen: 0.9 },
  surprised: { ParamMouthOpenY: 0.8, ParamEyeLOpen: 1.2, ParamEyeROpen: 1.2, ParamBrowLY: 0.8, ParamBrowRY: 0.8 },
  neutral: {},
}

export class MockFaceExecutor {
  constructor() {
    this.state = {}   // 当前平滑中的脸参数
  }
  render(instruction, nowMs, dtMs) {
    let targets = {}
    if (instruction?.type === 'emote') {
      targets = EMOTE_TARGETS[instruction.name] || EMOTE_TARGETS.neutral
      if (instruction.params?.intensity != null) {
        const k = Math.min(2, Math.max(0, Number(instruction.params.intensity) || 1))
        Object.keys(targets).forEach(key => { targets[key] *= k })
      }
    } else if (instruction?.type === 'speak') {
      // 口型：正弦开合（真实阶段换 TTS 口型数据）
      const t = nowMs / 140
      targets = { ParamMouthOpenY: 0.25 + 0.55 * Math.abs(Math.sin(t)) }
    }
    // 全部参数向目标平滑趋近；新出现的参数首帧立即给出 15% 幅度（模拟真实模型即时响应）；无指令时平滑归零
    const keys = new Set([...Object.keys(this.state), ...Object.keys(targets)])
    keys.forEach(k => {
      const isNew = !(k in this.state)
      this.state[k] = isNew
        ? (targets[k] || 0) * 0.15
        : ease(this.state[k], targets[k] || 0, dtMs)
      if (Math.abs(this.state[k]) < 0.002) delete this.state[k]
    })
    // 故意越权：身通道专属参数，用于验证合并器分区剥除
    return { ...this.state, ParamBodyAngleX: 42 }
  }
}

// 动作名 → 身参数的时间函数（示意值）
export class MockBodyExecutor {
  constructor() {
    this.state = {}
  }
  render(instruction, nowMs, dtMs) {
    let targets = {}
    const t = nowMs / 1000
    if (!instruction) {
      // 待机：呼吸 + 轻微左右晃
      targets = { ParamBreath: 0.5 + 0.5 * Math.sin(t * 1.4), ParamBodyAngleX: Math.sin(t * 0.6) * 2 }
    } else if (instruction.type === 'motion' || instruction.type === 'work') {
      const m = instruction.name
      if (m === 'nod') targets = { ParamAngleY: Math.sin(t * 7) * 14 }
      else if (m === 'shake') targets = { ParamAngleX: Math.sin(t * 6) * 15 }
      else if (m === 'thinking') targets = { ParamAngleZ: 8, ParamBodyAngleY: -5 }
      else if (m === 'cast' || m === 'typing' || m === 'working') targets = { ParamBodyAngleY: Math.sin(t * 3) * 4, ParamAngleY: Math.sin(t * 5) * 3 }
      else targets = { ParamBodyAngleY: Math.sin(t * 2) * 3 }
    }
    const keys = new Set([...Object.keys(this.state), ...Object.keys(targets)])
    keys.forEach(k => {
      const isNew = !(k in this.state)
      this.state[k] = isNew
        ? (targets[k] || 0) * 0.15
        : ease(this.state[k], targets[k] || 0, dtMs, 8)
      if (Math.abs(this.state[k]) < 0.002) delete this.state[k]
    })
    return { ...this.state, ParamMouthForm: -1 } // 故意越权：验证分区剥除
  }
}
