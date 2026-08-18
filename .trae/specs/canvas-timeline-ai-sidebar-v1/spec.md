# 幕布时间轴改造 + AI侧边对话 规格说明书

> 自然语言：中文
> 创建时间：2026-08-14
> 版本：v1.0

---

## 一、问题陈述（P0 两大模块 + 保留 6 条）

**模块一：幕布 2 处 BUG 修复**
| # | 原问题 | 根因/风险 |
|---|---|---|
| B1 | 双击空白创建节点成功率低 | `onDoubleClick` 在触控/鼠标平移交错时易失焦；画布空白区域 `e.target !== e.currentTarget` 判定过于严苛（连线层/空白提示区双击无效）；空画布引导文案还是"双击新建"，用户改完后需统一改成按钮提示 |
| B2 | 顶部时间轴粒度不对 + 比例不匹配 | 现状是"整月 1~12 月"（MONTH_W=82 / h-16=64px），但节点实际是单日任务/周计划；12 个月跨度只占 12*82=984px 不够长，小屏 12 个月份挤在一个屏里，节点与刻度对齐率低 |

**模块二：新增侧边可收起 AI 对话（V1 纯 UI + 本地存储，不强制联网）**
- 需要：可展开/收起常驻侧边 → 用 DEFAULT_SETTINGS 已预留 drawerMode='nav'|'ai' + drawerOpen=true
- 需要：聊天记录 localStorage → STORAGE_KEYS 已有 AI_HISTORY
- 需要：模型 API 配置面板（DeepSeek 优先，预留多模型兼容）→ STORAGE_KEYS 缺 AI_CONFIG，新增
- V1 约束：暂不强制发起真实网络请求，失败/无密钥就走 V1 占位响应（显示友好提示"未配置 API Key"或回显提问）

**保留 6 条已完成历史功能（硬红线，不允许误删）**
见 §§ FR3。

---

## 二、目标 & 非目标

### Goals
| # | 目标 |
|---|---|
| G1 | 双击空白创建节点 → 改"显眼按钮 + 空画布 CTA 按钮"新建，创建成功率 100%（0 失焦失败）；新建仍强制 prompt 命名 |
| G2 | 顶部时间轴：月→单天（365+ 天或 N 周范围），以线条/刻度形式，整体跨度 ≈3000px 画布；比例与节点进一步协调（节点 80px 根）|
| G3 | 侧边可收起 AI 对话：默认 nav / 点切换按钮 ai / 发送按钮回车皆可 / 聊天记录自动写入 localStorage / 刷新不丢 |
| G4 | 模型配置面板：Provider 下拉（DeepSeek / 通义千问 / 智谱 / 自定义 URL），API Key 输入框（password 类型），Base URL，默认 Model ID；配置走本地存储 |
| G5 | V1 无需 AI 也可完整手动使用：无 API Key / 网络失败时显示占位友好提示，不阻塞任何手动工作流 |
| G6 | 严格保留全部 6 条历史已完成功能（父子节点树/弹窗两标签/下发打卡/连线+进度条/空格新建/简约不预置） |

### Non-Goals（不做）
- NG1：V1 不做流式逐字打字机输出（风险：521562 经验显示 innerHTML 拼接 2x bug → V1 整段输出，V2 再考虑）
- NG2：不做联网工具/搜索/记忆版本化（V1 普通上下文问答，不实现 892115 的记忆/搜索路由分层，留二期）
- NG3：不新增任何云同步/账号系统（V2 二期预留注释已有，不在本期）
- NG4：节点创建新增时不要 AI 自动推荐名称（仍强制用户输入命名，符合 RET 保留功能 2）
- NG5：不做侧边栏最小化后浮窗图标（TBD 留用户反馈后加）

---

## 三、功能需求（Functional Requirements）

### FR1：幕布"双击→按钮"新建节点（B1 修复）
- 规则 FR1.1：移除 `MindMapCanvas.onCanvasDblClick` 函数 + `<... onDoubleClick={...}>` 绑定（2 处都删，L154-189 & L200）
- 规则 FR1.2：**第一处显眼按钮**（右下角操作工具栏追加）→ LongTermGoalsPage L56-125 工具栏 → 第 1 行追加「➕ 新建长期目标」按钮（9×h-9，样式与现有工具栏一致 bg-indigo-50 text-indigo-700）
  - 点击后：复用原 onCanvasDblClick PUSH_MODAL prompt 逻辑（弹窗一样：强制输入标题，空字符串不创建）
  - 创建后节点放在"画布居中可见位置" = 当前 offset 反推（`nx = (containerWidth/2 - offset.x) / zoom; ny = (containerHeight/2 - offset.y) / zoom`），不要求点击精确位置（因为是按钮，不是定位双击）
