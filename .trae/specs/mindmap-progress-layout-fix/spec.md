# 幕布思维导图 / 进度条 / 时间轴 / 打卡方格 四项 BUG 与交互迭代 规格说明书

> 自然语言：中文
> 创建时间：2026-08-14
> 版本：v1.0

---

## 一、问题陈述（P0 全部 4 项）

**Q1. 连线错位（最严重视觉 BUG）**
NodeLinks.jsx 使用节点 (n.x, n.y) 作为贝塞尔曲线起终点，但是 MindNode 实际 DOM 定位是 `left = x - size/2, top = y - size/2`，节点还是**圆形带尺寸对象**（68-96px 直径），连线没有吸附到节点**右边缘**→导致曲线起点和终点都在圆心，被大节点挡住一截+和贝塞尔控制点水平发散的视觉不协调；更严重的是：节点拖拽后仅 UPDATE_NODE x/y，但 SVG  viewBox 与 offset / zoom 组合下，节点和 SVG 使用同一外层 transform（MindMapCanvas 把连线层和节点层都套在了同一个 translate+scale 的 div 里），按说坐标系一致，**真正错位根因是 NodeLinks 用 `preserveAspectRatio="xMidYMid meet"`** —— 这会让 SVG viewBox 在 width:100% height:100% 容器内按比例伸缩，而节点层是按 offset 绝对定位的 raw 像素，不做比例伸缩 → 完全错位！

**Q2. 进度条位置完全错误**
全局大进度条在长期目标页底部（现在应该是不存在的？先读取确认位置，但用户说要移除底部，改为每个节点下方挂载小型独立进度条）。要求：每个节点正下方独立小条 + 百分比文字 + 父节点进度自动汇总子节点。

**Q3. 时间轴与节点比例失调**
- 节点尺寸 Math.max(68, 96 - level*10) → 96px 直径（4 级层级 68/78/88/96），太臃肿
- 顶部月份轴容器 `absolute top-2`（只有 h-10=40px），高度比例 40/96 = 0.42 < 0.8 要求
- 节点自动布局 `SIBLING_Y_STEP = 70`，同级节点如果都是 96px 会重叠
- 时间轴和节点区域之间的留白只有 60px 的 top-2，没有合理间距

**Q4. 打卡交互繁琐**
- 用户要求删「新增习惯」「新增临时任务」按钮
- 日常 3×3（原 3×4 改 9 格）、临时 1×5（原 6×2 改 5 格）
- 点击空格直接弹编辑窗新建；点击已有格直接弹编辑窗修改
- 保留卡片右上角编辑/删除图标备选入口
- localStorage 存储不变，页面初始全空

---

## 二、目标 & 非目标

### Goals
| # | 目标 |
|---|---|
| G1 | 连线 100% 吸附：父节点右边 → 子节点左边（不是圆心），拖拽/升降级/增删/自动布局后连线实时同步刷新，零飘移零脱离 |
| G2 | 进度条 100% 下沉：移除任何"页脚全局大进度条"，每个节点正下方挂载小条 + 百分比文字 + 父级自动汇总后代 |
| G3 | 比例协调：节点瘦身（根节点 ≤ 80px / 最深 ≤ 52px）；月份轴 h = 节点根 h × 0.8；留白均匀 + 横纵节点间距保证不重叠 |
| G4 | 打卡交互一步到位：移除两个"新增"按钮；点击空格新建 / 点击已有格编辑；备用入口保留；网格改 3×3 & 1×5 |
| G5 | 严格保留用户明确要求"不变的 5 条"：无番茄弹窗、节点强制命名、删系统分类、树升降级/下发、AI占位、简约、无预置。 |

### Non-Goals（不做）
- NG1：不引入 SVG 动画（连线渐显等），仅修 BUG 不做花哨动效
- NG2：不接真实 LLM API（AI 继续 UI 占位，遵守保留功能 4 条）
- NG3：不重写打卡弹窗 HabitForm / TempForm 内部校验逻辑（复用现有，只改调用时机）
- NG4：不做节点连线箭头（约束红线：V1.0 禁止前置依赖锁死，保持无箭头）
- NG5：不新增任何 npm 依赖（0 依赖原则延续）

---

## 三、功能需求（Functional Requirements）

