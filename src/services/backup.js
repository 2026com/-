import { STORAGE_KEYS } from '../shared/constants/index.js'

/**
 * 备份恢复服务 —— 自 storage.js 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：一键全量本地备份（导出 JSON）/ 从备份文件一键恢复
 */

// 一键全量本地备份 V1.0实现
export function createLocalBackup() {
  const snapshot = {}
  Object.values(STORAGE_KEYS).forEach(k => {
    const v = localStorage.getItem(k)
    if (v) snapshot[k] = v
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
            localStorage.setItem(k, v)
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