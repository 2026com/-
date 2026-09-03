import { AG99_AXIS_CHANNELS } from '../channels.js'

/**
 * 身执行器 · AG99live 适配器（骨架版 v1）
 *
 * 协议来源（AG99live 语义轴体系，源码实测）：
 *  - 主模型输出九级语义动作 axis_levels（每轴 -4..4 表示方向与强度）；
 *  - 轴清单：head_yaw/pitch/roll、body_yaw/pitch/roll、gaze_x/y、breath、
 *    eye_open、eye_smile、mouth、brow 系列（后面这些是脸语义，本适配器按分区剥除，交给脸执行器）；
 *  - 轴→参数的换算：head 输出 ±30°、body ±10°（AG99 默认 output_range），即 level × (range/4)。
 *
 * 本适配器只输出身通道参数；脸语义轴的值会被记录到 lastDroppedFaceAxes 供脸执行器参考。
 */

const LEVEL_TO = {
  head_yaw:   { key: 'angleX',     scale: 30 / 4 },
  head_pitch: { key: 'angleY',     scale: 30 / 4 },
  head_roll:  { key: 'angleZ',     scale: 30 / 4 },
  body_yaw:   { key: 'bodyAngleX', scale: 10 / 4 },
  body_pitch: { key: 'bodyAngleY', scale: 10 / 4 },
  body_roll:  { key: 'bodyAngleZ', scale: 10 / 4 },
  gaze_x:     { key: 'eyeBallX',   scale: 1 / 4 },
  gaze_y:     { key: 'eyeBallY',   scale: 1 / 4 },
}

export class Ag99BodyExecutor {
  constructor() {
    this.axisLevels = {}        // 持久语义姿态（LLM 一次输出，保持到下次更新）
    this.state = {}             // 平滑中的参数
    this.lastDroppedFaceAxes = {}
  }

  /** 更新语义姿态（LLM 表演指令的 params.axisLevels，或外部直接设置） */
  setAxisLevels(levels) {
    if (!levels || typeof levels !== 'object') return
    const clean = {}
    Object.entries(levels).forEach(([axis, v]) => {
      if (AG99_AXIS_CHANNELS[axis] !== 'body') { this.lastDroppedFaceAxes[axis] = v; return } // 脸语义剥除
      const n = Number(v)
      if (Number.isFinite(n)) clean[axis] = Math.min(4, Math.max(-4, n))
    })
    Object.assign(this.axisLevels, clean)
  }

  _targetsFor(instruction, nowMs) {
    const targets = {}
    // 1) 持久语义姿态 → 参数
    Object.entries(this.axisLevels).forEach(([axis, lv]) => {
      const m = LEVEL_TO[axis]
      if (m) targets[m.key] = lv * m.scale
    })
    // 2) 指令动作预设（阶段一协议兼容：nod/shake 等；真实阶段换 AG99 语义编译）
    if (instruction) {
      if (instruction.params?.axisLevels) this.setAxisLevels(instruction.params.axisLevels)
      Object.entries(this.axisLevels).forEach(([axis, lv]) => {
        const m = LEVEL_TO[axis]
        if (m) targets[m.key] = lv * m.scale
      })
      const t = nowMs / 1000
      const m = instruction.name
      if (m === 'nod') targets.angleY = (targets.angleY || 0) + Math.sin(t * 7) * 14
      else if (m === 'shake') targets.angleX = (targets.angleX || 0) + Math.sin(t * 6) * 15
      else if (m === 'thinking') { targets.angleZ = (targets.angleZ || 0) + 8; targets.bodyAngleY = (targets.bodyAngleY || 0) - 5 }
      else if (['working', 'typing', 'cast'].includes(m)) {
        targets.bodyAngleY = (targets.bodyAngleY || 0) + Math.sin(t * 3) * 4
        targets.angleY = (targets.angleY || 0) + Math.sin(t * 5) * 3
      }
    }
    // 3) 呼吸常驻（AG99 breath 轴或默认节奏）
    const breathLv = this.axisLevels.breath
    targets.breath = breathLv != null ? 0.5 + 0.5 * Math.sin(nowMs / 1000 * (0.6 + Math.abs(breathLv) * 0.3)) : 0.5 + 0.5 * Math.sin(nowMs / 1000 * 1.4)
    return targets
  }

  render(instruction, nowMs, dtMs) {
    const targets = this._targetsFor(instruction, nowMs)
    const k = Math.min(1, dtMs / 1000 * 8)
    const keys = new Set([...Object.keys(this.state), ...Object.keys(targets)])
    keys.forEach(key => {
      const isNew = !(key in this.state)
      this.state[key] = isNew ? (targets[key] || 0) * 0.15 : this.state[key] + ((targets[key] || 0) - this.state[key]) * k
      if (Math.abs(this.state[key]) < 0.002) delete this.state[key]
    })
    // 故意越权（脸参数）持续验证分区防线
    return { ...this.state, mouthForm: -1 }
  }
}