### FR1：连线吸附与实时同步（对应 Q1）
- 规则 FR1.1：起点 = 父节点 **右边缘中心点** `(parent.x + parent.size/2, parent.y)`；终点 = 子节点**左边缘中心点** `(child.x - child.size/2, child.y)`（不是圆心、不是节点中心）
  - 注意：NodeLinks 现在不知道节点尺寸！需要把节点 size 也作为字段（或者 NodeLinks 内按 level 算 Math.max(68, 96-level*10) 与 MindNode.jsx 同公式保证一致 → 优先选后者，不新增字段不破坏老数据）
- 规则 FR1.2：SVG viewBox 与 缩放/平移 错位修复（最关键错位根因）
  - **删除 `preserveAspectRatio="xMidYMid meet"`** → 改为 `preserveAspectRatio="none"` 或更好的方案：
    - 直接不写 viewBox，改为 SVG 内所有坐标都按实际像素，且 SVG 外层 style width=viewport 宽 + height=viewport 高；
    - **或使用 ExperienceRecall 成功经验方案 A（统一坐标系）**：SVG 与节点层一起套在同一个 translate+scale 的父容器内（MindMapCanvas 已经这么做了！L210-L214 连线层套了 transform，L218 节点层也套了 transform → 两层 transform 一样），问题是 viewBox 比例伸缩与绝对像素节点不一致，所以**最稳妥解法是移除 viewBox，把 SVG 设为超大尺寸固定画布（比如 width="8000" height="4000"），然后父容器的缩放平移自然带着它走，和节点层坐标完全一致，不做任何比例拉伸**。
    - 本 spec 采用方案 A：移除 viewBox / preserveAspectRatio，SVG 固定一个足够大的绝对坐标画布（8000×6000）与节点层（absolute 无 viewBox）坐标自然 1:1 一致。
- 规则 FR1.3：实时跟随刷新
  - 节点拖拽 UPDATE_NODE → state.nodes 引用变化 → NodeLinks useMemo deps=[nodes] 重新算（已存在） → 曲线自动刷新 ✔（这部分已有，但因为 FR1.2 的 viewBox 伸缩 bug 导致看不到效果）
  - 节点升级/降级（父 parentId 改变）→ useMemo links 重新构建 → 曲线立即重算 ✔
  - 新增/删除 → useMemo ✔
  - 自动布局（MindMapCanvas 的 REPLACE_NODES 批量改 x/y）→ useMemo ✔
- Rubric（连线正确性 0-2）：放大 200% / 缩小 50% / 平移 1000px 后；拖拽 3 个节点到任意位置；5 条连线的起点/终点是否贴在节点边缘且中间无断裂。2=无 1 条错位；1=≤2 条轻微 边缘 5px 内；0=≥3 条 明显脱离节点。

### FR2：进度条下沉 + 自动汇总（对应 Q2）
- 规则 FR2.1：移除 LongTermGoalsPage / MindMapCanvas 内任何"底部全局大进度条"组件（先 Grep 是否存在；不存在则确认不需要移除）
- 规则 FR2.2：每个 MindNode 正下方挂载独立小条
  - DOM 位置：MindNode 返回的最外层 div 里，**节点圆形 div 的后面**，同一个 absolute 容器内再加一个新 div：`position: absolute; left: 50%; top: size + 6px; transform: translateX(-50%); width: size * 0.9;`
  - 进度条高度：4px（不要厚），圆角 rounded-full
  - 背景：bg-slate-200 灰底；填充 bar：按进度颜色映射（0 灰；<50 蓝灰；<100 蓝；=100 绿）+ 长度 = progress%
  - 进度条最右侧附小号文字：`{p}%`，font-size = 9~10px（匹配小体量）；颜色 = slate-600
- 规则 FR2.3：父节点进度自动汇总（递归全后代，不是只算一层直接子）→ 修改 MindNode 内现有的 progress useMemo，**将 children 改为"递归收集所有后代"**：
  - **叶子节点（children.length===0）**：progress = node.progress 自身（老逻辑保留）
  - **父节点（任何有后代）**：progress = 递归 `calcProgress(allDescendants, mode)` 其中 allDescendants 是所有层级的后代数组（不是只一层），真正"自动汇总全部子节点完成状态"
