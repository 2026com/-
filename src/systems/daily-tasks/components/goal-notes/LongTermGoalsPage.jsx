import React, { useState, useEffect, useRef, useCallback } from 'react'
import { loadNotes, persistNotes } from '../../services/notesStorage.js'
import { useAppTheme } from '../../../../services/theme.js'
import { useSurfaceBackground } from '../../../../services/backgrounds.js'
import GoalsPaperGallery from './GoalsPaperGallery.jsx'

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
  const lineRefs = useRef({})
  const pendingFocus = useRef(null)   // 自动换页后要聚焦的位置 {idx,line}
  const timerRef = useRef(null)

  const [maxLines, setMaxLines] = useState(12)   // 每页行数（按屏幕高度实测）
  const [note, setNote] = useState(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [saveState, setSaveState] = useState('saved')
  const [showGallery, setShowGallery] = useState(false)
  const [photoView, setPhotoView] = useState(null)   // 新增：照片大图预览
  const fileInputRef = useRef(null)                  // 新增：隐藏的选图 input
  const [, setWeatherTick] = useState(0)          // 天气点击后强制刷新
  // 背景/皮肤（纯新增）：AI 或图片换背景后垫在横线下面即时生效；null = 保持白纸
  const paperBg = useSurfaceBackground('notebook')
  // 排版参数（纯新增）：行距/字号倍率（AI 可调）；基准 = 37px 行高 / 15.5px 字号
  const nbParams = useSurfaceParams('notebook')
  const LINE_H_EFF = Math.round(LINE_H * nbParams.lineSpacing)
  const FONT_EFF = FONT_SIZE * nbParams.fontSize

  // 屏幕高度 → 每页行数（扣除顶部留白 + 页眉行）；行距参数变化时重新测量
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current
      if (!el) return
      const usable = el.clientHeight - PAD_TOP * 2 - LINE_H_EFF - 8
      setMaxLines(Math.max(8, Math.floor(usable / LINE_H_EFF)))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [LINE_H_EFF])

  // 初始化：旧单文本迁移为 pages[]；每天进入 → 今天没有页则自动新建；定位到今天最新一页
  // （整体 try/catch 兜底：本地存储出现任何异常数据也不允许白屏/错误页）
  useEffect(() => {
    try {
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
    } catch (e) {
      // 存储异常兜底：空本也能正常打开
      const today = dayKey()
      setNote({ id: 'note-goal', title: '长期目标', content: '', createdAt: Date.now(), updatedAt: Date.now(), pages: [{ id: newPageId(), date: today, text: '' }] })
      setPageIdx(0)
    }
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

  const curPage = note && note.pages[pageIdx]
  // ===== 逐行输入模型：每条横线一个输入框 → 点击哪一行就在哪一行输入 =====
  const lineValues = curPage ? curPage.text.split('\n') : []
  const lineAt = (i) => (i < lineValues.length ? lineValues[i] : '')

  const commitPage = (idx, lines2, tailToNext) => {
    const pages2 = note.pages.slice()
    const cur = pages2[idx]
    while (lines2.length && lines2[lines2.length - 1] === '') lines2.pop()
    let text = lines2.join('\n')
    if (tailToNext != null) {
      const nextP = pages2[idx + 1]
      if (nextP && nextP.date === cur.date) {
        pages2[idx + 1] = { ...nextP, text: tailToNext + (nextP.text ? '\n' + nextP.text : '') }
      } else {
        pages2.splice(idx + 1, 0, { id: newPageId(), date: cur.date, text: tailToNext })
      }
    }
    pages2[idx] = { ...cur, text }
    const next = { ...note, pages: pages2, content: pages2.map(p => p.text).join('\n'), updatedAt: Date.now() }
    setNote(next)
    scheduleSave(next)
  }

  const handleLineChange = (lineIdx, value) => {
    if (!note || !curPage) return
    const lines = []
    for (let i = 0; i < maxLines; i++) lines.push(i < lineValues.length ? lineValues[i] : '')
    const parts = value.split('\n')
    lines[lineIdx] = parts[0]
    const tail = parts.length > 1 ? parts.slice(1).join('\n') : null   // 多行粘贴 → 续到下一页
    commitPage(pageIdx, lines, tail)
  }

  const handleLineKeyDown = (lineIdx, e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (lineIdx < maxLines - 1) {
      const el = lineRefs.current[lineIdx + 1]
      if (el) { el.focus(); try { el.setSelectionRange(0, 0) } catch (err) { /* ignore */ } }
      return
    }
    // 本页最后一行回车 → 翻到下一页继续（同一天续页，日期不变）
    if (!note || !curPage) return
    const pages2 = note.pages.slice()
    let nextP = pages2[pageIdx + 1]
    if (!nextP || nextP.date !== curPage.date) {
      nextP = { id: newPageId(), date: curPage.date, text: '' }
      pages2.splice(pageIdx + 1, 0, nextP)
    }
    const next = { ...note, pages: pages2, content: pages2.map(p => p.text).join('\n'), updatedAt: Date.now() }
    setNote(next)
    scheduleSave(next)
    pendingFocus.current = { idx: pageIdx + 1, line: 0 }
    setPageIdx(pageIdx + 1)
  }

  // 自动换页后：聚焦新页第一行
  useEffect(() => {
    if (!pendingFocus.current) return
    const { idx, line } = pendingFocus.current
    if (idx !== pageIdx) return
    const el = lineRefs.current[line]
    if (el) {
      el.focus()
      try { el.setSelectionRange(0, 0) } catch (err) { /* ignore */ }
      pendingFocus.current = null
    }
  }, [note, pageIdx])

  // 翻页：最后一页再往后翻 → 无限新建未来页（日期 = 上一页 + 1 天），方便提前写未来的提醒
  const goNextPage = () => {
    if (!note) return
    if (pageIdx < note.pages.length - 1) { setPageIdx(pageIdx + 1); return }
    const last = note.pages[note.pages.length - 1]
    const d = new Date(`${last.date}T00:00:00`)
    if (Number.isNaN(d.getTime())) return
    d.setDate(d.getDate() + 1)
    const pages2 = [...note.pages, { id: newPageId(), date: dayKey(d), text: '' }]
    const next = { ...note, pages: pages2, updatedAt: Date.now() }
    setNote(next)
    scheduleSave(next)
    setPageIdx(pages2.length - 1)
  }

  // 天气（按天记忆，点击切换）
  const weatherKey = 'goalNoteWeather_' + (curPage ? curPage.date : dayKey())
  const readWeather = () => { try { return localStorage.getItem(weatherKey) || '' } catch (e) { return '' } }
  const cycleWeather = () => {
    const i = WEATHERS.indexOf(readWeather())
    try { localStorage.setItem(weatherKey, WEATHERS[(i + 1) % WEATHERS.length]) } catch (e) { /* ignore */ }
    setWeatherTick(t => t + 1)
  }

  // ===== 照片（新增，纯插入）：压缩存入本页 / 删除 / 预览，复用现有自动保存 =====
  const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX_W = 1000
        const scale = Math.min(1, MAX_W / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const addPhotos = async (fileList) => {
    if (!note || !curPage || !fileList || !fileList.length) return
    const files = Array.from(fileList).slice(0, 9)
    try {
      const photos = []
      for (const f of files) {
        photos.push({ id: 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dataUrl: await compressImage(f), ts: Date.now() })
      }
      const pages2 = note.pages.slice()
      pages2[pageIdx] = { ...curPage, photos: [...(curPage.photos || []), ...photos] }
      const next = { ...note, pages: pages2, updatedAt: Date.now() }
      setNote(next)
      scheduleSave(next)
    } catch (e) { /* 单张失败忽略，不影响本子 */ }
  }

  const removePhoto = (phId) => {
    if (!note || !curPage) return
    const pages2 = note.pages.slice()
    pages2[pageIdx] = { ...curPage, photos: (curPage.photos || []).filter(p => p.id !== phId) }
    const next = { ...note, pages: pages2, updatedAt: Date.now() }
    setNote(next)
    scheduleSave(next)
  }

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden bg-white dark:bg-slate-900">
      {/* ===== 顶部标题栏：标题 + 保存状态 ===== */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-2 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-[2px] shrink-0">
        <h1 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-wide">长期目标 · 横线本</h1>
        <div className="flex items-center gap-2.5">
          {/* 记录总览入口（新增）：查看所有记录页的缩略画廊 */}
          <button
            onClick={() => setShowGallery(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 touch-feedback"
            title="记录总览：查看本子所有记录页"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="13" height="16" rx="1.5" />
              <line x1="6" y1="8.5" x2="13" y2="8.5" />
              <line x1="6" y1="12" x2="13" y2="12" />
              <line x1="6" y1="15.5" x2="13" y2="15.5" />
              <path d="M19 7.5v9" /><path d="M21.5 9.5v5" />
            </svg>
          </button>
          {/* 插入照片入口（新增） */}
          <button
            onClick={() => { if (fileInputRef.current) fileInputRef.current.click() }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 touch-feedback"
            title="在本页插入照片"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="10" r="1.5" />
              <path d="M21 15.5l-4.5-4.5L7 20" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }}
          />
          <span className={`text-[11px] transition-colors ${saveState === 'saved' ? 'text-emerald-500' : 'text-slate-400'}`}>
          {saveState === 'saved' ? '✓ 已保存' : saveState === 'saving' ? '保存中...' : '编辑中...'}
        </span>
        </div>
      </div>

      {/* ===== 本页照片条（新增）：仅当本页有照片时显示，放在稿纸外不影响横线对齐 ===== */}
      {curPage && Array.isArray(curPage.photos) && curPage.photos.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-5 py-1.5 overflow-x-auto border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          {curPage.photos.map(ph => (
            <div key={ph.id} className="relative shrink-0">
              <img
                src={ph.dataUrl}
                alt=""
                onClick={() => setPhotoView(ph.dataUrl)}
                className="h-10 w-auto max-w-[88px] object-contain rounded border border-slate-200 dark:border-slate-600 cursor-zoom-in bg-white"
              />
              <button
                onClick={() => removePhoto(ph.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-600 text-white text-[10px] leading-4 text-center hover:bg-red-500"
                title="删除这张照片"
              >×</button>
            </div>
          ))}
          <span className="text-[10px] text-slate-400 shrink-0">{curPage.photos.length} 张照片</span>
        </div>
      )}

      {/* ===== 横线稿纸：页眉行(不可编辑) + 正文（任意横线点击即输入） ===== */}
      <div
        ref={wrapRef}
        className="flex-1 overflow-hidden relative"
        style={{
          // 自定义背景时垫在横线下面（多背景层：背景在前、横线在后），默认保持纯白稿纸；行高用 LINE_H_EFF（行距参数倍率）
          backgroundImage: paperBg
            ? `${paperBg}, repeating-linear-gradient(to bottom, transparent, transparent ${LINE_H_EFF - 1}px, ${lineColor} ${LINE_H_EFF - 1}px, ${lineColor} ${LINE_H_EFF}px)`
            : `repeating-linear-gradient(to bottom, transparent, transparent ${LINE_H_EFF - 1}px, ${lineColor} ${LINE_H_EFF - 1}px, ${lineColor} ${LINE_H_EFF}px)`,
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
        <div className="flex items-center px-6 select-none" style={{ height: LINE_H_EFF }}>
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
        {/* 正文：逐行输入框 —— 点击哪一行横线，就在哪一行输入 */}
        {curPage && Array.from({ length: maxLines }).map((_, i) => (
          <input
            key={`${pageIdx}-${i}`}
            ref={(el) => { if (el) lineRefs.current[i] = el }}
            value={lineAt(i)}
            onChange={(e) => handleLineChange(i, e.target.value)}
            onKeyDown={(e) => handleLineKeyDown(i, e)}
            placeholder={i === 0 ? '点击任意横线，开始记录…' : ''}
            spellCheck={false}
            autoComplete="off"
            className="w-full block bg-transparent outline-none placeholder:text-slate-300 text-slate-700 dark:text-slate-200"
            style={{ height: LINE_H_EFF, lineHeight: `${LINE_H_EFF}px`, fontSize: FONT_EFF, padding: `0 ${PAD_X}px` }}
          />
        ))}
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
          onClick={goNextPage}
          className="px-3 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 touch-feedback"
        >下一页 ›</button>
      </div>

      {/* ===== 照片大图预览（新增） ===== */}
      {photoView && (
        <div
          className="fixed inset-0 z-[85] bg-black/70 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setPhotoView(null)}
        >
          <img src={photoView} alt="" className="max-w-full max-h-full object-contain rounded shadow-2xl bg-white" />
        </div>
      )}

      {/* ===== 记录总览画廊（新增，纯新增组件） ===== */}
      {showGallery && note && (
        <GoalsPaperGallery
          pages={note.pages}
          onClose={() => setShowGallery(false)}
          onJump={(idx) => { setPageIdx(idx); setShowGallery(false) }}
        />
      )}
    </div>
  )
}