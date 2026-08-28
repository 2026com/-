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

// 阶段1：PWA Service Worker 注册（autoUpdate：后台自动更新，下次打开生效）
registerSW({ immediate: true })

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
