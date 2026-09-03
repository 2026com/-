/**
 * 虚拟桌宠 · 参数通道分区表（两个开源项目不打架的根本保障）
 * - Live2D 模型的每个参数只允许一个执行器写入：
 *   脸通道 → SoulLink_Live2D 适配器（眼开闭/眉/嘴/表情）
 *   身通道 → AG99live 适配器（头/身转角、视线、呼吸、位置）
 * - 合并器按此表过滤：执行器输出了不属于自己通道的参数 → 直接剥除（防越权写入）；
 * - 参数名按 Cubism 标准命名；不同模型可能有私有参数，阶段二侦察后在此追加/覆写。
 */

export const FACE_PARAMS = [
  'ParamEyeLOpen', 'ParamEyeROpen', 'ParamEyeLOpenSmile', 'ParamEyeROpenSmile',
  'ParamEyeLSmile', 'ParamEyeRSmile',
  'ParamBrowLY', 'ParamBrowRY', 'ParamBrowLForm', 'ParamBrowRForm', 'ParamBrowLAngle', 'ParamBrowRAngle',
  'ParamMouthOpenY', 'ParamMouthForm', 'ParamMouthY',
  'ParamCheek',
  'ParamTearL', 'ParamTearR',
]

export const BODY_PARAMS = [
  'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',          // 头部转角
  'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ',
  'ParamEyeBallX', 'ParamEyeBallY',                      // 视线（AG99 视线随动）
  'ParamBreath',
  'ParamX', 'ParamY', 'ParamZ',                          // 位置
  'ParamHairFront', 'ParamHairSide', 'ParamHairBack',    // 物理摇摆类也归身通道
]

const FACE_SET = new Set(FACE_PARAMS)
const BODY_SET = new Set(BODY_PARAMS)

/** 按通道过滤参数对象：脸执行器的输出只保留脸参数，身执行器只保留身参数 */
export function filterByChannel(params, channel) {
  const set = channel === 'face' ? FACE_SET : channel === 'body' ? BODY_SET : null
  if (!set) return {}
  const out = {}
  Object.entries(params || {}).forEach(([k, v]) => { if (set.has(k)) out[k] = v })
  return out
}

/** 合并两个通道的当前输出 → 一次模型更新（同帧仅此一次写模型） */
export function composeFrame(faceParams, bodyParams) {
  return {
    face: filterByChannel(faceParams, 'face'),
    body: filterByChannel(bodyParams, 'body'),
    modelUpdate: { ...filterByChannel(faceParams, 'face'), ...filterByChannel(bodyParams, 'body') },
  }
}
