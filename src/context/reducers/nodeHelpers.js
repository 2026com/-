import { calcProgress } from '../../utils/storage.js'

/**
 * 节点树共享工具 —— 自 AppContext.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 供 AppContext（节点 case）与 habitsReducer（打卡双向同步）共同使用
 */

// 收集某节点及其所有后代ID
export function collectAllDescendantIds(nodes, rootId) {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    nodes.forEach(n => {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id)
        changed = true
      }
    })
  }
  return ids
}

// 递归更新父级进度
// T1：先过滤 paused / aborted（同 calcProgress 一致，避免分子分母漂移）
const EXCLUDED_FOR_PARENT = new Set(['paused', 'aborted'])
export function recalcParentProgress(nodes, parentId, mode) {
  const parent = nodes.find(n => n.id === parentId)
  if (!parent) return
  const children = nodes.filter(n => n.parentId === parentId && !EXCLUDED_FOR_PARENT.has(n.status))
  parent.progress = calcProgress(children, mode)
  if (parent.parentId) recalcParentProgress(nodes, parent.parentId, mode)
}