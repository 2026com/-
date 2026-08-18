# 幕布时间轴 + AI侧边 实施任务清单

> 父规格：[spec.md](./spec.md)
> 拆解：按"存储升级 → 幕布B1 → 幕布B2 → AI侧边+配置 → 验证"拆 7 任务
> 执行顺序：T0 → T1 → T2 → T3 → T4 → T5（T3 和 T4 可并行；其他串行）

---

## 任务总览

| ID | 标题 | 涉及文件 | 优先级 | 依赖 | Status |
|---|---|---|---|---|---|
| T0 | 存储升级：constants 加 AI_CONFIG key / 升级 DATA_VERSION / reducer 新增 APPEND_AI_MESSAGE + RESET_AI_HISTORY | constants.js + AppContext.jsx | high | 无 | pending |
| T1 | B1 修双击→按钮新建：删 onCanvasDblClick / onDoubleClick / 改空画布CTA / 右下角工具栏加「➕ 新建长期目标」 | MindMapCanvas.jsx + LongTermGoalsPage.jsx | high | T0 | pending |
| T2 | B2 时间轴改日粒度线条形式：DAY_W/DAY_X0/105天/主横线+周日刻度/今日三角/节点x映射/比例h-20/offset y=160 | MindMapCanvas.jsx | high | T1 | pending |
| T3 | AI 侧边组件 AIChatSidebar：消息区 + 输入区(Ctrl+Enter) + 顶栏(配置/清空) + 普通问答 try/catch/10s 超时/V1 占位 | components/ai/AIChatSidebar.jsx （新建）| high | T0 | pending |
| T4 | 模型 API 配置面板：Provider 4 项预设/Key password/Base/Model/测试连通 + 左下角切换 AI/Nav 按钮 | components/ai/AIConfigPanel.jsx（新建）+ LongTermGoalsPage.jsx | high | T0 | pending |
| T5 | 联通 reducer + Nav/AI 切换：在全局布局里把 drawerMode=ai 时渲染 AIChatSidebar；nav 渲染原有导航；检查 RET1-RET6 未破坏 | App.jsx / NavPage.jsx（先定位） + AppContext.jsx | high | T3+T4 | pending |
| T6 | 验证：GetDiagnostics 7 文件 + Grep 回归 RET1-RET5 + AC 手动验证 | 跨项目 | high | T0-T5 | pending |

---

## Task 0：存储结构 & Reducer 升级（AI 聊天与配置前置）

### 原子操作
1. **constants.js 加 STORAGE_KEYS.AI_CONFIG** → 写入 `AI_CONFIG: 'growth_app_v1_ai_config'` 到 STORAGE_KEYS 对象
2. **DATA_VERSION 升级** → `1.0.5-20260814-timeline-daily-ai-sidebar`（触发用户清旧 mock 保证新状态空）
3. **AppContext.jsx initialState** → 读取 `aiConfig: storage.get(STORAGE_KEYS.AI_CONFIG, { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', modelId: 'deepseek-chat', apiKey: '' })`（默认预填 DeepSeek）
4. **reducer 新增 3 个 action**：
   - `APPEND_AI_MESSAGE`: payload = { message } → `aiHistory = [...state.aiHistory, message].slice(-200); storage.set(AI_HISTORY, aiHistory)`（最多 200 条，自动截断保留最新）
   - `RESET_AI_HISTORY`: 不 payload → `aiHistory = []; storage.set(AI_HISTORY, aiHistory)`
   - `UPDATE_AI_CONFIG`: payload = { ...partialFields } → `aiConfig = { ...state.aiConfig, ...action.payload }; storage.set(AI_CONFIG, aiConfig)`；并校验 baseUrl 非空时 http/https 前缀（前缀不对不写，toast 报错）

### 关联 AC
AC-AI-6（存储升级 + DATA_VERSION 升级）

