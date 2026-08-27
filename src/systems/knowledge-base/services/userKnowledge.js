/**
 * 知识库真实数据层（用户图谱 vs 演示图谱 双轨数据源）
 * ============================================================
 *
 *  - 用户图谱（成品形态）：知识点由使用者逐个添加，首次进入时为
 *    「零渲染空状态」；每个新知识点经 graphGrowth 生长服务判定落位
 *    （首个置于宇宙原点，后续围绕相关知识点生长），逐渐织成星云。
 *    元数据持久化到 STORAGE_KEYS.KNOWLEDGE_BASE（自动纳入全局备份/恢复），
 *    生长结果按数据指纹缓存到独立键，增删节点后自动重新生长。
 *  - 演示图谱（示范效果）：600 点 mock 团簇星云，只读展示成品形态，
 *    生长缓存写独立演示键 —— 与用户数据完全隔离，互不污染。
 *
 * 生长算法是确定性的（固定种子）：同 nodes 数组（同顺序）永远得到
 * 同一布局，因此「全量重生长」与「逐个增量落位」结果一致，本层直接
 * 采用全量重生长 + 指纹缓存，逻辑最简。
 */

import { STORAGE_KEYS } from '../../../shared/constants/index.js'
import { growKnowledgeGraph, loadSavedGrowth, saveGrowth } from './graphGrowth.js'
import { buildMockGraph } from './mockKnowledgeGraph.js'

/** 用户图谱生长结果缓存键（与演示图谱隔离） */
const GROWTH_KEY_USER = 'knowledgeGraph.growth.user.v3'
/** 演示图谱生长结果缓存键 */
const GROWTH_KEY_DEMO = 'knowledgeGraph.growth.demo.v3'

/** 演示图谱规模：mock 骨架 + 合成叶子补到 600 点（示范「成品形态」） */
const DEMO_TARGET_N = 600

// ================= 用户知识点元数据 =================

/**
 * 读取用户知识点列表（未初始化/损坏时返回空数组 = 零渲染状态）
 * @returns {Array<{id,name,category,createdAt}>}
 */
export function loadUserNodes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.KNOWLEDGE_BASE)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 持久化用户知识点列表 */
export function saveUserNodes(userNodes) {
  try {
    localStorage.setItem(STORAGE_KEYS.KNOWLEDGE_BASE, JSON.stringify(userNodes))
  } catch { /* 写入失败不阻塞（隐私模式等），下次保存会重试 */ }
}

/** 生成新知识点 id（时间戳 + 随机尾巴，同毫秒多次添加也不冲突） */
export function makeKnowledgeId(name = '') {
  return `kb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}${name ? '' : '-x'}`
}

// ================= 图谱构建 =================

/**
 * 构建用户图谱；没有任何知识点时返回 null（调用方据此渲染空状态页）。
 * @param {Array} userNodes loadUserNodes() 的结果
 * @returns {{ nodes, links, positions } | null}
 */
export function buildUserGraph(userNodes) {
  if (!userNodes || !userNodes.length) return null
  const saved = loadSavedGrowth(userNodes, GROWTH_KEY_USER)
  const grown = saved || growKnowledgeGraph(userNodes)
  if (!saved) saveGrowth(userNodes, grown, GROWTH_KEY_USER)
  return { nodes: userNodes, links: grown.links, positions: grown.positions }
}

let demoGraphCache = null // 演示图整个会话只生长一次（切回演示秒开）

/**
 * 构建 600 点演示图谱（mock 六团簇骨架 + 合成叶子补到目标规模），
 * 生长缓存写独立演示键 —— 示范数据绝不写进用户存储。
 * @returns {{ nodes, links, positions }}
 */
export function buildDemoGraph() {
  if (demoGraphCache) return demoGraphCache
  const base = buildMockGraph()
  const demoNodes = [...base.nodes]
  const CATS = ['cs', 'math', 'cog', 'lang', 'art', 'biz']
  let di = 0
  while (demoNodes.length < DEMO_TARGET_N) {
    const cat = CATS[di % CATS.length]
    demoNodes.push({ id: `demo-${cat}-${di}`, name: `演示知识点 ${di + 1}`, category: cat })
    di++
  }
  const saved = loadSavedGrowth(demoNodes, GROWTH_KEY_DEMO)
  const grown = saved || growKnowledgeGraph(demoNodes)
  if (!saved) saveGrowth(demoNodes, grown, GROWTH_KEY_DEMO)
  demoGraphCache = { nodes: demoNodes, links: grown.links, positions: grown.positions }
  return demoGraphCache
}
