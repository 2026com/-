# 双页打卡+空白初始化 实现计划

## Repository Research

### 当前页面结构
- 路由 `/daily` 指向 [DailyHabitsPage.jsx](file:///d:/小美/src/pages/DailyHabitsPage.jsx)，由 `App.jsx` 的 `<Route path="/daily">` 映射，底部三栏导航 `BottomTabs.jsx` 保持不动（日常/长期/复盘）。
- 现有页面包含：顶部渐变概览卡（完成率%）→ 3个桌面小组件按钮（当日待办/番茄钟/快速打卡）→ 习惯纵向列表。不符合「3×3九宫格」+「临时打卡5列横排」要求。

### 数据存储现状
- `AppContext.jsx` initialState 读取 `habits/checkins/nodes/timerRecords/aiHistory` 全部由 `initMockData()` 初始化示例数据。
- 现有示例：16个画布节点（钢琴+网安）+ 4个习惯 + 30天打卡记录 + 2条计时 + AI对话历史。需求要求 **全部取消，空白可添加**。
- Context reducer 目前支持 `ADD_HABIT / UPDATE_HABIT / TOGGLE_CHECKIN`，缺少「临时任务」的 action 和存储 key。
- `constants.js` 的 `STORAGE_KEYS` 缺少临时任务 key；`DATA_VERSION` 需要递增才能触发自动清旧。

### 组件约束
- 卡片样式统一：浅灰白底 `bg-slate-50` + `border-slate-200` 细边框；不彩色、不便利贴风格。
- 日常打卡：3列3行 grid，最多9格；超出需考虑翻页或滚动。
- 临时打卡：5列1排 grid，单行横排；卡片右下角铃铛图标。
- 切换按钮：顶部「日常打卡」「临时打卡」两个按钮，使用 抽屉/面板 式切换（可使用 opacity + transform 做平滑过渡，保持同一DOM层级不跳转）。

---

## Files and Modules

| 文件 | 改动内容 |
|---|---|
| [constants.js](file:///d:/小美/src/utils/constants.js) | 新增 `TEMP_TASKS` storage key；升级 `DATA_VERSION` 到 `1.0.2-20260814-blank-init-dualtabs` |
| [mockData.js](file:///d:/小美/src/data/mockData.js) | `initMockData()` **清空所有示例数据**：nodes=[]、habits=[]、checkins={}、timerRecords=[]、aiHistory=[]、settings=DEFAULT_SETTINGS，仅保留 settings 写入；写入 TEMP_TASKS=[] |
| [AppContext.jsx](file:///d:/小美/src/context/AppContext.jsx) | 1. initialState 新增 `tempTasks: storage.get(STORAGE_KEYS.TEMP_TASKS, [])`；2. reducer 新增 `ADD_TEMP_TASK / UPDATE_TEMP_TASK / DELETE_TEMP_TASK / TOGGLE_TEMP_TASK_DONE` 4个 action（含 localStorage 同步）；3. IMPORT_ALL 分支补上 tempTasks 读取 |
| [DailyHabitsPage.jsx](file:///d:/小美/src/pages/DailyHabitsPage.jsx) | **整体重写**：顶部标题/日期/进度条 → 切换按钮行 → 面板容器（日常视图 + 临时视图，面板抽屉式切换）。只实现结构、切换、空白卡片占位，不做弹窗/校验等复杂交互。新增按钮先弹 toast 占位提示 |

---

## Implementation Steps（按依赖顺序）

1. **常量层改**：`constants.js` — 新增 `STORAGE_KEYS.TEMP_TASKS`，升级 `DATA_VERSION`。
2. **数据层清空**：`mockData.js` — `initMockData()` 清空 nodes/habits/checkins/timerRecords/aiHistory，保留 settings + 新增 TEMP_TASKS=[] 写入。
3. **状态层扩展**：`AppContext.jsx` — initialState 加 `tempTasks`；reducer 加 4 个临时任务 action；state.habits 计算兼容空数组；IMPORT_ALL 同步。
4. **页面层重写**：`DailyHabitsPage.jsx` 整页改写：
   - `const [view, setView] = useState('daily')` 切换状态；
   - 顶部统一标题区 + 进度条；
   - 切换按钮：日常打卡/临时打卡（按下有 active 高亮）；
   - 面板容器：日常视图 3×3 九宫格（9个卡片，`state.habits.length === 0` 时显示「点+新增习惯」空占位）+ 顶部3操作按钮（新增习惯/番茄计时/批量打卡 → 先 toast 占位）；
   - 临时视图：`grid-cols-5` 横排5列卡片，卡片右下角🔔小铃铛，顶部按钮「新增临时任务」→ toast 占位；
   - 卡片样式统一 `bg-slate-50 border border-slate-200 rounded-xl aspect-[4/5] p-3`；
   - 切换动画：面板 transition `opacity transform duration-300`。
5. **浏览器验证**：启动 vite → 访问 `/daily` → 验证：① 画布（/goals 页）空无节点 ② 日常视图空占位/3×3布局 ③ 临时视图空占位/5列布局 ④ 切换按钮可点击 ⑤ 控制台0错误。

---

## Dependencies and Considerations

- **DATA_VERSION 是关键**：只有升级版本号才能触发 `storage.clearAll()` + `initMockData()`，确保用户旧示例数据被清空。版本变更后刷新页面才会起效，浏览器验证必须带随机参数或先清缓存。
- **先基础结构后功能**：严格按用户要求「先实现页面结构+切换，确认运行后再补新增/打卡/提醒」——本次计划**不做新增任务弹窗、编辑、打卡动效**，只让按钮点了出 toast，空卡片显示占位。
- **BottomTabs 底部导航不变**：`MAIN_TABS` 不改动；`path="/daily"` 路由不改动。
- **临时任务数据模型**（基础结构先占位，后续功能加字段）：`{ id, title, reminderTime:'HH:mm', reminder: true, done: boolean, date:'YYYY-MM-DD', createdAt }`。
- **画布权限放开**：nodes=[] 空状态下 MindMapCanvas 必须不崩溃（已测空数组是安全的，组件里 already handle state.nodes.length===0），用户使用现有 MindNode 弹窗「➕」可自由新增节点，符合「最大权限随意修改」要求。

---

## Validation

- [ ] 浏览器访问 `/daily`，控制台 0 error
- [ ] 日常打卡视图：3列×3行空卡片矩阵，顶部有「新增习惯/番茄计时/批量打卡」三个按钮，按钮点击出 toast
- [ ] 临时打卡视图：5列横排卡片矩阵，底部空占位，右上角🔔，顶部「新增临时任务」按钮→toast
- [ ] 切换按钮可正常切换，无页面跳转
- [ ] 访问 `/goals` 画布页：无任何预置节点，画布为空白（只有坐标轴1-12月），符合「节点全部取消」
- [ ] 点击画布上的「➕」新增按钮：可以正常新增根节点（用户最大权限验证）

---

## Risks

| 风险 | 应对 |
|---|---|
| DATA_VERSION 未及时触发清旧，导致旧数据残留 | 验证时强制 `localStorage.clear()` + 硬刷新再测一次；若自动清失败则补一个「首次加载判空逻辑」兜底 |
| 临时任务 action 缺失导致后续功能无法扩展 | 本次先把 4 个核心 action 一次性加齐，不会影响当前空结构 |
| 切换动画过渡不平滑 | 用 `inactive: opacity-0 pointer-events-none translate-x-4` + `active: opacity-100 translate-x-0` 确保在同一层级 |
| 3×3 或 5列 grid 在手机宽度溢出 | 使用 `grid-cols-3 gap-2` 或 `grid-cols-5 gap-2` + `aspect-ratio` 自适应；必要时外层 wrap `overflow-x-auto` |
