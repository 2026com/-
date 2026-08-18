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

/** 计算三档时间缩放对应的「startIdx, endIdx」（都以今天=0 为基准） */
function calcZoomBounds(filter, allNodes, byIdMap) {
  const today = new Date(); today.setHours(0,0,0,0)
  const dow = (today.getDay() + 6) % 7  // 周一=0

  if (filter === 'week') {
    const startIdx = -dow
    const endIdx = startIdx + 6  // 周一 ~ 周日
    return { startIdx, endIdx, mode: 'week' }
  }

  if (filter === 'month') {
    const y = today.getFullYear(), m = today.getMonth()
    const first = new Date(y, m, 1); first.setHours(0,0,0,0)
    const last  = new Date(y, m + 1, 0); last.setHours(23,59,59,999)
    const startIdx = toDayIdx(first)
    const endIdx   = toDayIdx(last)
    return { startIdx, endIdx, mode: 'month' }
  }

  // all：从"所有节点最早的那天"到"所有节点最晚 dueDate 那天"，缺数据兜底 ±30 天
  let minIdx = 0, maxIdx = 0
  allNodes.forEach(n => {
    const i = computeNodeDayIdx(n, byIdMap, null)
    // 同时参考 due/start 避免中点计算导致范围未包含端点
    if (n.dueDate || n.deadline) maxIdx = Math.max(maxIdx, toDayIdx(n.dueDate || n.deadline))
    if (n.startDate)            minIdx = Math.min(minIdx, toDayIdx(n.startDate))
    minIdx = Math.min(minIdx, i)
    maxIdx = Math.max(maxIdx, i)
  })
  // 若范围完全不含今天，强制把今天纳入（避免"全部时间"看不到今天锚点）
  minIdx = Math.min(minIdx, -2)
  maxIdx = Math.max(maxIdx, 7)
  return { startIdx: minIdx, endIdx: maxIdx, mode: 'all' }
}

/** 生成「dateAxis 数组」匹配传入 bounds 的每一天（用于顶部日期刻度 + StageDividers） */
function buildDateAxisForBounds(bounds) {
  const arr = []
  for (let i = bounds.startIdx; i <= bounds.endIdx; i++) {
    const d = fromDayIdx(i)
    const today0 = new Date(); today0.setHours(0,0,0,0)
    const diffDays = Math.round((d.getTime() - today0.getTime()) / 86400000)
    const dow = d.getDay()
    const d0 = new Date(); d0.setHours(0,0,0,0)
    const mondayIdx = ((today0.getTime() - d0.getTime()) / 86400000) + dow
    // 周数：以今年 1 月 1 日周一为基准粗算（足够展示用）
    const jan1 = new Date(d.getFullYear(), 0, 1)
    const jan1Dow = (jan1.getDay() + 6) % 7
    const daysSinceJan1Monday = Math.round((d.getTime() - jan1.getTime()) / 86400000) + jan1Dow
    const weekNum = Math.floor(daysSinceJan1Monday / 7) + 1
    arr.push({
      date: d,
      dayOfWeek: dow,
      dayNum: d.getDate(),
      monthNum: d.getMonth() + 1,
      yearNum: d.getFullYear(),
      isToday: diffDays === 0,
      isSunday: dow === 0,
      weekNum,
    })
  }
  return arr
}

