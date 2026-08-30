# 系统一 · 日常待办（daily-tasks）

状态：✅ 已建成。包含三个页面：日常打卡（习惯 + 临时任务 + 番茄钟）、长期目标横线本、历史复盘；横线本内含思维画布、照片插入、记录总览画廊与 3D 记忆库。

## 文件构成

```
daily-tasks/
├── index.js                        模块入口（导出三个 Page）
├── components/
│   ├── DailyHabitsPage.jsx         日常打卡页（习惯/临时任务/打卡日历/番茄钟）
│   ├── HistoryReviewPage.jsx       历史复盘页
│   ├── index.js                    组件二级入口
│   ├── habits/                     打卡相关弹层（批量打卡、番茄钟、转盘时间选择器等）
│   │   ├── BatchCheckinModal.jsx / CheckinSections.jsx
│   │   └── PomodoroModal.jsx / WheelTimePicker.jsx
│   ├── mindmap/                    思维画布（节点渲染/连线/弹层/阶段分隔）
│   │   ├── MindMapCanvas.jsx / MindNode.jsx / NodeRenderer.jsx
│   │   ├── NodeLinks.jsx / EdgeRenderer.jsx / NodePopup.jsx
│   │   └── CanvasRenderer.jsx / StageDividers.jsx
│   └── goal-notes/                 长期目标横线本
│       ├── LongTermGoalsPage.jsx   横线本主页（含照片插入）
│       ├── GoalsPaperGallery.jsx   记录总览画廊（迷你稿纸卡片）
│       └── MemoryUniverse3D.jsx    3D 记忆库（纸张/文字星河两形态）
└── services/
    ├── notesStorage.js             横线本数据存取
    └── sync.js                     数据同步
```

## 在主工程中的接线（已接好）

- 路由：`/daily`、`/goals`、`/review`（`src/App.jsx`）
- 状态：全局状态里有本系统的领域字段（nodes / habits / tempTasks / checkins / timerRecords），
  对应 reducer：`src/context/reducers/dailyTasksReducer.js` + `reviewReducer.js`（公共工具 `nodeHelpers.js`）

## 拿走本系统需要一起复制的公共文件

| 类别 | 需要复制的路径 | 用途 |
| --- | --- | --- |
| 全局状态 | `src/context/`（整个文件夹，含 AppContext.jsx、appStorage.js、reducers/） | 所有数据读写都走统一 reducer 链 |
| hooks | `src/hooks/useMindMapLayout.js`、`useNodeInteraction.js` | 思维画布布局与交互 |
| services | `src/services/theme.js`、`device.js`、`storage.js` | 主题 / 设备信息 / 本地存储 |
| utils | `src/utils/storage.js`、`constants.js`、`notify.js`、`backStack.js`、`aiLogic.js` | 存储 / 常量 / 提醒通知 / 安卓返回键 / AI 生成逻辑 |
| 跨系统 | `src/systems/knowledge-base/services/graphTextures.js` | 3D 记忆库复用知识库的点状纹理（仅此一个文件） |

第三方依赖（`package.json`）：`react`、`three`、`@react-three/fiber`、`@react-three/drei`（3D 部分才需要；不需要 3D 记忆库可删除 `MemoryUniverse3D.jsx` 与这几个依赖）。
