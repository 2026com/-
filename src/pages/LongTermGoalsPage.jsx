import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext.jsx'
import MindMapCanvas from '../components/mindmap/MindMapCanvas.jsx'
import { NODE_STATUS } from '../utils/constants.js'
import AIChatSidebar from '../components/ai/AIChatSidebar.jsx'
import AIConfigPanel from '../components/ai/AIConfigPanel.jsx'

// 搁置/放弃不计入估算（与进度统计 EXCLUDED 保持一致）
const EXCLUDED_FOR_ESTIMATE = new Set(['paused', 'aborted'])
// 每天平均有效学习小时数（粗估完成日期用）
const HOURS_PER_DAY = 4

export default function LongTermGoalsPage() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  // 幕布列表：每块幕布 = 一个顶层根节点（以最初节点命名）；当前激活幕布默认取第一块
  const canvasRoots = (state.nodes || []).filter(n => !n.parentId)
  const activeCanvasId = state.ui?.activeCanvasId || null
  const effActiveCanvas = activeCanvasId || canvasRoots[0]?.id || null
  // 当前幕布视图（windowStart/offsetY/zoom/expandedIds），切换幕布时保存/恢复精确位置
  const canvasViewRef = useRef({ windowStart: 0, offsetY: 20, zoom: 1, expandedIds: [] })
  const effCanvasRef = useRef(effActiveCanvas)
  effCanvasRef.current = effActiveCanvas

  // ====== timeFilter + 画布时间缩放（W4 移交给 MindMapCanvas 内部根据 bounds+viewport 动态算 dayW） ======
  const canvasStyle = state.settings.canvasStyle
  const [zoom, setZoom] = useState(() => state.ui?.canvasViews?.[effActiveCanvas]?.zoom ?? 1)
  const [showExport, setShowExport] = useState(false)
  const [aiConfigOpen, setAiConfigOpen] = useState(false)
  const [timeFilter, setTimeFilter] = useState('week')
  // W2：右上角抽屉开关
  const [drawerOpen, setDrawerOpen] = useState(false)  // W2 默认收起，保持画布干净（点击右上角按钮再展开）
  // W5：节点「编辑模式」开关（仅本页 UI 状态，不持久化；刷新恢复默认「锁定」）
  const [editMode, setEditMode] = useState(false)
  const drawerWrapRef = useRef(null)
  const canvasRef = useRef(null)

  // 视图桥接：MindMapCanvas 上报 windowStart/offsetY/expandedIds，本页保存最新视图快照
  const handleViewChange = (v) => {
    canvasViewRef.current = { ...canvasViewRef.current, ...v }
  }
  useEffect(() => { canvasViewRef.current = { ...canvasViewRef.current, zoom } }, [zoom])

  // W2：点击抽屉外部（非按钮触发区域）自动关闭
  useEffect(() => {
    function onDocClick(e) {
      if (!drawerOpen) return
      if (!drawerWrapRef.current) return
      if (drawerWrapRef.current.contains(e.target)) return
      setDrawerOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [drawerOpen])

  // ====== V2/V3：按「当前选中节点」范围计算两项时间（无选中=全部根任务汇总） ======
  const estimateData = useMemo(() => {
    const all = state.nodes || []
    const byId = new Map(all.map(n => [n.id, n]))
    const selectedId = state.ui?.selectedNodeId || null
    let scopeIds = new Set()

    if (selectedId && byId.has(selectedId)) {
      // 选中某个节点：只统计「该节点自身 + 其所有后代子节点」构成的子树
      const stack = [selectedId]
      while (stack.length) {
        const cur = stack.pop()
        scopeIds.add(cur)
        all.forEach(c => { if (c.parentId === cur) stack.push(c.id) })
      }
    } else {
      // 未选中：统计所有节点（等价于"全局汇总"）
      all.forEach(n => scopeIds.add(n.id))
    }
    const scopeNodes = all.filter(n => scopeIds.has(n.id))

    // ========== ① 系统预估有效学习时间：汇总 scope 内全部子节点 ==========
    const nodesForHours = scopeNodes.filter(n => !EXCLUDED_FOR_ESTIMATE.has(n.status) && n.status !== 'done')
    const remainingHours = nodesForHours.reduce((s, n) => {
      const h = Number(n.estimatedHours) || 2
      const prog = Math.min(1, Math.max(0, (Number(n.progress) || 0) / 100))
      return s + h * (1 - prog)
    }, 0)
    // 总有效时长（含已完成：所有非搁置/放弃的 estimatedHours 原值累计）
    const totalBudgetHours = scopeNodes
      .filter(n => !EXCLUDED_FOR_ESTIMATE.has(n.status))
      .reduce((s, n) => s + (Number(n.estimatedHours) || 2), 0)
    const completedHours = totalBudgetHours > 0 ? Math.max(0, totalBudgetHours - remainingHours) : 0

    // ========== ② 预估完成日期：优先 scope 内根/节点 dueDate 最大值；否则按剩余小时 / HOURS_PER_DAY ==========
    const roots = selectedId
      ? [byId.get(selectedId)].filter(Boolean) // 选中场景：把「当前选中节点本身」当作 scope 根取 dueDate
      : all.filter(n => !n.parentId)
    const dueDates = roots
      .map(r => r.dueDate || r.deadline)
      .filter(Boolean)
      .map(s => new Date(s).getTime())
      .filter(t => !isNaN(t))
    // 同时参考 scope 内子节点 dueDate（若父未设置子设置了，也取最大的），避免父缺 dueDate 导致估算失真
    const childDueDates = scopeNodes
      .map(n => (n.id !== selectedId ? (n.dueDate || n.deadline) : null))
      .filter(Boolean)
      .map(s => new Date(s).getTime())
      .filter(t => !isNaN(t))
    const allDueDates = [...dueDates, ...childDueDates]

    let finishLabel, finishSub, isFinishUrgent = false
    const today = new Date(); today.setHours(0,0,0,0)

    if (totalBudgetHours === 0 && allDueDates.length === 0) {
      finishLabel = '—'
      finishSub = '暂无任务数据'
    } else if (allDueDates.length > 0) {
      const maxT = Math.max(...allDueDates)
      const d = new Date(maxT); d.setHours(0,0,0,0)
      const diff = Math.ceil((d - today) / 86400000)
      if (diff <= 0) { finishLabel = '已到达'; finishSub = '建议调整截止日'; isFinishUrgent = true }
      else {
        finishLabel = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
        const tag = diff <= 14 ? '临近' : diff <= 30 ? '本月' : diff <= 90 ? '本季' : '远期'
        finishSub = `${diff}天 · ${tag}`
        isFinishUrgent = diff <= 14
      }
    } else {
      const estDays = Math.max(1, Math.ceil(remainingHours / HOURS_PER_DAY))
      const t = new Date(today.getTime() + estDays * 86400000)
      finishLabel = `${t.getFullYear()}/${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')}`
      finishSub = `约${estDays}天 · 按每日${HOURS_PER_DAY}h`
    }

    const fmtHours = (h) => {
      if (h >= 100) return `${Math.round(h)}h`
      if (h >= 10) return `${h.toFixed(1)}h`
      return `${h.toFixed(1)}h`
    }
    const hourLabel = totalBudgetHours <= 0
      ? '—'
      : `已完成 ${fmtHours(completedHours)} / 总 ${fmtHours(totalBudgetHours)}`
    const hourSub = totalBudgetHours <= 0
      ? '暂未配置预估耗时'
      : `剩余 ${fmtHours(remainingHours)}（搁置/放弃已排除）`
    const hourProgress = totalBudgetHours <= 0 ? 0 : Math.min(100, Math.round(completedHours / totalBudgetHours * 100))

    // 显示范围提示：选中时显示节点名，便于用户知道现在统计的是谁
    const scopeLabel = selectedId && byId.has(selectedId)
      ? `当前：${byId.get(selectedId).title || '未命名节点'}`
      : '当前：全部任务'

    return {
      finish: { label: finishLabel, sub: finishSub, urgent: isFinishUrgent },
      hours:  { label: hourLabel,  sub: hourSub,  progress: hourProgress },
      scope: scopeLabel
    }
  }, [state.nodes, state.ui?.selectedNodeId])

  // P3/P4：新建根节点按钮（改为双字段弹窗：名称 + 截止日期，创建后立即定位到时间轴某一天）
  const handleCreateRootNode = (dropCoords = null) => {
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'custom-add-node',
        mode: 'root',
        title: '新增独立长期任务',
        placeholderName: '例：学习钢琴 / 备考雅思 / 健身减脂（6个月）',
        labelName: '任务名称',
        labelDate: '目标截止日期（某月某日）·节点会自动定位到这一天',
        systemId: 'zhuye',
        dropCoords,   // 双击空白处时携带屏幕像素反算的画布坐标
        // 新建幕布：切换到新幕布（独立空白）
        onCreated: (newId) => handleSwitchCanvas(newId),
      }
    })
  }

  // ====== 时间视图预设：切换时同时设定缩放（本周=1x / 本月≈0.27x / 全部=按任务跨度自适应） ======
  const applyTimeFilter = (key) => {
    setTimeFilter(key)
    let preset = 1
    if (key === 'month') {
      preset = 0.27
    } else if (key === 'all') {
      const today0 = new Date(); today0.setHours(0, 0, 0, 0)
      let minI = 0, maxI = 0
      state.nodes.forEach(n => {
        const d = n.dueDate || n.deadline || n.startDate
        if (d) {
          const t = Math.round((new Date(d).setHours(0, 0, 0, 0) - today0.getTime()) / 86400000)
          if (t < minI) minI = t
          if (t > maxI) maxI = t
        }
      })
      const span = Math.max(7, maxI - minI + 1)
      preset = Math.max(0.03, Math.min(1, 1200 / span / 150))
    }
    setZoom(preset)
  }

  // ====== AI 生成执行方案后：自动把幕布缩放到「能一屏看到整个方案」并锚定今天 ======
  const focusPlanRef = useRef(0)
  useEffect(() => {
    const fp = state.ui?.focusPlan
    if (!fp || !fp.at || fp.at === focusPlanRef.current) return
    focusPlanRef.current = fp.at
    const span = Math.max(7, (Number(fp.maxDay) || 6) - (Number(fp.minDay) || 0) + 1)
    setZoom(Math.max(0.03, Math.min(1, 1200 / span / 150)))
    setTimeFilter('week')
    dispatch({ type: 'CLEAR_FOCUS_PLAN' })
  }, [state.ui?.focusPlan])

  // 滚轮缩放（以鼠标所在处为中心）：上滚放大 / 下滚缩小
  const handleWheelZoom = (factor) => {
    setZoom(z => Math.max(0.03, Math.min(3, +(z * factor).toFixed(3))))
  }

  // ====== 切走页面时保存当前幕布视图快照（返回后精确恢复位置/缩放/展开） ======
  useEffect(() => () => {
    dispatch({ type: 'SAVE_CANVAS_VIEW', payload: { canvasId: effCanvasRef.current, view: { ...canvasViewRef.current } } })
  }, [])

  // ====== 切换幕布：保存当前幕布视图 → 切到目标幕布 → 恢复目标幕布的精确视图 ======
  const handleSwitchCanvas = (toId) => {
    if (!toId || toId === effActiveCanvas) return
    dispatch({
      type: 'SWITCH_CANVAS',
      payload: { fromId: effActiveCanvas, toId, fromView: { ...canvasViewRef.current } },
    })
  }
  // 消费待恢复的幕布视图（zoom 由本页设置，windowStart/offsetY/expandedIds 由 MindMapCanvas 恢复）
  useEffect(() => {
    const pv = state.ui?.pendingCanvasView
    if (!pv) return
    if (pv.view) setZoom(Math.max(0.03, Math.min(3, Number(pv.view.zoom) || 1)))
    dispatch({ type: 'CLEAR_PENDING_CANVAS_VIEW' })
  }, [state.ui?.pendingCanvasView])

  const doExport = (type) => {
    setShowExport(false)
    if (type === 'image') {
      window.dispatchEvent(new CustomEvent('growth:export', { detail: { type: 'image' } }))
    } else if (type === 'excel') {
      window.dispatchEvent(new CustomEvent('growth:export', { detail: { type: 'excel' } }))
    } else if (type === 'pdf') {
      const title = '个人成长强者体系 · 思维导图导出'
      const lines = state.nodes.map((n, i) => `${i + 1}. [${n.status}] ${n.title} (进度${n.progress || 0}%)`).join('\n')
      window.dispatchEvent(new CustomEvent('growth:export', { detail: { type: 'pdf', title, content: lines } }))
    }
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '📤 正在导出...' } })
  }

  // ====== 时间筛选 options（W4 同时触发时间轴 + 节点的按范围缩放） ======
  const timeOptions = [
    { key: 'week',  label: '本周',   icon: '📅', hint: '时间轴缩放至本周一~周日（7天），节点按天坐标等比对齐' },
    { key: 'month', label: '本月',   icon: '🗓️', hint: '时间轴缩放至本月1号~月底，节点按天坐标等比对齐' },
    { key: 'all',   label: '全部时间', icon: '⏳', hint: '时间轴范围：所有节点创建的最早日期 ~ 最晚截止日' },
  ]

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      {/* ===== 右上角：抽屉式「时间视图」面板（按钮常驻；抽屉含筛选按钮+两行时间估算） ===== */}
      <div ref={drawerWrapRef} className="absolute top-2.5 right-2.5 z-[20] flex flex-col items-end gap-2 max-w-[72%]">
        {/* 新建幕布：创建一块独立的新幕布（= 新的顶层长期计划），在其下可创建节点 / AI 生成执行方案 */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCreateRootNode() }}
          className="pointer-events-auto flex items-center gap-1.5 pl-2.5 pr-3 h-8 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm shadow-indigo-200 transition-all touch-feedback"
          title="新建一块独立幕布（新的顶层长期计划），可在此幕布下创建节点 / AI 生成执行方案"
        >
          <span className="text-[12px]" aria-hidden>🆕</span>
          <span className="text-[11.5px] font-semibold">新建幕布</span>
        </button>

        {/* W5：节点「编辑模式」开关（默认锁定不可拖动；开启后节点可自由拖拽调整布局） */}
        <button
          onClick={(e) => { e.stopPropagation(); setEditMode(v => !v) }}
          className={`pointer-events-auto flex items-center gap-1.5 pl-2 pr-2.5 h-8 rounded-lg border shadow-sm transition-all touch-feedback ${
            editMode
              ? 'bg-indigo-500 border-indigo-500 text-white hover:bg-indigo-600 shadow-indigo-200'
              : 'bg-white/95 backdrop-blur-[2px] border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-300'
          }`}
          title={editMode
            ? '编辑模式：节点可自由拖动调整布局（点击节点标题仍可展开/收起）'
            : '锁定模式：节点不可拖动，点击只展开/查看；开启后可拖动节点调整布局'}
        >
          <span className="text-[12px]" aria-hidden>{editMode ? '✏️' : '🔒'}</span>
          <span className="text-[11.5px] font-semibold">{editMode ? '编辑模式' : '锁定模式'}</span>
        </button>

        {/* 顶部常驻：打开/关闭抽屉的悬浮按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); setDrawerOpen(v => !v) }}
          className="pointer-events-auto flex items-center gap-1.5 pl-2 pr-2.5 h-8 rounded-lg bg-white/95 backdrop-blur-[2px] border border-slate-200 shadow-sm text-slate-700 hover:text-indigo-600 hover:border-indigo-300 transition-all touch-feedback"
          title={drawerOpen ? '收起时间视图面板' : '展开时间视图面板'}
        >
          <span className="text-[13px]" aria-hidden>{drawerOpen ? '▾' : '⚙️'}</span>
          <span className="text-[11.5px] font-semibold">{drawerOpen ? '时间视图' : '时间视图 · 点击展开'}</span>
        </button>

        {/* 抽屉弹出内容：三筛选按钮 + 两行黑字估算；打开时从右上角垂向下展开 */}
        {drawerOpen && (
          <div className="pointer-events-auto w-[300px] bg-white/98 backdrop-blur rounded-xl shadow-xl border border-slate-200 p-3 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* 行 1：本周 / 本月 / 全部时间 筛选（W4 触发时间缩放） */}
            <div className="flex flex-col gap-1">
              <div className="text-[10.5px] font-semibold text-slate-500 pl-0.5">时间轴缩放</div>
              <div className="bg-slate-50 rounded-lg p-0.5 flex gap-0.5">
                {timeOptions.map(opt => {
                  const active = timeFilter === opt.key
                  return (
                    <button
                      key={opt.key}
                      onClick={() => applyTimeFilter(opt.key)}
                      title={opt.hint}
                      className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all touch-feedback flex items-center justify-center gap-0.5 ${
                        active
                          ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-200'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[10px]" aria-hidden>{opt.icon}</span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <div className="text-[9.5px] text-slate-400 pl-0.5 leading-snug">
                点击后时间轴与节点会按选中范围对齐缩放（创建任务对齐到具体某一天）。
              </div>
            </div>

            {/* 分隔线 */}
            <div className="h-px bg-slate-100" />

            {/* 行 2-4：纯黑无框两行估算（保持 V3 节点范围联动） */}
            <div className="flex flex-col gap-1 text-black leading-tight" style={{ fontFamily: '"PingFang SC","Microsoft YaHei",system-ui,sans-serif' }}>
              <div className="text-right whitespace-nowrap">
                <span className="text-[11px] text-black/75 font-medium">预估完成时间：</span>
                <span className="text-[11.5px] text-black font-semibold tabular-nums ml-1">{estimateData.finish.label}</span>
                <span className={`text-[10.5px] ml-1 tabular-nums ${estimateData.finish.urgent ? 'text-rose-600' : 'text-black/55'}`}>
                  · {estimateData.finish.sub}
                </span>
              </div>
              <div className="text-right whitespace-nowrap">
                <span className="text-[11px] text-black/75 font-medium">有效学习时长：</span>
                <span className="text-[11.5px] text-black font-semibold tabular-nums ml-1">{estimateData.hours.label}</span>
              </div>
              <div className="text-right whitespace-nowrap">
                <span className="text-[9.5px] text-black/55 tabular-nums">{estimateData.hours.sub}</span>
                <span className="text-[9.5px] text-black/45 ml-1.5">· {estimateData.scope}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 思维导图画布主体：W1 统一纯白不透明，避免 body 浅灰/分层色透入导致"左白右蓝紫色"观感 */}
      <div
        ref={canvasRef}
        className={`flex-1 overflow-hidden relative`}
        style={{
          background: '#ffffff',
        }}
      >
        {/* 幕布切换器：每块幕布以最初节点命名，点击切换（各幕布独立不干扰） */}
        {canvasRoots.length > 0 && (
          <div className="absolute top-1.5 left-2 z-[15] flex items-center gap-1 max-w-[60%] overflow-x-auto no-scrollbar pointer-events-auto">
            {canvasRoots.map(root => {
              const active = effActiveCanvas === root.id
              return (
                <button
                  key={root.id}
                  onClick={() => handleSwitchCanvas(root.id)}
                  className={`shrink-0 px-2.5 h-7 rounded-md text-[11px] font-medium border transition-all touch-feedback ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white/95 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                  title={active ? '当前幕布' : '切换到该幕布'}
                >{root.title || '未命名幕布'}</button>
              )
            })}
          </div>
        )}

        <MindMapCanvas
          zoom={zoom}
          onCreateRootNode={handleCreateRootNode}
          timeFilter={timeFilter}
          editMode={editMode}
          onZoomChange={handleWheelZoom}
          activeRootId={effActiveCanvas}
          onViewChange={handleViewChange}
        />
      </div>

      {/* ===== 空画布：中央显眼 CTA 大按钮（双击移除后的主入口之一） ===== */}
      {state.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
          <div className="pointer-events-auto text-center -mt-12">
            <button
              onClick={handleCreateRootNode}
              className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-2xl shadow-xl shadow-indigo-200 flex items-center gap-2 mx-auto touch-feedback transition-all hover:scale-[1.02]"
            >
              <span className="text-lg leading-none">➕</span>
              新建第一个长期目标
            </button>
            <div className="text-[11px] text-slate-400 mt-3">创建后可继续添加子节点，生成你的成长地图</div>
          </div>
        </div>
      )}

      {/* T3：移除左下角统一状态栏（状态徽标已挂载每个节点上，FR-1.1 不允许统一放置） */}

      {/* 右下角操作工具栏（最上方新增显眼「➕ 新建长期目标」按钮） */}
      <div className="absolute right-4 bottom-4 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 z-10 flex flex-col gap-1 p-1.5">
        {/* 新增：显眼主 CTA */}
        <button
          onClick={handleCreateRootNode}
          className="w-9 h-9 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 flex items-center justify-center text-base font-bold shadow-md shadow-indigo-200 touch-feedback transition-all"
          title="新建长期目标（强制命名）"
        >➕</button>
        <div className="h-px bg-slate-100 mx-1" />
        {/* 样式切换：[修复] 图标 + 文字双重标识当前幕布样式，避免移动端误触不知道切到了什么 */}
        <button
          onClick={() => dispatch({
            type: 'UPDATE_SETTINGS',
            payload: { canvasStyle: canvasStyle === 'lined' ? 'plain' : 'lined' }
          })}
          title={canvasStyle === 'lined' ? '当前：横线幕布，点击切换纯白' : '当前：纯白幕布，点击切换横线'}
          className="w-11 py-1.5 rounded-lg hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 flex flex-col items-center justify-center gap-0.5 touch-feedback"
        >
          <span className="text-base leading-none">{canvasStyle === 'lined' ? '📄' : '⬜'}</span>
          <span className="text-[10px] leading-none font-medium text-slate-500">{canvasStyle === 'lined' ? '横线' : '纯白'}</span>
        </button>
        <div className="h-px bg-slate-100 mx-1" />
        {/* 缩放：鼠标滚轮（以鼠标所在处为中心） */}
        <div className="text-center text-[10px] text-slate-400 font-medium py-0.5 tabular-nums">{Math.round(zoom * 100)}%</div>
        <div className="h-px bg-slate-100 mx-1" />
        {/* 撤销/重做 AI操作专用 */}
        <button
          onClick={() => {
            dispatch({ type: 'UNDO_NODES' })
            dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '↶ 已撤销' } })
          }}
          className="w-9 h-9 rounded-lg hover:bg-amber-50 text-amber-600 flex items-center justify-center text-sm touch-feedback"
          title="撤销AI操作"
        >↶</button>
        <button
          onClick={() => {
            dispatch({ type: 'REDO_NODES' })
            dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '↷ 已重做' } })
          }}
          className="w-9 h-9 rounded-lg hover:bg-amber-50 text-amber-600 flex items-center justify-center text-sm touch-feedback"
          title="重做AI操作"
        >↷</button>
        <div className="h-px bg-slate-100 mx-1" />
        {/* 导出按钮 带弹出菜单 */}
        <div className="relative">
          <button
            onClick={() => setShowExport(s => !s)}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center text-base touch-feedback"
            title="导出（PDF/长图/Excel）"
          >📤</button>
          {showExport && (
            <div className="absolute right-12 top-0 bg-white shadow-2xl rounded-xl border border-slate-200 p-1.5 min-w-36 z-30 animate-in zoom-in-95">
              <button onClick={() => doExport('image')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-700 touch-feedback">🖼 导图画布(PNG)</button>
              <button onClick={() => doExport('excel')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-700 touch-feedback">📊 全量数据(Excel)</button>
              <button onClick={() => doExport('pdf')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-700 touch-feedback">📄 节点列表(PDF)</button>
            </div>
          )}
        </div>
        <button
          onClick={() => dispatch({
            type: 'PUSH_MODAL',
            payload: {
              type: 'confirm',
              title: '📋 进度双权重计算模式切换',
              message: `当前：${state.settings.progressMode === 'auto' ? '【自动加权】系统按「时长×难度×价值」计算' : '【手动模式】按自定义子任务权重'}，是否切换？`,
              onOk: () => dispatch({
                type: 'UPDATE_SETTINGS',
                payload: { progressMode: state.settings.progressMode === 'auto' ? 'manual' : 'auto' }
              })
            }
          })}
          className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center text-base touch-feedback"
          title={`进度权重模式：${state.settings.progressMode === 'auto' ? '自动' : '手动'}`}
        >⚖️</button>
      </div>

      {/* ===== AI 侧边栏（常驻，可收起） ===== */}
      <AIChatSidebar onOpenConfig={() => setAiConfigOpen(true)} />

      {/* ===== AI 配置面板弹窗 ===== */}
      {aiConfigOpen && (
        <AIConfigPanel
          open={aiConfigOpen}
          onClose={() => setAiConfigOpen(false)}
          dispatch={dispatch}
          aiConfig={state.aiConfig}
        />
      )}
    </div>
  )
}
