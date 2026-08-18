import React, { useState, useMemo } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'

/**
 * 通用弹窗根组件（包含二次确认、撤销按钮、Toast提示、输入型Prompt、Alert、报告弹窗等）
 * 约束规则第3条：AI所有修改/重构幕布必须二次确认+撤销按钮
 */
export default function ModalRoot() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const stack = state.ui.modalStack

  if (stack.length === 0) return null

  const top = stack[stack.length - 1]
  const close = () => dispatch({ type: 'POP_MODAL' })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in mind-node-popup-root"
      data-mind-popup="1"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        data-mind-popup="1"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        {renderModal(top, close, dispatch, state)}
      </div>
    </div>
  )
}

function renderModal(cfg, close, dispatch, state) {
  const wrap = (title, body, actions) => (
    <>
      {title && <div className="px-5 pt-5 pb-2 border-b border-slate-100">
        <div className="text-base font-bold text-slate-800">{title}</div>
      </div>}
      <div className="p-5">{body}</div>
      {actions && <div className="px-5 pb-5 flex gap-2 justify-end">{actions}</div>}
    </>
  )

  if (cfg.type === 'toast') {
    setTimeout(close, 2000)
    return wrap(null, (
      <div className="text-center py-3 text-sm text-slate-700">{cfg.message}</div>
    ))
  }

  if (cfg.type === 'alert') {
    return wrap(
      cfg.title || '提示',
      <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{cfg.message || ''}</div>,
      <button onClick={() => { cfg.onOk?.(); close() }} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-feedback">我知道了</button>
    )
  }

  if (cfg.type === 'prompt') {
    // 简易输入框弹窗（必须填名字才可确认，否则不关闭 + toast 提示）
    return <PromptModal cfg={cfg} close={close} dispatch={dispatch} wrap={wrap} />
  }

  // P3/P4：创建节点双字段弹窗（名称 + 截止日期），统一入口：根节点 / 子节点 / 双击空白
  if (cfg.type === 'custom-add-node') {
    return <AddNodeWithDateModal cfg={cfg} close={close} dispatch={dispatch} wrap={wrap} state={state} />
  }

  if (cfg.type === 'confirm') {
    const onOk = () => {
      cfg.onOk?.()
      close()
    }
    const onUndo = () => {
      dispatch({ type: 'UNDO_NODES' })
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '↶ 已撤销上一步AI操作' } })
      close()
    }
    return wrap(
      cfg.title || '⚠️ 二次确认',
      <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{cfg.message || '确认执行该操作吗？'}</div>,
      <>
        {cfg.showUndo !== false && (
          <button onClick={onUndo} className="px-3 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">↶ 撤销</button>
        )}
        <button onClick={close} className="px-3 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">取消</button>
        <button onClick={onOk} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-feedback">{cfg.okText || '确认执行'}</button>
      </>
    )
  }

  if (cfg.type === 'node_action') {
    const node = cfg.node
    return wrap(
      `🔘 ${node.title}`,
      <div className="space-y-2 text-sm">
        <p className="text-xs text-slate-500">进度 {node.progress || 0}% · 状态 {node.status}</p>
      </div>,
      <>
        <button onClick={close} className="px-3 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700">关闭</button>
      </>
    )
  }

  if (cfg.type === 'report') {
    const r = cfg.data
    return wrap(
      `📄 ${r.title}`,
      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto no-scrollbar border border-slate-100 p-3 rounded-lg bg-slate-50">
        {r.content}
      </div>,
      <>
        <button onClick={() => {
          navigator.clipboard?.writeText(r.content)
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已复制' } })
        }} className="px-3 py-2 rounded-lg text-sm bg-blue-50 text-blue-600 hover:bg-blue-100">📋 复制</button>
        <button onClick={close} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium">关闭</button>
      </>
    )
  }

  return wrap(null, <div>未知弹窗类型</div>, <button onClick={close} className="px-4 py-2 bg-slate-100 rounded">关闭</button>)
}

function PromptModal({ cfg, close, dispatch, wrap }) {
  const [val, setVal] = useState(cfg.defaultValue || '')
  const doOk = () => {
    const t = (val || '').trim()
    if (!t) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: cfg.emptyHint || '⚠️ 名称不能为空' } })
      return
    }
    cfg.onOk?.(t)
    close()
  }
  return wrap(
    cfg.title || '请输入',
    <div className="space-y-2">
      {cfg.message && <div className="text-sm text-slate-600 whitespace-pre-wrap">{cfg.message}</div>}
      <input
        autoFocus
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') doOk() }}
        placeholder={cfg.placeholder || ''}
        maxLength={cfg.maxLength || 60}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-indigo-400 focus:outline-none"
      />
    </div>,
    <>
      <button onClick={close} className="px-3 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">取消</button>
      <button onClick={doOk} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-feedback">{cfg.okText || '确认'}</button>
    </>
  )
}

