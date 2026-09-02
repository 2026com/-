/**
 * check-tdz.mjs — 渲染路径 TDZ（先引用后声明）静态检查器
 * 背景：连续两次线上崩溃均为 const/let「声明前被引用」（Cannot access 'X' before initialization）。
 * 规则：同一作用域内，const/let 绑定的引用位置早于声明位置，且引用不在嵌套函数体内
 * （嵌套函数 = 延迟执行，天然豁免）→ 报告。effect/useMemo/useCallback 的依赖数组是
 * 渲染期立即求值的参数表达式 → 会被正确抓到（正是 messages/ve 两次崩溃的模式）。
 * 用法：node scripts/check-tdz.mjs   退出码 0=通过 1=有风险
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser } from 'acorn'
import jsx from 'acorn-jsx'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const parser = Parser.extend(jsx())
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p)
  }
  return out
}

function collectPattern(pat, start, fnDepth, scopes) {
  const bind = (name) => {
    const s = scopes[scopes.length - 1]
    if (!s.bindings.has(name)) s.bindings.set(name, [])
    s.bindings.get(name).push({ start, fnDepth })
  }
  if (pat.type === 'Identifier') bind(pat.name)
  else if (pat.type === 'ObjectPattern') for (const p of pat.properties) collectPattern(p.value || p.argument, start, fnDepth, scopes)
  else if (pat.type === 'ArrayPattern') for (const el of pat.elements) if (el) collectPattern(el, start, fnDepth, scopes)
  else if (pat.type === 'AssignmentPattern') collectPattern(pat.left, start, fnDepth, scopes)
  else if (pat.type === 'RestElement') collectPattern(pat.argument, start, fnDepth, scopes)
}

function checkFile(code, rel, problems) {
  let ast
  try {
    ast = parser.parse(code, { ecmaVersion: 2023, sourceType: 'module', locations: true })
  } catch (e) {
    problems.push(`${rel}: 解析失败 ${e.message}`)
    return
  }
  const scopes = [{ bindings: new Map(), fnDepth: 0 }]

  function visit(node, parent, fnDepth) {
    if (!node || typeof node.type !== 'string') return
    let pushed = false
    if (node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'SwitchCase') {
      scopes.push({ bindings: new Map(), fnDepth })
      pushed = true
    }
    if (node.type === 'VariableDeclaration' && (node.kind === 'const' || node.kind === 'let')) {
      for (const d of node.declarations) collectPattern(d.id, node.start, fnDepth, scopes)
    }
    if (node.type === 'Identifier' && parent) {
      const isPropKey = parent.type === 'MemberExpression' && parent.property === node && !parent.computed
      const isObjKey = parent.type === 'Property' && parent.key === node && !parent.computed
      const isDeclId = parent.type === 'VariableDeclarator' && parent.id === node
      if (!isPropKey && !isObjKey && !isDeclId) {
        for (let i = scopes.length - 1; i >= 0; i--) {
          const starts = scopes[i].bindings.get(node.name)
          if (!starts) continue
          if (fnDepth !== scopes[i].fnDepth) break // 引用在内层函数里 = 延迟执行，豁免
          for (const b of starts) {
            if (b.fnDepth === fnDepth && b.start > node.start) {
              const line = code.slice(0, node.start).split('\n').length
              problems.push(`  ${rel}:${line}  '${node.name}' 在声明之前被引用（渲染/求值路径 TDZ）`)
              break
            }
          }
          break
        }
      }
    }
    const childDepth = FN.has(node.type) ? fnDepth + 1 : fnDepth
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
      const v = node[key]
      if (Array.isArray(v)) {
        for (const c of v) if (c && typeof c.type === 'string') visit(c, node, childDepth)
      } else if (v && typeof v.type === 'string') {
        visit(v, node, childDepth)
      }
    }
    if (pushed) scopes.pop()
  }

  visit(ast, null, 0)
}

const problems = []
const files = walk(SRC)
for (const file of files) {
  const rel = relative(process.cwd(), file).split('\\').join('/')
  checkFile(readFileSync(file, 'utf8'), rel, problems)
}

if (problems.length) {
  console.error(`❌ 发现 ${problems.length} 处渲染路径 TDZ（已扫描 ${files.length} 个文件）：`)
  for (const p of problems) console.error(p)
  process.exit(1)
} else {
  console.log(`✅ ${files.length} 个文件未发现渲染路径 TDZ（先引用后声明）`)
}
