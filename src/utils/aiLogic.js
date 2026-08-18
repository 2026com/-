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

// ========== P1：V4 新增「照片同款」完整学习路线 ==========
// 生成入口：genFullRouteAI(aiConfig, node) -> Promise<FullRouteSchema>
// 成功走 LLM，失败自动 fallback 本地模板，保证 0 硬错
//
// FullRouteSchema（严格对应参考照片的 6 个结构层）：
// {
//   routeTitle:     "钢琴 完整学习路线",                 // 1. 顶部大标题
//   routeSubtitle:  "一条中心横线看懂前期、中期、后期进阶", // 1. 顶部副标题
//   phases: [                                              // 2~4. 主线上 3 个阶段节点 + 上下悬挂白框
//     {
//       phaseLabel: "前期｜建立基础",                      // 3. 标在阶段上方
//       stage:      "early",                               // early/middle/late
//       nodeTitle:  "建立基础",                            // 2. 主线上黑色胶囊节点的标题
//       days:       30,                                    // 本阶段占用天数（相对起点）
//       above: {                                           // 4. 上方白色方框 4 项
//         "训练项目":  "...",
//         "技能要点":  "...",
//         "工具物料":  "...",
//         "曲目/案例":"..."
//       },
//       below: {                                           // 4. 下方白色方框 4 项
//         "能力目标":  "...",
//         "需要攻克的问题":"...",
//         "练习重点":  "...",
//         "达成标准":  "..."
//       }
//     },
//     {... phaseLabel:"中期",       stage:"middle" ...},
//     {... phaseLabel:"后期｜达到目标水平", stage:"late" ...}
//   ],
//   finalFlag: "可独立达成目标",                           // 5. 主线最右端旗帜文字
//   mantra: ["先打基础","再练XX","再XX","再XX","再XX","再XX"] // 6. 底部 6 步递进口诀
// }

// ---------- P1 本地模板（fallback，按新 3 阶段 4+4 结构重写） ----------
const PHASE_4_ABOVE_KEYS = ['训练项目','技能要点','工具物料','曲目/案例']
const PHASE_4_BELOW_KEYS = ['能力目标','需要攻克的问题','练习重点','达成标准']