### 本地测试需求（TR）
| TR | 类型 | 内容 |
|---|---|---|
| T0-TR1 | rule | constants.js Grep `1.0.5` → ≥ 1 命中；`growth_app_v1_ai_config` → ≥ 1 命中 |
| T0-TR2 | rule | AppContext reducer switch 内包含 `APPEND_AI_MESSAGE / RESET_AI_HISTORY / UPDATE_AI_CONFIG` 3 个 case；每个 case 都有 `storage.set(对应 key)` |
| T0-TR3 | rule | 新增 201 条消息时 → state.aiHistory.length = 200（第 201 条写入后自动删除最旧 1 条，.slice(-200) 生效） |

---

## Task 1：B1 修复 - 双击空白 → 按钮新建（2 处显眼 CTA + 强制命名）

### 原子操作
1. **删双击交互两处**（MindMapCanvas.jsx）：
   - 删除 L154-193 整个 `const onCanvasDblClick = (e) => {...}` 函数
   - 删除 L200 `onDoubleClick={onCanvasDblClick}` 绑定 prop
2. **右下角工具栏追加「➕ 新建长期目标」按钮**（LongTermGoalsPage.jsx 工具栏顶部 L56-68 处，在"样式切换"按钮上方，追加一条 h-px 分隔线 + 主色按钮）
   - 文案：`➕ 新建`；样式：`w-9 h-9 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 flex items-center justify-center text-base font-bold shadow-md shadow-indigo-200 touch-feedback`（显眼，不是灰色按钮，要突出）
   - onClick 逻辑：复用原 onCanvasDblClick 里 prompt + ADD_NODE payload 结构（parentId: null, status:todo, progress:0, level:0）
   - **定位**：新增节点放在当前画布可见中心 = 需要 MindMapCanvas 容器尺寸 → 在 LongTermGoalsPage 加一个 canvasWrapRef，给 `<div className="flex-1 overflow-hidden relative" ref={canvasWrapRef}>`；在 onClick 里：
     `const w = canvasWrapRef.current?.clientWidth || 800; const h = canvasWrapRef.current?.clientHeight || 600; const nx = (w/2 - offset.x) / zoom; const ny = (h/2 - offset.y) / zoom - 60;`（偏移 -60 避免盖住时间轴）
   - 这里 LongTermGoalsPage 需要接收 zoom / offset 吗？→ zoom 本就在 LongTermGoalsPage useState（L15），但 offset 现在是 MindMapCanvas 内部 useState！→ 需要把 offset 从 MindMapCanvas **提升到父组件** LongTermGoalsPage（MindMapCanvas props 加 offset / setOffset 受控）；或更简单：暴露方法 `MindMapCanvas` 用 forwardRef + useImperativeHandle 提供 `getViewportCenter()`，但太重。**本任务采用：LongTermGoalsPage 增加 offset state 作为受控，下传给 MindMapCanvas 作为 props，替代 MindMapCanvas 内部 state**（耦合低，也可让工具栏里按钮直接用）。
3. **空画布 CTA 按钮**（MindMapCanvas.jsx L249-256）：
   - 文案改：`🎯 你还没有长期目标` → H1 字体；下方主按钮 `+ 新建第一个长期目标`（bg-indigo-500 白色字）；辅助小字不变
   - 按钮 onClick 同样 trigger PUSH_MODAL prompt → ADD_NODE（LongTermGoalsPage 受控 offset 后同样能拿到 viewport 中心；或 MindMapCanvas 自己内部 offset 也传就自己算 x/y，这里用的话 MindMapCanvas 需要自己同样 dispatch PUSH_MODAL 或调用父传的 createRootNode callback 回调函数）
   - **采用 callback 方式更清晰**：LongTermGoalsPage 把 `handleCreateRootNode()` 函数通过 props 传给 MindMapCanvas（MindMapCanvas props 加 onCreateRootNode），LongTermGoalsPage 实现 2 处按钮（右下工具栏 + 空画布 CTA）都调用同一 handleCreateRootNode，逻辑统一不重复。
4. **强制命名保留**：两处 prompt 都做 `title = (val||'').trim(); if (!title) return`；禁止默认名。