- Rubric（进度条汇总正确性 0-2）：建 1 父 + 3 子 + 2 孙 → 3 子 分别打 0%、50%、100% → 父级显示值 ≈ 50%（误差 ±5）。0=差 20%+；1=误差 10%；2=误差 <5%。

### FR3：比例协调 + 优化自动布局（对应 Q3）
- 规则 FR3.1：节点瘦身（所有层级减 16px）
  - 公式：`size = Math.max(52, 80 - level * 7)`（根 80 / 子 73 / 孙 66 / 曾孙 59 / 更深 52）
  - 对应字号：`fontSize = Math.max(10, 13 - level)`（同步减 1）
- 规则 FR3.2：月份轴高度 = 根节点高度 × 0.8
  - 根节点 h = 80px → 月份轴高 = 80 × 0.8 = **64px**
  - 改 MindMapCanvas L194 的容器样式：从 `h-10 flex items-center px-4 pointer-events-none z-1` → `h-16 flex items-center px-6 pointer-events-none z-1`（h-16 = 64px，px-6 留白更多）
  - 月份字大小改 `text-sm`，刻度线从 h-4 → h-6
- 规则 FR3.3：时间轴与节点区域的上下留白
  - MindMapCanvas L95 初始平移：原先 y = 60，改成 y = **140**（把节点起点下移到月份轴 h-64 = 64px 下方 76px 处留白，不挤压）
- 规则 FR3.4：排布间距优化（保证不重叠）
  - 横向（同父子节点间 x 向）：原 `dx = 160`，节点现在从 96 → 80 仍偏紧 → 改 `SIBLING_Y_STEP = 88`（原 70 → 88，纵向保证同级节点 80px 不重叠）
  - 纵向（LEVEL_Y_STEP）：原 90 → 110
  - MindMapCanvas 中 onCanvasDblClick 的子节点 y 错落公式也相应升级使用新的 STEP
- Rubric（比例与布局 0-2）：0=时间轴 / 节点尺寸比 <0.6 或 节点重叠；1=比例 0.7~0.85 之间，≤2 节点轻微重叠；2=比例 ≥0.78 且 ≤0.85（精确到 0.8），所有节点零重叠，月份刻度 2 对齐节点根部留白均匀。

### FR4：打卡交互改「空格直接新建 / 有卡直接编辑」+ 删新增按钮（对应 Q4）
- 规则 FR4.1：移除两个新增按钮
  - 日常页【新增习惯】按钮（DailyHabitsPage.jsx L130-132 附近 6 行）→ 整个 DOM + onClick 事件处理删除
  - 临时页【新增临时任务】按钮（L232-234 附近）→ 整个 DOM 删除
  - **保留** 其他按钮：批量打卡、视图切换抽屉、批量打卡启动按钮
- 规则 FR4.2：网格尺寸调整（用户明确要求）
  - 日常打卡：从原先 `grid-cols-3 × 12 = 3×4` → `grid-cols-3 × 9 = **3×3 方格**`（常量 GRID_SIZE_DAILY 从 12 → 9）
  - 临时打卡：从原先 `grid-cols-6 × 12 = 6×2` → `grid-cols-5 × 5 = **一排 5 格**`（常量 GRID_SIZE_TEMP 从 12 → 5；className 改 `grid-cols-5`，不用 row）
- 规则 FR4.3：空格点击 → 直接弹新建窗（代替 toast 引导）
  - 原代码日常空格：`if (!habit) { toast(...); return }` → 删除此 toast 行，改为 `if (!habit) { setAddHabitOpen(true); return }`（直接弹 FormModal 新增习惯窗，复用现有的 addHabitOpen state + HabitForm 完全不改动）
  - 临时空格：同理 `if (!task) { setAddTempOpen(true); return }`
- 规则 FR4.4：**已有卡片点击 → 直接弹编辑窗（而不是打卡）**
  - 先思考交互细节：用户明确说"点击已有内容的方格，唤起弹窗进行编辑修改"+"保留原有卡片右上角编辑、删除图标作为备选入口"。那**打卡勾选功能放哪？** → 规则 FR4.4.1：卡片内部保留一个独立的**勾选框区域**（卡片左侧的 ✓ 小按钮，或卡片上半段是勾选框+标题段，点击标题段才算触发编辑）—— 为避免歧义拆成 2 区：
    - 卡片左上角 **小勾选方块**（独立按钮）→ 点这里 = 切换打卡（TOGGLE_CHECKIN / TOGGLE_TEMP_DONE）
    - 点击卡片其他任何区域（除右上角编辑/删除图标的独立 stopPropagation 区 + 左上角勾选区）= 唤起编辑弹窗（已有 habit → setEditHabitId(habit.id)；已有 task → setEditTempId(task.id)）
  - 编辑/删除图标的备选入口：保留原样（hover 出现，点击 ✏️→弹编辑；🗑→confirm 删除），功能不用改
