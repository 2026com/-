import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { useAppState, useAppDispatch } from '../../../../context/AppContext.jsx'
import { getNodeRect, STAGE_PHASES } from '../../../../utils/constants.js'
import MindNode from './MindNode.jsx'
import NodeLinks from './NodeLinks.jsx'
import NodePopup from './NodePopup.jsx'
import StageDividers from './StageDividers.jsx'
import { useMindMapLayout, fromDayIdx, BASE_PX_PER_DAY, ZOOM_MIN, ZOOM_MAX, X_MARGIN } from '../../../../hooks/useMindMapLayout.js'
import { useNodeInteraction, getPointer } from '../../../../hooks/useNodeInteraction.js'
import CanvasRenderer from './CanvasRenderer.jsx'
import EdgeRenderer from './EdgeRenderer.jsx'
import NodeRenderer from './NodeRenderer.jsx'

/**
 * 无限层级思维导图核心画布
 * W3/W4 改动：节点 X 严格绑定到「具体某一天」坐标，点击本周/本月/全部 → 动态时间范围缩放
 * - 节点虚拟 dayIdx：基于 startDate/dueDate/createdAt/estimatedHours 计算（0 = 今天，-ve 过去，+ve 未来）
 * - 按当前 timeFilter 算出范围 startIdx/endIdx，动态分配 dayW 像素/天 与 dayX0 左边距
 * - 渲染节点时"显示位置"用 zoomMode 下重算的像素覆盖原 node.x（不落盘，保证切换无损）
 */

