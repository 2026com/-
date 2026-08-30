import React, { useState, useRef, useEffect } from 'react'
import { pushBackHandler } from '../../../../utils/backStack.js'

/**
 * 滚轮时间选择器（仿系统闹钟滚轮，自主实现 + 手机适配改版）：
 * - 三列：上午/下午 · 时(1-12) · 分(00-59)，触摸滚动 + snap 吸附，点击直选；
 * - 顶部实时副标题「将于今天/明天 上午 HH:mm 提醒 · 约N小时M分钟后」（差异化于系统闹钟）；
 * - value/onChange 为 24h 制 'HH:mm'，与现有存储格式无缝兼容。
 */
const ITEM_H = 40      // 单行高度（紧凑）
const VISIBLE = 5      // 可见行数（选中行上下各露 2 行，对齐系统闹钟的紧凑视口）

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
            className={`flex items-center justify-center cursor-pointer select-none transition-all duration-150 whitespace-nowrap ${
              i === index ? 'text-slate-900 font-bold' : 'text-slate-400'
            }`}
            style={{
              height: ITEM_H,
              scrollSnapAlign: 'center',
              fontSize: i === index ? 26 : 20,
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

/** 当前时刻 HH:mm（时间选择器默认值 = 打开时的时间，而不是固定的 09:00） */
export function nowHHmm() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 触发行：表单内一行「🕐 上午 09:00」按钮，点击弹出选择卡 */
export default function WheelTimePicker({ value, onChange, title = '设置提醒时间' }) {
  const [open, setOpen] = useState(false)
  const m = String(value || nowHHmm()).match(/^(\d{1,2}):(\d{2})$/)
  const h24 = m ? Number(m[1]) : 9
  const label = `${h24 < 12 ? '上午' : '下午'} ${String(h24 % 12 === 0 ? 12 : h24 % 12).padStart(2, '0')}:${m ? m[2] : '00'}`
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm touch-feedback hover:border-indigo-300"
      >
        <span className="flex items-center gap-2 text-slate-800 font-medium"><span>🕐</span>{label}</span>
        <span className="text-slate-400 text-xs">调整 ▾</span>
      </button>
      {open && (
        <PickerBody
          value={value || nowHHmm()}
          title={title}
          onConfirm={(v) => { onChange(v); setOpen(false) }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </>
  )
}

/**
 * 底部弹出的选择卡（✕ 取消还原 / ✓ 确认提交；打开期间注册返回键 = 取消）：
 * - 顶栏：✕ · 标题 + 「距提醒 约 N 小时 M 分钟」实时倒计时 · ✓（系统闹钟同款骨架，样式自绘）
 * - 三列滚轮视口仅 5 行高（200px），彻底杜绝撑爆表单/撑爆全屏的旧问题
 */
function PickerBody({ value, title, onConfirm, onDismiss }) {
  const m = String(value).match(/^(\d{1,2}):(\d{2})$/)
  const h24 = m ? Number(m[1]) : 9
  const [p, setP] = useState(h24 < 12 ? 0 : 1)
  const [h, setH] = useState((h24 % 12 === 0 ? 12 : h24 % 12) - 1)
  const [min, setMin] = useState(m ? Number(m[2]) : 0)
  const h12 = h + 1
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
  const toHHmm = (np, nh, nm) => {
    const hh = np === 0 ? nh % 12 : (nh % 12) + 12
    return `${String(hh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
  }
  // 副标题：距提醒还有多久（随滚轮实时刷新）
  const target = new Date()
  target.setHours(p === 0 ? h12 % 12 : (h12 % 12) + 12, min, 0, 0)
  let dayTxt = '今天'
  let diff = target - new Date()
  if (diff < 0) { target.setDate(target.getDate() + 1); diff = target - new Date(); dayTxt = '明天' }
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.round((diff % 3600000) / 60000)
  const awayTxt = hrs >= 1 ? `约 ${hrs} 小时 ${mins} 分钟后` : `${Math.max(mins, 1)} 分钟后`
  // 返回键 = 取消关闭（ref 保证回调始终最新，只注册一次）
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => pushBackHandler(() => dismissRef.current()), [])
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45 animate-in fade-in" onClick={onDismiss}>
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏：✕ 取消 · 标题+倒计时 · ✓ 确认 */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 shrink-0">
          <button onClick={onDismiss} className="w-10 h-10 rounded-full hover:bg-slate-100 text-slate-500 text-lg flex items-center justify-center touch-feedback" title="取消">✕</button>
          <div className="text-center min-w-0">
            <div className="text-sm font-bold text-slate-800 leading-tight">{title}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">距提醒 {awayTxt}</div>
          </div>
          <button onClick={() => onConfirm(toHHmm(p, h12, min))} className="w-10 h-10 rounded-full hover:bg-indigo-50 text-indigo-600 text-xl font-bold flex items-center justify-center touch-feedback" title="确定">✓</button>
        </div>
        {/* 三列紧凑滚轮 */}
        <div className="px-4 py-2">
          <div className="flex text-[11px] text-slate-400 mb-1">
            <div className="w-16 text-center">时段</div>
            <div className="flex-1 text-center">时</div>
            <div className="flex-1 text-center">分</div>
          </div>
          <div className="flex items-stretch">
            <div className="w-16 shrink-0"><Wheel items={['上午', '下午']} index={p} onIndexChange={setP} /></div>
            <div className="flex-1 min-w-0"><Wheel items={hours} index={h} onIndexChange={setH} /></div>
            <div className="flex-1 min-w-0"><Wheel items={minutes} index={min} onIndexChange={setMin} /></div>
          </div>
        </div>
        <div className="px-4 pb-3 pt-1.5 text-center text-[11px] text-slate-400 border-t border-slate-100">
          滚动 / 点选数字调整 · 将于{dayTxt}{p === 0 ? '上午' : '下午'} {String(h12).padStart(2, '0')}:{minutes[min]} 提醒
        </div>
      </div>
    </div>
  )
}
