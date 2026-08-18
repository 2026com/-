# 长期目标节点弹窗重构 —— 实施任务清单

> 父规格：[spec.md](./spec.md)
> 创建时间：2026-08-14
> 任务拆解依据：spec 中 6 条功能需求（FR1~FR6）→ 按文件边界拆 5 个任务，全部高优先级（核心结构），执行顺序 T1 → T2 → T3 → T4 → T5

---

## 任务总览

| ID | 标题 | 文件 | 优先级 | 依赖 | 当前状态 |
|---|---|---|---|---|---|
| T1 | 常量层：升级 DATA_VERSION，清旧示例 | src/utils/constants.js | high | 无 | pending |
| T2 | AI 生成层：新增父级宏观 / 子级原子两套模板函数 | src/utils/aiLogic.js | high | 无 | pending |
| T3 | 画布层：双击新增根节点强制命名 | src/components/mindmap/MindMapCanvas.jsx | high | T1 | pending |
| T4 | 核心 UI：NodePopup 整页重构（移除执行 + 保留方案/配置 + 树状编辑 + 下发 + 双视图） | src/components/mindmap/NodePopup.jsx | high | T1, T2, T3 | pending |
| T5 | 全链路验证：lint + 浏览器实测全部 AC | 全项目 lint + 手动验证 | high | T4 | pending |

---

## Task 1：常量层 —— 升级 DATA_VERSION 并清空旧示例

**关联 AC**：AC-A1（间接）、FR7.1

**实施范围**：仅改 1 文件 `src/utils/constants.js`

### 原子操作
1. **搜索** `export const DATA_VERSION =` 所在行；
2. **替换值**：从 `'1.0.3-20260814-real-interactions'` → `'1.0.4-20260814-tree-ai-popup'`；
3. **可选优化**：如果 constants 文件里 `SEVEN_SYSTEMS` 导出的 id 有 `'zhuye'`（主页虚拟节点），检查 mockData 里是否用到 → 本次不用改（因为 DATA_VERSION 升级后 initMockData 仍然会被调用一次，见 AppContext L12-16），**但是** mockData.js 里的 nodes/piano/cyber 预置数据后续依然会被 initMockData 写入一次 → 等下：AppContext 逻辑是 DATA_VERSION 不匹配 → 先 `storage.clearAll()` 再 `initMockData()` → 会导致 mock 数据再次出现？用户要求是「不预置示例任务」—— 所以本任务 T1 除了升 DATA_VERSION，还应该 **改 mockData.js 让 initMockData 不再预置任何真实节点数据，仅写入空数组**。
   补充：Read `src/data/mockData.js` 确认 `initMockData()` 做了什么 → 如果有写入 nodes 的钢琴 / 网安真实节点，改成空数组写入；写入 habits/tempTasks 已经是空数组了（上一版已经通过 DATA_VERSION 清干净）→ 总之要保证 initMockData 后 state.nodes === []。

### 本地测试需求（TR = Test Requirement）
| TR 编号 | 类型 | 内容 |
|---|---|---|
| T1-TR1 | rule | 打开浏览器控制台 `localStorage.getItem('growth_app_v1_data_version')` → 返回 `"1.0.4-20260814-tree-ai-popup"` |
| T1-TR2 | rule | 首页加载后 `state.nodes` 为 `[]` 空数组，画布中央显示 "双击画布空白处，新增第一个长期目标" 提示 |
| T1-TR3 | rule | `Grep -r "钢琴\|网络安全" src/data/mockData.js`（若 mockData 清空了预置则不命中，命中则说明仍有残留节点需删） |

### Status: pending

---

## Task 2：AI 生成层 —— 新增父级 / 子级两档颗粒度函数

**关联 AC**：AC-C1、AC-C2、FR4

**实施范围**：仅改 1 文件 `src/utils/aiLogic.js`

### 新增 API（导出 3 个新函数，不删现有 matchMethod / genExecutionPlan，防依赖）
1. `isParentLevelNode(node, allNodes)` → boolean：判断该节点是否应该走"父级宏观 AI"（条件：`node.parentId == null` 或者 `node.level === 0` —— 满足之一视为父级）
2. `genParentFramework(node)` → Array<{title}>：返回 3~5 个中间分支子节点标题数组（宏观框架）
   - 匹配键库 ≥ 8 套：钢琴、编程、健身、语言、考试、摄影、写作、通用
   - 例：钢琴（父级）→ `['基础乐理','手指基本功','练习曲目','听觉训练','舞台实践']`
