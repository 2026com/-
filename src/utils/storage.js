/**
 * 兼容 shim：storage 已迁移至 src/services/storage.js
 * （架构重构临时兼容层，后续统一清理为直接引用新路径）
 */
export * from '../services/storage.js'
export * from '../services/backup.js'