const ROUTE_TEMPLATES = {
  piano: {
    match: ['钢琴','琴','乐器','吉他','小提琴','古筝','笛子','笛','萨克斯','二胡','口琴'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      {
        phaseLabel: '前期｜建立基础', stage: 'early',  nodeTitle: '建立基础', days: 30,
        above: {
          '训练项目':  '每日坐姿手型 + 哈农前5条 + 单音吹响/拨弦基础',
          '技能要点':  '正确的呼吸/持琴/手型、识谱基础（高音谱号C大调）、节拍器40-60BPM',
          '工具物料':  '琴/笛本体、节拍器APP、教材（哈农/李重光乐理/考级1级）、录音笔/手机',
          '曲目/案例':'《小星星》《欢乐颂》《新年好》（或对应1级入门曲2首）'
        },
        below: {
          '能力目标':  '能不看指法弹出C大调音阶2个八度，识谱8小节以内无停顿',
          '需要攻克的问题':'手指独立性差、换指卡顿、节拍忽快忽慢、嘴型/按弦酸痛',
          '练习重点':  '慢练+分手/分声部、每音对拍、错误小节单独重复10遍以上',
          '达成标准':  '连续7天打卡，2首入门曲完整演奏0错误，节拍器60BPM稳定'
        }
      },
      {
        phaseLabel: '中期', stage: 'middle', nodeTitle: '进阶演奏', days: 60,
        above: {
          '训练项目':  '音阶琶音三和弦每日20分钟 + 阶段指定完整曲目1首 + 视奏1页',
          '技能要点':  '转指/穿指/跨指（乐器）、气颤音/吐音（管乐）、三和弦连接、强弱表情',
          '工具物料':  '考级2-3级曲目集、不同速度节拍器、录音对比工具、伴奏音频',
          '曲目/案例':'《致爱丽丝》/《雪之梦》（钢琴）、《天空之城》（笛子/小提琴）、考级3级曲1首'
        },
        below: {
          '能力目标':  '能完整演奏完整曲目2~3首，带强弱起伏和基本表情处理',
          '需要攻克的问题':'换段落衔接断档、速度提升后错音、强弱过渡生硬、表情缺失',
          '练习重点':  '分段打磨（难点圈出单独练）、速度阶梯提升、表情标记逐条落实',
          '达成标准':  '完整曲目无停顿2遍，录音自评可指出3个以上进步点，节奏误差<5%'
        }
      },
      {
        phaseLabel: '后期｜达到目标水平', stage: 'late', nodeTitle: '稳定输出', days: 30,
        above: {
          '训练项目':  '模拟上台全曲走台3遍 + 旧曲复盘 + 新曲快速视奏 + 录像回看',
          '技能要点':  '舞台呼吸、表情与舞台张力、错音应急补救、作品风格理解',
          '工具物料':  '三脚架录像、小剧场/客厅舞台模拟、观众2人以上模拟听众、演出服',
          '曲目/案例':'自选代表作2首（技巧+抒情） + 公开演出/家庭音乐会1次'
        },
        below: {
          '能力目标':  '能在陌生人前完整脱稿表演代表作2首，形成个人稳定风格',
          '需要攻克的问题':'上台紧张忘谱、连续演奏耐力不足、风格辨识度低',
          '练习重点':  '模拟上台流程、录像复盘表情动作、固定曲目打磨细节到肌肉记忆',
          '达成标准':  '公开演出1次零重大失误，观众反馈3条正向评价，代表作可随时脱稿演奏'
        }
      }
    ],
    finalFlag: '可独立演奏/达成目标曲目',
    mantra: ['先建立正确手型与识谱','再练音阶琶音基本功','再攻克完整曲目分段','再打磨强弱表情细节','再模拟上台走台录像','最后公开演出稳定输出']
  },

  code: {
    match: ['编程','代码','开发','Python','JavaScript','Java','Go','C++','算法','前端','后端','软件','网络安全','漏洞','挖洞','黑客','渗透'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      {
        phaseLabel: '前期｜建立基础', stage: 'early',  nodeTitle: '基础搭建', days: 30,
        above: {
          '训练项目':  '每天语法小节阅读 + 10道基础题 + 本地环境配置跑通 HelloWorld',
          '技能要点':  '变量/分支/循环/函数/基本数据结构、命令行基础、Git 提交三板斧',
          '工具物料':  'VSCode/IDEA、对应语言 SDK、iTerm2/PowerShell、GitHub 账号、MDN/官方文档',
          '曲目/案例':'LeetCode 数组/字符串 easy 20题；TodoList CLI 版本（增删查）'
        },
        below: {
          '能力目标':  '能独立写 300 行以内逻辑代码，跑通本地测试并 Push 到远程',
          '需要攻克的问题':'环境配不起来、语法细节错、数组越界、不会读报错栈',
          '练习重点':  '逐行读报错、每道错题写笔记、一周复盘一次盲点清单',
          '达成标准':  '1 周内完成 CLI TodoList + 20 道 easy，0 低级语法错'
        }
      },
      {
        phaseLabel: '中期', stage: 'middle', nodeTitle: '项目与核心', days: 60,
        above: {
          '训练项目':  'Week1-2 框架入门小项目 + Week3-5 中大型项目实战 + 每周 5 道 medium',
          '技能要点':  '异步/并发、OOP/设计模式基础、常用中间件（HTTP/JSON/DB/缓存）、调试工具',
          '工具物料':  '官方框架脚手架、Postman/Apifox、Navicat/DBeaver、Docker、Chrome DevTools',
          '曲目/案例':'博客系统 / 漏洞扫描靶场(Web安全) / 聊天机器人，各 1 个完整项目'
        },
        below: {
          '能力目标':  '能独立从 0→1 完成一个 CRUD 完整项目，能调试接口/排查 SQL/日志定位 bug',
          '需要攻克的问题':'代码结构乱、SQL 慢、边界条件漏、并发/异步 bug',
          '练习重点':  '先画架构图再写、每完成一模块写单测、每出 bug 必写根因笔记',
          '达成标准':  '完整项目交付含 README/截图、单测覆盖核心函数 60%、3 天内无重大功能 bug'
        }
      },
      {
        phaseLabel: '后期｜达到目标水平', stage: 'late', nodeTitle: '工程化与输出', days: 30,
        above: {
          '训练项目':  '每周 1 次代码评审 + 1 个工程化改造任务 + 开源贡献 1 PR',
          '技能要点':  '工程化（Lint/格式化/CI/CD/部署）、性能基础指标、代码可维护性、安全加固',
          '工具物料':  'ESLint/Prettier、GitHub Actions、Docker Compose、Grafana/Prometheus、SonarQube',
          '曲目/案例':'开源项目 PR 合并 1 次；独立项目部署生产；1 篇技术复盘博客'
        },
        below: {
          '能力目标':  '能写出可上线维护的代码，并对性能、安全、可扩展做独立评审',
          '需要攻克的问题':'重复造轮子、忽略边界与安全、工程化嫌麻烦跳过 CI',
          '练习重点':  '读优秀开源项目源码、每次部署前做 checklist、坚持周复盘技术债',
          '达成标准':  '开源 PR 合并 1 次；独立项目在线稳定运行 7 天零崩溃；复盘博客公开发布获 10+ 互动'
        }
      }
    ],
    finalFlag: '可独立交付生产级项目',
    mantra: ['先搭环境语法入门','再刷基础题打底','再攻项目实战 0→1','再查日志定位排错','再补工程化 CI 部署','最后开源输出形成复利']
  },

  fitness: {
    match: ['健身','减脂','增肌','减肥','跑步','运动','体能','体态'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      { phaseLabel:'前期｜建立基础', stage:'early',  nodeTitle:'评估与启动', days:21,
        above:{
          '训练项目':'体测评估 + 每日 20-30 分钟低强度有氧 + 关节活动热身',
          '技能要点':'正确呼吸、深蹲/硬拉/卧推动作模式、心率区间1-2、睡眠作息',
          '工具物料':'体脂秤、训练日志APP、弹力带、运动鞋、泡沫轴、可穿戴手环',
          '曲目/案例':'每周3次30min快走/椭圆机 + 1次全身动作模式课'
        }, below:{
          '能力目标':'连续3周打卡>90%，基础动作模式标准，静息心率下降5-10',
          '需要攻克的问题':'动作姿势错、热身不充分导致痛、睡眠不足、饮食不控',
          '练习重点':'动作模式慢练 + 每次训练必录视频、睡眠/饮食双记录',
          '达成标准':'动作模式录像自评5项标准；连续21天打卡；体重/围度下降（减脂方向）'
        }},
      { phaseLabel:'中期', stage:'middle', nodeTitle:'力量攻坚', days:60,
        above:{
          '训练项目':'每周3-4次分化力量（推/拉/腿/核心）+ 每周2次有氧',
          '技能要点':'渐进超负荷、组数次数区间、动作变式、营养配比（蛋白/热量）',
          '工具物料':'杠铃/哑铃或健身房器械、蛋白质粉、刻度杯、训练日记、软尺',
          '曲目/案例':'深蹲/卧推/硬拉 三大项每周PR；腰围/体重周周记录对比'
        }, below:{
          '能力目标':'三大项技术成型，训练量渐进每周+2.5%，出现可见肌肉线条/围度变化',
          '需要攻克的问题':'平台期、营养跟不上、伤后恢复、睡眠波动',
          '练习重点':'每周+2.5%渐进超负荷、每次训练后记录重量+感受',
          '达成标准':'三大项重量较前提升30%；体脂下降5%或肌肉量+3kg；无伤病'
        }},
      { phaseLabel:'后期｜达到目标水平', stage:'late', nodeTitle:'稳定维持', days:30,
        above:{
          '训练项目':'每周3次维持性力量 + 1次趣味运动（球类/骑行）+ 每月1次体测',
          '技能要点':'周期化训练（减量周/冲量周）、外出就餐策略、受伤预防',
          '工具物料':'便携弹力带、出差训练清单、月度体测拍照存档模板',
          '曲目/案例':'参加一次本地5K跑/力量赛/公开挑战赛，作为阶段性验证'
        }, below:{
          '能力目标':'体重/体脂/三大项稳定3个月以上，日常作息无需刻意坚持',
          '需要攻克的问题':'出差/节日反弹、动力下降、长期维持枯燥',
          '练习重点':'每月1次体测、保持趣味运动、朋友圈/社群公开打卡',
          '达成标准':'连续3个月指标波动<5%；外出旅行仍保持80%以上训练习惯'
        }}
    ],
    finalFlag: '可独立维持长期理想体态',
    mantra: ['先评估体态睡眠启动','再练动作模式打底','再渐进超负荷攻坚','再补营养恢复细节','再趣味运动保持热情','最后月度监测稳定维持']
  },

  language: {
    match: ['英语','雅思','托福','日语','韩语','法语','语言','单词','口语','听力'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      { phaseLabel:'前期｜建立基础', stage:'early',  nodeTitle:'基础搭建', days:30,
        above:{
          '训练项目':'每日发音30分钟 + 单词100个（30新+70复习）+ 语法体系章节1节',
          '技能要点':'音标/发音规则、词根词缀法、基本时态从句、连读弱读语调',
          '工具物料':'扇贝/墨墨单词、语法书、每日德语听力/每日英语听力、Anki 卡组',
          '曲目/案例':'《小猪佩奇》无字幕10集；听写BBC 6 Minute English 5篇'
        }, below:{
          '能力目标':'日常对话听懂大意80%；写100字作文语法错误<3',
          '需要攻克的问题':'单词忘得快、发音不准、语法时态混淆、听力跟不上',
          '练习重点':'艾宾浩斯复习、影子跟读、错题本、每天开口5分钟',
          '达成标准':'单词量累计2000+；雅思听力5.5 / 高考120+同等水平'
        }},
      { phaseLabel:'中期', stage:'middle', nodeTitle:'输入输出强化', days:60,
        above:{
          '训练项目':'每日精听30分钟 + 外教25分钟口语1V1 + 每周1篇大作文',
          '技能要点':'精听/跟读/复述、话题语料库、小作文图表句型、大作文结构',
          '工具物料':'Cambly/italki、雅思/能力考真题集、Grammarly批改、口语录音回听',
          '曲目/案例':'雅思真题 Test1-4 做完2册；参加1次线下 English Corner'
        }, below:{
          '能力目标':'能与外教就日常/学术话题聊25分钟不冷场；作文冲高分',
          '需要攻克的问题':'开口卡壳想词、大作文跑题、连读弱听不出',
          '练习重点':'录音回听语法错≤3、每周背诵10套小作文句型、大作文列提纲30篇',
          '达成标准':'口语 Part2 不卡壳2分钟；真题套题整体达到目标分±0.5'
        }},
      { phaseLabel:'后期｜达到目标水平', stage:'late', nodeTitle:'母语化输出', days:30,
        above:{
          '训练项目':'每日外刊精读1篇 + 每周1次公开发布（视频/作文）+ 全英文环境1小时',
          '技能要点':'地道搭配、习语俚语、文化背景、演讲/汇报结构',
          '工具物料':'Economist/FT、小红书/B站英文账号、Toastmasters/演讲俱乐部',
          '曲目/案例':'英语公开演讲1次（15分钟）；英文vlog 1条 / 深度书评 1 篇'
        }, below:{
          '能力目标':'能独立做英文汇报/写作/社交，近似母语的连贯度',
          '需要攻克的问题':'母语干扰、表达不够地道、长段思维跳跃',
          '练习重点':'每天1小时全英环境、每次产出后母语者批改',
          '达成标准':'公开演讲1次获正向反馈；外刊长文读 80%+ 不查词典'
        }}
    ],
    finalFlag: '可独立用目标语言工作/社交',
    mantra: ['先发音词汇语法打底','再精听输入每日坚持','再外教口语纠音实战','再作文句型结构打磨','再母语化表达素材积累','最后公开演讲稳定输出']
  },

  exam: {
    match: ['考试','考研','考证','备考','公务员','司法','CPA','高考','中考'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      { phaseLabel:'前期｜建立基础', stage:'early',  nodeTitle:'系统基础', days:60,
        above:{
          '训练项目':'读教材一遍 + 每章课后题 + 画思维导图总结章节',
          '技能要点':'考纲知识点逐一覆盖、艾宾浩斯背诵、错题本系统',
          '工具物料':'官方考纲、指定教材、Anki 卡组、Xmind、错题本模板',
          '曲目/案例':'每章后题正确率≥70%；全科思维导图1套'
        }, below:{
          '能力目标':'考纲覆盖率≥90%；基础题正确率≥70%',
          '需要攻克的问题':'看书记不住、做题慢错的多、知识不成体系',
          '练习重点':'每章必须思维导图；错题每道记录错因+知识点定位',
          '达成标准':'近5年真题基础知识点直接出题做对7成以上'
        }},
      { phaseLabel:'中期', stage:'middle', nodeTitle:'真题强化', days:60,
        above:{
          '训练项目':'每周2套真题掐表 + 专题专项（弱项章节）+ 真题错题二刷',
          '技能要点':'掐表时间分配、真题题型规律、高频考点、蒙题策略底线',
          '工具物料':'真题集10年套卷、答题卡、计时器、专项章节题集、错题分类表',
          '曲目/案例':'近10年真题掐表做完2轮；错题3刷以上'
        }, below:{
          '能力目标':'真题分数稳定达到目标分±5%；弱项章节提升20%',
          '需要攻克的问题':'做不完、粗心错、跨章节综合题不会、心态崩盘',
          '练习重点':'严格掐表；每错题"知识点/错因/纠正"三连记；周末模考',
          '达成标准':'连续3套真题卷达到目标分；弱项专题正确率≥60%'
        }},
      { phaseLabel:'后期｜达到目标水平', stage:'late', nodeTitle:'冲刺与心态', days:20,
        above:{
          '训练项目':'每日模考1套（含涂卡）+ 错题本最后过一遍 + 作息严格模拟考试日',
          '技能要点':'考场时间管控、紧张调节、答题顺序策略、最后押题重点',
          '工具物料':'最终押题卷3套、答题卡、考场文具、考试日流程时间表',
          '曲目/案例':'全真考场流程模拟1次；最后一套押题卷掐表做完'
        }, below:{
          '能力目标':'走进考场不慌，时间分配精准，能稳定发挥平时水平',
          '需要攻克的问题':'考前焦虑失眠、大脑空白、最后几天不学习放飞',
          '练习重点':'最后1周每天1套保持手感、严格同步考场作息、深呼吸法',
          '达成标准':'模拟考稳定在目标线上10%；考前一周睡眠≥7h/天'
        }}
    ],
    finalFlag: '可稳定达到目标分数/通过',
    mantra: ['先过教材90%全覆盖','再思维导图搭体系','再真题掐表限时训练','再三刷错题抓弱项','最后押题作息模拟','最终稳定发挥拿到结果']
  },

  default: {
    match: ['__default__'],
    title: (t) => `${t} 完整学习路线`,
    phases: [
      { phaseLabel:'前期｜建立基础', stage:'early',  nodeTitle:'建立基础', days:30,
        above:{
          '训练项目':'每日30-45分钟入门学习 + 画一张全景知识地图',
          '技能要点':'核心概念定义、常见术语表、入门最佳路径3条、踩坑清单',
          '工具物料':'豆瓣/知乎高赞入门书单3本、工具集、笔记系统（Obsidian/Notion）、入门视频课1套',
          '曲目/案例':'完成入门项目1个；输出入门笔记3篇（每篇>800字）'
        }, below:{
          '能力目标':'能用大白话把目标讲给小白听，并列出正确的3步入门路径',
          '需要攻克的问题':'资料焦虑、选错起点、东学一点西学一点',
          '练习重点':'费曼输出、每周1次向朋友讲解、做减法聚焦',
          '达成标准':'全景知识图1张；3个入门项目全部独立跑通；3篇笔记公开发布'
        }},
      { phaseLabel:'中期', stage:'middle', nodeTitle:'能力进阶', days:60,
        above:{
          '训练项目':'每周1个中型项目 + 1个薄弱专项 + 每周1次复盘记录',
          '技能要点':'解决综合题、跨模块组合、常见异常定位、标准产出流程',
          '工具物料':'进阶案例集、实战项目模板、检查清单、复盘模板',
          '曲目/案例':'独立产出5个以上完整作品/项目，覆盖核心场景'
        }, below:{
          '能力目标':'独立完成中型项目/作品，对常见问题能自行排查',
          '需要攻克的问题':'只会照搬、改动需求就卡、知识迁移弱',
          '练习重点':'改需求练习、每个项目做2版"低配版→高配版"、横向对比优秀作品',
          '达成标准':'60天内产出≥5个项目；公开发布获得10次以上有效反馈'
        }},
      { phaseLabel:'后期｜达到目标水平', stage:'late', nodeTitle:'稳定输出', days:30,
        above:{
          '训练项目':'对外发布1份代表作 + 长期复盘习惯建立 + 导师/高手点评1次',
          '技能要点':'作品打磨细节、个人风格识别、长期维护/升级、复利化输出',
          '工具物料':'作品集站点(PDF/Github/Notion)、高手点评预约渠道、粉丝/反馈群',
          '曲目/案例':'代表作发布1份；收3位高手详细点评；发布复盘文章1篇'
        }, below:{
          '能力目标':'形成稳定产出能力，并有可展示的作品集用于求职/副业/爱好持续',
          '需要攻克的问题':'细节打磨不够、做完没有可展示成果、后续动力下降',
          '练习重点':'每次产出做作品集版本；固定每月复盘1次；加入同好社群',
          '达成标准':'作品集≥3件高质量内容；高手点评落地至少3条优化'
        }}
    ],
    finalFlag: '可独立达成目标',
    mantra: ['先搭全景知识地图','再做入门项目打底','再攻中型项目进阶','再改细节打磨品质','再收高手点评升级','最后形成作品集与复利']
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

/** ---------- 本地纯模板 fallback（完整路线 schema） ---------- */
export function genFullRoute(node) {
  const title = node?.title ?? '未命名目标'
  const tpl = matchRouteTemplate(title)
  const routeTitle = (typeof tpl.title === 'function') ? tpl.title(title) : `${title} 完整学习路线`
  return {
    routeTitle,
    routeSubtitle: '一条中心横线看懂前期、中期、后期进阶',
    phases: (tpl.phases || []).map(p => ({
      phaseLabel: p.phaseLabel,
      stage:      p.stage,
      nodeTitle:  p.nodeTitle,
      days:       Number(p.days) || 30,
      above:      Object.fromEntries(PHASE_4_ABOVE_KEYS.map(k=>[k, String(p.above?.[k] ?? '')])),
      below:      Object.fromEntries(PHASE_4_BELOW_KEYS.map(k=>[k, String(p.below?.[k] ?? '')])),
    })),
    finalFlag: tpl.finalFlag || '可独立达成目标',
    mantra:    (tpl.mantra && tpl.mantra.length >= 6) ? tpl.mantra.slice(0,6) : ['先打基础','再练核心','再攻项目','再修细节','再收反馈','最后稳定输出'],
  }
}

/** ---------- 子节点原子步骤（对阶段下的"上方/下方方框"分类节点执行"AI写执行方案"时复用，兼容保留） ---------- */
const CHILD_ATOMIC_TEMPLATES = {
  '基础乐理': [
    '阅读《李重光乐理基础》第1-2章 25分钟 做章节后习题5道',
    '观看B站「钢琴乐理入门」第3集 15分钟 记笔记3条重点',
    '背诵12个大调调号表 10分钟 每个调默写2遍',
    '识别五线谱高音/低音谱号音符共40个 计时8分钟 错误率<5%',
    '练习音程构唱 大小二度到八度共14组 每组3遍',
  ],
  '概念与方法论学习': [
    '阅读指定书 第 1-3 章 30 分钟 划线 10 处重点',
    'B站搜索关键词 入门教程 1 集 20 分钟 笔记 5 条',
    '整理概念图 1 张 A4 纸 3 个核心要素 + 相互关系',
    '看 3 篇知乎高赞回答 每篇做 1 段 3 句话摘要',
    '用费曼法讲给朋友听 5 分钟 录音回听 2 处卡壳标记',
  ],
  '基础技能训练': [
    '专项基础训练 25 分钟 番茄钟 1 个 专注不摸手机',
    '20 道基础练习题 每题控制 3 分钟 错题抄进错题本',
    '动作/步骤分解 8 组 每组慢速练 5 遍 求稳不求快',
    '刻意练习薄弱点 1 个 聚焦 20 分钟 比昨天进步 1 小步',
    '周末小测 1 次 30 分钟 基础题目 正确率 > 85%',
  ],
  '项目/实践落地': [
    '本周 1 个小项目 目标写下来 3 天内做完 MVP',
    '拆解 6 个小步骤 每步 1 小时 今天先完成前 2 步',
    '动手实操 45 分钟 录屏 回看 发现 3 处优化点',
    '找 1 位朋友试玩/试用 收集 5 条反馈 2 条当天迭代',
    '公开发布 小红书 / 朋友圈 / Github 晒 1 次 收集点赞 10+',
  ],
  '复盘迭代优化': [
    '每日复盘 10 分钟 3 件事：今天好/坏/明天改进 1 条',
    '周复盘 30 分钟 数据量化 对比上周 进步点 3 条',
    '写 3 条坑记录 每条含 复现步骤 + 根因 + 解决方案',
    '对比 10 天前作品 / 今日作品 打分 0-10 分说明差异',
    '请教 1 位高手 30 分钟 准备 5 个具体问题 带着答案回来',
  ],
  '成果输出与分享': [
    '整理作品 1 份 PDF 10 页 含 5 张截图 / 对比图',
    '写技术笔记 1 篇 800 字 发布 公众号 / 掘金 / 知乎',
    '公开演讲 / 社群分享 1 次 15 分钟 10 页 PPT',
    '做 5 分钟讲解视频 1 条 剪映剪辑 配字幕 BGM 上传 B 站',
    '朋友圈 / 小圈子公开发布 收集 5 条建设性评论并回复',
  ],
  '真题训练': [
    '掐表 1 套真题 按考试节奏涂卡 控制 3 分钟内误差',
    '错题按知识点分类 错因 3 栏记录：概念/计算/粗心',
    '同考点找 3 道同类题二次训练 正确率目标 ≥ 80%',
    '对答案后逐题写解析 每题至少 1 句话',
    '背诵本卷高频考点做成 Anki 卡片 30 张',
  ],
  '发音训练': [
    '音标发音 20 分钟 每个音标 10 遍 + 录音比对标准发音',
    '单词重音标记 30 个 错音标红 3 天后重测',
    '影子跟读 10 分钟 BBC / NHK 模仿连读弱读',
    '绕口令 3 段 每段 3 遍 错误率 < 1',
    '外教对话 25 分钟 录音复盘发音问题 5 条',
  ],
}

function matchChildTemplate(branchTitle='', parentTitle='') {
  const k1 = String(branchTitle)
  if (CHILD_ATOMIC_TEMPLATES[k1]) return CHILD_ATOMIC_TEMPLATES[k1]
  // fallback 默认 5 大类拼接 + 伪随机选
  const allDefaults = [
    ...CHILD_ATOMIC_TEMPLATES['概念与方法论学习'],
    ...CHILD_ATOMIC_TEMPLATES['基础技能训练'],
    ...CHILD_ATOMIC_TEMPLATES['项目/实践落地'],
    ...CHILD_ATOMIC_TEMPLATES['复盘迭代优化'],
    ...CHILD_ATOMIC_TEMPLATES['成果输出与分享'],
  ]
  const seed = (parentTitle||'') + '|' + (branchTitle||'')
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h<<5)-h + seed.charCodeAt(i))|0
  const start = Math.abs(h) % Math.max(1, allDefaults.length - 6)
  const count = 6 // 保持 6 条（上下对称）
  return allDefaults.slice(start, start + count)
}
export function genChildAtomicSteps(node, parentTitle) {
  const title = node?.title ?? ''
  const steps = matchChildTemplate(title, parentTitle)
  return steps.map(s => ({ title: s }))
}

