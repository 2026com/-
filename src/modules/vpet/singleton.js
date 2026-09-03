/**
 * 虚拟桌宠 · Director 单例
 * 应用内所有触发源（AI 对话、appActions 任务执行、调试面板）共享同一个导演实例，
 * 保证表演状态一致；PngPet 渲染组件默认也消费它。
 */
import { PetDirector } from './director.js'
import { SoullinkFaceExecutor } from './executors/soullinkFaceAdapter.js'
import { Ag99BodyExecutor } from './executors/ag99BodyAdapter.js'

let _singleton = null

export function getPetDirector() {
  if (!_singleton) {
    _singleton = new PetDirector({
      faceExecutor: new SoullinkFaceExecutor(),
      bodyExecutor: new Ag99BodyExecutor(),
    })
    if (typeof window !== 'undefined') window.__petDirector = _singleton // 控制台调试入口
  }
  return _singleton
}