- 规则 FR1.3：**第二处空画布 CTA** → MindMapCanvas L249-256 `state.nodes.length===0` 引导区 → 现有纯文案 + emoji 改成"大号按钮 + 辅助文案"：
  ```
  🎯 你还没有长期目标
  [ + 新建第一个长期目标 ] （主按钮）
  · 拖拽移动节点 · 双指/右下角缩放 · 点击节点弹出操作面板
  ```
  - 按钮点击：同样触发同一 ADD_NODE 强制命名流程
- 规则 FR1.4：保留 RET2「新建节点强制输入名称」 → prompt title 仍需 `(val||'').trim()` 后非空才 ADD_NODE；禁止默认名
- Rubric（新建成功率 0-2）：触控/鼠标/缩放 50% / 拖拽 3 次后再点 「➕ 新建」→ 每次都弹 prompt，不吞事件。2=5/5 次全弹；1=≤1 次吞事件；0=≥2 次失败。

### FR2：顶部时间轴改日粒度线条形式（B2 修复）
- 规则 FR2.1：粒度从月→日（不是整月，是单天日期）
  - 范围：**从今日开始，向前 14 天 + 向后 90 天，共 105 天**（14+1+90=105，覆盖历史+季度未来规划）
  - 每天步长 `DAY_W = 28px` → 总跨度 = 105 × 28 = 2940px ≈ 3000px（显著扩大画布跨度）
  - `DAY_X0 = 200`（画布左侧起点，比原来 260 更靠左，留出滚动空间）
- 规则 FR2.2：时间以线条形式展示（不是"月份文字分散"，是一整条横向时间线 + 垂直刻度）
  - DOM 结构：
    ```
    <绝对定位 容器  h-20（80px = 节点根 80×1.0，比例微调，比 h-16 更高） top-4 >
      <横向时间主线条 y=30px，从 today-14 → today+90 总长，高度2px bg-slate-300 />
      每日刻度（105 根小竖线）→ h-4 普通 / 每 7 天的"周日" h-10 大刻度（周日分隔）+ 数字日期文字"14 号"
      每周日下方追加"第X周"的周标签（9-12px slate-600）
      <今日指示器：红色小三角，在 today 的 x 位，height 16px />
    </绝对定位>
    ```
- 规则 FR2.3：节点坐标映射（现有自动布局的 MONTH_W × monthIndex 要兼容）
  - 自动布局 useEffect L53-91 中，`n.monthIndex` 若仍存在：保留旧公式 + 旧数据兼容；新增的节点默认放 today+N 天的 x 位 → `newX = DAY_X0 + (14 + offsetDay) * DAY_W`（offsetDay 由子节点 index 在同兄弟中错开 0/3/7 天）
  - 同月份兄弟节点 y 错落公式不变，仅 x 从"月→日"重新分布：根节点在 today x；直接子节点在 today + i*7 天（每子 1 周错开）
- 规则 FR2.4：比例与间距修正
  - 时间轴容器 h-20 = 80px（与节点根 80px **同高**，比例 1:1，视觉更协调；原 h-16=64 比例 0.8 略低）
  - 初始 offset y 从 T3 的 140 → **160**（再多留白 20px，因为时间轴 h 从 64 → 80 增长 16px）
  - 月份轴 `transform: translate(${offset.x}px, 0) scale(1)` → 保留"不跟随 zoom 缩放"（保证时间轴刻度始终 28px/天，不被缩放压缩挤在一起），但跟随 x 方向平移
- Rubric（时间轴跨度/比例 0-2）：渲染 105 天 → 刻度总宽 ≥ 2800px；今日与 30 天后两个节点不重叠；今日指示器在 today 刻度正确位置。2=3 项全满足；1=仅 2 项；0=1 项或以下。

