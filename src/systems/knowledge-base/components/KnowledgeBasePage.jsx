import React, { Suspense, lazy } from 'react'

/**
 * 3D知识库（系统五）页面
 *
 * Three.js 相关代码体积较大，通过 React.lazy 拆分为独立 chunk：
 * 仅在用户进入本页面时才下载/执行，不影响应用首屏加载速度。
 * 数据层后续接入 context/reducers/KnowledgeBaseReducer.js。
 */
const KnowledgeGraph3D = lazy(() =>
  import('./KnowledgeGraph3D.jsx')
)

/** 图谱加载骨架（与全局深色主题一致） */
function GraphLoading() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1e1b4b] to-[#0f172a]">
      <div className="relative w-14 h-14 mb-4">
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-xl">🧠</span>
      </div>
      <p className="text-xs text-slate-400">正在构建知识图谱…</p>
    </div>
  )
}

export default function KnowledgeBasePage() {
  return (
    <div className="h-full w-full">
      <Suspense fallback={<GraphLoading />}>
        <KnowledgeGraph3D />
      </Suspense>
    </div>
  )
}

