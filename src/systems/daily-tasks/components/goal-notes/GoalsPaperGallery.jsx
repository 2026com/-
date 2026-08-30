import React, { useState, useEffect, useRef, useMemo } from 'react'
import MemoryUniverse3D from './MemoryUniverse3D.jsx'

/**
 * 长期目标 · 横线本「记录总览」画廊（纯新增组件，不改动原页面逻辑）
 * - 纯白幕布全屏视图：把本子所有记录页做成迷你稿纸卡片，一行 5 张、多行排列；
 * - 卡片比例跟随当前横竖屏下真实横线本页面的宽高比（窗口/旋转变化时自适应）；
 * - 每张卡顶部标注当天日期 · 星期 · 天气；同一天的多张纸标注「第 n 张」；
 * - 卡片内容按原页面格式等比缩小（Replica 固定宽度 + transform scale）；
 * - 照片按拍摄方向等比缩放：竖拍竖着缩、横拍横着缩，不裁剪；
 * - 点击卡片 → 跳回那一页；卡片上的照片缩略图可点开大图预览；
 * - 演示模式：URL 带 ?gallerydemo 时渲染若干示例卡片（竖拍/横拍样例照片），
 *   仅用于视觉效果预览，不读也不写真实数据；
 * - 层级 z-[55]：盖住页面内容，但保留右上角悬浮球（z-60）可点，
 *   画廊打开时也能直接切换横竖屏。
 */

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const LINE_H = 37        // 与原页面一致
const FONT_SIZE = 15.5
const PAD_TOP = 12
const PAD_X = 24
const REPLICA_W = 360    // 迷你稿纸的基准渲染宽度（等比缩放用）
const DEMO = typeof window !== 'undefined' && window.location.search.includes('gallerydemo')

const dateRe = (ds) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || '')
const headerOf = (ds) => {
  const m = dateRe(ds)
  if (!m) return '新的一页'
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日 · ${WEEKDAYS[d.getDay()]}`
}
const readWeather = (date) => {
  try { return localStorage.getItem('goalNoteWeather_' + date) || '' } catch (e) { return '' }
}

// ===== 演示模式：canvas 生成竖拍/横拍示例照片（仅内存，不落盘） =====
function makeDemoPhoto(w, h, label, c1, c2) {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, c1); g.addColorStop(1, c2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = `bold ${Math.round(Math.min(w, h) / 7)}px sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, w / 2, h / 2)
  return { id: 'demo-' + label + '-' + w + 'x' + h, dataUrl: canvas.toDataURL('image/jpeg', 0.85) }
}
const demoPortrait = () => makeDemoPhoto(300, 500, '竖拍示例', '#6366f1', '#a855f7')
const demoLandscape = () => makeDemoPhoto(500, 300, '横拍示例', '#0ea5e9', '#22d3ee')

const demoPages = DEMO ? [
  { id: 'd1', date: '2026-08-28', text: '示例：纯文字的一天，写下目标与想法。' },
  { id: 'd2', date: '2026-08-29', text: '示例：文字 + 竖拍照片。', photos: [demoPortrait()] },
  { id: 'd3', date: '2026-08-30', text: '示例：文字 + 横拍照片。', photos: [demoLandscape()] },
  { id: 'd4', date: '2026-08-30', text: '示例：同一天的第二张纸。' },
  { id: 'd5', date: '2026-08-31', text: '', photos: [demoPortrait(), demoLandscape()] },
  { id: 'd6', date: '2026-09-01', text: '示例：第七张纸，一行五张自动换行。' },
  { id: 'd7', date: '2026-09-02', text: '示例：第八张纸。', photos: [demoLandscape()] },
] : null