/**
 * P3/P4：创建节点统一弹窗（名称 + 截止日期）
 * cfg.mode = 'root'       新增独立根节点（空白双击 / 右下角按钮）
 * cfg.mode = 'child'      新增父节点下的子节点（节点弹窗 ➕ 新增子任务）
 * cfg.parentNode          当 mode='child' 时必传，父节点对象
 * cfg.dropCoords          当 mode='root' + 双击空白时可选，{ x, y } 虚拟画布坐标（经 zoom/offset 反算），null/undefined 用默认
 */
function AddNodeWithDateModal({ cfg, close, dispatch, wrap, state }) {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const defaultDue = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
  }, [])
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState(defaultDue)
  // 每天节点范围（与时间轴共同参与计算的值，实时根据 dueDate 重算，供下方"共 X 天 / 预计 Y 小时"提示）
  const daysNum = Math.max(1, Math.min(1825,
    Math.round((new Date(dueDate + 'T23:59:59').getTime() - new Date(todayISO + 'T00:00:00').getTime()) / 86400000) + 1
  ))
  const estHours = Math.max(2, daysNum * 4)

  const doOk = () => {
    const t = name.trim()
    if (!t) { dispatch({ type:'PUSH_MODAL', payload:{ type:'toast', message:'⚠️ 请先填写节点名称' } }); return }
    if (!dueDate) { dispatch({ type:'PUSH_MODAL', payload:{ type:'toast', message:'⚠️ 请选择一个截止日期（某月某日）' } }); return }
    const dueObj = new Date(dueDate + 'T23:59:59')
    if (Number.isNaN(dueObj.getTime())) { dispatch({ type:'PUSH_MODAL', payload:{ type:'toast', message:'⚠️ 日期格式不正确' } }); return }
    const startISO = todayISO
    const dueISO   = dueObj.toISOString().slice(0, 10)
    if (cfg.mode === 'child' && cfg.parentNode) {
      // ---- 子节点：parentId = 父节点 id，level = 父 level + 1
      const parent = cfg.parentNode
      const siblings = (state?.nodes || []).filter(n => n.parentId === parent.id).length
      dispatch({
        type: 'ADD_NODE',
        payload: {
          title: t,
          parentId: parent.id,
          systemId: parent.systemId || 'zhuye',
          status: 'todo', progress: 0,
          x: (parent.x || 0) + 160,
          y: (parent.y || 0) + (siblings * 90 - (siblings + 1) * 45) * 0.8,
          level: (parent.level || 0) + 1,
          startDate: startISO,
          dueDate: dueISO,
          estimatedHours: estHours,
          difficulty: 1, value: 1, weight: 20,
        }
      })
    } else {
      // ---- 根节点（独立大任务）：parentId=null，level=0，支持双击空白时 cfg.dropCoords 给初始 x/y
      const existingRoots = (state?.nodes || []).filter(n => n.parentId == null || (n.level || 0) === 0)
      const idx = existingRoots.length
      const drop = cfg.dropCoords && typeof cfg.dropCoords.x === 'number' ? cfg.dropCoords : null
      const yGap = 320 // 每多一个根节点下移 320px，避免上下多任务重叠
      dispatch({
        type: 'ADD_NODE',
        payload: {
          title: t,
          parentId: null,
          systemId: cfg.systemId || 'nengli',
          status: 'todo', progress: 0,
          x: drop ? drop.x : 60,
          y: drop ? drop.y : -40 + idx * yGap,
          level: 0,
          startDate: startISO,
          dueDate: dueISO,
          estimatedHours: estHours,
          difficulty: 1, value: 1, weight: 30,
        }
      })
    }
    close()
  }
  return wrap(
    cfg.title || (cfg.mode === 'child' ? '新增子任务' : '新增独立任务'),
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-500 font-semibold mb-1">{cfg.labelName || (cfg.mode === 'child' ? '子任务名称' : '任务名称')}</label>
        <input
          autoFocus type="text" value={name}
          onChange={e=>setName(e.target.value)}
          onKeyDown={e=>{ if (e.key === 'Enter') doOk() }}
          placeholder={cfg.placeholderName || '例：零基础 6 个月学会钢琴'}
          maxLength={60}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-indigo-400 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500 font-semibold mb-1">{cfg.labelDate || '目标截止日期（某月某日）'} <span className="text-indigo-500 font-bold">*</span></label>
        <input
          type="date" value={dueDate}
          onChange={e=>setDueDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-indigo-400 focus:outline-none"
        />
      </div>
      <div className="text-[11px] text-slate-400 leading-snug">
        节点会自动定位到时间轴的对应日期范围：开始日期 = <b>今天 {todayISO.replace(/-/g,'/')}</b>；截止日期 = <b>{dueISO_to_slash(dueDate)}</b>（共 {daysNum} 天）；预计耗时 ≈ {estHours}h。
      </div>
    </div>,
    <>
      <button onClick={close} className="px-3 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">取消</button>
      <button onClick={doOk} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-feedback">创建并定位到时间轴</button>
    </>
  )
}
function dueISO_to_slash(s) {
  if (!s) return '—'
  return String(s).replace(/-/g, '/')
}
