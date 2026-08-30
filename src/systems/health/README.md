# 系统六 · 身体状态（health）

状态：🚧 占位骨架（只渲染「建设中」占位卡，功能尚未开发）

## 文件构成

| 文件 | 作用 |
| --- | --- |
| `components/HealthPage.jsx` | 页面骨架，渲染通用占位组件 SystemPlaceholder |
| `index.js` | 模块入口，对外导出 HealthPage |

## 在主工程中的接线（已接好）

- 路由：`/health`（`src/App.jsx`）
- 状态：`src/context/reducers/healthReducer.js`（恒等占位，开发功能时在这里追加 action 处理）

## 拿走本系统需要一起复制

- 本文件夹整体
- `src/shared/components/SystemPlaceholder.jsx`（占位卡组件，唯一外部依赖）

依赖极少，复制后即可运行。注意：正式开发功能后外部依赖会增多，届时请同步更新本清单。
