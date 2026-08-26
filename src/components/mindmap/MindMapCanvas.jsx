import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { getNodeRect, STAGE_PHASES } from '../../utils/constants.js'
import MindNode from './MindNode.jsx'
import NodeLinks from './NodeLinks.jsx'
import NodePopup from './NodePopup.jsx'
import StageDividers from './StageDividers.jsx'

/**
 * 无限层级思维导图核心画布
 * W3/W4 改动：节点 X 严格绑定到「具体某一天」坐标，点击本周/本月/全部 → 动态时间范围缩放
 * - 节点虚拟 dayIdx：基于 startDate/dueDate/createdAt/estimatedHours 计算（0 = 今天，-ve 过去，+ve 未来）
 * - 按当前 timeFilter 算出范围 startIdx/endIdx，动态分配 dayW 像素/天 与 dayX0 左边距
 * - 渲染节点时"显示位置"用 zoomMode 下重算的像素覆盖原 node.x（不落盘，保证切换无损）
 */

// ====== 节点布局垂直常量（Y 方向不随时间缩放改变） ======
const LEVEL_Y_STEP = 96
const SIBLING_Y_STEP = 76
const PIANO_ROOT_Y = 280
const TREE_GAP = 120

/** 虚拟 dayIdx ←→ Date 互转（dayIdx=0 就是今天零点） */
function toDayIdx(d) {
  if (!d) return 0
  const base = new Date(); base.setHours(0,0,0,0)
  const target = new Date(d); target.setHours(0,0,0,0)
  return Math.round((target.getTime() - base.getTime()) / 86400000)
}
function fromDayIdx(i) {
  const d = new Date(); d.setHours(0,0,0,0)
  d.setDate(d.getDate() + i)
  return d
}

/** 计算给定节点的"锚点 dayIdx"：优先 dueDate，否则 startDate+中点，否则父节点+几天偏移 */
function computeNodeDayIdx(n, byIdMap, siblingIdxCache) {
  // 1) dueDate → 直接取
  if (n && (n.dueDate || n.deadline)) return toDayIdx(n.dueDate || n.deadline)
  // 2) startDate / createdAt + estimatedHours/4 中点
  const base = n.startDate || (n.createdAt ? new Date(n.createdAt) : null)
  const hours = Number(n.estimatedHours) || 2
  const estDays = Math.max(1, Math.ceil(hours / 4))
  if (base) return toDayIdx(base) + Math.round(estDays / 2)
  // 3) 按 parent 估算：parent dayIdx + (siblingIdx/sibCount) * 1.5 天
  const parent = (n && n.parentId) ? byIdMap[n.parentId] : null
  if (parent) {
    const pIdx = computeNodeDayIdx(parent, byIdMap, siblingIdxCache)  // 递归父
    const siblings = (siblingIdxCache && siblingIdxCache.siblingsOf && siblingIdxCache.siblingsOf[parent.id]) || [n.id]
    const total = Math.max(1, siblings.length)
    const myIdx = siblings.indexOf(n.id)
    const spread = Math.max(2, Math.min(8, total))
    return pIdx + Math.round((myIdx - (total - 1) / 2) * (total <= 1 ? 0 : spread / (total - 1)) * 2)
  }
  return 0  // 兜底：今天
}

/** 计算整棵子树包围盒高度（用于动态分配多并行大任务的 Y 起点） */
function calcTreeHeight(root, nodesWithPos, childrenMap) {
  const ids = new Set([root.id]); const q = [root.id]
  while (q.length) {
    const id = q.shift()
    const kids = childrenMap[id] || []
    kids.forEach(k => { if (!ids.has(k.id)) { ids.add(k.id); q.push(k.id) } })
  }
  let yMin = Infinity, yMax = -Infinity
  nodesWithPos.forEach(n => {
    if (!ids.has(n.id)) return
    const y = n.y || 0
    const { h } = getNodeRect(n.level || 0)
    const scale = (n.level || 0) <= 1 ? 1.9 : 2.5
    yMin = Math.min(yMin, y - (h * scale) / 2)
    yMax = Math.max(yMax, y + (h * scale) / 2 + 22)
  })
  if (!isFinite(yMin) || !isFinite(yMax)) return 260
  return Math.max(260, yMax - yMin)
}

