/**
 * 系统通知工具（PWA 场景）
 *
 * 能力边界（重要）：
 * - 应用「标签页/窗口打开」时（含切到后台、手机锁屏、切到其它 App）：通知可靠可达 ✅
 * - 应用「完全关闭 / 浏览器进程退出」：纯前端无法准时提醒（页面定时器随页面销毁；
 *   Service Worker 定时器存活有限，Chrome 空闲约 30s 即回收；Periodic Background Sync
 *   最小约 12h 且 iOS 不支持）。此场景只能靠 Web Push 服务器或原生壳（Tauri/APK）实现。
 */

const ICON = '/pwa-icon-192x192.png'

/** 尝试申请通知权限（最好在用户点击等手势里调用）。返回是否已可用。 */
export function ensureNotifyPermission() {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'default') {
      // 非手势上下文也可能弹提示（Chrome），失败静默忽略
      Notification.requestPermission().catch(() => {})
    }
    return false
  } catch (e) {
    return false
  }
}

/**
 * 发送系统通知。
 * 页面可见且有焦点时跳过（此时页面内的弹窗/提示已足够，避免打扰）；
 * 页面在后台/未聚焦时才真正弹出系统通知。
 */
export function notifyNow(title, body) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    // 页面正被用户看着 → 不弹系统通知，交给页面内提示
    const visible = typeof document !== 'undefined' && document.visibilityState === 'visible'
    const focused = typeof document !== 'undefined' && document.hasFocus ? document.hasFocus() : true
    if (visible && focused) return
    const n = new Notification(title || '成长提醒', {
      body: body || '',
      icon: ICON,
      badge: ICON,
      tag: 'growth-alarm-' + Date.now(),
    })
    n.onclick = () => {
      try { window.focus(); n.close() } catch (e) { /* ignore */ }
    }
    if (typeof n.onshow === 'function') {
      n.onshow = () => { try { setTimeout(() => n.close(), 15000) } catch (e) {} }
    }
  } catch (e) {
    // 某些桌面浏览器/系统禁用通知时静默
  }
}
