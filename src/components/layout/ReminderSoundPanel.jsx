import React, { useRef, useState } from 'react'
import { REMINDER_SOUNDS, getReminderSound, setReminderSound } from '../../services/reminderSound.js'
import { notifyNativeNow } from '../../utils/notify.js'

/**
 * 提醒铃声设置浮层（自包含，不依赖 ModalRoot）。
 * - 单选内置铃声；▶ 试听用网页 Audio 播放 /sounds/*.wav（快速预览音色）
 * - 「保存并试响」：持久化选择 + 立即发一条真实系统通知（用对应渠道铃声，真机效果即最终效果）
 */
export default function ReminderSoundPanel({ onClose }) {
  const [selected, setSelected] = useState(getReminderSound())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const audioRef = useRef(null)

  // 网页试听（快速预览音色；系统默认无内置文件，提示去真机试响）
  const preview = (s) => {
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      if (!s.file) return
      const a = new Audio(s.file)
      a.volume = 0.9
      audioRef.current = a
      a.play().catch(() => {})
    } catch (e) { /* 试听失败静默 */ }
  }

  const stopPreview = () => {
    try { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null } } catch (e) { /* ignore */ }
  }

  const saveAndRing = async () => {
    setBusy(true)
    setMsg('')
    stopPreview()
    try {
      setReminderSound(selected)
      const ok = await notifyNativeNow('🔔 铃声已更新', '这条通知用的就是新铃声（打卡/闹钟提醒同款）', selected)
      if (ok) {
        setMsg('✅ 已保存，试响通知已发出（留意铃声）')
        setTimeout(() => onClose(), 1200)
      } else {
        setMsg('⚠ 已保存，但试响通知未进入系统通知栏（可能被系统拦截），请到「🔔 自检」截图反馈')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={() => { stopPreview(); onClose() }}
    >
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold text-slate-800">🔔 提醒铃声</div>
          <button
            onClick={() => { stopPreview(); onClose() }}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center text-sm"
          >✕</button>
        </div>

        <div className="space-y-2 mb-4">
          {REMINDER_SOUNDS.map((s) => {
            const active = selected === s.key
            return (
              <div
                key={s.key}
                onClick={() => { setSelected(s.key); preview(s) }}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer touch-feedback transition-colors ${
                  active ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${active ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
                  {active && <span className="block w-1.5 h-1.5 bg-white rounded-full m-auto mt-[1px]" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{s.name}</span>
                  <span className="block text-[11px] text-slate-500">{s.desc}</span>
                </span>
                {s.file && (
                  <button
                    onClick={(e) => { e.stopPropagation(); preview(s) }}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-indigo-500 text-sm flex items-center justify-center shrink-0 hover:bg-indigo-50"
                    title="试听音色"
                  >▶</button>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={saveAndRing}
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-semibold touch-feedback transition-colors"
        >
          {busy ? '正在试响…' : '保存并试响（弹一条真实通知）'}
        </button>
        <div className="text-[11px] text-slate-400 mt-2 leading-relaxed">
          保存后立即生效，打卡 / 闹钟 / 番茄钟提醒都会使用新铃声。「试响」比「试听」更接近真实效果（走系统通知铃声）。
        </div>
        {msg && (
          <div className={`text-xs mt-2 p-2 rounded-lg leading-relaxed ${msg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}