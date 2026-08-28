/**
 * 数据迁移服务
 *
 * 决策记录（2026-08，更新）：
 * - localStorage → IndexedDB 迁移已落地（方案：内存镜像适配层）：
 *   IndexedDB 访问统一收敛在 src/services/db.js（唯一入口），启动时异步加载
 *   进内存镜像并保留旧 localStorage 数据作兜底，storage.js 同步门面签名不变，
 *   状态层 / reducer / 组件调用点零改动；
 * - 本文件保留为未来「数据结构升级迁移」的入口占位（如后续键结构变更时，
 *   在 runMigrations 中实现 IndexedDB 内的结构化迁移）。
 */

export const MIGRATION_STATUS = {
  CURRENT_STORE: 'IndexedDB（growth_app_v1_db/kv，经 services/db.js）',
  TARGET_STORE: 'IndexedDB（已启用）',
}

/** 占位：未来版本升级时的数据结构迁移入口 */
export function runMigrations() {
  // 当前无待执行迁移
  return true
}