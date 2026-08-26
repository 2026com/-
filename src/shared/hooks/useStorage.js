import { storage } from '../../services/storage.js'

/**
 * 通用存储读写 hook —— 共享层（对应原架构规划的 useStorage）
 * 说明：当前全局状态走 AppContext（同步 localStorage），本 hook 提供**非全局 key**
 *       （如笔记等系统内独立数据）的轻量读写封装；不与 AppContext 抢职责。
 */

/** 同步读取指定 key */
export function loadValue(key, fallback = null) {
  return storage.get(key, fallback)
}

/** 同步写入指定 key */
export function saveValue(key, value) {
  return storage.set(key, value)
}

/**
 * 从指定 key 加载列表数据（脏数据兜底为空数组）
 * @param {string} key
 * @returns {Array}
 */
export function loadList(key) {
  const v = storage.get(key, [])
  return Array.isArray(v) ? v : []
}