import { openDB } from 'idb'
import { STORAGE_KEYS } from '../shared/constants/index.js'

/**
 * IndexedDB 统一存储层 V1.0（内存镜像适配层）
 * ============================================================================
 * 本文件是全项目**唯一**允许直接访问 IndexedDB 的模块（架构约束）：
 * 其他文件一律经由本文件导出的方法读写，不得直接调用 idb / indexedDB。
 *
 * 背景（2026-08 localStorage → IndexedDB 迁移）：
 * - 项目状态层（AppContext + 9 个领域 reducer）深度依赖同步存储读，而 IndexedDB
 *   是异步 API，直接替换需重写整个状态层；为满足「只换存储、不改业务逻辑」约束，
 *   本层采用「内存镜像 + 异步落盘」适配：
 *     1. 启动时异步从 IndexedDB 全量加载进内存镜像（dbReady() 作为启动门）；
 *     2. 首次运行发现 IndexedDB 为空时，把旧 localStorage 数据一次性迁移进库
 *        （旧 localStorage 数据保留不删，作为二次兜底）；
 *     3. 同步 API 读写内存镜像，写入同时异步持久化到 IndexedDB；
 *     4. IndexedDB 不可用（隐私模式/旧 WebView）时降级为内存模式，并用旧
 *        localStorage 预热镜像，对齐旧 storage.js「读写失败不阻塞」哲学。
 * - 数据以应用层对象直接存库（无需 JSON 序列化）；仅迁移旧数据时做一次 JSON.parse。
 *
 * 同步 API（dbGet/dbSet/dbRemove/dbClearAll）：供 services/storage.js 等既有
 *   同步调用方使用，签名对齐旧 localStorage 封装；须在 dbReady() 之后调用
 *   （main.jsx 启动门保证）。
 * 异步 API（getAsync/setAsync/removeAsync 与 getNodes/setNodes 等具名方法）：
 *   返回 Promise，写入等待落盘完成，新代码推荐使用。
 */

// ===== 常量 =====
const DB_NAME = 'growth_app_v1_db'
const DB_VERSION = 1
const STORE = 'kv' // 单一 key-value store，语义与 localStorage 对齐

// 笔记独立存储键（定义见 systems/daily-tasks/services/notesStorage.js；
// 此处不 import 该文件，避免 notesStorage → storage → db → notesStorage 循环依赖）
const NOTES_KEY = 'growth_app_notes_v1'

// 知识图谱连线：当前为运行时推导、不持久化；预留键供未来启用
const LINKS_KEY = 'growth_app_v1_links'

// 系统分享 · 待处理队列（收到的分享先入此队，后续由用户选择是否提炼）
const SHARE_INBOX_KEY = 'growth_app_v1_share_inbox'

// ===== 内部状态 =====
const memory = new Map()      // 内存镜像：key → 应用层值
const pendingOps = new Map()  // key → 最近一次落盘 Promise（异步 API 等待用）
let dbPromise = null          // IndexedDB 连接；不可用时 resolve(null) 降级
let readyPromise = null       // 初始化（含迁移）Promise

// ===== 旧 localStorage 迁移范围 =====
// 覆盖应用写入过的全部键：STORAGE_KEYS（growth_app_v1_*）+ 笔记 +
// 知识库图谱缓存/画质偏好 + AI 浮球位置 + 连续打卡提醒标记
function isLegacyAppKey(key) {
  return (
    key.startsWith('growth_app') ||
    key.startsWith('knowledgeGraph.') ||
    key === 'ai.fab.position.v1' ||
    key.startsWith('streak_alert_shown_')
  )
}

/** 旧 localStorage 值 → 应用层值（JSON 字符串则反序列化，原始字符串原样保留） */
function parseLegacyValue(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function collectLegacyEntries() {
  const entries = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && isLegacyAppKey(key)) {
        entries.push([key, parseLegacyValue(localStorage.getItem(key))])
      }
    }
  } catch {
    /* 隐私模式等读不到 localStorage 就跳过迁移 */
  }
  return entries
}

// ===== 初始化 =====
function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    },
  }).catch((err) => {
    console.warn('[db] IndexedDB 打开失败，降级为内存模式', err)
    return null
  })
}

