import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { makeDotTexture } from '../../../knowledge-base/services/graphTextures.js'
import { useAppTheme } from '../../../../services/theme.js'
import { dbGet, dbSet } from '../../../../services/db.js'
import { useSurfaceBackground, useSurfaceParams } from '../../../../services/backgrounds.js'
import LibraryDrawer from './memory-libs/LibraryDrawer.jsx'
import { loadLibs, saveLibs, libToPages, DEFAULT_LIB_ID } from './memory-libs/memoryLibs.js'

/**
 * 3D 记忆库 —— 「记忆环绕」V3（纯新增组件）
 *
 * 意象：角色站在原地不动（视角俯仰受限，不是全景 VR），
 * 记录的内容环绕着角色缓缓旋转。两种形态（右上角按钮切换）：
 *  - 📄 纸张模式：许多张「纸」围绕角色旋转，照片画在纸里随纸一起转；
 *  - ✨ 文字模式：纸张隐藏，只余黑金/墨色文字星河。
 * 文字有竖排 / 横排两种（按钮循环切换：竖排 → 横排 → 混合）。
 * 跟随应用深浅色主题：深色 = 黑金星河（现有样子），浅色 = 白纸墨字。
 * 数据只读：由画廊传入 pages，本组件不写任何存储。
 */

const GOLD = ['#ffd98a', '#f5c86b', '#ffe9bd', '#e8b04b']          // 深色主题文字色
/** 手机端判定：移动端默认走流畅档 + 更低的渲染分辨率（3D 星空在手机上满血跑不动） */
const IS_MOBILE_DEVICE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
const DEMO = typeof window !== 'undefined' && window.location.search.includes('gallerydemo')
const INK = ['#4a4038', '#63513d', '#3c3c3c', '#7a5c3d']           // 浅色主题文字色
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const FONT = '"Kaiti SC", "STKaiti", KaiTi, "Noto Serif SC", "SimSun", serif'

// ===== 演示模式：生成约 50 张不同的纸张（只读示范；不读不写任何真实数据） =====
function demoPhoto(w, h, label, c1, c2, seed) {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, c1); g.addColorStop(1, c2)
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = `bold ${Math.round(Math.min(w, h) / 7)}px sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, w / 2, h / 2)
  return { id: 'demoph' + seed + w, dataUrl: canvas.toDataURL('image/jpeg', 0.85) }
}

const DEMO_TEXTS = [
  '把今天的待办一件件划掉，剩下的时间完全属于自己。原来从容是攒出来的。',
  '傍晚散步时看到一整片火烧云，站在路边看了十分钟，什么都没想。',
  '读到一句话：焦虑的反面是具体。把事情拆小，心就静了。',
  '坚持第 21 天，早起已经不那么难了。习惯是身体先于意志记住的。',
  '和朋友打了很久的电话，有些情绪说出来就轻了一半。',
  '尝试了新的路线回家，陌生街角有家很香的面馆。',
  '今天效率不高，但允许自己慢一天，明天再出发。',
  '给窗台的绿萝浇了水，顺手擦了叶子。照顾点什么，心情会变好。',
  '晚上跑了三公里，最后一公里靠意志。跑完的畅快是真的。',
  '把三年前的照片翻出来看，那时候的烦恼现在都变成了故事。',
  '学会了做一道新菜，卖相一般但味道在线。',
  '下午的阳光正好落在书页上，读到忘了时间。',
  '把房间收拾了一遍，干净的空间真的会让脑子也清爽。',
  '睡前放下手机，看了几页纸质书，入睡比平时快了很多。',
  '记下一个小灵感：把每周的复盘画成一张导图，下次试试。',
  '今天什么特别的都没发生，但平静的一天就很难得。',
]

/** 构建约 50 张演示页：近 50 天每天一页，约八成有文字、约四成带示例照片（确定性生成，稳定不闪变） */
function buildDemoMemoryPages() {
  const pages = []
  const today = new Date()
  for (let i = 49; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const k = (i * 7) % 10
    const photos = []
    if (k === 6) photos.push(demoPhoto(300, 470, '竖拍示例', '#6366f1', '#a855f7', i))
    if (k === 8) photos.push(demoPhoto(470, 300, '横拍示例', '#0ea5e9', '#22d3ee', i))
    if (k === 9) {
      photos.push(demoPhoto(300, 470, '竖拍示例', '#f59e0b', '#ef4444', i))
      photos.push(demoPhoto(470, 300, '横拍示例', '#10b981', '#0ea5e9', i + 500))
    }
    const text = k === 0 ? '' : DEMO_TEXTS[i % DEMO_TEXTS.length]
    if (!text && photos.length === 0) continue  // 少数空白日跳过，保持内容密度
    pages.push({ id: 'demopg' + i, date, text, photos })
  }
  return pages
}

/** 环上均匀抽样：实例数超出性能上限时按序等距取点——整圈照常铺满，不会集中到开头一段弧 */
function sampleEvenAroundRing(list, cap) {
  if (list.length <= cap) return list
  const step = list.length / cap
  const picked = []
  for (let i = 0; i < cap; i++) picked.push(list[Math.floor(i * step)])
  return picked
}

const headerOf = (ds) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || '')
  if (!m) return '新的一页'
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日 · ${WEEKDAYS[d.getDay()]}`
}

function detectWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

// ============ 画质档位（对齐知识宇宙的双档制）============

const QUALITY_KEY = 'memoryUniverse.quality.v1'
function readQualityPref() {
  try {
    const v = dbGet(QUALITY_KEY)
    if (v === 'hq' || v === 'lite' || v === 'auto') return v
  } catch { /* 读不到就回默认 */ }
  return 'auto'
}
function writeQualityPref(v) {
  try { dbSet(QUALITY_KEY, v) } catch { /* 忽略写入失败 */ }
}
function cycleQualityPref(pref) {
  return pref === 'auto' ? 'hq' : pref === 'hq' ? 'lite' : 'auto'
}

/** 低端设备启发式（auto 档启动分级依据；运行时 PerfGuard 二次修正）：仅真低配机降流畅，手机不再一刀切 */
function detectLowEndDevice() {
  if (typeof navigator === 'undefined') return false
  try {
    const mem = navigator.deviceMemory
    const cores = navigator.hardwareConcurrency
    const c = document.createElement('canvas')
    const hasWebGL2 = !!c.getContext('webgl2')
    return hasWebGL2 === false || (mem != null && mem <= 2) || (cores != null && cores <= 4)
  } catch {
    return true
  }
}

/** 运行时性能监测：连续 2 个窗口（每个 2 秒）fps < 26 → 自动切入流畅模式（终态，不改用户偏好） */
function PerfGuard({ onLite }) {
  const frames = useRef(0)
  const windowStart = useRef(performance.now())
  const lowStreak = useRef(0)
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    frames.current++
    const now = performance.now()
    const elapsed = now - windowStart.current
    if (elapsed >= 2000) {
      const fps = (frames.current / elapsed) * 1000
      frames.current = 0
      windowStart.current = now
      if (fps < 26) lowStreak.current += 1
      else lowStreak.current = 0
      if (lowStreak.current >= 2) {
        done.current = true
        onLite()
      }
    }
  })
  return null
}

