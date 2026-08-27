import * as THREE from 'three'

/**
 * 3D 知识图谱共享纹理工厂（Canvas 程序化生成，零外部资源请求，离线 PWA 友好）
 *
 * 统一收口所有 CanvasTexture 的绘制逻辑，避免组件文件膨胀；
 * 所有纹理常驻缓存（getGlowTexture），生成成本只在首次支付。
 */

/** 手写圆角矩形路径（不依赖 ctx.roundRect，兼容旧 WebView） */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 标签胶囊纹理：半透明深色底 + 类别色描边 + 居中文字 */
export function makeLabelTexture(text, accentColor, fontSize = 30) {
  const DPR = 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = `600 ${fontSize}px -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`
  ctx.font = font
  const textW = ctx.measureText(text).width
  const padX = fontSize * 0.6
  const padY = fontSize * 0.36
  const w = Math.ceil(textW + padX * 2)
  const h = Math.ceil(fontSize + padY * 2)
  canvas.width = w * DPR
  canvas.height = h * DPR
  ctx.scale(DPR, DPR)

  roundRectPath(ctx, 1, 1, w - 2, h - 2, h / 2)
  ctx.fillStyle = 'rgba(10, 14, 30, 0.78)'
  ctx.fill()
  ctx.strokeStyle = accentColor
  ctx.lineWidth = 1.8
  ctx.stroke()

  ctx.font = font
  ctx.fillStyle = '#dbe3f4'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + fontSize * 0.04)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { texture, aspect: w / h }
}

/**
 * 径向渐变光晕纹理（lite 模式的节点辉光替代品）
 * 白色核心 → 类别色 → 完全透明，配合 AdditiveBlending 叠加出辉光观感
 */
export function makeGlowTexture(colorHex) {
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  g.addColorStop(0.22, colorHex + 'cc')
  g.addColorStop(0.55, colorHex + '33')
  g.addColorStop(1, colorHex + '00')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * 圆形粒子 Alpha 纹理（HQ 模式白色星点层）
 * 方形 gl_Point 在放大时会出现硬边方块感，用径向 alpha 贴图修圆
 */
export function makeDotTexture() {
  const S = 64
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.4, 'rgba(255, 255, 255, 0.85)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 光晕纹理缓存（按类别色共享，避免重复生成） */
const glowCache = new Map()
export function getGlowTexture(colorHex) {
  if (!glowCache.has(colorHex)) glowCache.set(colorHex, makeGlowTexture(colorHex))
  return glowCache.get(colorHex)
}
