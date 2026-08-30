# 系统五 · 3D 知识库（knowledge-base）

状态：✅ 已建成。3D 力导向知识图谱：知识节点悬浮环绕、支持 AI 批量导入生成、节点生长动画、天空视差背景。

## 文件构成

```
knowledge-base/
├── index.js                        模块入口（导出 KnowledgeBasePage）
├── components/
│   ├── KnowledgeBasePage.jsx       知识库页面（纯净模式入口所在页）
│   └── KnowledgeGraph3D.jsx        3D 图谱渲染核心
├── hooks/
│   └── useSkyParallax.js           天空视差背景 hook
└── services/
    ├── graphTextures.js            共享纹理（点状贴图，daily-tasks 的 3D 记忆库也复用此文件）
    ├── graphGrowth.js              节点生长/布局算法
    ├── knowledgeImport.js          链接/文本 → 知识节点导入解析
    ├── mockKnowledgeGraph.js       示例图谱数据
    └── userKnowledge.js            用户知识数据存取
```

## 在主工程中的接线（已接好）

- 路由：`/knowledge-base`（`src/App.jsx`）
- 状态：`src/context/reducers/knowledgeBaseReducer.js`；节点数据主要经 `src/services/db.js`（IndexedDB）存取

## 拿走本系统需要一起复制的公共文件

| 类别 | 需要复制的路径 | 用途 |
| --- | --- | --- |
| AI 模块 | `src/modules/ai-assistant/services/aiClient.js` | AI 批量导入知识（仅这一个文件；不需要 AI 导入可删掉相关调用） |
| services | `src/services/db.js`、`src/services/storage.js` | IndexedDB / 本地存储 |
| shared | `src/shared/constants/index.js` | 共享常量 |

第三方依赖（`package.json`）：`react`、`three`、`@react-three/fiber`、`@react-three/drei`、`@react-three/postprocessing`。
