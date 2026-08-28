import { dbGet, dbSet } from './db.js'

/**
 * 提醒铃声设置（App 内选择，不再去系统设置改渠道铃声）。
 *
 * 原理：Android 通知渠道的铃声创建后不可变，因此「一个铃声 = 一个固定渠道」，
 * 全部渠道由原生启动时直建（见 NotificationChannelsHelper.java）。
 * 切换铃声 = 后续调度改用对应渠道，立即生效，无需重建。
 */

const KEY = 'growth_app_v1_reminder_sound'

/** 内置铃声列表（file 用于 App 内网页试听；native 通知铃声由对应渠道提供） */
export const REMINDER_SOUNDS = [
  { key: 'default', name: '系统默认', desc: '跟随系统通知提示音', file: null },
  { key: 'alarm',   name: '清脆铃声', desc: '双频提示音（推荐）',   file: '/sounds/alarm.wav' },
  { key: 'soft',    name: '柔和提示', desc: '轻柔单音，不打扰',     file: '/sounds/soft.wav' },
  { key: 'urgent',  name: '急促闹铃', desc: '三连急促音，强提醒',   file: '/sounds/urgent.wav' },
]

/** 当前所选铃声 key（持久化于 IndexedDB） */
export function getReminderSound() {
  try {
    const v = dbGet(KEY, 'alarm')
    return REMINDER_SOUNDS.some(s => s.key === v) ? v : 'alarm'
  } catch (e) {
    return 'alarm'
  }
}

/** 保存铃声选择 */
export function setReminderSound(key) {
  try { dbSet(KEY, String(key)) } catch (e) { /* 持久化失败不影响本次 */ }
}

/** 铃声 key → 原生通知渠道 id */
export function channelOfSound(key) {
  const k = REMINDER_SOUNDS.some(s => s.key === key) ? key : 'alarm'
  return 'growth_ring_' + k
}