export default function MindMapCanvas({ zoom = 1, onCreateRootNode, timeFilter = 'all' }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const containerRef = useRef(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [popupTarget, setPopupTarget] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [viewportW, setViewportW] = useState(1200)
  const bgClickStartRef = useRef(null)
  const lastFilterRef = useRef({ filter: timeFilter, t: Date.now() })

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

  // ====== W4：三档时间缩放 → 范围 bounds + 动态 dayW / dayX0OnScreen ======
  const zoomCtx = useMemo(() => {
    const bounds = calcZoomBounds(timeFilter, state.nodes, byId)
    const days = Math.max(1, bounds.endIdx - bounds.startIdx + 1)
    const LEFT_PAD = 96, RIGHT_PAD = 120
    const usableW = Math.max(360, viewportW - LEFT_PAD - RIGHT_PAD)
    const dayW = usableW / days
    const dayX0OnScreen = LEFT_PAD
    return { bounds, days, dayW, dayX0OnScreen, LEFT_PAD, RIGHT_PAD }
  }, [timeFilter, state.nodes, viewportW, byId])

  /** 把虚拟 dayIdx → 当前 zoomCtx 下的屏幕 X（相对画布 0,0，后续再套 offset） */
  const dayToScreenX = useCallback((dayIdx) => {
    const { bounds, dayW, dayX0OnScreen } = zoomCtx
    return dayX0OnScreen + (dayIdx - bounds.startIdx) * dayW
  }, [zoomCtx])

  // ====== 切换 timeFilter 时：自动平移画布让时间范围左端对齐、Y 居中到第一条主线 ======
  useEffect(() => {
    const prev = lastFilterRef.current
    if (prev.filter !== timeFilter) {
      lastFilterRef.current = { filter: timeFilter, t: Date.now() }
      // 让时间范围起点在左边距 LEFT_PAD 位置（由于我们 dayX0OnScreen 已按左 96 起始，这里只要 offset.x≈0 即可）
      // Y：居中到"第 1 条主路径"位置
      setOffset(prev => ({
        x: 10,  // 微留 10px 呼吸
        y: Math.max(20, 120 - PIANO_ROOT_Y * 0.4),
      }))
    }
  }, [timeFilter])

  // ====== 节点垂直 Y（U3）+ 屏幕 X（W3 按天绑定）在 useMemo 内覆盖（不落盘，切换 zoomMode 立即生效） ======
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
      const inClone = nodeTempPos.find(n => n.id === r.id)
      if (!inClone) return
      const h = calcTreeHeight(inClone, nodeTempPos, cMapForH)
      const desired = yCursor
      yMap[r.id] = desired
      inClone.y = desired
      yCursor = Math.max(yCursor + TREE_GAP, desired + h + TREE_GAP * 0.7)
    })

    // 3) 屏幕 X：用 dayIdx → dayToScreenX 计算（按当前 zoomMode 动态）
    const withXY = state.nodes.map(n => {
      const di = nodeDayIdx[n.id] !== undefined ? nodeDayIdx[n.id] : 0
      const sx = dayToScreenX(di)
      const sy = yMap[n.id] !== undefined ? yMap[n.id] : (n.y || PIANO_ROOT_Y)
      return { ...n, x: sx, y: sy, _dayIdx: di }
    })

    return {
      renderedNodes: withXY,
      visibleNodeIds: new Set(state.nodes.map(n => n.id)),
      rootsById: rootsByIdInner,
      stageNodesByRoot: stageNodesByRootInner,
    }
  }, [state.nodes, rootsSorted, siblingsOf, byId, childrenMap, nodeDayIdx, dayToScreenX])

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
      // 2) 每个主线阶段节点正上方，绘制 phaseLabel（"前期｜建立基础 / 中期 / 后期｜达到目标水平"）
      stageNodes.forEach((sn, i) => {
        out.push({
          kind: 'phaseLabel', rootId: root.id,
          x: (sn.x || 0), y: (sn.y || 0) - 52,
          label: sn.phaseLabel || (['前期｜建立基础','中期','后期｜达到目标水平'][i] || ''),
          finalOnly: i === stageNodes.length - 1,
        })
        // 阶段节点之间箭头（前→后）：节点中心 Y 画一条短粗横箭头
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
  const zoomedDateAxis = useMemo(() => buildDateAxisForBounds(zoomCtx.bounds), [zoomCtx.bounds])

  // ====== T4：3 阶段 bands（按 AI 生成阶段节点的真实 dayIdx 分界，而非等分 1/3·2/3）======
  // stageNodes = 所有带 early|middle|late stagePhase 的节点（每根根任务一般 3 个 direct 子节点）
  const stageBands = useMemo(() => {
    const { bounds } = zoomCtx
    const phaseNodes = { early: [], middle: [], late: [] }
    state.nodes.forEach(n => {
      if (n && (n.stagePhase === 'early' || n.stagePhase === 'middle' || n.stagePhase === 'late')) {
        phaseNodes[n.stagePhase].push(n)
      }
    })
    // 必须至少有 1 个阶段节点（否则 fallback 到 1/3 等分）
    const totalStage = phaseNodes.early.length + phaseNodes.middle.length + phaseNodes.late.length
    if (totalStage === 0) return null
    const nodeIdx = (n) => {
      if (nodeDayIdx && nodeDayIdx[n.id] !== undefined) return nodeDayIdx[n.id]
      return computeNodeDayIdx(n, {}, null)
    }
    // 每个阶段取：该阶段下所有节点中"最小 dayIdx（阶段起点）" 与 "最大 dayIdx（阶段终点，建议取最大 dueDate 含当天）"
    function phaseRange(list) {
      let s = Infinity, e = -Infinity
      list.forEach(n => {
        const i = nodeIdx(n)
        const sd = n.startDate ? toDayIdx(n.startDate) : i
        const ed = (n.dueDate || n.deadline) ? toDayIdx(n.dueDate || n.deadline) : i
        s = Math.min(s, sd, i)
        e = Math.max(e, ed, i)
      })
      if (!isFinite(s) || !isFinite(e)) return null
      return { s, e }
    }
    const earlyR = phaseRange(phaseNodes.early)
    const midR = phaseRange(phaseNodes.middle)
    const lateR = phaseRange(phaseNodes.late)
    // 全局最小 / 最大
    let globalStart = bounds.startIdx
    let globalEnd = bounds.endIdx
    const allR = [earlyR, midR, lateR].filter(Boolean)
    if (allR.length) {
      globalStart = Math.min(globalStart, ...allR.map(r => r.s))
      globalEnd = Math.max(globalEnd, ...allR.map(r => r.e))
    }
    // 分界点：中期起点 = 中期第 1 个节点的 startIdx（若中期为空则用 fallback）；后期起点同理
    const midStartGuess = midR ? midR.s : (lateR ? Math.round((globalStart + lateR.s) / 2) : Math.round((globalStart + globalEnd) / 3))
    const lateStartGuess = lateR ? lateR.s : (midR ? Math.round((midR.e + globalEnd) / 2) : Math.round(2 * (globalStart + globalEnd) / 3))
    function snapSort3(s1, s2) {
      // 保证：globalStart ≤ midStart ≤ lateStart ≤ globalEnd+1，且严格递增（相等会压缩掉前一段）
      const a = Math.max(globalStart, Math.min(s1, s2))
      const b = Math.max(a + 1, Math.max(s1, s2))
      return [a, Math.min(b, globalEnd + 1)]
    }
    const [midStart, lateStart] = snapSort3(midStartGuess, lateStartGuess)
    return [
      { phaseKey: 'early',  startDayIdx: globalStart, endDayIdx: midStart },
      { phaseKey: 'middle', startDayIdx: midStart,    endDayIdx: lateStart },
      { phaseKey: 'late',   startDayIdx: lateStart,   endDayIdx: Math.max(lateStart + 1, globalEnd + 1) },
    ]
  }, [state.nodes, nodeDayIdx, zoomCtx])

  // T4：向父级广播当前布局（zoomCtx + stageBands + viewport）——保留对外接口位，未来供其它面板复用
  // const lastLayoutRef = useRef(null)
  // useEffect(() => {
  //   const payload = { zoomCtx, stageBands, viewportW }
  //   // 深对比：字符串化判断差异避免无效触发
  //   const s = JSON.stringify(payload)
  //   if (lastLayoutRef.current !== s) {
  //     lastLayoutRef.current = s
  //     // if (onLayoutChange) onLayoutChange(JSON.parse(s))
  //   }
  // }, [zoomCtx, stageBands, viewportW])

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
    if (e.target !== e.currentTarget && !e.currentTarget.isSameNode(e.target)) {
      if (e.target.closest('.mind-node') || e.target.closest('.node-link-wrap')) return
    }
    // B2 防冒泡修复：若弹窗（NodePopup 层）当前存在，忽略画布背景的 mousedown/mouseup 判定。
    //    由于 MindMapCanvas 外部和 NodePopup 同级挂载，ModalRoot 也独立在 App 根，因此通过 document 查询最近的节点弹窗 DOM。
    if (document.querySelector('.mind-node-popup-root, [data-mind-popup="1"]')) return
    const p = getPointer(e)
    bgClickStartRef.current = { x: p.x, y: p.y, t: Date.now() }
    setIsPanning(true)
    setPanStart({ x: p.x - offset.x, y: p.y - offset.y })
  }
  const onCanvasMouseMove = (e) => {
    if (isPanning) {
      const p = getPointer(e)
      setOffset({ x: p.x - panStart.x, y: p.y - panStart.y })
    } else if (dragState && dragState.nodeId) {
      const p = getPointer(e)
      // 拖拽后把屏幕像素 → 映射回「相对父节点/原 dayIdx」，这里只持久化 Y 位置（避免 X 像素因 zoom 变化漂移）
      const ny = (p.y - offset.y) / zoom - dragState.dy
      // 对 X：转换成相对 bounds 的 dayIdx 落盘成 dueDate
      const sx = (p.x - offset.x) / zoom - dragState.dx
      const { bounds, dayW, dayX0OnScreen } = zoomCtx
      const di = Math.round(bounds.startIdx + (sx - dayX0OnScreen) / Math.max(0.1, dayW))
      const newDue = fromDayIdx(di).toISOString().slice(0, 10)
      dispatch({ type: 'UPDATE_NODE', id: dragState.nodeId, payload: { y: ny, dueDate: newDue, deadline: newDue } })
    }
  }
  const onCanvasMouseUp = (e) => {
    // B2: 若已在 mousedown 阶段取消过 canvas 处理，也同步取消 mouseup 的空白点击。
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
  }
  // P4：双击画布空白处 → 新增独立根节点（屏幕像素 → 虚拟画布坐标，便于把节点放到双击位置）
  const onCanvasDblClick = (e) => {
    // 避免双击到节点或按钮时误触
    if (e.target !== e.currentTarget && !e.currentTarget.isSameNode(e.target)) {
      if (e.target.closest('.mind-node') || e.target.closest('.node-link-wrap') || e.target.closest('button')) return
    }
    const p = getPointer(e)
    const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { left: 0, top: 0 }
    const cx = (p.x - rect.left - offset.x) / zoom
    const cy = (p.y - rect.top  - offset.y) / zoom
    createRoot({ x: cx, y: cy })
  }
  const onWheel = (e) => { e.preventDefault(); setOffset(o => ({ x: o.x - e.deltaX, y: o.y - e.deltaY })) }
  const onNodeClick = (e, node) => { e.stopPropagation(); dispatch({ type: 'SET_SELECTED_NODE', payload: node.id }); setPopupTarget(node.id) }
  const onNodeMouseDown = (e, node) => {
    e.stopPropagation()
    const p = getPointer(e)
    const nx = (p.x - offset.x) / zoom
    const ny = (p.y - offset.y) / zoom
    setDragState({ nodeId: node.id, dx: nx - (node.x || 0), dy: ny - (node.y || 0) })
  }

  // ====== 新建根节点按钮默认实现 ======
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
  }, [dispatch, zoomCtx])
  const createRoot = onCreateRootNode || defaultCreateRoot

  // ====== 主渲染 ======
  return (
    <div
      ref={containerRef}
      className="w-full h-full relative select-none touch-manipulation overflow-hidden bg-white"
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onCanvasMouseMove}
      onMouseUp={onCanvasMouseUp}
      onMouseLeave={onCanvasMouseUp}
      onWheel={onWheel}
      onDoubleClick={onCanvasDblClick}
      onTouchStart={(e) => e.touches.length === 1 && onCanvasMouseDown(e.touches[0])}
      onTouchMove={(e) => e.touches.length === 1 && onCanvasMouseMove(e.touches[0])}
      onTouchEnd={onCanvasMouseUp}
    >
      {/* P2：已移除固定三期垂直分隔带（StageDividers），三期划分仅在「AI 生成的完整学习路线」节点 phaseLabel 上体现（阶段节点正上方显示） */}
      {/* W4/T4 旧 StageDividers 调用已删除 —— 用户明确要求「悬挂在幕布的前中后期暂时取消」 */}

      {/* 顶部日度时间轴（和平移 offset.x 绑定一起平移，缩放 zoom 不作用在轴以保证日期字可读） */}
      <div className="absolute top-4 left-0 w-full h-20 flex items-start pointer-events-none z-1" style={{ transform: `translate(${offset.x}px, 0)` }}>
        <div className="relative w-full h-full px-6">
          <div className="absolute left-0 right-0 top-[28px] h-[2px] bg-slate-300" />
          {zoomedDateAxis.map((d, i) => {
            const x = zoomCtx.dayX0OnScreen + i * zoomCtx.dayW
            const isSunday = d.isSunday
            const height = isSunday ? 30 : 12
            // 标签策略：范围越宽 → 越稀疏地显示日期；all 模式按"每周/每月"节奏打标签
            const days = zoomCtx.days
            let showDate = false
            if (days <= 8) showDate = true  // 本周：每天标
            else if (days <= 32) showDate = (i % 2 === 0) || isSunday  // 本月：隔天+周日
            else showDate = isSunday || (i % 14 === 0)  // 全部：周日或每两周
            const isMonthStart = d.dayNum === 1
            return (
              <div key={i} className="absolute" style={{ left: x, top: '28px' }}>
                <div className={`absolute left-0 top-0 w-px ${isSunday ? 'bg-slate-500' : 'bg-slate-300'}`} style={{ height }} />
                {showDate && <div className="absolute -left-3 whitespace-nowrap" style={{ top: height + 1, fontSize: 9.5, color: '#64748b' }}>{d.monthNum}/{d.dayNum}</div>}
                {isMonthStart && <div className="absolute -left-4 whitespace-nowrap font-semibold" style={{ top: -16, fontSize: 10.5, color: '#334155' }}>{d.monthNum}月</div>}
                {isSunday && <div className="absolute -left-4 whitespace-nowrap font-semibold" style={{ top: -28, fontSize: 10.5, color: '#475569' }}>第{d.weekNum}周</div>}
                {d.isToday && <div className="absolute -left-2" style={{ top: -14, fontSize: 11 }}>🔺</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* 节点/连线的 transform 层（统一平移缩放） */}
      <div className="absolute inset-0 node-link-wrap" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        {/* 中心主路径线 */}
        <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, width: 10000, height: 8000, overflow: 'visible' }} viewBox="0 0 10000 8000">
          {centerMainPath.map(([a, b], i) => {
            const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
            const cx1 = a.x + dx, cy1 = a.y
            const cx2 = b.x - dx, cy2 = b.y
            return (
              <path
                key={'c' + i}
                d={`M ${a.x} ${a.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${b.x} ${b.y}`}
                stroke="#0f172a" strokeWidth={4} strokeLinecap="round"
                fill="none" opacity={0.86}
                style={{ filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.85))' }}
              />
            )
          })}
          {/* P1X：主线阶段节点之间 & 末段→终点旗帜 的黑色实箭头（用户要求"箭头指向代表学习推进顺序，前→后"） */}
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
              <div key={'rdp'+i} className="absolute pointer-events-none" style={{ left: (d.x - w/2), top: d.y }}>
                <div
                  className="text-[12px] font-semibold text-black whitespace-nowrap"
                  style={{
                    width: w, height: 26, borderRadius: 999,
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
                  className="rounded-2xl text-white text-[14px] font-semibold leading-6"
                  style={{ background: '#0a0a0a', padding: '14px 22px', border: '1.5px solid #000', boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset' }}
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

      <div className="absolute inset-0" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        {renderedNodes.map(node => (
          <MindNode
            key={node.id}
            node={node}
            selected={state.ui.selectedNodeId === node.id}
            onClick={(e) => onNodeClick(e, node)}
            onMouseDown={(e) => onNodeMouseDown(e, node)}
            progressMode={state.settings.progressMode}
            children={state.nodes.filter(n => n.parentId === node.id)}
            allNodes={state.nodes}
            siblingIndex={siblingIndexById[node.id] ?? 0}
          />
        ))}
      </div>

      {/* 空画布提示 */}
      {state.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-slate-400">
            <div className="text-5xl mb-3">🎯</div>
            <div className="text-sm font-medium">点击右下角 ➕ 新建 按钮，开启第一个长期目标</div>
            <div className="text-xs mt-2 opacity-70">· 拖拽移动节点 · 滚轮平移画布 · 右下角缩放</div>
          </div>
        </div>
      )}

      {/* 节点弹窗：getPosition 基于当前屏幕 x/y 定位（renderedNodes 的覆盖值） */}
      {popupTarget && (() => {
        const n = renderedNodes.find(x => x.id === popupTarget) || state.nodes.find(n => n.id === popupTarget)
        if (!n) return null
        return (
          <NodePopup
            nodeId={popupTarget}
            onClose={() => setPopupTarget(null)}
            getPosition={() => ({ x: (n.x || 0) * zoom + offset.x + 42, y: (n.y || 0) * zoom + offset.y - 20 })}
          />
        )
      })()}
    </div>
  )
}
