import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useSkyParallax } from '../hooks/useSkyParallax.js'
import * as THREE from 'three'
import { GRAPH_CATEGORIES, CATEGORY_MAP } from '../services/mockKnowledgeGraph.js'
import { buildDemoGraph, buildUserGraph, loadUserNodes, saveUserNodes, makeKnowledgeId } from '../services/userKnowledge.js'
import { makeLabelTexture, getGlowTexture, makeDotTexture } from '../services/graphTextures.js'
import { dbGet, dbSet } from '../../../services/db.js'

/**
 * 3D 知识图谱 —— 「知识宇宙」视觉版（KnowledgeGraph3D）
 *
 * 视觉方案(星云版,对齐参考图的「知识星球」形态):
 *  - 背景:CSS 暗蓝→深灰渐变 + 双层星点粒子(远层细密微闪 / 近层少量亮星),
 *          星空层独立于图谱缩放(视差反向补偿),始终是恒定的天幕
 *  - 星尘:球体内部填充白色微尘(均匀体分布 + 高斯尘埃团),任何缩放都可见,
 *          相机贴近时自动压暗;星壳与外围同样带四角十字星芒闪烁,
 *          密集线网的交叉叠亮处形成「发光雾核」—— 内部即参考图的彩线星云质感
 *  - 布局:「星团星云 v3」—— 生成式类别分团(固定种子,确定性结果):
 *          每类一团圆(簇心避让散布、团间留隙),团内 = 致密核心 + 蓬松外晕 +
 *          随机方向甩出的逃逸星;连线层确定性抽线(同类 ≈92%、跨类 25%~50%),
 *          自然的孤立星点 + 纷繁错乱的粉彩线雾,无网格/立方体式的规律感
 *  - 节点:自发光小星点,尺寸按连接度平方根映射 0.42~1.70(平方根让中度节点
 *          也有可观光球);高清档为发光点云,流畅档为零后处理的加性光晕贴图(halo sprite)
 *  - 连线:1px 极细 LineSegments,类别色混入大量白 → 低饱和粉彩后沿线渐变,
 *          亮度 = 距离衰减 × 关联强度 × 材质透明度 0.38(等效 alpha ≈ 0.12~0.4);
 *          大量重叠处在加性混合下叠出柔和彩雾,不再有高亮荧光线
 *  - 星光壳:白色光点球形外壳常驻包裹图谱(贴壳薄层 + 外层大气晕,
 *          约 12% 大星 + 逐点错相闪烁 + 四角十字星芒),
 *          像被星群包裹的「知识星球」;仅相机贴近(<120)时平滑淡出防糊屏
 *  - 雾效:FogExp2 全画质常驻,远处连线自然没入黑暗增强纵深
 *  - 分类:类别只作颜色编码与图例过滤高亮(底部图例点击),不影响布局
 *
 * 性能自适应（双画质档）：
 *  - 高清：HQ 发光点云 + Bloom 泛光 + 满配星尘星壳；流畅（低配）：光晕贴图
 *    替代 Bloom、粒子减量、DPR 锁 1、抗锯齿关闭，画质降低换取流畅度
 *  - 启动时按 deviceMemory / hardwareConcurrency / WebGL2 支持度自动分档（auto）
 *  - PerfGuard 运行时监测帧率：连续两秒 <26fps 自动切入流畅模式（终态，
 *    不改动用户偏好存储）
 *
 * 数据接入（双轨数据源）：
 *  - 用户模式（默认，成品形态）：知识点存 localStorage（STORAGE_KEYS.KNOWLEDGE_BASE，
 *    自动纳入全局备份/恢复）。安装后首次进入为「零渲染空状态」——没有任何知识点；
 *    每个新知识点经 graphGrowth 服务判定落位（首个置于宇宙原点，后续按
 *    因果/衍生/对比/延伸/无关 + 置信度围绕相关知识点生长），逐渐织成用户自己的星云
 *  - 演示模式（?view=demo 或空状态页入口）：600 点 mock 团簇星云，只读展示
 *    成品形态（示范用），生长缓存写独立键，与用户数据完全隔离互不污染
 *  - props.data 传入同构 { nodes, links } 时优先于本地用户数据（未来 reducer 接入口）
 */

// ============ 「星团星云」布局预计算(v3:分团 + 错乱 + 孤立星点) ============

// ===== 布局旋钮(想调松紧/错乱程度,直接改数值) =====
const CLUSTER_INNER = 0.16   // 簇心球带内半径 ×R
const CLUSTER_OUTER = 0.66   // 簇心球带外半径 ×R:所有团都收在星球包络之内
const CLUSTER_GAP = 0.50     // 簇心最小间距 ×R:团与团之间必留空隙
const MIX_CORE = 0.70        // 核心成员占比:贴团心的高斯云雾(线最密的雾核)
const MIX_HALO = 0.22        // 外晕成员占比:σ×1.65 的蓬松外圈
const MIX_TAIL = 0.08        // 甩尾占比:沿随机方向抛出的「逃逸星」= 错乱感/孤立感来源
const TAIL_NEAR = 1.55       // 逃逸星最近抛距 ×团半径
const TAIL_FAR = 2.35        // 逃逸星最远抛距 ×团半径
const RELAX_ITER = 36        // 同团边弹簧收紧轮数

/**
 * 「星团星云」布局 v3 —— 生成式分团(确定性:固定种子,同数据结果永远一致)。
 * 对齐参考图的三要素:
 *  ① 类别分团:每个类别一团圆,簇心在球带内避让散布(farthest-point),
 *     团间必留空隙;各团的形状彼此独立 —— 随机正交基 × 三轴尺度 × 随机大小;
 *  ② 纷繁错乱:每团 = 致密核心(MIX_CORE) + 蓬松外晕(MIX_HALO) +
 *     沿随机方向抛出的逃逸星(MIX_TAIL)。三段式混合让每团毛茸茸、不规整,
 *     彻底消灭网格/立方体/锥形这类几何规律感;
 *  ③ 松弛克制:只对「同团边」做小幅弹簧收紧(RELAX_ITER 轮),hub 放射线
 *     收短成绒刺、团内线密成雾;跨团长线不参与,仍是团与团之间的细桥。
 *     (连线层还会按强弱抽线,少数点因此成为没有连线的孤立星点。)
 *
 * 返回与入参 nodes 顺序对齐的 [{ id, pos: THREE.Vector3 }]
 */
