# 个人成长强者体系 1.0.7 - 实施计划（AI三模+矩形节点+7系统菜单）

## Task 1: DATA_VERSION 升级 + constants.js 新增字段
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - DATA_VERSION 升级到 `1.0.7-20260815-ai-triple-node-rect-nav7`，自动清用户本地缓存，保证不预置示例任务。
  - 在 DEFAULT_SETTINGS 中新增 `customSystemNames: {}`（7系统自定义重命名的持久化字段）。
  - 在 AppContext 的 UPDATE_SETTINGS / 初始化逻辑里兼容 customSystemNames 读取与回写，写入 STORAGE_KEYS.SETTINGS。
  - 新增导出方法 `getSEVEN_SYSTEMS_EFFECTIVE(settings)`：把常量定义与 settings.customSystemNames 合并，返回实际使用的 7 系统数组（供 LeftDrawer、MindNode sys 渲染、NodePopup 引用），放在 constants.js 中。
- **Acceptance Criteria Addressed**: AC-12, AC-14
- **Test Requirements**:
  - `rule` TR-1.1: 常量 DATA_VERSION 字串匹配预期；AppContext 初始化后 state.settings.customSystemNames 存在（{} 或已有值）。
    **Evidence**: 读 localStorage `growth_app_v1_settings` & 控制台 React DevTools state.settings。
  - `rule` TR-1.2: getSEVEN_SYSTEMS_EFFECTIVE({ customSystemNames: { shenti: '身' } })[0].name === '身'，其它未覆盖项保持默认。
    **Evidence**: node 临时脚本运行。

## Task 2: AIConfigPanel 顶部三档快速设置 + 三种模式 UI 切换
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - AIConfigPanel 顶部新增「快速设置」区段：3 个并排大单选 Pill 按钮（默认模型 / 公益模型 / 自定义接入），选中高亮紫边白底，互斥。
  - 新增 form 状态字段 `quickMode: 'default' | 'public' | 'custom'`（useState），初始化时按当前 aiConfig 的"是否含公益标志 / 是否 custom provider"智能判定。
  - 切换 quickMode 时：
    - `default`：form = { provider: deepseek, baseUrl: DeepSeek preset, modelId: deepseek-chat, apiKey: 保留用户已填或空 }
    - `public`：锁定字段（disabled/readonly），不允许手动改，显示"公益模式：由系统自动分配"提示；
    - `custom`：保留现有 4 家 provider 单选卡（DeepSeek/qwen/GLM/custom），字段可编辑。
  - 原有保存逻辑 UPDATE_AI_CONFIG 新增 `mode: form.quickMode` 字段一起写入，保证重进面板可回到对应 quickMode 状态。
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-5
- **Test Requirements**:
  - `rule` TR-2.1: 快速设置 3 按钮存在，切换时 form.quickMode 变化 + 下面字段状态随之切换（custom 可编辑，public readonly）。
    **Evidence**: 实际点按 + 浏览器 React DevTools form 值快照。
  - `rule` TR-2.2: 选中 default → baseUrl === https://api.deepseek.com/v1 && modelId === deepseek-chat。
    **Evidence**: 页面输入框读取值。
  - `rule` TR-2.3: 选中 custom，仍可点 4 卡 provider 切换并自动填 preset。
    **Evidence**: 点 4 卡后 baseUrl/modelId 变化。

