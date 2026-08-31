# 系统七 · 情绪心理 + 社区聊天（mind-community）

状态：✅ 第一期已建成（本地模拟版：页内三条 Tab —— 情绪占位 / 社区 / 聊天，无后端，数据仅存本机）

## 文件构成

| 文件 | 作用 |
| --- | --- |
| `components/MindCommunityPage.jsx` | 页面骨架：标题栏 + 页内底部三条 Tab（情绪/社区/聊天，样式复刻全局 BottomTabs），Tab 切换为页面内部状态 |
| `components/EmotionTab.jsx` | Tab1「情绪」：占位（功能未规划，复用 SystemPlaceholder） |
| `components/CommunityTab.jsx` | Tab2「社区」：朋友圈式信息流（文字帖/点赞）+ 右下角发帖浮层 |
| `components/ChatTab.jsx` | Tab3「聊天」：好友列表 → 一对一聊天窗口（气泡消息，好友自动回复为本地模拟） |
| `services/mockData.js` | 模拟数据：5 个模拟用户、10 条示例帖、3 个预置好友及聊天记录、自动回复语料 |
| `services/communityStorage.js` | 本地持久化：经 db.js（IndexedDB 统一存储层）读写；相对时间格式化 |
| `index.js` | 模块入口，对外导出 MindCommunityPage |

## 数据说明（第一期：本地模拟）

- 存储键 `growth_app_v1_mind_community`（定义在本模块 communityStorage.js 内，不占用公共 constants.js）：整个板块一个对象 `{ friends, likedPostIds, posts, chats }`。
- 「我」固定为 `ME_USER`（小美 🌸）；发帖、点赞、加好友、聊天均只写本地存储，清除 App 数据后恢复初始示例状态。
- 状态层说明：**本期未使用** `context/reducers/mindCommunityReducer.js`（仍为恒等占位）。帖子/好友/消息为页面本地状态 + localStorage 级持久化，功能复杂化后再迁入全局 context。
- 聊天浮层/发帖浮层使用 `utils/backStack.js` 注册返回键关闭，符合全局「返回键先关浮层」优先级。

## 在主工程中的接线

- 路由：`/mind-community`（`src/App.jsx`）
- 全局底栏：`/mind-community` 路由下隐藏全局 BottomTabs（App.jsx 一行条件），由页内三条 Tab 接管
- 顶栏：TopStatusBar 中 `mind-community` 显示「情绪与心理」

## 拿走本系统需要一起复制

- 本文件夹整体
- `src/shared/components/SystemPlaceholder.jsx`（EmotionTab 占位卡依赖）
- `src/utils/backStack.js`（发帖/聊天浮层的返回键支持）
- `src/services/db.js`（持久化层；其依赖 `idb` 包与 `src/shared/constants/index.js`）

## 后续规划（真联机时替换）

- 后端接入：替换 `communityStorage.js` 的 load/save 为接口调用（组件层不动）；
- 账号：`ME_USER` 换成真实登录用户（账号系统模块第二期）；
- 真实社区需内容审核机制（应用商店合规要求）。