function computeStarryLayout(nodes, links) {
  const n = nodes.length || 1
  const R = 34 + Math.sqrt(n) * 4 // 星域基准半径随规模自适应

  // 固定种子的 xorshift32:同数据多次挂载得到完全一致的布局(稳定可复现)
  let s = (0x51ed270b ^ Math.imul(n, 2654435761)) >>> 0
  const rand01 = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
  // 近似高斯:4×U(0,1) 求和 - 2,方差 ≈ 0.667
  const gauss = () => (rand01() + rand01() + rand01() + rand01() - 2) * 0.7

  // ---- ① 类别与簇心:farthest-point 避让散布,团间空隙 ≥ CLUSTER_GAP×R ----
  const catIds = []
  for (const nd of nodes) {
    if (nd?.category && !catIds.includes(nd.category)) catIds.push(nd.category)
  }
  if (catIds.length === 0) catIds.push('__all__') // 无类别数据的兜底:退化为一团

  const sampleDir = () => {
    const th = rand01() * Math.PI * 2
    const ph = Math.acos(2 * rand01() - 1)
    return [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)]
  }

  const centers = new Map()
  for (const cid of catIds) {
    let best = null
    let bestGap = -Infinity
    for (let t = 0; t < 24; t++) {
      const dir = sampleDir()
      const r = R * (CLUSTER_INNER + (CLUSTER_OUTER - CLUSTER_INNER) * Math.cbrt(rand01()))
      const p = [r * dir[0], r * dir[1], r * dir[2]]
      let gap = Infinity
      for (const c of centers.values()) {
        gap = Math.min(gap, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]))
      }
      if (gap > bestGap) { bestGap = gap; best = p }
      if (centers.size === 0) break // 第一个团无需避让
      if (gap >= R * CLUSTER_GAP) break // 已达避让标准,提前收工
    }
    centers.set(cid, best)
  }

  // 成员归类(node 引用直接入组,保序消耗种子 → 结果可复现)
  const members = new Map(catIds.map((cid) => [cid, []]))
  for (const nd of nodes) {
    const cid = nd?.category && members.has(nd.category) ? nd.category : catIds[0]
    members.get(cid).push(nd)
  }
  const avgPerCat = n / Math.max(1, catIds.length)

  // ---- ② 每团一套随机形体:随机正交基 × 三轴独立尺度 × 随机大小 ----
  // 团与团彼此不同构 —— 这是打破「立方体/网格」规律感的第一层
  const shapeOf = new Map()
  for (const cid of catIds) {
    const cnt = Math.max(1, members.get(cid).length)
    const rr = THREE.MathUtils.clamp(
      R * 0.19 * Math.cbrt(cnt / avgPerCat) * (0.8 + rand01() * 0.45),
      R * 0.10, R * 0.36,
    )
    let ux = gauss(), uy = gauss(), uz = gauss()
    let ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1
    ux /= ul; uy /= ul; uz /= ul
    let bx = gauss(), by = gauss(), bz = gauss()
    const dot = bx * ux + by * uy + bz * uz
    bx -= dot * ux; by -= dot * uy; bz -= dot * uz
    const bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1
    bx /= bl; by /= bl; bz /= bl
    shapeOf.set(cid, {
      rr,
      ux, uy, uz, bx, by, bz,
      wx: uy * bz - uz * by,
      wy: uz * bx - ux * bz,
      wz: ux * by - uy * bx,
      sx: 0.58 + rand01() * 0.52,
      sy: 0.58 + rand01() * 0.52,
      sz: 0.58 + rand01() * 0.52,
    })
  }

  // ---- ③ 成员落位:致密核心 / 蓬松外晕 / 随机方向甩出的逃逸星 三段混合 ----
  const pts = new Map() // nodeId -> [x,y,z]
  for (const cid of catIds) {
    const C = centers.get(cid)
    const sh = shapeOf.get(cid)
    const { rr } = sh
    for (const nd of members.get(cid)) {
      let x, y, z
      if (nd?.isHub) {
        // 枢纽压在团心极近处:整团的放射绒刺都从它出发
        x = C[0] + gauss() * rr * 0.22
        y = C[1] + gauss() * rr * 0.22
        z = C[2] + gauss() * rr * 0.22
      } else {
        const roll = rand01()
        if (roll < MIX_CORE) {
          // 核心:致密高斯云雾(线最密的雾核)
          const du = gauss() * sh.sx * rr
          const dv = gauss() * sh.sy * rr
          const dw = gauss() * sh.sz * rr
          x = C[0] + sh.ux * du + sh.bx * dv + sh.wx * dw
          y = C[1] + sh.uy * du + sh.by * dv + sh.wy * dw
          z = C[2] + sh.uz * du + sh.bz * dv + sh.wz * dw
        } else if (roll < MIX_CORE + MIX_HALO) {
          // 外晕:拉宽一圈的高斯,毛茸茸的不规则边缘
          const du = gauss() * sh.sx * rr * 1.65
          const dv = gauss() * sh.sy * rr * 1.65
          const dw = gauss() * sh.sz * rr * 1.65
          x = C[0] + sh.ux * du + sh.bx * dv + sh.wx * dw
          y = C[1] + sh.uy * du + sh.by * dv + sh.wy * dw
          z = C[2] + sh.uz * du + sh.bz * dv + sh.wz * dw
        } else {
          // 逃逸星:向任意方向抛离团身 —— 毛刺与「孤立星点」的来源
          const d = sampleDir()
          const t = rr * (TAIL_NEAR + rand01() * (TAIL_FAR - TAIL_NEAR))
          x = C[0] + d[0] * t
          y = C[1] + d[1] * t
          z = C[2] + d[2] * t
        }
      }
      pts.set(nd.id, [x, y, z])
    }
  }

  // ---- ④ 同团边小幅弹簧收紧:绒刺变短、团内成密雾;跨团长桥原样保留 ----
  const indexOf = new Map(nodes.map((nd, i) => [nd.id, i]))
  for (let iter = 0; iter < RELAX_ITER; iter++) {
    for (const link of links) {
      const ai = indexOf.get(link.source)
      const bi = indexOf.get(link.target)
      if (ai == null || bi == null || ai === bi) continue
      const na = nodes[ai]
      if ((na?.category || catIds[0]) !== (nodes[bi]?.category || catIds[0])) continue // 跨团桥不动
      const pa = pts.get(na.id)
      const pb = pts.get(nodes[bi].id)
      const dx = pb[0] - pa[0]
      const dy = pb[1] - pa[1]
      const dz = pb[2] - pa[2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4
      const E = (shapeOf.get(na.category)?.rr || R * 0.16) * 0.62
      const f = ((d - E) / d) * 0.05
      pa[0] += dx * f; pa[1] += dy * f; pa[2] += dz * f
      pb[0] -= dx * f; pb[1] -= dy * f; pb[2] -= dz * f
    }
  }

  // ---- ⑤ 包络钳制:越出 0.98R 的点沿径向拉回球形轮廓(逃逸星含在内) ----
  const LIMIT = R * 0.98
  for (const [, p] of pts) {
    const pr = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2])
    if (pr > LIMIT) {
      p[0] *= LIMIT / pr
      p[1] *= LIMIT / pr
      p[2] *= LIMIT / pr
    }
  }

  return nodes.map((nd) => ({
    id: nd.id,
    pos: new THREE.Vector3(pts.get(nd.id)[0], pts.get(nd.id)[1], pts.get(nd.id)[2]),
  }))
}

// ============ 场景子组件 ============

const EMPTY_SET = new Set()

/**
 * 单个节点（流畅档视觉）：加性光晕贴图光球 + Billboard 标签
 * 高清档下本组件只承担「热区 + 标签」（点云视觉由共享的 GraphPointsHQ 承担）
 * 悬停/选中的光晕变化通过 useFrame lerp 平滑过渡（~1s 回落）
 */
function GraphNode({ node, pos, color, baseScale, glowTarget, labelVisible, haloMap, liteMode, onTap, onHover }) {
  const haloRef = useRef(null)
  const glow = useRef(0)
  const labelMatRef = useRef(null)
  const controls = useThree((s) => s.controls)

  const label = useMemo(() => makeLabelTexture(node.name, color), [node.name, color])
  useEffect(() => () => label.texture.dispose(), [label])

  // 目标值：光晕不透明度（流畅档的节点光球亮度;高清档 halo 不渲染,此值无效）
  const targets = useMemo(() => ({
    halo: glowTarget >= 1 ? 0.95 : glowTarget > 0 ? 0.55 : 0.3,
  }), [glowTarget])

  useFrame((_, dt) => {
    const k = Math.min(1, dt * 3.2) // lerp 系数：约 1 秒内平滑收敛
    const halo = haloRef.current
    if (halo) {
      halo.opacity += (targets.halo - halo.opacity) * k
      const hs = baseScale * (3.2 + glow.current * 1.4)
      haloRef.current.parent?.scale.setScalar(hs)
    }
    glow.current += (glowTarget - glow.current) * k

    // 文字标签近距离自动淡出:放大到很近时避免巨大文字糊满视野
    const lm = labelMatRef.current
    if (lm) {
      const camDist = controls?.getDistance?.() ?? 999
      lm.opacity += (THREE.MathUtils.smoothstep(camDist, 24, 40) - lm.opacity) * Math.min(1, dt * 6)
    }
  })

  return (
    <group position={pos}>
      {/* 加性光晕层（仅流畅档渲染，作为 Bloom 的降级替代 = 低配版节点光球） */}
      {liteMode && (
        <group>
          <Billboard>
            <mesh>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                ref={haloRef}
                map={haloMap}
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
                fog={false}
              />
            </mesh>
          </Billboard>
        </group>
      )}

      {/* 点击/悬停热区：独立于可见视觉（透明材质而非 visible=false，否则射线检测会跳过）；
          显式乘回 baseScale，保持与光球尺寸一致的命中范围 */}
      <mesh scale={baseScale} onPointerOver={() => onHover?.(node.id)} onPointerOut={() => onHover?.(null)} onClick={(e) => { e.stopPropagation(); onTap(node.id) }}>
        <sphereGeometry args={[1.7, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} fog={false} />
      </mesh>

      {labelVisible && (
        <Billboard>
          <mesh position={[0, baseScale + 5.2, 0]}>
            <planeGeometry args={[4.2 * label.aspect, 4.2]} />
            <meshBasicMaterial ref={labelMatRef} map={label.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        </Billboard>
      )}
    </group>
  )
}

/**
 * 双层星空背景：
 *  - 远层：细密暗星（缓慢明暗呼吸）
 *  - 近层：少量亮星（相位错开的闪烁）
 * 整体被 useSkyParallax 包裹:不随图谱缩放而变化,独立成层
 * （useSkyParallax 见 ../hooks/useSkyParallax.js）
 */
function Starfield() {
  const skyRef = useSkyParallax()
  const farMat = useRef(null)
  const nearMat = useRef(null)
  const { farGeo, nearGeo } = useMemo(() => {
    const make = (count, rMin, rMax, size) => {
      const arr = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const r = rMin + Math.random() * (rMax - rMin)
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
        arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
        arr[i * 3 + 2] = r * Math.cos(phi)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
      return geo
    }
    // 星空密度基准（+30% 后）：远层 546 / 近层 91
    return { farGeo: make(546, 260, 380), nearGeo: make(91, 200, 300) }
  }, [])
  useEffect(() => () => { farGeo.dispose(); nearGeo.dispose() }, [farGeo, nearGeo])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (farMat.current) farMat.current.opacity = 0.32 + Math.sin(t * 0.35) * 0.08
    if (nearMat.current) nearMat.current.opacity = 0.55 + Math.sin(t * 0.9 + 1.7) * 0.18
  })

  return (
    <group ref={skyRef}>
      <points geometry={farGeo}>
        <pointsMaterial ref={farMat} size={1.1} color="#a5b4fc" transparent opacity={0.32} sizeAttenuation depthWrite={false} fog={false} />
      </points>
      <points geometry={nearGeo}>
        <pointsMaterial ref={nearMat} size={2.4} color="#e0e7ff" transparent opacity={0.55} sizeAttenuation depthWrite={false} fog={false} />
      </points>
    </group>
  )
}

