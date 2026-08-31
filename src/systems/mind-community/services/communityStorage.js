import { dbGet, dbSet } from '../../../services/db.js'
import { buildSeedState } from './mockData.js'

/**
 * 心理情绪板块 · 本地持久化层（第一期：本地模拟，无后端）
 * ============================================================================
 * - 经由全项目唯一存储入口 src/services/db.js 读写（架构约束：不直接碰 IndexedDB）；
 * - 存储 key 独立定义在本模块内，不修改公共 constants.js；
 * - 数据结构（整个板块一个 key，值为一个对象）：
 *     {
 *       friends:      ['u1', ...]            已加好友的模拟用户 id
 *       likedPostIds: ['sp1', ...]           我点过赞的帖子 id
 *       posts:        [{ id, userId, content, likes, createdAt }]
 *       chats:        { [userId]: [{ id, from: 'me'|userId, content, createdAt }] }
 *     }
 * - 帖子 / 好友 / 消息均为本地模拟：发帖、点赞、加好友、聊天只写本地存储；
 *   将来接入真实后端时，仅需替换本文件的 load/save 实现，组件层不动。
 */

const STORAGE_KEY = 'growth_app_v1_mind_community'

/**
 * 读取板块状态；首次打开（无存档）时用种子数据初始化并落库。
 * 同步返回（db.js 内存镜像语义，启动门已保证就绪）。
 */
export function loadMindState() {
  const saved = dbGet(STORAGE_KEY, null)
  if (saved && typeof saved === 'object' && Array.isArray(saved.posts)) {
    return { friends: [], likedPostIds: [], chats: {}, ...saved }
  }
  // 无存档 → 种子数据初始化并落库
  const seeded = buildSeedState()
  dbSet(STORAGE_KEY, seeded)
  return seeded
}

/** 保存板块状态（写入内存镜像并异步落盘 IndexedDB） */
export function saveMindState(state) {
  return dbSet(STORAGE_KEY, state)
}

/** 相对时间格式化：刚刚 / n分钟前 / n小时前 / 昨天 / 具体日期 */
export function timeAgo(ts) {
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 48 * 60 * 60 * 1000) return '昨天'
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
