/**
 * 3D 知识图谱「冷启动 + 渐进式生长」布局服务
 * ============================================================
 *
 * 职责（渲染层零依赖，本模块只负责「新知识点该放在哪、和谁连线」）：
 *  1. 冷启动 —— 知识库为空时，第一个知识点放在坐标原点 (0,0,0)；
 *  2. 渐进生长 —— 每个新知识点先经「关系判定器」输出结构化 JSON：
 *       { targetNodeId, relationship: 因果/衍生/对比/延伸/无关, confidence: 0~1, reason }
 *     再按关系类型落位：
 *       - 强关系（因果/衍生/延伸）→ 放在目标节点周围 1.5~4.0 单位，
 *         置信度越高距离越近，且 confidence ≥ 0.6 时建立连线；
 *       - 对比 → 中等距离 5~8 单位，不连线；
 *       - 无关（或与谁都没有强关系）→ 「随机但受限」的独立位置，
 *         距原点 8~15 单位，并与现有节点做重叠避让。
 *  3. 风险应对：
 *       - 风险1（独立点散乱）：独立节点超过 INDEPENDENT_MAX 后，新独立点
 *         优先与最近的独立节点建立「延伸」关联，避免无限散落；
 *       - 风险2（AI 判定不稳定）：confidence < CONFIDENCE_MIN 的关系不建线，
 *         节点仅放置在目标附近；判定器必须返回结构化 JSON；
 *       - 风险3（位置冲突）：与现有节点距离 < MIN_SEPARATION 时随机微调，
 *         最多尝试 CONFLICT_RETRIES 次。
 *  4. 持久化 —— 每个节点的位置决策结果（连同连线）写入 localStorage，
 *     下次启动直接读取；数据指纹变化（增删节点）后自动重新生长。
 *
 * 单位说明：规格中的 1.5~4.0 / 5~8 / 8~15 均为「布局单位」，
 * 乘以 UNIT_SCALE 映射到 three.js 场景坐标（对外接口一律使用场景单位）。
 *
 * AI 接入：judgeRelationMock 是当前占位判定器（确定性启发式）。
 * 接入真实 AI 时，实现同签名 async (node, placedNodes) => judgmentJSON，
 * 通过 growKnowledgeGraph(nodes, myJudge) / attachKnowledgePoint({..., judgment})
 * 注入即可，其余逻辑无需改动。
 */

// ===== 关系类型常量 =====
export const RELATION_STRONG = ['因果', '衍生', '延伸']
export const RELATION_CONTRAST = '对比'
export const RELATION_NONE = '无关'

// ===== 布局旋钮（布局单位） =====
export const UNIT_SCALE = 7        // 布局单位 → 场景单位换算系数
export const NEAR_MIN = 1.5        // 强关系环绕半径下限
export const NEAR_MAX = 4.0        // 强关系环绕半径上限
export const CONTRAST_MIN = 5      // 「对比」关系的中等距离下限
export const CONTRAST_MAX = 8      // 「对比」关系的中等距离上限
export const FREE_MIN = 8          // 独立位置距原点下限
export const FREE_MAX = 15         // 独立位置距原点上限
export const ORIGIN = [0, 0, 0]    // 冷启动原点

// ===== 风险应对旋钮 =====
export const MIN_SEPARATION = 0.6    // 风险3：节点最小间隔（布局单位）。团簇致密核心允许更近，
                                     // 0.6×UNIT_SCALE≈4.2 场景单位在视觉上依然清晰分离
export const CONFLICT_RETRIES = 3    // 风险3：冲突微调最大尝试次数
export const INDEPENDENT_MAX = 5     // 风险1：独立节点阈值
export const CONFIDENCE_MIN = 0.6    // 风险2：可建立连线的最低置信度
export const CLUSTER_TIGHTNESS = 0.6 // 团簇紧致度：0 = 按规格原始距离散布，1 = 全部压贴 NEAR_MIN（极度抱团）
export const CLUSTER_RADIUS = 7.2    // 团域半径（布局单位，×7≈50 场景）：同类衍生点始终约束在
                                     // 本团球体内 —— 长在关系点附近，但团不会无限向外摊大饼

