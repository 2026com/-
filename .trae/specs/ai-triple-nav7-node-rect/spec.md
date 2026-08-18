# 个人成长强者体系 - 1.0.7 规格说明书（AI配置三模 + 思维导图矩形节点 + 左侧菜单7系统归并）

## Overview
- **Summary**: 完成三大模块迭代：AI 配置面板新增「默认模型 / 公益模型 / 自定义接入」三档单选快速设置 + 公益模型获取弹窗；思维导图节点整体瘦身并替换为更适配的非圆形形状；左侧抽屉菜单删除多余「情商练习」「智能幕布」入口，仅保留 7 个指定系统名称，且把「幕布 / 长期规划 / 打卡代办」全部归并到【任务日程】下。
- **Purpose**: 对标截图界面 UI；简化 AI 配置流程（一键启用公益模型），避免用户手动填 Key 的门槛；修复节点形状与尺寸、时间轴单日粒度视觉宽度匹配问题；归并菜单只保留 7 大系统，导航路径更直接。
- **Target Users**: 个人成长 / 任务规划 / 习惯打卡使用者。

## Goals
1. AI 配置面板入口有 3 个快速设置单选：默认模型 / 公益模型 / 自定义接入；公益模式一键启用，无需 API Key。
2. AI 侧边对话 + 【AI 写执行方案】共享同一套 aiConfig（含公益模式），保存到 localStorage，零硬编码。
3. 思维导图节点：矩形/胶囊替换圆形；整体体型缩小 20%~30%；节点下方小进度条与百分比保留；父子连线吸附仍正确。
4. 时间轴单日像素步长压缩，节点宽度从 DAY_W 压缩，确保节点不占用接近一周宽度；时间跨度扩大，比例协调。
5. 左侧抽屉：仅 7 系统保留，删除「情商练习」「智能幕布」；菜单分组保留「向外·现实战斗力」「向内·内核定力」；幕布/长期规划/打卡代办三个大页面入口归并到【任务日程】下，可直接跳转；7 系统仍支持用户自定义重命名。

## Non-Goals
- 不新增真实后端服务；公益模型仍走浏览器直连（即使用户选择公益模型，也只是把预置的模型 URL/Key 填入 aiConfig，不提供中转代理服务）。
- 不新增任何预置示例任务或示例节点。
- 不改变打卡、节点弹窗、AI 写执行方案追加不覆盖、父子升降级拖拽等既有业务逻辑。
- 不提供"公益模型"真实可访问性的 SLA；预置 Key 只是默认值，用户可以任何时候替换回自定义/默认。

## Background & Context
- 历史版本 AIConfigPanel 只有 4 家 provider 单选卡，没有快速档位区分，用户面对"到底该选哪一个"决策门槛偏高。公益模型模式就是要提供一条零配置路径。
- 当前 MindNode 是圆形（80px-73px-66px 依层级递减），DAY_W=28px，节点横向宽度约 80px ≈ 2.8 天 → 视觉上一个节点快占一周宽度，尺寸不匹配。需整体压缩节点宽高 + 让 DAY_W 减少，保持"单天 = 单节点不跨 2 天以上"的合理比例。
- 左侧当前 `NavContent` 里有 `智能待办幕布（isHeader）`、`7大系统`、`情商复盘库`、`财务待办幕布`，明显超需求；必须改为只保留 7 系统，向外/向内两组分组。7 系统下【任务日程】需要收纳三个大页面：日常打卡（/daily）、长期规划（/goals）、历史复盘（/review）。

