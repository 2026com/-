import { useState, useRef } from 'react'

/**
 * 节点交互 Hook —— 自 MindMapCanvas.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：节点选中（SET_SELECTED_NODE）、节点拖拽状态记录、编辑弹窗触发
 *       （叶子点击弹窗 / 父节点点击展开收起 / 卡片 ✎ 按钮直接打开编辑）
 * 输入：dispatch、节点列表及派生结构（childrenMap/byId/nodeDayIdx）、展开集合及 setter、
 *       画布容器 ref、编辑模式开关
 * 输出：popupTarget/setPopupTarget、dragState/setDragState、suppressClickRef、
 *       onNodeClick/onNodePopupOpen/onNodeMouseDown
 */

/** 指针坐标归一化：兼容鼠标 / 触摸事件（供画布平移与节点拖拽共用） */
export function getPointer(e) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  if (e.clientX !== undefined) return { x: e.clientX, y: e.clientY }
  return { x: e.pageX, y: e.pageY }
}

export function useNodeInteraction({ dispatch, nodes, childrenMap, byId, nodeDayIdx, expandedIds, setExpandedIds, containerRef, editMode }) {
  const [popupTarget, setPopupTarget] = useState(null)
  const [dragState, setDragState] = useState(null)
  // W5：编辑模式下拖拽后抑制随后的 click（避免拖动结束误触发展开/弹窗）
  const suppressClickRef = useRef(false)

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
      let cur = nodes.find(n => n.id === popupTarget)
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

  return {
    popupTarget, setPopupTarget,
    dragState, setDragState,
    suppressClickRef,
    onNodeClick, onNodePopupOpen, onNodeMouseDown,
  }
}