/** 连线粉彩化:类别色向纯白混 55%,得到参考图的低饱和淡彩 */
const LINK_PASTEL = 0.55
const LINK_WHITE = new THREE.Color('#ffffff')

/**
 * 连线系统(星云版·粉彩雾感·确定性抽线):
 *  - 并非所有关系都会画出:同类关联保留 ≈92%,跨类弱关联仅保留 25%~50%
 *    (固定种子的确定性伪随机 → 结果稳定可复现)。画面上因此自然出现
 *    「没有连线的孤立星点」,线网疏密错落 —— 对齐参考图的纷繁错乱感;
 *  - 保留下来的链接合并进同一个 LineSegments(WebGL 默认 1px 细线);
 *  - 颜色 = 类别色混白 55% 淡化为低饱和粉彩后的顶点渐变(HQ/标准档同源);
 *  - 亮度 = 关联强度 × 距离衰减(叠加材质透明度 0.38 后等效 alpha ≈ 0.12~0.4,
 *    单条线极淡,大量重叠处靠加性混合自然叠出发光彩雾);
 *  - 「两端细、中间略粗」:每条边拆 a→m、m→b 两段,中点仅轻微上调 8%。
 */
function GraphLinks({ graph, layoutMap, nodesById, activeCat }) {
  const plain = useMemo(() => {
    const positions = []
    const colors = []
    const cA = new THREE.Color()
    const cB = new THREE.Color()
    // 确定性抽线用的 xorshift 种子(随数据规模派生,结果稳定)
    let lseed = (0x5f3c7 ^ Math.imul(graph.links.length || 1, 668265263)) >>> 0
    const keepRnd = () => {
      lseed ^= lseed << 13; lseed ^= lseed >>> 17; lseed ^= lseed << 5; lseed >>>= 0
      return lseed / 4294967296
    }
    for (const link of graph.links) {
      const a = layoutMap.get(link.source)
      const b = layoutMap.get(link.target)
      if (!a || !b) continue
      const value = THREE.MathUtils.clamp(link.value ?? 0.5, 0, 1)
      // 抽线判定:同类浓密(≈92%),跨类按强弱放行(strong → ~50%,weak → ~25%)
      const sameCat = nodesById[link.source]?.category === nodesById[link.target]?.category
      const keepP = sameCat ? 0.92 : 0.5 - 0.25 * (1 - value)
      if (keepRnd() > keepP) continue
      const dist = a.distanceTo(b)
      // 距离衰减：近 1 → 远 0.33，再乘关联强度
      const fade = THREE.MathUtils.clamp(1.25 - dist / 150, 0.33, 1) * (0.45 + 0.55 * value)

      // 两端节点色:类别色先混入大量白 → 低饱和粉彩(HQ 亦同源,不再走提亮发光色)
      cA.set(CATEGORY_MAP[nodesById[link.source]?.category]?.color || '#94a3b8').lerp(LINK_WHITE, LINK_PASTEL)
      cB.set(CATEGORY_MAP[nodesById[link.target]?.category]?.color || '#94a3b8').lerp(LINK_WHITE, LINK_PASTEL)

      // 类别过滤：非激活类别的端点大幅压暗（线随之自然淡出）
      const dimA = !activeCat || nodesById[link.source]?.category === activeCat ? 1 : 0.14
      const dimB = !activeCat || nodesById[link.target]?.category === activeCat ? 1 : 0.14

      // 端点各混入对方 12% 色 → 沿线平滑过渡
      const endA = cA.clone().lerp(cB, 0.12).multiplyScalar(fade * dimA)
      const endB = cB.clone().lerp(cA, 0.12).multiplyScalar(fade * dimB)
      // 中点：两端色折中并轻微提亮(+8%),模拟「中间略粗」的光丝鼓形
      const midFade = Math.min(fade * 1.08, 1.02)
      const dimM = Math.min(dimA, dimB)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const mz = (a.z + b.z) / 2
      const midC = cA.clone().lerp(cB, 0.5).multiplyScalar(midFade * dimM)

      positions.push(a.x, a.y, a.z, mx, my, mz, mx, my, mz, b.x, b.y, b.z)
      colors.push(
        endA.r, endA.g, endA.b,
        midC.r, midC.g, midC.b,
        midC.r, midC.g, midC.b,
        endB.r, endB.g, endB.b,
      )
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return geo
  }, [graph, layoutMap, nodesById, activeCat])
  useEffect(() => () => plain.dispose(), [plain])

  return (
    <lineSegments geometry={plain}>
      {/* 低透明度 0.38 × 顶点亮度调制:单条线极淡,密集重叠才叠出粉彩光雾(对齐参考图) */}
      <lineBasicMaterial vertexColors transparent opacity={0.38} depthWrite={false} blending={THREE.AdditiveBlending} />
    </lineSegments>
  )
}

// ============ 「星光壳」(常驻包裹图谱的白色星尘球壳) ============

/** 星壳常驻可见;仅当相机贴近(dist ≤ NEAR_END)才平滑淡出防止糊屏 */
const SHELL_NEAR_START = 58
const SHELL_NEAR_END = 118

const STAR_SHELL_VERT = `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uDpr;
varying vec3 vColor;
varying float vTwinkle;
varying float vStar;
void main() {
  vColor = aColor;
  // 逐点错相闪烁:速度 0.5~1.4 rad/s,幅度 ±30%
  vTwinkle = 0.7 + 0.3 * sin(uTime * (0.5 + fract(aPhase * 7.31) * 0.9) + aPhase * 6.2831);
  // 四角十字星芒强度:约 42% 的星星显芒,大星几乎必显(参考图外围的十字闪星)
  float bigStar = smoothstep(1.8, 3.1, aSize);
  float rollIn = fract(aPhase * 4.37);
  vStar = mix(rollIn < 0.42 ? 1.0 : 0.18, 1.25, bigStar);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-mv.z, 1.0);
  gl_PointSize = clamp(aSize * uDpr * (170.0 / depth), uDpr * 1.5, uDpr * 15.0);
  gl_Position = projectionMatrix * mv;
}
`

const STAR_SHELL_FRAG = `
uniform float uOpacity;
varying vec3 vColor;
varying float vTwinkle;
varying float vStar;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  float glow = pow(clamp(1.0 - d, 0.0, 1.0), 2.1);   // 柔和光晕
  float core = pow(clamp(1.0 - d, 0.0, 1.0), 6.0);   // 亮核趋白
  // 四角十字光芒:沿 uv 两轴的尖峰,离圆心越远衰减越快
  float sx = pow(max(0.0, 1.0 - abs(uv.x)), 5.0);
  float sy = pow(max(0.0, 1.0 - abs(uv.y)), 5.0);
  float spikes = min(sx + sy, 1.15) * smoothstep(1.0, 0.18, d);
  float a = ((glow * 0.85 + core * 0.5) + spikes * 0.55 * vStar) * vTwinkle * uOpacity;
  vec3 col = mix(vColor, vec3(1.0), clamp(core * 0.65 + spikes * 0.4 * vStar, 0.0, 1.0)) * vTwinkle;
  gl_FragColor = vec4(col * uOpacity, a);
}
`

/**
 * 「星光壳」:常驻包裹整个图谱的白色星尘球壳(替代旧版玻璃壳)。
 * 对齐参考图外围质感的混合采样:
 *  - 78% 贴壳薄层:紧贴图谱外沿 ±4% 范围,形成一圈致密光点;
 *  - 22% 外层大气晕:r^2 加权向外散射约 55% 半径,越靠外越稀疏;
 *  - 约 12% 为放大数倍的大星,配合片元内四角十字星芒,
 *    复现参考图外围那种带光芒的十字闪星;白为主混少量淡蓝/淡紫;
 *  - 逐点错相闪烁,Additive 叠加成星群外壳。
 * 常驻渲染;仅相机贴近(SHELL_NEAR 区间)时平滑淡出防糊屏。
 */
function StarShell({ radius, liteMode }) {
  const pointsRef = useRef(null)
  const controls = useThree((s) => s.controls)
  const dpr = useThree((s) => s.viewport.dpr)
  const shown = useRef(1)
  const COUNT = liteMode ? 1150 : 3000

  const geo = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const sizes = new Float32Array(COUNT)
    const phases = new Float32Array(COUNT)
    const R1 = radius * 1.04      // 主壳层:贴着图谱外沿
    const R2 = radius * 0.55      // 外层晕的最大散射厚度
    const cWhite = new THREE.Color('#ffffff')
    const cBlue = new THREE.Color('#cfe0ff')
    const cLav = new THREE.Color('#e4dbff')
    const tmp = new THREE.Color()
    for (let i = 0; i < COUNT; i++) {
      let r
      if (Math.random() < 0.22) {
        // 大气晕:u^2 加权,光点集中靠内、向外渐稀
        r = R1 + Math.pow(Math.random(), 2) * R2
      } else {
        // 贴壳薄层:±4% 厚度的一圈光点
        r = R1 * (0.97 + Math.random() * 0.08)
      }
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)

      // 颜色:白为主,随机混入淡蓝/淡紫
      tmp.copy(cWhite).lerp(Math.random() < 0.5 ? cBlue : cLav, Math.random() * 0.5)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b

      // 尺寸分布:88% 细小星尘 + 12% 放大星(大星才会撑开十字星芒)
      sizes[i] = Math.random() < 0.12 ? 2.5 + Math.random() * 1.8 : 0.9 + Math.random() * 1.6
      phases[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    return g
  }, [radius, COUNT])
  useEffect(() => () => geo.dispose(), [geo])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: STAR_SHELL_VERT,
    fragmentShader: STAR_SHELL_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uDpr: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => { material.uniforms.uDpr.value = dpr }, [dpr, material])

  useFrame(({ clock }, dt) => {
    material.uniforms.uTime.value = clock.elapsedTime
    // 常驻显示;仅在相机贴近(58~118)时平滑淡出,防止穿入星壳时糊屏
    const dist = controls?.getDistance?.() ?? 0
    const t = THREE.MathUtils.smoothstep(dist, SHELL_NEAR_START, SHELL_NEAR_END)
    shown.current += (t - shown.current) * Math.min(1, dt * 4.5)
    material.uniforms.uOpacity.value = shown.current
    if (pointsRef.current) pointsRef.current.visible = shown.current > 0.02
  })

  return (
    <points ref={pointsRef} geometry={geo}>
      <primitive object={material} attach="material" />
    </points>
  )
}