/** 迷你稿纸：按当前横竖屏下横线本页面的宽高比渲染，再等比缩小到卡片宽度 */
function MiniPage({ page, aspect }) {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  // 页面区域宽高比 → 基准稿纸尺寸与行数（与真实横线本同比例）
  const replicaH = Math.round(REPLICA_W / aspect)
  const lineCount = Math.max(1, Math.floor((replicaH - PAD_TOP * 2 - LINE_H) / LINE_H))
  const scale = w > 0 ? w / REPLICA_W : 0
  const lines = (page.text || '').split('\n').slice(0, lineCount)
  const weather = readWeather(page.date)
  return (
    <div ref={ref} style={{ width: '100%', height: scale ? replicaH * scale : 'auto', overflow: 'hidden', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {scale > 0 && (
        <div
          style={{
            width: REPLICA_W, height: replicaH, transform: `scale(${scale})`, transformOrigin: 'top left',
            backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${LINE_H - 1}px, #dbe3ee ${LINE_H - 1}px, #dbe3ee ${LINE_H}px)`,
            backgroundPosition: `0 ${PAD_TOP}px`,
            position: 'relative',
          }}
        >
          {/* 页眉行：日期 · 星期 · 天气（与原页格式一致） */}
          <div style={{ height: PAD_TOP }} />
          <div style={{ height: LINE_H, display: 'flex', alignItems: 'center', padding: `0 ${PAD_X}px` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden' }}>{headerOf(page.date)}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: '#64748b' }}>{weather}</span>
          </div>
          {/* 正文行 */}
          {lines.map((t, i) => (
            <div key={i} style={{ height: LINE_H, lineHeight: `${LINE_H}px`, fontSize: FONT_SIZE, color: '#334155', padding: `0 ${PAD_X}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip' }}>
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 照片缩略图组：按拍摄方向等比缩放（竖拍窄高、横拍宽扁），不裁剪 */
function PhotoThumbs({ photos, size, onOpen }) {
  if (!photos || !photos.length) return null
  const shown = photos.slice(0, 3)
  return (
    <div className="flex items-end gap-0.5 bg-white/85 rounded p-0.5 border border-slate-200">
      {shown.map(ph => (
        <img
          key={ph.id}
          src={ph.dataUrl}
          alt=""
          style={{ height: size, width: 'auto', maxWidth: size * 1.8, objectFit: 'contain' }}
          className="rounded cursor-zoom-in block"
          onClick={(e) => { e.stopPropagation(); onOpen && onOpen(ph.dataUrl) }}
        />
      ))}
      {photos.length > 3 && (
        <span style={{ height: size }} className="flex items-center text-[10px] text-slate-500 px-0.5">+{photos.length - 3}</span>
      )}
    </div>
  )
}

export default function GoalsPaperGallery({ pages = [], onClose, onJump }) {
  const [lightbox, setLightbox] = useState(null)   // 预览的大图 dataURL
  const [showMemory, setShowMemory] = useState(false) // 3D 记忆库开关
  const [selIdx, setSelectedIdx] = useState(null)  // 单击选中的卡片（作为记忆宇宙的时间起点）
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

  // 视口变化（含横竖屏切换）→ 重算页面区域宽高比
  useEffect(() => {
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { lightbox ? setLightbox(null) : onClose && onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, onClose])

  // 横线本页面区域 ≈ 视口去掉顶栏/标题栏/翻页条/底部Tab（与真实页面同比例）
  const aspect = useMemo(() => {
    const paperW = vp.w
    const paperH = Math.max(120, vp.h - 186)
    return Math.min(5, Math.max(0.45, paperW / paperH))
  }, [vp])

  // 演示模式用示例数据；真实模式只展示有内容（文字或照片）的页，保留原始索引供跳转
  const cards = useMemo(() => {
    const source = DEMO ? demoPages : pages
    const list = []
    const perDay = {}
    source.forEach((p, idx) => {
      const hasText = !!(p && p.text && p.text.trim())
      const hasPhoto = Array.isArray(p && p.photos) && p.photos.length > 0
      if (!hasText && !hasPhoto) return
      perDay[p.date] = (perDay[p.date] || 0) + 1
      list.push({ page: p, idx, nth: perDay[p.date] })
    })
    return list
  }, [pages])

  const cardSize = 'text-[10px] sm:text-[11px]'

  return (
    <div className="fixed inset-0 z-[55] bg-white flex flex-col">
      {/* 顶栏：标题 + 关闭 */}
      <div className="shrink-0 h-11 flex items-center justify-between px-4 border-b border-slate-100">
        <h2 className="text-[14px] sm:text-[15px] font-bold text-slate-800 tracking-wide">
          记录总览 · 横线本
          <span className="ml-2 text-[11px] sm:text-[12px] font-normal text-slate-400">共 {cards.length} 张纸</span>
          {DEMO && <span className="ml-2 text-[10px] font-normal text-indigo-400">演示样例</span>}
        </h2>
        <div className="flex items-center gap-1">
          {/* 3D 记忆库入口（✕ 左侧）：把记录变成环绕观察者的记忆星空 */}
          <button
            onClick={() => setShowMemory(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-500 hover:bg-slate-100 text-base"
            title={selIdx != null ? '3D 记忆库：从选中的那页时间开始环绕' : '3D 记忆库：记录散布成环绕你的星空'}
          >🌌</button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-lg"
            title="关闭 (Esc)"
          >✕</button>
        </div>
      </div>

      {/* 纯白幕布上的卡片墙：一行 5 张，比例跟随横线本页面 */}
      <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-3 sm:py-4">
        {cards.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-300">
            <div className="text-4xl mb-3">🗒️</div>
            <div className="text-sm">还没有记录内容，回到横线本写下第一笔吧</div>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2 sm:gap-4">
            {cards.map(({ page, idx, nth }) => (
              <div key={page.id || idx} className="group">
                {/* 卡片顶部日期标注 */}
                <div className="flex items-baseline gap-1 mb-1 sm:mb-1.5 px-0.5">
                  <span className={`${cardSize} font-semibold text-slate-600 truncate`}>{headerOf(page.date)}</span>
                  {nth > 1 && <span className={`${cardSize} text-slate-400 shrink-0`}>第{nth}张</span>}
                </div>
                {/* 迷你稿纸卡片：点击跳回该页 */}
                <div
                  className={`relative cursor-pointer shadow-sm hover:shadow-md transition-shadow rounded-md ${selIdx === idx ? 'ring-2 ring-indigo-400' : ''}`}
                  onClick={(e) => {
                    if (e.detail === 2) {           // 双击：直接进入这一页
                      if (!DEMO && onJump) onJump(idx)
                    } else {                        // 单击：选中为记忆起点
                      setSelectedIdx(idx)
                    }
                  }}
                  title={DEMO ? '演示卡片（单击选中 / 双击进入）' : '单击选中为记忆起点 · 双击回到这一页'}
                >
                  <MiniPage page={page} aspect={aspect} />
                  {/* 照片缩略图（按拍摄方向等比缩放，悬浮在纸面右下角） */}
                  <div className="absolute bottom-1 right-1">
                    <PhotoThumbs photos={page.photos} size={22} onOpen={setLightbox} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3D 记忆库（覆盖画廊本身；pages 在演示模式下传示例数据；从选中的卡片时间开始转） */}
      {showMemory && (
        <MemoryUniverse3D
          pages={DEMO ? demoPages : pages}
          startIndex={selIdx}
          onBack={() => setShowMemory(false)}
        />
      )}

      {/* 照片大图预览 */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4 sm:p-8 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded shadow-2xl bg-white" />
        </div>
      )}
    </div>
  )
}
