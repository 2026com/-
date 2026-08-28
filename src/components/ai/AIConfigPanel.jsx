import React, { useState, useEffect } from 'react'

/**
 * 接入 AI 大模型 · 配置面板 V3（简洁单列表单）
 * ----------------------------------------------------------------------------
 * - 支持任意 OpenAI 兼容服务（DeepSeek / 通义千问 / 智谱 GLM / 本地 Ollama 等）
 * - 快捷预设：点击自动填充 Base URL 与模型 ID，再补一个 API 密钥即可使用
 * - 密钥仅存储在本设备（IndexedDB），仅用于从本应用直接向服务商发起请求
 * - 本配置同时供给三处 AI 能力：
 *     ① AI 助手对话  ② 节点「AI 写执行方案」  ③ 添加知识 · 内容拆解
 */

const PRESETS = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'glm', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { id: 'custom', label: '自定义', baseUrl: '', model: '' },
]

const MODEL_SUGGESTIONS = [
  'deepseek-chat', 'deepseek-reasoner',
  'qwen-plus', 'qwen-max',
  'glm-4-flash', 'glm-4-plus',
]

export default function AIConfigPanel({ open, onClose, dispatch, aiConfig }) {
  const [form, setForm] = useState({
    provider: 'deepseek',
    baseUrl: PRESETS[0].baseUrl,
    modelId: PRESETS[0].model,
    apiKey: '',
  })
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)

  // 打开时同步当前配置到表单
  useEffect(() => {
    if (!open) return
    setForm({
      provider: aiConfig?.provider || 'deepseek',
      baseUrl: aiConfig?.baseUrl || PRESETS[0].baseUrl,
      modelId: aiConfig?.modelId || PRESETS[0].model,
      apiKey: aiConfig?.apiKey || '',
    })
    setShowKey(false)
    setTesting(false)
  }, [open, aiConfig])

  if (!open) return null

  // 快捷预设：填充服务商与地址/模型（保留已输入的密钥）
  const applyPreset = (id) => {
    const p = PRESETS.find(x => x.id === id)
    if (!p) return
    setForm(prev => ({
      ...prev,
      provider: p.id,
      baseUrl: p.baseUrl || prev.baseUrl,
      modelId: p.model || prev.modelId,
    }))
  }

  const canSave = /^https?:\/\//.test(form.baseUrl.trim()) && form.modelId.trim()

  const handleSave = () => {
    if (!canSave) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 基础 URL 需以 http(s):// 开头，且模型 ID 不能为空' } })
      return
    }
    dispatch({
      type: 'UPDATE_AI_CONFIG',
      payload: {
        mode: 'custom',
        provider: form.provider,
        baseUrl: form.baseUrl.trim(),
        modelId: form.modelId.trim(),
        apiKey: form.apiKey.trim(),
      },
    })
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 配置已保存到本设备' } })
    onClose && onClose()
  }

  const handleTest = async () => {
    if (!form.apiKey.trim()) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 请先填写 API 密钥再测试' } })
      return
    }
    setTesting(true)
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      const resp = await fetch(`${form.baseUrl.trim()}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${form.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: form.modelId.trim(),
          messages: [{ role: 'user', content: 'Ping，请回复 Pong' }],
          max_tokens: 10,
        }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (resp.ok) {
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ 连接成功：${form.modelId.trim()}` } })
      } else {
        const errText = await resp.text().catch(() => '')
        throw new Error(`HTTP ${resp.status} ${errText.slice(0, 60)}`)
      }
    } catch (e) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `❌ 连接失败：${e.message || '未知错误'}` } })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose() }}
    >
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none">🔌</span>
            <div>
              <div className="text-base font-bold text-slate-800 leading-tight">接入 AI 大模型</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {aiConfig?.apiKey ? `✅ 已接入 · ${aiConfig.provider || 'openai 兼容'}` : '未接入 · 填写下方配置即可启用 AI'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center text-lg touch-feedback"
          >✕</button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[68vh] overflow-y-auto">
          {/* 1. 快捷预设 */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-2 tracking-wide">① 选择服务商（自动填充地址与模型）</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all touch-feedback ${
                    form.provider === p.id
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-600 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:border-indigo-300'
                  }`}
                >{p.label}</button>
              ))}
            </div>
          </div>

          {/* 2. 基础 URL */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 tracking-wide">② 基础 URL</label>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm(f => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.deepseek.com/v1"
              inputMode="url"
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-slate-700 placeholder-slate-400"
            />
          </div>

          {/* 3. API 密钥 */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 tracking-wide">③ API 密钥</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-xxxxxxxxxxxxxxxx"
                autoComplete="off"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-slate-700 placeholder-slate-400 font-mono"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="px-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs shrink-0 touch-feedback"
                title={showKey ? '隐藏密钥' : '显示密钥'}
              >{showKey ? '🙈' : '👁'}</button>
            </div>
            <div className="mt-1.5 text-[10px] text-slate-400 flex items-start gap-1.5">
              <span>🔒</span>
              <span>密钥仅存储在本设备，仅用于从本应用直接向服务商发起请求，不会经过任何第三方服务器。</span>
            </div>
          </div>

          {/* 4. 模型 ID */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 tracking-wide">④ 模型 ID</label>
            <input
              value={form.modelId}
              onChange={(e) => setForm(f => ({ ...f, modelId: e.target.value }))}
              placeholder="deepseek-chat"
              list="ai-model-suggestions"
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-slate-700 placeholder-slate-400"
            />
            <datalist id="ai-model-suggestions">
              {MODEL_SUGGESTIONS.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>

          {/* 用途说明 */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
            <div className="font-semibold text-slate-600 mb-1">📘 本配置同时供给三处 AI 能力</div>
            · AI 助手对话<br />
            · 节点「AI 写执行方案」<br />
            · 添加知识 · 网页内容拆解<br />
            <span className="font-medium text-slate-600">不配置也 100% 可手动使用全部功能</span>，AI 只是锦上添花。
          </div>
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
          <button
            onClick={handleTest}
            disabled={testing || !canSave || !form.apiKey}
            className={`px-4 py-2 rounded-xl text-sm font-semibold touch-feedback ${
              (testing || !canSave || !form.apiKey)
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="向当前配置的服务商发送一条测试消息"
          >{testing ? '⏳ 测试中…' : '🧪 测试连接'}</button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 touch-feedback"
            >取消</button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-md shadow-indigo-200 disabled:shadow-none transition-all touch-feedback disabled:cursor-not-allowed"
            >保存配置</button>
          </div>
        </div>
      </div>
    </div>
  )
}