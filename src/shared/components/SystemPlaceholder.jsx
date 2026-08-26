import React from 'react'

/**
 * 未建成系统的占位页（跨系统复用组件）
 * 七大系统中尚未开发的系统路由先挂载本页，后续按系统逐个替换。
 */
export default function SystemPlaceholder({ name = '该系统', icon = '🚧', description = '' }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-white">
      <div className="text-6xl mb-4">{icon}</div>
      <div className="text-lg font-bold text-slate-800 mb-2">{name}</div>
      <div className="text-xs text-slate-400">{description || '建设中 · 敬请期待'}</div>
    </div>
  )
}