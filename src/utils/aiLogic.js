import { AI_METHODS } from '../utils/constants.js'
import { chatCompletionJSON } from '../utils/aiClient.js'

/**
 * AI方法论匹配逻辑 V1.0（约束规则第4条：仅支持4种，不得新增）
 */
export function matchMethod(text = '') {
  const t = String(text)
  const scores = {}
  Object.values(AI_METHODS).forEach(m => {
    let s = 0
    m.match.forEach(kw => { if (t.includes(kw)) s += 2 })
    if (m.key === 'pomodoro' && /(分钟|每日|坚持|打卡|routine)/i.test(t)) s += 1
    if (m.key === 'feynman' && /(复盘|讲|输出|写|笔记)/i.test(t)) s += 1
    if (m.key === 'first_principle' && /(架构|底层|原理|为什么|本质)/i.test(t)) s += 1
    if (m.key === 'deliberate' && /(精通|大师|打磨|进阶|迭代)/i.test(t)) s += 1
    scores[m.key] = s
  })
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  const key = best && best[1] > 0 ? best[0] : 'pomodoro'
  return AI_METHODS[key] || AI_METHODS.POMODORO
}

/**
 * 生成单任务AI执行方案文本（V1 兼容保留）
 */
export function genExecutionPlan(node) {
  const method = matchMethod(node && node.title ? node.title : '') || AI_METHODS.POMODORO
  return `【推荐方法：${method.name}】
${method.desc}
建议单次时长：${method.singleTime}分钟，休息${method.restTime}分钟
执行步骤：
${method.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
}

// ========== P1：V5「三层嵌套执行方案」 ==========
// 生成入口：genFullRouteAI(aiConfig, node) -> Promise<FullRouteSchema>
// 成功走 LLM，失败自动 fallback 本地模板，保证 0 硬错
//
// FullRouteSchema（三层嵌套固定结构）：
// {
//   routeTitle:     "钢琴 完整学习路线",          // 方案标题
//   routeSubtitle:  "前期、中期、后期三个阶段，逐层进阶",  // 方案副标题
//   phases: [                                     // 第一层：3 个固定阶段
//     {
//       stage:      "early",                      // early/middle/late
//       phaseLabel: "前期",                       // 阶段名（固定为 前期/中期/后期，不可改）
//       nodeTitle:  "前期",                       // 阶段节点标题（固定同名）
//       days:       30,                           // 本阶段占用天数
//       steps: [                                  // 第二层：步骤节点（编号+名称+知识点数量）
//         {
//           num:      "第一步",                   // 步骤编号
//           name:     "计算机网络基础",            // 步骤名称
//           points:   21,                         // 知识点数量
//           items:    ["网络分层模型", "TCP/IP 协议", "DNS 与域名解析"],  // 第三层：知识点清单
//           advice:   "每天 2 小时，配合抓包工具实战巩固……",  // 第三层：学习建议 / 练习方向
//           standard: "完成阶段测试，正确率 ≥ 80%",           // 第三层：达成标准 / 考核方式
//         },
//         { num:"第二步", name:"XXX", points:N, items:[...], advice:"...", standard:"..." }
//       ]
//     },
//     { stage:"middle", phaseLabel:"中期", nodeTitle:"中期", days:60, steps:[...] },
//     { stage:"late",   phaseLabel:"后期", nodeTitle:"后期", days:30, steps:[...] }
//   ]
// }

// ---------- 中文序号（步骤编号：第一步/第二步…） ----------
const CN_NUMS = ['一','二','三','四','五','六','七','八','九','十']
const stepNumOf = (i) => `第${CN_NUMS[i] || (i + 1)}步`

// 洗牌（细节变化用：让每次生成"框架相同、细节不同"）
function shuffleArr(arr) {
  const a = Array.isArray(arr) ? arr.slice() : []
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- 模板快捷构造器 ----------
const STEP = (name, points, items, advice, standard) => ({ name, points, items, advice, standard })
const PHASE = (stage, days, steps) => ({
  stage,
  phaseLabel: ({ early: '前期', middle: '中期', late: '后期' })[stage] || '前期',
  nodeTitle:  ({ early: '前期', middle: '中期', late: '后期' })[stage] || '前期',
  days,
  steps,
})

const ROUTE_TEMPLATES = {
  piano: {
    match: ['钢琴','琴','乐器','吉他','小提琴','古筝','笛子','笛','萨克斯','二胡','口琴'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      PHASE('early', 30, [
        STEP('乐理基础与识谱', 12, [
          '五线谱与高低音谱号',
          '基本节奏型（全/二分/四分/八分音符）',
          'C大调音阶与主和弦',
          '节拍器与速度术语',
          '常见力度记号（强弱）',
          '常用音乐表情术语',
        ], '每天先花 15 分钟认谱与视唱，用《李重光乐理基础》配合节拍器 40-60BPM 练习。', '能独立识谱 8 小节无停顿；默写 C 大调音阶两个八度并稳定演奏。'),
        STEP('正确手型与基本功', 10, [
          '正确坐姿与手型',
          '五指独立性与手腕放松',
          '断奏与连奏',
          '哈农前 5 条练习',
          '踏板使用基础',
        ], '慢练 + 分手练习，每音对拍，错误小节单独重复 10 遍以上。', '连续 7 天打卡，哈农 1-5 条以 60BPM 稳定弹完。'),
        STEP('入门曲目演奏', 8, [
          '《小星星》《欢乐颂》《新年好》',
          '左右手配合',
          '简单强弱处理',
          '分段与合手练习',
        ], '分段练熟再合手，录视频回看纠正手型与节奏。', '2 首入门曲完整演奏 0 错误，并通过录音自评。'),
      ]),
      PHASE('middle', 60, [
        STEP('音阶琶音与转指', 15, [
          '转指/穿指/跨指',
          '12 个大调音阶',
          '三和弦与七和弦琶音',
          '同向与反向音阶',
          '速度阶梯训练',
        ], '每日音阶琶音 20 分钟，速度每 3 天提升 5BPM。', 'C 大调音阶 4 个八度 120BPM 稳定，琶音无停顿。'),
        STEP('完整曲目分段打磨', 12, [
          '分段练习法',
          '难点段落单独攻坚',
          '换段落衔接',
          '强弱与表情记号落实',
          '背谱方法',
        ], '把曲目分成 8 小节段落，难点段落单独练熟后再拼接。', '完整演奏 2~3 首曲目无停顿，带基本强弱处理。'),
        STEP('视奏与乐感培养', 10, [
          '每日视奏 1 页新谱',
          '乐句划分',
          '连奏与断句',
          '常见表情术语',
          '节拍稳定性',
        ], '每天视奏 1 页新谱，用节拍器控制速度，培养稳定节拍感。', '视奏 8 小节无停顿，节奏误差 < 5%。'),
      ]),
      PHASE('late', 30, [
        STEP('作品风格与细节处理', 10, [
          '作曲家风格理解',
          '触键变化与音色控制',
          'Rubato 自由速度',
          '踏板层次',
          '演奏版本对比分析',
        ], '听不同演奏版本对比，在谱面上标注处理记号。', '能讲出作品风格特点，并在演奏中体现 3 处以上细节处理。'),
        STEP('模拟演出与录像复盘', 8, [
          '全曲走台流程',
          '录像回看与自评',
          '错音应急补救',
          '舞台呼吸与仪态',
          '着装与登台礼仪',
        ], '每周 3 次模拟上台走台，全程录像并逐帧复盘。', '连续 3 次模拟演出零重大失误。'),
        STEP('公开演出与稳定输出', 6, [
          '脱稿表演',
          '观众互动',
          '紧张情绪调节',
          '代表作固定化',
        ], '安排一次家庭/小型公开演出，提前完整彩排。', '公开演出 1 次零重大失误，收到 3 条以上正向反馈。'),
      ]),
    ],
  },

  code: {
    match: ['编程','代码','开发','Python','JavaScript','Java','Go','C++','算法','前端','后端','软件','网络安全','漏洞','挖洞','黑客','渗透'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      PHASE('early', 30, [
        STEP('编程语言与开发环境', 18, [
          '变量/分支/循环/函数',
          '基本数据结构（数组/字典/列表）',
          '命令行基础与文件操作',
          'Git 提交三板斧（add/commit/push）',
          'IDE 与调试器使用',
          '依赖管理与虚拟环境',
        ], '每天 1 小时语法学习 + 10 道基础题，本地跑通 HelloWorld 并推送到 GitHub。', '能独立写 300 行以内逻辑代码，跑通本地测试并 Push 到远程仓库。'),
        STEP('网络与系统基础', 15, [
          'OSI 五层模型',
          'TCP/IP 协议族',
          'HTTP 请求与响应',
          'DNS 与域名解析',
          'Linux 常用命令',
          '进程、端口与权限',
        ], '用抓包工具观察 HTTP 请求，亲手搭建一个本地 Web 服务。', '能画出数据包从浏览器到服务器的完整路径，并用命令行排查常见问题。'),
        STEP('安全入门与靶场环境', 12, [
          '常见漏洞分类（OWASP Top 10）',
          'CIA 信息安全三要素',
          '渗透测试标准流程',
          '靶场搭建（DVWA 等）',
          '信息收集基础',
        ], '在本地靶场（DVWA）练习，严格禁止在未授权目标上测试。', '独立搭建靶场环境，并完成至少 3 个入门漏洞的验证。'),
      ]),
      PHASE('middle', 60, [
        STEP('Web 安全核心漏洞', 20, [
          'SQL 注入',
          'XSS 跨站脚本',
          'CSRF 跨站请求伪造',
          'SSRF 服务端请求伪造',
          '文件上传漏洞',
          '认证与会话绕过',
        ], '每个漏洞先在靶场做原理实验，再写一份漏洞分析笔记（含修复方案）。', '在靶场独立复现 6 类常见漏洞，并能说出对应的修复方案。'),
        STEP('实战工具与技能', 18, [
          '信息收集（子域/端口/指纹识别）',
          'Burp Suite 抓包与改包',
          '漏洞验证与利用',
          'WAF 绕过基础',
          '日志分析与溯源',
        ], '用 Burp Suite 完成一次「信息收集 → 漏洞确认」的完整流程。', '独立完成一次靶场全流程渗透测试，并输出测试报告。'),
        STEP('编程进阶与自动化', 15, [
          '异步与并发',
          'OOP 与设计模式基础',
          'SQL 与数据库操作',
          'REST API 设计',
          '自动化脚本编写',
        ], '用 Python 编写一个自动信息收集小工具，复用现有成熟库。', '完成一个 CRUD 完整项目，并编写至少 3 个可复用的自动化脚本。'),
      ]),
      PHASE('late', 30, [
        STEP('综合渗透与提权', 16, [
          '综合靶场渗透（VulnHub 等）',
          'Linux/Windows 提权基础',
          '内网横向移动基础',
          '渗透测试报告编写',
          '痕迹清理与免杀概念',
        ], '在综合靶场完成全流程实战，从信息收集到提权再到出报告。', '独立拿下 2 个综合靶场，并提交规范化的渗透测试报告。'),
        STEP('安全加固与防御', 12, [
          '漏洞修复建议（输入过滤/参数化查询）',
          '安全配置基线',
          'WAF 与防护策略',
          'CVE 分析与应急响应',
        ], '选取真实 CVE 撰写分析文档，并给出对应的加固建议。', '能对已知漏洞写出完整的修复与加固方案。'),
        STEP('输出与复盘', 8, [
          '漏洞报告编写',
          '技术博客写作',
          '开源贡献（PR/issue）',
          '个人作品集整理',
        ], '每周发布 1 篇技术笔记，把实战经验沉淀成文章。', '公开发布 2 篇以上技术文章，作品集可完整展示学习成果。'),
      ]),
    ],
  },

  fitness: {
    match: ['健身','减脂','增肌','减肥','跑步','运动','体能','体态'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      PHASE('early', 21, [
        STEP('体测与运动基础', 12, [
          '身体指标体测（体重/体脂/围度）',
          '正确呼吸法',
          '深蹲/硬拉/卧推动作模式',
          '心率区间 1-2 与佩戴',
          '睡眠与作息管理',
        ], '先做体测记录基线，每周 3 次 30 分钟低强度有氧 + 1 次动作模式课。', '连续 3 周打卡率 > 90%，基础动作模式达到标准。'),
        STEP('热身与关节灵活性', 8, [
          '动态热身流程',
          '关节活动度训练',
          '泡沫轴放松',
          '静态拉伸基础',
        ], '每次训练前 5 分钟动态热身，训练后 10 分钟拉伸放松。', '能独立编排一套 5 分钟热身流程并坚持执行。'),
        STEP('有氧与习惯养成', 9, [
          '快走/椭圆机/慢跑',
          '心率带使用',
          '运动日志记录',
          '每日步数目标',
        ], '每周 3 次 30 分钟有氧，用运动日志记录打卡。', '连续 21 天打卡，静息心率下降 5-10。'),
      ]),
      PHASE('middle', 60, [
        STEP('力量训练分化', 15, [
          '推/拉/腿/核心分化训练',
          '渐进超负荷原则',
          '组数与次数区间',
          '动作变式',
          '三大项技术（深蹲/卧推/硬拉）',
        ], '每周 3-4 次分化训练，训练量每周递增 2.5%。', '三大项技术成型，重量较前期提升 30%。'),
        STEP('营养与恢复', 12, [
          '蛋白质/碳水/脂肪配比',
          '热量管理',
          '补剂选择',
          '训练后恢复',
          '睡眠管理',
        ], '记录饮食一周，按目标方向调整三大营养素配比。', '体脂下降 5% 或肌肉量增加 3kg（按目标方向）。'),
        STEP('有氧进阶与体能', 10, [
          '间歇训练',
          '爬坡/变速跑',
          '核心稳定性',
          '心肺耐力提升',
        ], '每周 2 次有氧进阶训练，逐步增加强度。', '完成一次 5 公里跑或等效体能挑战。'),
      ]),
      PHASE('late', 30, [
        STEP('周期化与平台期突破', 10, [
          '减量周/冲量周安排',
          '动作微调与变式',
          '突破平台期策略',
          '训练状态管理',
        ], '按周期化安排训练，平台期及时更换动作变式。', '三大项持续提升或体成分持续改善。'),
        STEP('趣味运动与生活融入', 8, [
          '球类/骑行/登山',
          '出差便携训练清单',
          '家庭训练方案',
          '户外活动安排',
        ], '每周 1 次趣味运动保持热情，建立生活化运动习惯。', '外出旅行仍保持 80% 以上训练习惯。'),
        STEP('长期维持与监测', 6, [
          '月度体测与拍照存档',
          '打卡社群互相监督',
          '习惯固化',
          '年度目标复盘',
        ], '每月 1 次体测 + 拍照存档，公开打卡获得正向反馈。', '连续 3 个月指标波动 < 5%。'),
      ]),
    ],
  },

  language: {
    match: ['英语','雅思','托福','日语','韩语','法语','语言','单词','口语','听力'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      PHASE('early', 30, [
        STEP('发音与音标', 12, [
          '国际音标/假名/字母发音',
          '重音与语调',
          '连读与弱读',
          '影子跟读训练',
          '录音对比自查',
        ], '每天 30 分钟发音训练 + 影子跟读，录音与标准发音对比。', '音标全部掌握，跟读 10 分钟无明显发音错误。'),
        STEP('词汇与语法体系', 18, [
          '词根词缀法',
          '高频核心 1000 词',
          '基础时态与语态',
          '简单从句结构',
          '艾宾浩斯复习计划',
          'Anki 卡组制作',
        ], '每日单词 100 个（30 新 + 70 复习），用 Anki 安排复习。', '单词量累计 2000+，语法基础题正确率 ≥ 70%。'),
        STEP('听力入门', 10, [
          '精听训练法',
          'BBC 6 Minute English',
          '动画片无字幕听力',
          '听写方法',
        ], '每天精听 1 篇，先泛听再精听再对照文本查漏。', '日常对话能听懂大意 80%。'),
      ]),
      PHASE('middle', 60, [
        STEP('听力与输入强化', 15, [
          '外刊精读（Economist 等）',
          '播客泛听',
          '精听/复述',
          '话题语料积累',
        ], '每日精听 30 分钟 + 外刊精读 1 篇。', '听力达到雅思 6.0 同等水平，长文理解 80%+。'),
        STEP('口语实战', 12, [
          '外教 1V1 对话',
          '话题语料库',
          '开口不卡壳训练',
          '语音语调纠正',
        ], '每周 2 次外教口语课，录音回听复盘。', '口语 Part 2 不卡壳 2 分钟，日常交流 25 分钟。'),
        STEP('写作输出', 10, [
          '作文高分句型',
          '结构模板',
          '图表作文',
          '批改与修正',
        ], '每周 1 篇大作文 + 批改，背诵高分句型。', '作文结构完整，语法错误 < 3 处。'),
      ]),
      PHASE('late', 30, [
        STEP('母语化表达', 10, [
          '地道搭配与习语',
          '文化背景知识',
          '演讲结构',
          '长段表达连贯性',
        ], '每日全英文环境 1 小时，多接触母语者内容。', '表达接近母语连贯度，长段演讲不卡壳。'),
        STEP('公开发布与检验', 8, [
          '英文 vlog 制作',
          '公开演讲',
          '深度书评写作',
          '社群交流',
        ], '每周 1 次公开发布（视频/作文/演讲）。', '完成 1 次 15 分钟英文公开演讲并获正向反馈。'),
        STEP('长期保持', 6, [
          '每日坚持计划',
          '英语角/语伴',
          '月度目标复盘',
        ], '建立每日固定输入输出习惯，加入语伴社群。', '连续 30 天每日英语学习打卡。'),
      ]),
    ],
  },

  exam: {
    match: ['考试','考研','考证','备考','公务员','司法','CPA','高考','中考'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      PHASE('early', 60, [
        STEP('考纲与教材全覆盖', 18, [
          '官方考纲解读',
          '教材章节系统学习',
          '课后习题练习',
          '章节思维导图',
          '知识体系搭建',
        ], '每章读完画思维导图并做课后题，保证考纲知识点逐一覆盖。', '考纲覆盖率 ≥ 90%，基础题正确率 ≥ 70%。'),
        STEP('背诵与记忆方法', 12, [
          '艾宾浩斯复习法',
          'Anki 卡组制作',
          '口诀记忆',
          '输出式背诵',
        ], '每天安排背诵 + 复习，用 Anki 自动安排复习计划。', '高频考点默写正确率 ≥ 90%。'),
        STEP('错题本系统', 10, [
          '错题记录规范',
          '错因分类（概念/计算/粗心）',
          '知识点定位',
          '定期复盘',
        ], '每道错题记录错因 + 知识点定位，每周复盘一次。', '错题本覆盖全部错题，同类错题不再犯。'),
      ]),
      PHASE('middle', 60, [
        STEP('真题掐表训练', 15, [
          '真题套卷练习',
          '时间分配策略',
          '答题顺序',
          '涂卡规范',
        ], '每周 2 套真题掐表，严格模拟真实考场节奏。', '连续 3 套真题达到目标分 ± 5%。'),
        STEP('专题专项突破', 12, [
          '弱项章节锁定',
          '高频考点归纳',
          '专项题集',
          '应试策略底线',
        ], '按错题统计锁定弱项专题，集中火力突破。', '弱项专题正确率 ≥ 60%。'),
        STEP('真题错题二刷三刷', 10, [
          '错题重做',
          '同考点变式训练',
          '知识串联',
        ], '错题 3 刷以上，同考点找 3 道变式巩固。', '错题二刷正确率 ≥ 85%。'),
      ]),
      PHASE('late', 20, [
        STEP('全真模考', 10, [
          '每日模考套卷',
          '考场流程模拟',
          '作息调整',
          '答题卡规范',
        ], '考前每天 1 套模考，严格同步考试日作息。', '模拟考稳定在目标线上 10%。'),
        STEP('冲刺与心理调节', 8, [
          '押题重点梳理',
          '紧张情绪调节',
          '深呼吸法',
          '考前睡眠管理',
        ], '最后一周不学新内容，保持手感 + 调整心态。', '考前一周睡眠 ≥ 7 小时/天，心态平稳。'),
        STEP('考场策略', 6, [
          '时间分配预案',
          '难题取舍',
          '检查顺序',
        ], '考前写好考场时间分配与难题取舍预案。', '走进考场不慌，稳定发挥平时水平。'),
      ]),
    ],
  },

  default: {
    match: ['__default__'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      PHASE('early', 30, [
        STEP('全景认知与入门', 12, [
          '核心概念与定义',
          '常用术语表',
          '入门路径 3 条',
          '资料筛选与书单',
          '全景知识地图',
        ], '先画一张全景知识地图，精选 3 本入门资料，避免资料焦虑。', '能用大白话讲清目标是什么、应该怎么学。'),
        STEP('基础技能训练', 10, [
          '每日 30-45 分钟练习',
          '基础动作/步骤分解',
          '常见踩坑清单',
          '练习进度记录',
        ], '每天固定时间练习并记录进度，做减法聚焦。', '完成 3 个入门项目/练习并全部跑通。'),
        STEP('输出与反馈', 8, [
          '费曼学习法输出',
          '笔记整理',
          '向朋友讲解',
        ], '每周写 1 篇笔记并向他人讲解一次，暴露知识盲区。', '输出 3 篇入门笔记并全部公开发布。'),
      ]),
      PHASE('middle', 60, [
        STEP('能力进阶', 15, [
          '综合题训练',
          '跨模块组合',
          '异常排查方法',
          '标准产出流程',
        ], '每周 1 个中型项目 + 1 个薄弱专项，先画架构再动手。', '独立完成 5 个以上完整作品/项目。'),
        STEP('专项攻坚', 12, [
          '薄弱环节锁定',
          '深度钻研',
          '案例复盘',
        ], '锁定 2 个薄弱点集中训练，每个项目做「低配版→高配版」两版。', '薄弱专项完成度提升 20%。'),
        STEP('复盘迭代', 10, [
          '每日复盘',
          '周复盘',
          '数据量化',
          '坑记录',
        ], '每日 10 分钟复盘，每周 30 分钟深度复盘，量化对比。', '连续 4 周周复盘，形成迭代记录。'),
      ]),
      PHASE('late', 30, [
        STEP('作品打磨', 10, [
          '细节打磨',
          '个人风格识别',
          '高配版迭代',
          '作品集整理',
        ], '每个作品打磨 2 个版本，注重可展示成果。', '作品集 ≥ 3 件高质量内容。'),
        STEP('外部反馈', 8, [
          '高手点评',
          '公开分享',
          '社群交流',
        ], '请 2 位以上高手点评并落地建议。', '高手点评建议落地至少 3 条优化。'),
        STEP('长期输出', 6, [
          '定期发布',
          '复利化输出',
          '习惯固化',
        ], '每月固定输出 1 次，加入同好社群互相激励。', '形成稳定产出能力，作品集可对外展示。'),
      ]),
    ],
  }
}

// ---------- 模板匹配 ----------
function matchRouteTemplate(title='') {
  const t = String(title)
  const keys = Object.keys(ROUTE_TEMPLATES).filter(k=>k!=='default')
  for (const k of keys) {
    if (ROUTE_TEMPLATES[k].match.some(kw=>t.includes(kw))) return ROUTE_TEMPLATES[k]
  }
  return ROUTE_TEMPLATES.default
}

/** ---------- 本地纯模板 fallback（三层嵌套执行方案 schema） ---------- */
export function genFullRoute(node) {
  const title = node?.title ?? '未命名目标'
  const tpl = matchRouteTemplate(title)
  const routeTitle = (typeof tpl.title === 'function') ? tpl.title(title) : `${title} 完整学习路线`
  return {
    routeTitle,
    routeSubtitle: '前期、中期、后期三个阶段，逐层进阶',
    phases: (tpl.phases || []).map(p => ({
      phaseLabel: p.phaseLabel,
      stage:      p.stage,
      nodeTitle:  p.nodeTitle,
      days:       Number(p.days) || 30,
      // 步骤节点：框架固定（3 阶段），细节每次略有不同（每阶段 2~4 个步骤、条目顺序随机）
      steps: (() => {
        const list = Array.isArray(p.steps) ? p.steps : []
        const cnt = Math.min(list.length, 2 + Math.floor(Math.random() * Math.max(1, list.length - 1)))
        return shuffleArr(list).slice(0, cnt).map((s, j) => ({
          num:      s.num || stepNumOf(j),
          name:     String(s.name || ''),
          points:   Math.max(0, Number(s.points) || (Array.isArray(s.items) ? s.items.length : 0) || 0),
          items:    Array.isArray(s.items) ? shuffleArr(s.items).map(String) : [],
          advice:   String(s.advice || ''),
          standard: String(s.standard || ''),
        }))
      })(),
    })),
  }
}

/** ---------- 步骤节点详细内容（知识点清单 / 学习建议 / 达成标准）的本地兜底 ---------- */
function genStepDetailsFallback(node, parentTitle) {
  const title = String(node?.title || '')
  // 去掉「第一步 / （N个知识点）」等前缀后缀，得到干净的步骤名
  const clean = title
    .replace(/^第[一二三四五六七八九十百]+步\s*/, '')
    .replace(/[（(]\d+\s*个知识点[）)]$/, '')
    .replace(/^\s*[\u{1F300}-\u{1FAFF}📍💡🏁📚]\s*/u, '')
    .trim() || '本步骤'
  return {
    items: [
      `${clean} 核心概念与定义`,
      `${clean} 常用术语与关键词`,
      `${clean} 基础原理与运作机制`,
      `${clean} 常用工具与实操方法`,
      `${clean} 典型应用场景`,
      `${clean} 常见误区与注意事项`,
    ],
    advice: `每天安排固定时间学习「${clean}」，先理解概念再动手练习；每完成一个知识点就做一次小练习巩固，遇到不懂的及时查资料或请教他人。`,
    standard: `能独立向他人讲解「${clean}」的核心内容，并完成该步骤的配套练习，正确率达到 80% 以上，即视为通过本步骤考核。`,
  }
}

/** 阶段节点 → 生成该阶段下的步骤节点（本地兜底） */
function genPhaseStepsFallback(node, parentTitle) {
  const title = String(node?.title || '')
  const clean = title.replace(/^第[一二三四五六七八九十百]+步\s*/, '').replace(/^\s*[\u{1F300}-\u{1FAFF}]\s*/u, '').trim() || parentTitle || '本阶段'
  return [
    { name: `${clean} 入门基础`, points: 12 },
    { name: `${clean} 核心知识`, points: 18 },
    { name: `${clean} 实战练习`, points: 10 },
  ]
}

/** ---------- 步骤节点详细内容（第三层）：知识点清单 / 学习建议 / 达成标准 ---------- */
export function genChildAtomicSteps(node, parentTitle) {
  // 兼容旧语义名称：现在返回「步骤详情」结构 { items, advice, standard }
  return genStepDetailsFallback(node, parentTitle)
}

/** 阶段节点 → 该阶段下的步骤节点（第二层，本地兜底） */
export function genPhaseSteps(node, parentTitle) {
  return genPhaseStepsFallback(node, parentTitle)
}

export function isParentLevelNode(node) {
  if (!node) return true
  return node.parentId == null || (node.level ?? 0) === 0
}

// ---------- P1: LLM 三层嵌套执行方案 ----------
function parseRouteJSON(data, fallbackGen) {
  const fb = fallbackGen()
  if (!data || typeof data !== 'object') return fb
  const phases = Array.isArray(data.phases) ? data.phases : (Array.isArray(data.stages)?data.stages:[])
  const keys = ['early','middle','late']
  const labels = ['前期','中期','后期']
  const normStep = (raw, j) => {
    const o = raw && typeof raw === 'object' ? raw : {}
    const name = String(o.name || o.stepName || o.title || '')
    const ptMatch = typeof o.points === 'number' ? null : String(o.points || o.count || o.knowledgeCount || '').match(/\d+/)
    const points = typeof o.points === 'number' ? o.points : (ptMatch ? Number(ptMatch[0]) : 0)
    const items = Array.isArray(o.items) ? o.items.map(x => String(x))
      : (Array.isArray(o.knowledgePoints) ? o.knowledgePoints.map(x => String(x)) : [])
    return {
      num:      String(o.num || o.stepNum || o.no || stepNumOf(j)),
      name:     name || `学习内容${j + 1}`,
      points:   points || items.length || 8,
      items,
      advice:   String(o.advice || o.suggestion || o.learningAdvice || o.practice || ''),
      standard: String(o.standard || o.assessment || o.acceptance || o.achieve || ''),
    }
  }
  const normPhase = (raw, i) => {
    const o = raw && typeof raw === 'object' ? raw : {}
    return {
      phaseLabel: String(o.phaseLabel || o.label || o.phase || labels[i] || labels[2]),
      stage:      String(o.stage || o.stagePhase || keys[i] || keys[2]),
      nodeTitle:  String(o.nodeTitle || o.name || o.title || labels[i] || '阶段'),
      days:       Math.max(1, Number(o.days || o.duration || 30)),
      steps:      Array.isArray(o.steps) ? o.steps.map(normStep) : [],
    }
  }
  return {
    routeTitle:    String(data.routeTitle || data.title || fb.routeTitle),
    routeSubtitle: String(data.routeSubtitle || data.subtitle || fb.routeSubtitle),
    phases:        [0,1,2].map(i => {
      const p = normPhase(phases[i], i)
      // 阶段名固定为 前期/中期/后期（约束条件 1）
      p.phaseLabel = labels[i] || '前期'
      p.nodeTitle  = labels[i] || '前期'
      return p
    }),
    finalFlag: String(data.finalFlag || data.flag || data.destination || fb.finalFlag || '可独立达成目标'),
    mantra:    Array.isArray(data.mantra) ? data.mantra.slice(0,6) : [],
  }
}

/** 父级节点 AI 生成：P1 V4 按「参考照片同款」横向路线图生成完整路线对象 */
export async function genFullRouteAI(aiConfig, node) {
  const safeTitle = String(node?.title || '未命名目标').slice(0,60)
  const fallbackFn = () => genFullRoute(node)
  if (!aiConfig?.baseUrl || !aiConfig?.apiKey || !aiConfig?.modelId) {
    return fallbackFn()
  }
  const messages = [
    {
      role:'system',
      content:`你是「长期目标执行方案规划师」，只输出严格合法 JSON，不要 Markdown/解释/编号。
【输出结构（三层嵌套，严格固定）】：
{
  "routeTitle":    "【目标名】完整学习路线",
  "routeSubtitle": "前期、中期、后期三个阶段，逐层进阶",
  "phases": [
    {
      "stage": "early", "phaseLabel": "前期", "nodeTitle": "前期", "days": 30,
      "steps": [
        { "num": "第一步", "name": "XXX", "points": 21,
          "items": ["知识点1", "知识点2", "知识点3", "知识点4"],
          "advice": "学习建议或练习方向",
          "standard": "达成标准或考核方式" }
      ]
    },
    { "stage": "middle", "phaseLabel": "中期", "nodeTitle": "中期", "days": 60,
      "steps": [ { "num": "第一步", "name": "XXX", "points": 21, "items": [...], "advice": "...", "standard": "..." } ] },
    { "stage": "late", "phaseLabel": "后期", "nodeTitle": "后期", "days": 30,
      "steps": [ { "num": "第一步", "name": "XXX", "points": 21, "items": [...], "advice": "...", "standard": "..." } ] }
  ]
}
【硬性要求】：
1. phases 必须恰好 3 项，阶段名固定为「前期」「中期」「后期」，顺序不可变、不可改名；
2. 每个阶段 steps 包含 3~5 个步骤节点，按编号从小到大排列（第一步→第二步→第三步…）；
3. 每个步骤必须包含：num（步骤编号，如"第一步"）、name（步骤名称）、points（知识点数量，整数）；
4. 每个步骤必须包含第三层详细内容：items（知识点清单，4~8 个具体概念/技能点）、advice（学习建议或练习方向）、standard（达成标准或考核方式）；
5. 全部内容用中文，具体可落地，逻辑递进自然。`
    },
    { role:'user', content:`我的长期目标是：《${safeTitle}》。请输出「三层嵌套执行方案」JSON：3 个固定阶段（前期/中期/后期），每阶段下若干步骤节点（编号+名称+知识点数量），每步骤下含知识点清单、学习建议、达成标准。严格按照上述结构，不要多不要少。` }
  ]
  try {
    const { data } = await chatCompletionJSON(aiConfig, messages, {
      temperature:0.42, timeoutMs:25000, maxTokens:2400,
      fallbackParser:(plain)=>{
        // 简易 fallback：从文本中按关键字抽取字段，最后交给 parseRouteJSON 兜底
        const s = String(plain || '')
        const clean = (k) => {
          const m = s.match(new RegExp(`"${k}"\\s*[:：]\\s*"([^"]{1,80})"`,'i'))
          return m ? m[1] : ''
        }
        const finalFlag = clean('finalFlag') || clean('flag') || '可独立达成目标'
        const routeTitle = clean('routeTitle') || clean('title') || `${safeTitle} 完整学习路线`
        const routeSubtitle = clean('routeSubtitle') || clean('subtitle') || '前期、中期、后期三个阶段，逐层进阶'
        return { routeTitle, routeSubtitle, phases: [], finalFlag, mantra: [] }
      }
    })
    return parseRouteJSON(data, fallbackFn)
  } catch (_) {
    return fallbackFn()
  }
}

