import React from 'react'
import NodeLinks from './NodeLinks.jsx'

/**
 * 连线渲染组件 —— 自 MindMapCanvas.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：中心主路径线（SVG 粗黑横线）、阶段间箭头（含箭头头部三角）、
 *       路线装饰层（大标题/副标题、阶段胶囊标签、底部黑色圆角口诀横条）、节点间连线（NodeLinks）
 * 只负责渲染；阶段胶囊上的点击仅回调上层传入的 onNodeClick（交互逻辑不在本组件内）
 */
export default function EdgeRenderer({ offsetY, centerMainPath, routeDecorations, renderedNodes, nodes, onNodeClick }) {
  return (
    <div className="absolute inset-0 node-link-wrap" style={{ transform: `translateY(${offsetY}px)`, transformOrigin: '0 0' }}>
      {/* 中心主路径线 */}
      <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, width: 10000, height: 8000, overflow: 'visible' }} viewBox="0 0 10000 8000">
        {centerMainPath.map(([a, b], i) => (
          <line
            key={'c' + i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#000" strokeWidth={5} strokeLinecap="square"
            opacity={1}
          />
        ))}
        {routeDecorations.filter(d => d.kind === 'stageArrow').map((d, i) => {
          const x1 = d.x1, y1 = d.y1, x2 = d.x2, y2 = d.y2
          const mx = x1 + (x2 - x1) * 0.5
          return (
            <g key={'sarr_' + i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={2.2} strokeLinecap="round" />
              <polygon points={`${x2},${y2} ${x2-10},${y2-4.5} ${x2-10},${y2+4.5}`} fill="#000" />
            </g>
          )
        })}
      </svg>

      {/* P1X：路线装饰层（大标题/副标题、阶段 phaseLabel 悬浮标签、底部黑色圆角横条口诀） */}
      {routeDecorations.filter(d => d.kind !== 'stageArrow').map((d, i) => {
        if (d.kind === 'title') {
          return (
            <div key={'rdt'+i} className="absolute pointer-events-none" style={{ left: d.x, top: d.y }}>
              <div className="text-[28px] font-extrabold tracking-wide text-black leading-none" style={{ letterSpacing: '0.5px' }}>
                【{d.title.replace(/^【|】$/g,'')}】
              </div>
              <div className="text-[13px] mt-3 text-neutral-600 font-medium">
                {d.sub}
              </div>
              {/* 下方一条 1px 分隔灰线，和主线呼应 */}
              <div className="mt-4 h-[1px] bg-neutral-300" style={{ width: 360 }} />
            </div>
          )
        }
        if (d.kind === 'phaseLabel') {
          // 居中 120px 胶囊，白底黑边：表现"前期｜建立基础 / 中期 / 后期｜达到目标水平"
          const w = Math.max(150, Math.min(230, 140 + String(d.label || '').length * 12))
          return (
            <div
              key={'rdp'+i}
              className="absolute pointer-events-auto"
              style={{ left: (d.x - w/2), top: d.y, cursor: 'pointer' }}
              title="点击展开/收起该阶段的步骤"
              onClick={(e) => {
                e.stopPropagation()
                const pn = nodes.find(x => x.id === d.phaseId)
                if (pn) onNodeClick(e, pn)
              }}
            >
              <div
                className="text-[12px] font-semibold text-black whitespace-nowrap"
                style={{
                  width: w, height: 26, borderRadius: 2,
                  border: '1.5px solid #111', background: '#ffffff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 1px 0 rgba(0,0,0,0.06)'
                }}
              >
                {d.label || ''}
              </div>
            </div>
          )
        }
        if (d.kind === 'mantraBar') {
          // 底部黑色圆角横条 · 白色 · "学习逻辑：先XX → 再XX → 再XX → 再XX → 再XX → 再XX"
          const steps = (d.steps || [])
          const text = '学习逻辑：' + steps.map((s, i) => (i === 0 ? `先${s}` : `再${s}`)).join(' → ')
          return (
            <div key={'rdm'+i} className="absolute pointer-events-none" style={{ left: d.x, top: d.y, width: d.w }}>
              <div
                className="text-white text-[14px] font-semibold leading-6"
                style={{ background: '#0a0a0a', padding: '14px 22px', border: '1.5px solid #000', borderRadius: 2 }}
              >
                {text}
              </div>
            </div>
          )
        }
        return null
      })}

      <NodeLinks nodes={renderedNodes} />
    </div>
  )
}