import React, { useState, useEffect } from 'react'
import { pushBackHandler } from '../../../../utils/backStack.js'

/**
 * AI 对话 · 全屏模式视图（参照 DeepSeek App 布局借鉴，非照抄）
 * - 顶层由 ChatInterface 以 createPortal 挂到 document.body（z-[48]）：
 *   盖过顶栏/底部Tab(z-30)，让位全局弹窗(z-50)与显示控制悬浮球(z-60)；
 * - 布局：左上 ☰ 弹出历史会话抽屉（按时间分组、可切换/删除），
 *   右上 ⚙️ 配置 / ⛶ 退出全屏 / ⊕ 新建对话；中间消息流或欢迎语（无模式选择胶囊）；
 *   底部固定输入栏：模型切换胶囊 + 输入框 + 发送（随模型换主题色与占位文案）；
 * - 会话数据与模型配置档案由 ChatInterface 持有（IndexedDB），本组件纯展示 + 交互回调。
 */

// 各模型服务商的展示元信息（主题色 / 默认接入参数；都是 OpenAI 兼容协议）
export const PROVIDER_META = {
  deepseek: { label: 'DeepSeek', color: '#4D6BFE', baseUrl: 'https://api.deepseek.com/v1', modelId: 'deepseek-chat', tip: '默认模型，性价比高' },
  qwen:     { label: '通义千问',  color: '#7C3AED', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', modelId: 'qwen-plus', tip: '阿里云百炼，中文强' },
  glm:      { label: '智谱GLM',  color: '#0D9488', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelId: 'glm-4-flash', tip: '有免费模型可用' },
  custom:   { label: '自定义',    color: '#475569', baseUrl: '', modelId: '', tip: '任意 OpenAI 兼容接口' },
}

/** 会话按更新时间分组：今天 / 昨天 / 7 天内 / 更早 */
function groupLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  const day0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.floor((day0(now) - day0(d)) / 86400000)
  if (diffDays <= 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays <= 7) return '7 天内'
  return '更早'
}
const GROUP_ORDER = ['今天', '昨天', '7 天内', '更早']

