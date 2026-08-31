import { STORAGE_KEYS } from '../../../shared/constants/index.js'
import { NOTES_STORAGE_KEY } from '../../../systems/daily-tasks/services/notesStorage.js'
import { storage } from '../../../services/storage.js'
import * as mockAuth from './mockAuth.js'
import * as mockCloud from './mockCloud.js'

/**
 * 账号系统 · 统一门面（Facade）
 * - 供应商切换只改 ACCOUNT_PROVIDER 一处：'mock'（本地模拟）→ 将来 'tcb'（腾讯云开发）/ 'leancloud'；
 * - 真实接入时：auth 方法换成云 SDK 调用、cloud 方法换成云数据库读写，
 *   AccountPanel 与上层调用方零改动（签名已按真实云端形态设计）；
 * - 同步范围 = 应用全部业务数据键（IndexedDB），排除 DATA_VERSION：
 *   版本号留在设备本地，避免旧版本快照恢复进新版 App 后触发启动时的清库重建。
 */

export const ACCOUNT_PROVIDER = 'mock'

// 需要云同步的业务数据键（新增系统落了新存储键后在此追加）
export const SYNC_KEYS = [
  ...Object.values(STORAGE_KEYS),
  NOTES_STORAGE_KEY, // 长期目标横线本（独立键）
].filter(k => k !== STORAGE_KEYS.DATA_VERSION)

// 认证 API（mockAuth 实现同一签名）
export const register = mockAuth.register
export const login = mockAuth.login
export const logout = mockAuth.logout
export const getSession = mockAuth.getSession
export const validateAccount = mockAuth.validateAccount
export const validatePassword = mockAuth.validatePassword

// 云端 API（mockCloud 实现同一签名）
export const getCloudInfo = mockCloud.getCloudInfo

/** 收集本地全部业务数据 → 快照对象（上传前调用） */
export function collectLocalSnapshot() {
  const snap = {}
  SYNC_KEYS.forEach(k => {
    try {
      const v = storage.get(k, undefined)
      if (v !== undefined && v !== null) snap[k] = v
    } catch (e) { /* 单键失败不阻塞整体 */ }
  })
  return snap
}

/** 快照写入本地（恢复后由调用方刷新应用状态） */
export function applySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 0
  let count = 0
  SYNC_KEYS.forEach(k => {
    if (snapshot[k] !== undefined) {
      try { storage.set(k, snapshot[k]); count++ } catch (e) { /* 单键失败不阻塞整体 */ }
    }
  })
  return count
}

/** 备份当前设备数据到该账号云空间 */
export function uploadToCloud(userId) {
  return mockCloud.uploadSnapshot(userId, collectLocalSnapshot())
}

/** 从该账号云空间拉取快照 */
export function downloadFromCloud(userId) {
  const snap = mockCloud.getSnapshot(userId)
  return snap ? snap.data : null
}