### FR3：新增侧边可收起 AI 对话（利用已有 drawerMode）
- 规则 FR3.1：复用默认设置 `drawerMode: 'nav' \| 'ai'` + `drawerOpen: true` → 不新增任何新 reducer action，复用 `TOGGLE_DRAWER_MODE` / `TOGGLE_DRAWER`（L54-64 已有）
- 规则 FR3.2：左侧导航栏 或 页面某处追加「切换 AI/导航」按钮（位置：**导航栏底部切换按钮**，原 NavPage 如果有，就在导航栏尾部加一个 🔀 切换到 AI；V1 放在长期目标页面左上角/或 NavPage 组件底部统一入口。本 spec 选择：**在长期目标 LongTermGoalsPage 工具栏（现有左下/右下外）再加一个「侧边切换」按钮** —— 优先放在左下角四色状态栏的右边，加一个 `🤖 AI` / `🧭 导航` 切换按钮（高对比、显眼）。点击 → dispatch TOGGLE_DRAWER_MODE
- 规则 FR3.3：侧边 AI 组件（`components/ai/AIChatSidebar.jsx` **新建组件**，不塞进现有文件）
  - 顶栏：标题 "🤖 AI 助手" + 右 2 按钮：「⚙️ 配置」（打开配置面板） / 「🗑 清空对话」（二次确认）
  - 中间消息区：`ul / div flex flex-col gap-3 overflow-y-auto`，每条消息：用户消息居右青灰；AI 消息居左白底 rounded-xl shadow-sm
  - 底部输入区：textarea 高度 60px auto + 发送按钮 ➕；**Ctrl/Cmd + Enter 发送** + Enter 回车发送
- 规则 FR3.4：普通问答逻辑（V1 不强制联网）
  - 发送时：构造 message { id: uid('msg'), role: 'user', content: text, createdAt: Date.now() }
  - 如果 "已有配置的 baseUrl 非空 且 apiKey 非空" → 尝试 `fetch(baseUrl + '/chat/completions')` POST：
    - headers: Authorization: `Bearer ${apiKey}`, Content-Type: 'application/json'
    - body: model = aiConfig.modelId || 'deepseek-chat'; messages = aiHistory.map(m=>({role:m.role, content:m.content})) + 当前 user 消息（截断到最近 10 条避免过长）
    - 成功：把 choices[0].message.content 存为 role='assistant' 消息 → 写 storage
    - 失败 / 无配置 / 无网络：**V1 占位响应**（显示"⚠️ 未配置模型 API Key，或网络不可用。当前为 V1 占位模式：已收到您的提问「$content」。请到右上角 ⚙️ 配置您的 DeepSeek/第三方模型 API Key 后获得真实回答。"）
  - 重要：无论是否调通，**都不能崩溃**，用户主工作流（节点新建/编辑/打卡）完全不受影响 → 使用 try/catch + 10 秒 fetch 超时 AbortController
- 规则 FR3.5：聊天记录存储在 localStorage，刷新不丢
  - 每次发送/响应后：dispatch 更新 state.aiHistory（reducer 缺这个 action！需要 **新增 reducer action：APPEND_AI_MESSAGE** + **RESET_AI_HISTORY** 2 条 action，写 STORAGE_KEYS.AI_HISTORY）
  - 上限：最多保留最近 **200 条**消息（超过后从前面删 50 条，防止无限增长）
- Rubric（AI 对话可用性 0-2）：发送 3 条 → 刷新 → 3 条仍在；清空后 0 条；无 API Key 时回复占位提示且不崩溃。2=3 项全过；1=2 项；0=1 项或以下。

### FR4：模型 API 配置面板（DeepSeek 优先 + 多模型预留）
- 规则 FR4.1：Provider 下拉枚举（V1 支持 4 个可扩展）：
  - DeepSeek（默认）→ 预填 baseUrl: 'https://api.deepseek.com/v1'，model: 'deepseek-chat'
  - 通义千问（DashScope）→ baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'，model: 'qwen-plus'
  - 智谱 AI → baseUrl: 'https://open.bigmodel.cn/api/paas/v4'，model: 'glm-4-flash'
  - 自定义 OpenAI 兼容 → baseUrl: ''（用户填），model: ''（用户填）
  - 切换 Provider 时：如果用户**没改过**当前 baseUrl/model，自动填入模板；如果用户改过，保留自定义值不覆盖（防误写）
- 规则 FR4.2：字段 5 项：
  1. Provider （下拉，必填）
  2. API Key （password 输入框 type=password 带👁切换显示，必填）
  3. Base URL（text，DeepSeek/通义/智谱有预设，自定义需用户填）
  4. Model ID（text，必填）
  5. 「测试连通性」按钮（发 1 条"Ping"消息，成功显示✅ 连接成功 / 失败 ❌ 显示错误提示）
