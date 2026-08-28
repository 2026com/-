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
  try {
    const mod = await import('@capacitor/local-notifications')
    return mod.LocalNotifications || null
  } catch (e) {
    // @capacitor/local-notifications 未安装或构建未包含
    console.warn('[notify] @capacitor/local-notifications 加载失败 — 原生通道不可用:', e?.message)
    return null
  }
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
    if (!LocalNotifications) {
      console.warn('[notify] 无法加载 LocalNotifications 模块 — capacitor.plugins.json 可能缺失，请执行 npx cap sync android')
      return false
    }
    // v3 渠道：'default' 不是合法的 res/raw 资源名（曾导致渠道无声）；
    // v2 起改用打包进 APK 的 res/raw/alarm.wav（插件 SoundResolver 会去扩展名查找）。
    // Android 渠道创建后属性不可变——若某台设备上 v2 已以异常状态存在，
    // 升级渠道 id（growth_v3）可强制以正确配置重建。
    await LocalNotifications.createChannel({
      id: 'growth_v3',
      name: '成长提醒',
      description: '节点闹钟、习惯打卡与番茄钟提醒（系统级铃声）',
      importance: 5, // IMPORTANCE_HIGH：横幅 + 声音 + 锁屏显示
      visibility: 1, // VISIBILITY_PUBLIC：锁屏也显示
      sound: 'alarm.wav',
      vibration: true,
    })
    _channelReady = true
    return true
  } catch (e) {
    console.warn('[notify] initNativeNotifications 失败:', e?.message)
    return false
  }
}

/** 申请系统通知权限（原生：Android 13+ 运行时弹窗；PWA：浏览器权限）。返回是否可用。 */
export async function ensureNotifyPermission() {
  if (isCapacitor()) {
    try {
      const LocalNotifications = await loadLocalNotifications()
      if (!LocalNotifications) return false
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
    if (!LocalNotifications) return false
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
          channelId: 'growth_v3',
          schedule: { at: new Date(at), allowWhileIdle: true, exact: true },
        },
      ],
    })
    return true
  } catch (e) {
    console.warn('[notify] scheduleNativeNotification 失败:', e?.message)
    return false
  }
}

/** 取消一条已调度的原生通知 */
export async function cancelNativeNotification(id) {
  if (!isCapacitor()) return
  try {
    const LocalNotifications = await loadLocalNotifications()
    if (!LocalNotifications) return
    await LocalNotifications.cancel({ notifications: [{ id: numId(id) }] })
  } catch (e) { /* ignore */ }
}

let _counter = 0
/**
 * 发送系统通知。
 * - 原生：调度 1 秒后的系统通知（锁屏/后台/被杀后已调度的也能弹）。
 * - PWA：页面不可见或未聚焦时弹出系统通知；
 *        可见且有焦点时跳过（页面内弹窗足够）。
 * [修复] 移除 visible+focused 双条件限制 → 改为「只要页面不可见或未聚焦」就弹，
 *        确保切到后台/锁屏时系统通知必达。
 * [修复] 尝试通过 ServiceWorker 注册展示通知（PWA 增强后台可达性）。
 */
