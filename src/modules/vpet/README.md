# 独立模块 · 虚拟桌宠 · 表演指令控制中心（vpet）

状态：🚧 阶段一完成（协议/仲裁/参数分区合并 + Mock 执行器，21 项冒烟测试全通过，全链路可脱离 Live2D 联调）。

## 目标

用 SoulLink_Live2D（管面部表情）+ AG99live（管身体动作）两个开源项目拼成一个桌面角色，由大模型充当大脑：AI 在应用里执行任务（如换背景）时，桌宠用动作把"干活过程"表演出来，而不是显示"执行中"。

## 架构

```
大脑(LLM) → Director(本模块) → 脸执行器(SoulLink_Live2D 适配器)
                              → 身执行器(AG99live 适配器)
            → channels.js 参数分区合并 → Live2D 模型（每帧仅一次写入）
```

**冲突解决方案（参数通道分区）**：两个开源项目都直接写同一个 Live2D 模型的参数，谁后写谁生效——这是冲突根源。本模块把模型参数切成两组，各归各家：

| 通道 | 执行器 | 参数（Cubism 标准） |
| --- | --- | --- |
| 脸 | SoulLink_Live2D 适配器 | 眼开闭/眨眼/眉/嘴/脸颊/眼泪 |
| 身 | AG99live 适配器 | 头转角/身转角/**视线**/呼吸/位置/头发物理 |

合并器按表过滤：执行器输出了不属于自己通道的参数会被**直接剥除**（Mock 里故意塞了越权参数做持续验证）。

## 文件构成

| 文件 | 作用 |
| --- | --- |
| `protocol.js` | 表演指令白名单协议：speak(口型) > emote(情绪) > motion/work(动作) > idle；校验与归一化 |
| `channels.js` | 参数分区表 + 过滤 + 每帧一次的合并 |
| `director.js` | 控制中心：通道路由、同通道优先级仲裁、过期回落待机、work 完成回调、事件 |
| `executors/mockExecutors.js` | Mock 执行器（与真实适配器同契约 render(instruction, now, dt)），平滑趋近模拟过渡 |
| `smoke.test.js` | 全链路冒烟测试（esbuild 打包后 node 直跑） |

## 指令协议（LLM 输出，白名单外丢弃）

```json
{"type":"emote","name":"happy","durationMs":3000,"params":{"intensity":1.2}}
{"type":"speak","durationMs":4000}
{"type":"motion","name":"nod","durationMs":1500}
{"type":"work","name":"cast","params":{"taskId":"bg-123"}}   // 任务完成时调 completeWork 收工
{"type":"idle"}
```

## 侦察结论（阶段 0）

- **SoulLink_Live2D**（nanlingyin，MIT，Python 后端 + JS 前端 + WebSocket）：LLM 输出表情参数，easeInOutCubic 平滑、口型同步、遮罩/光照系统 → 取其**表情参数生成思路**做脸执行器；
- **AG99live**（murphys7017，Electron + TypeScript）：LLM 输出九级语义动作（head_yaw/body_yaw/brow_bias 等 -4..4），ModelEngine 编译成逐帧参数计划 + 统一 Timeline → 取其**语义强度→参数编译**思路做身执行器；
- ⚠️ 两者的冲突点：AG99 语义里含 brow_bias（眉毛）——分区表中眉毛归脸通道（SoulLink），AG99 适配器只准输出头/身/视线；
- ⚠️ SoulLink 仓库未见 LICENSE 文件（badge 写 MIT 但需确认），接入代码前再核实。

## 阶段二 TODO

1. 深入读两个项目源码，拿到真实参数名清单 → 更新 `channels.js` 分区表；
2. 写 `executors/soullinkFaceAdapter.js` 与 `executors/ag99BodyAdapter.js`（render 契约不变）；
3. Live2D Web 渲染层（Cubism 4 runtime）+ 每帧驱动循环；
4. 大脑接入：表演人设 system prompt + 表演指令与 appActions 任务联动（AI 干活 → work 指令 → completeWork）。

## 路径B · PNG 纸片人渲染器（当前形态）

- 立绘预处理：`node scripts/prepare-pet-png.cjs <输入图> public/pet/base.png`
  （自动抠豆包棋盘格底→孤岛清理→去斑点→裁剪→缩到 512px 透明底）；
- `renderer/PngPet.jsx`：Director 参数 → 整图变换（头身角度=旋转位移、呼吸=缩放）+ 整图变体交换（眨眼/张嘴）；
- 挂载：App.jsx，3D 知识库页与纯净模式自动隐藏；调试入口 `window.__petDirector`。

## 豆包 AI 变体生成指引（严格一致性要求）

在豆包中使用**参考图编辑/图生图**模式，上传 `public/pet/base.png` 原图，提示词模板：

> 严格编辑这张图片：只改变【XX部位】为【目标状态】，角色的姿势、发型、服装、表情其余部分、
> 头身比例、构图位置、背景（棋盘格）全部与原图完全一致，一个像素都不许移动，
> 不许添加任何新元素、不许改变画风和线条，输出与原图同尺寸。

需要的变体（生成后放 `public/pet/`，文件名对应即可生效）：
1. `blink.png`——只闭眼（双眼闭合，其余不变）
2. `mouthOpen.png`——只张嘴（嘴巴张开约半厘米的幅度，其余不变）

⚠️ 一致性是 AI 生图的难点：每次生成后对比检查，任何多余变化（发丝位移、颜色偏差）都不可用，重生成。
