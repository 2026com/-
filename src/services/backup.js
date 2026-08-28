import { STORAGE_KEYS } from '../shared/constants/index.js'
import { storage } from './storage.js'

/**
 * 备份恢复服务 —— 自 storage.js 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：一键全量本地备份（导出 JSON）/ 从备份文件一键恢复
 */

// 一键全量本地备份 V1.0实现
export function createLocalBackup() {
  const snapshot = {}
  Object.values(STORAGE_KEYS).forEach(k => {
    // 存储已迁至 IndexedDB：经 storage 门面读取内存镜像；
    // 备份文件格式保持与旧版一致（值为 JSON 字符串）
    const v = storage.get(k)
    if (v !== null && v !== undefined) snapshot[k] = JSON.stringify(v)
  })
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString().slice(0, 16).replace(/\D/g, '')
  a.href = url
  a.download = `成长APP备份_${ts}.json`
  a.click()
  URL.revokeObjectURL(url)
  return true
}

// 一键从备份文件恢复 V1.0实现
export function restoreFromBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        Object.entries(data).forEach(([k, v]) => {
          if (Object.values(STORAGE_KEYS).includes(k)) {
            // 存储已迁至 IndexedDB：备份文件里的 JSON 字符串先反序列化再入库
            // （与旧版「写原始字符串 + 读取时 JSON.parse」的最终状态等价）
            let value = v
            try { if (typeof value === 'string') value = JSON.parse(value) } catch { /* 非 JSON 字符串原样保留 */ }
            storage.set(k, value)
          }
        })
        resolve(true)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}