export async function notifyNow(title, body) {
  if (isCapacitor()) {
    await scheduleNativeNotification({ id: 'immediate-' + (Date.now() % 1000000) + '-' + (++_counter), title, body, at: Date.now() + 1000 })
    return
  }
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    // [修复] 页面可见且有焦点 → 不弹系统通知（交给页面内弹窗）
    // 页面不可见（后台/锁屏）或无焦点 → 必弹系统通知
    const visible = typeof document !== 'undefined' && document.visibilityState === 'visible'
    const focused = typeof document !== 'undefined' && document.hasFocus ? document.hasFocus() : true
    if (visible && focused) return

    // 优先尝试通过 ServiceWorker 展示通知（后台 tab 更可靠）
    if (navigator.serviceWorker?.ready) {
      try {
        const reg = await navigator.serviceWorker.ready
        if (reg?.showNotification) {
          await reg.showNotification(title || '成长提醒', {
            body: body || '',
            icon: ICON,
            badge: ICON,
            tag: 'growth-alarm-' + Date.now(),
            requireInteraction: true,
            vibrate: [200, 100, 200],
          })
          return
        }
      } catch (_) { /* 降级到 new Notification */ }
    }

    const n = new Notification(title || '成长提醒', {
      body: body || '',
      icon: ICON,
      badge: ICON,
      tag: 'growth-alarm-' + Date.now(),
      requireInteraction: true,
      vibrate: [200, 100, 200],
    })
    n.onclick = () => {
      try { window.focus(); n.close() } catch (e) { /* ignore */ }
    }
    // 10 秒后自动关闭（防止通知堆积）
    setTimeout(() => { try { n.close() } catch (_) {} }, 10000)
  } catch (e) {
    // 某些桌面浏览器/系统禁用通知时静默
  }
}

/**
 * 提醒链路自检：权限 → 渠道 → 调度一条 3 秒后的测试通知。
 * 返回逐条诊断文本（供 UI 以弹窗展示），并在设备上真实发出测试通知供用户验证铃声/横幅。
 */
export async function reminderSelfTest() {
  const lines = []
  if (!isCapacitor()) {
    return ['当前为浏览器（PWA）环境：提醒依赖页面保持打开，', '无法像 APK 一样在应用关闭后离线提醒。']
  }
  let LocalNotifications = null
  try { LocalNotifications = await loadLocalNotifications() } catch (e) { /* ignore */ }
  if (!LocalNotifications) {
    lines.push('✗ 通知插件加载失败（请执行 npx cap sync android 后重装）')
    return lines
  }
  // 1) 通知权限
  try {
    const p = await LocalNotifications.checkPermissions()
    lines.push('1. 通知权限: ' + p.display)
    if (p.display !== 'granted') {
      const r = await LocalNotifications.requestPermissions()
      lines.push('   请求后: ' + r.display)
      if (r.display !== 'granted') {
        lines.push('✗ 权限被拒绝 → 这就是收不到提醒的直接原因。')
        lines.push('   请到 系统设置 → 应用 → 成长小美 → 通知 手动允许。')
        return lines
      }
    }
  } catch (e) {
    lines.push('1. 权限检查异常: ' + (e && e.message ? e.message : e))
  }
  // 2) 渠道（Android 8+）：列出设备上的真实渠道与其声音状态
  try {
    await initNativeNotifications()
    const lc = await LocalNotifications.listChannels()
    const channels = (lc && lc.channels) || []
    const desc = channels.map(c => `${c.id}${c.sound ? '（有声）' : '（无声!）'}`)
    lines.push('2. 通知渠道: ' + (desc.length ? desc.join('、') : '无'))
    const bad = channels.find(c => c.id === 'growth_v3' && !c.sound)
    if (bad) lines.push('   ⚠ growth_v3 渠道无铃声（异常，请回复我）')
  } catch (e) {
    lines.push('2. 渠道检查异常: ' + (e && e.message ? e.message : e))
  }
  // 3) 精确闹钟（Android 12+ 可由用户撤销；14+ 默认关闭）
  lines.push('3. 请确认系统已允许「闹钟和提醒」权限：')
  lines.push('   设置 → 应用 → 成长小美 → 闹钟和提醒 → 允许')
  // 4) 真实发一条测试通知（3 秒后触发）
  const ok = await scheduleNativeNotification({
    id: 'selftest-' + Date.now(),
    title: '🔔 提醒自检',
    body: '看到此通知 = 提醒链路正常。若无声音，长按本通知进渠道设置开启声音。',
    at: Date.now() + 3000,
  })
  lines.push('4. 测试通知: ' + (ok ? '已调度，3 秒后应弹出（注意听声音/看震动）' : '✗ 调度失败（把此界面截图回复我）'))
  lines.push('5. 若测试通知正常、打卡提醒仍不响 → 回复我，我再查调度同步环节。')
  return lines
}