// ============ 「星尘内晕」(填充图谱内部的白色微尘) ============

/**
 * 内部星尘:让「知识星球」的内部也布满细小星点(参考图的内部质感)。
 * 分布混合(借鉴「粒子星球」采样):
 *  - 60% 均匀体分布:cbrt(u) 填满球体,中心留 15% 空隙避免糊住核心星云;
 *  - 40% 高斯尘埃团:10 个随机团心,散布半径约 0.085R,制造自然团块凌乱感;
 *  - 数量克制/尺寸更小/亮度更低 —— 内部的亮感主角是彩色线网本身与交叉叠亮,
 *    白尘只是缝隙里的点缀(数量约为旧版一半,防止盖住粉彩线雾)。
 * 任何缩放层级常驻;相机贴近(可能穿入尘中)时自动压暗防糊屏。
 */
function NebulaDust({ radius, liteMode }) {
  const controls = useThree((s) => s.controls)
  const dpr = useThree((s) => s.viewport.dpr)
  const COUNT = liteMode ? 420 : 1300

  const geo = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const sizes = new Float32Array(COUNT)
    const phases = new Float32Array(COUNT)
    const R = radius * 0.96 // 顶到壳层内沿,与星光壳自然衔接
    const cWhite = new THREE.Color('#ffffff')
    const cBlue = new THREE.Color('#cfe0ff')
    const cLav = new THREE.Color('#e4dbff')
    const tmp = new THREE.Color()

    // 预生成 10 个尘埃团中心(球内随机方向 × 0.25R~0.85R)
    const CLUMP_N = 10
    const clumps = []
    for (let c = 0; c < CLUMP_N; c++) {
      const cr = R * (0.25 + Math.random() * 0.6)
      const ct = Math.random() * Math.PI * 2
      const cp = Math.acos(Math.random() * 2 - 1)
      clumps.push([cr * Math.sin(cp) * Math.cos(ct), cr * Math.sin(cp) * Math.sin(ct), cr * Math.cos(cp)])
    }
    // 近似高斯(3×U-1.5,σ≈0.5)
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.816

    for (let i = 0; i < COUNT; i++) {
      let x, y, z
      if (Math.random() < 0.4) {
        // 尘埃团:团心 + 高斯偏移
        const c = clumps[Math.floor(Math.random() * CLUMP_N)]
        const spread = R * 0.085
        x = c[0] + gauss() * spread
        y = c[1] + gauss() * spread
        z = c[2] + gauss() * spread
      } else {
        // 均匀体分布:中心留空
        const r = R * (0.15 + 0.85 * Math.cbrt(Math.random()))
        const th = Math.random() * Math.PI * 2
        const ph = Math.acos(Math.random() * 2 - 1)
        x = r * Math.sin(ph) * Math.cos(th)
        y = r * Math.sin(ph) * Math.sin(th)
        z = r * Math.cos(ph)
      }
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z

      // 颜色:白为主微混蓝紫,亮度 0.42~0.9(比壳层更暗一档,只做衬托)
      const dim = 0.42 + Math.random() * 0.48
      tmp.copy(cWhite).lerp(Math.random() < 0.5 ? cBlue : cLav, Math.random() * 0.45).multiplyScalar(dim)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b

      sizes[i] = 0.55 + Math.random() * 1.05
      phases[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    return g
  }, [radius, COUNT])
  useEffect(() => () => geo.dispose(), [geo])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: STAR_SHELL_VERT,
    fragmentShader: STAR_SHELL_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },
      uDpr: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => { material.uniforms.uDpr.value = dpr }, [dpr, material])

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    // 相机贴近(46~98)时透明度 0.42→0.95 平滑恢复,避免穿入尘中满屏糊点
    const dist = controls?.getDistance?.() ?? 0
    const near = THREE.MathUtils.clamp((dist - 46) / 52, 0, 1)
    material.uniforms.uOpacity.value = 0.42 + 0.53 * near
  })

  return (
    <points geometry={geo}>
      <primitive object={material} attach="material" />
    </points>
  )
}

