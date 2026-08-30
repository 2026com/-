/**
 * 系统通知工具（双通道：PWA 浏览器通知 + 原生系统通知）
 *
 * 能力边界（重要）：
 * - PWA（浏览器标签页）：应用「打开/后台/锁屏（页面未关）」时通知可靠可达 ✅；
 *   应用「完全关闭」纯前端无法准时提醒 ❌。
 * - Capacitor APK（Android 原生壳）：通知链路走「自建 AppBridge 桥 + 原生 AlarmManager/
 *   BroadcastReceiver/NotificationManager」（见 android NotificationScheduler.java），
 *   锁屏 ✅、应用完全关闭/杀进程 ✅、重启后由 BootReceiver 恢复 ✅。
 *   背景：红米 K60 实测 @capacitor/local-notifications 插件桥的通知/闹钟类调用在该 ROM
 *   上全部永久挂起（仅纯本地查询幸存），故原生链路完全自有实现，不再经插件桥调度。
 *   注意：Android 13+ 需 POST_NOTIFICATIONS 权限；精确闹钟依赖「闹钟和提醒」权限，
 *   未授予时自动降级为非精确闹钟（可能延迟几分钟）。
 */

import { LocalNotifications } from '@capacitor/local-notifications'
import { registerPlugin } from '@capacitor/core'

/** 自建原生桥（AppBridge）：K60 实测 LocalNotifications 插件桥的通知/闹钟类调用
 *  在该 ROM 上全部挂起，而自建桥正常，故通知链路完全走自有原生代码。 */
const AppBridge = registerPlugin('AppBridge')

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

let _initDone = false       // 渠道检查流程已执行完毕（无论结果如何）
let _activeChannel = null   // 经自建桥确认存在的渠道 id（用于自检展示与诊断）
let _channelState = null    // 渠道诊断信息（铃声/兼容渠道是否就绪、精确闹钟权限等）
let _initPromise = null

/** 当前生效的渠道 id（null 表示由原生侧自动选择渠道） */
export function getActiveChannel() {
  return _activeChannel
}

/** 原生调用超时保护（部分 ROM 对渠道自定义铃声 URI 兼容性差，会卡住回调） */
const withNativeTimeout = (p, ms) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('超时无响应')), ms)),
])

/** 初始化通知渠道检查（V4）：
 *  渠道由 App 启动时原生直建（NotificationChannelsHelper，不经 JS 桥），这里经「自建桥」
 *  查询确认生效渠道并收集诊断状态。K60 实测 LocalNotifications 插件桥的 listChannels
 *  也会挂起，故改走自有 AppBridge。查询失败不影响调度（原生侧自动选渠道兜底）。 */
export function initNativeNotifications() {
  if (!isCapacitor()) return Promise.resolve(false)
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    try {
      const res = await withNativeTimeout(AppBridge.listNotificationChannels(), 6000)
      _channelState = {
        hasNotify: !!res.hasNotify,
        exactAlarm: res.exactAlarm !== false,
        notificationsEnabled: res.notificationsEnabled !== false,
        detail: (res && res.detail) || [],
        lastAlarmResult: (res && res.lastAlarmResult) || '',
        guardRunning: !!res.guardRunning,
        pendingCount: (res && res.pendingCount) ?? -1,
      }
      if (res.hasNotify) {
        _activeChannel = 'growth_notify'
        return true
      }
      console.warn('[notify] 系统渠道中无 growth_notify，已有:', ((res && res.channels) || []).join(', '))
      _activeChannel = null
      return false
    } catch (e) {
      console.warn('[notify] 渠道查询失败（自建桥）:', e && e.message)
      _channelState = null
      _activeChannel = null
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
    // 通知总开关经自建桥检查（K60 上 LN 插件桥行为异常，彻底不再经它调用）
    if (!_initDone) await initNativeNotifications()
    if (_channelState && _channelState.notificationsEnabled === false) {
      console.warn('[notify] 系统通知已关闭，调度跳过')
      return false
    }
    const at = Math.max(Date.now() + 2000, Number(opts.at) || Date.now() + 2000)
    // 自建桥（异步调度：立即返回，原生后台武装用户级闹钟 + 守护服务到点兜底弹出）。
    await AppBridge.scheduleNotification({
      id: numId(opts.id),
      title: opts.title || '成长提醒',
      body: opts.body || '',
      at,
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
    await AppBridge.cancelNotification({ id: numId(id) })
  } catch (e) { /* ignore */ }
}

let _counter = 0

/** 立即弹一条系统通知（自建桥直弹，不走闹钟）——用于自检。
 *  返回 delivered：通知是否真实进入系统通知栏（false = 被系统拦截，即使调用成功）。 */
export async function notifyNativeNow(title, body) {
  if (!isCapacitor()) return false
  try {
    const res = await AppBridge.notifyNow({
      id: numId('now-' + Date.now() + '-' + (++_counter)),
      title: title || '成长提醒',
      body: body || '',
    })
    return !(res && res.delivered === false)
  } catch (e) {
    console.warn('[notify] notifyNativeNow 失败:', e?.message)
    return false
  }
}

/** [到点兜底] 立即触发原生侧到期扫描：弹出 pending 列表中「已到期且闹钟未触发过」的提醒。
 *  闹钟已触发过的条目已被移出 pending → 自动跳过（防双响）；
 *  闹钟被 ROM 吞掉/未设上的 → 立即补弹（走已实测有声的直弹路径）。
 *  返回 false = 原生扫描不可用，调用方需自行降级为直弹通知。 */
export async function fireNativeDueNow(opts = {}) {
  if (!isCapacitor()) return false
  try {
    await withNativeTimeout(AppBridge.fireDueNow({ silent: !!opts.silent }), 5000)
    return true
  } catch (e) {
    console.warn('[notify] fireDueNow 失败:', e?.message)
    return false
  }
}

/** 微信式到点提示音（模仿微信/QQ 前台消息"叮"声）：
 *  与通知渠道/闹钟/权限完全解耦，App 在前台时直接播放，必响（音量跟随系统通知音量）。
 *  - APK：原生播系统默认通知音（Ringtone，失败降级蜂鸣）；
 *  - PWA：WebAudio 现场合成短提示音（无需音频文件）。 */
export async function playAlertSound() {
  if (isCapacitor()) {
    try { await withNativeTimeout(AppBridge.playAlertSound(), 4000) } catch (e) { /* 静默失败 */ }
    return
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => { try { ctx.close() } catch (e) { /* ignore */ } }, 800)
  } catch (e) { /* ignore */ }
}
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
    // [修复] K60 实测：走「1 秒后闹钟」的立即通知到点不弹（setAlarmClock 被 ROM 静默吞掉），
    // 表现为「应用内弹窗有、系统通知无声」。改为自建桥直弹（与自检 4a 同路径，实测有声）。
    await notifyNativeNow(title, body)
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