3. `genChildAtomicSteps(node, parentTitle?)` → Array<{title}>：返回 4~6 个原子动作标题数组（每条必须带明确动词 + 数量 / 时间度量单位）
   - 例：钢琴子级"手指基本功"→ `['哈农钢琴练指法第1条 10分钟 分手慢速练习','C大调音阶 2遍 每个八度 60 BPM','三度双音音阶 左手单独 10遍','和弦连接练习 I-IV-V-I C大调 16拍 4小节']`
   - 通用原子步骤模板：每条必须满足正则：`/(\d+\s*(分钟|遍|次|小时|小节|页))|(观看.*视频)|(阅读.*章)|(完成.*练习)/`
4. 可选：`KEYWORD_TEMPLATES` 大对象常量内部维护，单独文件内写好，导出函数仅做匹配 + 返回

### TR
| TR 编号 | 类型 | 内容 |
|---|---|---|
| T2-TR1 | rule | 调用 `genParentFramework({title:'练习钢琴'})` → 返回数组 length ∈ [3,5]，且任一元素不包含 '分钟'、'遍' 等细颗粒单位（避免混淆） |
| T2-TR2 | rule | 调用 `genChildAtomicSteps({title:'手指基本功'}, parentTitle='练习钢琴')` → 返回数组 length ∈ [4,6]，且 **每个元素 title** 都匹配可执行度量正则：`/(\d+\s*(分钟|遍|次|小时|小节|页))|(观看.*视频)|(阅读.*章)|(完成.*练习)/` |
| T2-TR3 | rubric | 模板覆盖度（0-2）：≥ 1.5 及格。测试 '练习钢琴'、'学习JavaScript编程'、'健身减脂增肌'、'雅思7分备考'、'摄影进阶'、'写一本小说' 6 种常见标题，父级都能返回 3~5 个合理分支；子级都能返回可落地动作。证据：控制台单元输出。 |
| T2-TR4 | rule | 函数不修改全局 state，纯函数（同输入永远同输出），可安全重复调用 |

### Status: pending

---

## Task 3：画布层 —— 双击新增根节点强制命名

**关联 AC**：AC-B1、AC-B3、FR2.1

**实施范围**：仅改 1 文件 `src/components/mindmap/MindMapCanvas.jsx` 的 `onCanvasDblClick` 段

### 原子操作
1. 定位 L154 `onCanvasDblClick` 函数：原有逻辑直接 dispatch ADD_NODE（title 硬编码 '新目标'）→ 删除整个现有函数体内 dispatch（保留位置计算 nx、ny 部分）
2. 替换为：先 `dispatch({ type: 'PUSH_MODAL', payload: { type: 'prompt', ... } })`
   - title: '请输入长期目标名称'
   - placeholder: '例：学习钢琴 / 备考雅思 / 健身减脂'
   - defaultValue: ''
   - onOk: `(val) => { if(!val || !val.trim()) return; 然后才 dispatch ADD_NODE({title: val.trim(), parentId:null, x:nx, y:ny, ...其他默认字段...}) }`
3. `Grep` MindMapCanvas.jsx 检查是否还有其他 ADD_NODE 触发（只有 onCanvasDblClick 一处，其他在 NodePopup，由 T4 改）→ 本文件确保只有 onCanvasDblClick 一处

### TR
| TR 编号 | 类型 | 内容 |
|---|---|---|
| T3-TR1 | rule | 双击画布空白 → 立即弹出 prompt 输入框（不是直接出节点）；输入 '' 或 '   ' → 点确认 → 画布节点数不变 |
| T3-TR2 | rule | 输入合法名 → 确认 → ADD_NODE 成功；节点 title=输入值，x/y=双击处坐标（nx,ny）；节点 parentId=null |
| T3-TR3 | rule | 点 prompt 取消按钮 → state.nodes 数组完全不变（no-op） |
| T3-TR4 | rule | 正则搜索 MindMapCanvas.jsx：`title:\s*['"]新目标['"]` → 0 命中 |

### Status: pending

---

## Task 4：核心 UI —— NodePopup.jsx 整页重构（最大头）

**关联 AC**：AC-A1、AC-A2、AC-B2、AC-C1~C4、AC-D1~D3、AC-E1~E4；FR1 / FR3 / FR4.3 / FR5 / FR6 全部

**实施范围**：**全部重写 `src/components/mindmap/NodePopup.jsx`**（原 289 行，重构后预计 ~850 行，因为新增：tree render、双尺寸、overlay、push logic 等）

