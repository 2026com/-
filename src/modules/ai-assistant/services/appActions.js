import { SURFACES, SURFACE_NAMES, PARAM_DEFS, setBackground, setParams, resetBackground } from '../../../services/backgrounds.js'

/**
 * AI 应用操作层（白名单指令协议）
 * - AI 在回复中输出约定格式的 JSON 指令 → 本层【严格白名单校验】→ 确认弹窗 → 执行；
 * - 白名单外的任何 JSON/字段/取值一律丢弃（防提示词注入：导入的网页内容骗 AI 删数据也无效）；
 * - 当前开放指令：换背景 set_background / 恢复默认 reset_background。
 */

// 注入到系统提示词的指令协议（buildSystemPrompt 拼接用）
export const APP_ACTION_PROTOCOL = `
【背景与外观调节能力】当且仅当用户明确要求更换背景或调节外观参数时，在回复的末尾另起一行输出一条 JSON 指令（用 \`\`\`json 代码块包裹），先用人话简短说明你要做什么。可用指令仅有三种：
1. 换背景：\`\`\`json\n{"action":"set_background","surface":"knowledge|memory|notebook","bg":{"type":"gradient","from":"#0a1030","to":"#252b38","angle":160}}\n\`\`\` 或 {"type":"color","value":"#101010"}（gradient 为双色渐变，angle 可选 0~360）
2. 调参数：\`\`\`json\n{"action":"set_params","surface":"knowledge|memory|notebook","params":{"参数名":数值}}\n\`\`\`
   knowledge 可调参数：starDensity 星空密度(0.3~3，默认1)、starBrightness 星光亮度(0.3~3，默认1)、linkBrightness 连线亮度(0.2~3，默认1)、glowIntensity 辉光强度(0~3，默认1)、fogDensity 星云雾感(0.2~2，默认1)；
   memory 可调参数：rotateSpeed 旋转速度(0.2~5，默认1，1=每100秒转一圈)、dustBrightness 星尘亮度(0.2~3，默认1)、textBrightness 文字亮度(0.3~2，默认1)；
   notebook 可调参数：lineSpacing 行距(0.8~1.6，默认1，1=标准行高37px)、fontSize 字号(0.8~1.4，默认1，1=标准字号15.5px)。
3. 恢复默认：\`\`\`json\n{"action":"reset_background","surface":"knowledge|memory|notebook|all"}\n\`\`\`（背景和参数一并还原默认）
surface 含义：knowledge=3D知识库，memory=记忆库，notebook=横线本；all=全部恢复默认。
规则：用户没要求时绝不输出指令；用户说「星星多点/转快点/亮一点」等模糊需求时映射到对应参数并取合理值；每次只输出一条指令。`

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
 * 从 AI 回复文本中解析外观指令（背景/参数）；白名单外一律返回 null
 * @returns {{action:'set_background',surface:string,bg:object}|{action:'set_params',surface:string,params:object}|{action:'reset_background',surface:string}|null}
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
  // 调参数：仅白名单内的参数名生效，数值逐项夹取（service 端再兜底一次）
  if (obj.action === 'set_params' && SURFACES.includes(obj.surface) && obj.params && typeof obj.params === 'object') {
    const defs = PARAM_DEFS[obj.surface] || {}
    const params = {}
    Object.entries(obj.params).forEach(([k, v]) => {
      if (!defs[k]) return // 白名单外的参数名直接丢弃
      const n = Number(v)
      if (Number.isFinite(n)) params[k] = Math.min(defs[k].max, Math.max(defs[k].min, n))
    })
    if (Object.keys(params).length > 0) return { action: 'set_params', surface: obj.surface, params }
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
      ? '将把 3D 知识库、记忆库、横线本三处的背景与参数全部恢复默认。'
      : `将把「${SURFACE_NAMES[act.surface]}」的背景与参数恢复默认。`
  }
  if (act.action === 'set_params') {
    const defs = PARAM_DEFS[act.surface] || {}
    const items = Object.entries(act.params).map(([k, v]) => `${defs[k]?.label || k} ×${v}`).join('、')
    return `将调整「${SURFACE_NAMES[act.surface]}」外观参数：${items}。`
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
    if (act.action === 'set_params') return setParams(act.surface, act.params)
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
