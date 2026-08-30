import React, { Component } from 'react'
import { dbClearByPrefix } from '../../services/db.js'

/**
 * 全局错误边界（阶段1 新建）
 * - 任何子组件渲染/生命周期异常 → 不再整页白屏
 * - 显示可恢复错误提示：重试当前视图 / 刷新页面 / 清除本地数据
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // 仅做记录，不抛出（避免控制台被刷爆）
    try {
      console.error('[ErrorBoundary]', error, errorInfo)
    } catch (_) { /* ignore */ }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    // 刷新前先清理可能过期的 Service Worker / CacheStorage：
    // APK 覆盖安装后旧缓存会继续吐旧 JS（引用已删除文件），导致「刷新也没用」
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations()
          .then((rs) => rs.forEach((r) => r.unregister()))
          .catch(() => {})
      }
      if (window.caches && caches.keys) {
        caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {})
      }
    } catch (_) { /* ignore */ }
    window.location.reload()
  }

  handleClearData = () => {
    // 存储已迁至 IndexedDB：先清库（内存镜像 + IndexedDB），再清理旧 localStorage
    // 残留（防止下次启动被「一次性迁移」复活旧数据），最后刷新页面
    dbClearByPrefix('growth_app_v1_').then(() => {
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('growth_app_v1_')) localStorage.removeItem(k)
        })
      } catch (_) { /* ignore */ }
      window.location.reload()
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: 24,
          fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: '32px 28px',
            maxWidth: 420,
            width: '100%',
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 42, marginBottom: 12 }}>🛠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
            应用遇到了一点问题
          </div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 20 }}>
            这不是你的错。可以先「重试」或「刷新页面」。
            <br />
            若反复出现，可「清除本地数据」恢复初始状态
            （当前数据不重要，可放心清理）。
          </div>

          {this.state.error && (
            <pre
              style={{
                fontSize: 11,
                color: '#b91c1c',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '8px 12px',
                marginBottom: 20,
                textAlign: 'left',
                maxHeight: 96,
                overflow: 'auto',
                wordBreak: 'break-all',
                whiteSpace: 'pre-wrap',
              }}
            >
              {String(this.state.error?.message || this.state.error).slice(0, 300)}
            </pre>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#6366f1',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔄 重试
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#475569',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ↻ 刷新页面
            </button>
            <button
              onClick={this.handleClearData}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🗑 清除本地数据
            </button>
          </div>
        </div>
      </div>
    )
  }
}
