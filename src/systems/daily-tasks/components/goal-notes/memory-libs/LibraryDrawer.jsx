import React, { useState, useRef } from 'react'
import { compressImage, parseTextToEntries, photosToEntries } from './memoryLibs.js'

/**
 * 记忆库抽屉（纯新增）
 * - 库列表：切换 / 删除（默认库内置不可删）
 * - 批量导入三步向导：选来源（聊天文本粘贴 / 相册照片）→ 选去处（当前库 / 新建库）→ 确认导入
 * - 演示模式下仅展示，导入功能禁用
 */

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function LibraryDrawer({ libs, currentId, defaultName = '横线本记忆', demo, onSelect, onDelete, onCommit, onClose }) {
  const [wizard, setWizard] = useState(null)      // null | 'text' | 'photo'
  const [step, setStep] = useState(1)             // 1 来源 → 2 去处 → 3 预览
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])          // [{ name, dataUrl }]
  const [target, setTarget] = useState('current') // 'current' | 'new'
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const uiBtn = 'px-3 py-1.5 rounded-lg text-[11px] font-medium backdrop-blur bg-black/45 text-amber-100/70 hover:text-amber-100 border border-amber-200/10 transition-colors'

  // ===== 导入提交 =====
  const commit = async () => {
    setErr('')
    setBusy(true)
    try {
      let entries = []
      if (wizard === 'text') {
        entries = parseTextToEntries(text, todayKey())
        if (!entries.length) { setErr('没有可导入的文字内容'); setBusy(false); return }
      } else {
        const dataUrls = []
        for (const f of files) dataUrls.push(await compressImage(f.file))
        entries = photosToEntries(dataUrls)
        if (!entries.length) { setErr('没有选择照片'); setBusy(false); return }
      }
      onCommit({
        targetId: target === 'current' ? currentId : null,
        newName: (newName || '').trim() || '新记忆库',
        entries,
      })
    } catch (e) {
      setErr((e && e.message) || '导入失败，请重试')
      setBusy(false)
    }
  }

  const onPickFiles = async (e) => {
    const list = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/')).slice(0, 30)
    if (!list.length) return
    setBusy(true)
    try {
      const picked = []
      for (const f of list) picked.push({ name: f.name, file: f })
      setFiles(picked)
    } finally { setBusy(false) }
  }

  const entryCount = wizard === 'text'
    ? parseTextToEntries(text, todayKey()).length
    : files.length

  return (
    <div className="fixed inset-0 z-[57] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[82vh] overflow-y-auto bg-[#101010]/95 border border-amber-200/15 rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-amber-100/90">📚 记忆库</div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-700/70 text-slate-300 text-xs flex items-center justify-center">✕</button>
        </div>

        {demo && (
          <div className="mb-3 text-[11px] text-amber-200/50 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            当前是演示模式——导入功能请在真实模式（地址去掉 ?gallerydemo）中使用
          </div>
        )}

        {/* ===== 库列表 ===== */}
        <div className="space-y-1.5 mb-3">
          <button
            onClick={() => { onSelect('lib-default'); onClose() }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${currentId === 'lib-default' ? 'bg-amber-500/15 border-amber-400/40' : 'bg-white/5 border-white/10 hover:border-amber-200/30'}`}
          >
            <span className="text-lg">📒</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-amber-50/90">{defaultName}（默认）</span>
              <span className="block text-[10px] text-amber-100/40">APP 内实时同步 · 不可删除</span>
            </span>
            {currentId === 'lib-default' && <span className="text-[10px] text-amber-300 shrink-0">当前</span>}
          </button>

          {libs.map(lib => (
            <div
              key={lib.id}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors ${currentId === lib.id ? 'bg-amber-500/15 border-amber-400/40' : 'bg-white/5 border-white/10'}`}
            >
              <button onClick={() => { onSelect(lib.id); onClose() }} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                <span className="text-lg shrink-0">{lib.icon || '✨'}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-amber-50/90 truncate">{lib.name}</span>
                  <span className="block text-[10px] text-amber-100/40">{(lib.entries || []).length} 条记忆</span>
                </span>
                {currentId === lib.id && <span className="text-[10px] text-amber-300 shrink-0">当前</span>}
              </button>
              <button
                onClick={() => { if (confirm(`删除记忆库「${lib.name}」？其导入内容将一并删除`)) { onDelete(lib.id) } }}
                className="w-7 h-7 shrink-0 rounded-lg bg-white/5 text-slate-400 text-[11px] hover:text-red-400"
                title="删除此库"
              >🗑</button>
            </div>
          ))}
        </div>

        {/* ===== 导入入口 / 向导 ===== */}
        {!wizard ? (
          <button
            onClick={() => { if (!demo) setWizard('menu') }}
            className={`w-full py-2.5 rounded-xl text-[12px] font-medium border ${demo ? 'bg-white/5 text-slate-500 border-white/10' : 'bg-amber-500/15 text-amber-200 border-amber-400/30 hover:bg-amber-500/25'}`}
          >＋ 批量导入到记忆库</button>
        ) : (
          <div className="rounded-xl border border-amber-200/15 bg-black/40 p-3.5">
            {/* 步骤指示 */}
            <div className="flex items-center gap-1.5 mb-3 text-[10px] text-amber-100/40">
              <span className={step === 1 ? 'text-amber-300' : ''}>① 来源</span><span>›</span>
              <span className={step === 2 ? 'text-amber-300' : ''}>② 去处</span><span>›</span>
              <span className={step === 3 ? 'text-amber-300' : ''}>③ 导入</span>
            </div>

            {step === 1 && (
              <div className="space-y-2">
                <button onClick={() => { setWizard('text'); setStep(2) }} className="w-full text-left px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[12px] text-amber-50/85 hover:border-amber-200/30">💬 聊天记录文本（粘贴导入）</button>
                <button onClick={() => { setWizard('photo'); setStep(2); setTimeout(() => fileRef.current && fileRef.current.click(), 50) }} className="w-full text-left px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[12px] text-amber-50/85 hover:border-amber-200/30">🖼 相册照片（批量选择）</button>
                <button onClick={() => setWizard(null)} className="w-full py-1.5 text-[11px] text-slate-500">取消</button>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { onPickFiles(e) }} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                {wizard === 'text' && (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={6}
                    placeholder={'粘贴聊天记录或任意文字…\n\n支持日期行自动分组，例如：\n2026-08-30 今天聊了…\n2026-08-31 昨天聊了…'}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/50 text-[12px] text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400/60"
                  />
                )}
                {wizard === 'photo' && (
                  <div className="text-[11px] text-amber-100/50">
                    已选择 <span className="text-amber-300">{files.length}</span> 张照片
                    <button onClick={() => fileRef.current && fileRef.current.click()} className="ml-2 underline hover:text-amber-200">重选</button>
                    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { onPickFiles(e) }} />
                  </div>
                )}

                {/* 去处选择 */}
                <div className="text-[11px] text-amber-100/50">导入到：</div>
                <button
                  onClick={() => setTarget('current')}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-[12px] ${target === 'current' ? 'bg-amber-500/15 border-amber-400/40 text-amber-100' : 'bg-white/5 border-white/10 text-slate-300'}`}
                >当前库（{currentId === 'lib-default' ? defaultName : (libs.find(l => l.id === currentId) || {}).name || '当前库'}）</button>
                <button
                  onClick={() => setTarget('new')}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-[12px] ${target === 'new' ? 'bg-amber-500/15 border-amber-400/40 text-amber-100' : 'bg-white/5 border-white/10 text-slate-300'}`}
                >创建新的记忆库</button>
                {target === 'new' && (
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="新库名称，例如：微信·和妈妈的聊天"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-600/50 text-[12px] text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400/60"
                  />
                )}

                {err && <div className="text-[11px] text-red-400">{err}</div>}
                <div className="flex gap-2 justify-end pt-1">
                  <button onClick={() => { setWizard(null); setErr(''); setText(''); setFiles([]); setStep(1) }} className="px-3 py-1.5 text-[11px] text-slate-500">取消</button>
                  <button
                    onClick={() => { if (wizard === 'photo' && !files.length) { setErr('请先选择照片'); return } if (target === 'new' && !(newName || '').trim()) { setErr('请填写新库名称'); return } setStep(3) }}
                    className="px-4 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/80 text-stone-900"
                  >下一步</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div className="text-[12px] text-amber-50/85">
                  即将导入 <span className="text-amber-300">{wizard === 'text' ? `${entryCount} 天的文字记忆` : `${files.length} 张照片`}</span>
                  {' '}到 <span className="text-amber-300">{target === 'current' ? '当前库' : `新库「${(newName || '').trim()}」`}</span>
                </div>
                {busy && <div className="text-[11px] text-amber-100/50">处理中…</div>}
                {err && <div className="text-[11px] text-red-400">{err}</div>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setStep(2)} disabled={busy} className="px-3 py-1.5 text-[11px] text-slate-500">上一步</button>
                  <button onClick={commit} disabled={busy} className="px-4 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/80 text-stone-900 disabled:opacity-50">确认导入</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 text-[10px] text-slate-600 leading-relaxed">
          提示：聊天记录支持日期行自动分组（如「2026-08-30 xxx」）；照片导入后会自动压缩存储。
        </div>
      </div>
    </div>
  )
}
