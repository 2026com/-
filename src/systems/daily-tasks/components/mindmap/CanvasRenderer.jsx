import React from 'react'

/**
 * 画布渲染组件 —— 自 MindMapCanvas.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：顶部硬朗时间轴（起点=今天，单位随缩放切换 天/周/月，直线刻度、按单位降采样）
 * 只负责渲染，不包含交互逻辑（pointer-events-none，刻度不可点击）
 */
export default function CanvasRenderer({ axisTicks }) {
  return (
    <div className="absolute top-4 left-0 w-full h-16 pointer-events-none z-1">
      <div className="relative w-full h-full">
        <div className="absolute left-0 right-0 top-[24px] h-[2px] bg-slate-900" />
        {axisTicks.ticks.map((t, i) => (
          <div key={i} className="absolute" style={{ left: t.x, top: '24px' }}>
            <div className={`absolute left-0 top-0 w-[2px] ${t.isToday ? 'bg-indigo-600' : 'bg-slate-900'}`} style={{ height: t.isToday ? 30 : 12 }} />
            {t.isToday && <div className="absolute -left-3 font-bold whitespace-nowrap" style={{ top: -16, fontSize: 10.5, color: '#4338ca' }}>今天</div>}
            {t.monthLabel && <div className="absolute -left-4 whitespace-nowrap font-bold" style={{ top: -15, fontSize: 11, color: '#0f172a' }}>{t.monthLabel}</div>}
            {t.label && <div className="absolute -left-4 whitespace-nowrap font-medium" style={{ top: 15, fontSize: 9.5, color: '#0f172a' }}>{t.label}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}