## Functional Requirements
- **FR-1 AI快速设置三档**: AIConfigPanel 顶部快速设置区段，3 个单选按钮（默认模型 / 公益模型 / 自定义接入），切换后下面表单联动；默认选中"默认模型"（DeepSeek）。
- **FR-2 默认模型**: 自动写入 DeepSeek preset（baseUrl=https://api.deepseek.com/v1、modelId=deepseek-chat），API Key 输入框置空等待用户填；提示引导用户去 platform.deepseek.com 申请。
- **FR-3 公益模型**: API Key / Base URL / Model ID 表单字段自动锁定，不允许手动修改；提供【获取公益模型】按钮 → 点击 → 弹出"公益模型列表"二级弹窗（列表式卡片，含模型名、简介、厂商、速度/免费额度标记）→ 用户选中一个 → 点击"立即启用" → 直接把预置的 baseUrl / modelId / apiKey 写入 aiConfig（若某模型暂时没有预置 Key，则给出占位提示不报错）→ 关闭弹窗并 Toast。
- **FR-4 自定义接入**: 保留当前 provider 4 卡（DeepSeek / 通义千问 / 智谱 / OpenAI 兼容）和手动填字段的逻辑；支持连通性测试与保存。
- **FR-5 AI共享同一套配置**: 侧边 AI 对话（AIChatSidebar/aiClient）与【AI 写执行方案】（NodePopup/aiLogic genParentFrameworkAI/genChildAtomicStepsAI）都只从 state.aiConfig 读配置；不新增第二套配置键。
- **FR-6 密钥本地持久化**: 任何模式下的 API Key 都仅写 localStorage（STORAGE_KEYS.AI_CONFIG），不硬编码，不发往除用户自己填的 Base URL 以外第三方；用户清除浏览器数据即一并删除。
- **FR-7 节点形状替换与整体瘦身**: MindNode 从圆形→矩形/胶囊（rounded-2xl，宽 ≥ 高 1.8:1，层级越高越扁小）；整体尺寸按当前值缩小 20~30%；节点标题行展示 2 行内截断；状态色点保留左上角；进度环 SVG 需改成矩形顶部/底部进度条或删除内部进度环（因为下方已存在独立小进度条+%，重复信息）。
- **FR-8 节点时间轴尺寸比例修正**: 减小 DAY_W（从 28 → ≤ 18），保证单个节点宽度≈1~2 天像素；扩大 DAYS_BEFORE/DAYS_AFTER（如 ≤14 + ≤180，或保证总跨度 ≥ 120 天）；节点与时间轴高度比例协调（时间轴 ≈ 节点高度 × 0.8~1.0）。
- **FR-9 父子节点连线保持严格吸附**: NodeLinks 的 x1/y1/x2/y2 重新按矩形节点的左右边缘中心计算（不再用圆的一半）；拖拽/升降级/增删节点时连线实时刷新。
- **FR-10 左侧导航瘦身**: 删除 `智能待办幕布`、`财务待办幕布`、`情商复盘库` 等多余菜单项；只保留 7 系统，并添加两个分组标题行「向外·现实战斗力」与「向内·内核定力」，把 7 系统按如下分组：
  - 向外·现实战斗力：能力成长、人际网络、财务记账、任务日程、知识思考库
  - 向内·内核定力：身体状态、情绪与心理
- **FR-11 任务日程收纳三大页面**: 点击【任务日程】系统菜单展开子菜单（或直接跳转，两种方式任选简洁的一种）→ 给出 3 个子入口：「日常打卡 /daily」「长期规划 /goals」「历史复盘 /review」，点击真实 useNavigate 跳转到路由。
- **FR-12 7系统支持自定义重命名**: 7 个系统 name 允许用户长按 / 点击铅笔图标在输入框内修改，保存到 SETTINGS/自定义字段中（若无则新增），并同步显示在导航与后续 SEVEN_SYSTEMS 引用处。
- **FR-13 构建与预览可用**: `node vite build` 构建无错；`node vite-preview.mjs` 长驻就绪后 TRAE 预览可打开；桌面双击 `.cmd` 启动正常、自动跳转浏览器；一键停止.cmd 可清进程。

## Non-Functional Requirements
- **NFR-1 可用性**: AI 配置面板任何切换操作 < 150ms 反馈；公益列表弹窗无网络请求即可弹出。
- **NFR-2 兼容性**: 不依赖任何新增 npm 包；使用现有 React + tailwind 即可。
- **NFR-3 数据迁移**: DATA_VERSION 升级到 `1.0.7-20260815-ai-triple-node-rect-nav7` 自动清旧缓存。
- **NFR-4 风格一致性**: 弹窗/按钮/输入框风格与当前 `rounded-xl、留白、低色饱和` 统一。

## Constraints
- **Technical**: 所有 AI 调用继续走 aiClient.js 单入口，避免多入口重复代码。
- **Business**: 公益模型的预置 Key 如果后续被撤销，用户必须能在 UI 上一键切换回"自定义接入"，且不造成其它业务破坏（AI 降级为本地模板兜底即可）。
- **Dependencies**: 不新增依赖。

## Assumptions
- 公益模型"无需 Key"是默认意义上的无门槛：如果实际厂商 API 仍要求 Key，我们预置一个公开的 demo key 占位或"即将上线 · 占位"模式，Toast 提示，但不阻塞 UI。
- 截图里"默认模型 / 公益模型 / 自定义接入"三个快速切换单选按钮在 AI 配置面板最顶部第一视觉位。
- 7 系统的"向外/向内"分组顺序，按上文 FR-10 固定。

