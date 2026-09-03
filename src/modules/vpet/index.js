/**
 * 独立模块：虚拟桌宠 · 表演指令控制中心（路径A：应用内桌宠）
 *
 * 分层架构：
 *   大脑(LLM) → Director(本模块：校验/仲裁/队列) → 脸执行器(SoulLink_Live2D 适配器)
 *                                                → 身执行器(AG99live 适配器)
 *             → channels.js 参数分区合并 → Live2D 模型（每帧仅一次写入）
 *
 * 阶段一（当前）：协议+仲裁+分区合并+Mock执行器，全链路可脱离 Live2D 联调；
 * 阶段二：以真实适配器替换 executors/ 下的 Mock（render 契约不变，调用方零改动）。
 */
import { PetDirector } from './director.js'
import { MockFaceExecutor, MockBodyExecutor } from './executors/mockExecutors.js'

export { PetDirector } from './director.js'
export { normalizeInstruction, PRIORITIES, INSTRUCTION_TYPES } from './protocol.js'
export { FACE_PARAMS, BODY_PARAMS, filterByChannel, composeFrame } from './channels.js'
export { MockFaceExecutor, MockBodyExecutor } from './executors/mockExecutors.js'
export { SoullinkFaceExecutor } from './executors/soullinkFaceAdapter.js'
export { Ag99BodyExecutor } from './executors/ag99BodyAdapter.js'
export { AG99_AXIS_CHANNELS, PARAM_ALIASES, PHYSICS_PARAM_KEYWORDS, isPhysicsParam } from './channels.js'
export { PngPet } from './renderer/PngPet.jsx'
export { getPetDirector } from './singleton.js'
export { petReactToReply, petThinking } from './petReact.js'

/** 创建导演实例（默认装配 Mock 执行器；可传入真实适配器替换，契约一致） */
export function createMockDirector(executors = {}) {
  return new PetDirector({
    faceExecutor: executors.faceExecutor || new MockFaceExecutor(),
    bodyExecutor: executors.bodyExecutor || new MockBodyExecutor(),
  })
}