### 关联 AC
AC-B1-1（删双击 0 命中）、AC-B1-2（右下角按钮）、AC-B1-3（空画布 CTA）、AC-B1-4（rubric）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T1-TR1 | rule | MindMapCanvas.jsx Grep `onDoubleClick\|onCanvasDblClick` → 0 命中（双删除） |
| T1-TR2 | rule | 右下角工具栏存在「➕ 新建」主色按钮（不是灰色）；点击 → 弹 prompt；输入"测试根A"→ 画布上出现节点，出现在屏幕中心（误差 ≤ 100px） |
| T1-TR3 | rule | 0 节点场景：显示"新建第一个长期目标"按钮（CTA），点击后同样 ADD_NODE，场景消失（改为显示新节点） |
| T1-TR4 | rule | prompt 输入空字符串 → state.nodes 不增长（强制命名）；输入纯空格 trim 后也不创建 |
| T1-TR5 | rubric | 新建节点成功率（各种场景下 5 次尝试）0-2 ≥ 1.5 |

---

## Task 2：B2 时间轴改日粒度线条形式（跨度 2940px）

### 原子操作
1. **常量**：MindMapCanvas.jsx L19-24 下追加：
   - `DAY_X0 = 200`（日轴左侧起点）
   - `DAY_W = 28`（每天像素步长）
   - `DAYS_BEFORE = 14`（过去 14 天）
   - `DAYS_AFTER = 90`（未来 90 天）
2. **计算日期数组**：在 MindMapCanvas 顶部做 const `dateAxis = useMemo(() => { const arr = []; for (let i=-DAYS_BEFORE; i<=DAYS_AFTER; i++) { const d = new Date(today); d.setDate(d.getDate()+i); arr.push({ date: d, dayOfWeek: d.getDay(), dayNum: d.getDate(), monthNum: d.getMonth()+1, isToday: i===0, isSunday: d.getDay()===0, weekNum: Math.ceil((i+DAYS_BEFORE+1+today.getDay())/7) }); } return arr; }, [])`（today = new Date 取当天）
3. **时间轴容器改造**（原月份轴 L206-219，整体替换）：
   - className: `absolute top-4 left-0 w-full h-20 flex items-start pointer-events-none z-1`
   - style: `transform: translate(${offset.x}px, 0) scale(1)`（x 方向跟随平移；不跟随 zoom；固定 h-20=80px）
   - 内部结构：
     ```jsx
     <div className="relative w-full h-full px-6">
       {/* 1. 主横线：横跨整个 105 天，y = 40px 左右 */}
       <div className="absolute left-0 right-0 top-[40px] h-[2px] bg-slate-300" />
       {/* 2. 每日刻度 */}
       {dateAxis.map((d, i) => {
         const x = DAY_X0 + i * DAY_W
         const isSunday = d.isSunday
         const height = isSunday ? 40 : 16
         const showText = isSunday || (i - 14 + today.getDate()) % 7 === 0 // 每 7 天显示一次日期，不然会拥挤
         return (
           <div key={i} className="absolute" style={{ left: x, top: '40px' }}>
             <div className={`absolute left-0 top-0 w-px ${isSunday ? 'bg-slate-500' : 'bg-slate-300'}`} style={{ height }} />
             {showText && <div className="absolute -left-3" style={{ top: height + 2, fontSize: 10, color: '#64748b' }}>{d.monthNum}月{d.dayNum}日</div>}
             {isSunday && <div className="absolute -left-4" style={{ top: -34, fontSize: 11, color: '#334155', fontWeight: 600 }}>第{d.weekNum}周</div>}
             {d.isToday && <div className="absolute -left-2 top-[-16px]">🔺</div>} {/* 今日红色小三角 */}
           </div>
         )
       })}
     </div>
     ```
4. **节点 x 映射（自动布局 useEffect L53-91 兼容）**：
   - 根节点（parent 不存在）→ 新 x = DAY_X0 + DAYS_BEFORE * DAY_W（= 今天刻度位置）
   - 直接子节点：i 在 siblings 中 index → `dayOffset = 3 + index * 7`（3 天后、10 天后、17 天后依次）→ x = today_x + dayOffset * DAY_W；或保留 monthIndex 兼容：如果 monthIndex 非空就按月份映射到该月第 15 号的 x
   - 子节点 offsetY 公式不变（SIBLING_Y_STEP 88）
