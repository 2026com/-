import React, { useMemo } from 'react'
import { STAGE_PHASES } from '../../../../utils/constants.js'

/**
 * 思维导图画布：三阶段垂直时间分隔带
 * 灵感来自用户参考图"零基础学笛子完整学习路线"的「前期 / 中期 / 后期」横向大标题分段。
 * —— 不参与 transform（不随节点平移而位移），完全贴合 MindMapCanvas 顶层容器尺寸。
 *
 * T4 升级：分隔带位置由「3 段等分 (1/3, 2/3)」改为「按 AI 生成的 3 阶段节点的真实 dayIdx 分界」放置。
 * - stageBands: [{ phase:'early'|'middle'|'late', startDayIdx:number, endDayIdx:number }] 长度必须 3，end 不含
 *   如果传 null → 退回兼容模式（按 dateAxis 长度三等分）
 * - zoomCtx: 从 MindMapCanvas 传出的当前缩放上下文 { bounds:{startIdx,endIdx}, dayW, dayX0OnScreen }
 *   若 zoomCtx 为空 → 退回旧 dayX0/dayW 常量兼容模式
 */

const TOTAL_DAYS_FULL = 165

export default function StageDividers({ zoomCtx, stageBands, dateAxis, dayX0, dayW }) {
  const bands = useMemo(() => {
    // T4：优先按 stageBands + zoomCtx 的真实日坐标放置（W4 动态缩放的正确用法）
    if (zoomCtx && Array.isArray(stageBands) && stageBands.length === 3) {
      const { bounds, dayW: zw, dayX0OnScreen } = zoomCtx
      // 虚拟 dayIdx → 屏幕 X（与 MindMapCanvas 内部公式完全一致）
      const dx = (dayIdx) => dayX0OnScreen + (dayIdx - bounds.startIdx) * zw
      const visibleStart = bounds.startIdx
      const visibleEnd = bounds.endIdx
      return stageBands.map(b => {
        const phase = STAGE_PHASES.find(p => p.key === b.phaseKey) || STAGE_PHASES[0]
        // 夹到可见范围内，避免越界绘制
        const s = Math.max(visibleStart, b.startDayIdx)
        const e = Math.min(visibleEnd + 1, b.endDayIdx) // end 不含，延伸到 endIdx 那天
        if (e <= s) {
          return { phase, x: 0, w: 0, startDay: 0, empty: true }
        }
        const xPx = dx(s)
        const endPx = dx(e)
        return {
          phase,
          startDay: s,
          x: xPx,
          w: Math.max(0, endPx - xPx),
          empty: false,
        }
      })
    }
    // 兼容老调用：dateAxis + 等分（1/3, 2/3），保持以前的兜底行为
    const N = Array.isArray(dateAxis) ? dateAxis.length : TOTAL_DAYS_FULL
    const splits = [0, Math.round(N / 3), Math.round(2 * N / 3), N]
    return STAGE_PHASES.map((phase, i) => ({
      phase,
      startDay: splits[i],
      x: (dayX0 || 220) + splits[i] * (dayW || 24),
      w: (splits[i + 1] - splits[i]) * (dayW || 24),
      empty: false,
    }))
  }, [zoomCtx, stageBands, dateAxis, dayX0, dayW])

  const totalW = useMemo(() => {
    if (zoomCtx) {
      const { bounds, dayW: zw, dayX0OnScreen } = zoomCtx
      return (bounds.endIdx - bounds.startIdx + 1) * zw
    }
    const N = Array.isArray(dateAxis) ? dateAxis.length : TOTAL_DAYS_FULL
    return N * (dayW || 24)
  }, [zoomCtx, dateAxis, dayW])

  const dayX0Px = zoomCtx ? zoomCtx.dayX0OnScreen : (dayX0 || 220)

  return (
    <div className="absolute inset-0 pointer-events-none z-[1]" aria-hidden>
      {/* W1：去除原三阶段半透明蓝紫/绿背景（导致"左1/3纯白+右2/3蒙色"），只保留顶部分段标题 + 虚线分隔 */}
      {bands.map((b, i) => b.empty ? null : (
        <div
          key={`${b.phase.key}-${i}`}
          className="absolute top-0 bottom-0"
          style={{
            left: b.x,
            width: b.w,
            background: 'transparent',
            borderLeft: i === 0 ? 'none' : `1px dashed ${b.phase.border}`,
          }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 top-[68px] px-3 py-1 rounded-full whitespace-nowrap text-[11px] font-bold tracking-wider bg-white"
            style={{ color: b.phase.text, border: `1px solid ${b.phase.border}`, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}
          >
            {b.phase.name}
          </div>
        </div>
      ))}
      {/* 顶部分段基线 */}
      <div
        className="absolute top-[96px] h-px bg-slate-200/70"
        style={{ left: dayX0Px, width: totalW }}
      />
    </div>
  )
}