// ---------- 步骤节点 → 详细内容（第三层）AI 生成：知识点清单 / 学习建议 / 达成标准 ----------
export async function genChildAtomicStepsAI(aiConfig, node, parentTitle='') {
  const safeTitle = String(node?.title||'').slice(0,60)
  const safeParent = String(parentTitle||'').slice(0,60)
  const fallbackFn = () => genChildAtomicSteps(node, parentTitle)
  if (!aiConfig?.baseUrl || !aiConfig?.apiKey || !aiConfig?.modelId) return fallbackFn()
  const messages = [
    { role:'system', content:`你是「学习步骤详情规划师」，只输出严格合法 JSON，不要 Markdown/解释。
输出结构：{ "items": ["知识点A","知识点B","知识点C","知识点D"], "advice": "学习建议或练习方向", "standard": "达成标准或考核方式" }
要求：
1. items 是知识点清单，4~8 个具体概念/技能点，中文，每个 4~20 字；
2. advice 是学习建议或练习方向，一段话 20~60 字，具体可落地；
3. standard 是达成标准或考核方式，一段话 20~60 字，尽量包含可量化指标（如正确率/时长/次数）。`
    },
    { role:'user', content:`当前步骤：《${safeTitle||'本步骤'}》\n所属阶段：《${safeParent||'—'}》\n请输出该步骤的详细内容（知识点清单 + 学习建议 + 达成标准），严格 JSON 返回 { items: string[], advice: string, standard: string }。` }
  ]
  try {
    const { data } = await chatCompletionJSON(aiConfig, messages, {
      temperature:0.45, timeoutMs:25000, maxTokens:1200,
      fallbackParser:(plain)=>fallbackFn()
    })
    const o = data && typeof data === 'object' ? data : {}
    const items = Array.isArray(o.items) ? o.items.map(x => String(x)).filter(Boolean)
      : (Array.isArray(o.knowledgePoints) ? o.knowledgePoints.map(x => String(x)).filter(Boolean) : [])
    const out = {
      items: items.slice(0, 10),
      advice: String(o.advice || o.suggestion || ''),
      standard: String(o.standard || o.assessment || ''),
    }
    // 兜底：缺字段用本地模板补齐
    const fb = fallbackFn()
    if (!out.items.length) out.items = fb.items
    if (!out.advice) out.advice = fb.advice
    if (!out.standard) out.standard = fb.standard
    return out
  } catch (_) {
    return fallbackFn()
  }
}

