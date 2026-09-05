import { getPetDirector } from './singleton.js'

/**
 * 虚拟桌宠 · 生命感系统（阶段F）
 * - 待机时每隔随机 18~45 秒插入一个小表演：视线游移/歪头/浅笑（随机挑选）；
 * - 只在双通道都空闲时插入（说话/工作/用户指令进行中绝不打扰）；
 * - 全应用只需启动一次（模块级单例锁）；PngPet 与 Live2DPet 共享。
 */

let timer = null
let running = false

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

export function startIdleSystem(opts = {}) {
  if (running) return
  running = true
  const director = getPetDirector()
  const min = opts.minDelayMs ?? 18000
  const max = opts.maxDelayMs ?? 45000

  const ambient = [
    // 视线游移 + 轻微转头
    () => director.submit({ type: 'motion', name: 'glance', durationMs: rnd(2600, 4800), params: { axisLevels: { gaze_x: rnd(-2, 2), head_yaw: rnd(-1, 1) } } }),
    // 歪头
    () => director.submit({ type: 'motion', name: 'tilt', durationMs: rnd(3000, 4500), params: { axisLevels: { head_roll: rnd(1, 2.5) * (Math.random() < 0.5 ? -1 : 1) } } }),
    // 浅笑
    () => director.submit({ type: 'emote', name: 'happy', durationMs: rnd(2200, 3200), params: { intensity: 0.45 } }),
    // 抬头看天/低头
    () => director.submit({ type: 'motion', name: 'peek', durationMs: rnd(2500, 4000), params: { axisLevels: { head_pitch: rnd(-2, 2) } } }),
  ]

  const loop = () => {
    timer = setTimeout(() => {
      try {
        const s = director.snapshot()
        // 双通道都空闲才插入（speak/emote 优先级高不会被覆盖，motion/work 空闲才插入）
        if (!s.face && !s.body) pick(ambient)()
      } catch (e) { /* 生命感失败不影响主流程 */ }
      loop()
    }, min + Math.random() * (max - min))
  }
  loop()
}

export function stopIdleSystem() {
  if (timer) { clearTimeout(timer); timer = null }
  running = false
}
