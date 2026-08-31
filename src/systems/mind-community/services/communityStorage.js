import { dbGet, dbSet } from '../../../services/db.js'
import { ME_USER } from './mockData.js'

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
 * 读取板块状态；【已停用种子】不再预置任何模拟内容——首访即空白社区/空白聊天，
 * 社区与好友体系等接入真实用户后开放。旧存档里残留的模拟内容在读取时一次性清洗。
 * 同步返回（db.js 内存镜像语义，启动门已保证就绪）。
 */
export function loadMindState() {
  const saved = dbGet(STORAGE_KEY, null)
  if (saved && typeof saved === 'object' && Array.isArray(saved.posts)) {
    // 旧版本可能残留预置模拟内容 → 只保留「我」真实发的内容
    return { friends: [], likedPostIds: [], chats: {}, ...purgeLegacyMock(saved) }
  }
  const empty = { friends: [], likedPostIds: [], posts: [], chats: {} }
  dbSet(STORAGE_KEY, empty)
  return empty
}

/** 清洗旧版预置的模拟数据：示例帖子(sp*)、模拟用户的帖子、模拟好友(u1-u5)及其聊天记录 */
function purgeLegacyMock(s) {
  const posts = (s.posts || []).filter(p => p && p.userId === ME_USER.id && !/^sp\d+$/.test(p.id || ''))
  const keepIds = new Set(posts.map(p => p.id))
  const likedPostIds = (s.likedPostIds || []).filter(id => keepIds.has(id))
  const chats = {}
  Object.entries(s.chats || {}).forEach(([uid, msgs]) => { if (!/^u\d+$/.test(uid)) chats[uid] = msgs })
  const friends = (s.friends || []).filter(id => !/^u\d+$/.test(id))
  return { ...s, posts, likedPostIds, chats, friends }
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
