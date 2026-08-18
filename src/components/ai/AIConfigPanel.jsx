import React, { useState, useEffect } from 'react'
import PublicModelsModal from './PublicModelsModal.jsx'

/**
 * AI 模型 API 配置面板（V2 — 快速设置三档：默认模型 / 公益模型 / 自定义接入）
 *
 * V2 升级点：
 * 1. 顶部「快速设置」3 个 Pill 单选互斥，对标截图界面；
 * 2. 默认模型 = DeepSeek preset，等用户填 Key；
 * 3. 公益模型 = 字段灰态锁定，提供【获取公益模型】按钮 → 二级弹窗挑选后一键启用；
 * 4. 自定义接入 = 保留原 4 家 provider 卡片与手动填项 / 测试连接；
 * 5. 保存时统一写 state.aiConfig（含 mode 字段，下次打开自动回到对应 quickMode）。
 */

const PROVIDER_PRESETS = {
  deepseek: {
    label: 'DeepSeek',
    icon: '🧠',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hint: '在 platform.deepseek.com 申请，响应稳定，中文理解优秀'
  },
  qwen: {
    label: '通义千问（阿里）',
    icon: '🔆',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    hint: '阿里云百炼控制台 API-KEY'
  },
  glm: {
    label: '智谱AI（GLM）',
    icon: '💎',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    hint: 'open.bigmodel.cn 用户中心'
  },
  custom: {
    label: '自定义 OpenAI 兼容',
    icon: '🔌',
    baseUrl: '',
    model: '',
    hint: '支持任意 OpenAI /chat/completions 协议服务（如本地 Ollama 等）'
  }
}

const DEEPSEEK_PRESET = PROVIDER_PRESETS.deepseek

// 根据 aiConfig 推断应该在哪个 quickMode
function inferQuickMode(aiConfig) {
  if (aiConfig && aiConfig.mode === 'public') return 'public'
  if (aiConfig && aiConfig.mode === 'custom') return 'custom'
  if (aiConfig && aiConfig.mode === 'default') return 'default'
  // 没有 mode 字段：根据 provider 猜
  if (aiConfig && aiConfig.provider === 'custom') return 'custom'
  // 默认：回到 default
  return 'default'
}