## Open Questions
- [ ] 公益模型的可选项清单（名称、厂商、简介、是否需要 Key）用户是否有截图指定？若无，本 Spec 内置 3~4 个常见开源公益模型占位（e.g. Qwen2.5-7B、GLM-4-Flash、DeepSeek-R1-Zero 等），用户可后续覆盖。
- [ ] 【任务日程】展开子入口的形式（点击父菜单展开 3 子入口 OR 点击父菜单后弹窗选择），本 Spec 选择"展开式（折叠面板，父菜单点一下展开/折叠，简洁）"。
- [ ] 7 系统自定义重命名是否要提供"恢复默认"？本 Spec 保留"恢复默认"小链接。

## Acceptance Criteria

### AC-1: AI配置面板顶部三档快速单选
- **Type**: `rule`
- **Given**: 打开 AIConfigPanel
- **When**: 观察页面顶部
- **Then**: 第一区段存在 3 个大单选按钮（默认模型 / 公益模型 / 自定义接入），其中一个高亮选中；切换按钮立即改变下方表单内容
- **Pass Condition**: 快速设置区存在且三选一互斥
- **Evidence**: AIConfigPanel.jsx render 代码 + 浏览器实际截图

### AC-2: 默认模型联动正确 + 需用户填Key
- **Type**: `rule`
- **Given**: 选中"默认模型"
- **When**: 查看 Base URL / Model ID / API Key
- **Then**: Base URL = https://api.deepseek.com/v1、Model ID = deepseek-chat；API Key 为空并可编辑；保存走 UPDATE_AI_CONFIG
- **Pass Condition**: 字段正确；保存后 AIChatSidebar 下次消息使用该配置
- **Evidence**: localStorage STORAGE_KEYS.AI_CONFIG 读取值 + 聊天首条请求 baseUrl 匹配

### AC-3: 公益模型模式表单锁定，且有获取按钮
- **Type**: `rule`
- **Given**: 选中"公益模型"
- **When**: 查看 Base URL / Model ID / API Key 输入框，并查看页面按钮
- **Then**: 三个输入框 disabled/readonly（灰态锁定）；存在"获取公益模型"显式按钮；点击弹出二级弹窗
- **Pass Condition**: 字段不允许手动编辑；弹窗 DOM 存在且至少列出 3 个模型候选卡
- **Evidence**: UI 交互截图 + disabled 属性

### AC-4: 公益模型选择后立即启用写回配置
- **Type**: `rule`
- **Given**: 公益模型列表弹窗已打开，用户点选一个候选卡后点"立即启用"
- **When**: 关闭弹窗并看 state.aiConfig
- **Then**: aiConfig.provider / baseUrl / modelId / apiKey 被所选公益模型覆盖；Toast 提示"✅ 已启用公益模型：xxx"；AI写执行方案 & 侧边对话立即走这一套配置
- **Pass Condition**: aiConfig 字段与所选一致；Toast 存在
- **Evidence**: 浏览器 localStorage + AIChatSidebar 首次请求 baseUrl/modelId 验证

### AC-5: 自定义接入保留完整当前能力
- **Type**: `rule`
- **Given**: 选中"自定义接入"
- **When**: 点选任一 provider preset、填字段、保存、测试连接
- **Then**: provider 4 卡全部可选；保存成功写回；`🧪测试连接` 功能可用
- **Pass Condition**: 与原版能力完全一致
- **Evidence**: 保存后表单回显 + 测试连接请求 fetch 发出

### AC-6: 节点形状为矩形/胶囊 + 非圆形
- **Type**: `rule`
- **Given**: MindMapCanvas 渲染任意节点
- **When**: 审查 MindNode DOM style 与类名
- **Then**: 宽 > 高（比例约 1.8:1），border-radius 为圆角矩形（非 50% 圆）；节点不再是 width===height 正方或圆
- **Pass Condition**: MindNode 节点 width/height 比 ≠ 1 且 borderRadius < 50%
- **Evidence**: 浏览器 DOM style 截图 + MindNode.jsx 源码对应行

