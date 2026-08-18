# 幕布 / 进度条 / 时间轴 / 打卡方格 —— 实施任务清单

> 父规格：[spec.md](./spec.md)
> 拆解：按文件边界拆 6 个任务（T0 准备 → T1 连线 → T2 进度条 → T3 比例布局 → T4 打卡交互 → T5 验证）
> 执行顺序：T0 → T1 → T2 → T3 → T4 → T5（严格串行，T1-T3 都动 MindMap 相关组件）

---

## 任务总览

| ID | 标题 | 涉及文件 | 优先级 | 依赖 | Status |
|---|---|---|---|---|---|
| T0 | 结构扫描：确认全局大进度条位置 / 打卡 GRID_SIZE 常量 | 跨 4 文件 Grep | high | 无 | pending |
| T1 | 修 NodeLinks：SVG viewBox 移除 + 连线吸附节点边缘 + 实时刷新 | src/components/mindmap/NodeLinks.jsx | high | T0 | pending |
| T2 | MindNode：节点下方挂独立小进度条 + %文字 + 递归计算父级汇总 | src/components/mindmap/MindNode.jsx | high | T0 | pending |
| T3 | MindMapCanvas：节点瘦身 / 月份轴 h=64px / 留白 / 布局间距均匀 | src/components/mindmap/MindMapCanvas.jsx + MindNode.jsx (size 公式) | high | T2 | pending |
| T4 | DailyHabitsPage：移除新增按钮 + 网格 3×3/1×5 + 空格新建/点击已有格编辑/勾选区分离 | src/pages/DailyHabitsPage.jsx | high | T0 | pending |
| T5 | 验证：GetDiagnostics 4 文件 + Grep 回归 + 关键 AC 手动录屏证据 | 跨项目 | high | T1-4 | pending |

---

## Task 0：结构扫描与定位

### 原子操作
1. Grep 全局大进度条位置（如果存在）→ LongTermGoalsPage.jsx / MindMapCanvas.jsx 搜索 "全局进度"、"总进度"、"bottom-0"、"进度条"、"sticky bottom" 关键词
2. 确认 DailyHabitsPage 的 GRID_SIZE_DAILY / GRID_SIZE_TEMP 常量定义位置（Read 对应行）
3. 确认 MindMapCanvas 节点层与连线层是否套同一 transform（已确认：MindMapCanvas.jsx L210-214 连线层和 L218 节点层都在同一 style transform 内）→ 这是方案 A（移除 viewBox 统一 8000×6000 画布）的前提

### 本地测试需求（TR）
| TR 编号 | 类型 | 内容 |
|---|---|---|
| T0-TR1 | rule | Grep "底部进度条"/"总进度" → 定位清楚：0 处 或 X 处（记录具体行号，T2 删除对应 DOM） |
| T0-TR2 | rule | GRID_SIZE_DAILY / GRID_SIZE_TEMP 具体数值和位置记录（用于 T4 改常量值 + grid-cols class） |
| T0-TR3 | rule | 节点 size 公式 2 处一致性检查：MindNode.jsx 现有 size 与 NodeLinks.jsx 需要用到的 size 计算式保持一致（防止吸附边缘计算错位） |

---

## Task 1：修 NodeLinks SVG viewBox + 吸附节点边缘（问题 1 连线错位根因修复）

### 原子操作
1. **删除 viewBox / preserveAspectRatio**（错位根因！）
   - `<svg>` 外层 style：width="8000" height="6000"（固定超大绝对画布；与节点层 absolute 坐标自然 1:1 一致）
   - 或保留 width/height "100%" 但 viewBox={0 0 8000 6000} + preserveAspectRatio="none"（同样不比例伸缩）
   - 本 spec 推荐方案：viewBox={0 0 8000 6000} + preserveAspectRatio="none" + style width="8000px" height="6000px"，保证 1:1 无拉伸
