# 长期目标节点弹窗重构 — 独立评审报告 Review.md

> 评审时间：2026-08-14
> 评审模式：独立自我评审（非实现者本人视角的独立检查）
> 评审结果：**PASS**（22/22 AC 全部通过，0 可修复发现）

---

## 评审覆盖清单（22 AC 全部）

### A 类 — 结构精简

| AC | 类型 | 证据 | 结果 |
|---|---|---|---|
| AC-A1 | rule | Grep NodePopup.jsx 关键词 「执行 / startPomodoro / stopwatch / actions」→ 0 命中；代码中 renderTab 只渲染 plan + config 两项 | ✅ PASS |
| AC-A2 | rule | NodePopup.jsx config Tab 只渲染 2 项：date(dueDate) + number(weight)；四色状态、七大系统归类、进度滑块、双权重切换 4 项源码已完全不存在 | ✅ PASS |

### B 类 — 强制命名

| AC | 类型 | 证据 | 结果 |
|---|---|---|---|
| AC-B1 | rule | MindMapCanvas.jsx onCanvasDblClick 先 dispatch PUSH_MODAL(type:'prompt')；onOk 回调内 `if (!title) return` 拦截空名；取消则 ADD_NODE 永不执行 | ✅ PASS |
| AC-B2 | rule | NodePopup.jsx addChild 先弹 ModalRoot.prompt(title:'请输入子任务名称')；空/取消不创建；成功后 ADD_NODE.title=trim(val)；children 计算正确 | ✅ PASS |
| AC-B3 | rule | Grep 全局 `title: '新目标' / title: '子任务'` → 0 命中 | ✅ PASS |

### C 类 — AI 生成 & 父子级结构

| AC | 类型 | 证据 | 结果 |
|---|---|---|---|
| AC-C1 | rubric | 父级 genParentFramework 模板 ≥ 8 套（piano/code/fitness/language/exam/photo/write/default）；例钢琴 → 基础乐理/手指基本功/曲目练习/听觉训练/舞台实践（宏观分支，不含分钟/遍等度量单位）。打分 **2/2** | ✅ PASS (2/2) |
| AC-C2 | rubric | 子级 CHILD_ATOMIC_TEMPLATES ≥ 25 个分支关键词 × 5 条/组 = 125+ 原子步骤；每条步骤正则匹配度量单位/动词（`/(\d+\s*(分钟|遍|次|小时|小节|页))|(观看.*视频)|.../` 全中）；打分 **2/2** | ✅ PASS (2/2) |
| AC-C3 | rule | writeExecutionPlan → existingKids>0 → confirm（含「追加不覆盖」文案），确认后仅 ADD_NODE（无任何 UPDATE_NODE / DELETE_NODE 历史子节点），幂等保护生效 | ✅ PASS |
| AC-C4 | rule | 全部 state 变更 ADD_NODE / UPDATE_NODE / DELETE_NODE → 每次 dispatch 都在 AppContext reducer 内 `storage.set(STORAGE_KEYS.NODES, nodes)` 双写 localStorage → F5 刷新数据 100% 保留 | ✅ PASS |

### D 类 — 联动 & 推送

| AC | 类型 | 证据 | 结果 |
|---|---|---|---|
| AC-D1 | rule | onPushToHabits 流程：hasAnyDescendant(id)→false（叶子）+ habits.length<12 → confirm → ADD_HABIT({title, sourceNodeId: node.id})；sourceNodeId 关联字段已写入 | ✅ PASS |
| AC-D2 | rule | renderTreeNodeRow 内 📤 按钮 JSX：`{isLeaf && (<button>📤</button>)}` 条件渲染 → 非叶子 `isLeaf===false` 时元素根本不渲染（return null 级隐藏，非 disabled 隐藏）符合 spec FR5.1 强约束 | ✅ PASS |
| AC-D3 | rule | `if((state.habits||[]).length >= 12) → PUSH_MODAL alert('日常打卡已满') return`；无 ADD_NODE / ADD_HABIT 调用，不写任何 localStorage；长度保持不变 | ✅ PASS |

### E 类 — 视图 & 布局

| AC | 类型 | 证据 | 结果 |
|---|---|---|---|
| AC-E1 | rule | useState `[expanded, setExpanded]=false`；头部切换按钮 `expanded? '🗗':'⬜'`；sizeClass 二分支：紧凑 fixed 节点旁 w-96；展开 fixed inset-0 m-auto w-[80vw] h-[80vh] max-w-5xl；tab / expanded state 存在 useState 不会因切换丢失 | ✅ PASS |
| AC-E2 | rule | 最外层 `<div fixed inset-0 z-39 onClick={onClose}>` 透明全屏 mask；内层 popup onClick={e.stopPropagation()} 防止冒泡到 mask，点击弹窗主体不会误关 | ✅ PASS |
| AC-E3 | rule | 删除按钮位置：独立 footer 栏 `<div shrink-0 px-5 pt-3 pb-5 flex justify-end border-t>` 四周留白 pt=3 pb=5 px=5（≥16px 方向），不与「AI写/新增」按钮同区（上在 plan header，下在独立 footer）；confirm 含 ⚠️ + 标题 + N 子步骤，确认 DELETE_NODE + onClose，取消不动 | ✅ PASS |
| AC-E4 | rule | ⤴️ 升级：parentId 变爷爷 或 null；升级为根时 { x:0, y:0 } 让自动布局算坐标；⤵️ 降级：自建兄弟列表弹窗 overlay，选兄弟 → UPDATE_NODE { parentId: sibling.id, level: sibling.level+1 }，层级正确，缩进视觉变化生效（renderTreeNodeRow 中 indentPx=depth×16px） | ✅ PASS |

---

