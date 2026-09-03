import { useEffect, useMemo, useRef } from 'react'
import { PetDirector } from '../director.js'
import { MockFaceExecutor, MockBodyExecutor } from '../executors/mockExecutors.js'
import { SoullinkFaceExecutor } from '../executors/soullinkFaceAdapter.js'
import { Ag99BodyExecutor } from '../executors/ag99BodyAdapter.js'

/**
 * 虚拟桌宠 · PNG 纸片人渲染器（路径B 最小可行版）
 *
 * 原理：整图变体交换 + CSS 变换——不需要 Live2D 运行时与模型文件：
 *  - 头/身角度、呼吸 → 整图的旋转/位移/缩放（基准图即可生效）；
 *  - 眨眼/张嘴 → 切换到对应的整图变体（images.blink / images.mouthOpen，由豆包生成）；
 *  - 驱动源 = Director（modelUpdate 参数 → 渲染映射），渲染器无关：未来换 Live2D 渲染层时组件接口不变。
 *
 * 用法：
 *  <PngPet images={{ base: '/pet/base.png', blink: '/pet/blink.png', mouthOpen: '/pet/mouth.png' }} />
 * 调试：window.__petDirector.submit({ type:'emote', name:'happy' }) 等
 */
export function PngPet({
  images = {},             // { base: 必填, blink?: 闭眼变体, mouthOpen?: 张嘴变体 }
  size = 110,              // 显示高度 px（宽度按图片比例）
  director = null,         // 外部注入 Director；不传则内部创建（Mock 执行器）
  style = {},
  debugExpose = false,     // 挂 window.__petDirector 供控制台调试
  onDirector,              // 创建后将 director 回传给外部（用于 AI 任务联动）
}) {
  const dRef = useRef(null)
  if (!dRef.current) {
    dRef.current = director || new PetDirector({
      faceExecutor: new SoullinkFaceExecutor(),
      bodyExecutor: new Ag99BodyExecutor(),
    })
  }
  const directorRef = dRef.current
  const imgRef = useRef(null)
  const imagesRef = useRef(images)
  imagesRef.current = images

  useEffect(() => {
    if (debugExpose && typeof window !== 'undefined') window.__petDirector = directorRef
    if (onDirector) onDirector(directorRef)
    let raf
    const loop = () => {
      try {
        const frame = directorRef.tick()
        const el = imgRef.current
        if (el) {
          const m = frame.modelUpdate
          // 参数 → 整图变换：头/身角度映射为旋转与位移（幅度取保守值，纸片人观感自然）
          const rot = (m.angleZ || 0) * 0.45 + (m.bodyAngleZ || 0) * 0.35
          const dx = ((m.angleX || 0) * 0.35 + (m.bodyAngleX || 0) * 0.6)
          const dy = ((m.angleY || 0) * 0.3 + (m.bodyAngleY || 0) * 0.4)
          const breath = 1 + (m.breath || 0) * 0.015
          el.style.transform = `translate(${dx.toFixed(2)}%, ${dy.toFixed(2)}%) rotate(${rot.toFixed(2)}deg) scale(${breath.toFixed(3)})`
          // 整图变体交换：眨眼优先级高于张嘴（闭眼时不露口型）；无变体回落基准图
          const eyeOpen = m.eyeOpenL != null ? m.eyeOpenL : 1
          const mouth = m.mouthOpen || 0
          const imgs = imagesRef.current
          const next = (eyeOpen < 0.25 && imgs.blink) ? imgs.blink
            : (mouth > 0.45 && imgs.mouthOpen) ? imgs.mouthOpen
            : imgs.base
          if (next && el.dataset.src !== next) {
            el.dataset.src = next
            el.src = next
          }
        }
      } catch (e) { /* 单帧异常不终止循环 */ }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [directorRef, debugExpose, onDirector])

  return (
    <div style={{ width: size, height: size, pointerEvents: 'none', ...style }}>
      <img
        ref={imgRef}
        src={images.base}
        alt="桌宠"
        draggable={false}
        style={{
          width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom',
          transformOrigin: '50% 88%',   // 以脚部为轴心旋转/缩放，站姿更自然
          willChange: 'transform',
          userSelect: 'none',
        }}
      />
    </div>
  )
}

/** 创建独立 Director 的便捷工厂（供 App 挂载时使用） */
export function usePetDirectorSingleton() {
  return useMemo(() => new PetDirector({
    faceExecutor: new SoullinkFaceExecutor(),
    bodyExecutor: new Ag99BodyExecutor(),
  }), [])
}