// ====== 硬朗时间轴：像素密度驱动的缩放模型 ======
const X_MARGIN = 48                       // 画布左侧留白（今天 = 时间轴起点，落在左缘内侧）
const BASE_PX_PER_DAY = 150               // zoom=1 时每「天」像素（约一周铺满视口）
const ZOOM_MIN = 0.03, ZOOM_MAX = 3        // 缩放范围（对应 月/周/天 三档刻度单位）

/** 由 pxPerDay 推导当前刻度单位：放得越大单位越小（天 → 周 → 月），据此减少渲染刻度 */
function pickTimeUnit(pxPerDay) {
  if (pxPerDay >= 26) return 'day'    // 细看：每天一格
  if (pxPerDay >= 6)  return 'week'   // 缩小：每周一格
  return 'month'                       // 更小：每月一格
}

/** 生成顶部硬朗刻度的 tick 数组：只渲染当前单位、按密度跳标签，控制刻度密度与渲染量 */
function buildAxisTicks({ windowStart, pxPerDay, viewportW }) {
  const visibleDays = (viewportW - X_MARGIN) / pxPerDay
  const unit = pickTimeUnit(pxPerDay)
  const ticks = []
  const start = Math.floor(windowStart)
  const end = Math.ceil(windowStart + visibleDays)
  const push = (x, extra) => ticks.push({ x: X_MARGIN + x, ...extra })

  if (unit === 'day') {
    const labelStep = Math.max(1, Math.round(84 / pxPerDay))
    for (let i = start; i <= end; i++) {
      const d = fromDayIdx(i)
      push((i - windowStart) * pxPerDay, {
        type: 'day',
        isToday: i === 0,
        isMonthStart: d.getDate() === 1,
        label: i % labelStep === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : '',
        monthLabel: d.getDate() === 1 ? `${d.getMonth() + 1}月` : '',
      })
    }
  } else if (unit === 'week') {
    const mondayOf = (i) => { const d = fromDayIdx(i); const dow = (d.getDay() + 6) % 7; return i - dow }
    const weekLabelStep = Math.max(1, Math.round(64 / pxPerDay / 7))
    let w = 0
    for (let i = mondayOf(start); i <= end; i += 7, w++) {
      const d = fromDayIdx(i)
      push((i - windowStart) * pxPerDay, {
        type: 'week',
        label: w % weekLabelStep === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : '',
        monthLabel: d.getDate() <= 7 ? `${d.getMonth() + 1}月` : '',
      })
    }
  } else {
    const firstD = fromDayIdx(start)
    let year = firstD.getFullYear(), month = firstD.getMonth()
    const monthLabelStep = Math.max(1, Math.round(70 / pxPerDay / 30))
    let m = 0
    for (;;) {
      const first = new Date(year, month, 1); first.setHours(0, 0, 0, 0)
      const i = toDayIdx(first)
      if (i > end) break
      push((i - windowStart) * pxPerDay, {
        type: 'month',
        label: m % monthLabelStep === 0 ? `${month + 1}月` : '',
        yearLabel: m % monthLabelStep === 0 && month === 0 ? `${year}` : '',
      })
      month++; if (month > 11) { month = 0; year++ }
      m++
    }
  }
  return { unit, ticks }
}
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
  const [popupTarget, setPopupTarget] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [viewportW, setViewportW] = useState(1200)
  const bgClickStartRef = useRef(null)
  const lastFilterRef = useRef({ filter: timeFilter, t: Date.now() })
  // W5：父节点折叠/展开状态（本地 UI 状态；按幕布保存快照，切换/返回后恢复）
  const [expandedIds, setExpandedIds] = useState(() => new Set(state.ui?.canvasViews?.[activeRootId]?.expandedIds || []))
  // W5：编辑模式下拖拽后抑制随后的 click（避免拖动结束误触发展开/弹窗）
  const suppressClickRef = useRef(false)

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

  // ====== childrenMap + 根排序（只算一次缓存） ======
  const { childrenMap, rootsSorted, siblingIndexById, siblingsOf } = useMemo(() => {
    const cMap = {}
    state.nodes.forEach(n => { if (n.parentId) (cMap[n.parentId] = cMap[n.parentId] || []).push(n) })
    Object.values(cMap).forEach(list => {
      list.sort((a, b) => (a.childIndex || 0) - (b.childIndex || 0) || (a.createdAt || 0) - (b.createdAt || 0))
      list.forEach((n, i) => { if (n.childIndex === undefined) n.childIndex = i })
    })
    const roots = state.nodes.filter(n => !n.parentId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    const idxMap = {}, sMap = {}
    roots.forEach((r, i) => { idxMap[r.id] = i })
    Object.entries(cMap).forEach(([pid, kids]) => {
      sMap[pid] = kids.map(k => k.id)
      kids.forEach((k, i) => { if ((k.level || 0) <= 1) idxMap[k.id] = i })
    })
    return { childrenMap: cMap, rootsSorted: roots, siblingIndexById: idxMap, siblingsOf: sMap }
  }, [state.nodes])

  // ====== 预计算：byId + 每个节点的锚点 dayIdx（随 state.nodes 变化重算） ======
  const { byId, nodeDayIdx } = useMemo(() => {
    const map = {}
    state.nodes.forEach(n => map[n.id] = n)
    const cache = { siblingsOf }
    const idxMap = {}
    state.nodes.forEach(n => { idxMap[n.id] = computeNodeDayIdx(n, map, cache) })
    return { byId: map, nodeDayIdx: idxMap }
  }, [state.nodes, siblingsOf])

  // ====== W5：节点折叠可见性 ======
  // 规则：节点默认「收起」（只显示标题本身）；只有被显式展开（在 expandedIds 中）才显示其直接子节点。
  // 一个节点可见当且仅当它所有祖先都没有被折叠；折叠状态仅存于本组件内存，不落盘、刷新恢复默认收起。
  const isCollapsed = useCallback((id) => {
    const kids = childrenMap[id]
    return !!(kids && kids.length > 0 && !expandedIds.has(id))
  }, [childrenMap, expandedIds])

  const visibleIds = useMemo(() => {
    const vis = new Set()
    const rootOf = {}
    state.nodes.forEach(n => {
      let cur = n
      while (cur.parentId) { const p = byId[cur.parentId]; if (!p) break; cur = p }
      rootOf[n.id] = cur ? cur.id : n.id
    })
    // 幕布独立不干扰：激活某幕布时只显示该幕布（根）下的节点
    const activeRoot = (activeRootId && byId[activeRootId]) ? activeRootId : null
    state.nodes.forEach(n => {
      if (activeRoot && rootOf[n.id] !== activeRoot) return
      let cur = n
      while (cur.parentId) {
        const p = byId[cur.parentId]
        if (!p) break
        if (isCollapsed(p.id)) return  // 有祖先被折叠 → 本节点隐藏
        cur = p
      }
      vis.add(n.id)
    })
    return vis
  }, [state.nodes, byId, isCollapsed, activeRootId])

  // ====== 硬朗时间轴模型：像素/天 缩放 + 视口窗口 ======
  const pxPerDay = BASE_PX_PER_DAY * Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(zoom) || 1))
  const visibleDays = Math.max(1, (viewportW - X_MARGIN) / pxPerDay)

  // 最早任务节点日（含今天兜底 0）→ 决定左滑边界：以「第一个节点为开头」，还可再往前移动一个月（30 天）
  const earliestNodeDay = useMemo(() => {
    let mn = 0
    state.nodes.forEach(n => { const i = nodeDayIdx[n.id]; if (typeof i === 'number' && i < mn) mn = i })
    return mn
  }, [state.nodes, nodeDayIdx])
  useEffect(() => { minWindowStartRef.current = Math.min(0, earliestNodeDay) - 30 }, [earliestNodeDay])

  const dayToScreenX = useCallback((dayIdx) => X_MARGIN + (dayIdx - windowStart) * pxPerDay, [windowStart, pxPerDay])
  const screenToDayIdx = useCallback((x) => windowStart + (x - X_MARGIN) / pxPerDay, [windowStart, pxPerDay])

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
    setWindowStart(Math.max(minWindowStartRef.current, (Number(fp.minDay) ?? 0) - 1))
    setOffsetY(20)
  }, [state.ui?.focusPlan])