- 规则 FR4.5：现有表单弹窗逻辑完全复用（HabitForm / TempForm / FormModal 的校验、提交、localStorage 写、toast 全部不变；只是调用触发时机变了）
- 规则 FR4.6：日常页保持初始全空（不预置示例任务，DATA_VERSION 已在 T1 升级过，不需要再动）
- Rubric（打卡一步到位体验 0-2）：0=还需要多点一次按钮才能新建；1=点空格可建但编辑点击和打卡冲突；2=新建/编辑/打卡三项入口 100% 分离不冲突，零误操作。

### FR5：保留原功能不变（硬红线，禁止误删）
- 规则 FR5.1：长期目标弹窗只保留【方案】【配置】标签，无番茄计时控件（NodePopup.jsx 已改，禁止改回去）
- 规则 FR5.2：创建新节点强制 prompt 命名（画布双击 + 弹窗内新增子节点 → 禁止硬编码默认名）
- 规则 FR5.3：配置页仅截止日期 + 权重，删除系统分类（保留不变）
- 规则 FR5.4：父子节点支持升级/降级/拖拽移动 + 叶子节点 📤 下发到日常（保留不变）
- 规则 FR5.5：AI 写方案 V1 UI 占位（内置规则模板），不接 API（保留不变）
- 规则 FR5.6：简约大留白风格保持；0 预置示例数据（DATA_VERSION 升级后 mockData 全空）

---

## 四、非功能需求

| # | 分类 | 要求 |
|---|---|---|
| NFR1 | 性能 | 拖拽节点 60 FPS；节点数量 50 个以内连线重算 ≤ 10ms；useMemo 依赖不泄漏 |
| NFR2 | 兼容性 | 不新增 localStorage 字段（进度条新 DOM 不写库；calcProgress 递归不改变存储结构） |
| NFR3 | 依赖 | 0 新增 npm 依赖；不引 d3 / graphlib 布局库 |
| NFR4 | 一致性 | 进度条颜色与现有连线颜色映射一致（done绿 / >50蓝 / >0蓝灰 / 0灰） |
| NFR5 | 代码风格 | Tailwind 原子类 + rounded-full / rounded-xl + slate-200 细边 |

---

## 五、约束 & 开放问题

### 硬约束（不能违反）
- C1：禁止在连线层引入箭头（红线 V1.0 无前置依赖锁死）
- C2：打卡弹窗表单字段严格保持（日常=名称/提醒/耗时/难度；临时=名称/提醒），禁止加字段
- C3：所有交互事件走现有 reducer ADD_HABIT / TOGGLE_CHECKIN / UPDATE_NODE 等，不走 localStorage 直接写
- C4：进度条百分比整数取整，不显示小数

### 开放问题
- O1：用户 Q4 的"日常打卡 3×3 方格、临时打卡一排 5 格"是否是最终网格尺寸？→ **是**（用户原文明确给出）
- O2：点击卡片的打卡勾选/编辑功能怎么区分？→ spec FR4.4 已给出：左上角独立勾选框（打卡）+ 其他区域（编辑）+ 右上角编辑/删除保留；按此执行

---

## 六、验收标准（Acceptance Criteria）
> rule / rubric 二元 + 评分制

### 问题 1 连线吸附类
| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-Q1-1 | rule | 起点/终点严格吸附节点边缘（不是圆心） | 浏览器 DOM inspect 下 5 条随机线起点 x = parent.x + size/2（±1px），终点 x = child.x - size/2（±1px） |
| AC-Q1-2 | rule | 拖拽 3 节点、升降级 2 次、增删 4 节点、自动布局一次 → 每次操作后所有连线实时跟随刷新，0 条脱离 | 录屏 / 视觉检查：0 条线端点脱离节点 |
| AC-Q1-3 | rubric | 缩放 200% / 平移 1000px / 缩小 50% 后连线一致性 | 维度：错位容忍度 0-2；≥1.5 通过。无任何线脱离（2），≤2 条轻微 5px（1），≥3 条严重错（0） |