// ============ HQ（极致画质）辅助 ============

/**
 * HQ 类别色变体缓存：HSL 色彩空间提饱和/提亮
 * 高饱和 + 发光边缘的「知识宇宙」观感，与标准档色板完全隔离互不影响
 */
const hqColorCache = new Map()
function hqCategoryColor(hex) {
  if (!hqColorCache.has(hex)) {
    const c = new THREE.Color(hex)
    c.offsetHSL(0.008, 0.07, 0.04) // 极轻提亮:HQ 不再荧光化,保持粉彩基调
    hqColorCache.set(hex, c)
  }
  return hqColorCache.get(hex)
}

// ============ HQ（极致画质）场景组件 ============

/** HQ 点云的屏幕点尺寸系数（节点基础尺寸已改为 0.32~1.14,系数相应放大维持像素观感） */
const HQ_POINT_SIZE_K = 6.4
/** 与场景 FogExp2 一致的密度（ShaderMaterial 不自动吃场景雾，需在着色器内复刻） */
const HQ_FOG_DENSITY = 0.003

const HQ_POINT_VERT = `
attribute float aSize;
attribute vec3 aColor;
uniform float uDpr;
uniform float uFogDensity;
varying vec3 vColor;
varying float vFog;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-mv.z, 1.0);
  gl_PointSize = clamp(aSize * uDpr * (170.0 / depth), uDpr * 2.0, uDpr * 42.0);
  // 与 FogExp2 相同的指数衰减曲线 exp(-(density*depth)^2)
  vFog = exp(-pow(depth * uFogDensity, 2.0));
  gl_Position = projectionMatrix * mv;
}
`

const HQ_POINT_FRAG = `
varying vec3 vColor;
varying float vFog;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  float core = pow(clamp(1.0 - d, 0.0, 1.0), 3.0);        // 锐核
  float halo = clamp(1.0 - d, 0.0, 1.0);                  // 光晕包络
  halo *= halo;
  vec3 col = mix(vColor, vec3(1.0), core * 0.85);          // 高亮核心趋白 → 发光边缘
  col *= (halo * 1.15 + core * 0.6);
  col *= vFog;
  float alpha = (halo * 0.75 + core * 0.25) * vFog;
  gl_FragColor = vec4(col, alpha);
}
`

/** HQ 白色星尘层：大量小尺寸圆形粒子，增强宇宙纵深（星空层独立，不随图谱缩放） */
function WhiteStars() {
  const skyRef = useSkyParallax()
  const matRef = useRef(null)
  const dotMap = useMemo(() => makeDotTexture(), [])
  useEffect(() => () => dotMap.dispose(), [dotMap])
  const geo = useMemo(() => {
    const COUNT = 900
    const arr = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      const r = 240 + Math.random() * 160
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = 0.42 + Math.sin(clock.elapsedTime * 0.5) * 0.12
  })
  return (
    <group ref={skyRef}>
      <points geometry={geo}>
        <pointsMaterial ref={matRef} size={1.6} color="#ffffff" map={dotMap} transparent opacity={0.42} sizeAttenuation depthWrite={false} fog={false} />
      </points>
    </group>
  )
}

/**
 * HQ 节点点云：全部节点合并为一个 <points>（一次 draw call）
 * 悬停/选中反馈通过逐帧改写 aSize / aColor attribute 实现：
 * 放大 ×(1+glow×0.42)、颜色随辉光等级提亮趋白；n=72 级别的 CPU 开销可忽略
 */
function GraphPointsHQ({ layout, nodesById, adjacency, maxDegree, selectedId, hoveredId, activeCat }) {
  const dpr = useThree((s) => s.viewport.dpr)

  const data = useMemo(() => {
    const n = layout.length
    const positions = new Float32Array(n * 3)
    const baseColors = new Float32Array(n * 3)
    const baseSizes = new Float32Array(n)
    const entries = []
    const col = new THREE.Color()
    layout.forEach(({ id, pos }, i) => {
      const node = nodesById[id]
      const hex = CATEGORY_MAP[node?.category]?.color || '#94a3b8'
      col.copy(hqCategoryColor(hex))
      const lvl = node?.isHub ? 1 : 0.86 // 枢纽更亮，叶子稍收敛，塑造层次
      positions[i * 3] = pos.x
      positions[i * 3 + 1] = pos.y
      positions[i * 3 + 2] = pos.z
      baseColors[i * 3] = col.r * lvl
      baseColors[i * 3 + 1] = col.g * lvl
      baseColors[i * 3 + 2] = col.b * lvl
      const degree = adjacency.get(id)?.size || 0
      // 尺寸随连接度动态映射(平方根:中度节点同样有可观光球,枢纽最大)
      baseSizes[i] = (0.32 + Math.sqrt(degree / Math.max(1, maxDegree)) * 0.82) * HQ_POINT_SIZE_K
      entries.push({ id, neighbors: adjacency.get(id) || EMPTY_SET, isHub: !!node?.isHub, cat: node?.category })
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const sizeAttr = new THREE.BufferAttribute(baseSizes.slice(), 1)
    const colorAttr = new THREE.BufferAttribute(baseColors.slice(), 3)
    geo.setAttribute('aSize', sizeAttr)
    geo.setAttribute('aColor', colorAttr)
    geo.computeBoundingSphere()
    return { n, entries, baseColors, baseSizes, sizeAttr, colorAttr, glow: new Float32Array(n), dim: new Float32Array(n).fill(1), phase: new Float32Array(n).map(() => Math.random() * Math.PI * 2), geo }
  }, [layout, nodesById, adjacency, maxDegree])
  useEffect(() => () => data.geo.dispose(), [data])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: HQ_POINT_VERT,
    fragmentShader: HQ_POINT_FRAG,
    uniforms: {
      uDpr: { value: 1 },
      uFogDensity: { value: HQ_FOG_DENSITY },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => { material.uniforms.uDpr.value = dpr }, [dpr, material])

  // 逐帧驱动辉光/压暗/呼吸动画，与标准档 GraphNode 的 lerp 手感一致（约 1s 回落）
  useFrame(({ clock }, dt) => {
    const k = Math.min(1, dt * 3.2)
    const t = clock.elapsedTime
    const hasSelection = !!selectedId
    for (let i = 0; i < data.n; i++) {
      const e = data.entries[i]
      let gt = 0
      if (selectedId != null && selectedId === e.id) gt = 1
      else if (hasSelection && e.neighbors.has(selectedId)) gt = 0.5
      else if (hoveredId != null && hoveredId === e.id) gt = 0.8
      else if (hoveredId != null && e.neighbors.has(hoveredId)) gt = 0.35

      const related = !hasSelection || selectedId === e.id || e.neighbors.has(selectedId)
      const dimT = related ? (e.isHub ? 1 : 0.88) : 0.34
      // 类别过滤：非激活类别的点云整体压暗缩小，激活类别维持原亮度
      const catOk = !activeCat || e.cat === activeCat
      const dimTarget = catOk ? dimT : 0.12

      const g = data.glow[i] + (gt - data.glow[i]) * k
      const dm = data.dim[i] + (dimTarget - data.dim[i]) * k
      data.glow[i] = g
      data.dim[i] = dm

      const breathe = Math.sin(t * 0.9 + data.phase[i]) * 0.05
      data.sizeAttr.array[i] = data.baseSizes[i] * (catOk ? 1 : 0.78) * (1 + g * 0.42) * (1 + breathe)

      const bright = (0.52 + g * 1.1) * dm
      data.colorAttr.array[i * 3] = Math.min(data.baseColors[i * 3] * bright, 2.4)
      data.colorAttr.array[i * 3 + 1] = Math.min(data.baseColors[i * 3 + 1] * bright, 2.4)
      data.colorAttr.array[i * 3 + 2] = Math.min(data.baseColors[i * 3 + 2] * bright, 2.4)
    }
    data.sizeAttr.needsUpdate = true
    data.colorAttr.needsUpdate = true
  })

  return (
    <points geometry={data.geo}>
      <primitive object={material} attach="material" />
    </points>
  )
}

/**
 * 运行时性能监测（双档制）：
 *  - 预热跳过前 1 个采样窗口
 *  - 连续 2 个窗口 fps < 26 → 自动切入流畅模式（终态，一次性；不改动用户偏好存储）
 */
function PerfGuard({ onLite }) {
  const frames = useRef(0)
  const windowStart = useRef(performance.now())
  const lowStreak = useRef(0)
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    frames.current++
    const now = performance.now()
    const elapsed = now - windowStart.current
    if (elapsed >= 2000) {
      const fps = (frames.current / elapsed) * 1000
      frames.current = 0
      windowStart.current = now
      if (fps < 26) lowStreak.current += 1
      else lowStreak.current = 0
      if (lowStreak.current >= 2) {
        done.current = true
        onLite()
      }
    }
  })
  return null
}