const { renderedNodes, visibleNodeIds, rootsById, stageNodesByRoot } = useMemo(() => {
    // P1X：预计算"每条路线根节点 → 3 个阶段节点"的映射，供上下 4+4 白框分类分布 & 路线装饰层绘制
    const stageNodesByRootInner = {}
    state.nodes.forEach(n => {
      if (!n.isRouteStageNode) return
      const rid = n.parentId
      if (!rid) return
      if (!stageNodesByRootInner[rid]) stageNodesByRootInner[rid] = []
      stageNodesByRootInner[rid].push(n.id)
    })
    // 根元信息（标题/副标题/口诀）缓存
    const rootsByIdInner = {}
    state.nodes.forEach(n => {
      if (n.parentId != null && (n.level || 0) !== 0) return
      rootsByIdInner[n.id] = n
    })

    // 1) 先跑垂直布局：继承 U3「主轴上下两侧对称分布」（只处理 Y，不落盘）
    //    增强：对 level=2 且有 routeGroup=above/below 的分类节点——强制把 above 聚在父（阶段节点）上方、below 下方，每侧 4 个等间距
    const sortedForY = [...state.nodes].sort((a, b) => (a.level || 0) - (b.level || 0) || ((a.createdAt || 0) - (b.createdAt || 0)))
    const yMap = {}
    // P1X：先按普通上下分布算出 children
    sortedForY.forEach(n => {
      const parent = n.parentId ? byId[n.parentId] : null
      // 手动移动过的节点（编辑模式拖拽）→ 保持用户摆放的 Y，不再被自动布局覆盖
      if (n.moved && typeof n.y === 'number') { yMap[n.id] = n.y; return }
      if (!parent) return
      const parentY = (n.parentId && yMap[n.parentId] !== undefined) ? yMap[n.parentId] : (parent.y || PIANO_ROOT_Y)
      // ====== P1X: 上下 4+4 白框分类节点（routeGroup=above|below）单独 Y 分布 ======
      if ((parent.level || 0) === 1 && (parent.isRouteStageNode || parent.phaseLabel) && (n.routeGroup === 'above' || n.routeGroup === 'below')) {
        const allSibs = siblingsOf[parent.id] ? siblingsOf[parent.id].map(id => state.nodes.find(x => x.id === id)).filter(Boolean) : [n]
        const aboveArr = allSibs.filter(s => s.routeGroup === 'above')
        const belowArr = allSibs.filter(s => s.routeGroup === 'below')
        const boxGap = 78   // 上下每个白框在 Y 方向占 78px 高度（节点本体 40px + 间距 38px），保证 4 个不重叠
        if (n.routeGroup === 'above') {
          const i = aboveArr.findIndex(s => s.id === n.id)
          const idx = i >= 0 ? i : 0
          yMap[n.id] = parentY - 58 - (3 - idx) * boxGap   // 从上到下 4 个依次靠近阶段节点
        } else {
          const i = belowArr.findIndex(s => s.id === n.id)
          const idx = i >= 0 ? i : 0
          yMap[n.id] = parentY + 58 + idx * boxGap
        }
        return
      }
      // ====== AI 三层方案布局：根节点=开头，主轴线向前延伸，方案分站两边 ======
      // A) 阶段/终点旗帜：与根节点同一水平线（主轴线），仅作为线上标注、不单独成卡
      if ((n.isRouteStageNode || n.isRouteFlagNode) && parent && !parent.parentId) {
        yMap[n.id] = parentY
        return
      }
      // B) 步骤：在主轴线上下两侧交替站立（方案分站两边）
      if (parent && parent.isRouteStageNode) {
        const phaseIdx = siblingsOf[parent.parentId] ? Math.max(0, siblingsOf[parent.parentId].indexOf(parent.id)) : 0
        const stepIdx = siblingsOf[parent.id] ? Math.max(0, siblingsOf[parent.id].indexOf(n.id)) : 0
        const above = (phaseIdx + stepIdx) % 2 === 0
        const dist = LEVEL_Y_STEP * 0.7 + stepIdx * (SIBLING_Y_STEP * 0.55)
        yMap[n.id] = parentY + (above ? -dist : dist)
        return
      }
      // C) 详情（步骤的子孙）：沿步骤同侧向外延伸（远离主轴线）
      if (parent && parent.parentId && byId[parent.parentId] && byId[parent.parentId].isRouteStageNode) {
        const stepY = yMap[parent.id] !== undefined ? yMap[parent.id] : (parent.y || PIANO_ROOT_Y)
        const lineY2 = yMap[parent.parentId] !== undefined ? yMap[parent.parentId] : (parent.y || PIANO_ROOT_Y)
        const above = stepY < lineY2
        const idx = siblingsOf[parent.id] ? Math.max(0, siblingsOf[parent.id].indexOf(n.id)) : 0
        const gap = LEVEL_Y_STEP * 0.9 + idx * SIBLING_Y_STEP
        yMap[n.id] = stepY + (above ? -gap : gap)
        return
      }
      // ====== 非分类节点：原有逻辑 ======
      const siblings = siblingsOf[parent.id] ? siblingsOf[parent.id].map(id => state.nodes.find(x => x.id === id)).filter(Boolean) : [n]
      const idxInSiblings = siblings.findIndex(s => s.id === n.id)
      const parentLevel = parent.level || 0
      if (parentLevel <= 1) {
        const step = SIBLING_Y_STEP * 0.92
        const onTop = (idxInSiblings % 2) === 0
        const sideIdx = Math.floor(idxInSiblings / 2)
        const distance = (sideIdx + 1) * step
        const gapBase = LEVEL_Y_STEP * 0.52
        yMap[n.id] = parentY + (onTop ? -(gapBase + distance) : (gapBase + distance))
      } else {
        const total = siblings.length
        const mid = (total - 1) / 2
        const offsetY = (idxInSiblings - mid) * SIBLING_Y_STEP
        yMap[n.id] = parentY + LEVEL_Y_STEP * 0.95 + offsetY
      }
    })
    // 2) 根 Y 分配：从前往后 Σ 子树高度
    const rootsWithY = [...rootsSorted]
    let yCursor = PIANO_ROOT_Y
    // 先给每个根分配"暂定值"以便 calcTreeHeight 能递归测量
    rootsWithY.forEach(r => { yMap[r.id] = r.y || yCursor })
    const cMapForH = childrenMap
    const nodeTempPos = state.nodes.map(n => {
      const y = yMap[n.id] !== undefined ? yMap[n.id] : (n.y || PIANO_ROOT_Y)
      return { ...n, y }
    })
    rootsWithY.forEach(r => {
      // 手动移动过的根节点：保持用户摆放位置，不参与自动堆叠
      if (r.moved && typeof r.y === 'number') { yMap[r.id] = r.y; return }
      const inClone = nodeTempPos.find(n => n.id === r.id)
      if (!inClone) return
      const h = calcTreeHeight(inClone, nodeTempPos, cMapForH)
      const desired = yCursor
      yMap[r.id] = desired
      inClone.y = desired
      yCursor = Math.max(yCursor + TREE_GAP, desired + h + TREE_GAP * 0.7)
    })

    // 3) 屏幕 X：用 dayIdx → dayToScreenX 计算；根节点作为该方案「开头」固定在子树最早日
    const subtreeMinDay = {}
    const collectMin = (id) => {
      if (subtreeMinDay[id] !== undefined) return subtreeMinDay[id]
      let mn = nodeDayIdx[id] !== undefined ? nodeDayIdx[id] : 0
      ;(childrenMap[id] || []).forEach(k => { mn = Math.min(mn, collectMin(k.id)) })
      subtreeMinDay[id] = mn
      return mn
    }
    state.nodes.forEach(n => collectMin(n.id))
    const withXY = state.nodes.map(n => {
      const isRoot = !n.parentId
      const di = isRoot
        ? (n.moved
          ? (nodeDayIdx[n.id] !== undefined ? nodeDayIdx[n.id] : 0)
          : (subtreeMinDay[n.id] !== undefined ? subtreeMinDay[n.id] : 0))
        : (nodeDayIdx[n.id] !== undefined ? nodeDayIdx[n.id] : 0)
      const sx = dayToScreenX(di)
      const sy = yMap[n.id] !== undefined ? yMap[n.id] : (n.y || PIANO_ROOT_Y)
      return { ...n, x: sx, y: sy, _dayIdx: di }
    })

    return {
      // W5：只渲染「可见」节点（祖先未折叠），其余布局/坐标仍按全部节点计算，展开时位置不漂移
      renderedNodes: withXY.filter(n => visibleIds.has(n.id)),
      visibleNodeIds: visibleIds,
      rootsById: rootsByIdInner,
      stageNodesByRoot: stageNodesByRootInner,
    }
  }, [state.nodes, rootsSorted, siblingsOf, byId, childrenMap, nodeDayIdx, dayToScreenX, visibleIds])

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

  // P1X: 路线级装饰层（每条根节点若 hasRoute=true，绘制顶部大标题/副标题、阶段 phaseLabel、最后阶段下方的黑色圆角口诀横条）
  const routeDecorations = useMemo(() => {
    const out = []
    Object.values(rootsById).forEach(root => {
      if (!root.hasRoute) return
      const r = renderedNodes.find(n => n.id === root.id)
      if (!r) return
      // 1) 所有直系阶段节点（主线 3 个）：取 minX/maxX 做标题横幅
      const stageIds = stageNodesByRoot[root.id] || []
      const stageNodes = stageIds.map(id => renderedNodes.find(n => n.id === id)).filter(Boolean)
      // 按 x 排序阶段，保证左右顺序一致
      stageNodes.sort((a, b) => (a.x || 0) - (b.x || 0))
      const all = [r, ...stageNodes, ...renderedNodes.filter(n => n.parentId === root.id && n.isRouteFlagNode)]
      const minX = Math.min(...all.map(n => (n.x || 0) - 200))
      const maxX = Math.max(...all.map(n => (n.x || 0) + 300))
      const midY = r.y || 0
      // 大标题（放在主线节点水平居中偏左 30px，主线上方 110px）
      const titleX = Math.min(r.x - 20, (minX + maxX) / 2)
      const titleY = midY - 160
      out.push({
        kind: 'title', rootId: root.id,
        x: titleX, y: titleY,
        title: root.routeTitle    || `${root.title || ''} 完整学习路线`,
        sub:   root.routeSubtitle || '一条中心横线看懂前期、中期、后期进阶',
      })
      // 2) 前/中/后期标注：固定标注在主轴线上（不再单独成节点卡片）
      stageNodes.forEach((sn, i) => {
        out.push({
          kind: 'phaseLabel', rootId: root.id, phaseId: sn.id,
          x: (sn.x || 0), y: (sn.y || 0) - 20,
          label: sn.phaseLabel || (['前期','中期','后期'][i] || ''),
          finalOnly: i === stageNodes.length - 1,
        })
        // 阶段之间箭头（前→后）：沿主轴线画短粗横箭头
        if (i + 1 < stageNodes.length) {
          const nx = stageNodes[i+1].x || 0
          out.push({ kind: 'stageArrow', rootId: root.id, x1: (sn.x || 0) + 36, y1: sn.y || 0, x2: nx - 36, y2: stageNodes[i+1].y || 0 })
        }
      })
      // 3) 终点旗帜节点右边的"箭头→旗帜"：flag 节点在最右，由 MindNode 样式处理，这里画阶段末到旗帜的箭头
      const flagNode = renderedNodes.find(n => n.parentId === root.id && n.isRouteFlagNode)
      if (flagNode && stageNodes.length) {
        const last = stageNodes[stageNodes.length - 1]
        out.push({ kind: 'stageArrow', rootId: root.id, x1: (last.x || 0) + 36, y1: last.y || 0, x2: (flagNode.x || 0) - 44, y2: flagNode.y || 0 })
      }
      // 4) 底部黑色圆角横条：6 步递进口诀（"学习逻辑：先XX → 再XX → ..."），放在阶段下方 110px，水平宽度 minX ~ maxX
      const mantra = Array.isArray(root.routeMantra) && root.routeMantra.length >= 1 ? root.routeMantra : null
      if (mantra) {
        let steps = mantra.slice(0, 6)
        while (steps.length < 6) steps.push('再打磨')
        out.push({
          kind: 'mantraBar', rootId: root.id,
          x: minX,
          y: midY + 230,
          w: Math.max(520, maxX - minX),
          steps,
        })
      }
    })
    return out
  }, [renderedNodes, rootsById, stageNodesByRoot])

  // ====== 顶部日期轴（W4：只渲染 bounds 内的日期，宽度跟随 zoomCtx.dayW） ======
    const axisTicks = useMemo(() => buildAxisTicks({ windowStart, pxPerDay, viewportW }), [windowStart, pxPerDay, viewportW])

  // ====== T4：3 阶段 bands（按 AI 生成阶段节点的真实 dayIdx 分界，而非等分 1/3·2/3）======
  // stageNodes = 所有带 early|middle|late stagePhase 的节点（每根根任务一般 3 个 direct 子节点）
    const stageBands = useMemo(() => null, [])
