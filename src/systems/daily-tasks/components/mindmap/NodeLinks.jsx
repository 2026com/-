import React, { useMemo } from 'react'
import { getNodeRect } from '../../../../utils/constants.js'

/**
 * 父子节点之间的贝塞尔连线层（T6 矩形节点吸附版）
 * - 节点尺寸 100% 统一走 constants.getNodeRect，与 MindNode 共用同一份公式，避免两处漂移连线错位
 * - 父节点连线起点 = 父矩形右边缘中心 (parent.x + w_parent/2, parent.y)
 * - 子节点连线终点 = 子矩形左边缘中心 (child.x - w_child/2,  child.y)
 * - SVG canvas 固定 8000×6000 viewBox，保证平移/缩放下坐标严格与节点一致
 */
export default function NodeLinks({ nodes }) {
  const links = useMemo(() => {
    const arr = []
    const byId = {}
    nodes.forEach(n => { byId[n.id] = n })
    nodes.forEach(c => {
      if (c.parentId && byId[c.parentId]) {
        arr.push({ parent: byId[c.parentId], child: c })
      }
    })
    return arr
  }, [nodes])

  if (links.length === 0) return null

  /** 三次贝塞尔参数方程: t∈[0,1] */
  function bezierPoint(t, x1, y1, cx1, cy1, cx2, cy2, x2, y2) {
    const mt = 1 - t
    const x = mt*mt*mt*x1 + 3*mt*mt*t*cx1 + 3*mt*t*t*cx2 + t*t*t*x2
    const y = mt*mt*mt*y1 + 3*mt*mt*t*cy1 + 3*mt*t*t*cy2 + t*t*t*y2
    return { x, y }
  }

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ left: 0, top: 0, width: '8000px', height: '6000px', overflow: 'visible' }}
      viewBox="0 0 8000 6000"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="soft-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#94a3b8" floodOpacity="0.3" />
        </filter>
        {/* 连线上方标注气泡背景：圆角矩形+阴影(设计稿1风格) */}
      </defs>
      {links.map((l, i) => {
        const pLevel = l.parent.level || 0
        const cLevel = l.child.level || 0
        const pRectBase = getNodeRect(pLevel)
        const cRectBase = getNodeRect(cLevel)
        // 尺寸倍率（必须与 MindNode 完全一致）
        const pScale = pLevel <= 1 ? { w: pRectBase.w * 2.4, h: pRectBase.h * 1.9 } : { w: pRectBase.w * 2.1, h: pRectBase.h * 2.5 }
        const cScale = cLevel <= 1 ? { w: cRectBase.w * 2.4, h: cRectBase.h * 1.9 } : { w: cRectBase.w * 2.1, h: cRectBase.h * 2.5 }
        const pW = pScale.w, pH = pScale.h
        const cW = cScale.w, cH = cScale.h

        // ====== V6：连线从主轴衍生（T 分支）/ 普通分支折线，全部贴合节点边缘 ======
        const px = l.parent.x || 0, py = l.parent.y || 0
        const cx = l.child.x || 0, cy = l.child.y || 0
        const axisParent = !!(l.parent.isRouteStageNode || l.parent.phaseLabel || pLevel <= 1)
        let x1, y1, x2, y2, d
        if (axisParent) {
          // 子级从主轴线垂直衍生（T 分支）：起点在主轴线 Y，终点贴子节点靠近主轴的边
          const axisY = py
          x1 = cx; y1 = axisY
          x2 = cx; y2 = (cy >= axisY) ? (cy - cH / 2) : (cy + cH / 2)
          d = `M ${x1} ${y1} L ${x2} ${y2}`
        } else {
          // 普通分支：父节点边缘 → 子节点边缘（同列用竖线，异列用折线）
          const parentEdgeY = (cy >= py) ? (py + pH / 2) : (py - pH / 2)
          const childEdgeY  = (cy >= py) ? (cy - cH / 2) : (cy + cH / 2)
          if (Math.abs(cx - px) <= 2) {
            d = `M ${px} ${parentEdgeY} L ${cx} ${childEdgeY}`
          } else {
            const midY = (py + cy) / 2
            d = `M ${px} ${parentEdgeY} L ${px} ${midY} L ${cx} ${midY} L ${cx} ${childEdgeY}`
          }
        }
        const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
        // 进度 → 颜色（严格匹配 NODE_STATUS 5 态 + 进度色）
        const p = Math.max(0, Math.min(100, Number(l.child.progress) || 0))
        // 分支线宽统一偏细（主轴线在 MindMapCanvas 单独画，最粗最黑）
        const strokeWidth = 1.6 + (p >= 100 ? 0.4 : 0)
        const color = (() => {
          const st = l.child.status
          if (st === 'done' || p >= 100) return '#22c55e'
          if (st === 'aborted') return '#ef4444'
          if (st === 'paused') return '#f97316'
          if (st === 'progress') return '#06b6d4'
          if (p > 50) return '#3b82f6'
          if (p > 0) return '#64748b'
          return '#94a3b8'
        })()
        const weekText = Number(l.child.weekOfMonth) ? `第${l.child.weekOfMonth}周` : null

        return (
          <g key={i} className="node-link-group">
            {/* 主曲线（三次贝塞尔，无前置锁死箭头-约束红线第3条） */}
            <path
              d={d}
              className="node-link"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="square"
              fill="none"
              style={{ opacity: 0.92 }}
            />
            {/* 连线上方「第X周 X%」进度气泡（UI设计稿1 同款） */}
            {weekText && (
              <g transform={`translate(${mid.x}, ${mid.y})`}>
                {/* 气泡背景 - 白色圆角+细边框(设计稿1风格) */}
                <rect x="-46" y="-34" width="92" height="30" rx="8" ry="8" fill="white" stroke="#e2e8f0" strokeWidth="1.2" />
                {/* 小三角指向连线（可选，设计稿有就有） */}
                <path d="M-8 -4 L0 4 L8 -4 Z" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                {/* 周数（上排小字 灰色） */}
                <text x="0" y="-17" textAnchor="middle" fontSize="10.5" fill="#64748b" fontWeight="500" style={{ fontFamily: 'system-ui, sans-serif' }}>
                  {weekText}
                </text>
                {/* 进度%（下排大字 加粗 颜色对应进度） */}
                <text x="0" y="-5" textAnchor="middle" fontSize="12.5" fill={color} fontWeight="700" style={{ fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.3px' }}>
                  {p}%
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