export default function MindMapCanvas({ zoom = 1, onCreateRootNode, timeFilter = 'week', editMode = false, onZoomChange, activeRootId, onViewChange }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const containerRef = useRef(null)
  // [修复] 幕布样式（lined 横线网格 / plain 纯白）从全局设置读取，切幕布图标即时生效
  const canvasStyle = state.settings?.canvasStyle || 'lined'
  const [windowStart, setWindowStartRaw] = useState(() => state.ui?.canvasViews?.[activeRootId]?.windowStart ?? 0)  // 视口左缘 dayIdx（0=今天，时间轴起点）
  const [offsetY, setOffsetY] = useState(() => state.ui?.canvasViews?.[activeRootId]?.offsetY ?? 20)            // 纵向平移（px）
  const [isPanning, setIsPanning] = useState(false)
  const [panState, setPanState] = useState(null)        // {startX, startY, startWindow, startOffsetY}
  // 历史最左可滑边界：只能滑到「今天」或「最早有任务节点的那天」（取更早者）
  const minWindowStartRef = useRef(0)
  const setWindowStart = (v) => setWindowStartRaw(Math.max(minWindowStartRef.current, v))
  // AI 生成方案后锚定窗口时，抑制下一次缩放重定位（避免 focusPlan 与 zoom 拟合互相覆盖）
  const suppressRecenterRef = useRef(false)
  // 滚轮缩放时记录鼠标所在 X，缩放后以该处为锚点保持不动
  const mouseXRef = useRef(null)
  const [viewportW, setViewportW] = useState(1200)
  const bgClickStartRef = useRef(null)
  const lastFilterRef = useRef({ filter: timeFilter, t: Date.now() })
  // W5：父节点折叠/展开状态（本地 UI 状态；按幕布保存快照，切换/返回后恢复）
  const [expandedIds, setExpandedIds] = useState(() => new Set(state.ui?.canvasViews?.[activeRootId]?.expandedIds || []))

  // ====== 拆分迁移：布局计算逻辑 → src/hooks/useMindMapLayout.js（原样移动，逻辑不变） ======
  const {
    childrenMap, siblingIndexById, byId, nodeDayIdx,
    pxPerDay, visibleDays, earliestNodeDay,
    renderedNodes, visibleNodeIds,
    routeDecorations, axisTicks, centerMainPath,
  } = useMindMapLayout({ nodes: state.nodes, zoom, viewportW, windowStart, activeRootId, expandedIds })

  // ====== 拆分迁移：节点交互逻辑 → src/hooks/useNodeInteraction.js（原样移动，逻辑不变） ======
  const {
    popupTarget, setPopupTarget,
    dragState, setDragState,
    suppressClickRef,
    onNodeClick, onNodePopupOpen, onNodeMouseDown,
  } = useNodeInteraction({ dispatch, nodes: state.nodes, childrenMap, byId, nodeDayIdx, expandedIds, setExpandedIds, containerRef, editMode })

  // ====== W5/V5：AI 生成执行方案后自动展开根节点与阶段节点（消费 ui.autoExpandIds） ======
  useEffect(() => {
    const ids = state.ui?.autoExpandIds || []
    if (!Array.isArray(ids) || ids.length === 0) return
    setExpandedIds(prev => {
      const s = new Set(prev)
      ids.forEach(id => s.add(id))
      return s
    })
    dispatch({ type: 'CLEAR_AUTO_EXPAND' })
  }, [state.ui?.autoExpandIds, dispatch])

  // ====== 切走页面时保存当前幕布视图/展开快照（返回后精确恢复，生成的图不消失） ======
  const viewSnapshotRef = useRef({ windowStart, offsetY, expandedIds })
  viewSnapshotRef.current = { windowStart, offsetY, expandedIds }
  const activeRootRef = useRef(activeRootId)
  activeRootRef.current = activeRootId
  useEffect(() => () => {
    const v = viewSnapshotRef.current
    dispatch({
      type: 'SAVE_CANVAS_VIEW',
      payload: {
        canvasId: activeRootRef.current,
        view: { windowStart: v.windowStart, offsetY: v.offsetY, expandedIds: Array.from(v.expandedIds) },
      }
    })
  }, [])

  // ====== 视图上报：windowStart/offsetY/expandedIds 变化时同步给父页（切换幕布前保存精确位置） ======
  useEffect(() => {
    if (typeof onViewChange === 'function') {
      onViewChange({ windowStart, offsetY, expandedIds: Array.from(expandedIds) })
    }
  }, [windowStart, offsetY, expandedIds, onViewChange])

  // ====== 切换幕布后恢复目标幕布的精确视图（windowStart/offsetY/expandedIds；zoom 由父页恢复） ======
  useEffect(() => {
    const pv = state.ui?.pendingCanvasView
    if (!pv) return
    if (pv.view) {
      // 已切过的幕布：精确还原此前的位置/展开状态（不跳动、不重置）
      suppressRecenterRef.current = true
      const ws = Number(pv.view.windowStart)
      setWindowStart(Number.isFinite(ws) ? ws : 0)
      const oy = Number(pv.view.offsetY)
      setOffsetY(Number.isFinite(oy) ? oy : 20)
      setExpandedIds(new Set(Array.isArray(pv.view.expandedIds) ? pv.view.expandedIds : []))
      // 安全兜底：若 zoom 未变化导致 zoom effect 未消费该标记，稍后自动清掉，避免吞掉下一次正常缩放
      setTimeout(() => { suppressRecenterRef.current = false }, 0)
    } else if (pv.canvasId) {
      // 新幕布（无历史视图）：仅展开该幕布根节点
      setExpandedIds(prev => { const s = new Set(prev); s.add(pv.canvasId); return s })
      // [修复] 移动端新节点不可见：把时间窗锚定到新根节点所在日期，
      // 避免节点因截止日在未来（dayIdx 数十天后）而落在窄视口右侧视区之外。
      const root = byId[pv.canvasId]
      if (root) {
        const dIdx = nodeDayIdx[pv.canvasId]
        if (typeof dIdx === 'number' && Number.isFinite(dIdx)) {
          setWindowStart(dIdx - 1)
          setOffsetY(20)
        }
      }
    }
  }, [state.ui?.pendingCanvasView])

  // ====== 画布尺寸：ResizeObserver，窗口变化随时更新用于计算 dayW ======
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportW(Math.max(480, el.clientWidth || 1200))
    update()
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update)
      ro.observe(el)
    } else {
      window.addEventListener('resize', update)
    }
    return () => {
      if (ro) ro.disconnect(); else window.removeEventListener('resize', update)
    }
  }, [])


  // ====== 切换 timeFilter：重置时间轴锚点（本周/本月=今天起点；全部=最早任务日） ======
  useEffect(() => {
    const prev = lastFilterRef.current
    if (prev.filter !== timeFilter) {
      lastFilterRef.current = { filter: timeFilter, t: Date.now() }
      const anchor = timeFilter === 'all' ? minWindowStartRef.current : 0
      setWindowStart(Math.max(minWindowStartRef.current, anchor))
      setOffsetY(20)
    }
  }, [timeFilter])

  // ====== 缩放变化：以视口中心为锚点重算窗口，避免缩放时内容跑偏 ======
  const prevZoomRef = useRef(zoom)
  useEffect(() => {
    const prev = prevZoomRef.current
    if (prev !== zoom) {
      prevZoomRef.current = zoom
      // AI 生成方案刚锚定过窗口 → 跳过居中重定位，让 focusPlan 的窗口生效
      if (suppressRecenterRef.current) { suppressRecenterRef.current = false; return }
      const oldPx = BASE_PX_PER_DAY * Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev))
      const newPx = BASE_PX_PER_DAY * Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
      // 缩放锚点：优先用鼠标所在 X（滚轮缩放），否则用视口中心
      const anchorX = mouseXRef.current != null ? mouseXRef.current : (viewportW / 2)
      const anchorDay = windowStart + (anchorX - X_MARGIN) / oldPx
      setWindowStart(anchorDay - (anchorX - X_MARGIN) / newPx)
      mouseXRef.current = null
    }
  }, [zoom, viewportW])

  // ====== AI 生成执行方案后：把时间窗锚定到方案起点（配合 zoom 拟合，一屏看到整个执行路径图） ======
  useEffect(() => {
    const fp = state.ui?.focusPlan
    if (!fp || !fp.at) return
    suppressRecenterRef.current = true
    setWindowStart(Math.max(minWindowStartRef.current, (fp.minDay != null ? Number(fp.minDay) : 0) - 1))
    setOffsetY(20)
  }, [state.ui?.focusPlan])


  // ====== 新建幕布/切换幕布：仅展开该幕布根节点（视图位置由 canvasViews 按幕布精确恢复，不重置/不跳动） ======
  useEffect(() => {
    const rid = state.ui?.focusRootId
    if (!rid) return
    dispatch({ type: 'CLEAR_FOCUS_ROOT' })
    setExpandedIds(prev => { const s = new Set(prev); s.add(rid); return s })
  }, [state.ui?.focusRootId])

  // ====== [修复] 新创建节点后自动滚动到该节点（移动端窄视口只有约 2 天宽，新节点默认落在视区外不可见） ======
  useEffect(() => {
    const fid = state.ui?.focusNodeId
    if (!fid) return
    const n = byId[fid]
    dispatch({ type: 'CLEAR_FOCUS_NODE' })  // 一次性消费，避免每次渲染都重滚
    if (!n) return
    const dIdx = nodeDayIdx[fid]
    if (typeof dIdx !== 'number' || !Number.isFinite(dIdx)) return
    // 已在视口中间 ±可见天数的 45% 范围内 → 无需滚动
    if (dIdx >= windowStart + visibleDays * 0.1 && dIdx <= windowStart + visibleDays * 0.9) return
    // 锚到新节点的前一天，让节点落在视口左 1/4（与新建幕布的定位行为一致，不跳动）
    setWindowStart(Math.max(minWindowStartRef.current, dIdx - 1))
  }, [state.ui?.focusNodeId])


    const onCanvasMouseDown = (e) => {
    if (e.target !== e.currentTarget) {
      if (e.target.closest && (e.target.closest('.mind-node') || e.target.closest('.node-link-wrap') || e.target.closest('button'))) return
    }
    const p = getPointer(e)
    bgClickStartRef.current = { x: p.x, y: p.y, t: Date.now() }
    // 锁定/编辑模式都可拖动画布（滑动/缩放看全局）；锁定模式下仅节点位置固定
    setIsPanning(true)
    setPanState({ startX: p.x, startY: p.y, startWindow: windowStart, startOffsetY: offsetY })
  }
  const onCanvasMouseMove = (e) => {
    if (isPanning && panState) {
      const p = getPointer(e)
      const dx = p.x - panState.startX
      const dy = p.y - panState.startY
      // 水平拖动 → 时间窗平移（左滑看历史、右滑看未来；锁定/编辑模式均可）
      setWindowStart(panState.startWindow - dx / pxPerDay)
      // 垂直拖动 → 仅编辑模式可上下平移画布；锁定模式下图固定在幕布位置，不随上下拖动滑走
      if (editMode) setOffsetY(panState.startOffsetY + dy)
    } else if (dragState && dragState.nodeId) {
      const p = getPointer(e)
      const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { left: 0, top: 0 }
      const px = p.x - rect.left
      const py = p.y - rect.top
      // 编辑模式拖拽：上下改 Y（垂直），左右改 dueDate（水平时间定位）
      const di = Math.round(dragState.startDi + (px - dragState.startPX) / pxPerDay)
      const ny = dragState.startY + (py - dragState.startPY)
      if (Math.abs(px - dragState.startPX) > 2 || Math.abs(py - dragState.startPY) > 2) suppressClickRef.current = true
      const newDue = fromDayIdx(di).toISOString().slice(0, 10)
      // moved=true：标记手动布局，后续自动布局不再覆盖其 Y/日期位置
      dispatch({ type: 'UPDATE_NODE', id: dragState.nodeId, payload: { y: ny, dueDate: newDue, deadline: newDue, moved: true } })
    }
  }
  const onCanvasMouseUp = (e) => {
    const popupExists = !!(document.querySelector('.mind-node-popup-root, [data-mind-popup="1"]'))
    if (bgClickStartRef.current && !popupExists) {
      const s = bgClickStartRef.current
      const p = getPointer(e)
      const dx = Math.abs(p.x - s.x), dy = Math.abs(p.y - s.y)
      const dt = Date.now() - s.t
      if (dx <= 4 && dy <= 4 && dt <= 260) {
        if (state.ui?.selectedNodeId) dispatch({ type: 'SET_SELECTED_NODE', payload: null })
        if (popupTarget) setPopupTarget(null)
      }
    }
    bgClickStartRef.current = null
    setIsPanning(false); setDragState(null)
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }
  // 双击画布空白处 → 新建独立根节点（把双击位置换算为画布坐标，便于放到双击处）
  const onCanvasDblClick = (e) => {
    if (e.target !== e.currentTarget && !e.currentTarget.isSameNode(e.target)) {
      if (e.target.closest('.mind-node') || e.target.closest('.node-link-wrap') || e.target.closest('button')) return
    }
    const p = getPointer(e)
    const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { left: 0, top: 0 }
    const cx = p.x - rect.left
    const cy = p.y - rect.top - offsetY
    createRoot({ x: cx, y: cy })
  }
  const onWheel = (e) => {
    e.preventDefault()
    // 滚轮 = 缩放（以鼠标所在处为中心）：上滚放大 / 下滚缩小
    const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { left: 0, top: 0 }
    mouseXRef.current = e.clientX - rect.left
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    const factor = delta < 0 ? 1.25 : 0.8
    if (typeof onZoomChange === 'function') onZoomChange(factor)
  }
  // React 的 onWheel 是 passive 监听，无法 preventDefault（会告警）→ 改为手动非 passive 监听
  const onWheelRef = useRef(onWheel)
  onWheelRef.current = onWheel
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e) => { if (onWheelRef.current) onWheelRef.current(e) }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])
const defaultCreateRoot = useCallback(() => {
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'prompt', title: '请输入长期目标名称',
        placeholder: '例：学习钢琴 / 备考雅思 / 健身减脂',
        defaultValue: '',
        onOk: (val) => {
          const title = (val || '').trim()
          if (!title) return
          // W3/W4：创建节点默认"今天为起点 + 按小时算截止日"，X 会由 zoomCtx 在 useMemo 内重新算
          dispatch({
            type: 'ADD_NODE',
            payload: {
              title, parentId: null, systemId: 'zhuye', status: 'todo', progress: 0,
              // x/y 仅作为兜底落盘，实际展示以 zoomCtx 下覆盖值为准
              x: 0, y: 0,
              level: 0,
              estimatedHours: 40,
              difficulty: 2, value: 2, weight: 20,
            }
          })
        }
      }
    })
  }, [dispatch])
  const createRoot = onCreateRootNode || defaultCreateRoot

  // ====== 主渲染 ======
  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative select-none touch-manipulation overflow-hidden ${canvasStyle === 'lined' ? 'canvas-lined' : 'bg-white'}`}
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onCanvasMouseMove}
      onMouseUp={onCanvasMouseUp}
      onMouseLeave={onCanvasMouseUp}
      onDoubleClick={onCanvasDblClick}
      onTouchStart={(e) => e.touches.length === 1 && onCanvasMouseDown(e.touches[0])}
      onTouchMove={(e) => e.touches.length === 1 && onCanvasMouseMove(e.touches[0])}
      onTouchEnd={onCanvasMouseUp}
    >
      {/* P2：已移除固定三期垂直分隔带（StageDividers），三期划分仅在「AI 生成的完整学习路线」节点 phaseLabel 上体现（阶段节点正上方显示） */}
      {/* W4/T4 旧 StageDividers 调用已删除 —— 用户明确要求「悬挂在幕布的前中后期暂时取消」 */}

      {/* 顶部硬朗时间轴：起点=今天，单位随缩放切换（天/周/月），直线刻度、按单位降采样 —— 拆分迁移至 CanvasRenderer.jsx */}
      <CanvasRenderer axisTicks={axisTicks} />

      {/* 拆分迁移：连线/装饰渲染层 → src/components/mindmap/EdgeRenderer.jsx */}
      <EdgeRenderer
        offsetY={offsetY}
        centerMainPath={centerMainPath}
        routeDecorations={routeDecorations}
        renderedNodes={renderedNodes}
        nodes={state.nodes}
        onNodeClick={onNodeClick}
      />

      {/* 拆分迁移：节点卡片渲染层 → src/components/mindmap/NodeRenderer.jsx */}
      <NodeRenderer
        offsetY={offsetY}
        renderedNodes={renderedNodes}
        selectedNodeId={state.ui.selectedNodeId}
        progressMode={state.settings.progressMode}
        allNodes={state.nodes}
        siblingIndexById={siblingIndexById}
        childrenMap={childrenMap}
        expandedIds={expandedIds}
        editMode={editMode}
        onNodeClick={onNodeClick}
        onNodePopupOpen={onNodePopupOpen}
        onNodeMouseDown={onNodeMouseDown}
      />

      {/* 空画布提示 */}
      {state.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-slate-400">
            <div className="text-5xl mb-3">🎯</div>
            <div className="text-sm font-medium">点击右下角 ➕ 新建 按钮，开启第一个长期目标</div>
            <div className="text-xs mt-2 opacity-70">· 点击父节点逐层展开 · 滚轮平移画布 · 右下角缩放 · 右上角「编辑模式」可拖动节点</div>
          </div>
        </div>
      )}

      {/* 节点弹窗：getPosition 基于当前屏幕 x/y 定位（renderedNodes 的覆盖值） */}
      {popupTarget && (() => {
        const n = renderedNodes.find(x => x.id === popupTarget) || state.nodes.find(n => n.id === popupTarget)
        // W5：目标节点若因父节点收起而不可见 → 不弹窗
        if (!n || !visibleNodeIds.has(popupTarget)) return null
        return (
          <NodePopup
            nodeId={popupTarget}
            onClose={() => setPopupTarget(null)}
            getPosition={() => ({ x: (n.x || 0) + 42, y: (n.y || 0) + offsetY - 20 })}
          />
        )
      })()}
    </div>
  )
}