// ---------- 阶段节点 → 步骤节点（第二层）AI 生成：编号 + 名称 + 知识点数量 ----------
export async function genPhaseStepsAI(aiConfig, node, parentTitle='') {
  const safeTitle = String(node?.title||'').slice(0,60)
  const safeParent = String(parentTitle||'').slice(0,60)
  const fallbackFn = () => genPhaseSteps(node, parentTitle)
  if (!aiConfig?.baseUrl || !aiConfig?.apiKey || !aiConfig?.modelId) return fallbackFn()
  const messages = [
    { role:'system', content:`你是「学习阶段步骤规划师」，只输出严格合法 JSON，不要 Markdown/解释。
输出结构：{ "steps": [ { "name": "XXX", "points": 21 }, { "name": "YYY", "points": 18 } ] }
要求：
1. steps 3~5 个，按学习顺序排列（第一步→第二步→第三步…，编号由前端自动补）；
2. 每个步骤必须包含 name（步骤名称，中文）和 points（知识点数量，正整数）；
3. 全部内容针对该阶段的具体学习内容，具体可落地。`
    },
    { role:'user', content:`当前阶段：《${safeTitle||'本阶段'}》\n所属目标：《${safeParent||'—'}》\n请输出该阶段下的 3~5 个步骤节点，严格 JSON 返回 { steps: [{ name: string, points: number }] }。` }
  ]
  try {
    const { data } = await chatCompletionJSON(aiConfig, messages, {
      temperature:0.45, timeoutMs:25000, maxTokens:1000,
      fallbackParser:(plain)=>fallbackFn()
    })
    let arr = []
    if (Array.isArray(data)) arr = data
    else if (data && Array.isArray(data.steps)) arr = data.steps
    const out = []
    arr.forEach(x => {
      if (x == null) return
      const o = typeof x === 'string' ? { name: x } : (x && typeof x === 'object' ? x : {})
      const name = String(o.name || o.title || (typeof x === 'string' ? x : '')).trim()
      if (!name) return
      const m = String(o.points ?? '').match(/\d+/)
      out.push({ name, points: m ? Number(m[0]) : 8 })
    })
    const fb = fallbackFn()
    while (out.length < 3 && fb.length) out.push(fb[out.length % fb.length])
    if (out.length > 5) out.length = 5
    return out
  } catch (_) {
    return fallbackFn()
  }
}

