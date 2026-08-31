import { dbGet, dbSet } from '../../../services/db.js'

/**
 * 账号系统 · 本地模拟云端（Mock Cloud）
 * - 模拟「远端按账号隔离的数据仓」：每个 userId 一个独立命名空间；
 * - 真实接入 BaaS（腾讯云开发/LeanCloud）后，upload/get 换成云数据库读写，
 *   本文件接口签名保持不变，调用方零改动；
 * - 附带 BroadcastChannel 通知：同浏览器多标签页可感知「云端有新备份」，
 *   用于演示多端同步的交互形态。
 */

const CLOUD_PREFIX = 'account.mock.cloud.v1.'   // + userId → { data: {storageKey: value}, savedAt, device, appVersion }
const CHANNEL_NAME = 'account-mock-cloud'

function deviceName() {
  try {
    const ua = navigator.userAgent
    if (/Android/i.test(ua)) return 'Android'
    if (/iPhone|iPad/i.test(ua)) return 'iOS'
    if (/Windows/i.test(ua)) return 'Windows'
    if (/Mac/i.test(ua)) return 'macOS'
    return 'Web'
  } catch (e) { return '未知设备' }
}

/** 上传快照到该账号的云空间（mock：写入独立命名空间） */
export function uploadSnapshot(userId, snapshot) {
  const rec = { data: snapshot || {}, savedAt: Date.now(), device: deviceName() }
  dbSet(CLOUD_PREFIX + userId, rec)
  try { const ch = new BroadcastChannel(CHANNEL_NAME); ch.postMessage({ type: 'cloud-updated', userId }); ch.close() } catch (e) { /* ignore */ }
  return rec
}

/** 读取该账号的云端快照（无备份返回 null） */
export function getSnapshot(userId) {
  try { return dbGet(CLOUD_PREFIX + userId, null) } catch (e) { return null }
}

/** 云端备份概要（面板展示用） */
export function getCloudInfo(userId) {
  const snap = getSnapshot(userId)
  if (!snap) return null
  return { savedAt: snap.savedAt, device: snap.device, keyCount: Object.keys(snap.data || {}).length }
}

/** 订阅「云端有更新」事件（多标签页演示用；真实云端阶段换成长轮询/推送） */
export function onCloudUpdated(cb) {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.onmessage = (e) => { if (e.data?.type === 'cloud-updated') cb(e.data) }
    return () => { try { ch.close() } catch (err) { /* ignore */ } }
  } catch (e) { return () => {} }
}
