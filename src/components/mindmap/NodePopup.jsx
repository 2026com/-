import React, { useState, useMemo } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { isParentLevelNode, genFullRouteAI, genFullRoute, genChildAtomicStepsAI, genPhaseStepsAI } from '../../utils/aiLogic.js'
import { uid } from '../../utils/storage.js'

/**
 * 长期目标节点点击弹出：重构 V3（E4 复用 AI 配置）V5（三层嵌套执行方案）
 * 【2 标签页】：方案（默认）/ 配置
 * 【V5 三层嵌套】：「AI 写执行方案」固定输出三层结构——
 *   第一层：前期/中期/后期 3 个阶段（阶段名不可改）
 *   第二层：每阶段下步骤节点（编号 + 名称 + 知识点数量）
 *   第三层：每步骤下详细内容（知识点清单 / 学习建议 / 达成标准），默认折叠点击展开
 *   根节点生成完整方案；阶段节点生成步骤；步骤节点生成详细内容；
 *   失败自动 fallback 本地模板，保证 UI 永远不硬错。
 * 【保留】：树状父子级编辑、一键下发叶子节点到日常打卡、紧凑/展开双视图、点击外部关闭、右下角独立删除按钮
 */
export default function NodePopup({ nodeId, onClose, getPosition }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const aiConfig = state.aiConfig
  const [tab, setTab] = useState('plan')           // 默认 'plan'（方案）
  const [expanded, setExpanded] = useState(false)   // 紧凑 / 展开双形态
  const [demoteTargetId, setDemoteTargetId] = useState(null) // 降级选择弹窗：要降级谁
  const [titleEditCache, setTitleEditCache] = useState({})   // 行内标题 input 受控缓存（onBlur 统一写回）
  const [aiGenerating, setAiGenerating] = useState(false)    // E4：AI 真实生成 loading

  const pos = getPosition()
  const node = state.nodes.find(n => n.id === nodeId)
  if (!node) return null

  const update = (patch) => dispatch({ type: 'UPDATE_NODE', id: nodeId, payload: patch })
  const updateAny = (id, patch) => dispatch({ type: 'UPDATE_NODE', id, payload: patch })

  const children = state.nodes.filter(n => n.parentId === nodeId)

  // === 强约束：P3 新增子节点必须「名称 + 截止日期（某月某日）」两字段同时填写 ===
  const addChild = () => {
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'custom-add-node',
        mode: 'child',
        parentNode: node,
        title: '新增子任务',
        placeholderName: '例：练习C大调音阶 / 写第1章初稿',
        labelName: '子任务名称',
        labelDate: '目标截止日期（某月某日）',
      }
    })
  }

  // === V5：AI 写执行方案（三层嵌套），复用 state.aiConfig ===
  //   根节点（无父/level0）→ 完整三层方案：3 阶段 + 步骤 + 详细内容（走 ADD_ROUTE_TREE）
  //   阶段节点（前期/中期/后期）→ 生成该阶段下的步骤节点（编号+名称+知识点数量）
  //   步骤/其他节点 → 生成详细内容（知识点清单 / 学习建议 / 达成标准 三个板块）
  const writeExecutionPlan = async () => {
    if (aiGenerating) return
    const existingKids = state.nodes.filter(n => n.parentId === nodeId).length
    const isRoutePhaseNode = !!node.isRouteStageNode || !!node.stagePhase

    // === 根节点：三层嵌套完整方案（3 阶段 + 步骤节点 + 详细内容） ===
    const doGenParentRoute = async () => {
      setAiGenerating(true)
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '🤖 AI 正在生成三层执行方案（前期/中期/后期 + 步骤 + 详细内容）...' } })
      try {
        const cfg = aiConfig
        let route
        try {
          route = await genFullRouteAI(cfg, node)
        } catch (_) { route = genFullRoute(node) }
        if (!route || !Array.isArray(route.phases) || route.phases.length < 3) route = genFullRoute(node)

        // 基准起点 ISO：优先 startDate / dueDate，没有就写今天（今天 dayIdx=0，时间轴正中锚点）
        const todayISO = new Date().toISOString().slice(0, 10)

        // 交给 AppContext 的批处理 action，一次性把 1(更新根元信息) + 3(阶段节点) + 步骤 + 详细内容 合并落盘，避免父子时序错位。
        dispatch({
          type: 'ADD_ROUTE_TREE',
          rootNodeId: nodeId,
          route,
          baseISO: todayISO,
          overrideStartDate: node.startDate,
          overrideDueDate:   node.dueDate,
          systemId: node.systemId || 'zhuye',
          parentLevel: node.level || 0,
          parentNodeXY: { x: node.x || 0, y: node.y || 0 },
        })
        const hint = cfg?.apiKey ? '（真实 LLM）' : '（未配置 Key · 本地模板兜底）'
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ AI 方案已生成：3 阶段 + 步骤 + 详细内容${hint}` } })
      } catch (err) {
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `⚠️ AI 方案生成异常：${(err && err.message) ? String(err.message).slice(0, 40) : '未知错误'}，请重试` } })
      } finally {
        setAiGenerating(false)
      }
    }

    // === 阶段节点（前期/中期/后期）：生成该阶段下的步骤节点（编号+名称+知识点数量） ===
    const doGenPhaseSteps = async () => {
      setAiGenerating(true)
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '🤖 AI 正在生成该阶段下的步骤节点...' } })
      try {
        const parent = state.nodes.find(p => p.id === node.parentId)
        const steps = await genPhaseStepsAI(aiConfig, node, parent?.title || '')
        if (!Array.isArray(steps) || steps.length === 0) {
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ AI 暂未匹配到合适方案，请手动添加' } })
          return
        }
        const startIdx = state.nodes.filter(n => n.parentId === nodeId).length
        steps.forEach((st, i) => {
          const points = Math.max(1, Number(st.points) || 8)
          dispatch({
            type: 'ADD_NODE',
            payload: {
              // 步骤标题直接用学习内容名称 + 知识点数量（先后顺序由主轴上日期距离决定）
              title: `${st.name}（${points}个知识点）`,
              parentId: nodeId,
              systemId: node.systemId || 'zhuye',
              status: 'todo', progress: 0,
              x: (node.x || 0) + 200,
              y: (node.y || 0) + 70 + i * 90,
              level: (node.level || 0) + 1,
              estimatedHours: 8, difficulty: 1, value: 1, weight: 10,
            }
          })
        })
        const hint = aiConfig?.apiKey ? '（真实 LLM）' : '（未配置 Key · 本地模板兜底）'
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ AI 已生成 ${steps.length} 个步骤节点${hint}` } })
      } catch (err) {
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `⚠️ AI 生成异常：${(err && err.message) ? String(err.message).slice(0, 40) : '未知错误'}，请稍后重试` } })
      } finally {
        setAiGenerating(false)
      }
    }

    // === 步骤节点：生成详细内容（知识点清单 / 学习建议 / 达成标准 三个板块） ===
    const addDetailSection = (secTitle, items) => {
      if (!Array.isArray(items) || items.length === 0) return
      const secId = uid('node')
      const baseLevel = (node.level || 0) + 1
      dispatch({
        type: 'ADD_NODE',
        payload: {
          id: secId,
          title: secTitle,
          parentId: nodeId,
          systemId: node.systemId || 'zhuye',
          status: 'todo', progress: 0,
          x: (node.x || 0) + 260,
          y: (node.y || 0) + 90,
          level: baseLevel,
          estimatedHours: 2, difficulty: 1, value: 1, weight: 5,
        }
      })
      items.forEach((it, q) => {
        dispatch({
          type: 'ADD_NODE',
          payload: {
            title: String(it),
            parentId: secId,
            systemId: node.systemId || 'zhuye',
            status: 'todo', progress: 0,
            x: (node.x || 0) + 340,
            y: (node.y || 0) + 110 + q * 34,
            level: baseLevel + 1,
            estimatedHours: 1, difficulty: 1, value: 1, weight: 3,
          }
        })
      })
    }
    const doGenChildSteps = async () => {
      setAiGenerating(true)
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '🤖 AI 正在生成该步骤的详细内容（知识点清单 / 学习建议 / 达成标准）...' } })
      try {
        const parent = state.nodes.find(p => p.id === node.parentId)
        const details = await genChildAtomicStepsAI(aiConfig, node, parent?.title || '')
        if (!details || ((!Array.isArray(details.items) || !details.items.length) && !details.advice && !details.standard)) {
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ AI 暂未匹配到合适方案，请手动添加' } })
          return
        }
        addDetailSection('📚 知识点清单', details.items)
        addDetailSection('💡 学习建议', details.advice ? [details.advice] : [])
        addDetailSection('🏁 达成标准', details.standard ? [details.standard] : [])
        const hint = aiConfig?.apiKey ? '（真实 LLM）' : '（未配置 Key · 本地模板兜底）'
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ AI 已生成该步骤的详细内容${hint}` } })
      } catch (err) {
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `⚠️ AI 生成异常：${(err && err.message) ? String(err.message).slice(0, 40) : '未知错误'}，请稍后重试` } })
      } finally {
        setAiGenerating(false)
      }
    }

    const doGen = async () => {
      if (isParentLevelNode(node)) await doGenParentRoute()
      else if (isRoutePhaseNode) await doGenPhaseSteps()
      else await doGenChildSteps()
      // 生成完成后自动展开父节点，让新生成的内容立即可见
      dispatch({ type: 'AUTO_EXPAND', payload: [nodeId] })
    }

    // 已有子节点 → 二次确认追加（async onOk 包在 confirm 里）
    if (existingKids > 0) {
      dispatch({
        type: 'PUSH_MODAL', payload: {
          type: 'confirm',
          title: 'AI 方案追加确认',
          message: isParentLevelNode(node)
            ? `当前节点已有 ${existingKids} 个子节点，追加一份「三层执行方案」（3 阶段 + 步骤 + 详细内容），不覆盖原内容，是否继续？`
            : isRoutePhaseNode
              ? `当前阶段已有 ${existingKids} 个子节点，AI 会继续追加步骤节点（不覆盖/删除已有内容），是否继续？`
              : `当前节点已有 ${existingKids} 个子节点，AI 会继续追加详细内容（不覆盖/删除已有内容），是否继续？`,
          showUndo: false, okText: '继续追加', onOk: () => { doGen() },
        }
      })
    } else {
      await doGen()
    }
  }

  // === 删除节点：右下角独立大按钮，二次确认 ===
  const deleteNode = () => {
    const total = countAll(state.nodes, nodeId)
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '⚠️ 确认删除节点',
        message: `确认删除节点「${node.title}」？删除后会一并移除它的 ${total - 1} 个子步骤，且无法恢复。`,
        showUndo: false,
        okText: '删除',
        onOk: () => { dispatch({ type: 'DELETE_NODE', id: nodeId }); onClose() }
      }
    })
  }

  // === 树状工具：递归取某节点所有后代（含自身） ===
  function getDescendants(rootId) {
    const set = new Set([rootId])
    let changed = true
    while (changed) {
      changed = false
      state.nodes.forEach(n => {
        if (n.parentId && set.has(n.parentId) && !set.has(n.id)) { set.add(n.id); changed = true }
      })
    }
    return set
  }

  // === 树状工具：取一个节点的父 ===
  function getParent(n) { return state.nodes.find(p => p.id === n.parentId) }

  // === 行内操作：⤴️ 升级为父级 ===
  function onPromote(n) {
    const p = getParent(n)
    if (!p) { // 已经是根
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 已是独立根节点，无法再升级' } })
      return
    }
    const grandPa = getParent(p)
    const newParentId = grandPa ? grandPa.id : null
    const newLevel = grandPa ? (grandPa.level || 0) + 1 : 0
    // 升级到根时，x/y 清零给自动布局算坐标
    const patch = { parentId: newParentId, level: newLevel }
    if (!newParentId) { patch.x = 0; patch.y = 0 }
    dispatch({ type: 'UPDATE_NODE', id: n.id, payload: patch })
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: newParentId ? '✅ 已升级为上一级' : '✅ 已升级为独立根节点' } })
  }

  // === 行内操作：🗑 删除单个子节点（本节点级） ===
  function onDeleteChild(n) {
    const total = getDescendants(n.id).size
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '⚠️ 确认删除',
        message: `确认删除「${n.title}」？将移除其 ${total - 1} 个子步骤，无法恢复。`,
        showUndo: false,
        okText: '删除',
        onOk: () => dispatch({ type: 'DELETE_NODE', id: n.id })
      }
    })
  }

  // === 行内操作：📤 推送至日常打卡（叶子节点才可用） ===
  function hasAnyDescendant(id) {
    return state.nodes.some(n => n.parentId === id)
  }
  function collectLeaves(rootId) {
    const ids = new Set()
    function walk(id) {
      const kids = state.nodes.filter(n => n.parentId === id)
      if (kids.length === 0) { ids.add(id); return }
      kids.forEach(k => walk(k.id))
    }
    walk(rootId)
    return state.nodes.filter(n => ids.has(n.id))
  }
  function onPushToHabits(n) {
    if (hasAnyDescendant(n.id)) return // 双保险
    if ((state.habits || []).length >= 12) {
      dispatch({
        type: 'PUSH_MODAL',
        payload: {
          type: 'alert',
          title: '日常打卡已满',
          message: '日常打卡已达 12 项上限，请先在日常页清理出空位后再推送。'
        }
      })
      return
    }
    const exist = state.habits.some(h => h.sourceNodeId === n.id)
    if (exist) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `⚠️ 「${n.title}」已存在于日常打卡，请勿重复下发` } })
      return
    }
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '推送至日常打卡',
        message: `将「${n.title}」推送到日常打卡视图，生成打卡卡片？\n后续在「日常习惯」页即可真正打卡与启动番茄计时。`,
        showUndo: false,
        okText: '确认推送',
        onOk: () => {
          dispatch({
            type: 'ADD_HABIT',
            payload: {
              title: n.title,
              reminderTime: n.reminderTime || '09:00',
              duration: 25,
              difficulty: 'normal',
              sourceNodeId: n.id,
            }
          })
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ 已下发「${n.title}」到日常打卡` } })
        }
      }
    })
  }

  // === 顶部主按钮：📤 批量下发（当前节点 + 所有叶子后代）===
  const isCurrentLeaf = !state.nodes.some(n => n.parentId === node.id)
  function onMasterPush() {
    const leaves = isCurrentLeaf ? [node] : collectLeaves(node.id)
    if (leaves.length === 0) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 当前节点没有可下发的叶子步骤' } })
      return
    }
    // 去重（已经带 sourceNodeId 下发过的跳过）
    const habits = state.habits || []
    const existedSet = new Set(habits.map(h => h.sourceNodeId).filter(Boolean))
    const toPush = leaves.filter(l => !existedSet.has(l.id))
    const skippedDup = leaves.length - toPush.length
    // 上限（12条）
    const capacity = Math.max(0, 12 - habits.length)
    if (capacity === 0) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'alert', title: '日常打卡已满', message: '日常打卡已达 12 项上限，请先清理再批量下发。' } })
      return
    }
    const willPush = toPush.slice(0, capacity)
    const overflow = toPush.length - willPush.length
    if (willPush.length === 0) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: skippedDup ? '⚠️ 本次所有条目都已下发过（无重复新增）' : '⚠️ 无可下发条目' } })
      return
    }
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '📤 批量下发至日常打卡',
        message: `将把 ${willPush.length} 条叶子步骤复制到日常打卡视图（${skippedDup ? '跳过已存在 ' + skippedDup + ' 条；' : ''}${overflow ? '打卡容量仅剩 ' + capacity + '，剩余 ' + overflow + ' 条未下发；' : ''}共 ${habits.length} → ${habits.length + willPush.length} 项）。\n是否继续？`,
        okText: '立即下发',
        onOk: () => {
          willPush.forEach(l => {
            dispatch({
              type: 'ADD_HABIT',
              payload: {
                title: l.title,
                reminderTime: l.reminderTime || '09:00',
                duration: 25,
                difficulty: 'normal',
                sourceNodeId: l.id,
              }
            })
          })
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ 本次成功下发 ${willPush.length} 条${skippedDup ? '（去重跳过 ' + skippedDup + '）' : ''}${overflow ? '（容量不足未下发 ' + overflow + '）' : ''}` } })
        }
      }
    })
  }

  // === 降级弹窗确认：选中某兄弟作为新父，执行降级 ===
  function confirmDemote(toSiblingId) {
    const target = state.nodes.find(n => n.id === demoteTargetId)
    const sibling = state.nodes.find(n => n.id === toSiblingId)
    if (!target || !sibling) { setDemoteTargetId(null); return }
    dispatch({ type: 'UPDATE_NODE', id: target.id, payload: { parentId: sibling.id, level: (sibling.level || 0) + 1 } })
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ 已将「${target.title}」降级为「${sibling.title}」的子步骤` } })
    setDemoteTargetId(null)
  }

  // === Tabs 渲染辅助 ===
  const renderTab = (key, label, icon) => (
    <button
      onClick={() => setTab(key)}
      aria-label={label}
      className={`flex-1 py-1.5 text-xs rounded-lg touch-feedback transition-colors ${tab === key ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-500 hover:text-slate-700'}`}
    >
      <span className="mr-1">{icon}</span>{label}
    </button>
  )

  // === 方案标签：树状递归渲染子节点（直接/后代全部渲染，按 parentId 层级） ===
  // 先构造一个 childrenMap 方便递归渲染
  const childrenMap = useMemo(() => {
    const m = {}
    state.nodes.forEach(n => {
      if (!n.parentId) return
      if (!m[n.parentId]) m[n.parentId] = []
      m[n.parentId].push(n)
    })
    // 每个父节点下面的 children 按 createdAt 排（保证顺序稳定）
    Object.keys(m).forEach(k => m[k].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))
    return m
  }, [state.nodes])

  function recurseChildren(parentId, depth) {
    const list = childrenMap[parentId] || []
    return list.map(child => renderTreeNodeRow(child, depth, list)).concat(
      list.flatMap(child => recurseChildren(child.id, depth + 1))
    )
  }

  function renderTreeNodeRow(rowNode, depth, siblings) {
    const isLeaf = !childrenMap[rowNode.id] || childrenMap[rowNode.id].length === 0
    const indentPx = depth * 16
    const key = rowNode.id
    const cacheVal = titleEditCache[key] ?? rowNode.title ?? ''
    const brothers = (siblings || []).filter(s => s.id !== rowNode.id)
    return (
      <div
        key={key}
        className={`group flex items-stretch gap-2 py-2 border-b border-slate-100 last:border-b-0 ${expanded ? 'px-2' : ''}`}
      >
        <div style={{ width: indentPx }} className="shrink-0" aria-hidden />
        {isLeaf && <span className="shrink-0 w-5 text-xs text-emerald-500 leading-9" aria-hidden>🍃</span>}
        {!isLeaf && <span className="shrink-0 w-5 text-xs text-slate-300 leading-9" aria-hidden />}
        <input
          className={`flex-1 min-w-0 px-2 py-1.5 text-sm rounded-lg border bg-white focus:border-indigo-400 focus:outline-none ${isLeaf ? 'text-slate-700 border-slate-200' : 'font-semibold text-slate-800 border-slate-200'}`}
          value={cacheVal}
          onChange={e => setTitleEditCache({ ...titleEditCache, [key]: e.target.value })}
          onBlur={() => {
            const newTitle = (cacheVal || '').trim()
            if (!newTitle || newTitle === (rowNode.title || '')) {
              setTitleEditCache(c => { const n = { ...c }; delete n[key]; return n })
              return
            }
            updateAny(rowNode.id, { title: newTitle })
            setTitleEditCache(c => { const n = { ...c }; delete n[key]; return n })
          }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-label={`编辑节点标题 ${rowNode.title}`}
        />
        <div className="shrink-0 flex items-center gap-1 pl-1">
          <button
            onClick={() => onPromote(rowNode)}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 text-sm flex items-center justify-center touch-feedback"
            title="升级为父级（上跳一级 / 或成为独立根节点）"
            aria-label="升级为父级"
          >⤴️</button>
          <button
            onClick={() => {
              if (brothers.length === 0) {
                dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 暂无同级兄弟节点，先为当前节点新增一个兄弟再尝试降级' } })
                return
              }
              setDemoteTargetId(rowNode.id)
            }}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 text-sm flex items-center justify-center touch-feedback"
            title="降级为子级（选择同级兄弟作为新父节点）"
            aria-label="降级为子级"
          >⤵️</button>
          {isLeaf && (
            <button
              onClick={() => onPushToHabits(rowNode)}
              className="w-8 h-8 rounded-lg hover:bg-indigo-50 text-indigo-500 text-sm flex items-center justify-center touch-feedback"
              title="一键下发推送至日常打卡视图，生成打卡卡片"
              aria-label="推送至日常打卡"
            >📤</button>
          )}
          <button
            onClick={() => onDeleteChild(rowNode)}
            className="w-8 h-8 rounded-lg hover:bg-rose-50 text-rose-500 text-sm flex items-center justify-center touch-feedback"
            title="删除本子节点及其后代"
            aria-label="删除子节点"
          >🗑</button>
        </div>
      </div>
    )
  }

  const treeRows = recurseChildren(nodeId, 0)

  // === 弹窗整体尺寸类名：紧凑 / 展开 ===
  const sizeClass = expanded
    ? 'fixed inset-0 m-auto w-[80vw] max-w-5xl h-[80vh] max-h-[900px] z-40'
    : 'fixed z-40 w-96 max-h-[70vh]'

  const stylePos = expanded ? {} : { left: Math.min(window.innerWidth - 400, pos.x), top: Math.min(window.innerHeight - 400, pos.y) }
  const bodyMaxH = expanded ? 'calc(80vh - 260px)' : '55vh'

  return (
    <>
      {/* B2：透明全屏 mask — 点击任意非弹窗区域 → 关闭弹窗。同时把 mousedown/mouseup 停掉避免冒泡到画布误判。
            外层 Fragment 内部的所有 wrapper 统一挂 data-mind-popup="1"，供 Canvas 的 mousedown 识别。 */}
      <div
        className="fixed inset-0 bg-transparent mind-node-popup-root"
        data-mind-popup="1"
        aria-label="点击关闭节点弹窗"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        style={{ zIndex: 39 }}
      />
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col ${sizeClass} mind-node-popup-root`}
        data-mind-popup="1"
        style={stylePos}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        {/* === 头部 === */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0 bg-gradient-to-br from-indigo-500 to-violet-500"
            aria-hidden
          >
            {(node.title || '?').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-800 truncate">{node.title}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              子节点 {children.length} · 总后代 {getDescendants(nodeId).size - 1}
            </div>
          </div>
          {/* 展开/收起切换按钮 */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center touch-feedback shrink-0"
            title={expanded ? '收起为紧凑小窗' : '展开为大编辑界面'}
            aria-label={expanded ? '收起弹窗' : '展开弹窗'}
          >{expanded ? '🗗' : '⬜'}</button>
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center touch-feedback shrink-0"
            aria-label="关闭弹窗"
          >×</button>
        </div>

        {/* === Tabs：只保留方案（默认）/ 配置 === */}
        <div className="px-3 py-2 flex gap-1 border-b border-slate-100 bg-slate-50/50 shrink-0">
          {renderTab('plan', '方案', '📋')}
          {renderTab('config', '配置', '⚙️')}
        </div>

        {/* === Body：两个 Tab 内容 === */}
        <div className="flex-1 p-4 overflow-y-auto no-scrollbar" style={{ maxHeight: bodyMaxH }}>
          {tab === 'plan' && (
            <div className="h-full flex flex-col gap-3">
              {/* 顶部 2 按钮：AI写方案 / 新增子节点（E4：AI 生成时禁用按钮 + loading 文案） */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={writeExecutionPlan}
                  disabled={aiGenerating}
                  className={`flex-1 p-2.5 rounded-xl text-white text-sm font-semibold touch-feedback shadow-sm transition-all ${
                    aiGenerating
                      ? 'bg-indigo-400/70 cursor-wait'
                      : 'bg-indigo-500 hover:bg-indigo-400'
                  }`}
                  aria-label="AI写执行方案"
                >{aiGenerating ? '🤖 AI 生成中…' : '✍️ AI写执行方案'}</button>
                <button
                  onClick={addChild}
                  disabled={aiGenerating}
                  className={`flex-1 p-2.5 rounded-xl text-sm font-semibold touch-feedback border transition-all ${
                    aiGenerating
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-gradient-to-br from-emerald-50 to-emerald-100 hover:from-emerald-100 hover:to-emerald-200 text-emerald-700 border-emerald-200'
                  }`}
                  aria-label="新增子任务节点"
                >➕ 新增子任务节点</button>
              </div>
              {/* T4 顶部主按钮：📤 下发（复制）到日常打卡（显性化主入口） */}
              <div className="shrink-0">
                <button
                  onClick={onMasterPush}
                  className="w-full p-2.5 rounded-xl text-sm font-bold touch-feedback shadow-sm transition-all bg-gradient-to-r from-sky-50 to-indigo-50 text-indigo-700 border border-indigo-200 hover:from-indigo-50 hover:to-sky-50"
                  aria-label="下发复制到日常打卡"
                >📤 下发（复制）到日常打卡 {isCurrentLeaf ? '' : `· 共 ${state.nodes.some(n => n.parentId === node.id) ? collectLeaves(node.id).length : 1} 条叶子`}</button>
              </div>
              {/* 树状列表区 */}
              <div className={`flex-1 border border-slate-200 rounded-xl bg-slate-50/40 overflow-y-auto min-h-[${expanded ? '300' : '160'}px]`}>
                {treeRows.length === 0 ? (
                  <div className="py-10 px-6 text-center text-xs text-slate-400 space-y-1.5">
                    <div className="text-2xl mb-1" aria-hidden>🌱</div>
                    <div>暂无子步骤</div>
                    <div className="opacity-70">点击上方「✍️ AI写执行方案」生成树状框架；或点「➕ 新增子任务节点」手动添加</div>
                  </div>
                ) : (
                  <div className="py-2">
                    {treeRows}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'config' && (
            <div className="space-y-4 text-xs">
              {/* T1-1. 开始日期（精确到具体某一天，参与时间轴渲染/预估计算） */}
              <div>
                <label className="block text-slate-500 font-semibold mb-1.5">🗓 开始日期（具体到某月某日）</label>
                <input
                  type="date"
                  value={node.startDate || ''}
                  onChange={e => update({ startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-400 focus:outline-none text-sm bg-white"
                  aria-label="开始日期"
                />
                <div className="text-[11px] text-slate-400 mt-1">修改后节点会自动对齐到时间轴对应的日期坐标。</div>
              </div>
              {/* T1-2. 截止日期（精确到具体某一天，原字段保留） */}
              <div>
                <label className="block text-slate-500 font-semibold mb-1.5">🗓 目标截止日期</label>
                <input
                  type="date"
                  value={node.dueDate || ''}
                  onChange={e => update({ dueDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-400 focus:outline-none text-sm bg-white"
                  aria-label="目标截止日期"
                />
              </div>
              {/* T2. 节点闹钟提醒（精确到分钟，localStorage 持久化于节点属性） */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-600 font-semibold text-[12px]">🔔 节点闹钟提醒</label>
                  <label className="inline-flex items-center gap-2 text-[12px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={!!node.reminder?.enabled}
                      onChange={e => {
                        const now = new Date(); now.setMinutes(now.getMinutes() + 30); now.setSeconds(0, 0)
                        const defaultIso = toLocalDatetimeLocal(now)
                        update({
                          reminder: e.target.checked
                            ? { enabled: true, isoTime: (node.reminder && node.reminder.isoTime) || defaultIso, notified: false }
                            : { enabled: false, isoTime: '', notified: false }
                        })
                      }}
                      className="w-4 h-4 accent-indigo-500 rounded"
                      aria-label="开启闹钟提醒"
                    />
                    {!!node.reminder?.enabled ? <span className="text-emerald-600 font-bold">已开启</span> : <span>点击开启</span>}
                  </label>
                </div>
                {!!node.reminder?.enabled && (
                  <>
                    <input
                      type="datetime-local"
                      value={node.reminder?.isoTime || ''}
                      onChange={e => update({ reminder: { ...(node.reminder || {}), enabled: true, isoTime: e.target.value, notified: false } })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-400 focus:outline-none text-sm bg-white"
                      aria-label="提醒日期时间"
                    />
                    <div className="text-[11px] text-slate-400 leading-snug">
                      到达时间会在页面内弹出提醒（保存在 localStorage，关闭浏览器后下次打开到点仍会提示）。
                      {!!node.reminder?.notified && <span className="ml-1 text-slate-500 font-semibold">（该时间已弹出提醒）</span>}
                    </div>
                  </>
                )}
              </div>
              {/* 2. 目标权重（保留原有） */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-500 font-semibold">⚖️ 目标权重</label>
                  <span className="font-bold text-indigo-600 text-sm">{Number(node.weight) || 0}</span>
                </div>
                <input
                  type="number" min={0} max={100}
                  value={Number(node.weight) || 0}
                  onChange={e => update({ weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-400 focus:outline-none text-sm bg-white"
                  aria-label="目标权重 0-100"
                />
              </div>
              {/* 3. 信息提示 + 底部留白 + 右下角删除按钮（独立） */}
              <div className="pt-6" aria-hidden />
            </div>
          )}
        </div>

        {/* === 右下角独立删除按钮（四周 ≥16px 留白，避免误点）=== */}
        <div className="shrink-0 px-5 pt-3 pb-5 flex justify-end border-t border-slate-100 bg-white/60">
          <button
            onClick={deleteNode}
            className="p-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-semibold touch-feedback border border-rose-100"
            aria-label="删除整个节点及其所有子步骤"
          >🗑 删除节点</button>
        </div>
      </div>

      {/* === 降级为子级：兄弟节点选择小弹窗（自建 overlay，避免走 ModalRoot 的 undoStack clone 序列化坑）=== */}
      {demoteTargetId && (() => {
        const target = state.nodes.find(n => n.id === demoteTargetId)
        if (!target) return null
        const siblings = (state.nodes.filter(n => n.parentId === target.parentId && n.id !== target.id) || [])
        if (siblings.length === 0) { setDemoteTargetId(null); return null }
        return (
          <>
            <div className="fixed inset-0 z-[45] bg-black/30 backdrop-blur-sm" onClick={() => setDemoteTargetId(null)} aria-label="关闭降级选择" />
            <div className="fixed inset-0 z-[46] flex items-center justify-center p-4 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95">
                <div className="px-5 pt-5 pb-2 border-b border-slate-100">
                  <div className="text-base font-bold text-slate-800">⤵️ 降级为子级</div>
                  <div className="text-xs text-slate-500 mt-1">为「{target.title}」选择一个新的父级（同级兄弟）：</div>
                </div>
                <div className="p-4 max-h-72 overflow-y-auto space-y-1.5">
                  {siblings.map(sib => (
                    <button
                      key={sib.id}
                      onClick={() => confirmDemote(sib.id)}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/60 text-sm text-slate-700 touch-feedback flex items-center gap-2"
                    >
                      <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-500 text-xs font-bold flex items-center justify-center shrink-0" aria-hidden>{(sib.title || '?').slice(0, 2)}</span>
                      <span className="truncate">{sib.title}</span>
                    </button>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                  <button onClick={() => setDemoteTargetId(null)} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">取消</button>
                </div>
              </div>
            </div>
          </>
        )
      })()}
    </>
  )
}

function countAll(nodes, id) {
  const set = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    nodes.forEach(n => {
      if (n.parentId && set.has(n.parentId) && !set.has(n.id)) { set.add(n.id); changed = true }
    })
  }
  return set.size
}

// T2：把 Date 转成本地时区的 YYYY-MM-DDTHH:mm（datetime-local 的 value 格式）
function toLocalDatetimeLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
