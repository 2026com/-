import { SURFACES, SURFACE_NAMES, setBackground, resetBackground } from '../../../services/backgrounds.js'

/**
 * AI 应用操作层（白名单指令协议）
 * - AI 在回复中输出约定格式的 JSON 指令 → 本层【严格白名单校验】→ 确认弹窗 → 执行；
 * - 白名单外的任何 JSON/字段/取值一律丢弃（防提示词注入：导入的网页内容骗 AI 删数据也无效）；
 * - 当前开放指令：换背景 set_background / 恢复默认 reset_background。
 */

// 注入到系统提示词的指令协议（buildSystemPrompt 拼接用）
export const APP_ACTION_PROTOCOL = `
【背景更换能力】当且仅当用户明确要求更换/恢复背景皮肤时，在回复的末尾另起一行输出一条 JSON 指令（用 \`\`\`json 代码块包裹），先用人话简短说明你要做什么。可用指令仅有两种：
1. 换背景：\`\`\`json\n{"action":"set_background","surface":"knowledge|memory|notebook","bg":{"type":"gradient","from":"#0a1030","to":"#252b38","angle":160}}\n\`\`\` 或 {"type":"color","value":"#101010"}（gradient 为双色渐变，angle 可选 0~360）
2. 恢复默认：\`\`\`json\n{"action":"reset_background","surface":"knowledge|memory|notebook|all"}\n\`\`\`
surface 含义：knowledge=3D知识库，memory=记忆库，notebook=横线本；all=全部恢复默认。
规则：用户没要求换背景时绝不输出指令；颜色用十六进制；用户说「深邃/星空/温暖」等模糊需求时你自行设计和谐配色；每次只输出一条指令。`

function extractJsonObject(text) {
  const t = String(text || '')
  const m = t.match(/```json\s*([\s\S]*?)```/) || t.match(/```\s*([\s\S]*?)```/)
  const candidates = []
  if (m) candidates.push(m[1])
  const raw = t.match(/\{[\s\S]*\}/)
  if (raw) candidates.push(raw[0])
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim())
      if (obj && typeof obj === 'object') return obj
    } catch (e) { /* 试下一个候选 */ }
  }
  return null
}

// 颜色白名单：十六进制（#rgb/#rrggbb/#rrggbbaa）或常见英文色名（防奇怪内容混进 CSS）
function validColor(c) {
  return typeof c === 'string' && (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^[a-z]{3,20}$/i.test(c))
}

/**
 * 从 AI 回复文本中解析背景指令；白名单外一律返回 null
 * @returns {{action:'set_background',surface:string,bg:object}|{action:'reset_background',surface:string}|null}
 */
export function parseBackgroundAction(text) {
  const obj = extractJsonObject(text)
  if (!obj) return null
  if (obj.action === 'set_background' && SURFACES.includes(obj.surface)) {
    const bg = obj.bg || {}
    if (bg.type === 'color' && validColor(bg.value)) {
      return { action: 'set_background', surface: obj.surface, bg: { type: 'color', value: bg.value } }
    }
    if (bg.type === 'gradient' && validColor(bg.from) && validColor(bg.to)) {
      const angle = Math.max(0, Math.min(360, Number(bg.angle) || 160))
      return { action: 'set_background', surface: obj.surface, bg: { type: 'gradient', from: bg.from, to: bg.to, angle } }
    }
  }
  if (obj.action === 'reset_background' && (obj.surface === 'all' || SURFACES.includes(obj.surface))) {
    return { action: 'reset_background', surface: obj.surface }
  }
  return null
}

/** 指令 → 人话描述（确认弹窗用） */
export function describeBackgroundAction(act) {
  if (!act) return ''
  if (act.action === 'reset_background') {
    return act.surface === 'all'
      ? '将把 3D 知识库、记忆库、横线本三处背景全部恢复默认外观。'
      : `将把「${SURFACE_NAMES[act.surface]}」的背景恢复默认外观。`
  }
  const name = SURFACE_NAMES[act.surface]
  const bg = act.bg
  const desc = bg.type === 'color'
    ? `纯色 ${bg.value}`
    : `${bg.from} → ${bg.to} 渐变（${bg.angle}°）`
  return `将把「${name}」的背景更换为：${desc}。\n\n随时可以对 AI 说「恢复默认背景」或从换背景面板一键还原。`
}

/** 执行指令（已过白名单）；返回是否成功 */
export function applyBackgroundAction(act) {
  try {
    if (act.action === 'set_background') return setBackground(act.surface, act.bg)
    if (act.action === 'reset_background') return resetBackground(act.surface)
  } catch (e) { /* ignore */ }
  return false
}

/** 确认弹窗 + 执行（全局 ModalRoot，z-50 浮于所有页面之上） */
export function confirmBackgroundAction(act, dispatch) {
  dispatch({
    type: 'PUSH_MODAL',
    payload: {
      type: 'confirm',
      title: '应用背景更换？',
      message: describeBackgroundAction(act),
      okText: '应用',
      onOk: () => {
        const ok = applyBackgroundAction(act)
        dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: ok ? '🎨 背景已更新' : '⚠️ 应用失败，请重试' } })
      }
    }
  })
}
