import { dbGet, dbSet } from '../../../services/db.js'

/**
 * 账号系统 · 本地模拟认证（Mock Auth）
 * - 目的：在后端/BaaS 接入前，把「注册 / 登录 / 会话」的完整流程和界面先跑通；
 * - 存储 IndexedDB（经 db.js），数据不出设备；
 * - 安全说明（演示原则与真实后端一致）：数据库只存「盐 + 加密后的密码」，
 *   绝不存明文——真实接入腾讯云开发/LeanCloud 后，这部分由云端账号系统接管；
 * - crypto.subtle 需要安全上下文（localhost / Capacitor https 均满足）。
 */

const USERS_KEY = 'account.mock.users.v1'     // [{ id, account, nickname, salt, hash, createdAt }]
const SESSION_KEY = 'account.mock.session.v1' // { userId, account, nickname, loginAt, lastActiveAt }
const LOGIN_GUARD_KEY = 'account.mock.loginGuard.v1' // { [account]: { fails, lockedUntil } }

// 安全参数（真实云端阶段由服务端接管同样的规则）
const MAX_FAILS = 5                    // 连续错 5 次
const LOCK_MS = 10 * 60 * 1000        // 锁定 10 分钟
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000  // 30 天不活动 → 会话过期需重新登录
const SESSION_TOUCH_MS = 3600 * 1000  // 活动时间回写节流（1 小时内多次使用不重复写）

// ========== 密码加密（盐 + SHA-256） ==========
function randomSalt() {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}::${password}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ========== 校验 ==========
export function validateAccount(account) {
  const v = String(account || '').trim()
  const isPhone = /^1[3-9]\d{9}$/.test(v)
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  if (!isPhone && !isEmail) return '请输入正确的手机号或邮箱'
  return ''
}
export function validatePassword(pwd) {
  const v = String(pwd || '')
  if (v.length < 8) return '密码至少 8 位'
  // 强制字母+数字混合：纯数字/纯字母密码可被秒级爆破（弱密码是账号被盗的头号原因）
  if (!/[a-zA-Z]/.test(v) || !/\d/.test(v)) return '密码需同时包含字母和数字'
  return ''
}

function loadUsers() {
  const v = dbGet(USERS_KEY, [])
  return Array.isArray(v) ? v : []
}

function loadGuard() {
  const v = dbGet(LOGIN_GUARD_KEY, {})
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}
}

// ========== 对外 API（与未来真实云端账号系统保持同一签名） ==========
export async function register({ account, password, nickname }) {
  const acc = String(account || '').trim()
  const err = validateAccount(acc) || validatePassword(password)
  if (err) throw new Error(err)
  const users = loadUsers()
  if (users.some(u => u.account === acc)) throw new Error('该账号已注册，请直接登录')
  const salt = randomSalt()
  const user = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    account: acc,
    nickname: String(nickname || '').trim() || acc.slice(0, 3) + '****' + acc.slice(-2),
    salt,
    hash: await hashPassword(password, salt),
    createdAt: Date.now(),
  }
  users.push(user)
  dbSet(USERS_KEY, users)
  return login({ account: acc, password })
}

export async function login({ account, password }) {
  const acc = String(account || '').trim()
  if (!acc || !password) throw new Error('请输入账号和密码')
  // ===== 限流：连续错 5 次锁定 10 分钟（防脚本暴力试密码；mock 为设备本地实现，真实云端由服务端限流接管） =====
  const guard = loadGuard()
  const g = guard[acc]
  if (g?.lockedUntil && Date.now() < g.lockedUntil) {
    const mins = Math.ceil((g.lockedUntil - Date.now()) / 60000)
    throw new Error(`尝试次数过多，已临时锁定，请约 ${mins} 分钟后再试`)
  }
  const user = loadUsers().find(u => u.account === acc)
  // 与真实后端一致：不区分「账号不存在」和「密码错误」，防撞库探测
  const fail = () => {
    const cur = loadGuard()[acc] || { fails: 0 }
    const fails = (cur.fails || 0) + 1
    const next = { ...loadGuard(), [acc]: { fails, lockedUntil: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0 } }
    dbSet(LOGIN_GUARD_KEY, next)
    throw new Error('账号或密码错误')
  }
  if (!user) fail()
  const hash = await hashPassword(password, user.salt)
  if (hash !== user.hash) fail()
  // 登录成功：清零该账号的失败计数
  const okGuard = { ...loadGuard() }
  delete okGuard[acc]
  dbSet(LOGIN_GUARD_KEY, okGuard)
  const session = { userId: user.id, account: user.account, nickname: user.nickname, loginAt: Date.now(), lastActiveAt: Date.now() }
  dbSet(SESSION_KEY, session)
  return session
}

export function logout() {
  try { dbSet(SESSION_KEY, null) } catch (e) { /* ignore */ }
}

export function getSession() {
  try {
    const s = dbGet(SESSION_KEY, null)
    if (!s) return null
    const last = s.lastActiveAt || s.loginAt || 0
    // 30 天不活动 → 会话过期（设备丢了别人也进不来；滑动续期：继续使用则自动延长）
    if (Date.now() - last > SESSION_TTL_MS) {
      dbSet(SESSION_KEY, null)
      return null
    }
    if (Date.now() - last > SESSION_TOUCH_MS) {
      dbSet(SESSION_KEY, { ...s, lastActiveAt: Date.now() })
    }
    return s
  } catch (e) { return null }
}
