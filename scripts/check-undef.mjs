/**
 * check-undef.mjs — 静态扫描：找出「使用了 useXxx Hook 但既没 import 也没本地定义」的文件。
 * 背景：vite/rollup 构建时把未定义标识符当作全局变量静默放行，只有运行时才炸
 * （ReferenceError: xxx is not defined，被 ErrorBoundary 兜底）。本脚本补上这道静态检查。
 * 用法：node scripts/check-undef.mjs  （退出码 0=通过，1=发现问题）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p)
  }
  return out
}

const problems = []
for (const file of walk(SRC)) {
  const raw = readFileSync(file, 'utf8')
  const rel = relative(process.cwd(), file)
  // 剥离注释（块注释 + 行注释），避免 JSDoc/说明文字里的 Hook 名造成误报
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\\\w])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))

  // 1) 该文件 import 进来的标识符（含 default / 具名 / as 别名）
  const imported = new Set()
  for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s*['"][^'"]+['"]/g)) {
    const clause = m[1]
    const brace = clause.match(/\{([\s\S]*?)\}/)
    if (brace) {
      for (const part of brace[1].split(',')) {
        const t = part.trim().split(/\s+as\s+/).pop().trim()
        if (/^[\w$]+$/.test(t)) imported.add(t)
      }
    }
    const def = clause.replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ').trim()
    if (def) imported.add(def.split(/\s+/)[0])
  }
  // 动态 import / require 不取标识符，忽略。

  // 2) 本地定义：函数/类/变量（含解构）
  const defined = new Set()
  for (const m of code.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1])
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1])
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.split(':')[0].trim().split(/\s+as\s+/).pop().trim()
      if (/^[\w$]+$/.test(t)) defined.add(t)
    }
  }

  // 3) 使用到的 useXxx Hook（只查这类——正是会运行时炸的高危标识符）
  for (const m of code.matchAll(/\b(use[A-Z][\w$]*)\b/g)) {
    const id = m[1]
    // 跳过对象属性名（如 html2canvas 的 useCORS: true）：标识符后紧跟冒号
    const after = code.slice(m.index + id.length).match(/^\s*:/)
    if (after) continue
    if (imported.has(id) || defined.has(id)) continue
    // 计算行号
    const upto = code.slice(0, m.index)
    const line = upto.split('\n').length
    problems.push(`${rel}:${line}  使用了 ${id} 但未 import 也未定义`)
  }
}

if (problems.length) {
  console.error('❌ 发现未定义的 Hook 引用：')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
} else {
  console.log('✅ 全部 src 文件的 use* Hook 均已正确 import/定义，无运行时 undefined 风险')
}
