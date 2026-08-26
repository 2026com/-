import React, { useState, useEffect, useRef, useCallback } from 'react'
import { loadNotes, persistNotes, createNoteObj } from '../utils/notesStorage.js'

/**
 * 长期目标页 · 横线本形式
 * - 整页为横线稿纸：在任意横线上点击即可输入（textarea 铺满全页，点击即定位光标）
 * - 无"新建笔记"按钮、无列表；单本笔记本，存储 key 仍为 growth_app_notes_v1
 * - 输入后 600ms 自动保存；行高与横线背景间距严格一致（LINE_H）
 */

const AUTOSAVE_DELAY = 600
const LINE_H = 32          // 行高 = 横线间距（px），文字基线落在横线上方
const PAD_TOP = 16         // 稿纸顶部内边距（横线背景需按此偏移对齐）

export default function LongTermGoalsPage() {
  // 单本笔记：首次进入若无历史数据则为 null，首次输入时自动生成（无任何"新建"入口）
  const [note, setNote] = useState(() => {
    const list = loadNotes()
    return list.length > 0 ? list[0] : null
  })
  const [saveState, setSaveState] = useState('saved') // 'saved' | 'dirty' | 'saving'
  const timerRef = useRef(null)

  /** 立即落盘：把当前笔记合并回 growth_app_notes_v1 列表 */
  const saveNow = useCallback((n) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setSaveState('saving')
    const list = loadNotes()
    const i = list.findIndex(x => x.id === n.id)
    if (i >= 0) list[i] = n; else list.push(n)
    persistNotes(list)
    setSaveState('saved')
  }, [])

  /** 输入内容：更新本地 state + 调度自动保存 */
  const handleChange = useCallback((e) => {
    const base = note || createNoteObj('长期目标')   // 首次输入时静默创建，无"新建"动作
    const next = { ...base, content: e.target.value, updatedAt: Date.now() }
    setNote(next)
    setSaveState('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      saveNow(next)
    }, AUTOSAVE_DELAY)
  }, [note, saveNow])

  // 卸载兜底：清理未触发的保存定时器
  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden bg-white">
      {/* ===== 顶部标题栏（页面级）：标题 + 保存状态 ===== */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-2 border-b border-slate-200 bg-white/90 backdrop-blur-[2px] shrink-0">
        <h1 className="text-[15px] font-bold text-slate-800 tracking-wide">长期目标</h1>
        <span className={`text-[11px] transition-colors ${saveState === 'saved' ? 'text-emerald-500' : 'text-slate-400'}`}>
          {saveState === 'saved' ? '✓ 已保存' : saveState === 'saving' ? '保存中...' : '编辑中...'}
        </span>
      </div>

      {/* ===== 横线稿纸：整页可点击输入，文字落在横线上 ===== */}
      <textarea
        value={note?.content || ''}
        onChange={handleChange}
        placeholder="点击任意横线，开始记录你的长期目标…"
        spellCheck={false}
        className="flex-1 w-full resize-none outline-none bg-white placeholder:text-slate-300 text-slate-700"
        style={{
          lineHeight: `${LINE_H}px`,
          fontSize: '14px',
          padding: `${PAD_TOP}px 28px`,
          backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${LINE_H - 1}px, #dbe3ee ${LINE_H - 1}px, #dbe3ee ${LINE_H}px)`,
          backgroundAttachment: 'local',   // 横线随内容一起滚动
          backgroundPosition: `0px ${PAD_TOP}px`, // 横线与首行文字对齐
        }}
      />
    </div>
  )
}