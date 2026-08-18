import React, { useMemo } from 'react'
import { useAppState } from '../context/AppContext.jsx'
import { dateUtil } from '../utils/storage.js'

/**
 * Tab3：历史复盘视图
 * 1-12月纵向时间轴沉淀所有项目
 * 右上角固定【数据仪表盘】独立分页（在App.jsx中根据activeTab条件渲染）
 */
export default function HistoryReviewPage() {
  const state = useAppState()

  // 按根节点分组的时间轴数据 V1.0示例
  const timeline = useMemo(() => {
    const roots = state.nodes.filter(n => !n.parentId)
    // 12月份
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      const items = roots.map(r => {
        const children = state.nodes.filter(n => n.parentId === r.id)
        const monthChildren = children.filter((_, idx) => idx % 12 === i || i === 11) // 示意分配
        return {
          root: r,
          children: monthChildren,
        }
      }).filter(x => x.children.length > 0 || i === 0 || i === 5 || i === 11)
      return { month, items }
    })
  }, [state.nodes])

  return (
    <div className="h-full w-full overflow-y-auto no-scrollbar p-4 pb-20">
      {/* 顶部说明 */}
      <div className="bg-gradient-to-r from-slate-100 to-white rounded-xl p-4 mb-4 border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="text-3xl">📚</div>
          <div>
            <div className="text-sm font-bold text-slate-800">历史复盘视图 · 年度纵向时间轴</div>
            <div className="text-xs text-slate-500 mt-0.5">点击右上角「数据仪表盘」查看4套自动渲染图表 + AI复盘报告归档</div>
          </div>
        </div>
      </div>

      {/* 12月时间轴 */}
      <div className="relative pl-8">
        {/* 左侧主线 */}
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-indigo-400 via-blue-400 to-emerald-400" />

        {timeline.map(({ month, items }) => (
          <div key={month} className="relative mb-6">
            {/* 月份圆点 */}
            <div className="absolute -left-6 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 z-10" />
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                <span className="text-sm font-bold text-indigo-600">{month}月</span>
                <span className="text-xs text-slate-400">· {items.reduce((s, x) => s + x.children.length, 0)} 个里程碑节点</span>
              </div>
              {items.length === 0 ? (
                <div className="text-xs text-slate-400 py-2">暂无里程碑记录</div>
              ) : (
                <div className="space-y-3">
                  {items.map((it, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: it.root.progress >= 100 ? '#22c55e' : it.root.progress > 50 ? '#3b82f6' : '#f59e0b' }} />
                          <span className="text-sm font-medium text-slate-800">{it.root.title}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{it.root.progress || 0}%</span>
                        </div>
                      </div>
                      {it.children.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {it.children.map(c => (
                            <span key={c.id} className="text-[11px] px-2 py-0.5 bg-white rounded border border-slate-200 text-slate-600">
                              {c.title} <span className="text-indigo-500">{c.progress || 0}%</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