2. **size 计算函数**：NodeLinks.jsx 内写 `getNodeSize(level)` → 与 MindNode 完全同公式（**T3 会改，这里要同步 T3 的最终 size 公式**：`Math.max(52, 80 - level * 7)`）；为 T3 提前同步避免 2 次修改
3. **起终点吸附边缘**（不是圆心）
   - `x1 = parent.x + getNodeSize(parent.level || 0) / 2`（父**右边缘**）
   - `y1 = parent.y`
   - `x2 = child.x - getNodeSize(child.level || 0) / 2`（子**左边缘**）
   - `y2 = child.y`
   - 三次贝塞尔控制点 dx 计算保持：水平发散型 S 曲线 `dx = Math.max(40, Math.abs(x2-x1)*0.55)`；cx1 = x1+dx; cy1=y1; cx2=x2-dx; cy2=y2
4. **minX / minY  viewBox 修正**：如果选 viewBox={0 0 8000 6000}（不需要动态计算 minX/maxX），直接删掉原来动态计算 minX / minY / vbX / vbY 那段循环计算，减少 re-render。
5. **实时刷新保证**：useMemo deps=[nodes] 保持不动（state.nodes 任何 ADD/UPDATE/DELETE/REPLACE 都触发 useMemo 重算链接，曲线立即刷新）。

### 关联 AC
AC-Q1-1（边缘吸附）、AC-Q1-2（实时刷新）、AC-Q1-3（缩放平移后一致）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T1-TR1 | rule | 5 条随机线 inspect 坐标：起点 x ≈ parent.x + size/2（±1），终点 x ≈ child.x - child.size/2（±1） |
| T1-TR2 | rule | NodeLinks.jsx 源码已删除 viewBox 动态计算 minX/minY/vbX/vbW 那一大段（L23-31 原代码删除） |
| T1-TR3 | rule | 节点拖拽 3 次后 0 条线脱离；升级 / 降级操作后父子新关系的连线立即出现（旧关系连线消失） |
| T1-TR4 | rubric | 缩放 200% / 缩小 50% / 平移 1000px 后错位容忍度（0-2，≥1.5） |

---

## Task 2：节点下方挂独立小进度条 + 递归汇总父级（问题 2）

