import { normalizeInstruction, INSTRUCTION_TYPES } from './protocol.js'
import { composeFrame } from './channels.js'

/**
 * 虚拟桌宠 · 表演指令控制中心（Director）
 *
 * 职责：
 *  1. 接收 LLM/本地的表演指令 → 协议校验 → 按通道路由（脸/身）；
 *  2. 同通道优先级仲裁：说话口型 > 情绪表情 > 动作/工作 > 待机；
 *     高优先级抢占低优先级，同级替换，低优先级拒绝（事件通知，不静默）；
 *  3. tick(now)：过期指令自动回落待机；调用两个执行器产出本帧参数；
 *  4. 通过 composeFrame 合并为一次模型更新（每帧仅此一次，两个执行器不直接碰模型）。
 *
 * 与执行器的契约（阶段二由 SoulLink/AG99 适配器实现，现阶段为 Mock）：
 *  - executor.render(instruction | null, nowMs, dtMs) → 参数对象（会被按通道过滤）
 *  - work 指令无固定时长，必须由外部调 completeWork(taskId) 结束
 */

const now = () => Date.now()

export class PetDirector {
  constructor({ faceExecutor, bodyExecutor } = {}) {
    this.faceExecutor = faceExecutor || null
    this.bodyExecutor = bodyExecutor || null
    // 每通道当前活动指令：{ instruction, startedAt, until }
    this.channels = {
      face: { instruction: null, startedAt: 0, until: null },
      body: { instruction: null, startedAt: 0, until: null },
    }
    this._listeners = new Map()
    this._lastTick = now()
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event).add(cb)
    return () => this._listeners.get(event)?.delete(cb)
  }
  _emit(event, payload) {
    this._listeners.get(event)?.forEach(cb => { try { cb(payload) } catch (e) { /* 单个监听异常不阻塞 */ } })
  }

  /** 提交一条原始指令；返回 { ok, id/reason } */
  submit(raw) {
    const res = normalizeInstruction(raw)
    if (!res.ok) {
      this._emit('rejected', { reason: res.reason, raw })
      return res
    }
    const ins = res.instruction
    if (ins.channel === 'both') {
      // idle：支持 params.channel 指定单通道复位（如回复到达时只结束思考动作）；缺省双通道
      const only = ins.params?.channel
      if (only === 'face' || only === 'body') {
        this.channels[only] = { instruction: null, startedAt: now(), until: null }
      } else {
        this.channels.face = { instruction: null, startedAt: now(), until: null }
        this.channels.body = { instruction: null, startedAt: now(), until: null }
      }
      this._emit('submitted', { instruction: ins })
      return { ok: true, id: ins.id }
    }
    const slot = this.channels[ins.channel]
    const current = slot.instruction
    if (current && current.priority > ins.priority && now() < slot.until) {
      // 高优先级正在表演中，低优先级拒绝
      this._emit('rejected', { reason: 'low-priority', instruction: ins, busyWith: current })
      return { ok: false, reason: 'low-priority', id: ins.id }
    }
    if (current) this._emit('preempted', { channel: ins.channel, replaced: current, by: ins })
    slot.instruction = ins
    slot.startedAt = now()
    slot.until = ins.durationMs ? now() + ins.durationMs : null // work/idle 为 null
    this._emit('submitted', { instruction: ins })
    return { ok: true, id: ins.id }
  }

  /** 结束某个工作指令（AI 任务真正完成时调用，桌宠随之收工） */
  completeWork(taskId) {
    const slot = this.channels.body
    if (slot.instruction && slot.instruction.type === 'work' && (!taskId || slot.instruction.params?.taskId === taskId || slot.instruction.name === taskId)) {
      slot.instruction = null
      slot.until = null
      this._emit('work-done', { taskId })
      return true
    }
    return false
  }

  /** 每帧驱动：过期回落待机 → 执行器出参 → 合并成一次模型更新 */
  tick() {
    const t = now()
    const dt = Math.max(0, t - this._lastTick)
    this._lastTick = t
    for (const key of ['face', 'body']) {
      const slot = this.channels[key]
      if (slot.instruction && slot.until && t >= slot.until) {
        const finished = slot.instruction
        slot.instruction = null
        slot.until = null
        this._emit('settled', { channel: key, finished })
      }
    }
    const faceOut = this.faceExecutor?.render(this.channels.face.instruction, t, dt) || {}
    const bodyOut = this.bodyExecutor?.render(this.channels.body.instruction, t, dt) || {}
    const frame = composeFrame(faceOut, bodyOut)
    this._emit('frame', frame)
    return frame
  }

  /** 当前状态快照（调试/面板用） */
  snapshot() {
    return {
      face: this.channels.face.instruction,
      body: this.channels.body.instruction,
      types: INSTRUCTION_TYPES,
    }
  }
}