### AC-7: 节点整体体型缩小20%以上
- **Type**: `rule`
- **Given**: 层级 0 / 1 / 2 三个节点
- **When**: 对比历史 T3 尺寸规格（根 80 / 层1 73 / 层2 66 / 层3 59 / 更深 52）
- **Then**: 当前节点最长边 ≤ 历史 × 0.75（即 ≤ 根60 / 层1 55 / 层2 50 / 更深 40），总体感明显瘦身
- **Pass Condition**: 根节点最长边 ≤ 60px
- **Evidence**: MindNode.jsx size 变量公式 + DOM 计算宽度

### AC-8: 时间轴单日宽度压缩且跨度扩大
- **Type**: `rule`
- **Given**: MindMapCanvas 顶部时间轴
- **When**: 检查 DAY_W 常量 & DAYS_BEFORE / DAYS_AFTER
- **Then**: DAY_W ≤ 18；总跨度 (DAYS_BEFORE + 1 + DAYS_AFTER) ≥ 120 天；节点宽度 ≤ 2 × DAY_W（节点宽度最多覆盖 2 天）
- **Pass Condition**: 常量 + 节点宽度 / DAY_W 比例 ≤ 2
- **Evidence**: MindMapCanvas.jsx 顶部常量区 + 视觉截图（1 节点最多跨 2 日）

### AC-9: 节点连线矩形边缘吸附正确
- **Type**: `rule`
- **Given**: 父子两个矩形节点已渲染
- **When**: 审查 NodeLinks.jsx bezier 起点终点
- **Then**: x1 = 父节点右边缘中心（父 x + 父宽度/2）；x2 = 子节点左边缘中心（子 x - 子宽度/2）；y1/y2 为节点竖向中心
- **Pass Condition**: 连线端点肉眼贴合矩形边缘，无飘移
- **Evidence**: 拖拽后仍贴合的截图 + NodeLinks.jsx 对应公式行

### AC-10: 左侧导航只保留7系统，含向内/向外两组
- **Type**: `rule`
- **Given**: LeftDrawer 打开且 drawerMode = nav
- **When**: 检查菜单条目
- **Then**: 完全没有"情商练习 / 智能幕布 / 财务待办幕布"等入口；出现两个分组标题"向外·现实战斗力"与"向内·内核定力"；7 系统总数 = 7（身体状态、情绪与心理、能力成长、人际网络、财务记账、任务日程、知识思考库）
- **Pass Condition**: 菜单条目数符合；分组标题存在；无违规条目
- **Evidence**: LeftDrawer.jsx NavContent menus 定义 + 页面截图

### AC-11: 任务日程收纳3大页面且可真实跳转
- **Type**: `rule`
- **Given**: 点击【任务日程】父菜单
- **When**: 点击子入口「日常打卡 / 长期规划 / 历史复盘」
- **Then**: 路由真实跳转到 /daily /goals /review（useNavigate 调用）；BottomTabs 高亮同步变更；页面内容对应显示
- **Pass Condition**: 3 个跳转均发生；BottomTabs 高亮对应当前页面
- **Evidence**: useNavigate 触发 + 浏览器地址栏变更

### AC-12: 7系统支持自定义重命名 + 恢复默认
- **Type**: `rule`
- **Given**: 左侧 7 系统菜单 hover 或长按
- **When**: 点击编辑图标 → 输入新名称保存
- **Then**: 导航菜单 name 立即更新；刷新后持久化；点击"恢复默认"把所有 7 系统名回原默认值
- **Pass Condition**: 自定义名持久化（SETTINGS localStorage 读取一致）
- **Evidence**: AppContext 新增字段 customSystemNames + constants SEVEN_SYSTEMS 渲染时合并自定义

### AC-13（rubric）: UI 与截图对齐
- **Type**: `rubric`
- **Dimension**: UI 还原度与简约一致性
- **Scale**: 1-5
- **Anchors**: 1 = 与截图完全不像 / 信息堆叠；3 = 三档快速设置 / 7 系统分组 / 矩形节点都有但排版略乱；5 = 完全对标截图，留白充足，分组清晰，按钮一眼定位
- **Pass Threshold**: >= 4
- **Evidence**: 页面三部分截图叠加对比

### AC-14: 数据构建与预览可用
- **Type**: `rule`
- **Given**: `node vite build` 完成
- **When**: 执行 vite-preview.mjs 并就绪后 TRAE OpenPreview
- **Then**: HTTP 200 返回；预览页正常渲染三大 Tab；无控制台致命报错
- **Pass Condition**: 构建成功 + 预览 HTTP 200 + 路由 /goals /daily /review 可访问
- **Evidence**: 构建终端输出 + HTTP 200 探测脚本输出