export function isParentLevelNode(node) {
  if (!node) return true
  return node.parentId == null || (node.level ?? 0) === 0
}

// ---------- P1: V4 LLM 完整路线 ----------
function parseRouteJSON(data, fallbackGen) {
  const fb = fallbackGen()
  if (!data || typeof data !== 'object') return fb
  const phases = Array.isArray(data.phases) ? data.phases : (Array.isArray(data.stages)?data.stages:[])
  const normPhase = (raw, i) => {
    const keys = ['early','middle','late']
    const labels = ['前期｜建立基础','中期','后期｜达到目标水平']
    const o = raw && typeof raw === 'object' ? raw : {}
    const p = {
      phaseLabel: String(o.phaseLabel || o.label || o.phase || labels[i] || labels[2]),
      stage:      String(o.stage || o.stagePhase || keys[i] || keys[2]),
      nodeTitle:  String(o.nodeTitle || o.name || o.title || labels[i] || '阶段'),
      days:       Math.max(1, Number(o.days || o.duration || 30)),
      above:      Object.fromEntries(PHASE_4_ABOVE_KEYS.map(k=>[k, String((o.above||{})[k] ?? (o[k]) ?? '')])),
      below:      Object.fromEntries(PHASE_4_BELOW_KEYS.map(k=>[k, String((o.below||{})[k] ?? (o[k]) ?? '')])),
    }
    return p
  }
  const mantra = Array.isArray(data.mantra) ? data.mantra.slice(0,6) : (Array.isArray(data.logic)?data.logic.slice(0,6): fb.mantra)
  while (mantra.length < 6) mantra.push(fb.mantra[mantra.length] || '再打磨')
  return {
    routeTitle:    String(data.routeTitle || data.title || fb.routeTitle),
    routeSubtitle: String(data.routeSubtitle || data.subtitle || fb.routeSubtitle),
    phases:        [0,1,2].map(i=>normPhase(phases[i],i)),
    finalFlag:     String(data.finalFlag || data.flag || data.destination || fb.finalFlag),
    mantra:        mantra.slice(0,6),
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
      content:`你是「零基础横向学习路线规划师」，只输出严格合法 JSON，不要 Markdown/解释/编号。
【输出结构（严格对应参考照片）】：
{
  "routeTitle":    "【目标名】完整学习路线",
  "routeSubtitle": "一条中心横线看懂前期、中期、后期进阶",
  "phases": [
    { "phaseLabel":"前期｜建立基础", "stage":"early",  "nodeTitle":"建立基础", "days":30,
      "above":{"训练项目":"...","技能要点":"...","工具物料":"...","曲目/案例":"..."},
      "below":{"能力目标":"...","需要攻克的问题":"...","练习重点":"...","达成标准":"..."} },
    { "phaseLabel":"中期",               "stage":"middle", "nodeTitle":"能力进阶", "days":60, "above":{同4项}, "below":{同4项} },
    { "phaseLabel":"后期｜达到目标水平", "stage":"late",   "nodeTitle":"稳定输出", "days":30, "above":{同4项}, "below":{同4项} }
  ],
  "finalFlag": "可独立达成目标",
  "mantra": ["先XX","再XX","再XX","再XX","再XX","再XX"]
}
【硬性要求】：
1. phases 必须恰好 3 项；phaseLabel 首项用"前期｜建立基础"，中间"中期"，末项"后期｜达到目标水平"；
2. nodeTitle 是黑色主线胶囊节点的阶段名称，4-8字中文；days 是该阶段占用天数（合计大约 120 天的学习周期节奏）；
3. 每个阶段 above（阶段节点上方白色方框）严格包含且只包含 4 个键："训练项目"、"技能要点"、"工具物料"、"曲目/案例"；
4. 每个阶段 below（阶段节点下方白色方框）严格包含且只包含 4 个键："能力目标"、"需要攻克的问题"、"练习重点"、"达成标准"；
5. finalFlag 必须用"可独立达成目标"或针对领域替换的等义句（如"可独立演奏目标曲目"）；
6. mantra 必须恰好 6 条，自然语义递进，后续将拼成"学习逻辑：先XX → 再XX → 再XX → 再XX → 再XX → 再XX"；
7. 整体黑白简约风格，所有内容全部中文，不写分钟数字在阶段名，分钟/数量放到具体 4+4 方框内；
8. 整体为「横向时间轴主线 + 节点 + 上下悬挂方框」的样式，禁止竖向流程。`
    },
    { role:'user', content:`我的长期目标是：《${safeTitle}》。请严格按照「横向完整学习路线」参考照片模板，输出完整路线 JSON，包含 routeTitle/routeSubtitle/phases×3/finalFlag/mantra×6 六个顶层字段，不要多不要少。` }
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
        const routeSubtitle = clean('routeSubtitle') || clean('subtitle') || '一条中心横线看懂前期、中期、后期进阶'
        return { routeTitle, routeSubtitle, phases: [], finalFlag, mantra: [] }
      }
    })
    return parseRouteJSON(data, fallbackFn)
  } catch (_) {
    return fallbackFn()
  }
}

