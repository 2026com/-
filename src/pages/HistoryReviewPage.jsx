import React, { useMemo } from 'react'
import { useAppState } from '../context/AppContext.jsx'
import { dateUtil } from '../utils/storage.js'

/**
 * Tab3：历史复盘视图
 * 1-12月纵向时间轴沉淀所有项目
 * 阶段1 修复：月份归类不再用 idx%12 假算法，改为按节点真实 startDate/dueDate 归类
 * 右上角固定【数据仪表盘】独立分页（在App.jsx中根据activeTab条件渲染）
 */
export default function HistoryReviewPage() {
  const state = useAppState()

  // 取节点用于归类的月份（优先 dueDate，其次 startDate，最后 createdAt）
  const nodeMonth = (n) => {
    const raw = n.dueDate || n.startDate || (n.createdAt ? new Date(n.createdAt).toISOString().slice(0, 10) : '')
    if (!raw) return null
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    return Number(m[2])
  }

  // 按真实月份分组的里程碑节点
  const timeline = useMemo(() => {
    const nodes = state.nodes || []
    const byMonth = Array.from({ length: 12 }, (_, i) => i + 1)
    const monthItems = byMonth.map(month => {
      // 属于该月的节点：直接子节点（里程碑）按 dueDate/startDate 所在月归类
      const inMonth = nodes.filter(n => {
        const m = nodeMonth(n)
        return m === month
      })
      return { month, items: inMonth }
    })
    return monthItems
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nodes])

  return (
    <div className="h-full w-full overflow-y-auto no-scrollbar p-4 pb-20">
      {/* 顶部说明 */}
      <div className="bg-gradient-to-r from-slate-100 to-white rounded-xl p-4 mb-4 border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="text-3xl">📚</div>
          <div>
            <div className="text-sm font-bold text-slate-800">历史复盘视图 · 年度纵向时间轴</div>
            <div className="text-xs text-slate-500 mt-0.5">节点按「截止日期 / 开始日期」归属到对应月份 · 点击右上角「数据仪表盘」查看4套自动渲染图表 + AI复盘报告归档</div>
          </div>
        </div>
      </div>

      {/* 12月时间轴 */}
      <div className="relative pl-8">
        {/* 左侧主线 */}
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-indigo-400 via-blue-400 to-emerald-400" />

        {timeline.map(({ month, items }) => {
          // 分组展示：按根节点聚合该月的里程碑
          const roots = (state.nodes || []).filter(n => !n.parentId)
          const grouped = roots.map(r => ({
            root: r,
            children: items.filter(n => n.parentId === r.id || n.id === r.id),
          })).filter(g => g.children.length > 0)

          return (
            <div key={month} className="relative mb-6">
              {/* 月份圆点 */}
              <div className="absolute -left-6 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 z-10" />
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                  <span className="text-sm font-bold text-indigo-600">{month}月</span>
                  <span className="text-xs text-slate-400">· {items.length} 个里程碑节点</span>
                </div>
                {grouped.length === 0 ? (
                  <div className="text-xs text-slate-400 py-2">暂无里程碑记录</div>
                ) : (
                  <div className="space-y-3">
                    {grouped.map((it, i) => (
                      <div key={i} className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: it.root.progress >= 100 ? '#22c55e' : it.root.progress > 50 ? '#3b82f6' : '#f59e0b' }} />
                            <span className="text-sm font-medium text-slate-800">{it.root.title}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{it.root.progress || 0}%</span>
                          </div>
                          {it.root.dueDate && (
                            <span className="text-[10px] text-slate-400">截止 {String(it.root.dueDate).replace(/-/g, '/')}</span>
                          )}
                        </div>
                        {it.children.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {it.children.map(c => (
                              <span key={c.id} className="text-[11px] px-2 py-0.5 bg-white rounded border border-slate-200 text-slate-600">
                                {c.title} <span className="text-indigo-500">{c.progress || 0}%</span>
                                {c.dueDate && <span className="text-slate-400"> · {String(c.dueDate).slice(5)}</span>}
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
          )
        })}
      </div>
    </div>
  )
}
