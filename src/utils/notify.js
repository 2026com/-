/**
 * 系统通知工具（双通道：PWA 浏览器通知 + Capacitor 原生通知）
 *
 * 能力边界（重要）：
 * - PWA（浏览器标签页）：应用「打开/后台/锁屏（页面未关）」时通知可靠可达 ✅；
 *   应用「完全关闭」纯前端无法准时提醒 ❌。
 * - Capacitor APK（Android 原生壳）：通过 @capacitor/local-notifications 把提醒
 *   「调度」到 Android 系统时钟 → 锁屏 ✅、应用完全关闭/杀进程 ✅（由系统按时触发）。
 *   注意：Android 13+ 需动态申请 POST_NOTIFICATIONS 权限；精确闹钟依赖 SCHEDULE_EXACT_ALARM。
 */

const ICON = '/pwa-icon-192x192.png'

/** 是否运行在 Capacitor 原生 WebView 里 */
function isCapacitor() {
  try {
    if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform) {
      return window.Capacitor.isNativePlatform()
    }
  } catch (e) { /* ignore */ }
  return false
}

/** 动态加载本地通知插件（web 环境不加载，避免破坏 PWA 构建） */
async function loadLocalNotifications() {
  const mod = await import('@capacitor/local-notifications')
  return mod.LocalNotifications
}

/** 把任意字符串 id 稳定映射为 Android 正整数通知 id（1 ~ 2147483646） */
function numId(str) {
  let h = 0
  const s = String(str || 'x')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 2147483646) + 1
}

let _channelReady = false
/** 初始化（创建 Android 8+ 通知渠道，幂等） */
export async function initNativeNotifications() {
  if (!isCapacitor()) return false
  try {
    const LocalNotifications = await loadLocalNotifications()
    await LocalNotifications.createChannel({
      id: 'growth',
      name: '成长提醒',
      description: '节点闹钟、习惯打卡与番茄钟提醒',
      importance: 5, // IMPORTANCE_HIGH
      visibility: 1, // VISIBILITY_PUBLIC：锁屏也显示
      sound: 'default',
      vibration: true,
    })
    _channelReady = true
    return true
  } catch (e) {
    return false
  }
}

/** 申请系统通知权限（原生：Android 13+ 运行时弹窗；PWA：浏览器权限）。返回是否可用。 */
export async function ensureNotifyPermission() {
  if (isCapacitor()) {
    try {
      const LocalNotifications = await loadLocalNotifications()
      const perm = await LocalNotifications.checkPermissions()
      if (perm.display === 'granted') return true
      if (perm.display === 'denied') return false
      const res = await LocalNotifications.requestPermissions()
      return res.display === 'granted'
    } catch (e) {
      return false
    }
  }
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
 * 调度一条原生系统通知（未来某个时刻触发，锁屏 / 应用被杀也能到）。
 * @param {{ id: string|number, title: string, body?: string, at: number }} opts at 为毫秒时间戳
 * @returns {Promise<boolean>} 是否成功调度
 */
export async function scheduleNativeNotification(opts) {
  if (!isCapacitor()) return false
  try {
    const LocalNotifications = await loadLocalNotifications()
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      const res = await LocalNotifications.requestPermissions()
      if (res.display !== 'granted') return false
    }
    if (!_channelReady) await initNativeNotifications()
    const at = Math.max(Date.now() + 2000, Number(opts.at) || Date.now() + 2000)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: numId(opts.id),
          title: opts.title || '成长提醒',
          body: opts.body || '',
          channelId: 'growth',
          schedule: { at: new Date(at), allowWhileIdle: true },
        },
      ],
    })
    return true
  } catch (e) {
    return false
  }
}

/** 取消一条已调度的原生通知 */
export async function cancelNativeNotification(id) {
  if (!isCapacitor()) return
  try {
    const LocalNotifications = await loadLocalNotifications()
    await LocalNotifications.cancel({ notifications: [{ id: numId(id) }] })
  } catch (e) { /* ignore */ }
}

let _counter = 0
/**
 * 发送系统通知。
 * - 原生：调度 1 秒后的系统通知（锁屏/后台/被杀后已调度的也能弹）。
 * - PWA：页面可见且有焦点时跳过（页面内弹窗足够）；后台/未聚焦才真正弹出。
 */
export async function notifyNow(title, body) {
  if (isCapacitor()) {
    await scheduleNativeNotification({ id: 'immediate-' + (Date.now() % 1000000) + '-' + (++_counter), title, body, at: Date.now() + 1000 })
    return
  }
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
