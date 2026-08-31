/**
 * check-overwrites.mjs — 并行开发覆盖检测
 * 场景：多个 AI 会话并行改同一工作区时，后提交的会话可能把先提交会话的功能整段覆盖掉
 * （last-writer-wins，git 层面无冲突但功能已丢）。本脚本提取区间内每个功能提交新增的
 * 导出符号，逐一验证它们在 HEAD 里是否还存活（同文件 → 全 src 兜底搜索）。
 * 用法：node scripts/check-overwrites.mjs [baseSha=09757a4] [headSha=HEAD]
 * 退出码：0=无丢失；1=有可疑丢失（需人工复核，符号改名也会误报）
 */
import { execSync } from 'node:child_process'

const BASE = process.argv[2] || '09757a4'
const HEAD = process.argv[3] || 'HEAD'

function sh(cmd) { return execSync(cmd, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }) }

const log = sh(`git log --reverse --format=%H ${BASE}..${HEAD}`).trim().split('\n').filter(Boolean)
if (!log.length) { console.log('区间内无提交'); process.exit(0) }

const symbolRes = [
  /export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /export\s+const\s+([A-Za-z_$][\w$]*)/g,
  /export\s+class\s+([A-Za-z_$][\w$]*)/g,
]

function commitFiles(sha) {
  return sh(`git show --name-only --format= ${sha}`).trim().split('\n').map(s => s.trim()).filter(f => f.startsWith('src/'))
}

function addedSymbolsInCommit(sha) {
  const out = []
  for (const f of commitFiles(sha)) {
    let diff = ''
    try { diff = sh(`git show --unified=0 --format= ${sha} -- "${f}"`) } catch { continue }
    for (const m of diff.matchAll(/^\+(?!\+\+)[^\n]*$/gm)) {
      const line = m[0].slice(1)
      for (const re of symbolRes) {
        re.lastIndex = 0
        let mm
        while ((mm = re.exec(line))) out.push({ file: f, symbol: mm[1] })
      }
    }
  }
  return out
}

const headCache = new Map()
function headContent(f) {
  if (!headCache.has(f)) {
    try { headCache.set(f, sh(`git show ${HEAD}:"${f}"`)) } catch { headCache.set(f, '') }
  }
  return headCache.get(f)
}

const srcFiles = sh(`git ls-files src/`).trim().split('\n').filter(f => /\.(js|jsx)$/.test(f))
let victims = 0

for (const sha of log) {
  const short = sha.slice(0, 7)
  const subj = sh(`git log -1 --format=%s ${sha}`).trim().slice(0, 60)
  const syms = addedSymbolsInCommit(sha)
  const missing = []
  for (const { file, symbol } of syms) {
    if (headContent(file).includes(symbol)) continue
    const elsewhere = srcFiles.some(f => headContent(f).includes(symbol))
    if (!elsewhere) missing.push(`${file} :: ${symbol}`)
  }
  const flag = missing.length ? '❌' : '✅'
  console.log(`${flag} ${short} ${subj}（新增符号 ${syms.length}，丢失 ${missing.length}）`)
  missing.forEach(x => { console.log(`     丢失: ${x}`); victims++ })
}

console.log('\n=== 同一文件被区间内多个提交改写（覆盖热区，人工留意）===')
const touch = new Map()
for (const sha of log) for (const f of commitFiles(sha)) {
  if (!touch.has(f)) touch.set(f, [])
  touch.get(f).push(sha.slice(0, 7))
}
for (const [f, shas] of [...touch].sort((a, b) => b[1].length - a[1].length)) {
  if (shas.length > 1) console.log(`  ${f}: ${shas.join(' → ')}`)
}

console.log(victims ? `\n❌ 共 ${victims} 个符号疑似被并行覆盖丢失，需人工复核` : '\n✅ 区间内所有功能提交新增的导出符号在当前 HEAD 全部存活')
process.exit(victims ? 1 : 0)
