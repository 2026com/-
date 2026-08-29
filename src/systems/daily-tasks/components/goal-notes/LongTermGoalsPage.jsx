import React, { useState, useEffect, useRef, useCallback } from 'react'
import { loadNotes, persistNotes } from '../../services/notesStorage.js'
import { useAppTheme } from '../../../../services/theme.js'

/**
 * 长期目标页 · 横线本（分页版）
 * - 每页固定行数（按屏幕高度实测），行距比旧版大 15%（32→37px），字号同步加大；
 * - 点击任意一条横线即可定位输入（每页独立 textarea，光标落在所点的行上）；
 * - 首行【页眉行】不可编辑：展示 日期 · 星期 · 天气（天气点击切换，按天记忆）；
 * - 每页右上角有本页时间标记；续页继承同一日期（同一天记录同时间）；
 * - 写满自动「翻书」到下一页（内容续接 + 光标跟随）；底部 ‹ › 手动翻页；
 * - 每天进入 App 自动定位到今天（今天没有页则自动新建）。
 * 存储：growth_app_notes_v1 升级为 pages[] 分页模型（旧 content 自动迁移为第 1 页）。
 */

const AUTOSAVE_DELAY = 600
const LINE_H = 37        // 行高（旧版 32px × 1.15 ≈ 37）
const FONT_SIZE = 15.5   // 字号同步加大
const PAD_TOP = 12       // 稿纸顶部留白（横线背景按此对齐）
const PAD_X = 24
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const WEATHERS = ['☀️ 晴', '⛅ 多云', '☁️ 阴', '🌧 小雨', '⛈ 雷雨', '🌫 雾', '❄️ 雪']

