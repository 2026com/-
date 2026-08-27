/**
 * 3D 知识图谱模拟数据生成器
 *
 * 数据格式对齐 3d-force-graph 的 nodes/links 结构：
 *   nodes: [{ id, name, category, size?, isHub?, val? }]
 *   links: [{ source, target }]
 *
 * 说明：
 *  - 使用固定种子的伪随机数（mulberry32），保证每次生成的图结构稳定，
 *    力导向布局不会在每次进入页面时跳动。
 *  - 后续接入真实 localStorage 存储时，只需让调用方传入同构的
 *    { nodes, links } 替换本文件的默认数据即可，组件无需改动。
 */

/** 六大知识类别（颜色对齐应用主题色板） */
export const GRAPH_CATEGORIES = [
  { id: 'cs', name: '编程开发', color: '#6366f1' },
  { id: 'math', name: '数学思维', color: '#06b6d4' },
  { id: 'cog', name: '认知科学', color: '#10b981' },
  { id: 'lang', name: '语言学习', color: '#f59e0b' },
  { id: 'art', name: '艺术设计', color: '#ef4444' },
  { id: 'biz', name: '商业思维', color: '#a855f7' },
]

/** 每个类别下的候选主题名（各 36 个，取前 LEAVES_PER_HUB 个作为叶子节点） */
const TOPIC_POOL = {
  cs: ['JavaScript', 'React', '算法与数据结构', '设计模式', 'TypeScript', '计算机网络',
       '浏览器原理', '前端工程化', '移动端开发', '数据库原理', '代码重构', '单元测试',
       '状态管理', 'Canvas 与 WebGL', 'CSS 布局体系', 'Node.js 后端', '微服务与容器',
       '云原生部署', 'HTTP 协议详解', 'Web 安全', '前端性能优化', '工程化与工具链',
       'Git 协作流', '自动化与 CI/CD', 'SSR 渲染原理', '响应式设计', '函数式编程',
       '并发与异步', '数据可视化', '调试与性能分析', '设计系统与组件库',
       'Service Worker 与 PWA', 'WebSocket 通信', '正则表达式', 'IndexedDB 存储', 'Three.js 3D 图形'],
  math: ['线性代数', '概率论', '微积分', '离散数学', '图论', '最优化理论',
         '统计推断', '数理逻辑', '博弈论', '复杂度分析', '数值计算', '拓扑入门',
         '复变函数', '实变函数', '抽象代数', '数论基础', '组合数学', '微分方程',
         '泛函分析', '随机过程', '贝叶斯统计', '回归分析', '时间序列', '矩阵分解',
         '凸优化', '特征值理论', '集合论基础', '线性规划', '傅里叶变换', '非欧几何',
         '数学归纳法', '大数定律', '信息论基础', '马尔可夫链', '蒙特卡洛方法', '机器学习数学基础'],
  cog: ['工作记忆', '元认知', '遗忘曲线', '刻意练习', '心流理论', '双编码理论',
        '注意力管理', '睡眠与记忆', '动机模型', '认知负荷', '习惯回路', '发散思维',
        '情绪调节', '思维模型', '批判性思维', '决策偏差', '锚定效应', '损失厌恶',
        '心理账户', '自我效能感', '目标设定理论', '延迟满足', '意志力储备', '认知休息',
        '冥想与正念', '大脑可塑性', '学习迁移', '专家直觉', '组块化学习', '双系统思维',
        '隐喻思维', '苏格拉底提问', '反馈机制', '复盘方法论', '多感官学习', '情境记忆'],
  lang: ['英语听力', '口语表达', '词根词缀', '语法体系', '沉浸式输入', '间隔重复',
         '影子跟读', '写作训练', '阅读理解', '发音矫正', '习语积累', '跨文化交际',
         '单词记忆法', '英英词典使用', '语感培养', '长难句分析', '同义替换技巧',
         '情景对话', '商务英语', '学术英语', '新闻听读', '电影跟练', '语音语调',
         '连读弱读', '词汇搭配', '介词辨析', '时态体系', '从句结构', '非谓语动词',
         '文化背景知识', '二语习得理论', '输出型学习法', '学习动机管理', '翻译入门',
         '应试策略', '多语言学习策略'],
  art: ['色彩理论', '版式设计', '构图法则', '用户体验', '交互原型', '品牌视觉',
        '插画基础', '三维建模', '动效设计', '字体排印', '摄影光影', '审美积累',
        '视觉层次', '网格系统', '图标设计', '信息图表', '界面规范', '移动端 UX',
        '用户研究', '可用性测试', '无障碍设计', '服务设计', '叙事设计', '游戏化设计',
        '交互动效', '插画风格', '素描基础', '线稿与构图', '色彩心理学', '光影关系',
        '后期处理', '视频剪辑', '创意方法', '产品视觉', '版式栅格', '品牌故事'],
  biz: ['第一性原理', '增长飞轮', '用户画像', '商业模式', '谈判技巧', '决策模型',
        '风险管理', '杠杆思维', '复利效应', '市场分析', '产品思维', '资源整合',
        '定位理论', '差异化竞争', '护城河分析', '定价策略', '成本结构', '现金流管理',
        '财务三大报表', '融资与估值', '精益创业', 'MVP 验证', '用户增长', '留存与召回',
        '转化率优化', '渠道投放', '品牌营销', '内容营销', '社群运营', '私域流量',
        '客户成功', '供应链管理', '组织管理', '激励机制', '战略制定', '危机公关'],
}

