import React, { useState, useRef, useEffect } from 'react'

/**
 * 滚轮时间选择器（仿系统闹钟滚轮，自主实现 + 手机适配改版）：
 * - 三列：上午/下午 · 时(1-12) · 分(00-59)，触摸滚动 + snap 吸附，点击直选；
 * - 顶部实时副标题「将于今天/明天 上午 HH:mm 提醒 · 约N小时M分钟后」（差异化于系统闹钟）；
 * - value/onChange 为 24h 制 'HH:mm'，与现有存储格式无缝兼容。
 */
const ITEM_H = 44      // 单行高度
const VISIBLE = 5      // 可见行数（上下各露 2 行）

function Wheel({ items, index, onIndexChange }) {
  const ref = useRef(null)
  const timerRef = useRef(null)
  const pad = Math.floor((VISIBLE - 1) / 2)

  // 初始定位 & 外部受控同步
  useEffect(() => {
    const el = ref.current
    if (el && Math.abs(el.scrollTop - index * ITEM_H) > 1) {
      el.scrollTo({ top: index * ITEM_H, behavior: 'smooth' })
    }
  }, [index])
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = index * ITEM_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
      if (i !== index) onIndexChange(i)
      else el.scrollTo({ top: i * ITEM_H, behavior: 'smooth' }) // 吸附校正
    }, 90)
  }

  return (
    <div className="relative flex-1 min-w-0" style={{ height: ITEM_H * VISIBLE }}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-scroll no-scrollbar"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        <div style={{ height: ITEM_H * pad }} />
        {items.map((label, i) => (
          <div
            key={i}
            onClick={() => onIndexChange(i)}
            className={`flex items-center justify-center cursor-pointer select-none transition-all duration-150 ${
              i === index ? 'text-slate-900 font-bold' : 'text-slate-300'
            }`}
            style={{
              height: ITEM_H,
              scrollSnapAlign: 'center',
              fontSize: i === index ? 30 : 22,
              fontWeight: i === index ? 700 : 400,
            }}
          >
            {label}
          </div>
        ))}
        <div style={{ height: ITEM_H * pad }} />
      </div>
      {/* 上下渐隐（厚度限制在中段，不盖住选中行） */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-white to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-white to-transparent" />
      {/* 选中行上下细线 */}
      <div
        className="pointer-events-none absolute inset-x-4 border-t border-slate-200"
        style={{ top: `calc(50% - ${ITEM_H / 2}px)` }}
      />
      <div
        className="pointer-events-none absolute inset-x-4 border-b border-slate-200"
        style={{ top: `calc(50% + ${ITEM_H / 2}px)` }}
      />
    </div>
  )
}

export default function WheelTimePicker({ value, onChange }) {
  // 解析 24h 'HH:mm'
  const m = String(value || '09:00').match(/^(\d{1,2}):(\d{2})$/)
  const h24 = m ? Number(m[1]) : 9
  const period = h24 < 12 ? 0 : 1                          // 0=上午 1=下午
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12               // 1-12

  const [p, setP] = useState(period)
  const [h, setH] = useState(h12 - 1)                      // index 0-11 → 1-12 点
  const [min, setMin] = useState(m ? Number(m[2]) : 0)

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

  const emit = (np, nh, nm) => {
    const hh24 = (np === 0 ? nh % 12 : (nh % 12) + 12)
    onChange(`${String(hh24).padStart(2, '0')}:${String(nm).padStart(2, '0')}`)
  }

  // 副标题：距现在的自然语言描述（差异化设计，不照抄系统闹钟）
  const nowH = new Date()
  const target = new Date()
  target.setHours(p === 0 ? h12 % 12 : (h12 % 12) + 12, min, 0, 0)
  let dayTxt = '今天'
  let diff = target - nowH
  if (diff < 0) { target.setDate(target.getDate() + 1); diff = target - nowH; dayTxt = '明天' }
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.round((diff % 3600000) / 60000)
  const awayTxt = hrs >= 1 ? `约 ${hrs} 小时 ${mins} 分钟后` : `${Math.max(mins, 1)} 分钟后`
  const fmt = `${String(h12).padStart(2, '0')}:${minutes[min]}`

  return (
    <div>
      {/* 副标题（实时刷新） */}
      <div className="text-center mb-1">
        <div className="text-sm font-semibold text-slate-800">
          {p === 0 ? '☀️ 上午' : '🌙 下午'} {fmt}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          将于{dayTxt}提醒 · {awayTxt}
        </div>
      </div>
      {/* 三列滚轮 */}
      <div className="flex items-stretch gap-1 px-1">
        <div className="flex items-center justify-center w-16 shrink-0">
          <Wheel
            items={['上午', '下午']}
            index={p}
            onIndexChange={(i) => { setP(i); emit(i, h + 1, min) }}
          />
        </div>
        <div className="flex-[2] flex flex-col min-w-0">
          <div className="text-center text-[11px] text-slate-400 py-1">时</div>
          <Wheel
            items={hours}
            index={h}
            onIndexChange={(i) => { setH(i); emit(p, i + 1, min) }}
          />
        </div>
        <div className="flex-[2] flex flex-col min-w-0">
          <div className="text-center text-[11px] text-slate-400 py-1">分</div>
          <Wheel
            items={minutes}
            index={min}
            onIndexChange={(i) => { setMin(i); emit(p, h + 1, i) }}
          />
        </div>
      </div>
    </div>
  )
}