- 规则 FR4.3：安全：API Key 仅本地 localStorage 保存，绝不 console.log；表单提交时校验 baseUrl 前缀 http/https
- 规则 FR4.4：**新增 STORAGE_KEYS.AI_CONFIG = 'growth_app_v1_ai_config'**；**升级 DATA_VERSION** 为 `1.0.5-20260814-timeline-daily-ai-sidebar`（触发旧用户版本校验自动清旧 mock）
- 规则 FR4.5：配置面板内"测试连通性"失败时，不把用户带回空页面/不影响主流程 → 仅 toast 报错

### FR5：保留全部 6 条历史功能（硬红线，禁止误删）
1. RET1：父子级树状节点 / 拖拽升降级 / 父级 AI 宏观 + 子级 AI 具体
2. RET2：长期目标弹窗仅【方案】【配置】两标签；配置仅截止日期+权重；**强制命名**
3. RET3：子节点一键下发到日常打卡
4. RET4：连线吸附节点边缘不错位；节点下方挂独立进度条 + % 数值
5. RET5：日常 3×3 / 临时 1×5 删新增按钮，空格直接新建 / 有卡三区分离编辑+打卡
6. RET6：简约大留白，不预置示例任务

---

## 四、非功能需求（NFR）

| # | 分类 | 要求 |
|---|---|---|
| NFR1 | 兼容性 | 不破坏 T0-T5 已修复的前次改动（连线吸附/独立进度条/打卡交互/瘦身节点） |
| NFR2 | 性能 | AI 消息 200 条渲染流畅；输入/发送 60fps；配置面板首次打开 < 80ms |
| NFR3 | 依赖 | 0 新增 npm 依赖；使用原生 fetch + AbortController；不引入 axios |
| NFR4 | 安全 | API Key 输入 type=password；不对 key 做任何 console.log；fetch 只请求用户填入的 baseUrl |
| NFR5 | 数据 | 无 API Key / 请求失败时不阻塞整体系统（降级为占位响应），符合"整套系统无需 AI 也可完整手动使用" |
| NFR6 | 一致 | 新增组件风格与现有保持一致：rounded-xl / bg-white/95 backdrop-blur / slate-200 细边 / shadow-sm / text-sm |

---

## 五、约束 & 开放问题

### 硬约束
- C1：不强制 AI 联网 → V1 **必须** 有无 API Key 都能完整手动工作（不能出现"必须配置 key 才能进入页面"的阻塞）
- C2：保留 6 条历史功能不动（RET1-RET6）
- C3：新建节点仍强制 prompt 命名，禁止默认名
- C4：API Key 只能写本地 localStorage，**不做**任何外发日志/埋点/云同步
- C5：不新增 npm 依赖（0 依赖原则）

### 开放问题（在规格中已决策如下，如需改动用户审批后再改）
- O1：时间轴日粒度范围定多少 → **14 天过去 + 今日 + 90 天未来 = 105 天总跨度**（够用季度规划）
- O2：AI 侧边切换入口位置 → **左下角状态栏右侧追加「🤖 AI / 🧭 导航」切换按钮**（显眼，不挤压工具栏 + 不改动导航栏组件共享逻辑）
- O3：AI 聊天消息最多保留多少 → **最近 200 条**，防止 localStorage 爆
- O4：API 调用失败/无 Key 占位响应显示什么 → **友好提示 + 回显已收到提问**（不假装已回答）

---

## 六、验收标准（AC）

### 模块一 幕布 BUG 修复
| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-B1-1 | rule | MindMapCanvas `<... onDoubleClick>` 绑定 + onCanvasDblClick 函数 2 处全部删除 | Grep onDoubleClick / onCanvasDblClick → 0 命中 |
| AC-B1-2 | rule | 右下角工具栏"➕ 新建长期目标"按钮存在（显眼，点击弹 prompt） | 截图 + DOM inspect 可见；点击后弹输入框；取消不新建；输入空字符串不新建 |
| AC-B1-3 | rule | 空画布 CTA 大按钮存在（0 节点场景可见） | 截图：无节点时显示「+ 新建第一个长期目标」按钮；点击弹 prompt → 正常 ADD_NODE 后消失 |
| AC-B1-4 | rubric | 新建节点成功率（触控/鼠标/缩放 50% / 拖拽后 5 次操作） | 0-2，≥1.5 通过；5/5 次弹=2 / ≤1 次吞=1 / ≥2 次=0 |

| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-B2-1 | rule | 时间轴日粒度 105 天（今天-14 → 今天+90）| DOM 中 ≥ 105 根天刻度竖线；span 总宽 ≥ 2800px（≈ 105×28=2940）|
| AC-B2-2 | rule | 线条形式展示：1 条主横线 + 每 7 天周日大刻度 + 日期文字 + 周标签 + 今日红色小三角指示器 | 视觉：主横线（2px 2940px）+ 周日 15 根大刻度 + ≥ 15 个日期数字 + ≥ 15 个"第X周"标签 + 红色三角 1 个 |
| AC-B2-3 | rule | 节点与日刻度间距 0 重叠；今日节点中心 x ≈ 今日刻度 x（误差 ≤ 5px） | 今日节点刻度对齐检查 DOM x 差 ≤ 5px；8 节点 0 重叠 |
| AC-B2-4 | rule | 比例：时间轴容器 h-20=80px，与节点根 80px 比例 1:1；初始 offset y = 160（留白合理） | inspect h = 80；节点与时间轴留白 ≥ 80px |
| AC-B2-5 | rubric | 时间轴整体美观度与跨度合理 | 0-2，≥1.5 通过 |

### 模块二 AI 侧边 + 配置面板
| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-AI-1 | rule | 侧边可展开/收起：drawerOpen=true 显示 / false 隐藏；drawerMode=ai 时显示 AIChatSidebar 组件 / nav 时显示导航 | Grep TOGGLE_DRAWER / TOGGLE_DRAWER_MODE 2 个 reducer action 仍在 + 无新增重复 action；2 种模式切换不刷新 |
| AC-AI-2 | rule | 切换按钮（左下角）：点「🤖 AI」→ drawerMode = ai；点「🧭 导航」→ drawerMode = nav | 点击 2 次实际 state 切换生效；toast 不需要 |
| AC-AI-3 | rule | 普通问答：发送 3 条消息后刷新，3 条消息完全存在（文字 + 时间不丢） | F5 后消息不减；清空按钮二次确认后 0 条 |
| AC-AI-4 | rule | V1 占位：未配置 API Key → AI 消息回复占位提示（含"未配置模型 API Key"/"已收到您的提问"），页面不崩溃不报错 | 控制台 console 0 error；toast 0 警告；节点/打卡等其他功能全可用 |
| AC-AI-5 | rule | 配置面板 5 字段：Provider/Key(password)/Base URL/Model/测试连通；Provider 切换 DeepSeek 自动填 base/model；自定义需手动填 | Provider=DeepSeek → baseUrl = 'https://api.deepseek.com/v1'；model = 'deepseek-chat' |
| AC-AI-6 | rule | 配置数据写入 STORAGE_KEYS.AI_CONFIG；刷新后不丢；DATA_VERSION 升级到 1.0.5 | Grep 1.0.5 → constants.js 至少 1 命中；AI_CONFIG 非空写 localStorage 后刷新读取一致 |
| AC-AI-7 | rubric | AI 侧边整体可用性（0-2）：对话/清空/配置/切回导航 6 步 | 0-2，≥1.5 通过 |

### 保留功能回归
| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-RET-1 | rule | 弹窗两标签 + 配置无系统分类：Grep NodePopup 执行/番茄/秒表 → 0 命中 + 配置页七大系统 → 0 命中 | Grep 结果 0 |
| AC-RET-2 | rule | 新建节点强制命名：Grep `title:'新目标'/'子任务'` → 0 命中；空字符串输入 ADD_NODE 被拦截 | 空 prompt 点确认 → state.nodes 不增长 |
| AC-RET-3 | rule | 连线吸附：T1 修复保留（NodeLinks getNodeSize + 端点吸附）→ Grep getNodeSize 存在 | Grep getNodeSize NodeLinks.jsx ≥ 1 命中 |
| AC-RET-4 | rule | 日常/临时 空格直接新建 + 无新增按钮：Grep `>新增习惯<` / `>新增临时任务<` → 0 命中 | 0 命中 |
| AC-RET-5 | rule | 节点下方独立进度条：Grep MindNode.jsx `节点正下方独立小进度条` 注释存在 | 1 命中（保留 DOM 结构）|