/** 类别间的语义桥梁（跨类链接，让图不是六个孤岛） */
const CATEGORY_BRIDGES = [
  ['cs', 'math'],   // 算法 ↔ 数学
  ['cs', 'art'],    // 交互原型 ↔ 用户体验
  ['cog', 'lang'],  // 记忆规律 ↔ 语言习得
  ['cog', 'biz'],   // 决策模型 ↔ 认知
  ['art', 'biz'],   // 品牌 ↔ 商业
  ['lang', 'art'],  // 表达 ↔ 审美
]

/** 固定种子伪随机（mulberry32），保证图结构可复现 */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 生成模拟知识图谱
 * @param {number} seed 随机种子
 * @returns {{ nodes: Array, links: Array }}
 */
export function buildMockGraph(seed = 20260826) {
  const rand = mulberry32(seed)
  const nodes = []
  const links = []
  const seenLinks = new Set() // 已存在的无向边（去重用）
  // V2 扩展：每类叶子由 11 → 33（约为原 3 倍），图谱更丰富饱满
  const LEAVES_PER_HUB = 33

  for (const cat of GRAPH_CATEGORIES) {
    // 类别中心枢纽节点
    const hubId = `hub-${cat.id}`
    nodes.push({
      id: hubId,
      name: cat.name,
      category: cat.id,
      size: 2.6,
      isHub: true,
      val: 10,
    })

    // 叶子知识点
    const pool = [...TOPIC_POOL[cat.id]]
    // 按 seeded rand 打乱，模拟真实存储的无序性
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const leafIds = []
    for (let i = 0; i < LEAVES_PER_HUB; i++) {
      const id = `${cat.id}-${i}`
      leafIds.push(id)
      nodes.push({
        id,
        name: pool[i],
        category: cat.id,
        size: 1,
        val: 1,
      })
      // value：关联强度 0~1，驱动连线粗细与亮度（枢纽→叶子为中强关联）
      links.push({ source: hubId, target: id, value: 0.45 + rand() * 0.3 })
    }

    // 类别内部交叉链接（约一半叶子有 1 条额外关联，形成网状结构）
    for (let i = 0; i < leafIds.length; i++) {
      if (rand() < 0.5) {
        let j = Math.floor(rand() * leafIds.length)
        if (j === i) j = (j + 1) % leafIds.length
        const key = [leafIds[i], leafIds[j]].sort().join('|')
        if (seenLinks.has(key)) continue // 去重：避免同一对节点生成两条线
        seenLinks.add(key)
        links.push({ source: leafIds[i], target: leafIds[j], value: 0.4 + rand() * 0.55 })
      }
    }
  }

  // 跨类别桥接：每对类别随机连一条 叶子↔叶子 或 枢纽↔枢纽（语义上多为强关联）
  const byCat = {}
  for (const n of nodes) {
    if (!n.isHub) (byCat[n.category] ||= []).push(n.id)
  }
  for (const [ca, cb] of CATEGORY_BRIDGES) {
    const la = byCat[ca], lb = byCat[cb]
    if (!la || !lb) continue
    links.push({
      source: la[Math.floor(rand() * la.length)],
      target: lb[Math.floor(rand() * lb.length)],
      value: 0.62 + rand() * 0.38,
    })
  }

  return { nodes, links }
}

/** 类别 id → 类别信息 快查表 */
export const CATEGORY_MAP = Object.fromEntries(
  GRAPH_CATEGORIES.map((c) => [c.id, c])
)
