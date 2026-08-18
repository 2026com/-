# 实施任务拆解 · node-stage-sync-timefilter

> 每一项 Task = 一个垂直切片；所有本地 TR 通过后标 completed；高优 Task 先执行。

---

## Task 1：DATA_VERSION + NODE_STATUS 5态 + 搁置/放弃排除进度

- **优先级**：high
- **关联 AC**：AC-1, AC-4
- **改动文件**：
  - `src/utils/constants.js`：扩 `NODE_STATUS` 为 5 态（todo/progress/paused/done/aborted），`DATA_VERSION` 升级。
  - `src/utils/storage.js`：`calcProgress` 过滤 `status in {paused, aborted}`。
  - `src/context/AppContext.jsx`：`recalcParentProgress` 调用前对子列表过滤 paused/aborted。
- **本地 TR（全部 rule）**：
  - TR-T1-1 `rule`：NODE_STATUS keys 长度=5 且 5 个 key 正确。
  - TR-T1-2 `rule`：3 个子节点（done+paused+aborted），父进度 = 100（只有 done 计入）。
  - TR-T1-3 `rule`：DATA_VERSION 与旧值不同，首次启动会触发 storage.clearAll。

---

## Task 2：MindNode 视觉改造（5 态徽标 + 下方进度条常驻 + 笛子路线椭圆/卡片）+ 阶段分隔带组件

- **优先级**：high
- **关联 AC**：AC-2, AC-3, AC-10, AC-12
- **改动文件**：
  - `src/components/mindmap/MindNode.jsx`：
    - 新增左上角"状态徽标胶囊"（待开/进行/暂停/已完/放弃，2字 + 背景色），删除原右上角"小状态点"。
    - 区分 `阶段节点（level≤1 椭圆 + 序号徽章）` vs `知识点节点（level≥2 下置卡片，上边框彩色 + 双行标题）`，下方进度条永远渲染且宽度 = 节点宽 × 0.9。
  - `src/components/mindmap/StageDividers.jsx`（新增）：三阶段（前期 33% / 中期 33% / 后期 33%）垂直分隔带 + 顶部大标题文字。
- **本地 TR**：
  - TR-T2-1 `rule`：每个 MindNode 都存在左上角"状态徽标胶囊"。
  - TR-T2-2 `rule`：下方进度条 DOM 必存在（即使 progress=0 也渲染）。
  - TR-T2-3 `rule`：StageDividers 三段宽度一致（getBoundingClientRect 差值 < 1px）。
  - TR-T2-4 `rubric`：与笛子路线参考图相似度（中心椭圆+序号+下方卡片+三阶段分割）：打分 0-5，阈值 ≥ 4。

---

## Task 3：删除左下角统一状态栏 + 删除"自定义标签"全量入口

- **优先级**：medium
- **关联 AC**：AC-2, AC-11
- **改动文件**：
  - `src/pages/LongTermGoalsPage.jsx`：删除左下角 `<div className="absolute left-4 bottom-4 ...">` 四色状态条；grep "自定义标签 / AddTag / 标签管理 / tag" 出现过的 UI 入口全部移除（保留 NodePopup 方案/配置 2 标签，不扩第三）。
- **本地 TR**：
  - TR-T3-1 `rule`：LongTermGoalsPage 左下角无状态条 DOM。
  - TR-T3-2 `rule`：全文检索（含中文）"自定义标签 / 标签管理 / AddTag / 新建标签"零命中（或命中处为注释/不可达分支）。

---

## Task 4：NodePopup 顶部「📤 下发复制到日常打卡」主按钮 + 去重

- **优先级**：high
- **关联 AC**：AC-5
- **改动文件**：`src/components/mindmap/NodePopup.jsx`
  - 在头部 2 按钮行（AI写方案 / 新增子任务）下方追加一排主按钮：`📤 下发复制到日常打卡`；
  - 内部实现 `getLeafDescendants(nodeId)`；若 `habit.sourceNodeId === leaf.id` 已存在则跳过并 toast 提示不重复；批量下发到上限 12 时 alert 剩余未下发数量。
- **本地 TR**：
  - TR-T4-1 `rule`：打开任意节点弹窗，顶部存在 `📤 下发复制到日常打卡`主按钮（不依赖行内 📤）。
  - TR-T4-2 `rule`：同一叶子下发 2 次，第二次 toast 显示「已下发过」，state.habits 数组长度不增加。

---

## Task 5：日常打卡 ↔ 幕布双向同步（TOGGLE_CHECKIN 反推节点状态+进度+父级重算）

