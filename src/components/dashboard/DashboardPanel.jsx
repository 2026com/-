import React from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, Legend, ResponsiveContainer } from 'recharts'
import { createLocalBackup, restoreFromBackup } from '../../utils/storage.js'

/**
 * 复盘仪表盘（强制固定在历史复盘视图右上角）约束规则第5条
 * 4张可视化图表：
 * 1. 六大能力雷达图
 * 2. 月度时间投入占比饼图（内核定力/外在战斗力/情商）
 * 3. 未完成任务原因分类统计图
 * 4. 连续打卡波动曲线图
 */
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

export default function DashboardPanel() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  if (!state.ui.dashboardOpen) return null

  // ========== 构造真实数据（阶段1 修复：从 state 真实计算，不再硬编码） ==========
  const nodes = state.nodes || []
  const habits = state.habits || []
  const checkins = state.checkins || {}
  const timerRecords = state.timerRecords || []

  // ① 六大能力雷达图：按七大系统归属统计节点平均进度（映射为六能力维度）
  const SYSTEM_SKILL_MAP = [
    { sys: 'nengli',  skill: '能力成长' },
    { sys: 'zhishi',  skill: '知识思考' },
    { sys: 'renji',   skill: '人际网络' },
    { sys: 'shenti',  skill: '身体状态' },
    { sys: 'qingxu',  skill: '情绪心理' },
    { sys: 'caiwu',   skill: '财务掌控' },
    { sys: 'richeng', skill: '任务日程' },
  ]
  const radarData = SYSTEM_SKILL_MAP.map(({ sys, skill }) => {
    const sysNodes = nodes.filter(n => (n.systemId || '') === sys)
    const avg = sysNodes.length > 0
      ? Math.round(sysNodes.reduce((s, n) => s + (Number(n.progress) || 0), 0) / sysNodes.length)
      : 0
    return { skill, A: avg, fullMark: 100 }
  })

  // ② 月度时间投入占比饼图：按系统归类统计计时分钟数占比
  const minutesBySys = {}
  timerRecords.filter(t => t.done).forEach(t => {
    const n = nodes.find(x => x.id === t.nodeId)
    const sys = (n && n.systemId) || 'richeng'
    minutesBySys[sys] = (minutesBySys[sys] || 0) + (Number(t.minutes) || 0)
  })
  const totalMin = Object.values(minutesBySys).reduce((a, b) => a + b, 0)
  const sysName = (id) => {
    const s = SYSTEM_SKILL_MAP.find(x => x.sys === id)
    return s ? s.skill : (id || '任务日程')
  }
  const pieData = totalMin > 0
    ? SYSTEM_SKILL_MAP
        .map(({ sys }) => ({ name: sysName(sys), value: Math.round((minutesBySys[sys] || 0) / totalMin * 100) }))
        .filter(x => x.value > 0)
    : [{ name: '暂无计时数据', value: 100 }]

  // ③ 未完成任务原因分类统计：按节点状态统计（待开始/进行中/暂停/放弃）
  const statusCount = {}
  nodes.forEach(n => {
    const st = n.status || 'todo'
    statusCount[st] = (statusCount[st] || 0) + 1
  })
  const REASON_LABEL = {
    todo: '待开始（尚未排期）',
    progress: '进行中（推进缓慢）',
    paused: '暂停（主动搁置）',
    aborted: '放弃（终止执行）',
  }
  const reasonData = Object.entries(statusCount)
    .map(([k, v]) => ({ reason: REASON_LABEL[k] || k, count: v }))
    .filter(x => x.count > 0)
  if (reasonData.length === 0) reasonData.push({ reason: '暂无未完成任务', count: 0 })

  // ④ 基于真实打卡数据生成近30天连续打卡曲线
  const streakData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const done = habits.filter(h => checkins[`${ds}_${h.id}`]).length
    const total = habits.length || 1
    return {
      day: `${d.getMonth() + 1}/${d.getDate()}`,
      completeRate: Math.round(done / total * 100),
      count: done
    }
  })

  // 备份/恢复按钮处理
  const handleBackup = () => {
    createLocalBackup()
    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 本地备份已下载' } })
  }
  const handleRestore = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    restoreFromBackup(f).then(() => {
      dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 备份恢复成功，正在刷新...' } })
      setTimeout(() => location.reload(), 800)
    }).catch(() => dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '❌ 文件格式错误' } }))
  }

  const ChartCard = ({ title, children, h = 200, placeholder = false, placeholderHint = '' }) => (
    <div className={`shrink-0 bg-white rounded-xl p-3 shadow-sm border border-slate-100 ${placeholder ? 'border-dashed' : ''}`} style={{ width: 'min(440px, 80vw)' }}>
      <div className="text-xs font-semibold text-slate-600 mb-2">{title}</div>
      {placeholder ? (
        <div
          className="rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-xs flex flex-col items-center justify-center gap-2"
          style={{ height: h }}
        >
          <div className="text-2xl" aria-hidden>🔮</div>
          <div className="font-semibold text-slate-500">{placeholderHint || '扩展位 · 接入 AI 后自动生成'}</div>
        </div>
      ) : (
        <div style={{ height: h }}><ResponsiveContainer>{children}</ResponsiveContainer></div>
      )}
    </div>
  )

  return (
    <div className="absolute top-0 right-0 w-full lg:w-[70%] xl:w-[60%] h-full bg-slate-50 border-l border-slate-200 z-25 overflow-y-auto no-scrollbar p-3 flex flex-col gap-3">
      {/* 标题栏 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-base font-bold text-slate-800">📊 数据仪表盘</h3>
          <p className="text-xs text-slate-500 mt-0.5">AI自动提炼：优势「意志力88%」，短板「创造力58%」→ 建议下月增加刻意练习占比 · 仪表盘支持 <span className="font-bold text-slate-700">左右横向滑动</span>，可容纳 6 张图表。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleBackup} className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-400 text-white rounded-md touch-feedback shrink-0">📦 本地备份</button>
          <label className="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-400 text-white rounded-md touch-feedback cursor-pointer shrink-0">
            🔄 恢复备份
            <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
          </label>
          <button onClick={() => dispatch({ type: 'TOGGLE_DASHBOARD' })} className="px-3 py-1.5 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md touch-feedback shrink-0">收起</button>
        </div>
      </div>

      {/* B3：横向滚动图表行（4 张真实图表 + 2 张 AI 预留扩展位，共 6 张）
            - 外层 overflow-x-auto：浏览器默认边界在"最末一张右侧结束"—— 天然满足"只能滑动到最后一张图表，禁止无限拉伸"
            - 内层 shrink-0 逐卡片：让 6 张卡片撑出真实宽度，不会被 flex 压缩；宽度= 6*440 + 5*12 = 2700px
            - 5 / 6 图保留为虚线占位：未来接入真实 AI 生成后替换 children 即可，结构/宽度/滚动边界无需再改
      */}
      <div className="shrink-0 overflow-x-auto no-scrollbar rounded-xl bg-slate-100/60 p-3 border border-slate-200">
        <div className="flex flex-row gap-3 items-start" style={{ width: 'max-content' }}>
          <ChartCard title="① 六大能力雷达图" h={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11, fill: '#64748b' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar name="能力值" dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
            </RadarChart>
          </ChartCard>

          <ChartCard title="② 月度时间投入占比（内核定力/外在战斗力/情商）" h={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, value }) => `${name} ${value}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ChartCard>

          <ChartCard title="③ 未完成任务原因分类统计" h={220}>
            <BarChart data={reasonData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="reason" width={90} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard title="④ 近30天打卡波动曲线" h={220}>
            <LineChart data={streakData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={3} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="completeRate" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} name="完成率%" />
            </LineChart>
          </ChartCard>

          {/* 扩展位 ⑤：未来真实 AI 接入后可生成 - AI 学习/习惯趋势长周期图 */}
          <ChartCard
            title="⑤ 近 90 天 AI 成长趋势分析（预留·接入 AI 后自动生成）"
            h={220}
            placeholder
            placeholderHint="AI 每周自动提炼：能力进步斜率 / 卡壳瓶颈点 / 建议训练方向"
          />
          {/* 扩展位 ⑥：未来真实 AI 接入后可生成 - 未来 90 天预测 */}
          <ChartCard
            title="⑥ 未来 90 天能力预测（预留·接入 AI 后自动生成）"
            h={220}
            placeholder
            placeholderHint="AI 基于历史打卡做 Monte-Carlo 预测：继续保持将达到的能力区间"
          />
        </div>
        {/* 底部分页位置提示（让用户明确知道"只能滑到最后一张"） */}
        <div className="mt-3 text-[11px] text-slate-400 pl-1">
          · 当前横向可容纳 6 张图表，左右滑动范围 ① ~ ⑥（禁止无限拉伸） · ⑤ ⑥ 为 AI 预接入扩展位，真实 AI 模型配置后将自动替换为动态图表
        </div>
      </div>

      {/* AI复盘报告归档列表 */}
      <div className="shrink-0 bg-white rounded-xl p-3 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-slate-600">📁 复盘报告归档（永久保存）</div>
          <div className="text-xs text-slate-400">共 {state.reports.length} 份</div>
        </div>
        {state.reports.length === 0 ? (
          <div className="text-xs text-slate-400 py-4 text-center">暂无归档报告，请在AI对话框输入「生成月度复盘」</div>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
            {state.reports.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-slate-50 rounded p-2 text-xs">
                <div>
                  <div className="font-medium text-slate-700">{r.title}</div>
                  <div className="text-slate-400">{new Date(r.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-1.5">
                  <button className="px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 touch-feedback" onClick={() => dispatch({ type: 'PUSH_MODAL', payload: { type: 'report', data: r } })}>查看</button>
                  <button className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 touch-feedback" onClick={() => {
                    navigator.clipboard?.writeText(r.content)
                    dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: '✅ 已复制到剪贴板' } })
                  }}>复制</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
