/**
 * check-circular.mjs — 循环依赖检测（自研轻量版：正则解析静态 import，DFS 找环）
 * 用法：node scripts/check-circular.mjs
 * 退出码：0=无环；1=有环
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const EXTS = ['', '.js', '.jsx', '/index.js', '/index.jsx']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p)
  }
  return out
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null // npm 包不参与
  const base = resolve(dirname(fromFile), spec)
  for (const e of EXTS) {
    const cand = base + e
    try { if (existsSync(cand) && statSync(cand).isFile()) return cand } catch { /* ignore */ }
  }
  return null
}

const graph = new Map()
for (const f of walk(SRC)) {
  const code = readFileSync(f, 'utf8')
  const deps = new Set()
  for (const m of code.matchAll(/import\s+[^'";]*?['"]([^'"]+)['"]/g)) {
    const r = resolveImport(f, m[1])
    if (r) deps.add(r)
  }
  graph.set(f, deps)
}

// DFS 找环（从每个节点出发，记录路径）
const color = new Map() // 0=未访问 1=在栈 2=完成
const cycles = []
function dfs(node, path) {
  color.set(node, 1)
  path.push(node)
  for (const dep of graph.get(node) || []) {
    const c = color.get(dep) || 0
    if (c === 1) {
      const idx = path.indexOf(dep)
      cycles.push(path.slice(idx).concat(dep))
    } else if (c === 0) {
      dfs(dep, path)
    }
  }
  path.pop()
  color.set(node, 2)
}
for (const f of graph.keys()) if (!(color.get(f) || 0)) dfs(f, [])

const rel = (p) => p.slice(ROOT.length).split('\\').join('/')
if (cycles.length) {
  console.error(`❌ 发现 ${cycles.length} 条循环依赖链：`)
  const seen = new Set()
  for (const c of cycles) {
    const key = [...c].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    console.error('  ' + c.map(rel).join(' → '))
  }
  process.exit(1)
} else {
  console.log(`✅ ${graph.size} 个模块无循环依赖`)
}