### 原子操作（按顺序，拆 10 个小步骤）
1. **清理 Tab / 移除执行**：删除 `actions` tab 渲染；删除 startPomodoro 函数；删除 actions 整个 div 段（原 L110-L143）；删除 import NODE_STATUS、SEVEN_SYSTEMS（FR1 + FR3.2）
2. **状态新增**：`const [tab, setTab] = useState('plan')`（注意默认 tab 从 'actions' → 'plan'）；新增 `const [expanded, setExpanded] = useState(false)` 控制紧凑 / 展开双形态（FR6.1）
3. **【配置】标签页重写**：仅留 dueDate + weight 2 项 + 右下角独立删除按钮布局独立留白（FR3）
4. **强制命名子节点**：替换原 `addChild` 函数（原 L26-L44）→ 先 PUSH_MODAL prompt（FR2.2）：取消 / 空不创建；否则创建，title=trim(val)，不允许硬编码 '子任务'
5. **AI 方案按钮重写（核心）**：替换原 writeExecutionPlan（原 L52-L57）→ 调用 T2 的两个函数：`if isParentLevelNode → genParentFramework else genChildAtomicSteps`；然后 FR4.3 幂等检查：`const existingKids = state.nodes.filter(n => n.parentId === nodeId).length`；>0 → confirm（追加不覆盖）；然后循环 N 次 dispatch ADD_NODE，parentId=nodeId，title=每个生成值，level=当前level+1，其他默认值（都有写 localStorage）
6. **【方案】标签页树状列表渲染**：render 函数新增 —— 递归 `function renderTreeNode(childNode, depth)`；每一行：depth×16px 缩进 + input 标题（受控 onBlur UPDATE_NODE）+ 右对齐操作按钮（升 / 降 / 📤 / 🗑 4 个图标，或非叶子隐藏📤）
7. **升 / 降级操作按钮实现**：
   - ⤴️ 升级：计算 parent = state.nodes.find(n => n.id === node.parentId)；if(!parent || !parent.parentId) → 升级为根节点 parentId=null + x,y 置 0（让自动布局算坐标）；else → UPDATE_NODE { parentId: parent.parentId, level: (parent.level ?? 0) }
   - ⤵️ 降级：弹 `ModalRoot.confirm` 内嵌套选兄弟？（ModalRoot 没有自定义表单 → 简化为：取所有兄弟节点 state.nodes.filter(n => n.parentId === 当前节点.parentId && n.id !== node.id)；如果兄弟节点数组为空 → toast「无同级兄弟节点，无法降级为子级，先加兄弟再操作」；如果 ≥ 1 → 用 ModalRoot 提供的 confirm 不行（没有选项列表）→ **所以实现策略**：本弹窗内部再自建一个小型 Modal（和 DailyHabitsPage 里 HabitForm 类似，useState + overlay z-index 40 内一层），做一个简单的兄弟节点单选列表 + 确认按钮；选完 UPDATE_NODE { parentId: 选中兄弟.id, level: (选中兄弟.level ?? 0) + 1 }
8. **📤 推送至日常打卡实现**：
   - 先算 `if(state.habits.length >= 12) → PUSH_MODAL alert('日常打卡已达12项上限...'); return`
   - 再 confirm → 确认 → ADD_HABIT（字段映射见 spec FR5.2：`habit.sourceNodeId = node.id`，duration=25，difficulty='medium'，reminderTime='09:00'，title=node.title）
   - toast 反馈
9. **双视图 + overlay**：外层 wrap 返回 `<> overlay_mask + popup_container </>`；`expanded === true` 时 popup_container 类名 `fixed inset-0 m-auto w-[80vw] h-[80vh]`，关闭按钮左边加一个 toggle 展开按钮；overlay_mask 的 onClick → 不冒泡时 onClose（FR6.2）
10. **右下角独立删除按钮**：删除按钮从原 tab=actions 栏的小按钮移到弹窗右下角独立容器：`absolute bottom-4 right-4`（四周 ≥ 16px 留白，和其他按钮不相邻）；删除函数保留原二次 confirm（countAll 后代数量的文案不变，但原函数移动到右下角，不再在 actions bar）

