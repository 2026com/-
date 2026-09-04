import React, { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display-lipsyncpatch/cubism4'
import { getPetDirector } from '../singleton.js'
import { PARAM_ALIASES } from '../channels.js'

// pixi-live2d-display 部分功能依赖全局 PIXI
if (typeof window !== 'undefined') window.PIXI = PIXI

/**
 * 虚拟桌宠 · Live2D 渲染层（阶段A：官方示例模型 Hiyori）
 *
 * 数据流：Director（全局单例，与 PNG 桌宠/AI 对话/任务执行同一个大脑）
 *   → 每帧 tick 得 modelUpdate（规范参数键）
 *   → 经 PARAM_ALIASES 解析为模型参数 id → setParameterValueById 写入模型
 *   → pixi ticker 负责模型自身更新（物理/眨眼/Idle动作自动播放）
 *
 * 说明：写不进去的参数（模型没有该 id）静默忽略；本组件为阶段A预览形态，
 * 正式模型（阶段D产出）替换路径即可，接口不变。
 */
export function Live2DPet({
  size = 200,              // 显示宽高（正方形画布）
  modelUrl = '/live2d/hiyori/Hiyori.model3.json',
  style = {},
}) {
  const containerRef = useRef(null)

  useEffect(() => {
    let destroyed = false
    let app = null
    let model = null
    let raf = 0

    ;(async () => {
      try {
        app = new PIXI.Application({
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(2, window.devicePixelRatio || 1),
          width: size,
          height: size,
        })
        if (destroyed) { app.destroy(true); return }
        containerRef.current?.appendChild(app.view)

        model = await Live2DModel.from(modelUrl, { autoInteract: false })
        if (destroyed) { model.destroy(); return }
        app.stage.addChild(model)
        // 底部居中缩放
        model.anchor.set(0.5, 1)
        const s = Math.min((size * 0.96) / model.internalModel.originalWidth, (size * 0.96) / model.internalModel.originalHeight)
        model.scale.set(s)
        model.position.set(size / 2, size)

        // 挂到全局 Director（与 PNG 桌宠/AI 对话共享同一个大脑）
        const director = getPetDirector()
        window.__petDirector = director

        // 参数键 → 模型参数 id（规范名优先取第一个别名，即 Cubism 标准写法）
        const resolveId = (key) => PARAM_ALIASES[key]?.[0] || key

        const loop = () => {
          try {
            const frame = director.tick()
            const core = model.internalModel?.coreModel
            if (core?.setParameterValueById) {
              Object.entries(frame.modelUpdate).forEach(([key, v]) => {
                try { core.setParameterValueById(resolveId(key), v) } catch (e) { /* 模型无此参数则忽略 */ }
              })
            }
          } catch (e) { /* 单帧异常不中断 */ }
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      } catch (e) {
        console.error('[Live2DPet] 模型加载失败：', e)
      }
    })()

    return () => {
      destroyed = true
      cancelAnimationFrame(raf)
      try { model?.destroy() } catch (e) { /* ignore */ }
      try { app?.destroy(true, { children: true }) } catch (e) { /* ignore */ }
    }
  }, [size, modelUrl])

  return <div ref={containerRef} style={{ width: size, height: size, pointerEvents: 'none', ...style }} />
}