/** 固定种子伪随机（布局稳定可复现） */
function makeRand(seed) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

// ============ 文字纹理工厂 ============

/** 竖排文字：金色/墨色 + 柔和辉光（画两遍） */
function makeVerticalTextTexture(text, { color = '#ffd98a', fontSize = 52, glow = 22 } = {}) {
  const chars = [...text]
  const DPR = 2
  const w = Math.ceil(fontSize * 1.9)
  const step = fontSize * 1.14
  const h = Math.ceil(chars.length * step + fontSize * 0.7)
  const canvas = document.createElement('canvas')
  canvas.width = w * DPR
  canvas.height = h * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)
  ctx.font = `600 ${fontSize}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.fillStyle = color
  ctx.shadowBlur = glow * 1.6
  const draw = () => chars.forEach((ch, i) => ctx.fillText(ch, w / 2, fontSize * 0.55 + i * step))
  draw()
  ctx.shadowBlur = glow * 0.6
  draw()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, aspect: w / h }
}

/** 横排文字（单行） */
function makeHorizontalTextTexture(text, { color = '#ffd98a', fontSize = 52, glow = 22 } = {}) {
  const DPR = 2
  const canvas = document.createElement('canvas')
  const ctx0 = canvas.getContext('2d')
  ctx0.font = `600 ${fontSize}px ${FONT}`
  const w = Math.ceil(ctx0.measureText(text).width + fontSize * 1.4)
  const h = Math.ceil(fontSize * 1.9)
  canvas.width = w * DPR
  canvas.height = h * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)
  ctx.font = `600 ${fontSize}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.fillStyle = color
  ctx.shadowBlur = glow * 1.6
  const draw = () => ctx.fillText(text, w / 2, h / 2)
  draw()
  ctx.shadowBlur = glow * 0.6
  draw()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, aspect: w / h }
}

