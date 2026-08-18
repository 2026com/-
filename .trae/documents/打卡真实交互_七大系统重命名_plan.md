# 打卡真实交互 + 七大系统名重命名 实现计划

## 一、Repository Research 现状结论

### 1.1 代码结构定位
| 层 | 文件 | 现状 |
|---|---|---|
| 常量层 | [constants.js](file:///d:/小美/src/utils/constants.js#L5-L13) | `SEVEN_SYSTEMS` 目前是「心性训练/自我洞察/习惯修正/主业成长路径/财务风控中心/情商复盘库/健康管理」→ 需要完整替换为用户指定 7 个新名字；`DATA_VERSION` 需要升版本强制刷新缓存 |
| 状态层 | [AppContext.jsx](file:///d:/小美/src/context/AppContext.jsx#L139-L179) | 已有 `ADD_HABIT / UPDATE_HABIT / TOGGLE_CHECKIN / ADD_TEMP_TASK / UPDATE_TEMP_TASK / DELETE_TEMP_TASK / TOGGLE_TEMP_TASK_DONE`；**缺失 `DELETE_HABIT`**；习惯删除 action 必须补齐并同步 localStorage |
| 弹窗层 | [ModalRoot.jsx](file:///d:/小美/src/components/common/ModalRoot.jsx#L27-L101) | 已支持 `toast / confirm / node_action / report`；**缺失自定义表单弹窗类型**，需要新增 `custom`（通用自定义 body+actions） 或 `form_popup`（字段配置式表单）类型，以便承载「新增习惯/编辑习惯/新增临时任务/编辑临时任务/批量打卡」5 个本页弹窗，禁止跳转路由 |
| 页面层 | [DailyHabitsPage.jsx](file:///d:/小美/src/pages/DailyHabitsPage.jsx#L37-L218) | 当前仅基础结构+切换，**所有按钮仅 toast 占位，卡片右上角无编辑/删除图标，卡片点击仅视觉反馈无真实数据操作**；日常视图目前 3×3=9 格，临时视图 5×1 横排 5 格；需要按用户照片排版调整网格规格（日常 3 列×4 行 = 12 格，临时 6 列×2 行 = 12 格）但保持浅灰白底+细边框的简洁风格 |
| 侧边栏 | [LeftDrawer.jsx](file:///d:/小美/src/components/layout/LeftDrawer.jsx#L61-L94) | 直接遍历 `SEVEN_SYSTEMS` 渲染，常量名改完自动生效，无需额外改动 |

### 1.2 经验教训参考（ExperienceRecall #1062012）
- 根因必须沿「数据写入点→初始化读入点→最终渲染入口」链路走，禁止用 setTimeout 赌时序
- 单一数据源：只信 `state.habits / state.tempTasks / state.checkins`，所有增删改查必须走 reducer + storage.set 双写，禁止直接改 localStorage
- 空数据必须给前置条件兜底（习惯数量不足时用空位占位，禁止 `undefined.name` 崩溃）

---

## 二、Files and Modules 改动清单

### 🔧 A. 必改核心文件
| 文件 | 改动 |
|---|---|
| `src/utils/constants.js` | ① `SEVEN_SYSTEMS` 7 个系统名+图标+颜色全替换；② `DATA_VERSION` 升级为 `1.0.3-20260814-real-interactions` 强制刷新本地旧缓存；③ 新增难度枚举（可选简单/普通/困难） |
| `src/context/AppContext.jsx` | ① 新增 `DELETE_HABIT` reducer（删除习惯后，同步清理该习惯所有日期的 checkins 记录，防止 checkins 对象无限膨胀）；② 新增 `BATCH_CHECKIN` action（批量打卡入口） |
| `src/components/common/ModalRoot.jsx` | 新增 `custom` 通用弹窗类型：支持自定义 `title / body(ReactNode) / actions(ReactNode)`，用于承载所有本页表单弹窗，禁止路由跳转 |
| `src/pages/DailyHabitsPage.jsx` | 整页大改：① 按照片排版改网格规格（日常 3×4=12 格 / 临时 6×2=12 格）；② 每卡片右上角加「编辑 ✏️ / 删除 🗑️」图标；③ 新增习惯/编辑习惯/新增临时任务/编辑临时任务/批量打卡 5 个本页真实弹窗；④ 卡片点击真实打卡完成率进度条实时刷新；⑤ 番茄计时选择习惯启动弹窗 |

### ✅ B. 间接自动生效
- `src/components/layout/LeftDrawer.jsx`：渲染时直接 map SEVEN_SYSTEMS，常量更新后无需改动即可生效 7 个新名字

---

## 三、Implementation Steps（依赖顺序）

### Step 1 — 常量层升级：七大系统名新命名 + DATA_VERSION 升版
1. `SEVEN_SYSTEMS` 按顺序替换为：
   ① 身体状态 🧘 紫 `#8b5cf6`
   ② 情绪与心理 💬 粉 `#ec4899`
   ③ 能力成长 💼 蓝 `#3b82f6`
   ④ 人际网络 👥 青 `#06b6d4`
   ⑤ 财务记账 💰 橙 `#f59e0b`
   ⑥ 任务日程 📅 绿 `#10b981`
   ⑦ 知识思考库 🧠 红 `#ef4444`
2. 升 `DATA_VERSION` 为 `1.0.3-20260814-real-interactions`，确保用户打开即清空旧示例与旧结构
3. （可选）定义 `HABIT_DIFFICULTY` = `[{k:'easy',label:'简单'},{k:'normal',label:'普通'},{k:'hard',label:'困难'}]`

### Step 2 — 状态层补齐：DELETE_HABIT + BATCH_CHECKIN
1. **DELETE_HABIT** reducer：
   - 过滤出目标 habitId，从 state.habits 移除
   - 同步清理 checkins 对象中所有 `${date}_${habitId}` 键，避免无限膨胀
   - `storage.set(STORAGE_KEYS.HABITS, habits)` + `storage.set(STORAGE_KEYS.CHECKINS, checkins)` 双写
2. **BATCH_CHECKIN** action（payload: { date, habitIds, value: true/false }）：
   - 批量写入/删除 checkins 对应键
   - 双写 localStorage
3. 回归检查：`IMPORT_ALL` 分支已包含 habits/tempTasks/checkins，无需改

### Step 3 — 弹窗层扩展：ModalRoot 支持 custom 自定义表单弹窗
1. `renderModal()` 新增 `cfg.type === 'custom'` 分支
2. custom schema：`{ type:'custom', title?:string, body:ReactNode, actions?:ReactNode, onClickMaskClose?:bool }`
3. 蒙层点击：默认 `onClickMaskClose=true` 点击蒙层 POP_MODAL；如果是表单提交中可以传 false 防误关

### Step 4 — 页面层大改：DailyHabitsPage.jsx 真实交互全实现（最大头）

#### 4.1 排版对齐照片规格（风格保持现浅灰白底细边框不花哨）
- **日常打卡视图**：`grid-cols-3` × `Array(12)` 共 12 个格位（参考照片 3 列 × 4 行 = 12 张卡片，用户原话"采取排版但是风格不变"）
- **临时打卡视图**：`grid-cols-6` × `Array(12)` 共 12 个格位（参考照片 6 列 × 2 行 = 12 张卡片）
- 日常顶栏 3 按钮保留：新增习惯 / 番茄计时 / 批量打卡
- 临时顶栏 1 按钮保留：新增临时任务
- 卡片风格：统一 bg-slate-50 border-slate-200 rounded-xl，不区分颜色

#### 4.2 每卡片右上角两个小图标（编辑 + 删除）
- 用 `absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity` + 卡片 class 加 `group`
- **编辑 ✏️**：`stopPropagation` 阻止冒泡（防止触发打卡），唤起编辑弹窗回显当前数据
- **删除 🗑️**：`stopPropagation` → 先弹 `confirm` 二次确认「确认删除任务 XXX？删除后不可恢复」→ 确认则 dispatch DELETE_HABIT / DELETE_TEMP_TASK

#### 4.3 卡片主体真实打卡勾选 + 进度条联动
- 卡片除了图标区的其他部分 onClick：
  - 日常 → dispatch `TOGGLE_CHECKIN({ date: today, habitId })`
  - 临时 → dispatch `TOGGLE_TEMP_TASK_DONE({ id })`
- 顶部 todayStats 计算：
  - 日常分母 = `state.habits.length`（不再 min9，现最多 12 展示）
  - 临时分母 = `state.tempTasks.length`
  - 完成后进度条 width 自动更新（React state 变，useMemo 自动重算）

#### 4.4 新增/编辑 5 个本页弹窗（全 custom，不跳路由）

##### ① 新增习惯弹窗（点击【新增习惯】）
字段：
- 任务名称 *（输入框，必填校验空 → toast）
- 提醒时间（time input HH:MM，可选，默认空）
- 预估耗时（number + 单位分/钟下拉，默认 30 分钟）
- 难度（select：简单/普通/困难，默认普通）
提交：
- 9→12 格：校验 habits.length < 12，满则 toast「最多添加 12 个习惯，先删除一个吧」
- dispatch `ADD_HABIT({ title, reminder, estMinutes, difficulty, reminder:true })`

##### ② 编辑习惯弹窗（点击卡片编辑图标）
- fields 同上 + initialValues 取当前 habit
- 提交 dispatch `UPDATE_HABIT({ id, payload })`

##### ③ 新增临时任务弹窗（点击【新增临时任务】）
字段：
- 任务名称 *（必填）
- 提醒时间（HH:MM，必填，默认当前小时:00）
提交：
- 校验 tempTasks.length < 12，满则 toast「临时任务最多 12 条」
- dispatch `ADD_TEMP_TASK({ title, reminderTime, reminder:true })`

##### ④ 编辑临时任务弹窗（点击临时卡片编辑图标）
- fields 同上回显
- 提交 dispatch `UPDATE_TEMP_TASK({ id, payload })`

##### ⑤ 批量打卡弹窗（点击【批量打卡】）
- 列表列出所有 state.habits 未打卡项，每项前面 checkbox
- 底部两个按钮：「一键全部打卡」 / 「确认勾选打卡」
- 确认后 dispatch `BATCH_CHECKIN({ date: today, habitIds, value:true })`

##### ⑥ 番茄计时弹窗（点击【番茄计时】，可选简单版）
- select 选择一个要计时的习惯
- 显示 25 分钟倒计时按钮（启动后可 toast「🍅 番茄钟已启动，专注 25 分钟」，V1.0 不做后台挂钟，先写数据记录）
- 确认后 dispatch `ADD_TIMER_RECORD({ habitId, minutes:25, startAt:Date.now() })`

#### 4.5 卡片内部内容排版（对齐两张照片，风格保持统一）
- **日常卡片**（参考图1）：
  - 上半：标题（粗体 sm，完整显示不截断）
  - 下半左：「X分钟」字（10px，细，slate-500）+ 难度小徽标（可选）
  - 下半右：若完成 ✓ 绿勾 + 下拉箭头样式小图标；若未完成 → 下拉箭头
  - 完成态：ring-2 ring-emerald-400 绿框 + line-through
- **临时卡片**（参考图2）：
  - 上半：标题（xs 粗，完整显示不截断）
  - 下半左：HH:MM 时间（10px slate-500）
  - 下半右：🔔 铃铛（reminder !== false 时显示）
  - 完成态：同样 ring-2 ring-emerald-400 绿框 + line-through

---

## 四、Dependencies and Considerations 依赖与注意

### 4.1 依赖：无需新增第三方库
- 弹窗：复用 ModalRoot + 新增 custom 类型
- 表单：原生 `<input>` / `<select>` / `<label>`，不引 antd/formik，符合 V1.0 轻量约束
- 校验：原生 `.trim()` 空串判断，toast 提示

### 4.2 注意事项（避免踩坑）
1. **事件冒泡防护**：卡片 onClick 是打卡，右上角图标 onClick 必须 `e.stopPropagation()`，否则点编辑会触发打卡
2. **不要重复 set localStorage**：所有数据修改必须走 reducer 内 set storage，禁止在 DailyHabitsPage 内直接 `storage.set()`，破坏单一数据源
3. **空卡片位**：habits/tempTasks 不足 12 个时，剩余位继续显示「＋ 空位/点击新增」占位，保持排版整齐
4. **DATA_VERSION 升版是必须的**：否则用户上轮验证的旧 habits 数据会与新的 DELETE_HABIT/BATCH_CHECKIN 冲突，必须强制刷空
5. **删除习惯后同时清理 checkins**：否则 checkins 对象里的死键会越来越多，导入导出后体积膨胀

---

## 五、Validation 验证清单（浏览器实测 12 项）

| # | 验证点 | 通过标准 |
|---|---|---|
| 1 | 左侧七大系统名 | 顺序正确：身体状态/情绪与心理/能力成长/人际网络/财务记账/任务日程/知识思考库，无旧名残留 |
| 2 | 初始纯净度 | 清 localStorage 刷新后 habits=0、tempTasks=0、nodes=0、checkins={}，无示例数据 |
| 3 | 日常排版 | 3 列 × 4 行 = 12 个整齐卡片位，空位有提示 |
| 4 | 临时排版 | 6 列 × 2 行 = 12 个整齐卡片位，空位有提示 |
| 5 | 新增习惯真实落地 | 填名称"练琴"+提醒19:00+45分钟+困难 → 提交，网格第 1 张卡片立即显示「练琴」「45分钟」困难徽标；F5 刷新仍在 |
| 6 | 新增临时任务真实落地 | 填"取快递"+17:30 → 临时网格立即显示「取快递 17:30🔔」；F5 刷新仍在 |
| 7 | 编辑功能 | 改"练琴"→"钢琴练习"、时长→30 分钟 → 卡片立即更新；刷新仍正确 |
| 8 | 删除功能 | 删除需二次确认，确认后卡片消失 + 对应 checkins 历史清理干净；取消则不改动 |
| 9 | 卡片打卡勾选真实联动进度 | 勾选 1/3 习惯 → 进度条显示 33% 并显示「1/3 已完成」；取消勾选回退 |
| 10 | 批量打卡 | 批量勾选 3 个未打卡 → 3 个同时变绿 + 完成率正确 + 刷新不丢 |
| 11 | 图标防冒泡 | 点编辑/删除图标不会顺带触发打卡状态 |
| 12 | 控制台 0 致命错误 | browser_console_messages error=0，无 undefined.name / 无限重渲染 / 路由跳转报错 |

---

## 六、Risks 风险与兜底

| 风险 | 概率 | 影响 | 处理方案 |
|---|---|---|---|
| ModalRoot custom 类型传 ReactNode 序列化问题（context 传 reducer payload 时 JSON clone 会丢掉函数） | 中 | 弹窗表单按钮不触发 submit | 不直接把 ReactNode 放 PUSH_MODAL.payload 里（会 undoStack/redoStack 里 JSON clone 炸）；改为在 DailyHabitsPage 内自己维护弹窗 state（useState 管理哪个弹窗打开 + 当前编辑的 id），ModalRoot 只继续负责 toast + confirm，自定义表单用 DailyHabitsPage 内 `fixed inset-0 z-40` 自绘 overlay —— **规避序列化风险**。这个 Plan 在 Step 3 把方案改成「DailyHabitsPage 内部 useState 管理表单弹窗」，不改 ModalRoot（更稳更不炸 undoStack JSON clone） |
| 网格 12 位但用户之前要求 9 位冲突 | 低 | 用户不满意格数 | Plan 明确按用户最新消息"采取我发给你的两张照片排版"执行，照片日常确实是 3 列×4 行 = 12 格，临时是 6 列×2 行 = 12 格；若用户后续要求改回 9/5，把 Array(12) 和 grid-cols 改回即可，结构完全解耦 |
| 删除 habit 后 checkins 清理遗漏导致完成率计算异常 | 中 | 完成率分母对不上分子 | DELETE_HABIT 内用正则 `RegExp(^\\d{4}-\\d{2}-\\d{2}_${habitId}$)` 遍历 Object.keys(checkins) delete，确保全清 |
| 番茄计时功能复杂拖慢主流程 | 低 | 工期超预期 | Plan 里番茄计时做 V1.0 极简版（选择习惯 + toast + 写 timerRecords 记录），不做倒计时组件挂钟；若用户要完整番茄钟 UI 再下一轮补 |
