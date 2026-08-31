/**
 * check-conflicts.mjs — 并行开发撞名/断层盘点（三个小节）
 * A. 存储键撞车：localStorage/IndexedDB(db.js) 键全量清单，同名 key 被多个文件使用 → 报告
 * B. 原生桥断层：Android @PluginMethod 清单 vs JS 侧 AppBridge.* 调用清单，双向对照
 * C. 重复导出：不同文件导出同名函数/常量（并行会话各造一个轮子的典型信号）
 * 用法：node scripts/check-conflicts.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p)
  }
  return out
}
const files = walk(SRC)
const codeOf = new Map(files.map(f => [f, readFileSync(f, 'utf8')]))
const strip = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\\w])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))

// ===== A. 存储键 =====
console.log('=== A. 存储键清单与撞车检查 ===')
const keyUsers = new Map() // key -> [{file,line}]
const keyRes = [
  /localStorage\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g,
  /\bdb(?:Get|Set)\(\s*['"`]([^'"`]+)['"`]/g,
]
for (const [f, raw] of codeOf) {
  const code = strip(raw)
  const rel = relative(ROOT, f)
  for (const re of keyRes) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code))) {
      const line = code.slice(0, m.index).split('\n').length
      if (!keyUsers.has(m[1])) keyUsers.set(m[1], [])
      keyUsers.get(m[1]).push({ file: `${rel}:${line}` })
    }
  }
}
const allKeys = [...keyUsers.keys()].sort()
console.log(`共发现 ${allKeys.length} 个字面量存储键`)
let clashes = 0
for (const k of allKeys) {
  const users = keyUsers.get(k)
  const distinct = new Set(users.map(u => u.file.split(':')[0].replace(/\\/g, '/')))
  if (distinct.size > 1) {
    clashes++
    console.log(`  ⚠️  "${k}" 被 ${distinct.size} 个文件使用:`)
    users.forEach(u => console.log(`      ${u.file}`))
  }
}
console.log(clashes ? `⚠️ ${clashes} 个键跨文件共用（若同义则无害，若两功能各写各的含义则撞车）` : '✅ 无跨文件共用的键')

// ===== B. 原生桥对照 =====
console.log('\n=== B. 原生桥：@PluginMethod vs JS AppBridge.* 调用 ===')
let native = new Set()
try {
  const java = readFileSync(join(ROOT, 'android/app/src/main/java/com/growth/xiaomei/AppBridgePlugin.java'), 'utf8')
  native = new Set([...java.matchAll(/@PluginMethod\s+public\s+void\s+(\w+)\s*\(/g)].map(m => m[1]))
} catch { console.log('  (未找到 AppBridgePlugin.java)') }
const jsCalls = new Map()
for (const [f, raw] of codeOf) {
  const code = strip(raw)
  let m
  const re = /\bAppBridge\.(\w+)\s*\(/g
  while ((m = re.exec(code))) {
    const rel = relative(ROOT, f)
    if (!jsCalls.has(m[1])) jsCalls.set(m[1], new Set())
    jsCalls.get(m[1]).add(rel.split('\\').pop())
  }
}
let broken = 0
for (const [name, callers] of jsCalls) {
  if (!native.has(name)) { broken++; console.log(`  ❌ JS 调用 AppBridge.${name}() 但原生无此方法（调用方: ${[...callers].join(', ')}）`) }
}
const uncalled = [...native].filter(n => !jsCalls.has(n))
console.log(`原生方法 ${native.size} 个 / JS 调用 ${jsCalls.size} 个`)
if (broken) console.log(`❌ ${broken} 个断层：JS 调了不存在的原生方法`)
if (uncalled.length) console.log(`ℹ️ 原生有但 JS 未调用（供参考）: ${uncalled.join(', ')}`)
if (!broken) console.log('✅ JS 调用的每个原生方法都存在')

// ===== C. 重复导出 =====
console.log('\n=== C. 跨文件同名导出（并行造轮子信号）===')
const exportOwner = new Map()
const expRes = [/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, /export\s+const\s+([A-Za-z_$][\w$]*)/g, /export\s+class\s+([A-Za-z_$][\w$]*)/g]
for (const [f, raw] of codeOf) {
  const code = strip(raw)
  const rel = relative(ROOT, f).split('\\').join('/')
  for (const re of expRes) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code))) {
      if (!exportOwner.has(m[1])) exportOwner.set(m[1], [])
      exportOwner.get(m[1]).push(rel)
    }
  }
}
let dups = 0
for (const [name, owners] of [...exportOwner].sort()) {
  if (owners.length > 1) {
    dups++
    console.log(`  ⚠️  ${name}: ${owners.join(' | ')}`)
  }
}
console.log(dups ? `⚠️ ${dups} 个同名导出（常见于工具函数各写一份，通常无害但需过目）` : '✅ 无跨文件同名导出')