- **优先级**：high
- **关联 AC**：AC-6, AC-14
- **改动文件**：`src/context/AppContext.jsx`
  - 在 `case 'TOGGLE_CHECKIN'` 写完 checkins 之后：`const habit = state.habits.find(h => h.id === habitId); if (habit && habit.sourceNodeId)` 则：
    - 勾选：`UPDATE_NODE sourceNodeId { status: 'done', progress: 100 }`
    - 取消勾选：`UPDATE_NODE sourceNodeId { status: 'todo', progress: 0 }`
    - UPDATE_NODE 内部已经会触发 `recalcParentProgress`，保证父级下方进度条立刻变化。
- **本地 TR**：
  - TR-T5-1 `rule`：新建叶子→下发→习惯勾选成功→state.nodes[sourceNodeId].status==='done' && progress===100。
  - TR-T5-2 `rule`：取消勾选→status==='todo' && progress===0，父节点 calcProgress 数值改变（浏览器状态观察）。
  - TR-T5-3 `rubric`：双向同步直观度 0-5，阈值 ≥ 4（勾选立刻看到进度条变化 + 撤回可用）。

---

## Task 6：MindMapCanvas 支持多并行大任务动态根间距 + 节点/连线过滤（visible）

- **优先级**：high
- **关联 AC**：AC-8, AC-9, AC-13
- **改动文件**：
  - `src/components/mindmap/MindMapCanvas.jsx`
    - 新增 props：`timeFilter = 'all'`（从 LongTermGoalsPage 传入），基于 useMemo 计算 `visibleRootIds / visibleNodeIds`；
    - `renderedNodes = nodes.filter(n => visibleNodeIds.has(n.id))`；只对 renderedNodes 渲染 MindNode；
    - `NodeLinks nodes` 传 renderedNodes（保证只渲染两端都可见的连线）；
    - 布局 useEffect 新增：对每个根计算 `calcTreeHeight(rootId)` → 根起始 y 按树高累加 + 每棵树后 80px GAP。
  - `src/components/mindmap/NodeLinks.jsx`：不改动（只吃 visibleNodes，天然过滤掉）。
- **本地 TR**：
  - TR-T6-1 `rule`：双大任务 2 根，DOM 测量"根1后代 y 最大值" < "根2 y 最小值 - TREE_GAP"。
  - TR-T6-2 `rule`：切换"本周"筛选后，DOM 中被过滤根下的子节点数量为 0。
  - TR-T6-3 `rubric`：并行布局不重叠 + 连线不错位 0-5，阈值 ≥ 4。

---

## Task 7：LongTermGoalsPage 右上角控件栏（时间筛选 + 预估完成时间）+ 阶段分割挂载

- **优先级**：high
- **关联 AC**：AC-7, AC-8, AC-10
- **改动文件**：`src/pages/LongTermGoalsPage.jsx`
  - 新增 state：`timeFilter = 'week' | 'month' | 'all'`（默认 'all'）
  - 新增控件 DOM：`absolute right-4 top-4 z-10` 下两个子元素——筛选按钮 row + 预估时间 row；
  - 计算 `estimateEndDate`：对可见叶子 未完成 状态 过滤 paused/aborted → 合计 H 小时 → 剩余天数 = ceil(H / 4) → ETA = today + 剩余天数；
  - 挂载 `StageDividers` 到画布的"非 transform 包裹"的一层：即 MindMapCanvas 外层增加 children prop / 或 MindMapCanvas 内部导出 slot 渲染 StageDividers（任选其一实现，选改动小的）。
- **本地 TR**：
  - TR-T7-1 `rule`：DOM 中存在"本周/本月/全部时间"三按钮行 + "⏱ 预计完成"文案行。
  - TR-T7-2 `rule`：所有叶子 done 时，文案显示 "🎉 全部任务已收尾！"。
  - TR-T7-3 `rule`：点击"本周"后，MindMapCanvas 接收到的 timeFilter props 同步改变。

---

## Task 8：构建 + TRAE 长驻预览 + 主观 UI 打分

- **优先级**：high
- **关联 AC**：AC-12, AC-13, AC-14
- **改动文件**：无需代码，验证命令
- **本地 TR**：
  - TR-T8-1 `rule`：`node vite build` 成功 dist 产出。
  - TR-T8-2 `rule`：vite-preview.mjs 前台启动成功，OpenPreview 绑定预览可访问。
  - TR-T8-3 `rubric`（AC-12 打分）节点视觉相似度 ≥ 4。
  - TR-T8-4 `rubric`（AC-13 打分）大任务并行布局 ≥ 4。
  - TR-T8-5 `rubric`（AC-14 打分）双向同步直观度 ≥ 4。

---

## 任务依赖关系图

```
T1 ─┬─→ T2 ─→ T3
    ├─→ T4 ─→ T5
    └─→ T6 ─→ T7 ─→ T8
```

T1 = 全局基础（常量 + 进度公式），完成后 T2/T4/T6 可并行推进；T8 为最终构建验证。
