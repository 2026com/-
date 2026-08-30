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

/** 跳转系统「应用通知设置」页（悬浮通知 / 锁屏通知 / 声音，仅需设置一次） */
export async function openNotificationSettings() {
  try {
    await AppBridge.openNotificationSettings()
    return true
  } catch (e) {
    console.warn('[device] 打开通知设置失败:', e && e.message)
    return false
  }
}

/** 跳转系统「应用详情」页（MIUI 在此可开 自启动 / 省电策略=无限制） */
export async function openAppDetailsSettings() {
  try {
    await AppBridge.openAppDetailsSettings()
    return true
  } catch (e) {
    console.warn('[device] 打开应用详情失败:', e && e.message)
    return false
  }
}

/** 跳转「全屏通知」授权页（Android 14+ 熄屏到点点亮屏幕弹横幅需要用户授权） */
export async function openFullScreenIntentSettings() {
  try {
    await AppBridge.openFullScreenIntentSettings()
    return true
  } catch (e) {
    console.warn('[device] 打开全屏通知设置失败:', e && e.message)
    return false
  }
}

/** 跳转「成长提醒」渠道通知设置页（悬浮通知/锁屏通知/声音——MIUI 默认全关，横幅不弹的头号原因） */
export async function openChannelSettings() {
  try {
    await AppBridge.openChannelSettings()
    return true
  } catch (e) {
    console.warn('[device] 打开渠道设置失败:', e && e.message)
    return false
  }
}

/** 提醒链路状态（通知权限/全屏通知/电池白名单/守护服务/渠道重要级）——引导卡实时显示用 */
export async function getReminderStatus() {
  try {
    const r = await AppBridge.getReminderStatus()
    return {
      notificationsEnabled: !!r.notificationsEnabled,
      fsiGranted: r.fsiGranted !== false,
      batteryIgnored: !!r.batteryIgnored,
      guardRunning: !!r.guardRunning,
      pendingCount: typeof r.pendingCount === 'number' ? r.pendingCount : -1,
      channelImportance: typeof r.channelImportance === 'number' ? r.channelImportance : -1,
    }
  } catch (e) {
    return null
  }
}