/** 小号横排日期纹理（低调） */
function makeDateTexture(text, color = '#c9a24b') {
  const fontSize = 40
  const DPR = 2
  const canvas = document.createElement('canvas')
  const ctx0 = canvas.getContext('2d')
  ctx0.font = `500 ${fontSize}px ${FONT}`
  const w = Math.ceil(ctx0.measureText(text).width + fontSize)
  const h = Math.ceil(fontSize * 1.7)
  canvas.width = w * DPR
  canvas.height = h * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)
  ctx.font = `500 ${fontSize}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.shadowBlur = 16
  ctx.fillStyle = color
  ctx.globalAlpha = 0.9
  ctx.fillText(text, w / 2, h / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, aspect: w / h }
}

/** 纸张纹理：米白纸底 + 日期 + 正文（横排/竖排）+ 底部照片（照片加载完成后重绘） */
const PAPER_W = 360
const PAPER_H = 500
function drawPaper(canvas, page, colors, imgs, vertical) {
  const DPR = 2
  canvas.width = PAPER_W * DPR
  canvas.height = PAPER_H * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)
  // 纸底 + 边框
  ctx.fillStyle = colors.paperBg
  ctx.fillRect(0, 0, PAPER_W, PAPER_H)
  ctx.strokeStyle = colors.paperBorder
  ctx.lineWidth = 4
  ctx.strokeRect(6, 6, PAPER_W - 12, PAPER_H - 12)
  ctx.strokeStyle = colors.paperLine
  ctx.lineWidth = 1
  for (let y = 110; y < PAPER_H - 30; y += 44) {
    ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(PAPER_W - 28, y); ctx.stroke()
  }
  // 日期
  ctx.font = `600 26px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colors.paperDate
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(page.date || '')
  ctx.fillText(m ? `${m[1]}.${m[2]}.${m[3]}` : '', PAPER_W / 2, 44)
  // 正文
  const lines = []
  for (const raw of (page.text || '').split('\n')) {
    let rest = raw.trim()
    if (!rest) continue
    while (rest.length) { lines.push(rest.slice(0, 11)); rest = rest.slice(11) }
  }
  if (vertical) {
    // 竖排：从右往左分列，每列 7 字（古籍式排布）
    ctx.font = `500 26px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = colors.paperText
    const flat = lines.join('')
    const cols = []
    for (let i = 0; i < flat.length && cols.length < 6; i += 7) cols.push(flat.slice(i, i + 7))
    cols.forEach((col, ci) => {
      const cx = PAPER_W - 52 - ci * 44
      ;[...col].forEach((ch, ri) => ctx.fillText(ch, cx, 95 + ri * 30))
    })
    if (flat.length > 42) ctx.fillText('……', PAPER_W - 52 - 6 * 44, 95)
  } else {
    ctx.font = `500 27px ${FONT}`
    ctx.fillStyle = colors.paperText
    ctx.textAlign = 'left'
    lines.slice(0, 8).forEach((ln, i) => ctx.fillText(ln, 34, 82 + i * 44))
    if (lines.length > 8) ctx.fillText('……', 34, 82 + 8 * 44)
  }
  // 照片（画在纸的底部，随纸一起旋转）
  const slotY = PAPER_H - 190
  const slotW = 145
  const slotH = 150
  imgs.forEach((img, i) => {
    const x = 34 + i * (slotW + 12)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, slotY, slotW, slotH)
    const scale = Math.min(slotW / img.width, slotH / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, x + (slotW - dw) / 2, slotY + (slotH - dh) / 2, dw, dh)
  })
  if (page.photos?.length && imgs.length < page.photos.length) {
    ctx.font = `500 22px ${FONT}`
    ctx.fillStyle = colors.paperDate
    ctx.fillText(`+${page.photos.length - imgs.length} 张照片`, 34 + imgs.length * (slotW + 12) + 8, slotY + slotH / 2)
  }
}

// ============ 场景组件 ============

/** 背景微尘：跟随主题的暖色/冷灰微尘（流畅档粒子减量） */
function Dust({ dark, lite, brightness = 1 }) {
  const dotMap = useMemo(() => makeDotTexture(), [])
  useEffect(() => () => dotMap.dispose(), [dotMap])
  const layers = useMemo(() => {
    const mk = (count, rMin, rMax) => {
      const arr = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const r = rMin + Math.random() * (rMax - rMin)
        const th = Math.random() * Math.PI * 2
        const ph = Math.acos(2 * Math.random() - 1)
        arr[i * 3] = r * Math.sin(ph) * Math.cos(th)
        arr[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th)
        arr[i * 3 + 2] = r * Math.cos(ph)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
      return g
    }
    return [
      { geo: mk(lite ? 160 : 380, 18, 60), size: 0.7 },
      { geo: mk(lite ? 60 : 130, 16, 46), size: 1.3 },
    ]
  }, [lite])
  useEffect(() => () => layers.forEach(l => l.geo.dispose()), [layers])
  const m0 = useRef(null)
  const m1 = useRef(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // brightness 为外观参数倍率（星尘亮度）
    if (m0.current) m0.current.opacity = ((dark ? 0.4 : 0.28) + Math.sin(t * 0.3) * 0.08) * brightness
    if (m1.current) m1.current.opacity = ((dark ? 0.5 : 0.34) + Math.sin(t * 0.7 + 2) * 0.12) * brightness
  })
  return (
    <group>
      <points geometry={layers[0].geo} raycast={() => null}>
        <pointsMaterial ref={m0} size={layers[0].size} color={dark ? '#caa25e' : '#9c8b6a'} map={dotMap} transparent opacity={0.4} sizeAttenuation depthWrite={false} />
      </points>
      <points geometry={layers[1].geo} raycast={() => null}>
        <pointsMaterial ref={m1} size={layers[1].size} color={dark ? '#ffe3a6' : '#b3a077'} map={dotMap} transparent opacity={0.5} sizeAttenuation depthWrite={false} />
      </points>
    </group>
  )
}

/** 季节色相：文字颜色随记录月份流转（春青金 → 夏暖金 → 秋琥珀 → 冬月白） */
function seasonalColors(month, dark) {
  const s = (month >= 3 && month <= 5) ? 0 : (month >= 6 && month <= 8) ? 1 : (month >= 9 && month <= 11) ? 2 : 3
  const P = dark
    ? [['#cde8c0', '#b8dcae'], ['#ffd98a', '#ffe9bd'], ['#f0b054', '#e89b3c'], ['#dfe6f2', '#cdd6ea']]
    : [['#4f7a52', '#5d8a60'], ['#6b5340', '#7a5f45'], ['#8a5a2e', '#96682f'], ['#4a5568', '#57647a']]
  return P[s][month % 2]
}

/** 单条文字星：竖排/横排纹理，面向球心，呼吸微光；边缘渐隐/退缩 + 深度薄雾 + 开场聚拢 + 聚焦淡出 */
function TextStar({ strip, onTap, focusOn, focusPageId, introDelay = 0, brightness = 1, lite = false }) {
  const groupRef = useRef(null)
  const matRef = useRef(null)
  const focusK = useRef(0)
  const frameNo = useRef(0)
  const { camera } = useThree()
  const v3 = useMemo(() => new THREE.Vector3(), [])
  const base = useMemo(() => new THREE.Vector3(...strip.pos), [strip.pos])
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])

  const tex = useMemo(() => (
    strip.date
      ? makeDateTexture(strip.text, strip.color)
      : strip.vert
        ? makeVerticalTextTexture(strip.text, { color: strip.color })
        : makeHorizontalTextTexture(strip.text, { color: strip.color })
  ), [strip.text, strip.color, strip.date, strip.vert])
  useEffect(() => () => tex.texture.dispose(), [tex])

  useFrame(({ clock }, dt) => {
    // 隔帧更新：流畅档隔帧；手机端即便高清档也隔帧（30fps 动画肉眼无感，JS 成本减半）
    frameNo.current++
    if ((lite || IS_MOBILE_DEVICE) && frameNo.current % 2 === 0) return
    const t = clock.elapsedTime
    let edgeF = 1
    let fogF = 1
    // #1 开场聚拢：按序均匀逐个浮现（introDelay 均匀递增 → 出场量恒定），总时长约 3 秒
    const it = THREE.MathUtils.clamp((t - introDelay) / 1.4, 0, 1)
    const ease = it * it * (3 - 2 * it)
    // #2 点击聚焦：被点中的那条向我们飘近并稍微放大，其余不受影响
    const isFocused = focusOn && focusPageId === strip.pageId
    focusK.current += ((isFocused ? 1 : 0) - focusK.current) * Math.min(1, dt * 3)
    const pull = 0.22 * focusK.current
    if (groupRef.current) {
      const f = (1 + Math.sin(t * 0.3 + phase) * 0.008) * (2.6 - 1.6 * ease) * (1 - pull)
      groupRef.current.position.set(base.x * f, base.y * f, base.z * f)
      // 方案A+B：屏幕边缘渐隐 + 轻微退缩；深度薄雾：远处更朦胧
      if (lite) {
        // 流畅档：雾用构建期常量、跳过逐帧屏幕投影（camera.project 是最贵的每帧运算）
        edgeF = 1
        fogF = strip.fog || 1
      } else {
        groupRef.current.getWorldPosition(v3)
        const dist = v3.length()
        v3.project(camera)
        const edge = Math.max(Math.abs(v3.x), Math.abs(v3.y))
        edgeF = 1 - THREE.MathUtils.smoothstep(edge, 0.78, 0.99)
        fogF = THREE.MathUtils.clamp(1.3 - dist / 75, 0.55, 1)
      }
      groupRef.current.scale.setScalar((0.78 + 0.22 * edgeF) * (0.55 + 0.45 * ease) * (1 + 0.3 * focusK.current))
    }
    if (matRef.current) matRef.current.opacity = strip.bright * (0.82 + Math.sin(t * 0.7 + phase) * 0.18) * edgeF * fogF * ease * brightness
  })

  return (
    <group ref={groupRef} position={strip.pos}>
      <Billboard>
        <mesh raycast={() => null}>
          <planeGeometry args={[strip.worldH * tex.aspect, strip.worldH]} />
          <meshBasicMaterial
            ref={matRef}
            map={tex.texture}
            transparent
            opacity={strip.bright}
            depthWrite={false}
            blending={strip.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        {/* 点击热区 */}
        <mesh position={[0, 0, -0.1]} onClick={(e) => { e.stopPropagation(); onTap(strip.pageId) }}>
          <planeGeometry args={[Math.max(3, strip.worldH * tex.aspect), Math.max(4, strip.worldH)]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

/** 星尘尾迹：纸张转过时身后飘落几粒渐隐金尘 */
function PaperTrail({ dark }) {
  const refs = useRef([])
  const phases = useMemo(() => [0.1, 0.45, 0.8], [])
  const dotMap = useMemo(() => makeDotTexture(), [])
  useEffect(() => () => dotMap.dispose(), [dotMap])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    phases.forEach((ph, i) => {
      const el = refs.current[i]
      if (!el) return
      const k = (t * 0.45 + ph) % 1
      el.position.set((i - 1) * 1.4, -k * 5, -k * 3)
      el.material.opacity = (1 - k) * (dark ? 0.5 : 0.32)
    })
  })
  return (
    <group>
      {phases.map((ph, i) => (
        <Billboard key={i}>
          <mesh ref={(el) => { refs.current[i] = el }} raycast={() => null}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial map={dotMap} color={dark ? '#ffe3a6' : '#9c8b6a'} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        </Billboard>
      ))}
    </group>
  )
}

/** 纸张星：一张纸（日期+正文横竖排+照片画在纸里）绕角色旋转；开场聚拢 + 聚焦淡出 */
/** 纸张星：一张纸（日期+正文横竖排+照片画在纸里）绕角色旋转；开场聚拢 + 聚焦淡出 */
function PaperStar({ paper, colors, dark, vertical, onTap, focusOn, focusPageId, introDelay = 0, lite = false }) {
  const groupRef = useRef(null)
  const matRef = useRef(null)
  const focusK = useRef(0)
  const frameNo = useRef(0)
  const { camera } = useThree()
  const v3 = useMemo(() => new THREE.Vector3(), [])
  const base = useMemo(() => new THREE.Vector3(...paper.pos), [paper.pos])
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])
  const canvasRef = useRef(null)
  const imgsRef = useRef([])

  const built = useMemo(() => {
    const canvas = document.createElement('canvas')
    drawPaper(canvas, paper, colors, [], vertical)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    canvasRef.current = canvas
    return texture
  }, [paper, colors, vertical])
  useEffect(() => () => built.dispose(), [built])

  // 照片异步加载：每张加载完成后重绘整张纸（照片成为纸的一部分）
  useEffect(() => {
    const redraw = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      drawPaper(canvas, paper, colors, imgsRef.current, vertical)
      built.needsUpdate = true
    }
    const loaders = (paper.photos || []).slice(0, 2).map((ph) => {
      const img = new Image()
      img.onload = () => { imgsRef.current.push(img); redraw() }
      img.src = ph.dataUrl
      return img
    })
    return () => { loaders.forEach(l => { l.onload = null }) }
  }, [paper, colors, built, vertical])

  useFrame(({ clock }, dt) => {
    // 隔帧更新：流畅档隔帧；手机端即便高清档也隔帧（30fps 动画肉眼无感，JS 成本减半）
    frameNo.current++
    if ((lite || IS_MOBILE_DEVICE) && frameNo.current % 2 === 0) return
    const t = clock.elapsedTime
    let edgeF = 1
    let fogF = 1
    // #1 开场聚拢：按序均匀逐个浮现
    const it = THREE.MathUtils.clamp((t - introDelay) / 1.4, 0, 1)
    const ease = it * it * (3 - 2 * it)
    // #2 点击聚焦：被点中的那张纸向我们飘近并稍微放大，其余纸张照常旋转
    const isFocused = focusOn && focusPageId === paper.id
    focusK.current += ((isFocused ? 1 : 0) - focusK.current) * Math.min(1, dt * 3)
    const pull = 0.24 * focusK.current
    if (groupRef.current) {
      const f = (1 + Math.sin(t * 0.3 + phase) * 0.006) * (2.2 - 1.2 * ease) * (1 - pull)
      groupRef.current.position.set(base.x * f, base.y * f, base.z * f)
      // 方案A+B：屏幕边缘渐隐 + 轻微退缩；深度薄雾
      if (lite) {
        // 流畅档：雾用构建期常量、跳过逐帧屏幕投影（camera.project 是最贵的每帧运算）
        edgeF = 1
        fogF = paper.fog || 1
      } else {
        groupRef.current.getWorldPosition(v3)
        const dist = v3.length()
        v3.project(camera)
        const edge = Math.max(Math.abs(v3.x), Math.abs(v3.y))
        edgeF = 1 - THREE.MathUtils.smoothstep(edge, 0.8, 0.99)
        fogF = THREE.MathUtils.clamp(1.3 - dist / 60, 0.6, 1)
      }
      groupRef.current.scale.setScalar((0.8 + 0.2 * edgeF) * (0.6 + 0.4 * ease) * (1 + 0.3 * focusK.current))
    }
    if (matRef.current) matRef.current.opacity = (0.92 + Math.sin(t * 0.6 + phase) * 0.08) * edgeF * fogF * ease
  })

  return (
    <group ref={groupRef} position={paper.pos}>
      <PaperTrail dark={dark} />
      <Billboard>
        <mesh raycast={() => null}>
          <planeGeometry args={[paper.worldH * (PAPER_W / PAPER_H), paper.worldH]} />
          <meshBasicMaterial ref={matRef} map={built} transparent opacity={0.95} toneMapped={false} />
        </mesh>
        {/* 点击热区 */}
        <mesh position={[0, 0, -0.1]} onClick={(e) => { e.stopPropagation(); onTap(paper.id) }}>
          <planeGeometry args={[paper.worldH * (PAPER_W / PAPER_H), paper.worldH]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

/** 点击纸张：细小的金色颗粒从纸张矩形边框抖落，向观察者飘来、微带下坠 */
function ShakeDust({ pos, w = 6, h = 6, dark }) {
  const refs = useRef([])
  const mats = useRef([])
  const dotMap = useMemo(() => makeDotTexture(), [])
  useEffect(() => () => dotMap.dispose(), [dotMap])
  const start = useRef(performance.now())
  const hw = (w / 2) * 1.03
  const hh = (h / 2) * 1.03
  // 金尘颗粒：沿纸张边框取样（细小、颗粒感足），主方向 = 指向观察者（球心）+ 随机散布
  const parts = useMemo(() => {
    const towardViewer = new THREE.Vector3(...pos).normalize().negate()
    const per = 2 * (w + h)
    return Array.from({ length: 22 }, (_, i) => {
      let d0 = ((i / 22) * per + Math.random() * (per / 22)) % per
      let x, y
      if (d0 < w) { x = -hw + d0; y = -hh }
      else if (d0 < w + h) { x = hw; y = -hh + (d0 - w) }
      else if (d0 < 2 * w + h) { x = hw - (d0 - w - h); y = hh }
      else { x = -hw; y = hh - (d0 - 2 * w - h) }
      const toward = towardViewer.clone().multiplyScalar(0.8 + Math.random() * 0.5)
      const spread = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.7, Math.random() - 0.5).multiplyScalar(0.35)
      const d = toward.add(spread).normalize()
      return { d, sp: 5 + Math.random() * 4, x, y }
    })
  }, [pos, w, h])
  useFrame(() => {
    const k = Math.min(1, (performance.now() - start.current) / 1200)
    parts.forEach((p, i) => {
      const el = refs.current[i]
      if (el) el.position.set(p.x + p.d.x * k * p.sp, p.y + p.d.y * k * p.sp - k * k * 0.5, p.d.z * k * 2)
      const m = mats.current[i]
      if (m) m.opacity = (1 - k) * (dark ? 0.75 : 0.55)
    })
  })
  return (
    <group position={pos}>
      {parts.map((_, i) => (
        <Billboard key={i}>
          <mesh ref={(el) => { refs.current[i] = el }} raycast={() => null}>
            <planeGeometry args={[0.34, 0.34]} />
            <meshBasicMaterial ref={(m) => { mats.current[i] = m }} map={dotMap} color={dark ? '#ffe3a6' : '#8a6d3b'} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        </Billboard>
      ))}
    </group>
  )
}

/** 偶发流星：每隔十几秒一颗金色流星在远景划过 */
function Meteor({ dark }) {
  const ref = useRef(null)
  const matRef = useRef(null)
  const st = useRef({ active: false, t: 0, next: performance.now() + 5000, from: new THREE.Vector3(), to: new THREE.Vector3() })
  useFrame(() => {
    const s = st.current
    const now = performance.now()
    if (!s.active && now >= s.next) {
      const a = Math.random() * Math.PI * 2
      const y = 0.25 + Math.random() * 0.45
      const R = 58
      s.from.set(Math.sin(a) * R, y * R, -Math.cos(a) * R)
      s.to.set(s.from.x + (Math.random() - 0.5) * 46, s.from.y - 14 - Math.random() * 14, s.from.z + (Math.random() - 0.5) * 12)
      s.t = 0
      s.active = true
    }
    if (s.active) {
      s.t += 0.012
      const k = Math.min(1, s.t)
      if (ref.current) ref.current.position.lerpVectors(s.from, s.to, k)
      if (matRef.current) matRef.current.opacity = Math.sin(k * Math.PI) * (dark ? 0.9 : 0.55)
      if (k >= 1) { s.active = false; s.next = now + 9000 + Math.random() * 10000 }
    }
  })
  return (
    <Billboard ref={ref}>
      <mesh raycast={() => null}>
        <planeGeometry args={[3.2, 0.55]} />
        <meshBasicMaterial ref={matRef} color={dark ? '#ffe9bd' : '#9c8b6a'} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </Billboard>
  )
}

/** 天空组：聚焦时只有被点中的那张飘近放大，其余照常旋转 */
function SkyDome({ children, faceAngles, skyRef, dragRef, targetScaleRef, pulseRef, ripples, dark, speed = 1 }) {
  const innerRef = useRef(null)
  useFrame((_, dt) => {
    const g = innerRef.current
    if (!g) return
    // 100 秒转一圈（speed 为外观参数倍率，AI 可调）；拖动时暂停
    if (!dragRef.current.on) g.rotation.y += dt * (Math.PI * 2 / 100) * speed
    pulseRef.current = Math.max(0, pulseRef.current - dt * 1.8)
    const s = (g.scale.x + (targetScaleRef.current - g.scale.x) * Math.min(1, dt * 3)) * (1 + 0.05 * pulseRef.current)
    g.scale.setScalar(s)
  })
  return (
    <group ref={skyRef}>
      <group ref={innerRef} rotation={[faceAngles.x, faceAngles.y, 0]}>
        {children}
        {ripples.map(r => <ShakeDust key={r.key} pos={r.pos} w={r.w} h={r.h} dark={dark} />)}
      </group>
    </group>
  )
}

export default function MemoryUniverse3D({ pages = [], startIndex = null, onBack }) {
  const [canWebGL] = useState(detectWebGL)
  const [selectedId, setSelectedId] = useState(null)
  const [showPapers, setShowPapers] = useState(true)   // 📄 纸张模式 ⇄ 纯文字模式
  const [orient, setOrient] = useState('mix')          // 文字方向：'v' | 'h' | 'mix'
  const theme = useAppTheme()
  const dark = theme === 'dark'
  // 背景/皮肤（纯新增）：AI 或图片换背景后即时生效；默认 null = 保留原主题星空
  const bgStyle = useSurfaceBackground('memory')
  // 外观参数（纯新增）：旋转速度等，AI 调节后即时生效
  const memoryParams = useSurfaceParams('memory')
  const skyRef = useRef(null)
  const targetScaleRef = useRef(1)
  const dragRef = useRef({ on: false, x: 0, y: 0, moved: false })
  const pinchRef = useRef(null)
  const pulseRef = useRef(0)                           // 记忆涟漪的镜头脉冲
  const [ripples, setRipples] = useState([])           // 点击记忆时的金色涟漪
  const [pureMode, setPureMode] = useState(false)      // 纯净模式：隐藏右上角按钮（联动全局 ⛶ 悬浮球）

  // 联动全局纯净模式（App 层切换后广播 app:pure-mode）
  useEffect(() => {
    const handler = (e) => setPureMode(!!(e.detail && e.detail.on))
    window.addEventListener('app:pure-mode', handler)
    return () => window.removeEventListener('app:pure-mode', handler)
  }, [])

  // ===== 画质档位（对齐知识宇宙）：⚙️自动（按设备+运行时监测）/ ✨高清 / 🍃流畅 =====
  const [qualityPref, setQualityPref] = useState(readQualityPref)
  const [liteMode, setLiteMode] = useState(detectLowEndDevice)
  const [notice, setNotice] = useState(null)
  const noticeTimer = useRef(null)
  const pushNotice = useCallback((text) => {
    setNotice(text)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 2800)
  }, [])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  useEffect(() => {
    if (qualityPref === 'hq') setLiteMode(false)
    else if (qualityPref === 'lite') setLiteMode(true)
    else setLiteMode(detectLowEndDevice())
  }, [qualityPref])
  const changeQualityPref = useCallback((next) => {
    setQualityPref(next)
    writeQualityPref(next)
  }, [])

  // 主题色板
  const colors = useMemo(() => (dark ? {
    textPalette: GOLD,
    dateColor: '#c9a24b',
    paperBg: '#efe6cf', paperBorder: '#c9b384', paperLine: 'rgba(160,130,80,0.25)',
    paperText: '#463928', paperDate: '#8a6d3b',
  } : {
    textPalette: INK,
    dateColor: '#8a6d3b',
    paperBg: '#fffdf6', paperBorder: '#b3a37e', paperLine: 'rgba(120,100,70,0.22)',
    paperText: '#3a3a3a', paperDate: '#8a6d3b',
  }), [dark])

  // ===== 多记忆库：默认库 = 横线本实时镜像；其他库 = 批量导入的内容 =====
  const [libs, setLibs] = useState(loadLibs)
  const [libId, setLibId] = useState(DEFAULT_LIB_ID)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const activeLib = libs.find(l => l.id === libId) || null
  const activeLibName = libId === DEFAULT_LIB_ID ? '横线本' : (activeLib ? activeLib.name : '横线本')
  // ===== 数据视图双轨（对齐知识库）：'user' = 我的记忆 | 'demo' = 演示记忆（约 50 张示范，只读） =====
  const [viewMode, setViewMode] = useState('user')
  const demoPages = useMemo(() => (viewMode === 'demo' ? buildDemoMemoryPages() : null), [viewMode])
  const activePages = useMemo(() => {
    if (viewMode === 'demo') return demoPages || []
    if (libId === DEFAULT_LIB_ID) return pages
    return libToPages(activeLib)
  }, [viewMode, demoPages, libId, activeLib, pages])

  const commitImport = useCallback(({ targetId, newName, entries }) => {
    const libsNow = loadLibs()
    let id2 = targetId
    if (!id2) {
      id2 = 'lib_' + Date.now().toString(36)
      libsNow.push({ id: id2, name: newName, icon: '✨', source: 'import', createdAt: Date.now(), entries })
    } else {
      const i = libsNow.findIndex(l => l.id === id2)
      if (i >= 0) libsNow[i] = { ...libsNow[i], entries: [...(libsNow[i].entries || []), ...entries] }
    }
    saveLibs(libsNow)
    setLibs(libsNow)
    setLibId(id2)
    setDrawerOpen(false)
  }, [])

  const deleteLibById = useCallback((id) => {
    const libsNow = loadLibs().filter(l => l.id !== id)
    saveLibs(libsNow)
    setLibs(libsNow)
    if (libId === id) setLibId(DEFAULT_LIB_ID)
  }, [libId])

  // ===== 时间环：有内容的内容页按时间顺序均匀绕一圈（旋转 = 时间往前流动）=====
  const contentPages = useMemo(() => {
    const list = []
    activePages.forEach((p, pi) => {
      const hasText = !!(p && p.text && p.text.trim())
      const hasPhoto = Array.isArray(p && p.photos) && p.photos.length > 0
      if (!hasText && !hasPhoto) return
      list.push({ p, pi, id: p.id || `pg${pi}` })
    })
    return list
  }, [activePages])

  // 某一页在时间环上的方位角：等分圆周（均匀，不扎堆）；高度由各分身连续随机散布
  const ringOf = useCallback((rank) => {
    const total = Math.max(1, contentPages.length)
    return {
      a: (Math.PI * 2 * rank) / total,
    }
  }, [contentPages])

/** 高度均匀铺满整个纵向区间（四层循环 + 抖动），不偏向某一条线 */
const HEIGHT_LEVELS = [-0.26, -0.02, 0.26, 0.5]
const levelY = (rand, i) => Math.max(-0.3, Math.min(0.58, HEIGHT_LEVELS[i % HEIGHT_LEVELS.length] + (rand() - 0.5) * 0.14))

  // ===== 文字条构建（按时间环定位；竖/横混合标记）=====
  const strips = useMemo(() => {
    const rand = makeRand(0x9e3779b9)
    const out = []
    contentPages.forEach(({ p, id }, rank) => {
      const { a } = ringOf(rank)
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.date || '')
      const dateShort = m ? `${Number(m[2])}/${Number(m[3])}` : ''
      const month = m ? Number(m[2]) : 1
      const lines = (p.text || '').split('\n').map(t => t.trim()).filter(Boolean)
      const segs = []
      for (const line of lines) {
        let rest = line
        while (rest.length) {
          const n = 6 + Math.floor(rand() * 4)
          segs.push(rest.slice(0, n))
          rest = rest.slice(n)
        }
      }
      if (segs.length === 0 && p.photos?.length) segs.push('📷 照片记忆')
      if (dateShort) {
        const r = showPapers ? 14 + rand() * 5 : 28 + rand() * 12   // 纸张模式下日期也浮在纸前
        const aa = a + 0.06
        const yy = levelY(rand, rank)
        const rrh = Math.sqrt(Math.max(0.05, 1 - Math.min(0.92, yy * yy)))
        out.push({
          id: `${id}-date`, pageId: id, date: true, text: dateShort,
          pos: [rrh * Math.sin(aa) * r, yy * r, -rrh * Math.cos(aa) * r],
          worldH: r * 0.055, bright: 0.6,
          color: showPapers ? '#5a4a32' : colors.dateColor,
          blend: showPapers ? 'normal' : 'add',
          vert: false,
          fog: THREE.MathUtils.clamp(1.3 - r / 75, 0.55, 1),  // 构建期常量：流畅档免逐帧投影
        })
      }
      segs.forEach((seg, si) => {
        // 纸张模式：3 圈彩色文字浮在纸面前排（12~18），季节色相可见（普通混合，纸上可读）
        // 文字模式：8 圈加密回声铺满纸面（44~65），近中远分层不叠放（加性混合，黑底发光）
        // 流畅档：回声减量，总条数上限 140
        const echoes = ((showPapers ? 3 : 8) * (liteMode ? 0.6 : 1)) | 0
        const slot = (Math.PI * 2) / Math.max(1, contentPages.length * echoes)  // 每个分身占整个圆环的一份
        for (let e = 0; e < echoes; e++) {
          const r = showPapers
            ? 13 + rand() * 10               // 纸张模式：后撤浮于纸间，不抢纸张主体（13~23）
            : 44 + e * 7 + rand() * 14       // 文字模式：独立星河推远（44~65），更辽阔缓慢
          // 回声沿圆环交错铺开 + 高度四层循环铺满纵向区间：均匀覆盖无大片空白
          const aa = a + e * slot + (rand() - 0.5) * slot * 0.8
          const yJit = levelY(rand, e + si + rank)
          const rrh = Math.sqrt(Math.max(0.05, 1 - Math.min(0.92, yJit * yJit)))
          const vert = rand() < 0.7   // 竖排为主，横排点缀
          out.push({
            id: `${id}-${si}-${e}`, pageId: id, text: seg,
            pos: [rrh * Math.sin(aa) * r, yJit * r, -rrh * Math.cos(aa) * r],
            worldH: showPapers
              ? r * (0.08 + rand() * 0.09) * (vert ? 1 : 0.72)        // 纸张模式：文字收敛，横排大字额外缩小
              : r * (0.09 + rand() * 0.14) * (r < 32 ? 0.82 : 1),     // 方案C：远排近距强制缩小
            bright: (0.7 + rand() * 0.3) * (e === 0 ? 1 : 0.8) * (showPapers ? 0.55 : 1),  // 纸张模式：调淡不抢主体
            // 季节色相：纸前用墨色系（纸上可读），黑底用金色系（发光）
            color: showPapers ? seasonalColors(month, false) : seasonalColors(month, dark),
            blend: showPapers ? 'normal' : 'add',
            vert,
            fog: THREE.MathUtils.clamp(1.3 - r / 75, 0.55, 1),  // 构建期常量：流畅档免逐帧投影
          })
        }
      })
    })
    // 性能上限：超限按环上均匀抽样（整圈铺满；此前 slice(0,N) 只取开头一段导致「扎堆在一处」）
    // 手机流畅档上限更低（90）：draw call 与逐帧 JS 是移动端瓶颈（对齐知识库「少 draw call」思路）
    return sampleEvenAroundRing(out, liteMode ? 90 : 260)
  }, [contentPages, ringOf, showPapers, colors, dark, liteMode])

  const visibleStrips = useMemo(() => {
    if (orient === 'mix') return strips
    return strips.filter(s => (orient === 'v' ? s.vert : !s.vert))
  }, [strips, orient])

  // ===== 纸张构建（按时间环均匀分布：一圈上的等分刻度，不再随机扎堆）=====
  const papers = useMemo(() => {
    if (!showPapers) return []
    const rand = makeRand(0x1234abcd)
    const out = []
    contentPages.forEach(({ p, id }, rank) => {
      const { a } = ringOf(rank)
      // 每页 8 个环绕分身（流畅档 4 个），沿圆环交错铺开不叠放
      const total = Math.max(1, contentPages.length)
      const echoes = liteMode ? 4 : 8
      const slot = (Math.PI * 2) / (total * echoes)
      for (let e = 0; e < echoes; e++) {
        const r = 18 + (e % 3) * 8 + rand() * 6   // 18~38 三层半径，近中远错开防叠放
        const aa = a + e * slot + (rand() - 0.5) * slot * 0.8
        const yJit = levelY(rand, e + rank)        // 高度四层循环：整面铺开，不连成线
        const rrh = Math.sqrt(Math.max(0.05, 1 - yJit * yJit))
        out.push({
          keyId: `${id}-${e}`,
          id,
          date: p.date, text: p.text || '',
          photos: Array.isArray(p.photos) ? p.photos : [],
          pos: [rrh * Math.sin(aa) * r, yJit * r, -rrh * Math.cos(aa) * r],
          worldH: r * 0.30 * (r < 28 ? 0.85 : 1),   // 长焦补偿 + 近纸缩小一档
          fog: THREE.MathUtils.clamp(1.3 - r / 60, 0.6, 1),   // 构建期常量：流畅档免逐帧投影
        })
      }
    })
    // 性能上限：超限按环上均匀抽样（每页在整圈都有代表，不再只渲染开头几页）
    return sampleEvenAroundRing(out, liteMode ? 20 : 60)
  }, [contentPages, ringOf, showPapers, liteMode])

  const memories = useMemo(() => {
    const list = []
    activePages.forEach((p) => {
      const hasText = !!(p && p.text && p.text.trim())
      const hasPhoto = Array.isArray(p && p.photos) && p.photos.length > 0
      if (!hasText && !hasPhoto) return
      list.push({
        id: p.id || `pg${list.length}`,
        header: headerOf(p.date),
        text: p.text || '',
        photos: Array.isArray(p.photos) ? p.photos : [],
      })
    })
    return list
  }, [activePages])

  const selected = memories.find(m => m.id === selectedId) || null
  // #2 点击聚焦：selectedId 驱动被点中的记忆飘近放大（不再转动整个空间）
  const focusOn = selectedId != null

  // #6 真实时间天幕：背景色相随手机当前时间流转（清晨偏青 / 白昼偏蓝 / 黄昏偏暖 / 深夜深金）
  const skyClass = useMemo(() => {
    const h = new Date().getHours()
    if (dark) {
      if (h >= 5 && h < 11) return 'from-[#071320] via-[#0e2030] to-[#1c3a4a]'
      if (h >= 11 && h < 17) return 'from-[#0a1030] via-[#141b36] to-[#252b38]'
      if (h >= 17 && h < 20) return 'from-[#160b05] via-[#26140a] to-[#3a2410]'
      return 'from-[#060302] via-[#0d0804] to-[#150c05]'
    }
    if (h >= 5 && h < 11) return 'from-[#e6edf3] via-[#dbe5ec] to-[#c9d5e0]'
    if (h >= 11 && h < 17) return 'from-[#e8eef4] via-[#dce4ed] to-[#c8d3df]'
    if (h >= 17 && h < 20) return 'from-[#f0e4d8] via-[#e6d5c2] to-[#d6c2a8]'
    return 'from-[#dcdfe4] via-[#d0d4da] to-[#c0c5cd]'
  }, [dark])
  // 开场朝向：从选中的那页（时间环刻度）开始往前转；未选中则从第一页开始
  const faceAngles = useMemo(() => {
    let rank = 0
    if (startIndex != null) {
      const i = contentPages.findIndex(c => c.pi === startIndex)
      if (i >= 0) rank = i
    }
    const { a } = ringOf(rank)
    // 高度现在是连续散布，开场平视略抬（内容主体在视线及以上）
    return {
      y: a,
      x: -0.08,
    }
  }, [startIndex, contentPages, ringOf])

  // ===== 交互：拖动环视（俯仰受限，角色不动）/ 缩放 / 点击查看 =====
  const onPointerDown = useCallback((e) => {
    dragRef.current = { on: true, x: e.clientX, y: e.clientY, moved: false }
  }, [])
  const onPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d.on) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.hypot(dx, dy) > 8) d.moved = true
    d.x = e.clientX; d.y = e.clientY
    const g = skyRef.current
    if (!g) return
    g.rotation.y += dx * 0.0032
    g.rotation.x = THREE.MathUtils.clamp(g.rotation.x + dy * 0.0026, -0.75, 0.4) // 俯仰受限：放宽一档（-0.6,0.3 → -0.75,0.4），抬头低头都能看到上下两层记忆
  }, [])
  const endDrag = useCallback(() => {
    setTimeout(() => { dragRef.current.on = false }, 0)
  }, [])
  const onWheel = useCallback((e) => {
    targetScaleRef.current = THREE.MathUtils.clamp(targetScaleRef.current * (e.deltaY > 0 ? 0.92 : 1.08), 0.3, 1.9)
  }, [])
  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 2) return
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    )
    if (pinchRef.current) {
      const ratio = d / pinchRef.current
      targetScaleRef.current = THREE.MathUtils.clamp(targetScaleRef.current * ratio, 0.3, 1.9)
    }
    pinchRef.current = d
  }, [])
  const onTouchEnd = useCallback(() => { pinchRef.current = null }, [])

  const handleTap = useCallback((pageId) => {
    if (dragRef.current.moved) return
    // 再点一下已选中的纸张 → 收回（飘回原位）
    if (pageId === selectedId) { setSelectedId(null); return }
    setSelectedId(pageId)
    // 金尘：从被点中纸张的矩形边框抖落，向观察者飘来
    const src = papers.find(pp => pp.id === pageId) || visibleStrips.find(s => s.pageId === pageId)
    if (src) {
      const key = Date.now()
      const w = src.worldH ? src.worldH * (showPapers ? (PAPER_W / PAPER_H) : 0.7) : 6
      const h = src.worldH || 6
      setRipples(r => [...r.slice(-2), { key, pos: src.pos, w, h }])
      setTimeout(() => setRipples(r => r.filter(x => x.key !== key)), 1400)
    }
    pulseRef.current = 1
  }, [papers, visibleStrips, selectedId, showPapers])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { selectedId ? setSelectedId(null) : onBack && onBack() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, onBack])

  // 主题相关 UI 类名
  const uiCard = dark ? 'bg-black/45 border-amber-200/10' : 'bg-white/70 border-stone-900/10'
  const uiText = dark ? 'text-amber-100/90' : 'text-stone-800'
  const uiSub = dark ? 'text-amber-100/40' : 'text-stone-500'
  const uiBtn = dark
    ? 'bg-black/45 text-amber-100/60 hover:text-amber-100 border-amber-200/10'
    : 'bg-white/70 text-stone-600 hover:text-stone-900 border-stone-900/10'
  const uiBtnOn = dark
    ? 'bg-amber-500/80 text-stone-900 border-amber-300/40'
    : 'bg-stone-800 text-amber-50 border-stone-700/40'

  const cycleOrient = () => setOrient(v => (v === 'v' ? 'h' : v === 'h' ? 'mix' : 'v'))
  const orientLabel = orient === 'v' ? '竖排' : orient === 'h' ? '横排' : '混合'

  if (!canWebGL) {
    return (
      <div className={`fixed inset-0 z-[56] ${dark ? 'bg-gradient-to-b from-[#060302] via-[#0d0804] to-[#150c05]' : 'bg-gradient-to-b from-white via-[#faf7f0] to-[#efe9dc]'} flex flex-col items-center justify-center p-6`}>
        <span className="text-4xl mb-3">🌌</span>
        <p className={`text-sm ${uiText}`}>当前设备不支持 WebGL，无法打开记忆宇宙</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-200">返回</button>
      </div>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-[56] overflow-hidden select-none touch-none bg-gradient-to-b ${skyClass}`}
      style={{ paddingTop: 'var(--safe-top-js, var(--safe-top, 0px))', ...(bgStyle || {}) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <Canvas
        dpr={liteMode ? 1 : (IS_MOBILE_DEVICE ? 1.5 : [1, 2])}
        camera={{ position: [0, 0, 0.01], fov: 60, near: 0.1, far: 400 }}
        gl={{ antialias: !liteMode, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.5} />
        <PerfGuard onLite={() => { setLiteMode(true); pushNotice('已自动切换流畅模式以保持顺滑') }} />
        <Meteor dark={dark} />
        <SkyDome faceAngles={faceAngles} skyRef={skyRef} dragRef={dragRef} targetScaleRef={targetScaleRef} pulseRef={pulseRef} ripples={ripples} dark={dark} speed={memoryParams.rotateSpeed}>
          <Dust dark={dark} lite={liteMode} brightness={memoryParams.dustBrightness} />
          {showPapers
            ? (<>
                {papers.map((p, i) => <PaperStar key={p.keyId} paper={p} colors={colors} dark={dark} vertical={orient === 'v'} onTap={handleTap} focusOn={focusOn} focusPageId={selectedId} introDelay={0.15 + (i / Math.max(1, papers.length)) * 1.6} lite={liteMode} />)}
                {/* 纸张模式下：彩色文字浮在纸面前排（季节色相可见） */}
                {visibleStrips.map((st, i) => <TextStar key={st.id} strip={st} onTap={handleTap} focusOn={focusOn} focusPageId={selectedId} introDelay={0.15 + (i / Math.max(1, visibleStrips.length)) * 1.6} brightness={memoryParams.textBrightness} lite={liteMode} />)}
              </>)
            : visibleStrips.map((st, i) => <TextStar key={st.id} strip={st} onTap={handleTap} focusOn={focusOn} focusPageId={selectedId} introDelay={0.15 + (i / Math.max(1, visibleStrips.length)) * 1.6} brightness={memoryParams.textBrightness} lite={liteMode} />)}
        </SkyDome>
      </Canvas>

      {/* 空态引导：没有真实记忆时提示写第一笔 / 观看演示 */}
      {memories.length === 0 && viewMode === 'user' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          <div className="text-4xl mb-2">🌌</div>
          <div className={`text-sm ${uiSub}`}>还没有记忆纸页 · 回到横线本写下第一笔</div>
          <div className={`text-xs mt-1 ${uiSub}`}>或点右上角「🎬 观看演示记忆」预览成品形态</div>
        </div>
      )}

      {/* 顶栏：左侧标题 / 右上角按钮组（演示 + 库切换 + 纸张开关 + 文字方向 + 返回）；纯净模式下左上标题卡一并隐藏 */}
      <div className="absolute top-0 inset-x-0 p-3 flex items-start justify-between gap-2 pointer-events-none">
        <div className={`backdrop-blur rounded-xl px-3 py-2 pointer-events-auto border ${uiCard} ${pureMode ? 'hidden' : ''}`}>
          <div className={`text-sm font-bold ${uiText}`}>🌌 记忆宇宙
            {viewMode === 'demo' && (
              <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 align-middle">演示数据 · 成品形态示范</span>
            )}
          </div>
          <div className={`text-[10px] mt-0.5 ${uiSub}`}>
            {memories.length} 段记忆环绕着你 · 拖动环视 · 滚轮/双指缩放 · 点击回看
            {liteMode ? ' · 🍃流畅' : ' · ✨高清'}
          </div>
        </div>
        <div className={`flex flex-col gap-1.5 items-end pointer-events-auto ${pureMode ? 'hidden' : ''}`}>
          {viewMode === 'user' ? (
            <button
              onClick={() => { setViewMode('demo'); setSelectedId(null) }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur border transition-colors ${uiBtn}`}
              title="渲染约 50 张示范纸张（只读），预览成品形态；不影响你的真实记忆"
            >🎬 观看演示记忆</button>
          ) : (
            <button
              onClick={() => { setViewMode('user'); setSelectedId(null) }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold backdrop-blur border transition-colors ${uiBtnOn}`}
              title="退出演示，回到我的记忆"
            >↩ 退出演示</button>
          )}
          {viewMode === 'user' && (
            <button
              onClick={() => setDrawerOpen(true)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur border transition-colors ${uiBtnOn}`}
              title={`当前记忆库：${activeLibName}（点击切换/批量导入）`}
            >📚 {activeLibName}</button>
          )}
          <button
            onClick={() => setShowPapers(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur border transition-colors ${showPapers ? uiBtnOn : uiBtn}`}
            title={showPapers ? '隐藏纸张：只留下文字星河' : '显示纸张：切换为纸张环绕模式'}
          >{showPapers ? '📄 纸张' : '✨ 文字'}</button>
          <button
            onClick={cycleOrient}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur border transition-colors ${orient === 'v' ? uiBtnOn : uiBtn}`}
            title="文字排布：混合 → 竖排 → 横排 循环切换"
          >⽂ {orientLabel}</button>
          <button
            onClick={() => changeQualityPref(cycleQualityPref(qualityPref))}
            title="画质档位：自动（按设备+卡顿监测）/ 高清 / 流畅 循环切换"
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur border transition-colors ${qualityPref === 'hq' ? uiBtnOn : uiBtn}`}
          >{qualityPref === 'auto' ? '⚙️ 自动' : qualityPref === 'hq' ? '✨ 高清' : '🍃 流畅'}</button>
          <button
            onClick={onBack}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur border transition-colors ${uiBtn}`}
          >↩ 返回总览</button>
        </div>
      </div>

      {/* 运行时提示（如「已自动切换流畅模式」），自动消失 */}
      {notice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/70 border border-amber-200/20 text-[11px] text-amber-100 backdrop-blur pointer-events-none whitespace-nowrap">
          {notice}
        </div>
      )}

      {/* 记忆库抽屉：切库 / 批量导入（z 高于记忆宇宙本身） */}
      {drawerOpen && (
        <LibraryDrawer
          libs={libs}
          currentId={libId}
          defaultName="横线本记忆"
          demo={DEMO}
          onSelect={(id) => setLibId(id)}
          onDelete={deleteLibById}
          onCommit={commitImport}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* 详情卡：贴左下，右侧留空，不遮挡右下角三个快捷键 */}
      {selected && (
        <div className={`absolute bottom-3 left-3 right-24 sm:right-24 md:right-auto md:w-80 backdrop-blur rounded-2xl border p-4 shadow-xl ${dark ? 'bg-black/80 border-amber-200/20' : 'bg-white/88 border-stone-900/15'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={`text-sm font-bold truncate ${uiText}`}>{selected.header}</div>
              <div className={`text-[10px] mt-0.5 ${uiSub}`}>
                {selected.photos.length > 0 ? `含 ${selected.photos.length} 张照片` : '纯文字记忆'}
              </div>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className={`w-6 h-6 shrink-0 rounded-full text-xs flex items-center justify-center ${dark ? 'bg-slate-700/70 text-slate-300' : 'bg-stone-300/70 text-stone-700'}`}
            >✕</button>
          </div>
          {selected.text.trim() && (
            <div className={`mt-2 pt-2 border-t text-[12px] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto ${dark ? 'border-amber-200/10 text-amber-50/85' : 'border-stone-900/10 text-stone-800'}`}>
              {selected.text}
            </div>
          )}
          {selected.photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.photos.map(ph => (
                <img key={ph.id} src={ph.dataUrl} alt="" className="h-16 w-auto max-w-[120px] object-contain rounded border border-slate-300/40 bg-white" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
