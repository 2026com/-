import { STORAGE_KEYS, DATA_VERSION, DEFAULT_SETTINGS } from '../utils/constants.js'
import { storage } from '../utils/storage.js'

/**
 * 首次启动初始化 — V1.0 空白纯净模式
 * 【严格遵守用户要求】：不生成任何示例节点、示例习惯、示例打卡记录。
 * 全部默认空数组/空对象，让玩家/操作者拥有最大权限，自行在幕布/打卡面板上创建内容。
 */
export function initMockData() {
  // 画布节点：空（不预置「钢琴学习」「网络安全学习」等任何示例）
  const nodes = []
  // 日常习惯：空
  const habits = []
  // 临时任务：空
  const tempTasks = []
  // 打卡记录：空
  const checkins = {}
  // 计时记录：空
  const timerRecords = []
  // AI对话历史：空
  const aiHistory = []
  // 复盘报告：空
  const reports = []
  // 默认设置（从常量取，不硬编码重复）
  const settings = { ...DEFAULT_SETTINGS }

  // 写入存储
  storage.set(STORAGE_KEYS.NODES, nodes)
  storage.set(STORAGE_KEYS.HABITS, habits)
  storage.set(STORAGE_KEYS.TEMP_TASKS, tempTasks)
  storage.set(STORAGE_KEYS.CHECKINS, checkins)
  storage.set(STORAGE_KEYS.TIMER_RECORDS, timerRecords)
  storage.set(STORAGE_KEYS.AI_HISTORY, aiHistory)
  storage.set(STORAGE_KEYS.REPORTS, reports)
  storage.set(STORAGE_KEYS.SETTINGS, settings)
  storage.set(STORAGE_KEYS.DATA_VERSION, DATA_VERSION)
}
