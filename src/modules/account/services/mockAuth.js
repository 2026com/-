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
const SESSION_KEY = 'account.mock.session.v1' // { userId, account, nickname, loginAt }

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
  if (String(pwd || '').length < 6) return '密码至少 6 位'
  return ''
}

function loadUsers() {
  const v = dbGet(USERS_KEY, [])
  return Array.isArray(v) ? v : []
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
  const err = validateAccount(acc) || validatePassword(password)
  if (err) throw new Error(err)
  const user = loadUsers().find(u => u.account === acc)
  // 与真实后端一致：不区分「账号不存在」和「密码错误」，防撞库探测
  if (!user) throw new Error('账号或密码错误')
  const hash = await hashPassword(password, user.salt)
  if (hash !== user.hash) throw new Error('账号或密码错误')
  const session = { userId: user.id, account: user.account, nickname: user.nickname, loginAt: Date.now() }
  dbSet(SESSION_KEY, session)
  return session
}

export function logout() {
  try { dbSet(SESSION_KEY, null) } catch (e) { /* ignore */ }
}

export function getSession() {
  try { return dbGet(SESSION_KEY, null) } catch (e) { return null }
}
