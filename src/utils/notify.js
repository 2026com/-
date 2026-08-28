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

import { LocalNotifications } from '@capacitor/local-notifications'

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

/** 获取本地通知插件引用（V1.1 起为静态导入，恒可用；Web 端由插件 web 实现兜底） */
function loadLocalNotifications() {
  // 修复记录：此前为动态 import()，在部分设备 WebView 中分块请求会被
  // PWA Service Worker 拦截而永久挂起（自检步骤1超时的根因）。
  // 插件 JS 仅约 15KB，改为随主包静态加载，彻底消除该故障面。
  return Promise.resolve(LocalNotifications || null)
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
 * 提醒链路自检 V2：5 个步骤逐步骤计时诊断。
 * 任何一步超时/失败都会在结果中标出「卡在哪一步」，便于精确定位原生层问题。
 */
export async function reminderSelfTest() {
  const lines = []
  if (!isCapacitor()) {
    return ['当前为浏览器（PWA）环境：提醒依赖页面保持打开，无法像 APK 一样离线提醒。']
  }
  // 单步计时包装：超时/失败都带步骤名抛出
  const step = async (name, fn, ms) => {
    try {
      const r = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('超时无响应（原生调用挂起）')), ms)),
      ])
      lines.push(`✓ ${name}`)
      return r
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      lines.push(`✗ ${name}：${msg} ← 病根在这一步，请截图回复我`)
      throw Object.assign(new Error(msg), { failedStep: name })
    }
  }

  // 步骤1：通知插件就绪（静态打包，无运行时拉取，恒可用）
  try {
    await step('1. 通知插件就绪（静态打包）', () => Promise.resolve(!!LocalNotifications), 2000)
  } catch (e) {
    lines.push('   ↳ 插件未就绪属异常，请重启应用后重试')
    return lines
  }

  // 步骤2：通知权限（Android 13+ 必须允许，否则系统通知全部静默丢弃）
  try {
    const p = await step('2. 查询通知权限', () => LocalNotifications.checkPermissions(), 5000)
    if (p.display === 'granted') {
      lines[lines.length - 1] = '✓ 2. 通知权限：已授予'
    } else {
      const r = await step('   申请通知权限', () => LocalNotifications.requestPermissions(), 5000)
      if (r.display !== 'granted') {
        lines.push(`   ✗ 权限仍为 ${r.display} → 请到 系统设置 → 应用 → 成长小美 → 通知 手动允许`)
        return lines
      }
      lines[lines.length - 1] = '✓ 2. 通知权限：本次申请已授予'
    }
  } catch (e) {
    lines.push('   ↳ 权限接口卡住 = 原生桥异常，请截图回复我')
    return lines
  }

  // 步骤3：创建/列出通知渠道（确认铃声真实生效）
  try {
    await step('3. 创建通知渠道（含铃声）', () => initNativeNotifications(), 6000)
    const lc = await step('   列出设备渠道', () => LocalNotifications.listChannels(), 5000)
    const channels = (lc && lc.channels) || []
    const desc = channels.map(c => `${c.id}${c.sound ? '（有声）' : '（无声!）'}`)
    lines.push(`   设备实际渠道：${desc.length ? desc.join('、') : '无'}`)
  } catch (e) {
    lines.push('   ↳ 渠道环节卡住/失败 = 原生桥异常，请截图回复我')
    return lines
  }

  // 提示系统级权限（无法用代码检测，需人工确认）
  lines.push('⚠ 请人工确认（设置→应用→成长小美）：「通知」允许、「闹钟和提醒」允许、电池优化不限制')

  // 步骤4：真实调度一条 3 秒后的测试通知
  try {
    await step('4. 调度测试通知（3 秒后触发）', () => scheduleNativeNotification({
      id: 'selftest-' + Date.now(),
      title: '🔔 提醒自检',
      body: '看到此通知 = 提醒链路正常（请留意是否有铃声）',
      at: Date.now() + 3000,
    }), 8000)
    lines.push('   → 3 秒后请注意：是否弹出横幅？是否有铃声？是否震动？')
    lines.push('5. 若四步全绿但通知没弹出 → 把手机品牌和安卓版本告诉我（疑似 ROM 拦截）。')
  } catch (e) {
    lines.push('   ↳ 调度环节卡住/失败 = 原生桥异常，请截图回复我')
  }
  return lines
}
