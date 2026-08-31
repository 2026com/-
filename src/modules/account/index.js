/**
 * 独立模块：账号系统（account）
 * - 当前阶段：本地模拟后端（注册/登录/云备份/恢复 全流程可演示，数据不出设备）；
 * - 真实接入 BaaS（腾讯云开发 / LeanCloud）时，只需在 services/accountService.js
 *   切换 ACCOUNT_PROVIDER 并替换服务实现，界面与调用方零改动。
 */
export { default as AccountPanel } from './components/AccountPanel.jsx'