export default function AIConfigPanel({ open, onClose, dispatch, aiConfig }) {
  const [form, setForm] = useState({
    quickMode: 'default',          // 'default' | 'public' | 'custom'
    provider: 'deepseek',
    baseUrl: DEEPSEEK_PRESET.baseUrl,
    modelId: DEEPSEEK_PRESET.model,
    apiKey: ''
  })
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [publicModalOpen, setPublicModalOpen] = useState(false)

  // 打开时同步当前配置到表单；根据 aiConfig.mode 智能选中快速档位
  useEffect(() => {
    if (open) {
      const mode = inferQuickMode(aiConfig)
      const baseUrl = aiConfig?.baseUrl || DEEPSEEK_PRESET.baseUrl
      const modelId = aiConfig?.modelId || DEEPSEEK_PRESET.model
      const provider = aiConfig?.provider || 'deepseek'
      const apiKey = aiConfig?.apiKey || ''
      setForm({ quickMode: mode, provider, baseUrl, modelId, apiKey })
      setShowKey(false)
      setTesting(false)
      setPublicModalOpen(false)
    }
  }, [open, aiConfig])

  if (!open) return null

  const isPublic = form.quickMode === 'public'
  const isDefault = form.quickMode === 'default'
  const isCustom = form.quickMode === 'custom'

  // 三档 Pill 切换
  const setQuickMode = (mode) => {
    setForm(prev => {
      if (mode === 'default') {
        return {
          ...prev,
          quickMode: 'default',
          provider: 'deepseek',
          baseUrl: DEEPSEEK_PRESET.baseUrl,
          modelId: DEEPSEEK_PRESET.model,
          // 默认模型模式保留用户已填的 DeepSeek Key（若此前存在），否则空
          apiKey: (prev.provider === 'deepseek' || !prev.apiKey) ? prev.apiKey : prev.apiKey
        }
      }
      if (mode === 'public') {
        return { ...prev, quickMode: 'public' } // 保持现有值，等用户从"获取公益模型"中覆盖
      }
      if (mode === 'custom') {
        // 进入自定义接入时，若无 provider，回退到 deepseek preset；否则保持当前
        return {
          ...prev,
          quickMode: 'custom',
          provider: prev.provider || 'deepseek',
          baseUrl: prev.baseUrl || DEEPSEEK_PRESET.baseUrl,
          modelId: prev.modelId || DEEPSEEK_PRESET.model,
        }
      }
      return prev
    })
  }

  // 仅在自定义模式才响应 provider 4 卡切换
  const handleProviderChange = (p) => {
    if (!isCustom) return
    const preset = PROVIDER_PRESETS[p] || DEEPSEEK_PRESET
    setForm(prev => ({
      ...prev,
      provider: p,
      // 仅当值是旧 provider preset 默认值时才自动替换（否则保留用户自定义）
      baseUrl: (prev.baseUrl === (PROVIDER_PRESETS[prev.provider]?.baseUrl || '') || !prev.baseUrl)
        ? preset.baseUrl
        : prev.baseUrl,
      modelId: (prev.modelId === (PROVIDER_PRESETS[prev.provider]?.model || '') || !prev.modelId)
        ? preset.model
        : prev.modelId
    }))
  }

  // 公益模型选择 → 写回表单并 toast（保存需要用户点"保存配置"落盘 localStorage）
  const handleSelectPublic = (preset) => {
    if (!preset) return
    setForm(prev => ({
      ...prev,
      quickMode: 'public',
      provider: preset.provider,
      baseUrl: preset.baseUrl,
      modelId: preset.modelId,
      apiKey: preset.apiKey || ''
    }))
    setPublicModalOpen(false)
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'toast',
        message: (preset.apiKey ? '✅ 已选择公益模型：' : '⚠️ 当前模型暂未开放密钥，将使用本地模板兜底：') + preset.name
      }
    })
  }

  const canSave = form.baseUrl && /^https?:\/\//.test(form.baseUrl) && form.modelId

  const handleSave = () => {
    if (!canSave) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ Base URL 必须以 http(s):// 开头，且 Model ID 不能为空' } })
      return
    }
    dispatch({
      type: 'UPDATE_AI_CONFIG',
      payload: {
        mode: form.quickMode,
        provider: form.provider,
        baseUrl: form.baseUrl.trim(),
        modelId: form.modelId.trim(),
        apiKey: form.apiKey.trim()
      }
    })
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 配置已保存到浏览器本地' } })
    onClose && onClose()
  }

  const handleTest = async () => {
    if (!canSave || !form.apiKey) {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 请先填写完整配置（含 API Key）再测试' } })
      return
    }
    setTesting(true)
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      const resp = await fetch(`${form.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${form.apiKey.trim()}`
        },
        body: JSON.stringify({
          model: form.modelId.trim(),
          messages: [{ role: 'user', content: 'Ping，请回复 Pong（一个词即可）' }],
          max_tokens: 10
        }),
        signal: ctrl.signal
      })
      clearTimeout(timer)
      if (resp.ok) {
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ 连接成功：${form.modelId}` } })
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

  const QUICK_OPTIONS = [
    { key: 'default', label: '默认模型', icon: '🌟', hint: 'DeepSeek' },
    { key: 'public',  label: '公益模型', icon: '🎁', hint: '零门槛直接用' },
    { key: 'custom',  label: '自定义接入', icon: '🔧', hint: '手动填 Key' },
  ]

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}
      >
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
        <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
          {/* 顶栏 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl leading-none">⚙️</span>
              <div>
                <div className="text-base font-bold text-slate-800 leading-tight">AI 模型配置</div>
                <div className="text-[11px] text-slate-400 mt-0.5">密钥保存在浏览器本地，不会上传任何服务器</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center text-lg touch-feedback"
            >✕</button>
          </div>

          <div className="px-5 py-5 space-y-4 max-h-[72vh] overflow-y-auto">
            {/* ====== V2 新增：快速设置三档 Pill ====== */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2.5 tracking-wide">快速设置</label>
              <div className="grid grid-cols-3 gap-2">
                {QUICK_OPTIONS.map(opt => {
                  const active = form.quickMode === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setQuickMode(opt.key)}
                      className={`relative p-3 rounded-2xl border transition-all touch-feedback text-left ${
                        active
                          ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-100 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-500" aria-hidden />
                      )}
                      <div className={`text-xl leading-none mb-1 ${active ? '' : 'opacity-80'}`}>{opt.icon}</div>
                      <div className={`text-sm font-bold leading-tight ${active ? 'text-indigo-700' : 'text-slate-700'}`}>{opt.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1 leading-tight">{opt.hint}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ====== 公益模式下专属：获取按钮 + 当前配置摘要 ====== */}
            {isPublic && (
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">🎁</span>
                    <div>
                      <div className="text-sm font-bold text-emerald-800 leading-tight">公益模型 · 零配置</div>
                      <div className="text-[11px] text-emerald-700/80 mt-0.5">无需手动填 Key，点击右侧按钮选择即可启用</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPublicModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-200 touch-feedback whitespace-nowrap"
                  >🎁 获取公益模型</button>
                </div>
                {form.modelId && (
                  <div className="bg-white/70 rounded-xl px-3 py-2 text-[11px] text-slate-500 border border-emerald-100 leading-relaxed">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">当前启用：</span>
                      <span className="text-emerald-700 font-bold">{form.modelId}</span>
                    </div>
                    <div className="mt-0.5">Base URL：<span className="font-mono">{form.baseUrl || '—'}</span></div>
                  </div>
                )}
              </div>
            )}

            {/* ====== 默认模式下专属：DeepSeek 指引 ====== */}
            {isDefault && (
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-3.5 text-[11px] text-indigo-800/90 leading-relaxed">
                <div className="font-bold text-sm mb-1 text-indigo-800">🌟 默认模型 · DeepSeek Chat</div>
                · 个人免费额度充足，适合日常对话 / 执行方案生成<br />
                · 请在下方 <span className="font-mono bg-white/80 px-1 rounded border border-indigo-100">API Key</span> 粘贴您的密钥；申请地址：
                <a className="underline hover:text-indigo-600 font-medium" href="https://platform.deepseek.com/api-keys" target="_blank" rel="noreferrer"> platform.deepseek.com </a>
              </div>
            )}

            {/* ====== 自定义：Provider 选择（仅在 custom 模式显示） ====== */}
            {isCustom && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">服务商 / 模型协议</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PROVIDER_PRESETS).map(([key, p]) => {
                    const active = form.provider === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleProviderChange(key)}
                        className={`text-left px-3 py-2.5 rounded-xl border transition-all touch-feedback ${
                          active
                            ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg leading-none">{p.icon}</span>
                          <span className={`text-sm font-semibold ${active ? 'text-indigo-700' : 'text-slate-700'}`}>{p.label}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="text-[11px] text-slate-400 mt-2 leading-relaxed px-0.5">
                  💡 {PROVIDER_PRESETS[form.provider]?.hint}
                </div>
              </div>
            )}

            {/* ====== 通用三字段：根据 quickMode 决定是否锁定 ====== */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Base URL（兼容 /chat/completions 端点）</label>
              <input
                type="text"
                value={form.baseUrl}
                onChange={(e) => isPublic ? null : setForm(f => ({ ...f, baseUrl: e.target.value }))}
                disabled={isPublic}
                placeholder="https://api.deepseek.com/v1"
                className={`w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all text-sm placeholder-slate-400 ${
                  isPublic
                    ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed focus:ring-0'
                    : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 text-slate-700'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Model ID（模型名称）</label>
              <input
                type="text"
                value={form.modelId}
                onChange={(e) => isPublic ? null : setForm(f => ({ ...f, modelId: e.target.value }))}
                disabled={isPublic}
                placeholder="deepseek-chat / qwen-plus / glm-4-flash ..."
                className={`w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all text-sm placeholder-slate-400 ${
                  isPublic
                    ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed focus:ring-0'
                    : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 text-slate-700'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
                <span>API Key</span>
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className={`text-[10px] font-medium touch-feedback ${isPublic ? 'text-slate-400 cursor-not-allowed' : 'text-indigo-500 hover:text-indigo-600'}`}
                  disabled={isPublic}
                >{showKey ? '🙈 隐藏' : '👁 显示'}</button>
              </label>
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => isPublic ? null : setForm(f => ({ ...f, apiKey: e.target.value }))}
                disabled={isPublic}
                placeholder={isPublic ? '公益模式：由所选模型自动提供' : 'sk-xxxxxxxxxxxxxxxx'}
                autoComplete="off"
                className={`w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all text-sm placeholder-slate-400 font-mono ${
                  isPublic
                    ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed focus:ring-0'
                    : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 text-slate-700'
                }`}
              />
              <div className={`mt-1.5 leading-relaxed flex items-start gap-1.5 text-[10px] ${
                isPublic ? 'text-slate-400' : 'text-amber-600'
              }`}>
                <span>🔒</span>
                <span>{isPublic
                  ? '公益模式下密钥由所选模型自动下发，无需手动填写。'
                  : '密钥仅保存在此浏览器 localStorage 中，清除浏览器数据会一并删除。请勿提交至代码仓库。'
                }</span>
              </div>
            </div>

            {/* 版本说明 */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
              <div className="font-semibold text-slate-600 mb-1">📘 本套配置同时供给两处 AI 能力使用</div>
              · 侧边栏 AI 对话（普通问答）<br />
              · 节点弹窗「✍️ AI 写执行方案」（生成树状父子任务节点）<br />
              <span className="font-medium text-slate-700">即使不配置 Key，整套系统仍可 100% 完整手动使用</span>，AI 仅做锦上添花。
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
            <button
              onClick={handleTest}
              disabled={testing || isPublic || !form.apiKey || !canSave}
              className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 touch-feedback ${
                (testing || isPublic || !form.apiKey || !canSave)
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title={isPublic ? '公益模式无需手动测试连接' : '测试与当前配置模型的连通性'}
            >
              {testing ? '⏳ 测试中...' : '🧪 测试连接'}
            </button>
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

      {/* 二级弹窗：公益模型候选列表 */}
      {publicModalOpen && (
        <PublicModelsModal
          dispatch={dispatch}
          onPick={handleSelectPublic}
          onClose={() => setPublicModalOpen(false)}
        />
      )}
    </>
  )
}