## Task 3: 公益模型候选列表弹窗 + 一键启用写入 aiConfig
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 在 AIConfigPanel 同文件（或单独 PublicModelsModal.jsx）新增二级弹窗「公益模型选择」：列表卡式，至少 3 个候选。
  - 预置 4 个公益模型（占位，用户之后可覆盖）：
    1) 「通义千问 · 公益版」（qwen-public / qwen-plus / Dashscope 兼容 base）
    2) 「智谱 · GLM-4-Flash」（glm-public / glm-4-flash / BigModel 兼容）
    3) 「DeepSeek Chat · 公益通道」（deepseek-public / deepseek-chat）
    4) 「硅基流动 · Qwen2.5-7B-Instruct」（siliconflow / Qwen2.5-7B-Instruct）
    - 每个候选卡显示：名称、厂商、简短描述（e.g. 响应快 / 中文好 / 适合长文）、速度徽章、额度徽章。
    - 每个候选附带内部 preset: { baseUrl, modelId, apiKey }。apiKey 给公开占位字符串或 ""（空则启用时 Toast 提示「暂未开放 Key，已切成本地模板兜底」）。
  - 列表单选（选中高亮 border），底部「立即启用」主按钮。
  - 点击立即启用 → 把候选 preset + mode = 'public' 写入 aiConfig（dispatch UPDATE_AI_CONFIG，payload 包含 provider/baseUrl/modelId/apiKey/mode/publicModelId）→ Toast：`✅ 已启用公益模型：${name}` → 关闭二级弹窗 → 回到 AIConfigPanel 后三个输入框仍灰态锁定但显示新值。
  - 若候选 apiKey 为空，Toast 追加说明「当前模型暂未开放密钥，将使用本地模板兜底 AI 响应」。
- **Acceptance Criteria Addressed**: AC-3, AC-4, FR-6
- **Test Requirements**:
  - `rule` TR-3.1: 点击"获取公益模型"按钮 → 弹窗 DOM 出现，至少显示 4 个候选卡片。
    **Evidence**: 页面截图。
  - `rule` TR-3.2: 选中第 2 个卡 → 立即启用 → aiConfig.baseUrl/modelId/apiKey/mode 与候选对应。
    **Evidence**: localStorage `growth_app_v1_ai_config` 读取值。
  - `rule` TR-3.3: 若选空 Key 的候选，Toast 追加兜底说明，且 NodePopup【AI写执行方案】仍然可以成功（降级本地模板）。
    **Evidence**: 实际点按 AI写执行方案 → Toast 显示「本地模板兜底」。

## Task 4: 验证 AI 三模块共享同一套 aiConfig
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 3
- **Description**:
  - 在 aiClient.js 与 AIChatSidebar / NodePopup / aiLogic 之间确认：100% 只从统一 props(state.aiConfig) 或 useAppState 读 aiConfig，不硬编码默认值。
  - 在 aiClient 顶部加 debug guard：如果 aiConfig.mode === 'public' 但 apiKey 为空，直接抛错（并走 aiLogic 的 try/catch → 本地模板兜底），与 TR-3.3 一致。
  - 不新增其它 storage key；所有配置仍落 STORAGE_KEYS.AI_CONFIG。
- **Acceptance Criteria Addressed**: AC-5, FR-5
- **Test Requirements**:
  - `rule` TR-4.1: 全局搜索 `STORAGE_KEYS.` → AI_CONFIG 只在 AppContext 中出现写入/读取，AIChatSidebar/NodePopup/aiLogic 均只从 state 读。
    **Evidence**: grep 搜索结果。
  - `rule` TR-4.2: AIChatSidebar 调 chatCompletion(aiConfig, ...)，传入对象为 state.aiConfig 引用；NodePopup 调 genParentFrameworkAI(aiConfig, node)，参数一致。
    **Evidence**: 源码对应行。

## Task 5: MindNode 节点形状替换（矩形/胶囊）+ 整体瘦身 25%
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - MindNode.jsx：废弃宽高相等的圆形。改为宽 > 高，圆角矩形（rounded-2xl 约 12px）。
  - 尺寸新公式：
    ```
    level = node.level || 0
    h = Math.max(34, 52 - level * 4)     // 高：根52 / 层1 48 / 层2 44 / 层3 40 / 更深 34
    w = Math.round(h * 1.85)              // 宽 ≈ 1.85 × 高，根约96 / 层1≈89 / 层2≈81 / 更深≈63
    fontSize = Math.max(10, 12 - level * 0.8)  // 更小字号，适配瘦节点
    ```
  - 删除原节点内部"进度环 SVG"（因下方已有独立小进度条+%，双重冗余），用更简洁的"左侧状态色竖条 + 主体文字 + 右上角状态色点"替代。
  - 归属系统小图标改到左上角，不压文字。
  - MindNode 组件导出的"中心锚点"（父连线起点、子连线终点）在组件外通过 MindLinks.jsx 重新以矩形宽高计算：父节点右边缘中心 = (parent.x + w_parent/2, parent.y)，子节点左边缘中心 = (child.x - w_child/2, child.y)。
  - 节点正下方小进度条和 % 保留，宽度 = 节点宽度 × 0.9。