### 问题 2 进度条下沉类
| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-Q2-1 | rule | 0 个"页面底部全局大进度条" DOM 元素 | Grep LongTermGoalsPage + MindMapCanvas 中 "全局进度" / "总进度" / 底部大 bar 的 className（如 `w-full bottom-*`） → 0 命中；视觉截图无底部大 bar |
| AC-Q2-2 | rule | 每个节点正下方挂载小条 + 百分比文字 | 截图：5 个节点 5 个小条；小条高度 = 4px rounded-full；最右侧附 9-10px % 文字 |
| AC-Q2-3 | rubric | 父级进度递归汇总正确性 | 维度：误差容忍 0-2；≥1.5 通过。建 1 父 3 子 2 孙，子打 0/50/100 → 父级显示值 ≈50%（±5） |

### 问题 3 比例协调类
| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-Q3-1 | rule | 节点瘦身：根直径 80 / 最深 ≥52 | Math.max(52, 80-7*level) 计算正确；节点层 DOM 尺寸实际生效（inspect 节点 width:80/73/66/59...） |
| AC-Q3-2 | rule | 月份轴高度=根高×0.8=64px | 月份轴容器实际 DOM height=64；比例 = 64/80 = **0.8 精确达标** |
| AC-Q3-3 | rule | 时间轴与节点区上下留白合理 + 节点 0 重叠 | 初始渲染 8 节点场景：节点与月份刻度之间 y ≥ 76px；任意两节点边框距离 ≥ 10px（0 重叠） |
| AC-Q3-4 | rubric | 整体视觉比例协调感（0-2） | ≥1.5 通过。0=比例奇怪或挤压；1=基本协调；2=像设计稿一样美观平衡 |

### 问题 4 打卡交互类
| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-Q4-1 | rule | "新增习惯"、"新增临时任务" 按钮 DOM 完全移除 | Grep className/onClick setAddHabitOpen 为触发点但按钮元素已删；截图无按钮可见 → 两个按钮 0 个存在 |
| AC-Q4-2 | rule | 日常 3×3 网格（9 格）/ 临时 1×5（5 格） | GRID_SIZE_DAILY=9; GRID_SIZE_TEMP=5; className grid-cols-3 daily 3行×3=9 个 div; temp grid-cols-5 5 个 div 排成一排 |
| AC-Q4-3 | rule | 点击空格 → 直接弹新建窗（不再 toast 引导） | 日常空 9 格任意一格点击 → 立即弹「新增习惯」弹窗；临时空 5 格任意 → 弹「新增临时任务」弹窗；取消 → 无任务 ADD |
| AC-Q4-4 | rule | 点击已有卡**非勾选区** → 弹编辑窗；点击勾选框 → 切换打卡（进度条联动） | 点击卡片中部文字 → 弹编辑；点左上角勾选 → 变绿 + 完成率变化；右上角编辑/删除 hover 图标仍可操作 |
| AC-Q4-5 | rule | localStorage 持久化保留 | 新建 habit/task → F5 刷新 → 9/5 格里面的卡和之前填的 100% 一致；打卡状态保留 |
| AC-Q4-6 | rubric | 打卡交互误点率（0-2） | ≥1.5 通过。0=经常误触编辑代替打卡；1=偶尔误触但基本可用；2=三区（勾选框 / 编辑区域 / 右上角图标）分离清晰零误触 |

### 功能保留类
| ID | 类型 | 内容 | 通过条件 |
|---|---|---|---|
| AC-RET-1 | rule | 长期目标弹窗 Tabs：只有方案 / 配置 两项；无执行；无番茄/秒表 | Grep NodePopup.jsx 执行/番茄/秒表 → 0 命中 |
| AC-RET-2 | rule | 画布双击 + 节点新增子节点必须 prompt 命名（无默认名） | Grep 硬编码 `title:'新目标'/'子任务'` → 0 命中 |
| AC-RET-3 | rule | 配置页仅 2 项（dueDate/weight） | Grep 七大系统 / 四色状态 / 进度滑块配置 → 0 命中（配置页内） |
