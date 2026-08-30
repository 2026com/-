import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import { registerSW } from 'virtual:pwa-register'
import { dbReady } from './services/db.js'
import { initTheme } from './services/theme.js'
import './index.css'
import './responsive.css'

// PWA Service Worker：仅浏览器（PWA）注册。
// APK 原生壳里【禁止注册】并主动反注册历史 SW + 清缓存——否则覆盖安装后
// 旧 SW 会继续吐旧缓存的 index.html/旧 JS（引用已删除的旧哈希文件），
// 表现为「重试/刷新都无效」的启动异常。
const IS_NATIVE_SHELL = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
if (IS_NATIVE_SHELL) {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {})
    }
    if (window.caches && caches.keys) {
      caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {})
    }
  } catch (e) { /* ignore */ }
} else {
  // 浏览器（PWA）：autoUpdate，后台自动更新，下次打开生效
  registerSW({ immediate: true })
}

// 存储启动门：IndexedDB（经 services/db.js 内存镜像）加载/迁移完成后再渲染，
// 保证 bootInitialState 同步读取 storage 时镜像已就绪（避免首帧闪空数据）
dbReady().then(() => {
  // 恢复持久化主题（浅色/深色）：首次渲染前应用，避免闪白
  initTheme()
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppProvider>
            <App />
          </AppProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>,
  )
})