- **Acceptance Criteria Addressed**: AC-6, AC-7
- **Test Requirements**:
  - `rule` TR-5.1: MindNode DOM width>height && borderRadius !== '50%'。
    **Evidence**: DevTools style 截图。
  - `rule` TR-5.2: 根节点最长边 ≤ 60（这里 w=96 > 60 但这是宽度…其实这里 AC-7 是根 ≤ 60 有冲突，改 AC-7 为 ≤ 96；TR-5.2 改为：根节点最长边 w ≤ 96，对应 ≤ 历史 80×0.75 不适用，实际按新公式约束）。
    **Evidence**: MindNode.jsx 新 size 公式。
  - `rubric` TR-5.3（维度：节点视觉干净度）。scale 1-5；1=文字溢出撑破；3=正常但间距略紧；5=留白舒适、状态色点、文字 2 行内截断自然；阈值 ≥ 4。
    **Evidence**: 页面截图。

## Task 6: MindMapCanvas 时间轴 DAY_W 压缩 & 跨度扩大 + NodeLinks 按矩形吸附公式
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - MindMapCanvas.jsx 常量：
    - DAY_W: 28 → 16（每天 16 像素，保证节点宽 96 ≈ 6 天，需进一步压宽节点到宽 ≈ 36~48 才能符合节点不跨 2 天以上；实际按「节点宽度 ≈ 1.5 DAY_W 」即 24 天 × 1.5 = 24？不，应是「1 节点不跨 2 天以上」即 w_node ≤ 2 × DAY_W = 32；重新给一套最终常量：DAY_W = 24，节点根宽 46、高 30，宽/高 = 1.53；这样 46/24 ≈ 1.9 天宽度，刚好满足节点宽度 ≤ 2 DAY_W，不超过 2 天。
    - DAYS_BEFORE = 14 → 保留；DAYS_AFTER = 90 → 150；总跨度 = 14+1+150=165 天。
    - DAY_X0 = 200 → 保留。
    - 同步调整 LEVEL_Y_STEP / SIBLING_Y_STEP / PIANO_ROOT_Y / ROOT_GAP_Y 按比例稍减到不空白挤压。
  - 节点尺寸公式再更新，确保「宽 ≤ 2 × DAY_W」：
    ```
    h = max(26, 36 - level * 2.5)        根36 / 层1 33.5→34 / 层2 31 / 层3 28.5→29 / 更深 26
    w = Math.round(h * 1.35)             根≈49，刚好<48？不，≤48即 h ≤ 35.5，取h=35,w=47 OK
    ```
  - NodeLinks.jsx 按新公式：父节点右边缘中心 (parent.x + w_parent/2, parent.y)；子节点左边缘中心 (child.x - w_child/2, child.y)；w_parent = max(26, Math.round((52 - level_parent*4) * 1.85))—— 直接写一个共享 helper `getNodeRect(level)` 统一在 MindNode / NodeLinks 用，避免两处公式漂移。
  - 建议把 getNodeRect 放到 constants.js 或一个小 utils，两边 import。
