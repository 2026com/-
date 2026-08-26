import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // 阶段1：PWA 支持（离线可用 + 可安装到桌面/手机）
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon-192x192.png', 'pwa-icon-512x512.png', 'pwa-icon-96x96.png'],
      manifest: {
        name: '个人成长强者体系',
        short_name: '成长APP',
        description: '七大系统 · 思维导图 · AI学习方法 · 计时打卡 · 数据复盘',
        theme_color: '#6366f1',
        background_color: '#1e1b4b',
        display: 'standalone',
        orientation: 'any',
        lang: 'zh-CN',
        icons: [
          { src: '/pwa-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: '一键番茄钟',
            short_name: '番茄钟',
            description: '立即启动25分钟番茄工作法',
            url: '/goals?action=pomodoro',
            icons: [{ src: '/pwa-icon-96x96.png', sizes: '96x96' }],
          },
          {
            name: '快速打卡',
            short_name: '打卡',
            description: '完成今日所有习惯打卡',
            url: '/daily?action=checkin',
            icons: [{ src: '/pwa-icon-96x96.png', sizes: '96x96' }],
          },
          {
            name: '当日待办',
            short_name: '待办',
            description: '查看今日习惯清单',
            url: '/daily',
            icons: [{ src: '/pwa-icon-96x96.png', sizes: '96x96' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/api\/deepseek|\/chat\/completions/,
            handler: 'NetworkOnly',
            options: {},
          },
        ],
      },
      devOptions: {
        enabled: true, // 开发环境也启用 PWA，便于联调
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})

