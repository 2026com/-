import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * 星空缩放无关性:缩放(相机拉远/拉近)时按相机距离反向等比缩放星空组,
 * 让天幕的角尺寸保持恒定 —— 星星「不动」,只有图谱本身在缩放。
 *
 * @param {number} [baseDist=170] 基准相机距离(场景单位),该距离下缩放系数为 1
 * @returns {React.RefObject<THREE.Group>} 挂到星空 <group> 上的 ref
 */
export function useSkyParallax(baseDist = 170) {
  const ref = useRef(null)
  useFrame(({ camera, controls }) => {
    const g = ref.current
    if (!g) return
    const dist = controls?.getDistance?.() ?? camera.position.length()
    const k = THREE.MathUtils.clamp(dist / baseDist, 0.5, 2.8)
    g.scale.setScalar(k)
  })
  return ref
}
