/**
 * 数据迁移服务（占位）
 *
 * 决策记录（2026-08）：
 * - 经确认，当前阶段**继续以 localStorage 为唯一数据源与运行时存储**，保持同步 API 不变；
 * - IndexedDB 异步化需要重写整个状态层（所有 reducer 与 50+ 调用点），作为独立专项另行排期；
 * - 本文件保留为未来迁移的入口占位，届时在此实现 localStorage → IndexedDB 的结构化迁移。
 */

export const MIGRATION_STATUS = {
  CURRENT_STORE: 'localStorage',
  TARGET_STORE: 'IndexedDB（未启用，待专项）',
}

/** 占位：未来版本升级时的数据结构迁移入口 */
export function runMigrations() {
  // 当前无待执行迁移
  return true
}