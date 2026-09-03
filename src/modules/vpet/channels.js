/**
 * 虚拟桌宠 · 参数通道分区表 v2（两个开源项目不打架的根本保障）
 * - Live2D 模型的每个参数只允许一个执行器写入：
 *   脸通道 → SoulLink_Live2D 适配器（眼开闭/眨眼/眉/嘴/脸颊）
 *   身通道 → AG99live 适配器（头/身转角、视线、呼吸、位置）
 * - 物理参数（头发/裙摆/饰品摇摆）由 Live2D 物理引擎驱动，禁止任何执行器直写；
 * - 别名机制：同一逻辑参数在不同模型里参数名不同（SoulLink 的做法），按表解析；
 * - AG99 语义轴（-4..4）按语义分区：head/body/gaze/breath 归身，eye/mouth/brow 归脸——
 *   AG99 适配器对脸语义轴的输出必须剥除（它们由 SoulLink 表情负责），防双写打架。
 */

// ===== 别名表（规范名 → 各模型可能的参数写法；来源：SoulLink expression.js 实测映射） =====
export const PARAM_ALIASES = {
  eyeOpenL:   ['ParamEyeLOpen', 'ParamEyeL_Open', 'EyeLOpen'],
  eyeOpenR:   ['ParamEyeROpen', 'ParamEyeR_Open', 'EyeROpen'],
  eyeSmileL:  ['ParamEyeLSmile', 'ParamEyeL_Smile', 'EyeLSmile'],
  eyeSmileR:  ['ParamEyeRSmile', 'ParamEyeR_Smile', 'EyeRSmile'],
  browLY:     ['ParamBrowLY', 'ParamBrowL_Y', 'BrowLY'],
  browRY:     ['ParamBrowRY', 'ParamBrowR_Y', 'BrowRY'],
  browLAngle: ['ParamBrowLAngle', 'ParamBrowL_Angle', 'BrowLAngle'],
  browRAngle: ['ParamBrowRAngle', 'ParamBrowR_Angle', 'BrowRAngle'],
  mouthOpen:  ['ParamMouthOpenY', 'ParamMouth_OpenY', 'MouthOpenY'],
  mouthForm:  ['ParamMouthForm', 'ParamMouth_Form', 'MouthForm'],
  cheek:      ['ParamCheek', 'Cheek'],
  angleX:     ['ParamAngleX', 'ParamAngleX2', 'AngleX'],
  angleY:     ['ParamAngleY', 'ParamAngleY2', 'AngleY'],
  angleZ:     ['ParamAngleZ', 'AngleZ'],
  bodyAngleX: ['ParamBodyAngleX', 'BodyAngleX'],
  bodyAngleY: ['ParamBodyAngleY', 'BodyAngleY'],
  bodyAngleZ: ['ParamBodyAngleZ', 'BodyAngleZ'],
  eyeBallX:   ['ParamEyeBallX', 'ParamEyeBall_X', 'EyeBallX'],
  eyeBallY:   ['ParamEyeBallY', 'ParamEyeBall_Y', 'EyeBallY'],
  breath:     ['ParamBreath', 'Breath'],
}

// ===== 通道成员（规范名；参数 id 用别名表展开匹配） =====
export const FACE_PARAMS = [
  'eyeOpenL', 'eyeOpenR', 'eyeSmileL', 'eyeSmileR',
  'browLY', 'browRY', 'browLAngle', 'browRAngle',
  'mouthOpen', 'mouthForm', 'cheek',
]

export const BODY_PARAMS = [
  'angleX', 'angleY', 'angleZ',                    // 头部转角
  'bodyAngleX', 'bodyAngleY', 'bodyAngleZ',
  'eyeBallX', 'eyeBallY',                          // 视线（AG99 视线随动）
  'breath',                                        // 呼吸节奏（AG99 breath 轴；由执行器驱动而非 LLM 直写）
]

// ===== 物理参数（Live2D 物理引擎驱动，禁止直写；来源：SoulLink parameters.js 的物理关键词；Breath 例外归身执行器） =====
export const PHYSICS_PARAM_KEYWORDS = ['Hair', 'Ribbon', 'Skirt', 'Bust', 'Sway', 'Rotation_', 'Skinning']

// ===== AG99 语义轴 → 通道归属（brow/eye/mouth 语义归脸，但其输出交给 SoulLink 表情体系） =====
export const AG99_AXIS_CHANNELS = {
  head_yaw: 'body', head_pitch: 'body', head_roll: 'body',
  body_yaw: 'body', body_pitch: 'body', body_roll: 'body',
  gaze_x: 'body', gaze_y: 'body', breath: 'body',
  eye_open_left: 'face', eye_open_right: 'face', eye_smile_left: 'face', eye_smile_right: 'face',
  mouth_smile: 'face', mouth_x: 'face', mouth_open: 'face',
  brow_bias: 'face', brow_left_detail: 'face', brow_right_detail: 'face',
}

const _idsOf = (names) => {
  const set = new Set()
  names.forEach(n => {
    set.add(n) // 规范名本身也在白名单内（适配器直接输出规范键）
    ;(PARAM_ALIASES[n] || []).forEach(id => set.add(id))
  })
  return set
}
const FACE_ID_SET = _idsOf(FACE_PARAMS)
const BODY_ID_SET = _idsOf(BODY_PARAMS)

/** 参数 id 是否属于物理参数（禁止直写） */
export function isPhysicsParam(paramId) {
  return PHYSICS_PARAM_KEYWORDS.some(k => String(paramId).includes(k))
}

/** 按通道过滤参数对象：物理参数一律剥除；脸执行器的输出只留脸参数，身执行器只留身参数 */
export function filterByChannel(params, channel) {
  const set = channel === 'face' ? FACE_ID_SET : channel === 'body' ? BODY_ID_SET : null
  if (!set) return {}
  const out = {}
  Object.entries(params || {}).forEach(([k, v]) => {
    if (set.has(k) && !isPhysicsParam(k)) out[k] = v
  })
  return out
}

/** 合并两个通道的当前输出 → 一次模型更新（同帧仅此一次写模型） */
export function composeFrame(faceParams, bodyParams) {
  const face = filterByChannel(faceParams, 'face')
  const body = filterByChannel(bodyParams, 'body')
  return { face, body, modelUpdate: { ...face, ...body } }
}