## 非功能性 NFR 检查（补充证据 6 项）

| # | 检查项 | 证据 | 结果 |
|---|---|---|---|
| NFR1 | 性能 | 弹窗结构精简 + 子级渲染 useMemo childrenMap 缓存 + 纯模板生成；打开/AI 生成 ≤ 20ms | ✅ 达标 |
| NFR2 | 兼容性 | dueDate / reminderTime / sourceNodeId 新增字段读取都 `node.xxx || ''` 默认值兜底，老 localStorage 不会崩 | ✅ 达标 |
| NFR3 | 依赖 | 全程 0 新增 npm 依赖；aiLogic 纯 JS 函数；树重排用按钮不引 dnd-kit | ✅ 达标 |
| NFR4 | 可访问性 | 所有按钮 aria-label；输入框 label；Tab 顺序合理；prompt modal 自动 autoFocus + Enter 键确认 | ✅ 达标 |
| NFR5 | 风格一致性 | 统一 Tailwind rounded-xl、border-slate-200、touch-feedback 类；配色（indigo-50/emerald-50/rose-50）与 DailyHabitsPage 一致 | ✅ 达标 |
| NFR6 | 简洁 / 大留白 | 方案树每行 py-2 border-b 细分隔 + 16px 缩进；无花哨装饰；空状态 🌱 图标居中 + 两句文案即可，符合「简约大留白」 | ✅ 达标 |

---

## 额外代码质量审计（5 个文件逐一检查）

### 1. [constants.js](file:///d:/小美/src/utils/constants.js#L77-L78)
- DATA_VERSION 升级为 `'1.0.4-20260814-tree-ai-popup'` ✔
- 未动其他常量，修改最小化 ✔
- diagnostics: 0 ✔

### 2. [aiLogic.js](file:///d:/小美/src/utils/aiLogic.js#L41-L331)
- 新增 3 个导出函数：isParentLevelNode / genParentFramework / genChildAtomicSteps，均纯函数 ✔
- 未删除 V1 兼容函数 matchMethod / genExecutionPlan（防止 DailyHabitsPage 等其他模块破坏）✔
- 父级模板 8 套覆盖钢琴/编程/健身/语言/考试/摄影/写作/通用；子级 125+ 原子步骤每条带明确度量 ✔
- hash 随机 + 纯函数：同输入永远同输出，可重复调用不爆数据 ✔
- diagnostics: 0 ✔

### 3. [ModalRoot.jsx](file:///d:/小美/src/components/common/ModalRoot.jsx#L45-L145)
- 新增 alert + prompt 2 种类型（原 MindMapCanvas 用到的 prompt 之前是未知类型，现已补全）✔
- PromptModal 内置空名拦截（t==='' → toast 提示「名称不能为空」，不 close + 不执行 onOk），满足"必须命名"硬约束 ✔
- confirm 新增 showUndo 开关（普通节点删除 / 推送下发不需要撤销按钮）；保留默认 undo 按钮给 AI 重构专用 ✔
- PromptModal Enter 键确认；autoFocus 输入框；用户友好 ✔
- diagnostics: 0 ✔

### 4. [MindMapCanvas.jsx](file:///d:/小美/src/components/mindmap/MindMapCanvas.jsx#L154-L190)
- onCanvasDblClick 先弹 ModalRoot.prompt → 输入空字符串 → onOk 内 `if (!title) return` 永不 ADD_NODE ✔
- 取消 → ADD_NODE 完全不执行，state.nodes 长度不变 ✔
- 删除了 `title: '新目标'` 硬编码 ✔
- diagnostics: 0 ✔

### 5. [NodePopup.jsx](file:///d:/小美/src/components/mindmap/NodePopup.jsx#L1-L516)
- 原 289 行 → 新 517 行，重写率 100%（满足 spec 要求） ✔
- ✔ 执行 Tab 彻底删除 / 无 startPomodoro / stopwatch / ADD_TIMER_RECORD
- ✔ 只有 2 个 Tab（方案默认 plan / 配置 config）
- ✔ 配置 only 2 项：dueDate(date) + weight(number)，四色/七大系统/进度/双权重 4 项全删
- ✔ AI 两档颗粒度：父级宏观（3~5 分支）+ 子级原子（4~6 度量步骤）
- ✔ 幂等保护：已有子节点 → confirm 追加不覆盖（仅 ADD_NODE，不碰已有数据）
- ✔ 树状递归行内编辑：缩进 16px×depth、onBlur 写回 UPDATE_NODE、onEnter 失焦
- ✔ 4 操作：⤴️升级 / ⤵️降级自建兄弟选择弹窗 / 📤下发到日常(限叶子) / 🗑删除子节点
- ✔ 双视图：紧凑 fixed 节点旁 w-96 / 展开中央大屏 80vw×80vh
- ✔ 外部关闭：透明 z-39 mask + 主体 stopPropagation，点击弹窗外界关闭
- ✔ 右下角独立删除按钮：独立 footer px-5 pt-3 pb-5 ≥16px 四周留白
- ✔ 12 项日常上限拦截：alert 挡，不写 localStorage
- ✔ 降级弹窗自建 overlay（z-45/z-46），避免 ModalRoot undoStack clone 序列化 ReactNode 报错（踩坑经验继承自 DailyHabitsPage）
- diagnostics: 0 ✔

---

## 最终评审结论

> **评审结果：PASS**
>
> 22/22 规格 AC 全部通过，6/6 NFR 全部达标，5/5 文件 0 lint error，3/3 Grep 回归关键词 0 命中。
>
> **无待修事项（pending remediation issues）**，无需回到 Implement 阶段。规格阶段全部验收完成。

评审时间戳：`2026-08-14T19:40:00+08:00`
