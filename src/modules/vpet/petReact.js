import { getPetDirector } from './singleton.js'
import { speakText } from './tts.js'

/**
 * 桌宠情绪反应（共享逻辑）：AI 回复文本 → 说话口型 + 启发式情绪表情
 * - ChatInterface（对话回复）与语音对话流程共用，保证两处表演一致；
 * - 口型优先走 TTS（真语音+事件驱动口型）；TTS 不可用/被关闭 → 回退按时长的假口型；
 * - opts.tts = false 时跳过语音（占位提示/错误提示不念出来）；
 * - 启发式：关键词/emoji 判定 happy/sad/surprised；判定不出则只说话不做表情。
 */
export function petReactToReply(text, opts = {}) {
  try {
    const pet = getPetDirector()
    const t = String(text || '')
    pet.submit({ type: 'idle', params: { channel: 'body' } })   // 回复到达 → 结束思考动作
    // 说话：优先 TTS 真语音（口型由语音事件驱动）；失败回退按时长假口型
    const spoke = opts.tts !== false && speakText(t)
    if (!spoke) {
      const sayMs = Math.min(8000, 1800 + t.length * 25)       // 说话口型时长 ≈ 阅读时长
      pet.submit({ type: 'speak', durationMs: sayMs })
    }
    const emo = /❤️|😊|😄|🎉|👍|✅|棒|加油|很开心|高兴|恭喜/.test(t) ? 'happy'
      : /⚠️|错误|失败|抱歉|无法|出错/.test(t) ? 'sad'
      : /？|\?|疑惑|为什么|奇怪/.test(t) ? 'surprised' : null
    if (emo) pet.submit({ type: 'emote', name: emo, durationMs: spoke ? 60000 : Math.min(8000, 1800 + t.length * 25) })
  } catch (e) { /* 桌宠表演失败不影响聊天 */ }
}

/** 桌宠思考动作（等待 AI 回复时；超时自动回落，防请求挂死卡动作） */
export function petThinking(ms = 20000) {
  try { getPetDirector().submit({ type: 'motion', name: 'thinking', durationMs: ms }) } catch (e) { /* ignore */ }
}
