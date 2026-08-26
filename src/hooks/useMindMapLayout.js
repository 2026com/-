import { useMemo, useCallback } from 'react'
import { getNodeRect } from '../utils/constants.js'

/**
 * 思维导图布局计算 Hook —— 自 MindMapCanvas.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：节点坐标计算（X=dayIdx 时间轴像素 / Y=层级上下对称分布）、连线路径数据、画布缩放/平移换算
 * 输入：节点列表 nodes、画布宽度 viewportW、缩放比例 zoom、时间窗起点 windowStart、激活根节点 activeRootId、展开集合 expandedIds
 * 输出：childrenMap/siblingsOf 等派生结构、byId/nodeDayIdx、renderedNodes（含显示位置覆盖，不落盘）、
 *       连线路径（centerMainPath）与路线装饰层（routeDecorations）、顶部刻度（axisTicks）等
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
export function fromDayIdx(i) {
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

// ====== 硬朗时间轴：像素密度驱动的缩放模型 ======
export const X_MARGIN = 48                       // 画布左侧留白（今天 = 时间轴起点，落在左缘内侧）
export const BASE_PX_PER_DAY = 150               // zoom=1 时每「天」像素（约一周铺满视口）
export const ZOOM_MIN = 0.03, ZOOM_MAX = 3        // 缩放范围（对应 月/周/天 三档刻度单位）

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

/**
 * 布局计算主 Hook：入参为节点列表与画布状态，出参为全部派生布局数据
 */
export function useMindMapLayout({ nodes, zoom = 1, viewportW, windowStart, activeRootId, expandedIds }) {
  // ====== childrenMap + 根排序（只算一次缓存） ======
  const { childrenMap, rootsSorted, siblingIndexById, siblingsOf } = useMemo(() => {
    const cMap = {}
    nodes.forEach(n => { if (n.parentId) (cMap[n.parentId] = cMap[n.parentId] || []).push(n) })
    Object.values(cMap).forEach(list => {
      list.sort((a, b) => (a.childIndex || 0) - (b.childIndex || 0) || (a.createdAt || 0) - (b.createdAt || 0))
      list.forEach((n, i) => { if (n.childIndex === undefined) n.childIndex = i })
    })
    const roots = nodes.filter(n => !n.parentId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    const idxMap = {}, sMap = {}
    roots.forEach((r, i) => { idxMap[r.id] = i })
    Object.entries(cMap).forEach(([pid, kids]) => {
      sMap[pid] = kids.map(k => k.id)
      kids.forEach((k, i) => { if ((k.level || 0) <= 1) idxMap[k.id] = i })
    })
    return { childrenMap: cMap, rootsSorted: roots, siblingIndexById: idxMap, siblingsOf: sMap }
  }, [nodes])

  // ====== 预计算：byId + 每个节点的锚点 dayIdx（随 state.nodes 变化重算） ======
  const { byId, nodeDayIdx } = useMemo(() => {
    const map = {}
    nodes.forEach(n => map[n.id] = n)
    const cache = { siblingsOf }
    const idxMap = {}
    nodes.forEach(n => { idxMap[n.id] = computeNodeDayIdx(n, map, cache) })
    return { byId: map, nodeDayIdx: idxMap }
  }, [nodes, siblingsOf])

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
    nodes.forEach(n => {
      let cur = n
      while (cur.parentId) { const p = byId[cur.parentId]; if (!p) break; cur = p }
      rootOf[n.id] = cur ? cur.id : n.id
    })
    // 幕布独立不干扰：激活某幕布时只显示该幕布（根）下的节点
    const activeRoot = (activeRootId && byId[activeRootId]) ? activeRootId : null
    nodes.forEach(n => {
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
  }, [nodes, byId, isCollapsed, activeRootId])

  // ====== 硬朗时间轴模型：像素/天 缩放 + 视口窗口 ======
  const pxPerDay = BASE_PX_PER_DAY * Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(zoom) || 1))
  const visibleDays = Math.max(1, (viewportW - X_MARGIN) / pxPerDay)

  // 最早任务节点日（含今天兜底 0）→ 决定左滑边界：以「第一个节点为开头」，还可再往前移动一个月（30 天）
  const earliestNodeDay = useMemo(() => {
    let mn = 0
    nodes.forEach(n => { const i = nodeDayIdx[n.id]; if (typeof i === 'number' && i < mn) mn = i })
    return mn
  }, [nodes, nodeDayIdx])

  const dayToScreenX = useCallback((dayIdx) => X_MARGIN + (dayIdx - windowStart) * pxPerDay, [windowStart, pxPerDay])
  const screenToDayIdx = useCallback((x) => windowStart + (x - X_MARGIN) / pxPerDay, [windowStart, pxPerDay])

  const { renderedNodes, visibleNodeIds, rootsById, stageNodesByRoot } = useMemo(() => {
    // P1X：预计算"每条路线根节点 → 3 个阶段节点"的映射，供上下 4+4 白框分类分布 & 路线装饰层绘制
    const stageNodesByRootInner = {}
    nodes.forEach(n => {
      if (!n.isRouteStageNode) return
      const rid = n.parentId
      if (!rid) return
      if (!stageNodesByRootInner[rid]) stageNodesByRootInner[rid] = []
      stageNodesByRootInner[rid].push(n.id)
    })
    // 根元信息（标题/副标题/口诀）缓存
    const rootsByIdInner = {}
    nodes.forEach(n => {
      if (n.parentId != null && (n.level || 0) !== 0) return
      rootsByIdInner[n.id] = n
    })

    // 1) 先跑垂直布局：继承 U3「主轴上下两侧对称分布」（只处理 Y，不落盘）
    //    增强：对 level=2 且有 routeGroup=above/below 的分类节点——强制把 above 聚在父（阶段节点）上方、below 下方，每侧 4 个等间距
    const sortedForY = [...nodes].sort((a, b) => (a.level || 0) - (b.level || 0) || ((a.createdAt || 0) - (b.createdAt || 0)))
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
        const allSibs = siblingsOf[parent.id] ? siblingsOf[parent.id].map(id => nodes.find(x => x.id === id)).filter(Boolean) : [n]
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
      const siblings = siblingsOf[parent.id] ? siblingsOf[parent.id].map(id => nodes.find(x => x.id === id)).filter(Boolean) : [n]
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
        const offsetYStep = (idxInSiblings - mid) * SIBLING_Y_STEP
        yMap[n.id] = parentY + LEVEL_Y_STEP * 0.95 + offsetYStep
      }
    })

    // 2) 根 Y 分配：从前往后 Σ 子树高度
    const rootsWithY = [...rootsSorted]
    let yCursor = PIANO_ROOT_Y
    // 先给每个根分配"暂定值"以便 calcTreeHeight 能递归测量
    rootsWithY.forEach(r => { yMap[r.id] = r.y || yCursor })
    const cMapForH = childrenMap
    const nodeTempPos = nodes.map(n => {
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
    nodes.forEach(n => collectMin(n.id))
    const withXY = nodes.map(n => {
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
  }, [nodes, rootsSorted, siblingsOf, byId, childrenMap, nodeDayIdx, dayToScreenX, visibleIds])

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

  return {
    childrenMap, rootsSorted, siblingIndexById, siblingsOf,
    byId, nodeDayIdx, isCollapsed, visibleIds,
    pxPerDay, visibleDays, earliestNodeDay, dayToScreenX, screenToDayIdx,
    renderedNodes, visibleNodeIds, rootsById, stageNodesByRoot,
    routeDecorations, axisTicks, stageBands, centerMainPath,
  }
}