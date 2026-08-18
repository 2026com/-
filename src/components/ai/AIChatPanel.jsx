import React, { useState, useRef, useEffect } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { matchMethod, genExecutionPlan, parseAICommand, generateMonthlyReview, generateYearlyReview } from '../../utils/aiLogic.js'
import { dateUtil } from '../../utils/storage.js'

/**
 * 左侧抽屉AI对话面板（双模式之一，宽度2倍导航栏）
 * V1.0 AI能力边界：
 * - 任务拆解、学习法匹配、复盘生成、规则答疑
 * - 所有AI增删、重构思维导图，必须二次确认+撤销（约束第3条）
 */
export default function AIChatPanel() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef(null)
  const msgs = state.aiHistory

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' })
  }, [msgs.length, isTyping])

  const send = () => {
    const text = input.trim()
    if (!text) return
    dispatch({ type: 'ADD_AI_MESSAGE', payload: { role: 'user', content: text } })
    setInput('')
    setIsTyping(true)
    // 模拟AI思考延迟
    setTimeout(() => processAI(text), 600 + Math.random() * 400)
  }

  const processAI = (text) => {
    const cmd = parseAICommand(text)
    let reply = ''
    let actions = [] // 附加操作按钮

    if (cmd.action === 'review_monthly') {
      const data = {
        month: new Date().getMonth() + 1,
        totalCheckins: Object.keys(state.checkins).length,
        streak: 25,
        totalHours: 186,
        completeRate: 52,
        topDomain: '主业成长路径',
        weakDomain: '创造力'
      }
      reply = generateMonthlyReview(data)
      actions.push({
        label: '📁 归档至仪表盘',
        onClick: () => {
          dispatch({
            type: 'ADD_REPORT',
            payload: { title: `${data.month}月成长复盘报告`, content: reply, type: 'monthly' }
          })
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已归档至复盘仪表盘' } })
        }
      })
      actions.push({
        label: '📋 一键复制',
        onClick: () => {
          navigator.clipboard?.writeText(reply)
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已复制' } })
        }
      })
    }
    else if (cmd.action === 'review_yearly') {
      const data = { year: new Date().getFullYear(), yearRate: 52, totalHours: 186, topDomain: '主业成长', weakDomain: '创造力' }
      reply = generateYearlyReview(data)
      actions.push({
        label: '📁 归档至仪表盘',
        onClick: () => {
          dispatch({ type: 'ADD_REPORT', payload: { title: `${data.year}年度成长复盘`, content: reply, type: 'yearly' } })
        }
      })
    }
    else if (cmd.action === 'decompose') {
      // 针对当前选中节点拆解（若无选中，提示用户先点）
      const selId = state.ui.selectedNodeId
      if (!selId) {
        reply = '⚠️ 请先在思维导图画布中点击一个父级任务节点，我再为其拆解子任务。\n\n拆解规则：\n· 自动匹配4种科学学习法\n· 最多拆为 6 个层级子节点\n· **AI拆分后将弹出二次确认，支持一键撤销**'
      } else {
        const parent = state.nodes.find(n => n.id === selId)
        const method = matchMethod(parent?.title || '')
        // 构造新节点（模拟AI拆解）——实际仅生成待确认payload
        reply = `✅ 已为「${parent?.title}」生成6个阶段拆解：\n\n1. 基础知识层 → ${method?.name || '番茄工作法'}（${method?.singleTime || 25}分钟/次）\n2. 分项技能训练 → 刻意练习\n3. 实操演练 → 番茄工作法\n4. 综合案例 → 费曼学习法输出\n5. 进阶打磨 → 刻意练习\n6. 最终产出 → 第一性原理复盘\n\n请选择：`
        // 构造待写入的节点
        const newNodesPayload = genDecomposedNodes(state.nodes, selId, method)
        actions.push({
          label: '📝 仅写入执行方案',
          onClick: () => {
            const plan = genExecutionPlan({ title: parent?.title || '' })
            dispatch({ type: 'UPDATE_NODE', id: selId, payload: { executionPlan: plan } })
            dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已写入执行方案备注栏' } })
          }
        })
        actions.push({
          label: '🔀 AI重构幕布层级（二次确认）',
          onClick: () => {
            dispatch({
              type: 'PUSH_MODAL',
              payload: {
                type: 'confirm',
                title: '⚠️ AI重构幕布二次确认',
                message: `将为「${parent?.title}」新增6个子节点，是否确认？\n\n操作完成后可在弹窗内点「撤销」一键回滚。`,
                onOk: () => {
                  dispatch({ type: 'AI_RESTRUCTURE_NODES', payload: newNodesPayload })
                  dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已重构，如需撤销请再次操作任意节点后点撤销。' } })
                }
              }
            })
          }
        })
      }
    }
    else if (cmd.action === 'method') {
      const sel = state.nodes.find(n => n.id === state.ui.selectedNodeId)
      const method = matchMethod(sel?.title || text)
      reply = `【为「${sel?.title || '当前任务'}」匹配的方法论】\n\n🏷 名称：${method?.name || '番茄工作法'}\n💡 适用场景：${method?.desc || '25分钟专注循环'}\n⏱ 建议：单次${method?.singleTime || 25}分钟，休息${method?.restTime || 5}分钟\n\n📌 四步执行：\n${(method?.steps || ['设定目标','启动专注','休息','复盘']).map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      if (sel) {
        actions.push({
          label: '写入任务执行方案',
          onClick: () => {
            const plan = genExecutionPlan({ title: sel.title })
            dispatch({ type: 'UPDATE_NODE', id: sel.id, payload: { executionPlan: plan } })
            dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已写入' } })
          }
        })
      }
    }
    else {
      // 默认规则答疑
      reply = `你好，我是成长APP V1.0内置AI助手🧠\n\n我目前能帮你做这些事（二期V2.0功能：批量编辑/短板诊断/情商模拟 已预留未开放）：\n\n1️⃣ **任务拆解**：先点画布任一任务，再发「帮我拆解学习路径」\n2️⃣ **学习法匹配**：点任务后发「推荐学习方案」（番茄/费曼/第一性原理/刻意练习 四选一）\n3️⃣ **生成复盘报告**：发送「生成月度复盘」或「生成年度复盘」，可一键归档仪表盘+复制导出\n4️⃣ **规则答疑**：关于七大系统、进度双权重计算规则的任何问题\n\n请试试上面的指令吧。`
    }

    setIsTyping(false)
    dispatch({ type: 'ADD_AI_MESSAGE', payload: { role: 'ai', content: reply, actions } })
  }

  return (
    <div className="h-full flex flex-col">
      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
        {msgs.length === 0 && (
          <div className="text-xs text-slate-400 p-4 rounded-lg bg-indigo-50/50 leading-relaxed">
            👋 试试：<br />
            · 「帮我拆解学习钢琴路径」<br />
            · 「生成月度复盘」<br />
            · 先点画布一个节点 → 「推荐学习方法」
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-none'
                : 'bg-slate-100 text-slate-700 rounded-bl-none'
            }`}>
              <div>{m.content}</div>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.actions.map((a, i) => (
                    <button
                      key={i}
                      onClick={a.onClick}
                      className="px-2.5 py-1 rounded-md text-[11px] bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 touch-feedback"
                    >{a.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-100 text-slate-500 text-xs rounded-xl rounded-bl-none px-3 py-2 animate-pulse">
              AI思考中...
            </div>
          </div>
        )}
      </div>

      {/* 底部操作按钮 */}
      <div className="px-3 pb-2 flex gap-1.5 flex-wrap border-t border-slate-100 pt-2">
        <button onClick={() => setInput('生成月度复盘')} className="px-2 py-1 text-[11px] bg-slate-50 rounded hover:bg-slate-100 text-slate-600 touch-feedback">📅 月度复盘</button>
        <button onClick={() => setInput('生成年度复盘')} className="px-2 py-1 text-[11px] bg-slate-50 rounded hover:bg-slate-100 text-slate-600 touch-feedback">🎯 年度复盘</button>
        <button onClick={() => dispatch({ type: 'CLEAR_AI_HISTORY' })} className="px-2 py-1 text-[11px] bg-rose-50 rounded hover:bg-rose-100 text-rose-600 touch-feedback ml-auto">清空</button>
      </div>

      {/* 输入区 */}
      <div className="p-3 border-t border-slate-100 flex gap-2 shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="打字输入指令..."
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button
          onClick={send}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg touch-feedback shrink-0"
        >
          发送
        </button>
      </div>
      <div className="px-3 pb-3 pt-0 flex items-center gap-2">
        <button className="flex-1 px-3 py-1.5 text-xs border border-dashed border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 touch-feedback">
          🎤 按住空格语音输入
        </button>
      </div>
    </div>
  )
}

