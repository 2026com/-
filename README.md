# 成长小美（Growth App）

一个 React + Vite + Capacitor 的个人成长 App：待办打卡、长期目标横线本、知识图谱、情绪社区等，可打包为安卓 APK。

## 整体架构

整个 App 由 **七个系统** + **一层公共基础设施** 组成。每个系统是 `src/systems/` 下的一个独立文件夹，各自带一个 `README.md` 说明自己的文件构成和依赖清单。

```
┌────────────────────────────────────────────────────────────┐
│                        App.jsx（路由入口）                  │
│   /daily  /goals  /review  /skill-tree  /finance           │
│   /social-graph  /knowledge-base  /health  /mind-community │
└────────────────────────────┬───────────────────────────────┘
                             │ 每个 Page 组件
┌────────────────────────────┴───────────────────────────────┐
│                     七大系统 src/systems/                   │
│  1. daily-tasks      日常待办 ✅ 已建成（含长期目标/复盘）    │
│  2. skill-tree       技能树        🚧 占位                   │
│  3. finance          财务管理      🚧 占位                   │
│  4. social-graph     社交图谱      🚧 占位                   │
│  5. knowledge-base   3D 知识库     ✅ 已建成                  │
│  6. health           身体状态      🚧 占位                   │
│  7. mind-community   情绪心理+社区 🚧 占位                   │
└────────────────────────────┬───────────────────────────────┘
                             │ 全部通过统一的状态层读写数据
┌────────────────────────────┴───────────────────────────────┐
│                    公共基础设施（拿代码要一起带走）           │
│  src/context/     全局状态（AppContext + 各系统 reducer）    │
│  src/services/    本地存储 / 主题 / 分享接收等               │
│  src/utils/       常量 / 存储工具 / AI 逻辑 / 通知等         │
│  src/shared/      跨系统共用的小组件与 hooks                 │
│  src/hooks/       思维画布布局/交互 hooks                    │
│  src/modules/     AI 助手（全局挂载，非独立系统）            │
│  src/data/        mock 示例数据                             │
└────────────────────────────────────────────────────────────┘
```

## 想只拿走某一个系统？

**先看该系统文件夹里的 `README.md`**——里面列了「拿走这个系统需要一起复制的公共文件清单」，照着清单复制就能跑。最省事的两种拿法：

1. **网页下载**：打开 [download-directory.github.io](https://download-directory.github.io)，粘贴
   `https://github.com/2026com/-/tree/refactor/split-components/src/systems/<系统名>` 即可只下载该文件夹。
2. **git 命令**（稀疏检出，把 `daily-tasks` 换成你要的系统名）：
   ```bash
   git clone --no-checkout --depth 1 https://github.com/2026com/-.git
   cd - && git sparse-checkout set src/systems/daily-tasks
   git checkout
   ```

> 提示：五个「占位」系统（skill-tree / finance / social-graph / health / mind-community）只有一个骨架页，无实际数据依赖，拿走即可用；daily-tasks 和 knowledge-base 是完整功能，依赖的公共文件较多，务必按各自 README 的清单一起复制。

## 本地运行

```bash
npm install
npm run dev        # 浏览器开发预览
```

安卓 APK 构建使用 Capacitor（`android/` 目录），日常开发不需要碰它。

## 分支说明

- `master`：重构前的完整历史备份
- `refactor/split-components`：当前开发主线（按系统拆分组件后的结构，即本 README 描述的结构）