export default function ChatFullScreen({
  messages, loading, inputValue, setInputValue, onSend,
  aiConfig, onOpenConfig,
  sessions, currentSessionId, onNewChat, onSwitchSession, onDeleteSession, onClearAllSessions,
  onSwitchProvider,
  onExitFullscreen,
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  // 历史抽屉打开时：安卓返回键先关抽屉（LIFO，后开先关），再才是退全屏
  useEffect(() => {
    if (!historyOpen) return undefined
    return pushBackHandler(() => setHistoryOpen(false))
  }, [historyOpen])
  useEffect(() => {
    if (!modelOpen) return undefined
    return pushBackHandler(() => setModelOpen(false))
  }, [modelOpen])

  const provider = aiConfig?.provider || 'deepseek'
  const meta = PROVIDER_META[provider] || PROVIDER_META.custom
  const hasKey = !!aiConfig?.apiKey

  // 会话按时间倒序 + 分组
  const sorted = [...(sessions || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const groups = GROUP_ORDER.map(g => ({ label: g, items: sorted.filter(s => groupLabel(s.updatedAt || s.createdAt || Date.now()) === g) }))
    .filter(g => g.items.length > 0)

  const fmtTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-[48] bg-white dark:bg-slate-900 flex flex-col">
      {/* ===== 顶部栏：左 ☰ 会话抽屉 · 右 ⚙️ / ⛶ / ⊕ ===== */}
      <div className="h-12 min-h-[48px] shrink-0 flex items-center justify-between px-2 border-b border-slate-100 dark:border-slate-800">
        <button
          onClick={() => setHistoryOpen(true)}
          className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center touch-feedback"
          title="聊天记录"
          aria-label="聊天记录"
        >
          {/* ☰ 三横线 */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" />
          </svg>
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onOpenConfig}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-base touch-feedback"
            title="模型设置"
          >⚙️</button>
          <button
            onClick={onExitFullscreen}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center touch-feedback"
            title="退出全屏"
            aria-label="退出全屏"
          >
            {/* 收拢（退出全屏） */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button
            onClick={onNewChat}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center touch-feedback"
            title="新建对话"
            aria-label="新建对话"
          >
            {/* ⊕ 圆圈加号 */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ===== 中部：消息流 / 欢迎空状态 ===== */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="text-5xl mb-4 opacity-80">🤖</div>
            <div className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">开启 AI 成长对话</div>
            <div className="text-xs leading-relaxed text-slate-400 max-w-xs">
              可以问我任何成长相关问题：学习方法、任务拆解、习惯养成、目标规划。<br />
              {hasKey ? `当前模型：${meta.label} · ${aiConfig.modelId}` : '尚未配置 API Key，点右上角 ⚙️ 填入即可启用真实 AI。'}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl w-full mx-auto px-4 py-4 space-y-4">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm mr-2 shrink-0 self-start mt-0.5 text-white"
                    style={{ backgroundColor: meta.color }}
                  >🤖</div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'text-white rounded-br-md shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-md'
                  }`}
                  style={m.role === 'user' ? { backgroundColor: meta.color } : undefined}
                >
                  {m.content}
                  <div className={`mt-1.5 text-[9px] opacity-60 tabular-nums ${m.role === 'user' ? 'text-white/80' : 'text-slate-400'}`}>
                    {fmtTime(m.createdAt)}
                  </div>
                </div>
                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm ml-2 shrink-0 self-start mt-0.5">🧑</div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm mr-2 shrink-0 self-start mt-0.5 text-white" style={{ backgroundColor: meta.color }}>🤖</div>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div className="h-2" />
          </div>
        )}
      </div>

      {/* ===== 底部固定输入栏：模型胶囊 + 输入框 + 发送 ===== */}
      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-3 py-2.5 bg-white dark:bg-slate-900">
        <div className="max-w-3xl w-full mx-auto">
          <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus-within:border-slate-300 dark:focus-within:border-slate-600 transition-all p-2">
            {/* 模型切换胶囊 */}
            <button
              onClick={() => setModelOpen(true)}
              className="shrink-0 h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold touch-feedback border transition-colors"
              style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14` }}
              title="切换模型"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
              <span className="text-slate-400">▾</span>
            </button>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
              placeholder={loading ? 'AI 正在思考...' : `发消息给 ${meta.label}…`}
              disabled={loading}
              rows={1}
              className="flex-1 resize-none bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 px-1 py-2 max-h-32 leading-relaxed"
              style={{ minHeight: '36px' }}
            />
            <button
              onClick={onSend}
              disabled={!inputValue.trim() || loading}
              className="w-9 h-9 shrink-0 rounded-full text-white flex items-center justify-center text-sm font-bold transition-all touch-feedback disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              style={{ backgroundColor: meta.color }}
              title="发送"
            >
              {loading ? '…' : '➤'}
            </button>
          </div>
          {!hasKey && (
            <div className="text-[10px] text-amber-500 mt-1.5 px-1">⚠️ 未配置 API Key · 点右上角 ⚙️ 设置后启用真实 AI</div>
          )}
        </div>
      </div>

      {/* ===== 历史会话抽屉（覆盖在全屏层之上） ===== */}
      {historyOpen && (
        <div className="absolute inset-0 z-10">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setHistoryOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[80vw] bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="h-12 min-h-[48px] flex items-center px-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">聊天记录</span>
              <div className="flex-1" />
              <button
                onClick={() => { onNewChat(); setHistoryOpen(false) }}
                className="px-2 py-1 text-xs rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 touch-feedback"
              >⊕ 新对话</button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-2">
              {groups.length === 0 && (
                <div className="text-center text-xs text-slate-400 pt-10">还没有聊天记录<br />点右上角开始第一次对话吧</div>
              )}
              {groups.map(g => (
                <div key={g.label} className="mb-2">
                  <div className="px-2 pt-2 pb-1 text-[11px] text-slate-400">{g.label}</div>
                  {g.items.map(s => {
                    const active = s.id === currentSessionId
                    return (
                      <div
                        key={s.id}
                        onClick={() => { onSwitchSession(s.id); setHistoryOpen(false) }}
                        className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer touch-feedback transition-colors ${
                          active ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{s.title || '新对话'}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{(s.messages || []).length} 条 · {new Date(s.updatedAt || s.createdAt).toLocaleDateString()}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id) }}
                          className="shrink-0 w-6 h-6 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity touch-feedback"
                          title="删除此会话"
                        >✕</button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 p-2">
              <button
                onClick={onClearAllSessions}
                className="w-full text-[11px] text-slate-400 hover:text-rose-500 py-2 touch-feedback"
              >🗑 清空全部聊天记录</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 模型切换面板（底部弹出） ===== */}
      {modelOpen && (
        <div className="absolute inset-0 z-20">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setModelOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl p-4 pb-6 animate-in slide-in-from-bottom duration-200">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 px-1">切换模型</div>
            <div className="space-y-1.5">
              {Object.entries(PROVIDER_META).map(([id, m]) => {
                const active = id === provider
                const prof = { baseUrl: m.baseUrl, modelId: m.modelId }
                return (
                  <button
                    key={id}
                    onClick={() => { onSwitchProvider(id); setModelOpen(false) }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left touch-feedback transition-colors ${
                      active ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${active ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>{m.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">{m.tip} · {prof.modelId || '自填模型'}</div>
                    </div>
                    {active && <span className="text-xs shrink-0" style={{ color: m.color }}>✓ 当前</span>}
                  </button>
                )
              })}
            </div>
            <div className="text-[10px] text-slate-400 mt-3 px-1 leading-relaxed">
              各模型的接入参数（地址/密钥）在 ⚙️ 设置里填写后自动按服务商记忆；切换即用，互不覆盖。
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