// 生成拆解后的节点集（保留现有，在父节点下新增6个子节点）
function genDecomposedNodes(currentNodes, parentId, method) {
  const parent = currentNodes.find(n => n.id === parentId)
  if (!parent) return currentNodes
  const children = [
    { title: '①基础知识层', p: 20, method: method.key },
    { title: '②分项技能训练', p: 18, method: 'deliberate' },
    { title: '③实操演练', p: 22, method: 'pomodoro' },
    { title: '④综合案例输出', p: 15, method: 'feynman' },
    { title: '⑤进阶打磨', p: 15, method: 'deliberate' },
    { title: '⑥复盘&最终产出', p: 10, method: 'first_principle' },
  ]
  const newNodes = [...currentNodes]
  children.forEach((c, i) => {
    newNodes.push({
      id: `node_${Date.now()}_${i}`,
      parentId,
      title: c.title,
      systemId: parent.systemId || 'zhuye',
      status: 'todo',
      progress: 0,
      x: (parent.x || 500) + 140 + i * 110,
      y: (parent.y || 400) + (i % 2 === 0 ? -60 : 60),
      level: (parent.level || 0) + 1,
      estimatedHours: c.p * 2,
      difficulty: 2,
      value: 2,
      weight: c.p,
      executionPlan: `【推荐方法】${method?.name || '番茄工作法'}\n建议单次${method?.singleTime || 25}分钟`
    })
  })
  return newNodes
}