### 原子操作
1. **删除全局大进度条（若存在）**：基于 T0-TR1 定位结果删对应 DOM
2. **MindNode 新增进度条 DOM（节点圆形下方）**：
   ```jsx
   // 加在 MindNode return 中，紧跟 83 行 </div> 圆形 div 闭合前的外面（同一 absolute 容器内新增一个子 div）
   <div className="absolute pointer-events-none"
        style={{ left: '50%', top: size + 6, transform: 'translateX(-50%)', width: Math.round(size * 0.9) }}>
     <div className="flex items-center gap-1.5">
       <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden" aria-hidden>
         <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: progressColor }} />
       </div>
       <span className="shrink-0 text-[9px] text-slate-500 font-semibold tabular-nums">{progress}%</span>
     </div>
   </div>
   ```
   - progressColor 映射（与 NodeLinks.jsx 保持一致）：≥100绿(#22c55e) → >50蓝(#3b82f6) → >0 蓝灰(#64748b) → 0 slate(#cbd5e1)
3. **递归所有后代（不是只一层）计算父级进度**：
   - MindNode.jsx 原 `useMemo([children,...])` 中 `children` 只有直接一级 → 改：写 helper `function collectAllDescendants(rootId, allNodes)`（递归 BFS 收集所有后代 id）→ 返回 `allDescendantsNodes` 数组 → 传进 `calcProgress(allDescendantsNodes, progressMode)`；叶子节点（allDescendantsNodes.length===0）→ return Number(node.progress) || 0 保留原逻辑
4. **移除** MindNode 圆形内部原本显示的 `{progress>0 && <div>text-[10px]...%</div>}`（L69-71），避免重复显示（百分比改到节点下方小条右边了，内部圆形里只保留标题 2 行即可更简洁）

### 关联 AC
AC-Q2-1（删全局大条）、AC-Q2-2（小条+百分比位置）、AC-Q2-3（递归汇总正确性 rubric）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T2-TR1 | rule | 节点圆形 DOM 内部原本"10px mt-0.5 进度 % 文本"已删除（L69-71 原代码移除），不重复显示 |
| T2-TR2 | rule | 5 个节点 → 5 条小进度条；每条高度 4px，% 文字 9px，宽度 0.9×size，位置 top = size+6 |
| T2-TR3 | rubric | 父级递归汇总误差（0-2，≥1.5；1 父 3 子 2 孙场景误差 ±5 以内） |
| T2-TR4 | rule | Grep 全局大条定位 + 删除后，截图底部大条完全不存在，0 元素可见 |

---

## Task 3：比例协调 & 自动布局优化（问题 3）

### 原子操作
1. **MindNode.jsx 节点瘦身（同步 T1 的 NodeLinks.getNodeSize 公式）**：
   - size 公式：原 `Math.max(68, 96 - level * 10)` → `Math.max(52, 80 - level * 7)`（根 80 / 1级 73 / 2级 66 / 3级 59 / 4级+ 52）
   - 字号公式：原 `Math.max(11, 14 - level)` → `Math.max(10, 13 - level)`（根13 / 1级 12 / 2级 11 / 3级+ 10）
2. **MindMapCanvas 月份轴高度 h-16 = 64px（精确 = 80 × 0.8）**：
   - 原 L194 `className="absolute top-2 left-0 w-full h-10..."` → `h-16 top-3 px-6 gap-12`（px-6 多留白，gap-12 = 月份间距加大一点）
   - 月份字 class：原 `text-xs` → `text-sm`；刻度线从 `-bottom-2 h-4` → `-bottom-2 h-6`
3. **上下留白**：MindMapCanvas L100 `setOffset({ x: Math.max(20, ...), y: 60 })` → `y: 140`（节点起点下移 80px，避开 h-16=64 月份轴 76px 留白）
4. **节点横纵间距优化（避免重叠）**：
   - MindMapCanvas L23-24 常量：`LEVEL_Y_STEP = 90 → 110`；`SIBLING_Y_STEP = 70 → 88`
   - MindMapCanvas L80 子节点 offsetY 计算保持（用新 SIBLING_Y_STEP 自动生效，不需再改）
5. **NodePopup 弹窗定位的 offset 微调**（节点现在从 96 → 80 更小）：MindMapCanvas L253 `x: (node.x||0)*zoom + offset.x + 50` → + 42（和 80×0.5=40 对齐）

### 关联 AC
AC-Q3-1（节点瘦身实际尺寸）、AC-Q3-2（h-16=64 比例 0.8）、AC-Q3-3（留白均匀 0 重叠）、AC-Q3-4（视觉比例协调）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T3-TR1 | rule | 节点根 level=0 → inspect width/height = 80px；level=4 → width=52px（实际 DOM 生效） |
| T3-TR2 | rule | 月份轴容器 h-16 = 实际 64px；比例 64/80 = 0.8（精确计算） |
| T3-TR3 | rule | 8 节点（2 根+3子+3孙）初始布局 → 任意两节点边框 ≥ 10px（截图不重叠） |
| T3-TR4 | rubric | 整体视觉比例协调度（0-2，≥1.5 及格） |

---

## Task 4：打卡交互改造（问题 4）—— 删按钮 + 空格新建 / 有卡编辑 + 勾选区分离

### 原子操作
1. **常量改网格尺寸**：Read DailyHabitsPage 找到 `GRID_SIZE_DAILY = 12 / GRID_SIZE_TEMP = 12` → DAILY=9（3×3）；TEMP=5（1×5）
2. **删除两个新增按钮**：
   - 日常页 L130-132 左右的 `button.新增习惯`（触发 setAddHabitOpen(true)）→ **删除该按钮 DOM 整段**，但 **保留 setAddHabitOpen state 和 FormModal**（T4.3 空格点击会调用它）
   - 临时页 L232-234 左右的 `button.新增临时任务`（setAddTempOpen(true)）→ 同上删除 DOM，保留 state
3. **网格 class 改**：
   - 日常：原 `grid-cols-3` 保持；Array.from length 从 12 → 9（3×3）
   - 临时：原 `grid-cols-6 × 12` → **`grid-cols-5 × 5`**（一排 5 格）；className 改 grid-cols-5，length 从 12 → 5
4. **空格点击 → 直接新建（代替 toast）**：
   - 日常卡原 `onClick if(!habit) { toast(...); return }` → `if(!habit) { setAddHabitOpen(true); return }`（删除 toast 行）
   - 临时卡原 `onClick if(!task) { toast(...) }` → `if(!task) { setAddTempOpen(true); return }`
5. **有卡点击 → 三区分离（关键！避免打卡和编辑误触）**：
   - 卡片结构改造：卡片 onClick 不再触发 TOGGLE_CHECKIN / TOGGLE_TEMP_DONE；改为：
     - **左上角独立 checkbox 按钮**（w-6 h-6 rounded，独立 onClick=打卡切换，stopPropagation 不冒泡到卡片主体）
     - **卡片主体（除 checkbox / 右上角图标外）** onClick = 弹编辑（已有 habit → setEditHabitId(habit.id)；已有 task → setEditTempId(task.id)）
     - **右上角 hover 图标区 ✏️ 🗑**：保持 stopPropagation + 原功能（备选入口，不用改）
6. **HabitForm / TempForm / FormModal 表单完全不改动**（字段校验 / 提交 ADD_HABIT / UPDATE_HABIT 逻辑都用原有）
7. **检查 toast 残留**：原来 "点击上方新增习惯先添加任务" 两行 toast 已删除 → 确认没有 toast 残留

### 关联 AC
AC-Q4-1（按钮删除）、AC-Q4-2（网格 9+5 格）、AC-Q4-3（空格 → 新建弹窗）、AC-Q4-4（有卡 → 编辑 / 勾选分离）、AC-Q4-5（持久化）、AC-Q4-6（误点率 rubric）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T4-TR1 | rule | 日常/临时页面截图：2 个新增按钮 DOM 0 个存在；Grep 对应 JSX 已删除（不是 display none） |
| T4-TR2 | rule | 日常：div.grid grid-cols-3 × 3 行 = 9 格；临时：div.grid grid-cols-5 5 格 1 排 |
| T4-TR3 | rule | 空格点击 → 立即弹「新增习惯」或「新增临时任务」弹窗；取消 → state.habits.length / tempTasks.length 不变 |
| T4-TR4 | rule | 已有卡：点击主体（非勾选区）→ 立即弹「编辑习惯」表单回显原值；点击左上角独立 checkbox → 切换打卡（进度条立即重算）；右上角 ✏️ 图标也能弹编辑 → 3 区互不干扰 |
| T4-TR5 | rule | 创建 2 个 habit / 2 个 temp 后 F5 → 卡片、打卡、内容 100% 不变；localStorage 读写 双写一致 |
| T4-TR6 | rubric | 交互误点率评分（0-2，≥1.5） |

---

## Task 5：全链路验证（lint + Grep 回归 + 关键 AC 证据）

### 原子操作
1. **GetDiagnostics** 对 4 个改动文件（NodeLinks.jsx / MindNode.jsx / MindMapCanvas.jsx / DailyHabitsPage.jsx）跑 lint
2. **Grep 回归 5 组关键词**（至少 1 组：误删保留功能项 AC-RET）：
   - (a) 日常打卡新增按钮残留：`>新增习惯` → 0 命中
   - (b) 临时打卡新增按钮残留：`>新增临时任务` → 0 命中
   - (c) 节点默认硬命名：`title:'新目标'|title:'子任务'` → 0 命中（AC-RET-2）
   - (d) NodePopup 执行残留：`执行|startPomodoro|stopwatch`（NodePopup.jsx）→ 0 命中（AC-RET-1）
   - (e) 配置页分类残留：`七大系统|NODE_STATUS`（NodePopup config 区）→ 0 命中（AC-RET-3）
3. **手动验证关键 AC 录屏 / 控制台检查（至少 8 步）**：
   - (1) 3+5=8 个节点 + 拖拽 3 次 → 连线 0 脱离
   - (2) 节点进度条位置 / 父汇总正确性
   - (3) 月份轴 64px + 节点 80px 比例 0.8 对齐
   - (4) 打卡 9 空格 → 弹新建
   - (5) 打卡 9 有 3 张卡 → 主体点编辑 / 勾选框点打卡 / 右上角编辑 3 区不冲突
   - (6) 临时 5 格 → 空格弹临时任务弹窗
   - (7) F5 刷新全部数据保留
   - (8) 原有保留功能（弹窗只有 2 标签 / 强制命名 / 树升降级下发）不受影响

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T5-TR1 | rule | GetDiagnostics 4 文件 → 0 error + 0 warning |
| T5-TR2 | rule | Grep 回归 (a)~(e) 5 组 → 0 命中全部通过 |
| T5-TR3 | rule | 8 步手动验证 8/8 全部通过 |