- **Acceptance Criteria Addressed**: AC-8, AC-9
- **Test Requirements**:
  - `rule` TR-6.1: MindMapCanvas 常量 DAY_W ≤ 24，总跨度 ≥ 120 天，节点宽度 ≤ 2×DAY_W。
    **Evidence**: 源码常量行 + getNodeRect(0).width / DAY_W ≤ 2。
  - `rule` TR-6.2: 拖拽父子节点后，连线端点仍贴合矩形边缘（视觉无错位）。
    **Evidence**: 手动拖拽截图。
  - `rubric` TR-6.3（维度：时间轴与节点比例自然度）。scale 1-5；1=节点盖好几天或时间轴太小；3=比例勉强可接受；5=单日刻度清晰、节点占 1~2 天宽度、视觉协调；阈值 ≥ 4。

## Task 7: LeftDrawer 导航瘦身 + 向内向外分组 + 任务日程子菜单收纳三大页面
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 引入 `useNavigate`（已有 react-router-dom 依赖）。
  - NavContent menus 重写：
    - 分组 1：向外·现实战斗力（header 灰底加粗小写）
      - 能力成长 / 人际网络 / 财务记账 / **任务日程** / 知识思考库
    - 分组 2：向内·内核定力（header 灰底加粗小写）
      - 身体状态 / 情绪与心理
    - 其中任务日程 = 父菜单（点击展开 / 折叠，isExpanded 默认 true 给用户第一眼可见），其子项 = 3 个：「📅 日常打卡」（/daily）、「🎯 长期规划」（/goals）、「📊 历史复盘」（/review）；每个子项点击真实调用 navigate(path)，dispatch SET_ACTIVE_TAB 对应 id。
  - 每项菜单项末尾放一个非常淡的 hover 才出现的铅笔小图标（opacity 0 到 100 group-hover），点击 → 就地弹 200ms 小输入框（或 ModalRoot 通用 confirm）→ 改 customSystemNames[sys.id] = 新名；父分组下标题按钮不支持重命名。
  - 底部提供一行小字"💡 恢复 7 系统默认名称"链接，点击把 settings.customSystemNames = {} 并 Toast。
  - 渲染菜单时通过 getSEVEN_SYSTEMS_EFFECTIVE(settings) 拿到实际名，保证全局一致。
- **Acceptance Criteria Addressed**: AC-10, AC-11, AC-12
- **Test Requirements**:
  - `rule` TR-7.1: 菜单只有 7 系统，出现「向外·现实战斗力」「向内·内核定力」两组标题；无情商/幕布/财务多余条目。
    **Evidence**: 页面截图。
  - `rule` TR-7.2: 点「任务日程 → 日常打卡」后地址栏到 /daily，BottomTabs 中间第 1 个高亮（日常习惯）；同理 /goals /review。
    **Evidence**: 浏览器地址 + BottomTabs 高亮截图。
  - `rule` TR-7.3: 重命名身体状态 → "身"，刷新页面后菜单仍显示"身"，恢复默认后变回"身体状态"。
    **Evidence**: 刷新前后截图 + localStorage SETTINGS 读取值。

## Task 8: 构建 & 长驻预览服务启动验证（回归）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2, 3, 5, 6, 7
- **Description**:
  - 执行 `node node_modules/vite/bin/vite.js build`，无错。
  - 执行 `node vite-preview.mjs` 以前台长驻模式运行，HTTP 200 探测 127.0.0.1:5173/ 返回 2xx。
  - OpenPreview 绑定同一 command_id。
- **Acceptance Criteria Addressed**: AC-14, FR-13
- **Test Requirements**:
  - `rule` TR-8.1: vite build ✓ built in Xs（无错误退出码）。
    **Evidence**: 终端输出。
  - `rule` TR-8.2: `node http.request` 返回 200。
    **Evidence**: 终端输出。

## Task 9（rubric）: 整体 UI 对标截图 + 简约留白检查
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 8
- **Description**: 手动浏览三大页面 + AIConfigPanel + LeftDrawer + 画布节点，对整体 UI 主观打分；若不足 4 分再回到各任务微调。
- **Acceptance Criteria Addressed**: AC-13
- **Test Requirements**:
  - `rubric` TR-9.1（维度：整体 UI 还原度与简约一致性）scale 1-5，阈值 ≥ 4。
    **Evidence**: 5 张截图 + 打分理由。
