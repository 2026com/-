import React, { useState } from 'react'

/**
 * 公益模型候选列表二级弹窗（V2）
 * - 至少列出 4 家国内公益/免费可用模型占位
 * - 单选：点击卡片选中（高亮边框）
 * - 点击"立即启用" → 回调 onPick(preset) 把 baseUrl/modelId/apiKey/provider 写回 AIConfigPanel
 * - 若某个候选暂未提供 Key（apiKey === ''），启用时 AIConfigPanel 负责 Toast 提示"暂未开放密钥 · 将使用本地模板兜底"。
 */

// 公益候选清单（预置 4 款，后续可按需继续扩充）
// provider 字段取值与 PROVIDER_PRESETS key 保持一致（deepseek / qwen / glm / custom）
export const PUBLIC_MODEL_LIST = [
  {
    id: 'qwen-public',
    name: '通义千问 · Qwen-Plus 公益通道',
    vendor: '阿里巴巴 · 通义',
    icon: '🔆',
    desc: '中文理解强，响应稳定；适合日常对话、文案、知识问答。',
    speed: '⚡ 高速',
    quota: '💝 免费额度充足',
    provider: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelId: 'qwen-plus',
    apiKey: '' // 占位：用户暂未配置时走本地模板兜底
  },
  {
    id: 'glm-public',
    name: '智谱 · GLM-4-Flash',
    vendor: '智谱 AI',
    icon: '💎',
    desc: '轻量快速模型；适合短问答、打卡提醒、节点生成。',
    speed: '⚡⚡ 极速',
    quota: '💝 每日 10 万 token 免费',
    provider: 'glm',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-4-flash',
    apiKey: ''
  },
  {
    id: 'deepseek-public',
    name: 'DeepSeek Chat · 公开通道',
    vendor: 'DeepSeek',
    icon: '🧠',
    desc: '推理能力强劲；特别适合 AI 写执行方案、拆分子步骤。',
    speed: '⚡ 中速',
    quota: '💝 新用户送大量额度',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelId: 'deepseek-chat',
    apiKey: ''
  },
  {
    id: 'silicon-public',
    name: '硅基流动 · Qwen2.5-7B-Instruct',
    vendor: 'SiliconFlow 社区',
    icon: '🌱',
    desc: '开源模型 + 社区流量优惠；适合个人低流量使用。',
    speed: '⚡ 稳定',
    quota: '💝 每日免费额度',
    provider: 'custom',
    baseUrl: 'https://api.siliconflow.cn/v1',
    modelId: 'Qwen/Qwen2.5-7B-Instruct',
    apiKey: ''
  }
]

export default function PublicModelsModal({ dispatch, onPick, onClose }) {
  const [selectedId, setSelectedId] = useState(PUBLIC_MODEL_LIST[0]?.id || '')
  const selected = PUBLIC_MODEL_LIST.find(m => m.id === selectedId) || null

  const handleConfirm = () => {
    if (!selected) {
      dispatch && dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '⚠️ 请先选择一个公益模型' } })
      return
    }
    onPick && onPick(selected)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-white">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none">🎁</span>
            <div>
              <div className="text-base font-bold text-slate-800 leading-tight">公益模型选择</div>
              <div className="text-[11px] text-emerald-700/80 mt-0.5">选一个后点击"立即启用"即可直接开启 AI 能力</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/80 text-slate-500 hover:text-slate-800 flex items-center justify-center text-lg touch-feedback"
          >✕</button>
        </div>

        {/* 列表 */}
        <div className="px-4 py-3.5 space-y-2.5 max-h-[58vh] overflow-y-auto">
          {PUBLIC_MODEL_LIST.map(m => {
            const active = m.id === selectedId
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`w-full text-left p-3 rounded-2xl border transition-all touch-feedback group ${
                  active
                    ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-100 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xl ${active ? 'bg-white shadow-sm' : 'bg-slate-100 group-hover:bg-white'}`}>
                    {m.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-sm font-bold truncate ${active ? 'text-emerald-800' : 'text-slate-800'}`}>{m.name}</div>
                      {active && (
                        <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">已选择</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">厂商：{m.vendor}</div>
                    <div className="text-[11px] text-slate-600 mt-1 leading-snug">{m.desc}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{m.speed}</span>
                      <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{m.quota}</span>
                      {!m.apiKey && (
                        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                          ⚠️ 暂未内置密钥（将使用本地模板兜底）
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* 底部操作栏 */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500 leading-snug hidden sm:block">
            本服务仅写入您的浏览器 localStorage；<br />
            随时可切换回"自定义接入"或"默认模型"。
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 touch-feedback"
            >取消</button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-md shadow-emerald-200 disabled:shadow-none transition-all touch-feedback disabled:cursor-not-allowed whitespace-nowrap"
            >立即启用 ✅</button>
          </div>
        </div>
      </div>
    </div>
  )
}