### TR（关键，16 条）
| TR 编号 | 类型 | 内容 |
|---|---|---|
| T4-TR1 | rule | 打开任意节点弹窗 → Tabs 只有「方案」「配置」两项（默认方案高亮）；没有「执行」 |
| T4-TR2 | rule | 切换到配置页 → 仅能看到 date + weight + 删除按钮；四色 / 七大系统 / 进度 / 双权重 4 项完全不存在（DOM 上没有元素，不是 display:none） |
| T4-TR3 | rule | 点「新增子任务节点」→ prompt；输入'音阶练习'→ 生成节点，title='音阶练习'，parentId=当前 nodeId；取消 / 空 → children.length 不变 |
| T4-TR4 | rule | Grep NodePopup.jsx `title:\s*['"]子任务['"]` → 0 命中 |
| T4-TR5 | rule | 方案标签页：AI 写方案 父级 → 真实生成 3~5 个 ADD_NODE；state.nodes 新增后 nodes.length 加 N；刷新后保留 |
| T4-TR6 | rule | 已存在子节点的 node 再次点 AI → confirm 文案 "已存在 N 个子步骤，将追加不覆盖"；确认后原有子节点 id / title / parentId 字段完全没变；仅追加新子节点 |
| T4-TR7 | rule | 树状递归渲染 depth=0,1,2 三代；缩进分别 = 0 / 16 / 32 px（视觉检查） |
| T4-TR8 | rule | 叶子节点行内 📤 可见 + 可点；非叶子节点行内 📤 不可见（render 时 return null，不是 disabled 隐藏） |
| T4-TR9 | rule | 叶子点 📤 → habits.length += 1；新 habit.title = node.title；sourceNodeId = node.id |
| T4-TR10 | rule | 构造 habits.length===12 → 点 📤 → 弹 alert 拦截；habits.length 不变 |
| T4-TR11 | rule | 节点行 ⤴️ 升级：父级的父级存在时 → parentId 变爷爷 id；父是根时 → parentId 变 null |
| T4-TR12 | rule | 节点行 ⤵️ 降级：选一个兄弟 X → parentId = X.id；X 再开弹窗 → 它的 children 列表里能看到已降级的节点 |
| T4-TR13 | rule | 默认 → 紧凑小窗（挂节点旁）；点展开 → 中央大屏 80vw/80vh；点收起 → 回紧凑；tab 状态切换时不重置为默认 |
| T4-TR14 | rule | 弹窗周围 mask → 点击任何 mask 区域 → onClose 触发（弹窗关闭）；但弹窗本身内容区域点击不冒泡到 mask |
| T4-TR15 | rule | 删除按钮位置：右下角独立 24px 留白，四周无其他按钮；点击 → confirm 文案含"⚠️"、节点标题、后代数量；确认后 DELETE_NODE；取消不动 |
| T4-TR16 | rubric | 整体留白/简约度（0-2）：≥1.5 及格。检查：(a) 方案树每行之间 padding ≥ 10px (b) 无视觉多余装饰（花哨背景 / 渐变等，保持现有 slate/bg-white 风格） |

### Status: pending

---

## Task 5：全链路验证（lint + 浏览器手动走全部 AC）

**关联所有 AC（A1-A5, B1-C4, D1-D3, E1-E4）**

### 原子操作
1. **GetDiagnostics 工具**：对全部改动的 5 个文件跑 lint 诊断
2. 启动 dev server（之前已启 5173，若停则重启）→ 浏览器自动化脚本（如果可用）手动验证下列 10 个用例：
   1. 首次加载 → state.nodes=[] 空画布 ✔
   2. 双击画布 → prompt → 输名 → 生成节点 ✔
   3. 点节点开弹窗 → Tabs 只有方案/配置 ✔
   4. 在方案页点「新增子节点」→ prompt 命名 → 生成 1 child ✔
   5. 父节点点「AI写方案」→ 无子节点则直接生成；有则 confirm 然后追加 ✔
   6. 子节点（叶子）点 📤 推送 → habits 长度 +1，跳到日常页看确实有卡片 ✔
   7. 节点行「⤴️升级 / ⤵️降级」层级正确变化 ✔
   8. 点展开 → 大屏 80vw×80vh；点 mask 关闭 ✔
   9. 删除按钮二次确认 → 删除后节点 + 后代一起消失 ✔
   10. F5 刷新 → 所有节点结构 / 已下发习惯 / 打卡进度 100% 保留 ✔
3. **Grep 回归检查**：
   - `src/components/mindmap/NodePopup.jsx` 不得出现 'startPomodoro' / 'stopwatch' / '🎯 执行'
   - 全项目不得出现 `title: '新目标'` / `title: '子任务'` 硬编码

### TR
| TR 编号 | 类型 | 内容 |
|---|---|---|
| T5-TR1 | rule | GetDiagnostics 针对 constants.js / aiLogic.js / MindMapCanvas.jsx / NodePopup.jsx / mockData.js 5 个文件 → 0 lint error, 0 warning |
| T5-TR2 | rule | 浏览器 10 步手动验证用例 10/10 全部通过 |
| T5-TR3 | rule | Grep 回归检查全部通过（2 组关键词 0 命中） |

### Status: pending
