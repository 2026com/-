import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  importKnowledgeFromUrl,
  describeImportError,
  extractFirstUrl,
} from '../../../systems/knowledge-base/services/knowledgeImport.js'
import { getShareInbox } from '../../../services/db.js'
import { GRAPH_CATEGORIES, CATEGORY_MAP } from '../../../systems/knowledge-base/services/mockKnowledgeGraph.js'

/**
 * 添加知识面板 V1.0（AI 助手窗口内浮层）
 * 链路：粘贴/选用链接 → 解析中 → 拆解中 → 已入库（结果列表）→ 查看图谱
 * 数据：管线见 systems/knowledge-base/services/knowledgeImport.js
 */

const STAGE_TEXT = { parsing: '解析中', splitting: '拆解中', saving: '入库中', done: '已入库' }
const STEPS = [
  { key: 'parsing', label: '解析', icon: '📄' },
  { key: 'splitting', label: '拆解', icon: '🧩' },
  { key: 'saving', label: '入库', icon: '💾' },
]

export default function KnowledgeImportPanel({ onClose, aiConfig, onOpenConfig }) {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [stage, setStage] = useState('idle') // idle | parsing | splitting | saving | done | error
  const [errInfo, setErrInfo] = useState(null)
  const [result, setResult] = useState(null) // { nodes, title }
  const [pendingItems, setPendingItems] = useState([])
  const [selectedInboxId, setSelectedInboxId] = useState(null)

  const busy = stage === 'parsing' || stage === 'splitting' || stage === 'saving'

  // 打开时加载分享收件箱中的 pending 链接（一键选用）
  const refreshPending = useCallback(() => {
    getShareInbox()
      .then((items) => setPendingItems((items || []).filter(it => it && it.status === 'pending')))
      .catch(() => setPendingItems([]))
  }, [])
  useEffect(() => { refreshPending() }, [refreshPending])

  const handlePickPending = (item) => {
    const link = extractFirstUrl(item.content) || item.content
    setUrl(link)
    setSelectedInboxId(item.id)
    if (!link) setErrInfo({ title: '该条分享里没有链接', hint: '内容将以原文导入' })
  }

  const handleImport = async () => {
    if (busy || !url.trim()) return
    setStage('parsing')
    setErrInfo(null)
    setResult(null)
    try {
      const res = await importKnowledgeFromUrl(url, {
        aiConfig,
        inboxItemId: selectedInboxId,
        onStatus: ({ stage: s }) => setStage(s),
      })
      setResult(res)
      setSelectedInboxId(null)
      refreshPending()
    } catch (err) {
      setErrInfo(describeImportError(err))
      setStage('error')
      refreshPending()
    }
  }

  const resetAll = () => {
    setUrl('')
    setStage('idle')
    setErrInfo(null)
    setResult(null)
    setSelectedInboxId(null)
  }

  const goGraph = () => {
    onClose()
    navigate('/knowledge-base')
  }

  const activeStepIndex = stage === 'done' ? STEPS.length : STEPS.findIndex(s => s.key === stage)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[86vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">✨</span>
            <span className="text-sm font-bold text-slate-800">添加知识</span>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center text-sm disabled:opacity-40"
          >✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* 链接输入 */}
          <div>
            <label className="text-[11px] text-slate-500 block mb-1.5">粘贴链接（文章 / 视频页 / 公众号…）</label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) handleImport() }}
                placeholder="https://…"
                disabled={busy}
                inputMode="url"
                className="flex-1 min-w-0 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-slate-700 disabled:bg-slate-50"
              />
              <button
                onClick={handleImport}
                disabled={busy || !url.trim()}
                className="px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shrink-0 transition-all touch-feedback"
              >{busy ? '…' : '导入'}</button>
            </div>
          </div>

          {/* 分享待处理快捷选用（来源：系统分享 → growth_app_v1_share_inbox） */}
          {pendingItems.length > 0 && (
            <div>
              <div className="text-[11px] text-slate-500 mb-1.5">📥 分享待处理（点击选用）</div>
              <div className="flex flex-wrap gap-1.5">
                {pendingItems.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => handlePickPending(it)}
                    disabled={busy}
                    className={`max-w-full truncate text-[11px] px-2 py-1 rounded-lg border transition-all ${
                      selectedInboxId === it.id
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                        : 'border-slate-200 text-slate-600 hover:border-indigo-300'
                    }`}
                  >{String(it.content).slice(0, 28)}</button>
                ))}
              </div>
            </div>
          )}

          {/* 状态反馈：解析 → 拆解 → 入库 */}
          {(busy || stage === 'done' || stage === 'error') && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                {STEPS.map((s, i) => {
                  const stepDone = activeStepIndex > i
                  const active = activeStepIndex === i
                  return (
                    <React.Fragment key={s.key}>
                      {i > 0 && <div className={`flex-1 h-px mx-1 ${stepDone || active ? 'bg-indigo-300' : 'bg-slate-200'}`} />}
                      <div className="flex flex-col items-center gap-0.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                          stepDone ? 'bg-emerald-100 text-emerald-600'
                            : active ? 'bg-indigo-100 text-indigo-600 animate-pulse'
                            : 'bg-slate-100 text-slate-400'
                        }`}>{stepDone ? '✓' : s.icon}</div>
                        <span className={`text-[10px] ${active ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>{s.label}</span>
                      </div>
                    </React.Fragment>
                  )
                })}
              </div>
              <div className="text-center text-[11px] text-slate-500 mt-2">
                {stage === 'done'
                  ? `✅ 已入库 ${result?.nodes?.length ?? 0} 个知识节点`
                  : stage === 'error' ? '导入未完成' : `${STAGE_TEXT[stage] || ''}…`}
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {stage === 'error' && errInfo && (
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
              <div className="text-xs font-semibold text-rose-600">⚠️ {errInfo.title}</div>
              <div className="text-[11px] text-rose-400 mt-1 leading-relaxed">{errInfo.hint}</div>
              {!aiConfig?.apiKey && onOpenConfig && (
                <button
                  onClick={onOpenConfig}
                  className="mt-2 text-[11px] px-2.5 py-1 rounded-lg bg-rose-500 text-white font-semibold"
                >去配置 API Key</button>
              )}
            </div>
          )}

          {/* 结果列表 */}
          {stage === 'done' && result && (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-500">「{result.title}」拆出 {result.nodes.length} 个节点：</div>
              {result.nodes.map((n) => (
                <div key={n.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_MAP[n.category]?.color }} />
                    <span className="text-xs font-bold text-slate-700 truncate">{n.name}</span>
                    <span className="text-[9px] text-slate-400 shrink-0">{CATEGORY_MAP[n.category]?.name}</span>
                  </div>
                  {n.summary && <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{n.summary}</div>}
                  {n.keywords?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {n.keywords.map((k) => (
                        <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500">{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        {stage === 'done' && (
          <div className="px-4 py-3 border-t border-slate-100 flex gap-2 sticky bottom-0 bg-white rounded-b-2xl">
            <button
              onClick={resetAll}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
            >再导入一条</button>
            <button
              onClick={goGraph}
              className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600"
            >🧠 查看图谱</button>
          </div>
        )}
      </div>
    </div>
  )
}