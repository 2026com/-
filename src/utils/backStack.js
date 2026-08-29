/**
 * 局部浮层返回键关闭栈（LIFO）
 * - 背景：安卓返回键/侧滑返回原先会直接退出 App；现在由 MainActivity 统一拦截并派发
 *   window 'backbutton' 事件（见 App.jsx），前端按「全局弹窗栈 → 本栈 → 全局面板 →
 *   回首页 → 双击退出」的优先级决策。
 * - 本栈负责「不在 ui.modalStack 里、由组件 useState 自绘」的浮层：
 *   时间选择器 / 习惯&临时任务表单 / 提醒自检面板 等。
 * - 组件在浮层打开时 push 关闭回调（通常在 useEffect 中，返回解绑函数）；
 *   返回键触发时弹栈执行最上层的关闭回调 → 后开的浮层先关，符合视觉层级。
 */
const stack = []

/** 注册一个关闭回调，返回解绑函数（可直接作为 useEffect 的清理函数） */
export function pushBackHandler(fn) {
  if (typeof fn !== 'function') return () => {}
  stack.push(fn)
  return () => popBackHandler(fn)
}

/** 解绑指定回调（按最后一次注册匹配） */
export function popBackHandler(fn) {
  const i = stack.lastIndexOf(fn)
  if (i >= 0) stack.splice(i, 1)
}

/** 尝试关闭最上层浮层：有可关闭浮层返回 true；栈空返回 false */
export function runTopBackHandler() {
  const fn = stack.pop()
  if (!fn) return false
  try { fn() } catch (e) { /* 单个浮层关闭异常不阻塞其余逻辑 */ }
  return true
}

/** 当前是否有待关闭的局部浮层 */
export function hasBackHandlers() {
  return stack.length > 0
}