5. **比例留白**：初始 useEffect 中 `setOffset({..., y: 160 })`（T3 改的 140 → T6 再 +20 = 160）

### 关联 AC
AC-B2-1（105 天 ≥ 2800px）、AC-B2-2（线条+周日+日期+周+今日三角）、AC-B2-3（对齐+不重叠）、AC-B2-4（h-20 比例）、AC-B2-5（美观度 rubric）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T2-TR1 | rule | 天刻度数组 length = 105；DOM 里 105 根 w-px 刻度；span 总宽 ≥ DAY_X0 + 105*DAY_W - 50 ≈ 2940px（误差 ≤ 20px） |
| T2-TR2 | rule | 主横线 2px 高度 ≥ 2940px 宽存在；周日刻度高 40px；≥ 15 个周"第X周"标签；今日 🔺 红色三角 1 个且位置 = today 的 DAY_X0 + 14*DAY_W |
| T2-TR3 | rule | 根节点初始 x 与今日刻度 x 差 ≤ 5px；子节点 index=0/1/2 分别在 today+3/10/17 天刻度位置（x 差 ≤ 5px） |
| T2-TR4 | rule | 时间轴容器 h-20 = 实际 80px；初始 offset.y = 160（代码 setOffset 写死 160） |
| T2-TR5 | rubric | 整体美观度（比例/跨度/刻度疏密）0-2 ≥ 1.5 |

---

## Task 3：AI 聊天侧边组件 AIChatSidebar（新建）

