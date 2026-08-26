import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAppState, useAppDispatch } from '../../../context/AppContext.jsx'
import { uid } from '../../../utils/storage.js'
import { chatCompletion } from '../services/aiClient.js'
import { buildContextMessages } from '../services/conversationManager.js'
import AIConfigPanel from '../../../components/ai/AIConfigPanel.jsx'

/**
 * 常驻可收起侧边 AI 对话窗口
 *
 * E3 修复：
 *  - 真实 API 调用统一走通用 aiClient.chatCompletion（AbortController 超时、错误解析、HTTP 码兼容）
 *  - 不再直接 fetch，避免与 AI 写执行方案调用栈分裂；统一复用 state.aiConfig
 *  - 密钥全来自浏览器 localStorage（state.aiConfig），未硬编码
 *  - 预留扩展：qwen/glm/custom 三家都可通过配置面板切换，aiClient 兼容 /chat/completions 协议
 */
export default function AIChatSidebar({ onOpenConfig, embedded = false }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const aiConfig = state.aiConfig

  // embedded 模式（左侧抽屉）：始终视为展开；否则为右侧浮球模式
  const [expanded, setExpanded] = useState(embedded)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  // 阶段1：内置配置面板状态（无论 embedded 与否，⚙️ 都能打开模型配置）
  const [configOpen, setConfigOpen] = useState(false)

  // ================ 折叠态浮球可拖动（仅垂直方向，右侧贴边保持不变） ================
  const FAB_STORAGE_KEY = 'ai.fab.position.v1'
  const FAB_W = 44          // 浮球视觉宽度（约 px-2.5 = 10px 左右，给一个近似值用于边界计算）
  const FAB_H = 120         // 浮球视觉高度（约 py-5 = 20px + 内容 ≈ 120）
  const FAB_MARGIN = 40     // 上下安全边距
  const [fabTop, setFabTop] = useState(() => {
    try {
      const raw = localStorage.getItem(FAB_STORAGE_KEY)
      if (raw) {
        const v = JSON.parse(raw)
        if (typeof v?.top === 'number' && Number.isFinite(v.top)) return v.top
      }
    } catch {}
    return null // null → 用 CSS 默认（top 1/2，垂直居中）
  })
  const dragRef = useRef({ startY: 0, startTop: 0, moved: false, dragging: false })

  const clampFabTop = useCallback((y) => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const maxTop = Math.max(FAB_MARGIN, vh - FAB_H - FAB_MARGIN)
    return Math.min(Math.max(FAB_MARGIN, y), maxTop)
  }, [])

  // 保存位置到 localStorage（防抖 80ms，拖动过程不频繁写）
  const persistTimer = useRef(null)
  const persistFab = useCallback((top) => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      try { localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify({ top })) } catch {}
    }, 80)
  }, [])

  const onFabPointerDown = (e) => {
    // 只处理主左键（0）或触屏
    if (typeof e.button === 'number' && e.button !== 0 && e.pointerType !== 'touch') return
    const currentTopPx = (() => {
      if (fabTop != null) return fabTop
      // 首次拖动：从视觉 top 1/2 反推实际像素位置
      const vh = window.innerHeight
      return clampFabTop(vh / 2 - FAB_H / 2)
    })()
    dragRef.current = {
      startY: e.clientY,
      startTop: currentTopPx,
      startTime: Date.now(),
      maxDy: 0,
      moved: false,
      dragging: true,
    }
    e.preventDefault()
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch {}
  }

  const onFabPointerMove = (e) => {
    if (!dragRef.current.dragging) return
    const dy = e.clientY - dragRef.current.startY
    const ady = Math.abs(dy)
    // 累计最大偏移用于 tap 判定
    if (ady > dragRef.current.maxDy) dragRef.current.maxDy = ady
    // 拖拽阈值从 4px 提高到 12px（配合起始 120ms 防颤判断，避免手指轻抖被误判为拖动）
    if (ady > 12 || dragRef.current.moved) dragRef.current.moved = true
    const next = clampFabTop(dragRef.current.startTop + dy)
    setFabTop(next)
    e.preventDefault()
    e.stopPropagation()
  }

  // [修复] 统一 tap 判定：拖拽结束的位移/耗时记在 dragRef 中。
  // 无论从 pointerup 还是 click（某些 WebView 会 suppress click 后的备选）触发，
  // 都按「按得短 + 位移小」判定为点击 → 展开抽屉。
  // 拖拽（长按拖动 > 350ms 或位移 > 12px）→ 不展开，仅保留位置调整。
  const maybeOpenFab = () => {
    const d = dragRef.current
    if (!d || d.dragging) return
    const duration = Date.now() - (d.startTime || Date.now())
    const maxDy = d.maxDy || 0
    const isTap = duration < 350 && maxDy <= 12
    if (!isTap) return
    if (fabTop != null) persistFab(fabTop)
    setExpanded(true)
  }

  const onFabPointerUp = (e) => {
    if (!dragRef.current.dragging) return
    dragRef.current.dragging = false
    dragRef.current.moved = false      // [修复] 拖动结束后重置 moved，避免阻塞后续 click 事件
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
    maybeOpenFab()
  }

  const onFabPointerCancel = (e) => {
    dragRef.current.dragging = false
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
  }

  // 窗口尺寸变化时重新夹取一次（防止浮球溢出可视区）
  useEffect(() => {
    const onResize = () => {
      setFabTop((prev) => {
        if (prev == null) return prev
        return clampFabTop(prev)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampFabTop])

  const messages = state.aiHistory || []

  // 展开/新消息时滚到底
  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, expanded])

  // 发送消息
  const handleSend = async () => {
    const content = inputValue.trim()
    if (!content || loading) return

    // 1) 用户消息入历史
    const userMsg = { id: uid('msg'), role: 'user', content, createdAt: Date.now() }
    dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: userMsg } })
    setInputValue('')
    setLoading(true)

    // 2) 构造上下文（最近 12 条 + system prompt）—— 拆分迁移至 utils/ai/conversationManager.js
    const messagesForApi = buildContextMessages(state.aiHistory, content)

    try {
      const hasFullConfig = aiConfig?.baseUrl && aiConfig?.apiKey && aiConfig?.modelId
      if (!hasFullConfig) {
        // ====== 未配置 Key：明确提示，告知可手动使用 ======
        const providerHint = (aiConfig?.provider === 'deepseek' || !aiConfig?.provider)
          ? 'DeepSeek'
          : (aiConfig?.provider || '当前')
        const placeholder =
`⚠️ 还没有配置「${providerHint}」的 API Key → 当前为本地占位模式。

已收到提问：「${content.slice(0, 50)}${content.length > 50 ? '…' : ''}」

👉 点右上角 ⚙️ 打开配置面板 → 填入：
   ① Base URL   https://api.deepseek.com/v1
   ② Model ID   deepseek-chat
   ③ API Key    你在 platform.deepseek.com 申请的个人密钥

💡 不配置 AI 也可 100% 完整手动使用整套系统（打卡 / 幕布 / 复盘全不受影响）。`
        const aiMsg = { id: uid('msg'), role: 'assistant', content: placeholder, createdAt: Date.now() }
        dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: aiMsg } })
        return
      }

      // ====== 真实 AI 调用（统一 aiClient） ======
      const { content: aiContent } = await chatCompletion(aiConfig, messagesForApi, {
        timeoutMs: 15000,
        temperature: 0.7
      })
      const finalText = String(aiContent || '').trim() || '（模型返回了空回答，请重试）'
      const aiMsg = { id: uid('msg'), role: 'assistant', content: finalText, createdAt: Date.now() }
      dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: aiMsg } })
    } catch (err) {
      // ====== 真实调用失败：给出错误原文 + 下一步建议，不锁主流程 ======
      const errMsg = (err && err.message) ? String(err.message) : '网络异常'
      const safe = errMsg.length > 220 ? errMsg.slice(0, 220) + '…' : errMsg
      const fallback =
`⚠️ 无法连接模型：${safe}

👉 可能原因 & 处理：
   ① 检查密钥是否复制完整（是否多了空格）；
   ② Base URL 是否以 https:// 开头；
   ③ 网络环境是否能访问该地址；
   ④ 若只是临时不可用，可先手动操作全部功能。

已收到你的提问：「${content.slice(0, 40)}${content.length > 40 ? '…' : ''}」。`
      const aiMsg = { id: uid('msg'), role: 'assistant', content: fallback, createdAt: Date.now() }
      dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: aiMsg } })
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  const handleKeyDown = (e) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 格式化时间
  const fmtTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // 清空聊天记录（二次确认）
  const handleClear = () => {
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '确认清空 AI 聊天记录？',
        message: '聊天记录将从本地浏览器永久删除，无法恢复。',
        okText: '清空',
        onOk: () => {
          dispatch({ type: 'RESET_AI_HISTORY' })
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 聊天记录已清空' } })
        }
      }
    })
  }

  return (
    <>
      {/* ============ 折叠态常驻 tab（仅非 embedded 模式显示；屏幕右侧贴边，仅垂直方向可拖动） ============ */}
      {!embedded && !expanded && (
        <button
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          onPointerCancel={onFabPointerCancel}
          onClick={maybeOpenFab}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed right-0 z-40 bg-indigo-500 text-white hover:bg-indigo-600 shadow-2xl shadow-indigo-200 rounded-l-xl px-2.5 py-5 flex flex-col items-center gap-1.5 touch-feedback select-none cursor-grab active:cursor-grabbing"
          style={{
            top: fabTop != null ? `${fabTop}px` : '50%',
            transform: fabTop != null ? 'none' : 'translateY(-50%)',
            touchAction: 'none',
          }}
          title="上下拖动调整位置，点击展开 AI 助手"
          aria-label="AI 助手浮球（上下拖动）"
        >
          <span className="text-xl leading-none pointer-events-none">🤖</span>
          <span
            className="text-[11px] font-semibold tracking-wider pointer-events-none"
            style={{ writingMode: 'vertical-rl' }}
          >AI 助手</span>
          <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 h-8 rounded-full bg-white/40 opacity-0 hover:opacity-100 transition-opacity" aria-hidden />
        </button>
      )}

      {/* ============ 展开态侧边抽屉（embedded 模式下全宽内嵌于左侧抽屉容器） ============ */}
      <div
        className={
          embedded
            ? 'relative h-full w-full flex'
            : `fixed right-0 top-0 h-full z-40 transition-all duration-300 ease-out flex ${
                expanded ? 'translate-x-0' : 'translate-x-full pointer-events-none'
              }`
        }
        style={embedded ? undefined : { width: 'min(420px, 88vw)' }}
      >
        {/* 遮罩点击收起（仅展开态 + 非 embedded 生效） */}
        {!embedded && expanded && (
          <div
            className="absolute right-full top-0 w-screen h-screen bg-slate-900/10 backdrop-blur-[1px]"
            onClick={() => setExpanded(false)}
            aria-hidden
          />
        )}

        {/* 抽屉主体 */}
        <div className={`relative h-full w-full flex flex-col ${embedded ? 'bg-white' : 'bg-white/95 backdrop-blur-xl border-l border-slate-200 shadow-2xl'}`}>
          {/* 顶部栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">🤖</span>
              <div>
                <div className="text-sm font-bold text-slate-800 leading-tight">AI 成长助手</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {aiConfig?.apiKey ? `已接入 · ${aiConfig.provider || 'deepseek'}` : 'V1 占位模式 · 可手动使用'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (onOpenConfig) onOpenConfig()
                  else setConfigOpen(true)
                }}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-indigo-600 flex items-center justify-center text-base touch-feedback"
                title="配置模型 API"
              >⚙️</button>
              <button
                onClick={handleClear}
                className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-600 flex items-center justify-center text-sm touch-feedback"
                title="清空聊天记录"
              >🗑️</button>
              {!embedded && (
                <button
                  onClick={() => setExpanded(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center text-lg touch-feedback"
                  title="收起侧边栏"
                >✕</button>
              )}
            </div>
          </div>

          {/* 消息列表区 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 text-slate-400">
                <div className="text-5xl mb-4 opacity-70">💬</div>
                <div className="text-sm font-medium text-slate-500 mb-2">开启 AI 成长对话</div>
                <div className="text-[11px] leading-relaxed max-w-xs">
                  可以向我提问任何成长相关问题：学习方法、任务拆解、习惯养成、目标规划。<br/>
                  V1 未配置 Key 时为占位模式，配置后启用真实 AI。
                </div>
              </div>
            )}

            {messages.map(m => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm mr-2 shrink-0 self-start mt-0.5">🤖</div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-indigo-500 text-white rounded-br-md shadow-sm shadow-indigo-200'
                      : 'bg-slate-100 text-slate-700 rounded-bl-md'
                  }`}
                >
                  {m.content}
                  <div
                    className={`mt-1.5 text-[9px] opacity-60 tabular-nums ${
                      m.role === 'user' ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >{fmtTime(m.createdAt)}</div>
                </div>
                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm ml-2 shrink-0 self-start mt-0.5">🧑</div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm mr-2 shrink-0 self-start mt-0.5">🤖</div>
                <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="shrink-0 border-t border-slate-100 p-3 bg-slate-50/50">
            <div className="flex items-end gap-2 bg-white rounded-xl border border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all p-2">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={loading ? 'AI 正在思考...' : '输入你的问题，Enter 发送，Shift+Enter 换行'}
                disabled={loading}
                rows={1}
                className="flex-1 resize-none bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400 px-1 py-1 max-h-32 leading-relaxed"
                style={{ minHeight: '28px' }}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || loading}
                className="w-9 h-9 shrink-0 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center text-sm font-bold transition-all touch-feedback disabled:cursor-not-allowed"
                title="发送"
              >
                {loading ? '…' : '➤'}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <div className="text-[10px] text-slate-400">
                {aiConfig?.apiKey ? `🔑 ${aiConfig.provider || 'deepseek'} · ${aiConfig.modelId}` : '⚠️ 未配置 API Key，使用 V1 占位模式'}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">{messages.length}/200</div>
            </div>
          </div>
        </div>
      </div>

      {/* 阶段1：内置模型配置面板（embedded 左侧抽屉模式也可打开） */}
      {configOpen && (
        <AIConfigPanel
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          dispatch={dispatch}
          aiConfig={aiConfig}
        />
      )}
    </>
  )
}