/** 节点层 + 连线层 + 灯光 + 星空 + 星球外壳的完整场景 */
function GraphScene({ graph, layout, layoutMap, nodesById, adjacency, maxDegree, selectedId, hoveredId, showLabels, liteMode, hqMode, activeCat, onTapNode, onHoverNode }) {
  // 「知识星球」外壳半径：由实际布局包围球推算（含噪声/松弛漂移余量）
  const shellRadius = useMemo(() => {
    let maxR = 10
    for (const { pos } of layout) maxR = Math.max(maxR, pos.length())
    return maxR * 1.18 + 8
  }, [layout])

  return (
    <>
      {/* 整体压暗的光线：节点自发光成为唯一视觉焦点 */}
      <ambientLight intensity={0.28} />
      <directionalLight position={[60, 90, 50]} intensity={0.4} />

      {/* 微弱雾效（全画质常驻）：远处连线自然没入黑暗增强纵深；
          点云在着色器内复刻同曲线衰减，星空/标签/热区材质已显式 fog=false 豁免 */}
      <fogExp2 attach="fog" args={['#0a1030', 0.003]} />

      {/* 常驻包裹图谱的「星光壳」:白色星尘壳 + 十字星芒大星,近距自动淡出 */}
      <StarShell radius={shellRadius} liteMode={liteMode} />

      <Starfield />
      {hqMode && <WhiteStars />}

      {/* 内部星尘:球体内常驻的白色微尘,「星球内部也是星空」的质感 */}
      <NebulaDust radius={shellRadius} liteMode={liteMode} />

      <GraphLinks graph={graph} layoutMap={layoutMap} nodesById={nodesById} activeCat={activeCat} />
      {hqMode && (
        <GraphPointsHQ
          layout={layout}
          nodesById={nodesById}
          adjacency={adjacency}
          maxDegree={maxDegree}
          selectedId={selectedId}
          hoveredId={hoveredId}
          activeCat={activeCat}
        />
      )}

      {layout.map(({ id, pos }) => {
        const node = nodesById[id]
        if (!node) return null
        const neighbors = adjacency.get(id) || EMPTY_SET
        const hasSelection = !!selectedId
        const isSelected = selectedId === id
        const isHovered = hoveredId === id

        // 辉光等级：选中 1 / 选中邻域 0.5 / 悬停 0.8 / 悬停邻域 0.35 / 常态 0
        let glowTarget = 0
        if (isSelected) glowTarget = 1
        else if (hasSelection && neighbors.has(selectedId)) glowTarget = 0.5
        else if (isHovered) glowTarget = 0.8
        else if (hoveredId && neighbors.has(hoveredId)) glowTarget = 0.35

        // 尺寸随连接度动态映射 0.42 ~ 1.70（平方根映射:中度节点也有可观光球；
        // 整体比背景星尘光点大半档,重塑「知识点即光球」的主角感）
        const degree = neighbors.size
        const catOk = !activeCat || node.category === activeCat
        const baseScale = (0.42 + Math.sqrt(degree / Math.max(1, maxDegree)) * 1.28) * (catOk ? 1 : 0.85)

        // 选中聚焦/类别过滤的相关性（用于标签显隐策略）
        const related = !hasSelection || isSelected || neighbors.has(selectedId)

        // 标签策略：枢纽常驻；选中/悬停邻域显示；类别过滤后只标激活类，避免文字淹没画面
        const labelVisible =
          showLabels &&
          related &&
          catOk &&
          (node.isHub || isSelected || isHovered || (hoveredId && neighbors.has(hoveredId)))

        return (
          <GraphNode
            key={id}
            node={node}
            pos={pos}
            color={CATEGORY_MAP[node.category]?.color || '#94a3b8'}
            baseScale={baseScale}
            glowTarget={glowTarget}
            labelVisible={labelVisible}
            haloMap={getGlowTexture(CATEGORY_MAP[node.category]?.color || '#94a3b8')}
            liteMode={liteMode}
            onTap={onTapNode}
            onHover={onHoverNode}
          />
        )
      })}
    </>
  )
}

// ============ 空状态页与添加弹窗（用户模式的零起点引导） ============

/** 空状态页的 CSS 星空装饰（零 WebGL、零 GPU 负担：几十个微光点 + 呼吸闪烁） */
function EmptySky() {
  const stars = useMemo(() => Array.from({ length: 56 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: Math.random() < 0.15 ? 3 : 1.5,
    opacity: 0.22 + Math.random() * 0.55,
    delay: Math.random() * 4,
  })), [])
  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map((s) => (
        <span key={s.id} className="absolute rounded-full bg-white animate-pulse"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, opacity: s.opacity, animationDelay: `${s.delay}s` }} />
      ))}
    </div>
  )
}

/**
 * 添加知识点弹窗：名称 + 类别（六选一）→ 生长服务判定落位。
 * 关系判定当前用内置确定性判定器（judgeRelationMock），接入真实 AI 后
 * 只替换判定器，本弹窗与数据流无需改动。
 */