### 原子操作
1. **新建文件**：`src/components/ai/AIChatSidebar.jsx`
2. **props**：`open`（drawerOpen）/ `onToggleDrawer`（调 TOGGLE_DRAWER）/ `onOpenConfig`（调打开配置面板弹窗 state）/ `messages`（state.aiHistory）/ `aiConfig`（state.aiConfig） / `dispatch`（reducer dispatch）
3. **DOM 结构**（Tailwind，简约大留白）：
   ```jsx
   <div className={`h-full w-full flex flex-col bg-gradient-to-br from-slate-50 to-white border-r border-slate-200 transition-all duration-300 ${open ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
     {/* 顶栏 */}
     <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-200 bg-white/80 backdrop-blur">
       <div className="flex items-center gap-2 text-base font-bold text-slate-800">🤖 AI 助手</div>
       <div className="flex items-center gap-1">
         <button onClick={onOpenConfig} className="w-8 h-8 rounded-lg hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 flex items-center justify-center text-sm touch-feedback">⚙️</button>
         <button onClick={onClear} className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600 flex items-center justify-center text-sm touch-feedback">🗑</button>
         <button onClick={onToggleDrawer} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center text-sm touch-feedback">◀️</button>
       </div>
     </div>
     {/* 消息区 */}
     <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 flex flex-col gap-3">
       {messages.length === 0 && <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-2 text-xs opacity-80">
         <span className="text-3xl">💭</span>
         <div>向 AI 提问任何问题<br />支持 DeepSeek / 通义 / 智谱 / 自定义模型</div>
       </div>}
       {messages.map(m => (
         <div key={m.id} className={`max-w-[85%] ${m.role === 'user' ? 'ml-auto' : 'mr-auto'} rounded-2xl px-3 py-2 shadow-sm ${m.role === 'user' ? 'bg-indigo-500 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'}`} style={{ fontSize: 13, lineHeight: 1.55 }}>
           {m.role === 'assistant' && m.content.startsWith('⚠️') && <div className="text-amber-600 mb-1 text-xs">⚠️ V1 占位模式</div>}
           {m.content}
         </div>
       ))}
     </div>
     {/* 输入区 */}
     <div className="h-auto shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur p-3">
       <div className="flex gap-2 items-end">
         <textarea
           ref={inputRef}
           rows={2}
           placeholder="输入问题，Enter 发送 / Ctrl+Enter 换行"
           value={inputValue}
           onChange={e => setInputValue(e.target.value)}
           onKeyDown={e => {
             if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
               e.preventDefault(); handleSend()
             }
           }}
           className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none px-3 py-2 text-sm text-slate-800 transition-all touch-feedback"
           style={{ fontSize: 13 }}
         />
         <button onClick={handleSend} className="h-[44px] px-4 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 text-sm font-medium shadow-sm shadow-indigo-200 flex items-center gap-1 touch-feedback">➤ 发送</button>
       </div>
     </div>
   </div>
   ```
4. **handleSend 逻辑**（try/catch + AbortController 10s 超时 + V1 占位）：
   - 空 content 直接 return
   - const userMsg = { id: uid('msg'), role: 'user', content: inputValue.trim(), createdAt: Date.now() }
   - dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: userMsg } })
   - 清空 inputValue
   - 准备历史：最近 10 条 `history = messages.slice(-10).map(m=>({ role: m.role, content: m.content })).concat([{ role:'user', content: userMsg.content }])`
   - 判断 `if (aiConfig?.baseUrl && aiConfig?.apiKey && aiConfig?.modelId)` → 走 fetch：
     - const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 10000)
     - 成功：choices[0].message.content → 构造 assistant 消息 APPEND
     - catch：错误 → 构造占位 `⚠️ 无法连接模型 API：${err.message || '网络异常'}\n已收到您的提问：「${userMsg.content.slice(0,50)}」\n请到 ⚙️ 配置面板检查 API Key 后重试。或 V1 模式下无需 AI，继续手动完成工作。`
   - **未配置 key**（else 分支）→ 占位 `⚠️ 未配置模型 API Key，当前为 V1 占位模式。\n已收到您的提问：「${userMsg.content.slice(0,50)}${userMsg.content.length>50?'...':''}」\n请点击右上角 ⚙️ 配置您的 DeepSeek / 第三方模型 API Key 以获得真实回答。\n💡 不配置 AI 也可完整手动使用整套系统。`
   - **无论任何分支**：不得 throw 到外层，都 catch 后转占位响应 + toast 友好提示

### 关联 AC
AC-AI-3（聊天不丢）、AC-AI-4（V1 占位不崩溃）、AC-AI-7（rubric）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T3-TR1 | rule | 新文件 AIChatSidebar.jsx 存在；顶栏含 3 按钮（⚙️ 配置 / 🗑 清空 / ◀️ 收起）；输入区 textarea + 发送按钮 |
| T3-TR2 | rule | 发送"你好"+"再见"+"谢谢" → localStorage AI_HISTORY 3 条 user + 3 条 assistant（含占位）共 6 条；F5 刷新后 6 条 100% 不丢；🗑 清空后 0 条 |
| T3-TR3 | rule | 不配置 API Key（aiConfig.apiKey = ''）→ 发送任意消息 → assistant 返回含"⚠️"和"V1 占位模式"且"已收到您的提问："三关键字 → 控制台 console 0 error / 0 红色 uncaught |
| T3-TR4 | rule | 输入空字符串 或 全空格 → 不发送；Ctrl+Enter = 换行；Enter = 立即发送（非 ctrl/meta 时） |
| T3-TR5 | rule | handleSend try/catch 包裹 fetch；AbortController 10 秒超时触发后仍然返回占位，永不 throw |
| T3-TR6 | rubric | AI 对话可用性 0-2 ≥ 1.5 |

---

## Task 4：模型 API 配置面板 + 左下角切换按钮

### 原子操作
1. **新建 AIConfigPanel.jsx**（页面内自绘弹窗，不新增 reducer 模态栈）：
   - 组件函数 props：`open` / `onClose` / `dispatch` / `aiConfig`
   - UI：
     ```
     标题：🤖 模型 API 配置
     字段：
       Provider：<select> 4 项 DeepSeek / 通义千问 / 智谱 AI / 自定义（value=deepseek/qwen/glm/custom）
       API Key：<input type=password> 👁 按钮切换可见
       Base URL：<input>
       Model ID：<input>
     按钮：[取消] [保存并关闭] / [测试连通性]
     ```
   - Provider change 逻辑：
     - onChange(newProv) → 先查用户当前 baseUrl/model 是否等于"当前 provider 预设值"（预设值 map 存下）：若用户改过（!= 预设）则不动；否则自动填入新 provider 预设。
     - providerPresets：
       ```
       { deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
         qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
         glm: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
         custom: { baseUrl: '', model: '' } }
       ```
   - API Key 显示切换：useState showKey=false，input type={showKey ? 'text' : 'password'}，👁 按钮切换
   - **保存**：校验 baseUrl 非空 → /^https?:\/\//；未通过 → toast "Base URL 必须以 http:// 或 https:// 开头"；通过 → dispatch UPDATE_AI_CONFIG 并 toast "✅ 配置已保存到本地浏览器"
   - **测试连通性**：向 `${baseUrl}/chat/completions` 发 1 条 messages = [{role:'user',content:'Ping'}]；成功 → toast "✅ 连接成功：${modelId}"；失败 → toast "❌ 连接失败：${err.message}"；仍然 10s 超时
2. **左下角切换 AI / Nav 按钮**（LongTermGoalsPage.jsx，在 L45-54 四色状态标记 `</div>` 之后，紧挨着追加一段）：
   ```jsx
   <div className="absolute left-4 bottom-4 translate-y-[calc(100%+12px)] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 z-10 px-2 py-1.5 flex items-center gap-1">
     <button
       onClick={() => dispatch({ type: 'TOGGLE_DRAWER_MODE' })}
       className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all touch-feedback ${drawerMode === 'ai' ? 'bg-indigo-500 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
     >{drawerMode === 'ai' ? '🤖 AI 模式' : '🧭 导航模式'}</button>
   </div>
   ```
   - 注意：原本左下角状态栏是 `left-4 bottom-4`，为避免新按钮盖住状态栏 → 把状态栏 `bottom-4` → `bottom-20`（向上移，按钮放状态栏下方新一行），或者**状态栏保留原位 bottom-4，按钮放 right-4 bottom-4？不对** → 改放在 LongTermGoalsPage.jsx 工具栏下方（工具栏右下角工具栏 L125 之后追加一个左对齐的按钮）。**更稳妥选择：把左下角状态栏 bottom-4 → bottom-[96px]（向上 72px，留下 72px 空间）；然后新加切换按钮保持 left-4 bottom-4（左底最下方一行，显眼）** → 不遮挡任何控件。

### 关联 AC
AC-AI-5（Provider 4 项预设）、AC-AI-6（写本地 + DATA_VERSION）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T4-TR1 | rule | Provider 下拉选中 DeepSeek → baseUrl = 'https://api.deepseek.com/v1'，model = 'deepseek-chat' |
| T4-TR2 | rule | API Key 默认 type=password；👁 点击 → 切换 type=text；再次点击 → 切回 password |
| T4-TR3 | rule | Base URL 填 "abc" → 保存时报错 "必须 http/https 开头"，不写库；改成 "https://x" → 通过 |
| T4-TR4 | rule | 保存后 F5 → aiConfig 4 字段 100% 一致（localStorage 读取） |
| T4-TR5 | rule | 左下角切换按钮存在：点一次 → drawerMode = ai（按钮文案变 🤖 AI 模式）；再点一次 → drawerMode = nav（🧭 导航模式） |

---

## Task 5：联通全局布局（drawerMode=ai 渲染 AIChatSidebar / nav 渲染 Nav）

### 原子操作
1. **读现有 App.jsx / 全局 Layout 定位**：哪个文件渲染 `<NavPage>` 侧边栏？先定位（T0 没读，T5 开头先读，这里先写操作方式：
   - 找 NavPage 组件位置，它用了 `state.settings.drawerMode / drawerOpen` → 在 NavPage 里追加判断：`if (drawerMode === 'ai') return <AIChatSidebar open={drawerOpen} onToggleDrawer={...dispatch TOGGLE_DRAWER} onOpenConfig={setConfigPanelOpen} messages={state.aiHistory} aiConfig={state.aiConfig} dispatch={dispatch} />`（else return 原有导航）
   - 或者 NavPage 原本是导航，不改 NavPage，另在全局 Layout 的侧边栏位置 if (drawerMode==='ai') 挂 AIChatSidebar else 挂 NavPage
   - 实际执行前先 Read 定位再写
2. **配置面板 Modal 挂在哪里？** → 直接挂在 LongTermGoalsPage 末尾（页面内自绘弹窗，类似 DailyHabitsPage 自绘 FormModal 的做法），不使用 reducer modalStack（避免全局栈序列化问题）。在 LongTermGoalsPage 加 useState `aiConfigOpen: false`，L126 后追加渲染 `<AIConfigPanel open={aiConfigOpen} onClose={()=>setAiConfigOpen(false)} ... />`
3. **RET1-RET6 回归预检查**（T6 再 Grep 验证，T5 只保证不主动改这些代码）：
   - 不改 NodePopup.jsx（两标签/配置页两字段）
   - 不改 MindNode 进度条 DOM / NodeLinks 连线吸附公式
   - 不改 DailyHabitsPage 三区分离 / 网格 9/5
   - 不改 reducer 的 prompt 强制命名逻辑

### 关联 AC
AC-AI-1（侧边展开/收起 + drawerMode 切换生效）、RET1-RET5 保留不破坏

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T5-TR1 | rule | drawerMode=ai 全局侧边显示 AIChatSidebar（有顶栏/消息区/输入区）；drawerMode=nav 显示原导航（7 个系统等） |
| T5-TR2 | rule | 在侧边打开 AI 模式时，发送 1 条消息 → 返回占位；发送完成后切回导航，所有节点/打卡原功能仍然可用（0 卡死） |
| T5-TR3 | rule | LongTermGoalsPage 中配置面板能打开，AIConfigPanel 保存后 state.aiConfig 实时更新 |

---

## Task 6：验证（lint + Grep 回归 + 关键 AC 手动）

### 原子操作
1. **GetDiagnostics** 跑下列 7 文件：constants.js、AppContext.jsx、MindMapCanvas.jsx、LongTermGoalsPage.jsx、AIChatSidebar.jsx、AIConfigPanel.jsx、NavPage.jsx（被改动的）
2. **Grep 回归 5 组 RET**：
   - RET1 弹窗执行残留：NodePopup.jsx Grep `执行|番茄|秒表/startPomodoro` → 0
   - RET2 默认命名：`title:'新目标'|title:\"子任务\"` → 0
   - RET3 连线吸附保留：NodeLinks.jsx `getNodeSize|parentSize/2|childSize/2` → ≥ 2 命中
   - RET4 打卡新增按钮残留：DailyHabitsPage `>新增习惯<|>新增临时任务<` → 0
   - RET5 独立进度条保留：MindNode `节点正下方独立小进度条` → ≥ 1 命中
3. **关键 AC 手动 8 步验证**：
   - (1) 幕布双击删除，点右下角「➕ 新建」→ 弹 prompt → 创建成功（viewport 中心）
   - (2) 空画布 CTA 按钮 → 弹 prompt → 创后消失
   - (3) 时间轴 105 天刻度存在；今日三角 → 正确
   - (4) 左下 🤖 / 🧭 切换生效（drawerMode 正确切）
   - (5) AI 对话 3 条 → F5 不丢 → 清空 0 条
   - (6) 无 API Key 发送 → 占位提示不崩溃
   - (7) 配置面板 DeepSeek 预设正确 → 保存写本地
   - (8) 全部 RET1-RET5 原功能 0 破坏（弹窗两标签/连线吸附/空格打卡/独立进度条）

### TR
| TR | 类型 | 内容 |
|---|---|---|
| T6-TR1 | rule | 7 文件 GetDiagnostics 0 error / 0 warning |
| T6-TR2 | rule | Grep 回归 5 组 → 全部通过阈值 |
| T6-TR3 | rule | 8 步手动验证 8/8 全通过 |