// 旧 API 别名：兼容 T3 以前的调用（保持历史逻辑不崩）
export function genParentFramework(/*node*/) { throw new Error('genParentFramework 已废弃，请改用 genFullRoute / genFullRouteAI') }
export async function genParentFrameworkAI(/*aiConfig, node*/) { throw new Error('genParentFrameworkAI 已废弃，请改用 genFullRouteAI') }

/** 解析用户AI指令（兼容保留） */
export function parseAICommand(text) {
  const t = String(text).toLowerCase()
  if (/生成.*月度复盘|月度.*复盘/.test(t)) return { action: 'review_monthly' }
  if (/生成.*年度复盘|年度.*复盘/.test(t)) return { action: 'review_yearly' }
  if (/拆解|拆分|分解|规划路径|学习路线/.test(t)) return { action: 'decompose' }
  if (/方法|方案|怎么学|学习法/.test(t)) return { action: 'method' }
  return { action: 'chat' }
}

export function generateMonthlyReview(data) {
  const { completeRate, totalHours, streak, topDomain, weakDomain } = data
  return `## 📅 月度成长复盘报告
### 一、核心成果摘要
1. 本月任务完成率 **${completeRate}%**，较上月${completeRate >= 60 ? '稳步提升' : '有较大改善空间'}
2. 累计投入有效学习时间 **${totalHours}小时**
3. 最长连续打卡 **${streak}天**，意志力韧性表现${streak >= 15 ? '优异' : '良好'}

### 二、六大能力雷达分析
- 优势领域：${topDomain}（持续投入，形成正向飞轮）
- 短板领域：${weakDomain}（下月建议倾斜20%时间资源）

### 三、未完成任务根因归类
1. 时间预估偏差占 38% — 建议后续采用AI自动校准
2. 优先级冲突占 27% — 七大系统归类优化后可缓解
3. 精力低谷误排 占 20% — 番茄钟休息间隔需遵守

### 四、下月落地优化方案
1. 将${weakDomain}任务优先安排在精力峰值时段（早8-10点）
2. 每日固定复盘窗口，启用番茄工作法锁（APP内计时）
3. 周维度检视七大系统投入均衡度，避免单系统过载`
}
export function generateYearlyReview(data) {
  return `## 🎯 年度成长全景复盘
### 里程碑
2026年度整体完成率${data.yearRate}%，有效投入${data.totalHours}小时。

### 能力演化
六大能力维度中「${data.topDomain}」跃迁最显著，「${data.weakDomain}」为明年重点突破方向。

### 下一年策略
1. Q1聚焦短板补基础
2. Q2-Q3集中攻坚核心项目（钢琴/网络安全）
3. Q4固化体系化成果，生成长期资产。`
}