function AddKnowledgeModal({ onSave, onClose }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(GRAPH_CATEGORIES[0].id)
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave({ name: trimmed, category })
  }
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-900/95 border border-indigo-500/25 rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-bold text-indigo-100 mb-1">✨ 新的知识点</div>
        <p className="text-[11px] text-slate-400 mb-4">它会根据内容与已有知识的关系，自动生长在合适的位置</p>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
          placeholder="例如：间隔重复记忆法"
          className="w-full px-3 py-2.5 rounded-xl bg-slate-800/80 border border-slate-600/60 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-400/70 mb-4"
        />
        <div className="text-[11px] text-slate-400 mb-1.5">类别（决定星云的颜色族群）</div>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {GRAPH_CATEGORIES.map((cat) => {
            const active = category === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-full border transition-colors ${
                  active ? 'text-white' : 'text-slate-400 border-slate-600/50 hover:text-slate-200'
                }`}
                style={active ? { backgroundColor: `${cat.color}59`, borderColor: `${cat.color}88`, boxShadow: `inset 0 0 8px ${cat.color}44` } : undefined}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                {cat.name}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3.5 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">取消</button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-3.5 py-2 text-xs rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >让它诞生 ⭐</button>
        </div>
      </div>
    </div>
  )
}

// ============ 主组件 ============

// ===== 画质偏好持久化（'auto' | 'hq' | 'lite'，双档制） =====
const QUALITY_KEY = 'knowledgeGraph.quality.v2'
function readQualityPref() {
  try {
    // 存储已迁至 IndexedDB：改走 db.js 内存镜像（原始字符串值经迁移原样保留）
    const v = dbGet(QUALITY_KEY)
    if (v === 'hq' || v === 'lite' || v === 'auto') return v
  } catch { /* 隐私模式等场景读不到就回默认 */ }
  return 'auto'
}
function writeQualityPref(v) {
  try { dbSet(QUALITY_KEY, v) } catch { /* 忽略写入失败 */ }
}
function cycleQualityPref(pref) {
  return pref === 'auto' ? 'hq' : pref === 'hq' ? 'lite' : 'auto'
}

/** WebGL 探测（不支持时显示降级提示页） */
function detectWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * 低端设备启发式探测（auto 档的启动分级依据，运行时 PerfGuard 会二次修正）
 * 命中任一条件直接以流畅（低配）模式启动：光晕贴图替代 Bloom、DPR 锁 1
 */
function detectLowEndDevice() {
  if (typeof navigator === 'undefined') return false
  try {
    const mem = navigator.deviceMemory // Chrome/Edge，单位 GB
    const cores = navigator.hardwareConcurrency
    const c = document.createElement('canvas')
    const hasWebGL2 = !!c.getContext('webgl2')
    return hasWebGL2 === false || (mem != null && mem <= 2) || (cores != null && cores <= 4)
  } catch {
    return true
  }
}

export default function KnowledgeGraph3D({
  /** 外部数据源（可选）：同构 { nodes, links }，传入时优先于本地用户数据（未来 reducer 接入口） */
  data,
}) {
  const [canWebGL] = useState(detectWebGL)
  const [qualityPref, setQualityPref] = useState(readQualityPref) // 'auto' | 'hq' | 'lite'
  const [liteMode, setLiteMode] = useState(detectLowEndDevice)

  // ===== 数据视图双轨：'user' = 我的知识库（真实数据，零起点）| 'demo' = 演示图谱（600 点示范，只读） =====
  // 支持 ?view=demo 直达演示；演示与用户数据完全隔离，正式包安装后默认为零渲染空状态
  const [viewMode, setViewMode] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('view') === 'demo' ? 'demo' : 'user' } catch { return 'user' }
  })
  const [userNodes, setUserNodes] = useState(loadUserNodes)
  const [addModalOpen, setAddModalOpen] = useState(false)

  /** 添加知识点：元数据入列并持久化 → 生长服务按数据指纹重新落位（首个在宇宙原点） */
  const addKnowledgePoint = useCallback(({ name, category }) => {
    const node = { id: makeKnowledgeId(name), name, category, createdAt: Date.now() }
    setUserNodes((prev) => {
      const next = [...prev, node]
      saveUserNodes(next)
      return next
    })
  }, [])

  // ===== 跨组件同步：AI 助手「添加知识」入库后广播 knowledge:nodes-added =====
  // 复用既有渲染管线：setUserNodes → graph useMemo(buildUserGraph) → 指纹变化自动落位渲染
  useEffect(() => {
    const onNodesAdded = () => setUserNodes(loadUserNodes())
    window.addEventListener('knowledge:nodes-added', onNodesAdded)
    return () => window.removeEventListener('knowledge:nodes-added', onNodesAdded)
  }, [])

  // ===== 双画质档状态机：高清(HQ 点云+Bloom) / 流畅(lite 光晕贴图,低配版) =====
  // auto 档按设备探测落到具体档位（低端→流畅，其余→高清，卡顿由 PerfGuard 兜底）；
  // 高清/流畅为用户显式选择
  useEffect(() => {
    if (qualityPref === 'hq') setLiteMode(false)
    else if (qualityPref === 'lite') setLiteMode(true)
    else setLiteMode(detectLowEndDevice())
  }, [qualityPref])
  const hqMode = !liteMode

  // 手动切换偏好时持久化
  const changeQualityPref = useCallback((next) => {
    setQualityPref(next)
    writeQualityPref(next)
  }, [])

  // 运行时提示条（PerfGuard 自动降档提示等）
  const [notice, setNotice] = useState(null)
  const noticeTimer = useRef(null)
  const pushNotice = useCallback((text) => {
    setNotice(text)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 2800)
  }, [])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  // 数据管线（双轨）：演示模式 → 600 点示范数据（独立存储，只读）；
  // 用户模式 → localStorage 真实数据经「冷启动 + 渐进式生长」服务落位
  // （首个知识点在原点，后续围绕相关知识点生长，结果按指纹缓存）；
  // 没有任何知识点时 graph 为 null → 渲染零渲染空状态引导页
  const graph = useMemo(() => {
    if (viewMode === 'demo') return buildDemoGraph()
    if (data) return data
    return buildUserGraph(userNodes)
  }, [viewMode, userNodes, data])

  // 布局与索引只随图数据变化重算（一次性预计算，不逐帧跑）
  // 生长模式（内置 mock）：位置直接读取 graphGrowth 的持久化决策结果
  // 外部 data 模式：走 computeStarryLayout 星团布局兜底
  // graph 为 null（用户知识库零知识点）时产出空索引 —— 本组件随后的
  // 空状态分支会提前 return，不会走到渲染层，这里只为保证 hooks 安全
  const { layout, layoutMap, nodesById, adjacency, maxDegree } = useMemo(() => {
    const layoutResult = graph?.positions
      ? graph.nodes.map((nd) => {
          const p = graph.positions[nd.id] || [0, 0, 0]
          return { id: nd.id, pos: new THREE.Vector3(p[0], p[1], p[2]) }
        })
      : computeStarryLayout(graph?.nodes ?? [], graph?.links ?? [])
    const lmap = new Map(layoutResult.map((n) => [n.id, n.pos]))
    const byId = Object.fromEntries((graph?.nodes ?? []).map((n) => [n.id, n]))
    const adj = new Map()
    for (const n of graph?.nodes ?? []) adj.set(n.id, new Set())
    for (const l of graph?.links ?? []) {
      adj.get(l.source)?.add(l.target)
      adj.get(l.target)?.add(l.source)
    }
    let maxDeg = 1
    for (const s of adj.values()) maxDeg = Math.max(maxDeg, s.size)
    return { layout: layoutResult, layoutMap: lmap, nodesById: byId, adjacency: adj, maxDegree: maxDeg }
  }, [graph])

  // 相机基准距离（与下方 Canvas camera 初始 position 保持一致）。
  // 对称缩放：拉近/拉远各 4 倍 —— 修复此前 minDistance=14 / maxDistance=380 不对称
  //（老配置下放大可达约 12 倍而缩小仅约 2 倍）。
  const camBaseDist = graph && graph.nodes && graph.nodes.length < 8 ? 60 : 170

  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [showLabels, setShowLabels] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  // 类别过滤：null = 显示全部；点击底部图例高亮/过滤对应类别（只影响视觉，不影响布局）
  const [activeCategory, setActiveCategory] = useState(null)
  const toggleCategory = useCallback((catId) => {
    setActiveCategory((v) => (v === catId ? null : catId))
    setSelectedId(null)
  }, [])
  const controlsRef = useRef(null)

  // 区分「点击」与「拖拽旋转」：手指移动超过阈值后不再触发选中
  const pointerState = useRef({ downX: 0, downY: 0, moved: false })
  const onPointerDown = useCallback((e) => {
    pointerState.current = { downX: e.clientX, downY: e.clientY, moved: false }
  }, [])
  const onPointerMove = useCallback((e) => {
    const s = pointerState.current
    if (Math.hypot(e.clientX - s.downX, e.clientY - s.downY) > 10) s.moved = true
  }, [])
  const handleTapNode = useCallback((id) => {
    if (!pointerState.current.moved) setSelectedId(id)
  }, [])

  const selectedNode = selectedId ? nodesById[selectedId] : null
  const degreeOf = (id) => adjacency.get(id)?.size || 0

  // ===== WebGL 不可用降级 =====
  if (!canWebGL) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-slate-300 p-6">
        <span className="text-4xl mb-3">🧠</span>
        <p className="text-sm font-medium mb-1">当前设备不支持 WebGL</p>
        <p className="text-xs text-slate-500">3D 知识图谱需要 WebGL 支持，请升级系统 WebView 后重试</p>
      </div>
    )
  }

  // ===== 零渲染空状态：用户还没添加任何知识点（正式包安装后的默认形态） =====
  // 不挂 Canvas（零 GPU 负担），只渲染 CSS 星空 + 生长引导
  if (!graph) {
    return (
      <div className="relative h-full w-full bg-gradient-to-b from-[#0a1030] via-[#141b36] to-[#252b38] overflow-hidden">
        <EmptySky />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
          <div className="w-20 h-20 rounded-full bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-4xl mb-5 shadow-[0_0_40px_rgba(99,102,241,0.25)]">🧠</div>
          <h2 className="text-base font-bold text-indigo-100 mb-2">你的知识宇宙还是一片虚空</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-7">
            添加第一个知识点，它将诞生在宇宙中心；<br />
            之后每个新知识点都会自动生长在相关知识的附近，<br />
            逐渐织成属于你的知识星云
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={() => setAddModalOpen(true)}
              className="px-5 py-2.5 text-sm font-medium rounded-xl bg-indigo-500 text-white hover:bg-indigo-400 transition-colors shadow-lg shadow-indigo-500/25"
            >✨ 添加第一个知识点</button>
            <button
              onClick={() => setViewMode('demo')}
              className="px-5 py-2.5 text-sm rounded-xl bg-slate-800/80 border border-slate-600/50 text-slate-300 hover:text-slate-100 hover:border-slate-500 transition-colors"
            >🎬 观看演示图谱</button>
          </div>
        </div>
        {addModalOpen && (
          <AddKnowledgeModal
            onSave={(meta) => { addKnowledgePoint(meta); setAddModalOpen(false) }}
            onClose={() => setAddModalOpen(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className="relative h-full w-full bg-gradient-to-b from-[#0a1030] via-[#141b36] to-[#252b38] overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <Canvas
        key={viewMode} /* 视图切换强制重挂：相机按新图规模重新初始化 */
        dpr={liteMode ? 1 : [1, 2]} /* 流畅档锁 1 省 GPU；高清档上限 2 兼顾清晰度 */
        camera={{ position: graph.nodes.length < 8 ? [0, 14, 60] : [0, 20, 170], fov: 60, near: 0.5, far: 900 }}
        /* 知识点很少（刚起步）时相机拉近，第一颗星看得清 */
        gl={{ antialias: !liteMode, alpha: true, powerPreference: 'high-performance' }}
      >
        {/* 性能监测：连续两秒 <26fps 自动切入流畅模式（卸载 Bloom、启用光晕贴图、DPR 锁 1） */}
        <PerfGuard
          onLite={() => { setLiteMode(true); pushNotice('已自动切换流畅模式以保持顺滑') }}
        />

        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.7}
          zoomSpeed={0.9}
          minDistance={camBaseDist / 4}
          maxDistance={camBaseDist * 4}
          autoRotate={autoRotate}
          autoRotateSpeed={0.6}
          makeDefault
        />
        <GraphScene
          graph={graph}
          layout={layout}
          layoutMap={layoutMap}
          nodesById={nodesById}
          adjacency={adjacency}
          maxDegree={maxDegree}
          selectedId={selectedId}
          hoveredId={hoveredId}
          showLabels={showLabels}
          liteMode={liteMode}
          hqMode={hqMode}
          activeCat={activeCategory}
          onTapNode={handleTapNode}
          onHoverNode={setHoveredId}
        />

        {/* 真 Bloom 泛光（仅高清档；流畅档卸载，由节点光晕贴图替代） */}
        {hqMode && (
          <EffectComposer multisampling={0}>
            <Bloom
              intensity={1.22}
              luminanceThreshold={0.16}
              luminanceSmoothing={0.3}
              mipmapBlur
              radius={0.78}
            />
          </EffectComposer>
        )}
      </Canvas>

      {/* 运行时提示条（如「高画质已自动调低」），自动消失 */}
      {notice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-slate-900/85 border border-indigo-500/30 text-[11px] text-indigo-100 backdrop-blur pointer-events-none whitespace-nowrap">
          {notice}
        </div>
      )}

      {/* ===== HTML 覆盖 UI 层（不进 Canvas，文字清晰且可访问性友好） ===== */}

      {/* 顶部标题栏 + 工具按钮 */}
      <div className="absolute top-0 inset-x-0 p-3 flex items-start justify-between gap-3 pointer-events-none">
        <div className="bg-slate-900/60 backdrop-blur rounded-xl px-3 py-2 pointer-events-auto">
          <div className="text-sm font-bold text-indigo-100 flex items-center gap-1.5">
            🧠 知识宇宙
            {viewMode === 'demo' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-normal">演示</span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
            {viewMode === 'demo'
              ? '演示数据 · 成品形态示范'
              : `${graph.nodes.length} 个知识点 · ${graph.links.length} 条关联`}
            {!liteMode && <span className="text-fuchsia-300/90"> · 高画质</span>}
            {liteMode && <span className="text-amber-500/80"> · 流畅模式</span>}
            {activeCategory && (
              <span className="text-emerald-300/90"> · 筛选:{CATEGORY_MAP[activeCategory]?.name}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 items-end pointer-events-auto">
          {viewMode === 'user' && (
            <button
              onClick={() => setAddModalOpen(true)}
              title="添加一个知识点，它会自动生长在相关知识的附近"
              className="w-[62px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur bg-indigo-500/80 text-white hover:bg-indigo-400 transition-colors"
            >➕ 添加</button>
          )}
          {viewMode === 'demo' && (
            <button
              onClick={() => setViewMode('user')}
              title="退出演示，回到我的知识库"
              className="w-[62px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur bg-amber-500/80 text-white hover:bg-amber-400 transition-colors"
            >↩ 退出演示</button>
          )}
          <button
            onClick={() => changeQualityPref(cycleQualityPref(qualityPref))}
            title="画质档位：自动（按设备分档）/ 高清（点云+泛光）/ 流畅（低配省电）"
            className={`w-[62px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur transition-colors ${
              !liteMode ? 'bg-fuchsia-500/80 text-white' : 'bg-slate-900/60 text-slate-400'
            }`}
          >{qualityPref === 'auto' ? '⚙️ 自动' : qualityPref === 'hq' ? '✨ 高清' : '🍃 流畅'}</button>
          <button
            onClick={() => setShowLabels(v => !v)}
            className={`w-[62px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur transition-colors ${
              showLabels ? 'bg-indigo-500/80 text-white' : 'bg-slate-900/60 text-slate-400'
            }`}
          >🏷 标签</button>
          <button
            onClick={() => setAutoRotate(v => !v)}
            className={`w-[62px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur transition-colors ${
              autoRotate ? 'bg-indigo-500/80 text-white' : 'bg-slate-900/60 text-slate-400'
            }`}
          >🔄 旋转</button>
          <button
            onClick={() => { controlsRef.current?.reset(); setSelectedId(null); setActiveCategory(null) }}
            className="w-[62px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-900/60 backdrop-blur text-slate-400"
          >🎯 复位</button>
        </div>
      </div>

      {/* 底部类别图例：分类仅作过滤/高亮工具（再点一次取消），不是布局依据 */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 max-w-[52%]">
        {GRAPH_CATEGORIES.map(cat => {
          const active = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur transition-colors ${
                active ? 'text-white' : 'bg-slate-900/50 text-slate-400 hover:text-slate-200'
              }`}
              style={active ? { backgroundColor: `${cat.color}59`, boxShadow: `inset 0 0 8px ${cat.color}44` } : undefined}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              {cat.name}
            </button>
          )
        })}
        {activeCategory && (
          <button onClick={() => setActiveCategory(null)} className="text-[10px] text-indigo-300/90 self-center px-1">
            · 取消筛选 ✕
          </button>
        )}
      </div>

      {/* 选中节点详情卡 */}
      {selectedNode && (
        <div className="absolute bottom-3 right-3 left-3 sm:left-auto sm:w-64 bg-slate-900/85 backdrop-blur rounded-2xl border border-indigo-500/30 p-3.5 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CATEGORY_MAP[selectedNode.category]?.color }}
                />
                <span className="text-sm font-bold text-slate-100 truncate">{selectedNode.name}</span>
                {selectedNode.isHub && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/30 text-indigo-200 shrink-0">枢纽</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {CATEGORY_MAP[selectedNode.category]?.name} · {degreeOf(selectedNode.id)} 条关联
              </div>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="w-6 h-6 shrink-0 rounded-full bg-slate-700/70 text-slate-300 text-xs flex items-center justify-center"
            >✕</button>
          </div>
          {(adjacency.get(selectedNode.id)?.size || 0) > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700/60">
              <div className="text-[9px] text-slate-500 mb-1">关联知识点</div>
              <div className="flex flex-wrap gap-1">
                {[...adjacency.get(selectedNode.id)].slice(0, 8).map(nid => (
                  <button
                    key={nid}
                    onClick={() => setSelectedId(nid)}
                    className="px-1.5 py-0.5 rounded-md bg-slate-700/60 active:bg-indigo-600/50 text-[10px] text-slate-300 transition-colors"
                  >
                    {nodesById[nid]?.name || nid}
                  </button>
                ))}
                {adjacency.get(selectedNode.id).size > 8 && (
                  <span className="text-[10px] text-slate-500 self-center">…</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}




