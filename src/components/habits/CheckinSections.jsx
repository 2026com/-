import React from 'react'
import { HABIT_DIFFICULTY } from '../../utils/constants.js'

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

/** 临时打卡视图：标题行 + 1排5列 卡片矩阵 + 大面积留白 */
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
      {/* 操作区（T4 已删除「新增临时任务」按钮：空格直接新建） */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">今日临时事项 · 一排 5 格</div>
        <div className="text-xs text-slate-400">{tempTasks.length}/{GRID_SIZE_TEMP}</div>
      </div>

      {/* 1 排 5 列 卡片矩阵（T4：点击空格直接新建；点击有卡主体编辑；左上角独立勾选框打卡） */}
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: GRID_SIZE_TEMP }).map((_, i) => {
          const task = tempTasks[i]
          const done = !!task?.done
          return (
            <div
              key={i}
              className={`
                group relative rounded-xl border p-2.5 flex flex-col transition-all touch-feedback aspect-[3/4]
                bg-slate-50 border-slate-200 hover:border-slate-300
                ${task ? 'cursor-pointer' : 'cursor-add'}
                ${done ? 'ring-2 ring-emerald-400 border-emerald-300 bg-emerald-50/50' : ''}
              `}
              onClick={() => {
                if (!task) { onCreateTemp(); return }
                onEditTemp(task.id)
              }}
            >
              {task ? (
                <>
                  {/* T4：左上角独立完成勾选框（三区分离：1.打卡 2.主体编辑 3.右上角编辑/删除） */}
                  <button
                    className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md border-2 flex items-center justify-center text-[10px] transition-all z-10"
                    style={{
                      background: done ? '#10b981' : '#fff',
                      borderColor: done ? '#10b981' : '#cbd5e1',
                      color: done ? '#fff' : '#cbd5e1'
                    }}
                    title={done ? '已完成（点击取消）' : '点击打卡完成'}
                    onClick={(e) => {
                      e.stopPropagation()
                      dispatch({ type: 'TOGGLE_TEMP_TASK_DONE', id: task.id })
                    }}
                  >{done ? '✓' : ''}</button>

                  {/* 右上角图标（备选入口，保留不变） */}
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      className="w-5 h-5 rounded-md bg-white/90 border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center text-[10px]"
                      title="编辑"
                      onClick={(e) => { e.stopPropagation(); onEditTemp(task.id) }}
                    >✏️</button>
                    <button
                      className="w-5 h-5 rounded-md bg-white/90 border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center text-[10px]"
                      title="删除"
                      onClick={(e) => { e.stopPropagation(); confirmTempDelete(task) }}
                    >🗑️</button>
                  </div>

                  {/* 标题（左上预留 26px 勾选框） */}
                  <div className={`text-[12px] font-semibold leading-snug break-words mt-7 ${done ? 'line-through text-emerald-700' : 'text-slate-800'}`}>
                    {task.title}
                  </div>

                  {/* 底部：时间 + 铃铛 */}
                  <div className="mt-auto flex items-center justify-between">
                    <div className="text-[10px] text-slate-500">{task.reminderTime || '全天'}</div>
                    {done ? <span className="text-[12px] text-emerald-500">✓</span> : (
                      task.reminder !== false && <span className="text-[11px] text-slate-400">🔔</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-1 text-slate-400">
                  <span className="text-xl leading-none">＋</span>
                  <span className="text-[10px] leading-tight">空位 · 点击新建</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 大面积留白：简洁低压力 */}
      <div className="mt-16 text-center text-xs text-slate-400">
        · 保持空白，聚焦当下 ·
      </div>
    </section>
  )
}