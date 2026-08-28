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

let _initDone = false       // 渠道初始化流程已执行完毕（无论结果如何）
let _activeChannel = null   // 经 listChannels 确认存在的渠道 id；null = 无可用渠道（调度时由插件内置 default 渠道兜底）
let _initPromise = null

/** 当前生效的渠道 id（null 表示调度时不带 channelId，用插件内置 default 渠道） */
export function getActiveChannel() {
  return _activeChannel
}

/** 原生调用超时保护（部分 ROM 对渠道自定义铃声 URI 兼容性差，会卡住回调） */
const withNativeTimeout = (p, ms) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('超时无响应')), ms)),
])

/** 初始化通知渠道（V3）：
 *  策略转变：不再以 JS 桥的 createChannel 为主路径。
 *  K60 实测：部分 ROM（MIUI/HyperOS）上经桥 createChannel 会永久挂起——第一个调用
 *  卡住会占死桥线程，后续所有插件调用（含降级渠道、schedule）全部挂死。
 *  新主路径：App 启动时由原生 Java（NotificationChannelsHelper）直建渠道，
 *  这里只做 listChannels 查询验证；渠道缺失才经桥补建一次「无铃声兼容渠道」；
 *  全部失败则置 null —— 调度时不带 channelId，由插件内置 default 渠道兜底（永不丢通知）。 */
export function initNativeNotifications() {
  if (!isCapacitor()) return Promise.resolve(false)
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    try {
      const LN = await loadLocalNotifications()
      if (!LN) {
        console.warn('[notify] 无法加载 LocalNotifications 模块 — capacitor.plugins.json 可能缺失，请执行 npx cap sync android')
        return false
      }
      // ① 查询系统已有渠道（原生启动时已直建，正常情况这里直接命中）
      try {
        const res = await withNativeTimeout(LN.listChannels(), 5000)
        const ids = ((res && res.channels) || []).map(c => c && c.id).filter(Boolean)
        if (ids.includes('growth_v3')) {
          _activeChannel = 'growth_v3'
          return true
        }
        if (ids.includes('growth_fb')) {
          _activeChannel = 'growth_fb'
          return true
        }
        console.warn('[notify] 系统渠道中无 growth 渠道，已有:', ids.length ? ids.join(', ') : '(空)')
      } catch (e) {
        console.warn('[notify] listChannels 查询失败:', e && e.message)
      }
      // ② 渠道缺失（如旧版本 APK 未做原生直建）→ 经桥补建一次「无铃声兼容渠道」（无自定义 URI，绝大多数 ROM 秒回）
      try {
        await withNativeTimeout(LN.createChannel({
          id: 'growth_fb',
          name: '成长提醒',
          description: '成长提醒（兼容模式）',
          importance: 5,
          visibility: 1,
          vibration: true,
        }), 5000)
        _activeChannel = 'growth_fb'
        return true
      } catch (e2) {
        console.warn('[notify] 兼容渠道补建失败:', e2 && e2.message)
      }
      // ③ 彻底失败 → 不带渠道调度，插件会用内置 default 渠道（其 load() 时已自动创建）
      _activeChannel = null
      return false
    } catch (e) {
      console.warn('[notify] initNativeNotifications 失败:', e && e.message)
      return false
    } finally {
      _initDone = true
    }
  })()
  return _initPromise
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
    if (!_initDone) await initNativeNotifications()
    const at = Math.max(Date.now() + 2000, Number(opts.at) || Date.now() + 2000)
    const item = {
      id: numId(opts.id),
      title: opts.title || '成长提醒',
      body: opts.body || '',
      schedule: { at: new Date(at), allowWhileIdle: true, exact: true },
    }
    // 渠道仅在「确认存在」时携带；为 null 时绝不携带（指向不存在的渠道会被系统静默丢弃），
    // 交给插件内置 default 渠道兜底（插件加载时自动创建，系统默认提示音）
    if (_activeChannel) item.channelId = _activeChannel
    await LocalNotifications.schedule({ notifications: [item] })
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
  // 单步计时包装：超时/失败都带步骤名抛出；hint 允许非致命步骤自定义提示
  const step = async (name, fn, ms, hint = '病根在这一步，请截图回复我') => {
    try {
      const r = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('超时无响应（原生调用挂起）')), ms)),
      ])
      lines.push(`✓ ${name}`)
      return r
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      lines.push(`✗ ${name}：${msg} ← ${hint}`)
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

  // 步骤3：检查通知渠道（原生启动时已直建，此处查询验证；失败不中断——调度有默认渠道兜底）
  try {
    await step('3. 检查通知渠道', () => initNativeNotifications(), 14000, '桥查询挂起（将自动改用系统默认渠道）')
    if (getActiveChannel()) {
      lines.push(`   ✓ 生效渠道：${getActiveChannel()}${getActiveChannel() === 'growth_fb' ? '（系统默认提示音）' : '（自定义铃声）'}`)
    } else {
      lines.push('   ⚠ 自定义渠道不可用 → 已改用系统默认渠道调度（通知仍会弹出，铃声取决于系统设置）')
    }
  } catch (e) {
    lines.push('   ⚠ 渠道查询挂起/失败 → 已改用系统默认渠道调度（通知仍会弹出）')
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