// ---------- 子级 AI 生成：保留 V3 4~6 条原子动作 ----------
export async function genChildAtomicStepsAI(aiConfig, node, parentTitle='') {
  const safeTitle = String(node?.title||'').slice(0,60)
  const safeParent = String(parentTitle||'').slice(0,60)
  const fallbackFn = () => genChildAtomicSteps(node, parentTitle)
  if (!aiConfig?.baseUrl || !aiConfig?.apiKey || !aiConfig?.modelId) return fallbackFn()
  const messages = [
    { role:'system', content:`你是「学习路线原子动作拆解助手」，只输出严格合法 JSON。
输出结构：{ "steps": ["动作A","动作B","动作C","动作D","动作E","动作F"] }
要求：
1. steps **必须 6 条**（上下对称排版），每条必须是"能立即动手的具体动作"；
2. 每条必须明确包含「数量/次数/时长/正确率/BPM/页数」等可量化单位；
3. 中文短句 15~40 字，口语化适合打卡场景；
4. 逻辑顺序自然。`
    },
    { role:'user', content:`父级阶段：《${safeParent||'父阶段'}》
当前分类方框：《${safeTitle||'子节点'}》
请输出 6 条可立即执行的具体原子动作，严格 JSON 返回 { steps: string[] } 恰好 6 项。` }
  ]
  try {
    const { data } = await chatCompletionJSON(aiConfig, messages, {
      temperature:0.5, timeoutMs:25000, maxTokens:1600,
      fallbackParser:(plain)=>{
        const lines = String(plain||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean)
        const cands = lines
          .map(l=>l.replace(/^\s*[-•*\d.、\)\]]+\s*/,'').replace(/^["`]+|["`]+$/g,'').trim())
          .filter(l=>l && l.length>=8 && l.length<=60)
        return { steps: cands.slice(0,6) }
      }
    })
    let arr = []
    if (Array.isArray(data)) arr = data
    else if (data && Array.isArray(data.items)) arr = data.items
    else if (data && Array.isArray(data.steps)) arr = data.steps
    const out = []
    arr.forEach(x=>{
      if (x==null) return
      const t = typeof x==='string' ? String(x).trim() : String(x?.title||x?.name||'').trim()
      if (t) out.push({title:t})
    })
    const fb = fallbackFn()
    while (out.length < 6) out.push(fb[out.length % Math.max(1,fb.length)])
    if (out.length > 6) out.length = 6
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
