import { getPetDirector } from './singleton.js'

/**
 * 虚拟桌宠 · TTS 语音 + 口型驱动
 * - 用浏览器自带 speechSynthesis（免费，Chrome/Edge 有中文语音）；
 * - 说话开始 → Director 提交 speak（口型动）；结束/出错 → face 通道复位（口型停）；
 * - APK WebView 大概率不支持 → speakText 返回 false，调用方回退到"按时长假口型"；
 * - 开关存 localStorage('vpet.tts.enabled')，默认开。
 */

const TTS_TOGGLE_KEY = 'vpet.tts.enabled'

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function ttsEnabled() {
  try { return localStorage.getItem(TTS_TOGGLE_KEY) !== '0' } catch (e) { return true }
}

export function setTtsEnabled(on) {
  try { localStorage.setItem(TTS_TOGGLE_KEY, on ? '1' : '0') } catch (e) { /* ignore */ }
}

function pickChineseVoice() {
  try {
    const voices = window.speechSynthesis.getVoices() || []
    return voices.find(v => /^zh[-_]CN/i.test(v.lang)) || voices.find(v => /^zh/i.test(v.lang)) || null
  } catch (e) { return null }
}

/** 清理朗读文本：去掉 emoji、markdown 符号、提示框符号等不适合念出来的内容 */
function cleanForSpeech(text) {
  return String(text || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu, ' ')
    .replace(/[#*`>\[\]~|]/g, '')
    .replace(/[⚠️✅❌💡🎯📝📌]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)   // 最长念 300 字，避免长文刷屏
}

/**
 * 朗读文本并驱动桌宠口型
 * @returns {boolean} 是否成功启动了语音（false = 环境不支持/文本为空，调用方回退假口型）
 */
export function speakText(text, opts = {}) {
  try {
    if (!ttsSupported() || !ttsEnabled()) return false
    const clean = cleanForSpeech(text)
    if (!clean) return false
    window.speechSynthesis.cancel()   // 打断上一段
    const u = new SpeechSynthesisUtterance(clean)
    u.lang = 'zh-CN'
    const voice = pickChineseVoice()
    if (voice) u.voice = voice
    u.rate = 1.05
    u.pitch = 1.1                     // 稍高的音调，更贴近可爱女声
    u.onstart = () => {
      try { getPetDirector().submit({ type: 'speak', durationMs: 60000 }) } catch (e) { /* ignore */ }
    }
    const done = () => {
      try { getPetDirector().submit({ type: 'idle', params: { channel: 'face' } }) } catch (e) { /* ignore */ }
      opts.onEnd?.()
    }
    u.onend = done
    u.onerror = done
    window.speechSynthesis.speak(u)
    return true
  } catch (e) { return false }
}

/** 停止朗读并复位口型 */
export function stopSpeaking() {
  try { window.speechSynthesis?.cancel() } catch (e) { /* ignore */ }
  try { getPetDirector().submit({ type: 'idle', params: { channel: 'face' } }) } catch (e) { /* ignore */ }
}

// 调试入口：控制台 window.__vpetSpeak('文本') 直接触发朗读+口型
if (typeof window !== 'undefined') {
  window.__vpetSpeak = speakText
  window.__vpetStopSpeaking = stopSpeaking
}