// ===== 持久化键（v3：团簇化布局算法变更，旧缓存整体作废重新生长） =====
const GROWTH_KEY = 'knowledgeGraph.growth.v3'

// ================= 工具：确定性随机 =================

/** FNV-1a 字符串哈希（同 id 永远同种子 → 判定可复现） */
function hashId(str) {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 伪随机数生成器（确定性，种子固定则序列固定） */
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dist3(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function randomDir(rng) {
  const th = rng() * Math.PI * 2
  const ph = Math.acos(2 * rng() - 1)
  return [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)]
}

// ================= 判定器（可插拔） =================

/**
 * Mock 关系判定器（确定性启发式，演示用占位）。
 * 签名与真实 AI 判定器一致：node 为新节点元数据，placed 为已放置节点元数据数组。
 * 返回结构化 JSON：{ targetNodeId, relationship, confidence, reason }
 *
 * 替换为真实 AI 时保持同签名即可；growKnowledgeGraph 支持 async 判定器
 * （内部 for await），其余逻辑无需改动。
 */
export function judgeRelationMock(node, placed) {
  if (!placed.length) {
    return {
      targetNodeId: null,
      relationship: RELATION_NONE,
      confidence: 0,
      reason: '冷启动：知识库为空，首个知识点置于原点',
    }
  }
  const rng = makeRng(hashId(node.id) ^ 0x9e3779b9)
  const sameCat = placed.filter((p) => p.category === node.category)
  const otherCat = placed.filter((p) => p.category !== node.category)
  const roll = rng()

  // ~86%：同类强关系（衍生/延伸）—— 团簇的主体生长。
  // 挑父策略（枢纽吸聚，塑造「团心致密、边缘渐稀」的团簇轮廓）：
  //   60% 挂到同类度数最高的节点（通常是团心枢纽）；
  //   25% 挂到度数前 3 的次级中心；15% 均匀随机铺开
  if (sameCat.length && roll < 0.86) {
    let target
    const pick = rng()
    if (pick < 0.6) {
      const ranked = [...sameCat].sort((a, b) => (b.degree || 0) - (a.degree || 0))
      target = ranked[0]
    } else if (pick < 0.85) {
      const ranked = [...sameCat].sort((a, b) => (b.degree || 0) - (a.degree || 0))
      target = ranked[1 + Math.floor(rng() * Math.min(2, ranked.length - 1))] || ranked[0]
    } else {
      target = sameCat[Math.floor(rng() * sameCat.length)]
    }
    const confidence = 0.62 + rng() * 0.33
    const relationship = confidence > 0.78 ? '衍生' : '延伸'
    return {
      targetNodeId: target.id,
      relationship,
      confidence: +confidence.toFixed(2),
      reason: `与「${target.id}」同领域且语义紧密相关（mock 判定）`,
    }
  }
  // ~9%：跨类弱延伸 —— 团与团之间的细桥
  if (otherCat.length && roll < 0.95) {
    const target = otherCat[Math.floor(rng() * otherCat.length)]
    return {
      targetNodeId: target.id,
      relationship: '延伸',
      confidence: +(0.6 + rng() * 0.12).toFixed(2),
      reason: `与「${target.id}」跨域弱关联（mock 判定）`,
    }
  }
  // ~4%：同类对比概念 —— 中等距离、不连线
  if (sameCat.length) {
    const target = sameCat[Math.floor(rng() * sameCat.length)]
    return {
      targetNodeId: target.id,
      relationship: RELATION_CONTRAST,
      confidence: +(0.55 + rng() * 0.2).toFixed(2),
      reason: `与「${target.id}」构成对照概念，并列呈现（mock 判定）`,
    }
  }
  // 其余：无关 —— 独立位置
  return {
    targetNodeId: null,
    relationship: RELATION_NONE,
    confidence: +(0.1 + rng() * 0.2).toFixed(2),
    reason: '与现有知识均无强关联，作为独立知识点（mock 判定）',
  }
}

// ================= 位置计算（全部内存中完成） =================

/**
 * 环绕落位：在 center 周围采样候选、取「离现有节点最近距离」最大者。
 * 候选半径分 4 层逐轮外扩（rMin~rMax → 1.7× → 2.8× → 4.5×）：
 * 核心被挤满时新点自动长到团表面空隙处（真实团簇的生长方式），
 * 而不是被事后推离弹射到不可控的远处。满足硬约束即提前收工。
 */
function ringPosition(center, rMin, rMax, rng, placedPositions, candidateN = 6) {
  let best = null
  let bestClear = -1
  const bands = [
    [rMin, rMax],
    [rMax, rMax * 1.7],
    [rMax * 1.7, rMax * 2.8],
    [rMax * 2.8, rMax * 4.5],
  ]
  for (const [lo, hi] of bands) {
    for (let c = 0; c < candidateN; c++) {
      const dir = randomDir(rng)
      const r = lo + rng() * (hi - lo)
      const cand = [center[0] + dir[0] * r, center[1] + dir[1] * r, center[2] + dir[2] * r]
      let minD = Infinity
      for (const p of placedPositions) minD = Math.min(minD, dist3(cand, p))
      if (minD > bestClear) { bestClear = minD; best = cand }
      if (bestClear >= MIN_SEPARATION) return best // 已满足硬约束，提前收工
    }
  }
  return best
}

/** 风险3：位置冲突检查 —— 距任一已放置点 < MIN_SEPARATION 则随机微调，最多 3 次 */
function resolveConflict(candidate, placedPositions, rng) {
  let pos = candidate
  for (let t = 0; t < CONFLICT_RETRIES; t++) {
    let conflict = false
    for (const p of placedPositions) {
      if (dist3(pos, p) < MIN_SEPARATION) { conflict = true; break }
    }
    if (!conflict) return pos
    pos = [pos[0] + (rng() - 0.5) * 2, pos[1] + (rng() - 0.5) * 2, pos[2] + (rng() - 0.5) * 2]
  }
  // 兜底阶段一：合力快排 —— 对所有违规点求反向加权合力，带阻尼迭代，
  // 快速脱离密集冲突区（逐点推离在密集区会 A/B 来回震荡）
  for (let pass = 0; pass < 40; pass++) {
    let fx = 0
    let fy = 0
    let fz = 0
    let violated = false
    for (const p of placedPositions) {
      const d = dist3(pos, p)
      if (d >= MIN_SEPARATION) continue
      violated = true
      // 权重 = 侵入深度 / 距离（上限 6 防步长爆炸）：贴得越近推力越强
      const w = Math.min(6, (MIN_SEPARATION - d) / (d || 1e-6))
      fx += (pos[0] - p[0]) * w
      fy += (pos[1] - p[1]) * w
      fz += (pos[2] - p[2]) * w
    }
    if (!violated) break // 硬约束已满足
    if (!Number.isFinite(fx) || (!fx && !fy && !fz)) {
      // 与某点完全重合的病态：随机方向弹开一个安全距离
      const d2 = randomDir(rng)
      pos = [pos[0] + d2[0] * MIN_SEPARATION, pos[1] + d2[1] * MIN_SEPARATION, pos[2] + d2[2] * MIN_SEPARATION]
      continue
    }
    pos = [pos[0] + fx * 0.6, pos[1] + fy * 0.6, pos[2] + fz * 0.6]
  }
  // 兜底阶段二：精确分离 —— 每轮只处理最严重的违规点对，
  // 沿连线精确推到 MIN_SEPARATION×1.001（不过冲 → 不引入新冲突）。
  // 连续 8 轮无改善视为「三明治夹缝」僵持，沿违规点质心反方向
  // 加随机扰动跳出，再继续精确分离。
  let stall = 0
  let prevWorst = Infinity
  for (let pass = 0; pass < 600; pass++) {
    let worst = null
    let worstD = Infinity
    for (const p of placedPositions) {
      const d = dist3(pos, p)
      if (d < MIN_SEPARATION && d < worstD) { worstD = d; worst = p }
    }
    if (!worst) break // 全部满足硬约束
    stall = Math.abs(prevWorst - worstD) < 1e-4 ? stall + 1 : 0
    prevWorst = worstD
    if (stall > 8) {
      // 僵持逃逸：离开局部违规点质心方向，带一半幅度的随机扰动
      let cx = 0
      let cy = 0
      let cz = 0
      let cnt = 0
      for (const p of placedPositions) {
        if (dist3(pos, p) < MIN_SEPARATION * 2) { cx += p[0]; cy += p[1]; cz += p[2]; cnt++ }
      }
      if (cnt) {
        cx = pos[0] - cx / cnt
        cy = pos[1] - cy / cnt
        cz = pos[2] - cz / cnt
        const l = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1
        pos = [
          pos[0] + (cx / l + (rng() - 0.5) * 0.5) * MIN_SEPARATION * 1.4,
          pos[1] + (cy / l + (rng() - 0.5) * 0.5) * MIN_SEPARATION * 1.4,
          pos[2] + (cz / l + (rng() - 0.5) * 0.5) * MIN_SEPARATION * 1.4,
        ]
        stall = 0
        continue
      }
    }
    if (worstD < 1e-6) {
      const d2 = randomDir(rng)
      pos = [worst[0] + d2[0] * MIN_SEPARATION, worst[1] + d2[1] * MIN_SEPARATION, worst[2] + d2[2] * MIN_SEPARATION]
      continue
    }
    const q = (MIN_SEPARATION * 1.001) / worstD
    pos = [
      worst[0] + (pos[0] - worst[0]) * q,
      worst[1] + (pos[1] - worst[1]) * q,
      worst[2] + (pos[2] - worst[2]) * q,
    ]
  }
  return pos
}

/** 独立落位：距原点 FREE_MIN~FREE_MAX，采样 8 候选取「离现有节点最远」者 */
function freePosition(rng, placedPositions) {
  let best = null
  let bestMin = -1
  for (let c = 0; c < 8; c++) {
    const dir = randomDir(rng)
    const r = FREE_MIN + rng() * (FREE_MAX - FREE_MIN)
    const cand = [dir[0] * r, dir[1] * r, dir[2] * r]
    let minD = Infinity
    for (const p of placedPositions) minD = Math.min(minD, dist3(cand, p))
    if (minD > bestMin) { bestMin = minD; best = cand }
    if (bestMin >= MIN_SEPARATION) break // 已满足硬约束，提前收工
  }
  return resolveConflict(best, placedPositions, rng)
}

/**
 * 核心放置决策：按判定 JSON 解析出新节点的位置与连线。
 * 纯内存计算，所有坐标为布局单位（场景坐标 = ×UNIT_SCALE）。
 *
 * @returns {{ position:[x,y,z], link: null | {target,value,relationship}, isIndependent:boolean, anchoredToIndep?:string }}
 */
export function decidePlacement({ node, judgment, placedPositions, positionsMap, independents, clusterAnchors, rng }) {
  // ---- 冷启动：知识库为空，第一个知识点置于原点 ----
  if (placedPositions.length === 0) {
    return { position: [...ORIGIN], link: null, isIndependent: false }
  }

  const relationship = judgment.relationship
  const confidence = Number(judgment.confidence) || 0
  const targetPos = judgment.targetNodeId ? positionsMap.get(judgment.targetNodeId) : null
  const cid = node?.category || '__all__'
  const anchor = clusterAnchors ? clusterAnchors.get(cid) : null

  // 团域约束：候选点跑出本团球体（以该类锚点为球心、CLUSTER_RADIUS 为半径）时，
  // 不硬贴球面 —— 而是回到本团球体内做「体积均匀重采样」（24 候选选空隙最大者），
  // 衍生点始终长在本团内部的空隙处，整团保持紧凑蓬松的球状
  const clampToCluster = (position) => {
    if (!anchor) return position
    const d = dist3(position, anchor)
    if (d <= CLUSTER_RADIUS) return position
    let best = null
    let bestClear = -1
    for (let c = 0; c < 24; c++) {
      const dir = randomDir(rng)
      const r = CLUSTER_RADIUS * (0.3 + 0.65 * Math.cbrt(rng()))
      const cand = [anchor[0] + dir[0] * r, anchor[1] + dir[1] * r, anchor[2] + dir[2] * r]
      let minD = Infinity
      for (const p of placedPositions) minD = Math.min(minD, dist3(cand, p))
      if (minD > bestClear) { bestClear = minD; best = cand }
      if (bestClear >= MIN_SEPARATION) break
    }
    return best || position
  }

  // ---- 强关系（因果/衍生/延伸）：放到目标周围 1.5~4.0，置信度越高越近 ----
  if (RELATION_STRONG.includes(relationship) && targetPos) {
    if (confidence >= CONFIDENCE_MIN) {
      // 置信度归一化到距离：0.6 → 远端 NEAR_MAX，1.0 → 近端 NEAR_MIN
      const k = Math.min(1, Math.max(0, (confidence - CONFIDENCE_MIN) / (1 - CONFIDENCE_MIN)))
      const rSpec = NEAR_MAX - (NEAR_MAX - NEAR_MIN) * k
      // 团簇紧致度：把规格半径向 NEAR_MIN 压缩（1 = 完全抱团，0 = 原始散布）
      const rTight = NEAR_MIN + (rSpec - NEAR_MIN) * CLUSTER_TIGHTNESS
      // 拥挤度自适应：父节点周围已很挤时，新点自动长到外圈 ——
      // 复现真实团簇的「核心致密、新枝在表面生长」，而不是硬塞 + 被兜底推飞
      let crowding = 0
      for (const p of placedPositions) {
        if (dist3(targetPos, p) < NEAR_MIN * 2) crowding++
      }
      const crowdK = Math.min(1, crowding / 10)
      const r = rTight + (NEAR_MAX * 1.15 - rTight) * crowdK
      // 内圈钳到安全间距之上：高置信度也不能贴穿 MIN_SEPARATION 硬约束
      const inner = Math.max(r * 0.5, MIN_SEPARATION * 1.1)
      const pos = ringPosition(targetPos, inner, r, rng, placedPositions)
      const position = resolveConflict(clampToCluster(pos), placedPositions, rng)
      return {
        position,
        link: { target: judgment.targetNodeId, value: confidence, relationship },
        isIndependent: false,
      }
    }
    // 风险2：置信度不足 → 仍放附近但不连线（偏外圈）
    const pos2 = clampToCluster(ringPosition(targetPos, NEAR_MAX * 0.8, NEAR_MAX * 1.2, rng, placedPositions))
    const position = resolveConflict(pos2, placedPositions, rng)
    return { position, link: null, isIndependent: false }
  }

  // ---- 对比：中等距离 5~8，不与任何节点直接连线 ----
  if (relationship === RELATION_CONTRAST && targetPos) {
    const pos3 = clampToCluster(ringPosition(targetPos, CONTRAST_MIN, CONTRAST_MAX, rng, placedPositions))
    const position = resolveConflict(pos3, placedPositions, rng)
    return { position, link: null, isIndependent: false }
  }

  // ---- 无关：独立位置（风险1：独立点过多时优先挂靠最近的独立节点） ----
  if (independents.length >= INDEPENDENT_MAX) {
    let nearestId = null
    let nearestD = Infinity
    for (const id of independents) {
      const p = positionsMap.get(id)
      if (!p) continue
      // 以「离原点最近」的独立点近似为聚合锚，新独立点优先长在它附近
      const d = dist3(p, ORIGIN)
      if (d < nearestD) { nearestD = d; nearestId = id }
    }
    if (nearestId) {
      const confidence = +(CONFIDENCE_MIN + rng() * 0.15).toFixed(2)
      const pos4 = ringPosition(positionsMap.get(nearestId), NEAR_MIN, NEAR_MAX, rng, placedPositions)
      const position = resolveConflict(pos4, placedPositions, rng)
      return {
        position,
        link: { target: nearestId, value: confidence, relationship: '延伸' },
        isIndependent: false,
        anchoredToIndep: nearestId,
      }
    }
  }

  const position = freePosition(rng, placedPositions)
  return { position, link: null, isIndependent: true }
}

// ================= 主流程 =================

/**
 * 渐进式生长：按数组顺序逐个「加入新知识」，每个节点先判定再落位。
 * 当前 mock 判定器为同步确定性启发式；接入真实 AI 时传入 async 判定器，
 * 把内部 for 循环换成 for await 即可，其余逻辑不变。
 *
 * @param {Array} nodeMetas 知识节点元数据数组（顺序即生长顺序）
 * @param {Function} [judge] 关系判定器，默认 judgeRelationMock
 * @returns {{ positions, links, relationLog, unit }}
 *   positions: { [id]: [x,y,z] } 场景坐标；links: [{source,target,value,relationship}]
 */
export function growKnowledgeGraph(nodeMetas, judge = judgeRelationMock) {
  const rng = makeRng((0xc0ffee ^ Math.imul(nodeMetas.length || 1, 2654435761)) >>> 0)
  const positionsMap = new Map() // id -> [x,y,z] 布局单位
  const placed = []              // 已放置节点元数据（供判定器参考，degree 实时更新）
  const placedPositions = []     // 已放置位置（冲突检查用）
  const independents = []        // 独立节点 id 列表（风险1）
  const links = []
  const relationLog = []         // 每个节点的判定依据（调试/展示用，不持久化）
  const nodeRefs = new Map()     // id -> placed 对象引用（连线时实时递增 degree）
  const clusterAnchors = new Map() // 类别 -> 团锚点（该类首个节点位置，团域约束球心）

  for (const node of nodeMetas) {
    // ① 判定：与哪个已有点关系密切、什么关系、多大把握（结构化 JSON）
    const judgment = judge(node, placed)
    // ② 结构化决策：落位 + 是否连线（冷启动/三个风险应对/团域约束都在 decidePlacement 内）
    const decision = decidePlacement({
      node,
      judgment,
      placedPositions,
      positionsMap,
      independents,
      clusterAnchors,
      rng,
    })
    // ③ 记录决策结果（内存中完成，随后整体持久化）
    positionsMap.set(node.id, decision.position)
    placedPositions.push(decision.position)
    const ref = { id: node.id, category: node.category, degree: 0 }
    placed.push(ref)
    nodeRefs.set(node.id, ref)
    // 该类别第一个落位的节点成为「团锚」：后续同类衍生点都被约束在它周围的团域内
    const cid = node?.category || '__all__'
    if (!clusterAnchors.has(cid)) clusterAnchors.set(cid, [...decision.position])
    if (decision.link) {
      links.push({
        source: node.id,
        target: decision.link.target,
        value: +decision.link.value.toFixed(3),
        relationship: decision.link.relationship,
      })
      // 实时更新度数：判定器据此识别「枢纽」，让新知识优先长在枢纽附近
      const tref = nodeRefs.get(decision.link.target)
      if (tref) tref.degree++
      ref.degree++
    }
    if (decision.isIndependent) independents.push(node.id)
    relationLog.push({ nodeId: node.id, ...judgment })
  }

  // 布局单位 → 场景单位
  const positions = {}
  for (const [id, p] of positionsMap) {
    positions[id] = [
      +(p[0] * UNIT_SCALE).toFixed(2),
      +(p[1] * UNIT_SCALE).toFixed(2),
      +(p[2] * UNIT_SCALE).toFixed(2),
    ]
  }
  return { positions, links, relationLog, unit: UNIT_SCALE }
}

/**
 * 单点增量接口（渐进式生长框架核心，供真实数据流使用）：
 * 新知识点到达时调用一次，得到它的场景坐标与应建立的连线；
 * 调用方把结果 append 进自己的图谱数据后调用 persistGrowth 保存。
 *
 * @param {Object} args
 *   node           新节点元数据 { id, category, ... }
 *   placedNodes    已有节点元数据数组 [{ id, category }, ...]
 *   scenePositions 已有节点的场景坐标 { [id]: [x,y,z] }
 *   judgment       关系判定 JSON（由 AI 判定器产出）
 *   independentIds 当前独立节点 id 列表（风险1 用，可省略）
 * @returns {{ position:[x,y,z], link, isIndependent, judgment }}
 */
export function attachKnowledgePoint({ node, placedNodes, scenePositions, judgment, independentIds = [] }) {
  const rng = makeRng(hashId(node.id) ^ 0x51ed270b)
  const positionsMap = new Map()
  const placedPositions = []
  for (const [id, p] of Object.entries(scenePositions)) {
    const local = [p[0] / UNIT_SCALE, p[1] / UNIT_SCALE, p[2] / UNIT_SCALE]
    positionsMap.set(id, local)
    placedPositions.push(local)
  }
  // 团锚推导：每个类别第一个出现的节点位置（与 growKnowledgeGraph 的规则一致）
  const clusterAnchors = new Map()
  for (const nd of placedNodes) {
    const cid = nd.category || '__all__'
    if (!clusterAnchors.has(cid) && scenePositions[nd.id]) {
      const p = scenePositions[nd.id]
      clusterAnchors.set(cid, [p[0] / UNIT_SCALE, p[1] / UNIT_SCALE, p[2] / UNIT_SCALE])
    }
  }
  const decision = decidePlacement({
    node,
    judgment,
    placedPositions,
    positionsMap,
    independents: independentIds,
    clusterAnchors,
    rng,
  })
  return {
    // 返回场景坐标，与 scenePositions 同尺度
    position: [
      +(decision.position[0] * UNIT_SCALE).toFixed(2),
      +(decision.position[1] * UNIT_SCALE).toFixed(2),
      +(decision.position[2] * UNIT_SCALE).toFixed(2),
    ],
    link: decision.link
      ? {
          source: node.id,
          target: decision.link.target,
          value: +decision.link.value.toFixed(3),
          relationship: decision.link.relationship,
        }
      : null,
    isIndependent: decision.isIndependent,
    judgment,
  }
}

// ================= 持久化 =================

/** 数据指纹：节点数量 + id 序列哈希。增删节点后指纹变化 → 自动重新生长 */
function graphHash(nodes) {
  let h = 5381
  for (const nd of nodes) {
    const s = String(nd.id)
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0
  }
  return `${nodes.length}:${h.toString(36)}`
}

/**
 * 读取持久化的生长结果；数据指纹不匹配（节点增删过）时返回 null → 触发重新生长。
 * 位置决策一旦确定就不再变动（应对风险1 的「飘移」问题）。
 *
 * @param {Array} nodes 节点元数据数组（指纹校验用）
 * @param {string} [storageKey] 存储键；用户图谱与演示图谱各自独立存储，互不污染
 */
export function loadSavedGrowth(nodes, storageKey = GROWTH_KEY) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved || saved.hash !== graphHash(nodes)) return null
    if (!saved.positions || !Array.isArray(saved.links)) return null
    if (Object.keys(saved.positions).length !== nodes.length) return null
    return saved
  } catch {
    return null // 隐私模式等读不到 localStorage → 每次重新生长（结果一致，无副作用）
  }
}

/** 持久化生长结果（位置决策 + 连线），供下次启动直接读取 */
export function saveGrowth(nodes, growth, storageKey = GROWTH_KEY) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      hash: graphHash(nodes),
      unit: growth.unit,
      positions: growth.positions,
      links: growth.links,
    }))
  } catch {
    /* 写入失败（配额/隐私模式）不阻塞：下次启动会重新生长出一致结果 */
  }
}

/** 清除持久化（调试用：强制下次启动重新生长） */
export function clearSavedGrowth(storageKey = GROWTH_KEY) {
  try { localStorage.removeItem(storageKey) } catch { /* 忽略 */ }
}
