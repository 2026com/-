import React, { useMemo } from 'react'
import { NODE_STATUS, SEVEN_SYSTEMS, getNodeRect } from '../../utils/constants.js'
import { calcProgress } from '../../utils/storage.js'

/**
 * 单个思维导图节点（T2 笛子路线图风格）
 * ===========================================================
 * 阶段节点（level 0/1）：大号 ellipse 椭圆 + 左上角圆形序号徽章
 *     参考笛子路线图的 "1 准备入门 / 2 吹响基础 / 3 指法识谱 …"
 *
 * 知识点节点（level ≥ 2）：下方卡片式（上边框=状态色，白底圆角）
 *     参考笛子路线图下方的"气息训练、基础指法、简谱节奏 …"
 *
 * 共有元素：左上角「2 字状态徽标胶囊」+ 正下方进度条 + 百分比
 * ===========================================================
 */
export default function MindNode({ node, selected, onClick, onPopupOpen, onMouseDown, progressMode, children, allNodes, siblingIndex = 0, hasChildren = false, expanded = false, editMode = false }) {
  // ---------- 1. 5 态匹配：NODE_STATUS 由 Object.values() 反查 key ----------
  const status = useMemo(() => {
    const match = Object.values(NODE_STATUS).find(s => s.key === node.status)
    return match || NODE_STATUS.TODO
  }, [node.status])

  const level = Math.max(0, node.level || 0)

  // P1N：按"新的照片模板"分三类卡片
  //   - flag 节点：右侧旗帜图标（三角形旗面 + "可独立达成目标" 字）
  //   - isRouteStageNode：黑色圆角胶囊（主线阶段节点）
  //   - routeCategory 存在（训练项目/技能要点/...）+ routeGroup=above|below：白色圆角方框，左上带分类标签
  //   - else：沿用笛子原图风格（阶段椭圆 + 知识点卡片）
  const isFlagNode       = !!node.isRouteFlagNode
  const isRouteStageNode = !!node.isRouteStageNode
  const isCategoryBox    = !!node.routeCategory && (node.routeGroup === 'above' || node.routeGroup === 'below')
  const isStageNode      = level <= 1 && !isFlagNode && !isRouteStageNode  // 保留旧椭圆仅用于"非 AI 路线"根节点/子节点
  const isPianoRoot      = level === 0 && !isFlagNode && !isRouteStageNode

  const { w: BASE_W, h: BASE_H } = getNodeRect(level)

  // ---------- 2. 尺寸（按分类不同） ----------
  let NODE_W, NODE_H
  if (isFlagNode) {
    NODE_W = 160; NODE_H = 96
  } else if (isRouteStageNode) {
    // 主线黑色胶囊：比默认宽，文字放 1 行阶段名
    NODE_W = Math.round(BASE_W * 3.0); NODE_H = Math.round(BASE_H * 1.35)
  } else if (isCategoryBox) {
    // 上下悬挂白色方框：偏横向，内容"分类 + 要点"可折 2-3 行
    NODE_W = Math.round(BASE_W * 2.6); NODE_H = Math.round(BASE_H * 2.4)
  } else if (isStageNode) {
    NODE_W = Math.round(BASE_W * 2.4); NODE_H = Math.round(BASE_H * 1.9)
  } else {
    NODE_W = Math.round(BASE_W * 2.1); NODE_H = Math.round(BASE_H * 2.5)
  }

  // ---------- 3. 收集所有后代 BFS → 计算下方进度 ----------
  const collectAllDescendants = (rootId, nodes) => {
    if (!Array.isArray(nodes) || !rootId) return []
    const map = new Map()
    nodes.forEach(n => {
      if (!n.parentId) return
      if (!map.has(n.parentId)) map.set(n.parentId, [])
      map.get(n.parentId).push(n)
    })
    const out = []
    const q = [rootId]
    while (q.length) {
      const id = q.shift()
      const kids = map.get(id) || []
      kids.forEach(k => { out.push(k); q.push(k.id) })
    }
    return out
  }
  const progress = useMemo(() => {
    const all = allNodes && node?.id ? collectAllDescendants(node.id, allNodes) : []
    if (all.length > 0) return calcProgress(all, progressMode)
    return Number(node.progress) || 0
  }, [allNodes, progressMode, node.progress, node.id])

  const progressColor = (() => {
    if (progress >= 100) return '#22c55e'
    if (progress > 50) return '#3b82f6'
    if (progress > 0) return '#64748b'
    return '#cbd5e1'
  })()
  const sys = SEVEN_SYSTEMS.find(s => s.id === node.systemId)

  // ---------- 4. 阶段序号徽章 ----------
  const orderBadge = siblingIndex >= 0 ? String(siblingIndex + 1) : ''

  // ---------- 5. 形状样式（P1N：4 类卡面分开画） ----------
  let shapeStyle
  if (isFlagNode) {
    shapeStyle = {
      borderRadius: 0,
      background: 'transparent',
      border: 'none',
    }
  } else if (isRouteStageNode) {
    // 主线黑色圆角胶囊 / 黑色圆形：白底黑 → 黑底白字
    shapeStyle = {
    borderRadius: 6,
      background: '#0a0a0a',
      border: '1.5px solid #000',
      boxShadow: '0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15)',
      color: '#ffffff',
    }
  } else if (isCategoryBox) {
    shapeStyle = {
    borderRadius: 6,
      background: '#ffffff',
      border: '1.5px solid #0a0a0a',
    }
  } else if (isStageNode) {
    shapeStyle = {
    borderRadius: 6,
    background: '#ffffff',
    border: `1.5px solid ${status.color}`,
    boxShadow: '0 1px 0 rgba(0,0,0,0.15)',
    }
  } else {
    shapeStyle = {
    borderRadius: 6,
      background: '#ffffff',
    border: `1.5px solid #0f172a`,
      borderTop: `3px solid ${status.color}`,
    boxShadow: '0 1px 0 rgba(0,0,0,0.12)',
    }
  }

  return (
    <>
      {/* ============ 主节点 ============ */}
      {isFlagNode ? (
        // P1N：终点旗帜（三角形红色旗面 + 黑色旗杆 + 白底"可独立达成目标" 文字）
        <div
          className={`mind-node mind-node-enter absolute ${selected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
          style={{
            left: (node.x || 0) - NODE_W / 2,
            top:  (node.y || 0) - NODE_H / 2,
            width: NODE_W, height: NODE_H,
            position: 'absolute',
            zIndex: 100 - level,
            cursor: editMode ? 'grab' : 'pointer',
          }}
          onClick={onClick}
          onMouseDown={onMouseDown}
          onTouchStart={onMouseDown}
          title={node.title || '终点：可独立达成目标'}
        >
          {/* 旗杆 */}
          <div className="absolute" style={{ left: 6, top: 0, width: 3, height: NODE_H, background: '#111', borderRadius: 2 }} />
          {/* 三角旗面 */}
          <svg viewBox="0 0 120 72" width={144} height={84} className="absolute" style={{ left: 8, top: 4 }}>
            <polygon points="0,0 116,20 0,44" fill="#e11d48" stroke="#000" strokeWidth={1.6} />
            <text x={14} y={28} fontSize={13} fontWeight={800} fill="#fff" style={{ letterSpacing: '0.5px' }}>
              可独立达成目标
            </text>
          </svg>
        </div>
      ) : (
        <div
          className={`mind-node mind-node-enter absolute ${selected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
          style={{
            left: (node.x || 0) - NODE_W / 2,
            top:  (node.y || 0) - NODE_H / 2,
            width: NODE_W,
            height: NODE_H,
            ...shapeStyle,
            zIndex: 100 - level,
            position: 'absolute',
            cursor: editMode ? 'grab' : 'pointer',
            fontSize: isRouteStageNode ? 13 : (isCategoryBox ? 11 : (isStageNode ? 12 : 10.5)),
          }}
          onClick={onClick}
          onMouseDown={onMouseDown}
          onTouchStart={onMouseDown}
          title={`${node.title}\n进度：${progress}%\n状态：${status.label}\n归属：${sys?.name || '未分类'}`}
        >
          {/* ======= 左上角：状态徽标（路线分类白框/胶囊阶段 不显示；保留在"普通椭圆/普通知识点"节点上） ======= */}
          {!isRouteStageNode && !isCategoryBox && (
            <span
              className="absolute rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm"
              style={{
                left: isStageNode ? 6 : 8,
                top: isStageNode ? 6 : 6,
                background: status.color,
                letterSpacing: '-0.2px'
              }}
            >{status.short}</span>
          )}

          {/* P1N：路线分类白框 — 左上角 黑底白字圆角标签（训练项目 / 技能要点 / 工具物料 / 曲目案例 / ...） */}
          {isCategoryBox && node.routeCategory && (
            <span
              className="absolute rounded-md px-2 py-0.5 text-[10px] font-bold text-white whitespace-nowrap"
              style={{ left: 8, top: -10, background: '#000', border: '1px solid #000' }}
            >
              {node.routeCategory}
            </span>
          )}

          {/* ======= 阶段节点：右上角圆形"序号徽章"（仅 普通椭圆/黑色胶囊）======= */}
          {(isStageNode || isRouteStageNode) && orderBadge && (
            <span
              className="absolute flex items-center justify-center text-[10px] font-extrabold shadow-md"
              style={{
                right: -4, top: -4,
                width: 20, height: 20, borderRadius: 999,
                background: isRouteStageNode
                  ? 'linear-gradient(135deg, #fff 0%, #e5e7eb 100%)'
                  : `linear-gradient(135deg, ${status.color} 0%, ${darken(status.color, 18)} 100%)`,
                border: `2px solid ${isRouteStageNode ? '#000' : '#ffffff'}`,
                color:  isRouteStageNode ? '#000' : '#fff',
              }}
            >{orderBadge}</span>
          )}

          {/* ======= 知识点节点：右上角系统色小图标方块（仅普通知识点卡） ======= */}
          {!isStageNode && !isCategoryBox && !isRouteStageNode && sys && (
            <span
              className="absolute rounded-md text-[10px] flex items-center justify-center"
              style={{
                right: 6, top: 6, width: 18, height: 18,
                background: sys.color + '18',
                color: sys.color,
                border: `1px solid ${sys.color}33`,
              }}
              title={sys.name}
            >{sys.icon}</span>
          )}

          {/* ======= 标题（P1N：分类白框在卡顶显示分类徽标，正文下移以避免被左上角标签盖住） ======= */}
          <div className="w-full h-full flex items-center justify-center px-3 text-center">
            <div
              className="font-bold leading-tight break-words"
              style={{
                color: isRouteStageNode ? '#ffffff' : '#0f172a',
                textShadow: isStageNode ? '0 1px 1px rgba(255,255,255,0.7)' : 'none',
                paddingTop: isRouteStageNode ? 4 : (isCategoryBox ? 20 : (isStageNode ? 6 : 14)),
                paddingLeft: isCategoryBox ? 10 : 20,
                paddingRight: isCategoryBox ? 10 : (!isStageNode ? 14 : 4),
                display: '-webkit-box',
                WebkitLineClamp: isRouteStageNode ? 1 : (isCategoryBox ? 5 : (isStageNode ? 2 : 3)),
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: isCategoryBox ? 1.25 : (isStageNode ? 1.2 : 1.35),
                fontWeight: isRouteStageNode ? 800 : 700,
              }}
            >{node.title}</div>
          </div>

          {/* ======= 知识点底部状态色 + 底饰（仅普通知识点卡片） ======= */}
          {!isStageNode && !isRouteStageNode && !isCategoryBox && (
            <span
              className="absolute left-0 right-0 bottom-0 rounded-b-[11px]"
              style={{ height: 3, background: `${progressColor}22` }}
            />
          )}

          {/* ======= W5：父节点右上角悬浮操作条 [▸/▾ 展开子节点] [✎ 查看/编辑] ======= */}
          {hasChildren && (
            <div className="absolute flex items-center gap-1" style={{ top: -27, right: 0, zIndex: 30 }}>
              <button
                onClick={(e) => { e.stopPropagation(); if (onClick) onClick(e) }}
                className="w-6 h-6 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-[11px] leading-none text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors touch-feedback"
                title={expanded ? '收起子节点' : '展开子节点'}
                aria-label={expanded ? '收起子节点' : '展开子节点'}
              >{expanded ? '▾' : '▸'}</button>
              <button
                onClick={(e) => { e.stopPropagation(); if (onPopupOpen) onPopupOpen(e) }}
                className="w-6 h-6 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-[11px] leading-none text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50 transition-colors touch-feedback"
                title="查看 / 编辑节点详情"
                aria-label="查看 / 编辑节点详情"
              >✎</button>
            </div>
          )}
        </div>
      )}

      {/* ============ 节点正下方独立小进度条 + 百分比（flag 节点不展示避免干扰旗帜构图） ============ */}
      {!isFlagNode && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: (node.x || 0) - Math.round(NODE_W * 0.45),
            top:  (node.y || 0) + NODE_H / 2 + 6,
            width: Math.round(NODE_W * 0.9),
          }}
        >
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-slate-200/90 rounded-full overflow-hidden" aria-hidden>
              <div
                className="h-full rounded-full transition-all duration-300"
              />
            </div>
            <span className="shrink-0 text-[10px] text-slate-600 font-bold tabular-nums">{progress}%</span>
          </div>
        </div>
      )}
    </>
  )
}

// ---------- 小工具：浅色 ----------
function lighten(hex, amount = 85) {
  if (!hex || typeof hex !== 'string') return '#f8fafc'
  const h = hex.replace('#', '').trim()
  if (h.length !== 6 && h.length !== 3) return '#f8fafc'
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.substring(0, 2), 16)
  const g = parseInt(full.substring(2, 4), 16)
  const b = parseInt(full.substring(4, 6), 16)
  const mix = (c) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * (amount / 100))))
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}
function darken(hex, amount = 18) {
  if (!hex || typeof hex !== 'string') return '#0f172a'
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.substring(0, 2), 16)
  const g = parseInt(full.substring(2, 4), 16)
  const b = parseInt(full.substring(4, 6), 16)
  const mix = (c) => Math.max(0, Math.min(255, Math.round(c * (1 - amount / 100))))
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}