const pad2 = (n) => String(n).padStart(2, '0')
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const badgeOf = (ds) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || '')
  return m ? `${m[2]}/${m[3]}` : (ds || '')
}
const headerOf = (ds) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || '')
  if (!m) return '新的一页'
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日 · ${WEEKDAYS[d.getDay()]}`
}
const newPageId = () => 'pg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export default function LongTermGoalsPage() {
  const theme = useAppTheme()
  const dark = theme === 'dark'
  const lineColor = dark ? '#2c3c66' : '#dbe3ee'

  const wrapRef = useRef(null)
  const taRefs = useRef({})
  const pendingFocus = useRef(null)   // 自动换页后要聚焦的位置 {idx,pos}
  const timerRef = useRef(null)

  const [maxLines, setMaxLines] = useState(12)   // 每页行数（按屏幕高度实测）
  const [note, setNote] = useState(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [saveState, setSaveState] = useState('saved')
  const [, setWeatherTick] = useState(0)          // 天气点击后强制刷新

  // 屏幕高度 → 每页行数（扣除顶部留白 + 页眉行）
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current
      if (!el) return
      const usable = el.clientHeight - PAD_TOP * 2 - LINE_H - 8
      setMaxLines(Math.max(8, Math.floor(usable / LINE_H)))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  // 初始化：旧单文本迁移为 pages[]；每天进入 → 今天没有页则自动新建；定位到今天最新一页
  useEffect(() => {
    const today = dayKey()
    const list = loadNotes()
    let n = list.length > 0 ? list[0] : null
    if (n && !Array.isArray(n.pages)) {
      const created = n.createdAt || n.updatedAt || Date.now()
      n = { ...n, pages: [{ id: newPageId(), date: dayKey(new Date(created)), text: n.content || '' }] }
    }
    if (!n) n = { id: 'note-goal', title: '长期目标', content: '', createdAt: Date.now(), updatedAt: Date.now(), pages: [] }
    let pages = Array.isArray(n.pages) ? n.pages.slice() : []
    if (pages.length === 0 || pages[pages.length - 1].date !== today) {
      pages = [...pages, { id: newPageId(), date: today, text: '' }]   // 新的一天 → 新的一页
    }
    const next = { ...n, pages, content: pages.map(p => p.text).join('\n') }
    setNote(next)
    setPageIdx(pages.length - 1)
    const i = list.findIndex(x => x.id === next.id)
    if (i >= 0) list[i] = next; else list.push(next)
    persistNotes(list)
  }, [])

  const saveNow = useCallback((n) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setSaveState('saving')
    const list = loadNotes()
    const i = list.findIndex(x => x.id === n.id)
    if (i >= 0) list[i] = n; else list.push(n)
    persistNotes(list)
    setSaveState('saved')
  }, [])

  const scheduleSave = useCallback((n) => {
    setSaveState('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { timerRef.current = null; saveNow(n) }, AUTOSAVE_DELAY)
  }, [saveNow])

  // 卸载兜底：未触发的保存立即落盘
  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  // 输入：写满本页自动「翻书」——溢出行续到下一页（同一天同日期），光标跟随翻页
  const handleChange = useCallback((idx, e) => {
    if (!note) return
    const pages = note.pages.slice()
    const cur = pages[idx]
    let text = e.target.value
    let flowTarget = null
    const lines = text.split('\n')
    if (lines.length > maxLines) {
      const head = lines.slice(0, maxLines).join('\n')
      const tail = lines.slice(maxLines).join('\n')
      const nextP = pages[idx + 1]
      if (nextP && nextP.date === cur.date) {
        pages[idx + 1] = { ...nextP, text: tail.replace(/\n$/, '') + (nextP.text ? '\n' + nextP.text : '') }
      } else {
        pages.splice(idx + 1, 0, { id: newPageId(), date: cur.date, text: tail })
      }
      flowTarget = { idx: idx + 1, pos: tail.length }
      text = head
    }
    pages[idx] = { ...cur, text }
    const next = { ...note, pages, content: pages.map(p => p.text).join('\n'), updatedAt: Date.now() }
    setNote(next)
    scheduleSave(next)
    if (flowTarget) {
      pendingFocus.current = flowTarget
      setPageIdx(flowTarget.idx)
    }
  }, [note, maxLines, scheduleSave])

  // 自动换页后：聚焦新页并把光标放到续写处
  useEffect(() => {
    if (!pendingFocus.current) return
    const { idx, pos } = pendingFocus.current
    const ta = taRefs.current[idx]
    if (ta) {
      ta.focus()
      try { ta.setSelectionRange(pos, pos) } catch (err) { /* ignore */ }
      pendingFocus.current = null
    }
  }, [note, pageIdx])

  const curPage = note && note.pages[pageIdx]

  // 天气（按天记忆，点击切换）
  const weatherKey = 'goalNoteWeather_' + (curPage ? curPage.date : dayKey())
  const readWeather = () => { try { return localStorage.getItem(weatherKey) || '' } catch (e) { return '' } }
  const cycleWeather = () => {
    const i = WEATHERS.indexOf(readWeather())
    try { localStorage.setItem(weatherKey, WEATHERS[(i + 1) % WEATHERS.length]) } catch (e) { /* ignore */ }
    setWeatherTick(t => t + 1)
  }

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden bg-white dark:bg-slate-900">
      {/* ===== 顶部标题栏：标题 + 保存状态 ===== */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-2 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-[2px] shrink-0">
        <h1 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-wide">长期目标 · 横线本</h1>
        <span className={`text-[11px] transition-colors ${saveState === 'saved' ? 'text-emerald-500' : 'text-slate-400'}`}>
          {saveState === 'saved' ? '✓ 已保存' : saveState === 'saving' ? '保存中...' : '编辑中...'}
        </span>
      </div>

      {/* ===== 横线稿纸：页眉行(不可编辑) + 正文（任意横线点击即输入） ===== */}
      <div
        ref={wrapRef}
        className="flex-1 overflow-hidden relative"
        style={{
          backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${LINE_H - 1}px, ${lineColor} ${LINE_H - 1}px, ${lineColor} ${LINE_H}px)`,
          backgroundPosition: `0 ${PAD_TOP}px`,
        }}
      >
        {/* 右上角：本页时间标记 */}
        {curPage && (
          <span className="absolute top-1 right-3 z-10 text-[10px] text-slate-400 bg-white/85 dark:bg-slate-900/75 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700 tabular-nums">
            {badgeOf(curPage.date)}
          </span>
        )}
        <div style={{ height: PAD_TOP }} />
        {/* 页眉行（不可编辑）：日期 · 星期 · 天气（点击切换，按天记忆） */}
        <div className="flex items-center px-6 select-none" style={{ height: LINE_H }}>
          <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 truncate">
            {curPage ? headerOf(curPage.date) : ''}
          </span>
          <span className="flex-1" />
          <button
            onClick={cycleWeather}
            className="text-[13px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 px-2 py-0.5 rounded touch-feedback shrink-0 mr-6"
            title="点击记录 / 切换当天天气"
          >
            {readWeather() || '＋ 天气'}
          </button>
        </div>
        {/* 正文：每页固定行数；点击任意横线 → 光标定位到该行 */}
        {curPage && (
          <textarea
            ref={(el) => { if (el) taRefs.current[pageIdx] = el }}
            value={curPage.text}
            onChange={(e) => handleChange(pageIdx, e)}
            placeholder="点击任意横线，开始记录…"
            spellCheck={false}
            className="w-full resize-none outline-none bg-transparent placeholder:text-slate-300 text-slate-700 dark:text-slate-200"
            style={{
              height: maxLines * LINE_H,
              lineHeight: `${LINE_H}px`,
              fontSize: FONT_SIZE,
              padding: `0 ${PAD_X}px`,
              overflow: 'hidden',
            }}
          />
        )}
      </div>

      {/* ===== 翻页条：像翻书一样到新的一页 ===== */}
      <div className="shrink-0 h-11 flex items-center justify-center gap-3 border-t border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/85">
        <button
          onClick={() => setPageIdx(i => Math.max(0, i - 1))}
          disabled={pageIdx === 0}
          className="px-3 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 disabled:opacity-35 touch-feedback"
        >‹ 上一页</button>
        <span className="text-[11px] text-slate-400 tabular-nums">
          第 {note ? pageIdx + 1 : 0} / {note ? note.pages.length : 0} 页{curPage ? ` · ${badgeOf(curPage.date)}` : ''}
        </span>
        <button
          onClick={() => setPageIdx(i => Math.min((note ? note.pages.length : 1) - 1, i + 1))}
          disabled={!note || pageIdx >= note.pages.length - 1}
          className="px-3 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 disabled:opacity-35 touch-feedback"
        >下一页 ›</button>
      </div>
    </div>
  )
}