const centerMainPath = useMemo(() => {
    const list = renderedNodes
      .filter(n => (n.level || 0) <= 1)
      .map(n => ({ x: n.x || 0, y: n.y || 0, id: n.id }))
      .sort((a, b) => a.x - b.x)
    const pairs = []
    for (let i = 0; i + 1 < list.length; i++) pairs.push([list[i], list[i + 1]])
    return pairs
  }, [renderedNodes])

  // ====== 交互 handlers ======
  function getPointer(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    if (e.clientX !== undefined) return { x: e.clientX, y: e.clientY }
    return { x: e.pageX, y: e.pageY }
  }
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
const onNodeClick = (e, node) => {
    e.stopPropagation()
    // 编辑模式拖拽结束后的 click 不触发展开/弹窗
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
    dispatch({ type: 'SET_SELECTED_NODE', payload: node.id })
    const kids = childrenMap[node.id] || []
    if (kids.length === 0) {
      // 叶子节点：点击 → 打开查看/编辑弹窗（默认锁定模式下唯一动作）
      setPopupTarget(node.id)
      return
    }
    // 父节点：点击标题行 → 抽屉式展开/收起其所有直接子节点
    const willCollapse = expandedIds.has(node.id)
    setExpandedIds(prev => {
      const s = new Set(prev)
      if (s.has(node.id)) s.delete(node.id); else s.add(node.id)
      return s
    })
    // 若收起后导致弹窗目标节点被隐藏，则同步关闭弹窗
    if (willCollapse && popupTarget) {
      let cur = state.nodes.find(n => n.id === popupTarget)
      while (cur && cur.parentId) {
        const p = byId[cur.parentId]
        if (!p) break
        if (p.id === node.id) { setPopupTarget(null); break }
        cur = p
      }
    }
  }
  // 父节点卡片右上角「✎ 查看/编辑」按钮：直接打开查看/编辑弹窗
  const onNodePopupOpen = (e, node) => {
    e.stopPropagation()
    dispatch({ type: 'SET_SELECTED_NODE', payload: node.id })
    setPopupTarget(node.id)
  }
  const onNodeMouseDown = (e, node) => {
    e.stopPropagation()
    // 仅编辑模式允许拖动节点；锁定模式点击只展开/查看，不改变位置
    if (!editMode) return
    const p = getPointer(e)
    const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { left: 0, top: 0 }
    setDragState({
      nodeId: node.id,
      startPX: p.x - rect.left,
      startPY: p.y - rect.top,
      startY: node.y || 0,
      startDi: nodeDayIdx[node.id] ?? 0,
    })
  }

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

      {/* 顶部硬朗时间轴：起点=今天，单位随缩放切换（天/周/月），直线刻度、按单位降采样 */}
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
                  const pn = state.nodes.find(x => x.id === d.phaseId)
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

      <div className="absolute inset-0" style={{ transform: `translateY(${offsetY}px)`, transformOrigin: '0 0' }}>
        {/* 阶段节点不渲染成卡片（前/中/后期仅作为主轴线上的固定标注） */}
        {renderedNodes.filter(n => !n.isRouteStageNode).map(node => (
          <MindNode
            key={node.id}
            node={node}
            selected={state.ui.selectedNodeId === node.id}
            onClick={(e) => onNodeClick(e, node)}
            onPopupOpen={(e) => onNodePopupOpen(e, node)}
            onMouseDown={(e) => onNodeMouseDown(e, node)}
            progressMode={state.settings.progressMode}
            children={state.nodes.filter(n => n.parentId === node.id)}
            allNodes={state.nodes}
            siblingIndex={siblingIndexById[node.id] ?? 0}
            hasChildren={(childrenMap[node.id] || []).length > 0}
            expanded={expandedIds.has(node.id)}
            editMode={editMode}
          />
        ))}
      </div>

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
