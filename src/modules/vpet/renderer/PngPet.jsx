import { useEffect, useRef, useState } from 'react'
import { getPetDirector } from '../singleton.js'
import { petReactToReply, petThinking } from '../petReact.js'
import { startIdleSystem } from '../idleSystem.js'
import { buildContextMessages } from '../../ai-assistant/services/conversationManager.js'
import { chatCompletion } from '../../ai-assistant/services/aiClient.js'
import { uid } from '../../../services/storage.js'
import { useAppState, useAppDispatch } from '../../../context/AppContext.jsx'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

/**
 * 虚拟桌宠 · PNG 纸片人渲染器（路径B + 交互版）
 *
 * 渲染：Director 参数 → 整图变换（头身角度/呼吸）+ 整图变体交换（眨眼/张嘴）；
 * 交互（interactive=true，默认开）：
 *  - 按住拖动换位置（位置记忆 localStorage）；
 *  - 双击 → 语音输入（Web Speech API；不支持的环境气泡提示）；
 *  - 语音/对话回复在桌宠旁的气泡里展示——不展开 AI 对话界面也能对话；
 *  - 气泡 8 秒自动消失，点气泡可立即关闭。
 * 表演：与 ChatInterface 共享 petReact（petReact.js），全应用同一套反应逻辑。
 */
