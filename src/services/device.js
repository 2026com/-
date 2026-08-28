import { registerPlugin } from '@capacitor/core'

/**
 * 设备能力桥（本地自定义 Capacitor 插件：AppBridge）
 * - Android 实现：android/app/src/main/java/com/growth/xiaomei/AppBridgePlugin.java
 *   （MainActivity onCreate 中 registerPlugin 注册，无需 npm 依赖）
 * - Web 降级：仅在浏览器全屏时尝试 screen.orientation.lock，其余场景静默失败
 */

const AppBridge = registerPlugin('AppBridge')

/**
 * 设置屏幕方向
 * @param {'landscape'|'portrait'|'auto'} type landscape=横屏，portrait=竖屏，auto=跟随系统
 * @returns {Promise<boolean>} 是否设置成功
 */
export async function setScreenOrientation(type) {
  try {
    await AppBridge.setOrientation({ type: String(type || 'auto') })
    return true
  } catch (e) {
    // Web 降级：仅在已进入全屏时浏览器才允许锁定方向
    try {
      if (document.fullscreenElement && window.screen?.orientation?.lock) {
        await window.screen.orientation.lock(String(type || 'auto'))
        return true
      }
    } catch { /* ignore */ }
    console.warn('[device] 设置屏幕方向失败（Web 环境或插件缺失）:', e && e.message)
    return false
  }
}

/** 当前是否横屏 */
export function isLandscapeNow() {
  try {
    return window.innerWidth > window.innerHeight
  } catch {
    return false
  }
}

/** 是否已在电池优化白名单（null = 环境/插件不支持） */
export async function isIgnoringBatteryOptimizations() {
  try {
    const r = await AppBridge.isIgnoringBatteryOptimizations()
    return !!r.ignored
  } catch {
    return null
  }
}

/** 请求加入电池优化白名单（拉起系统弹窗）。返回 'already' | 'launched' | null */
export async function requestIgnoreBatteryOptimization() {
  try {
    const r = await AppBridge.requestIgnoreBatteryOptimizations()
    return (r && r.status) || null
  } catch {
    return null
  }
}