function hydrate() {
  readyPromise = (async () => {
    dbPromise = openDatabase()
    const db = await dbPromise
    if (db) {
      const keys = await db.getAllKeys(STORE)
      if (keys.length === 0) {
        // 首次运行：旧 localStorage 数据一次性迁移进 IndexedDB（旧数据保留不删）
        const legacy = collectLegacyEntries()
        if (legacy.length > 0) {
          const tx = db.transaction(STORE, 'readwrite')
          for (const [key, value] of legacy) {
            memory.set(key, value)
            tx.store.put(value, key)
          }
          await tx.done
          console.info(`[db] 已从 localStorage 迁移 ${legacy.length} 个键到 IndexedDB`)
        }
      } else {
        // 正常启动：全量加载进内存镜像（getAllKeys/getAll 同序）
        const values = await db.getAll(STORE)
        keys.forEach((key, i) => memory.set(key, values[i]))
      }
    } else {
      // 降级模式：旧 localStorage 预热内存镜像（只读兜底）
      for (const [key, value] of collectLegacyEntries()) memory.set(key, value)
    }
  })().catch((err) => {
    // 初始化失败不阻塞启动（镜像为空 → 各调用方拿到 fallback，等同旧版读不到）
    console.warn('[db] 初始化失败，以空镜像启动', err)
  })
  return readyPromise
}

/** 启动门：resolve 表示镜像已就绪（main.jsx 在此之后才渲染应用） */
export function dbReady() {
  if (!readyPromise) hydrate()
  return readyPromise
}

// ===== 同步 API（镜像读写 + 异步落盘；签名对齐旧 localStorage 封装） =====

export function dbGet(key, fallback = null) {
  dbReady() // 幂等；正常流程中启动门已保证就绪
  return memory.has(key) ? memory.get(key) : fallback
}

export function dbSet(key, value) {
  dbReady()
  memory.set(key, value)
  const op = (async () => {
    const db = await dbPromise
    if (db) await db.put(STORE, value, key)
  })().catch((err) => console.warn('[db] 写入失败（不影响运行）', key, err))
  pendingOps.set(key, op)
  return true
}

export function dbRemove(key) {
  dbReady()
  memory.delete(key)
  const op = (async () => {
    const db = await dbPromise
    if (db) await db.delete(STORE, key)
  })().catch((err) => console.warn('[db] 删除失败（不影响运行）', key, err))
  pendingOps.set(key, op)
  return true
}

/** 批量清除（语义对齐旧 storage.clearAll：只清传入的键） */
export function dbClearAll(keys) {
  ;(keys || []).forEach((k) => dbRemove(k))
  return true
}

// ===== 异步 API（返回 Promise；写入等待落盘完成） =====

/** 异步读取（镜像已与 IndexedDB 同步，读镜像即库的当前有效状态） */
export async function getAsync(key, fallback = null) {
  await dbReady()
  return dbGet(key, fallback)
}

/** 异步写入：resolve 于该键落盘 IndexedDB 完成之后 */
export async function setAsync(key, value) {
  await dbReady()
  dbSet(key, value)
  await pendingOps.get(key)
}

/** 异步删除：resolve 于该键从 IndexedDB 删除完成之后 */
export async function removeAsync(key) {
  await dbReady()
  dbRemove(key)
  await pendingOps.get(key)
}

// ===== 具名异步方法（迁移方案要求的业务语义封装，供新代码直接使用） =====

/** 长期目标节点树（STORAGE_KEYS.NODES = growth_app_v1_nodes） */
export const getNodes = () => getAsync(STORAGE_KEYS.NODES, [])
export const setNodes = (nodes) => setAsync(STORAGE_KEYS.NODES, nodes ?? [])

/** 知识图谱连线（预留：当前连线为运行时推导、不持久化） */
export const getLinks = () => getAsync(LINKS_KEY, [])
export const setLinks = (links) => setAsync(LINKS_KEY, links ?? [])

/** 长期目标 · 纯文本记事本（growth_app_notes_v1，结构见 notesStorage.js） */
export const getNotes = () => getAsync(NOTES_KEY, [])
export const setNotes = (notes) => setAsync(NOTES_KEY, notes ?? [])

/** 系统分享 · 待处理队列（元素：{ id, content, source, status: 'pending', receivedAt }，见 shareReceiver.js） */
export const getShareInbox = () => getAsync(SHARE_INBOX_KEY, [])
export const setShareInbox = (items) => setAsync(SHARE_INBOX_KEY, items ?? [])

/**
 * 按前缀清除（内存镜像 + IndexedDB）—— ErrorBoundary「清除本地数据」等紧急恢复场景。
 * 内部自捕获异常、恒 resolve（返回清除的键数量），调用方可安全接力 reload 等动作。
 */
export async function dbClearByPrefix(prefix) {
  try {
    await dbReady()
    const keys = [...memory.keys()].filter((k) => k.startsWith(prefix))
    keys.forEach((k) => dbRemove(k))
    // 兜底扫库：删除镜像之外的库内同名前缀键（理论上不应存在，保险起见）
    const db = await dbPromise
    if (db) {
      const storeKeys = await db.getAllKeys(STORE)
      const stale = storeKeys.filter((k) => k.startsWith(prefix) && !memory.has(k))
      for (const k of stale) await db.delete(STORE, k)
    }
    return keys.length
  } catch (err) {
    console.warn('[db] 按前缀清除失败', prefix, err)
    return 0
  }
}