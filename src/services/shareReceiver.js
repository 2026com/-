import { Capacitor } from '@capacitor/core'
import { CapacitorShareTarget } from '@capgo/capacitor-share-target'
import { getShareInbox, setShareInbox } from './db.js'

/**
 * 系统分享接收 · 接收与暂存层 V1.0
 * ============================================================================
 * 职责（只做接收与暂存，不做解析/提炼——后续由用户选择是否处理）：
 *  1. 注册 ShareTarget 插件的 shareReceived 监听（仅原生平台）；
 *  2. 收到分享文本/链接后按统一格式暂存到内存：
 *     { id, content, source: 'share', receivedAt }
 *  3. 落库（IndexedDB pending 区，键 growth_app_v1_share_inbox）统一经 db.js
 *     的 getShareInbox/setShareInbox：App 启动检查（App.jsx useEffect）与
 *     分享事件回调两个入口都会触发 flushPendingShares()。
 *
 * 平台行为（已核实插件 Android 源码）：
 * - 冷启动：插件 notifyListeners(..., retain=true) 会保留事件直到 JS 注册监听，
 *   注册后自动补发 → 本模块无需额外冷启动兜底；
 * - 热启动：MainActivity 为 singleTask，收到分享走 onNewIntent → 同样触发事件；
 * - Web 浏览器：无原生分享，initShareReceiver 直接跳过（isNativePlatform 保护）。
 */

// 内存暂存区（先进先出；由启动检查消费后清空）
const staging = []
let listenerHandle = null
let lastId = 0

/** 生成单调递增的记录 id（基于时间戳；同一毫秒多条分享也不冲突） */
function nextShareId() {
  const now = Date.now()
  lastId = now > lastId ? now : lastId + 1
  return lastId
}

/** 构造统一格式的分享记录（暂存与后续落库共用同一结构） */
function makeShareRecord(content) {
  return {
    id: nextShareId(),   // 时间戳 id
    content,             // 分享的链接或文本
    source: 'share',     // 来源标记：系统分享
    receivedAt: Date.now(), // 接收时间戳
  }
}

/**
 * 处理一条 shareReceived 事件：提取 texts 逐条入暂存区（空文本过滤）
 * @param {{ title?: string, texts?: string[], files?: Array }} event
 * @returns {number} 本次新增条数
 */
export function stageShareEvent(event) {
  const texts = (Array.isArray(event?.texts) ? event.texts : [])
    .map(t => String(t ?? '').trim())
    .filter(Boolean)
  texts.forEach((content) => staging.push(makeShareRecord(content)))
  return texts.length
}

/** 读取当前暂存内容（快照，不清空） */
export function readStagedShares() {
  return staging.slice()
}

/** 清空暂存（落库成功后调用） */
export function clearStagedShares() {
  staging.length = 0
}

/** 暂存区是否有待处理内容 */
export function hasStagedShares() {
  return staging.length > 0
}

/**
 * 注册分享接收监听（仅原生平台；重复调用安全）
 * @returns {Promise<boolean>} 是否处于原生环境且注册成功
 */
export async function initShareReceiver() {
  if (!Capacitor.isNativePlatform()) return false
  if (listenerHandle) return true
  listenerHandle = await CapacitorShareTarget.addListener('shareReceived', (event) => {
    const count = stageShareEvent(event)
    if (count > 0) {
      console.info('[shareReceiver] 收到系统分享', count, '条')
      // 事件到达时机可能晚于 App 启动检查（冷启动补发场景），这里直接触发落库
      flushPendingShares()
    }
  })
  return true
}

/** 注销监听（App 卸载时清理；正常生命周期内很少触发） */
export async function disposeShareReceiver() {
  if (listenerHandle) {
    await listenerHandle.remove()
    listenerHandle = null
  }
}

// ===== 落库：暂存内容 → IndexedDB pending 区 =====

let flushChain = Promise.resolve()

/**
 * 把暂存内容落库到 IndexedDB pending 区（growth_app_v1_share_inbox，方案A 单键数组）
 * - 串行执行（链式排队），并发触发不会交叉读写造成覆盖/重复
 * - 先同步取出暂存内容再异步写库；写库失败会把内容退回暂存区等待下次重试
 * - 记录格式：{ id, content, source: 'share', status: 'pending', receivedAt }
 * @returns {Promise<number>} 本次实际入库条数
 */
export function flushPendingShares() {
  const run = async () => {
    // 同步取出全部暂存（取出后暂存为空；后续触发只会拿到新内容，不会重复入库）
    const items = staging.splice(0, staging.length)
    if (items.length === 0) return 0
    try {
      const existing = await getShareInbox()
      const existingIds = new Set((existing || []).map(it => it && it.id))
      // 幂等保护：剔除库中已存在的同 id 记录（双保险）；补 status 标记
      const fresh = items
        .filter(it => it && !existingIds.has(it.id))
        .map(it => ({ ...it, status: 'pending' }))
      if (fresh.length === 0) return 0
      await setShareInbox([...(existing || []), ...fresh])
      console.info(`[shareReceiver] ${fresh.length} 条分享已入库 pending 区`)
      return fresh.length
    } catch (err) {
      // 写库失败：退回暂存区，等待下次启动检查/事件触发重试
      staging.unshift(...items)
      console.warn('[shareReceiver] 分享入库失败，已退回暂存区', err)
      return 0
    }
  }
  const result = flushChain.then(run)
  flushChain = result.then(() => {}, () => {})
  return result
}