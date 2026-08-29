import React from 'react'
import { HABIT_DIFFICULTY } from '../../../../utils/constants.js'

/**
 * 打卡列表组件 —— 自 DailyHabitsPage.jsx 原样拆分（只移动代码位置，不改业务逻辑）
 * 包含：日常打卡视图（操作行 + 3×3 卡片矩阵）、临时打卡视图（标题行 + 1×5 卡片矩阵 + 留白）
 * 只负责列表渲染；打卡/编辑/删除等交互通过 dispatch 与回调上抛给页面主组件
 */

export const GRID_SIZE_DAILY = 9 // 日常：3列 × 3行 = 9张卡片
export const GRID_SIZE_TEMP = 5  // 临时：一排5格（5列 × 1行）

/** 日常打卡视图：操作区（番茄计时/批量打卡入口）+ 3列×3行 卡片矩阵 */
export function DailySection({
  visible, habits, checkins, today, dispatch, toast,
  confirmHabitDelete,
  onOpenPomodoro, onOpenBatch, onCreateHabit, onEditHabit,
}) {
  return (
    <section
      className={`absolute inset-0 transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-4 pointer-events-none'
      }`}
    >
      {/* 操作区（T4 已删除「新增习惯」按钮：空格直接新建） */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => {
            if (habits.length === 0) { toast('请先新增一个习惯，再启动番茄计时'); return }
            onOpenPomodoro()
          }}
          className="px-3 py-2 text-xs font-medium bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 touch-feedback"
        >番茄计时</button>
        <button
          onClick={() => {
            if (habits.length === 0) { toast('暂无习惯可以批量打卡'); return }
            onOpenBatch()
          }}
          className="px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 touch-feedback"
        >批量打卡</button>
        <div className="flex-1" />
        <div className="text-xs text-slate-400">{habits.length}/{GRID_SIZE_DAILY} · 日常习惯</div>
      </div>

      {/* 3列 × 3行 卡片矩阵（T4：点击空格直接新建；点击有卡主体编辑；左上角独立勾选框打卡） */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: GRID_SIZE_DAILY }).map((_, i) => {
          const habit = habits[i]
          const checked = habit && !!checkins[`${today}_${habit.id}`]
          const diff = habit ? HABIT_DIFFICULTY.find(d => d.k === (habit.difficulty || 'normal')) : null
          return (
            <div
              key={i}
              className={`
                group relative rounded-xl border p-3 flex flex-col transition-all touch-feedback aspect-[4/3.5]
                bg-slate-50 border-slate-200 hover:border-slate-300
                ${habit ? 'cursor-pointer' : 'cursor-add'}
                ${checked ? 'ring-2 ring-emerald-400 border-emerald-300 bg-emerald-50/50' : ''}
              `}
              onClick={() => {
                if (!habit) { onCreateHabit(); return }
                onEditHabit(habit.id)
              }}
            >
              {habit ? (
                <>
                  {/* T4：左上角独立打卡勾选框（三区分离：1.打卡 2.主体编辑 3.右上角编辑/删除） */}
                  <button
                    className="absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center text-xs transition-all z-10"
                    style={{
                      background: checked ? '#10b981' : '#fff',
                      borderColor: checked ? '#10b981' : '#cbd5e1',
                      color: checked ? '#fff' : '#cbd5e1'
                    }}
                    title={checked ? '已完成（点击取消）' : '点击打卡'}
                    onClick={(e) => {
                      e.stopPropagation()
                      dispatch({ type: 'TOGGLE_CHECKIN', payload: { date: today, habitId: habit.id } })
                    }}
                  >{checked ? '✓' : ''}</button>

                  {/* 右上角操作图标（备选入口，保留不变） */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      className="w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center text-xs"
                      title="编辑"
                      onClick={(e) => { e.stopPropagation(); onEditHabit(habit.id) }}
                    >✏️</button>
                    <button
                      className="w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center text-xs"
                      title="删除"
                      onClick={(e) => { e.stopPropagation(); confirmHabitDelete(habit) }}
                    >🗑️</button>
                  </div>

                  {/* 标题（左侧预留 28px 勾选框空间） */}
                  <div className={`text-sm font-semibold leading-snug pl-8 pr-12 break-words ${checked ? 'line-through text-emerald-700' : 'text-slate-800'}`}>
                    {habit.title}
                  </div>

                  {/* 底部：时长 + 难度 + 勾选图标 */}
                  <div className="mt-auto pl-8 flex items-end justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] text-slate-500">
                        {habit.estMinutes ? `${habit.estMinutes} 分钟` : ''}
                        {habit.reminder ? ` · 🔔 ${habit.reminder}` : ''}
                      </div>
                      {diff && (
                        <span className="text-[10px] text-slate-400">{diff.badge}</span>
                      )}
                    </div>
                    <div className="text-base">
                      {checked ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">⌄</span>}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 text-slate-400">
                  <span className="text-2xl leading-none">＋</span>
                  <span className="text-[11px] leading-tight">空白卡片<br />点击直接新建</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * 临时打卡视图：闹钟 App 风格列表（大号时间 + 任务标题 + 右侧完成开关）。
 * 参考系统闹钟界面：每行一张大卡片，时间为主视觉，开关控制完成态；
 * 列表末尾常驻「＋ 新增临时提醒」行；点击卡片主体进入编辑。
 */
export function TempSection({
  visible, tempTasks, dispatch,
  confirmTempDelete, onCreateTemp, onEditTemp,
}) {
  return (
    <section
      className={`absolute inset-0 transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-4 pointer-events-none'
      }`}
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">今日临时事项 · 闹钟式提醒</div>
        <div className="text-xs text-slate-400">{tempTasks.length} 条</div>
      </div>

      {/* 闹钟式卡片列表 */}
      <div className="space-y-2.5">
        {tempTasks.map(task => {
          const done = !!task.done
          // 时间拆解：24h → 上午/下午 + 12h 大号显示（闹钟 App 同款版式）
          const m = String(task.reminderTime || '').match(/^(\d{1,2}):(\d{2})$/)
          const h24 = m ? Number(m[1]) : 0
          const ampm = h24 < 12 ? '上午' : '下午'
          const h12 = h24 % 12 === 0 ? 12 : h24 % 12
          const bigTime = m ? `${String(h12).padStart(2, '0')}:${m[2]}` : (task.reminderTime || '--:--')
          return (
            <div
              key={task.id}
              className={`group relative rounded-2xl border p-4 pr-3 flex items-center gap-3 transition-all touch-feedback bg-slate-50 border-slate-200 hover:border-slate-300 ${
                done ? 'ring-2 ring-emerald-400 border-emerald-300 bg-emerald-50/40' : ''
              }`}
              onClick={() => onEditTemp(task.id)}
            >
              {/* 大号时间（闹钟主视觉） */}
              <div className="flex items-baseline gap-1 shrink-0">
                <span className={`text-[11px] font-medium ${done ? 'text-emerald-600' : 'text-slate-500'}`}>{ampm}</span>
                <span className={`text-[34px] leading-none font-light tabular-nums tracking-tight ${done ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {bigTime}
                </span>
              </div>

              {/* 标题 + 提醒说明 */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold leading-snug break-words ${done ? 'line-through text-emerald-700' : 'text-slate-800'}`}>
                  {task.title}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {task.reminder !== false ? '🔔 到点提醒 + 提示音' : '仅记录 · 不提醒'}
                  {done ? ' · 已完成' : ''}
                </div>
              </div>

              {/* 右侧大开关（完成态 = ON，绿色） */}
              <button
                className="shrink-0 w-[52px] h-[30px] rounded-full relative transition-colors duration-200"
                style={{ background: done ? '#10b981' : '#e2e8f0' }}
                title={done ? '已完成（点击撤销）' : '点击打卡完成'}
                onClick={(e) => {
                  e.stopPropagation()
                  dispatch({ type: 'TOGGLE_TEMP_TASK_DONE', id: task.id })
                }}
              >
                <span
                  className="absolute top-[3px] w-6 h-6 rounded-full bg-white shadow transition-all duration-200"
                  style={{ left: done ? '25px' : '3px' }}
                />
              </button>

              {/* 右上角编辑/删除（hover 出现，手机长按主体进编辑） */}
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  className="w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center text-[11px]"
                  title="编辑"
                  onClick={(e) => { e.stopPropagation(); onEditTemp(task.id) }}
                >✏️</button>
                <button
                  className="w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center text-[11px]"
                  title="删除"
                  onClick={(e) => { e.stopPropagation(); confirmTempDelete(task) }}
                >🗑️</button>
              </div>
            </div>
          )
        })}

        {/* 末尾常驻「＋ 新增」行（闹钟 App 同款交互） */}
        <button
          onClick={onCreateTemp}
          className="w-full rounded-2xl border border-dashed border-slate-300 p-4 flex items-center gap-3 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 touch-feedback transition-all"
        >
          <span className="text-[28px] leading-none font-light">＋</span>
          <span className="text-sm font-medium">新增临时提醒</span>
        </button>
      </div>

      {/* 大面积留白：简洁低压力 */}
      <div className="mt-10 text-center text-xs text-slate-400">
        · 保持空白，聚焦当下 ·
      </div>
    </section>
  )
}