export function PngPet({
  images = {},             // { base: 必填, blink?: 闭眼变体, mouthOpen?: 张嘴变体 }
  size = 110,
  director = null,
  style = {},
  debugExpose = false,
  interactive = true,      // 拖动 + 双击语音 + 气泡
}) {
  const dispatch = useAppDispatch()
  const state = useAppState()
  const aiConfig = state.aiConfig
  const dRef = useRef(null)
  if (!dRef.current) dRef.current = director || getPetDirector()
  const directorRef = dRef.current
  const imgRef = useRef(null)
  const imagesRef = useRef(images)
  imagesRef.current = images

  // ===== 位置记忆 =====
  const POS_KEY = 'vpet.position.v1'
  const [pos, setPos] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
      if (v && typeof v.x === 'number' && typeof v.y === 'number') return v
    } catch (e) { /* ignore */ }
    return null   // null = 默认左下角（由 style 给出），首次拖动时换算为坐标
  })
  const wrapRef = useRef(null)
  const posRef = useRef(pos)
  posRef.current = pos

  // ===== 拖动 + 双击 =====
  const dragRef = useRef({ on: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 })
  const lastTapRef = useRef(0)
  const lastPatRef = useRef(0)   // 摸头反应冷却
  const onPointerDown = (e) => {
    if (!interactive) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
    const rect = wrapRef.current?.getBoundingClientRect()
    const cur = pos || (rect ? { x: rect.left, y: rect.top } : { x: 10, y: window.innerHeight - size - 80 })
    setPos(cur)
    dragRef.current = { on: true, moved: false, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d.on) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 6) d.moved = true
    if (!d.moved) return
    const nx = Math.min(window.innerWidth - size - 4, Math.max(4, d.ox + dx))
    const ny = Math.min(window.innerHeight - size - 4, Math.max(4, d.oy + dy))
    posRef.current = { x: nx, y: ny }   // 同步镜像：pointerup 里保存的就是最新位置
    setPos({ x: nx, y: ny })
  }
  const onPointerUp = () => {
    const d = dragRef.current
    if (!d.on) return
    d.on = false
    if (d.moved) {
      try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)) } catch (e) { /* ignore */ }
      return
    }
    // 听的过程中：单击即停止听（不需要双击）
    if (listening) {
      lastTapRef.current = 0
      toggleVoice()
      return
    }
    // 未在听：300ms 内两次点按 → 双击 → 语音输入开关；单击 → 摸头小反应（4 秒冷却）
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0
      toggleVoice()
    } else {
      lastTapRef.current = now
      if (now - lastPatRef.current > 4000) {
        lastPatRef.current = now
        try { getPetDirector().submit({ type: 'emote', name: 'happy', durationMs: 900, params: { intensity: 0.6 } }) } catch (e) { /* ignore */ }
      }
    }
  }

  // ===== 语音输入：原生(APK)走 @capacitor-community/speech-recognition 插件；网页走 Web Speech API =====
  const [listening, setListening] = useState(false)
  const recogRef = useRef(null)
  const nativeListenerRef = useRef(null)
  const toggleVoice = async () => {
    if (listening) {
      // 停止：原生先 stop 插件，网页停 Web SR
      if (Capacitor.isNativePlatform()) {
        try { await SpeechRecognition.stop() } catch (e) { /* ignore */ }
        try { (await nativeListenerRef.current)?.remove?.() } catch (e) { /* ignore */ }
        nativeListenerRef.current = null
      } else {
        try { recogRef.current?.stop() } catch (e) { /* ignore */ }
      }
      setListening(false)
      return
    }
    // ===== 原生分支（APK） =====
    if (Capacitor.isNativePlatform()) {
      try {
        const { available } = await SpeechRecognition.available()
        if (!available) {
          showBubble('这台手机缺少语音识别服务（部分国产手机未预装 Google 服务），可改用键盘输入')
          return
        }
        const perm = await SpeechRecognition.checkPermissions()
        if (perm.speechRecognition !== 'granted' || perm.microphone !== 'granted') {
          const req = await SpeechRecognition.requestPermissions({ permissions: ['microphone', 'speechRecognition'] })
          if (req.microphone !== 'granted' && req.speechRecognition !== 'granted') {
            showBubble('麦克风/语音权限被拒绝，无法听你说话')
            return
          }
        }
        if (nativeListenerRef.current) { try { (await nativeListenerRef.current)?.remove?.() } catch (e) { /* ignore */ } }
        nativeListenerRef.current = await SpeechRecognition.addListener('partialResults', async (data) => {
          const matches = data?.matches || []
          const text = String(matches[matches.length - 1] || '').trim()
          if (text) {
            setListening(false)
            try { SpeechRecognition.stop() } catch (e) { /* ignore */ }
            try { (await nativeListenerRef.current)?.remove?.() } catch (e) { /* ignore */ }
            nativeListenerRef.current = null
            sendToAI(text)
          }
        })
        await SpeechRecognition.start({ locale: 'zh-CN', maxMatches: 1, popup: true, partialResults: true })
        setListening(true)
        showBubble('🎤 在听…再点一下桌宠可停止')
      } catch (e) {
        showBubble('语音识别启动失败：' + String(e?.message || e).slice(0, 40))
        setListening(false)
      }
      return
    }
    // ===== 网页分支 =====
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { showBubble('当前环境不支持语音识别（需 Chrome/Edge 或系统支持）'); return }
    try {
      const rec = new SR()
      rec.lang = 'zh-CN'
      rec.interimResults = false
      rec.maxAlternatives = 1
      let got = false   // 本次是否识别到了内容
      rec.onresult = (ev) => {
        const text = ev.results?.[0]?.[0]?.transcript?.trim()
        if (text) { got = true; sendToAI(text) }
      }
      rec.onerror = (ev) => {
        const map = {
          network: '语音识别需要联网（当前网络无法访问语音服务）',
          'not-allowed': '麦克风权限被拒绝，请在浏览器设置里允许',
          'service-not-allowed': '当前环境没有可用的语音服务',
        }
        if (ev.error !== 'aborted') showBubble(map[ev.error] || `语音识别出错：${ev.error}`)
      }
      rec.onend = () => {
        setListening(false)
        if (!got) showBubble('没听清，请再双击桌宠试一次', 4000)
      }
      recogRef.current = rec
      rec.start()
      setListening(true)
      showBubble('🎤 在听…再点一下桌宠可停止')
    } catch (e) {
      showBubble('语音识别启动失败')
      setListening(false)
    }
  }

  // 气泡翻转：桌宠位于屏幕顶部区域（top < 170px）时气泡放到下方，避免出屏/遮挡
  const bubbleBelow = interactive && pos != null && pos.y < 170

  // 气泡 =====
  const [bubble, setBubble] = useState(null) // { text, ts }
  const bubbleTimer = useRef(null)
  const showBubble = (text, autoHideMs = 8000) => {
    setBubble({ text, ts: Date.now() })
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(null), autoHideMs)
  }

  // ===== 语音 → AI 对话（不开对话界面也能聊；历史与 AI 对话界面互通） =====
  const [aiBusy, setAiBusy] = useState(false)
  const sendToAI = async (text) => {
    if (!text || aiBusy) return
    showBubble(`你：${text}`, 4000)
    dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: { id: uid('msg'), role: 'user', content: text, createdAt: Date.now() } } })
    petThinking()
    setAiBusy(true)
    try {
      if (!aiConfig?.apiKey) {
        const tip = '⚙️ 还没有配置 API Key，我暂时说不了话。展开 AI 对话 → ⚙️ 里填入密钥就能聊了！'
        showBubble(tip, 8000)
        dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: { id: uid('msg'), role: 'assistant', content: tip, createdAt: Date.now() } } })
        petReactToReply(tip)
        return
      }
      const { content: reply } = await chatCompletion(aiConfig, buildContextMessages(state.aiHistory, text), { timeoutMs: 15000, temperature: 0.7 })
      const finalText = String(reply || '').trim() || '（我走神了，再说一遍好吗）'
      dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: { id: uid('msg'), role: 'assistant', content: finalText, createdAt: Date.now() } } })
      showBubble(finalText, Math.max(5000, Math.min(15000, finalText.length * 90)))
      petReactToReply(finalText)
    } catch (err) {
      const tip = `⚠️ 连接失败：${String(err?.message || '网络异常').slice(0, 60)}`
      showBubble(tip, 6000)
      dispatch({ type: 'APPEND_AI_MESSAGE', payload: { message: { id: uid('msg'), role: 'assistant', content: tip, createdAt: Date.now() } } })
      petReactToReply(tip)
    } finally {
      setAiBusy(false)
    }
  }

  // ===== 渲染循环 =====
  useEffect(() => {
    if (debugExpose && typeof window !== 'undefined') window.__petDirector = directorRef
    startIdleSystem()   // 生命感系统（全应用单例，随机小动作）
    let raf
    const loop = () => {
      try {
        const frame = directorRef.tick()
        const el = imgRef.current
        if (el) {
          const m = frame.modelUpdate
          const rot = (m.angleZ || 0) * 0.45 + (m.bodyAngleZ || 0) * 0.35
          const dx = ((m.angleX || 0) * 0.35 + (m.bodyAngleX || 0) * 0.6)
          const dy = ((m.angleY || 0) * 0.3 + (m.bodyAngleY || 0) * 0.4)
          const breath = 1 + (m.breath || 0) * 0.015
          el.style.transform = `translate(${dx.toFixed(2)}%, ${dy.toFixed(2)}%) rotate(${rot.toFixed(2)}deg) scale(${breath.toFixed(3)})`
          const eyeOpen = m.eyeOpenL != null ? m.eyeOpenL : 1
          const mouth = m.mouthOpen || 0
          const imgs = imagesRef.current
          const next = (eyeOpen < 0.25 && imgs.blink) ? imgs.blink
            : (mouth > 0.45 && imgs.mouthOpen) ? imgs.mouthOpen
            : imgs.base
          if (next && el.dataset.src !== next) { el.dataset.src = next; el.src = next }
        }
      } catch (e) { /* 单帧异常不终止循环 */ }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [directorRef, debugExpose])

  // 位置合并优先级：拖动过的坐标(pos) > 外部 style 的默认位（left/bottom）
  const { left: defLeft, bottom: defBottom, ...restStyle } = style
  const finalStyle = pos
    ? { ...restStyle, position: 'fixed', left: pos.x, top: pos.y }
    : { ...restStyle, position: 'fixed', left: defLeft ?? 10, bottom: defBottom ?? 'calc(var(--bottombar-total, 64px) + 10px)' }

  return (
    <div
      ref={wrapRef}
      style={{ width: size, height: size, touchAction: 'none', cursor: interactive ? 'grab' : 'default', zIndex: 25, ...finalStyle }}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerCancel={interactive ? onPointerUp : undefined}
      title={interactive ? '拖动换位置 · 双击说话' : undefined}
    >
      {/* 语音气泡：默认在桌宠上方；桌宠被拖到屏幕顶部区域时自动翻转到下方（防遮挡/出屏） */}
      {bubble && (
        <div
          onClick={() => setBubble(null)}
          style={{ position: 'absolute', maxWidth: 260, width: 'max-content', pointerEvents: 'auto',
            ...(bubbleBelow ? { top: '102%' } : { bottom: '102%' }),
            left: '50%', transform: 'translateX(-30%)' }}
          className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-600 shadow-xl rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 dark:text-slate-200"
        >
          {listening && <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse mr-1.5 align-middle" />}
          <span className="whitespace-pre-wrap break-words">{bubble.text}</span>
          <span className={`absolute left-8 w-3 h-3 bg-white dark:bg-slate-800 rotate-45 ${bubbleBelow
            ? '-top-1.5 border-t border-l border-indigo-200 dark:border-slate-600'
            : '-bottom-1.5 border-b border-r border-indigo-200 dark:border-slate-600'}`} />
        </div>
      )}
      <img
        ref={imgRef}
        src={images.base}
        alt="桌宠"
        draggable={false}
        style={{
          width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom',
          transformOrigin: '50% 88%',
          willChange: 'transform',
          userSelect: 'none',
          filter: listening ? 'drop-shadow(0 0 10px rgba(99,102,241,0.8))' : undefined,
        }}
      />
    </div>
  )
}
