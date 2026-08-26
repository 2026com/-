import React from 'react'
import MindNode from './MindNode.jsx'

/**
 * 节点渲染组件 —— 自 MindMapCanvas.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：单个节点的渲染（形状、文字、状态标识、进度均由既有 MindNode 承担，此处为其列表渲染层）
 * 只负责渲染，不包含交互逻辑（点击/弹窗/拖拽通过回调上抛给上层）
 */
export default function NodeRenderer({
  offsetY, renderedNodes,
  selectedNodeId, progressMode, allNodes,
  siblingIndexById, childrenMap, expandedIds, editMode,
  onNodeClick, onNodePopupOpen, onNodeMouseDown,
}) {
  return (
    <div className="absolute inset-0" style={{ transform: `translateY(${offsetY}px)`, transformOrigin: '0 0' }}>
      {/* 阶段节点不渲染成卡片（前/中/后期仅作为主轴线上的固定标注） */}
      {renderedNodes.filter(n => !n.isRouteStageNode).map(node => (
        <MindNode
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          onClick={(e) => onNodeClick(e, node)}
          onPopupOpen={(e) => onNodePopupOpen(e, node)}
          onMouseDown={(e) => onNodeMouseDown(e, node)}
          progressMode={progressMode}
          children={allNodes.filter(n => n.parentId === node.id)}
          allNodes={allNodes}
          siblingIndex={siblingIndexById[node.id] ?? 0}
          hasChildren={(childrenMap[node.id] || []).length > 0}
          expanded={expandedIds.has(node.id)}
          editMode={editMode}
        />
      ))}
    </div>
  )
}