import React, { useState, useMemo } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext.jsx'
import { dateUtil } from '../utils/storage.js'
import { HABIT_DIFFICULTY } from '../utils/constants.js'

const GRID_SIZE_DAILY = 9 // 日常：3列 × 3行 = 9张卡片
const GRID_SIZE_TEMP = 5  // 临时：一排5格（5列 × 1行）

/**
 * 双页打卡真实交互版
 * 日常打卡（3列×4行=12卡）/ 临时打卡（6列×2行=12卡）
 * 全部增删改查 / 批量打卡 / 番茄计时 均为本页弹窗，不跳路由
 * 数据 100% 走 reducer → localStorage 持久化，刷新不丢
 */
export default function DailyHabitsPage() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const today = dateUtil.today()
  const [view, setView] = useState('daily') // 'daily' | 'temp'

  // ---------- 弹窗控制（页面内自绘 overlay，避免 PUSH_MODAL payload 序列化炸 undoStack）----------
  const [addHabitOpen, setAddHabitOpen] = useState(false)
  const [editHabitId, setEditHabitId] = useState(null)   // 正在编辑的 habitId
  const [addTempOpen, setAddTempOpen] = useState(false)
  const [editTempId, setEditTempId] = useState(null)     // 正在编辑的 tempTaskId
  const [batchOpen, setBatchOpen] = useState(false)
  const [pomodoroOpen, setPomodoroOpen] = useState(false)

  // ---------- 今日完成率（顶部进度条联动）----------
  const todayStats = useMemo(() => {
    const doneHabits = state.habits.filter(h => state.checkins[`${today}_${h.id}`]).length
    const totalHabits = state.habits.length
    const doneTemp = state.tempTasks.filter(t => t.done).length
    const totalTemp = state.tempTasks.length
    const total = totalHabits + totalTemp
    const done = doneHabits + doneTemp
    return {
      done, total,
      rate: total ? Math.round((done / total) * 100) : 0,
      doneHabits, totalHabits, doneTemp, totalTemp,
    }
  }, [state.habits, state.tempTasks, state.checkins, today])

  const toast = (msg) => dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: msg } })

  // ---------- 删除二次确认（用 ModalRoot 现有 confirm 类型，稳定无序列化问题）----------
  const confirmHabitDelete = (habit) => {
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '🗑️ 删除习惯',
        message: `确认删除「${habit.title}」吗？\n该习惯所有历史打卡记录将一并清除，删除后不可恢复。`,
        onOk: () => {
          dispatch({ type: 'DELETE_HABIT', id: habit.id })
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ 已删除「${habit.title}」` } })
        }
      }
    })
  }
  const confirmTempDelete = (task) => {
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '🗑️ 删除临时任务',
        message: `确认删除「${task.title}」吗？\n删除后不可恢复。`,
        onOk: () => {
          dispatch({ type: 'DELETE_TEMP_TASK', id: task.id })
          dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: `✅ 已删除临时任务「${task.title}」` } })
        }
      }
    })
  }

  return (
    <div className="h-full w-full overflow-y-auto no-scrollbar p-4 flex flex-col relative">

      {/* ========== 顶部：标题 / 日期 / 进度条 ========== */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4 shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-xs text-slate-500">今日 · {today}</div>
            <div className="text-xl font-bold text-slate-800 mt-1">日常待办 / 习惯打卡</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-slate-800 leading-none">{todayStats.rate}%</div>
            <div className="text-xs text-slate-500 mt-1">{todayStats.done}/{todayStats.total} 已完成</div>
          </div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 rounded-full transition-all duration-500"
            style={{ width: `${todayStats.rate}%` }}
          />
        </div>
      </div>

      {/* ========== 切换按钮：日常打卡 / 临时打卡 ========== */}
      <div className="bg-slate-50 rounded-xl p-1 border border-slate-200 mb-4 grid grid-cols-2 gap-1 shrink-0">
        {[
          { key: 'daily', label: '日常打卡' },
          { key: 'temp',  label: '临时打卡' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`py-2.5 rounded-lg text-sm font-medium transition-all touch-feedback ${
              view === tab.key
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== 面板容器：两个视图抽屉式切换 ========== */}
      <div className="relative flex-1 min-h-[520px]">
        {/* --- 视图1：日常打卡（3列 × 3行，最多9卡）--- */}
        <section
          className={`absolute inset-0 transition-all duration-300 ease-out ${
            view === 'daily' ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-4 pointer-events-none'
          }`}
        >
          {/* 操作区（T4 已删除「新增习惯」按钮：空格直接新建） */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={() => {
                if (state.habits.length === 0) { toast('请先新增一个习惯，再启动番茄计时'); return }
                setPomodoroOpen(true)
              }}
              className="px-3 py-2 text-xs font-medium bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 touch-feedback"
            >番茄计时</button>
            <button
              onClick={() => {
                if (state.habits.length === 0) { toast('暂无习惯可以批量打卡'); return }
                setBatchOpen(true)
              }}
              className="px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 touch-feedback"
            >批量打卡</button>
            <div className="flex-1" />
            <div className="text-xs text-slate-400">{state.habits.length}/{GRID_SIZE_DAILY} · 日常习惯</div>
          </div>

          {/* 3列 × 3行 卡片矩阵（T4：点击空格直接新建；点击有卡主体编辑；左上角独立勾选框打卡） */}
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: GRID_SIZE_DAILY }).map((_, i) => {
              const habit = state.habits[i]
              const checked = habit && !!state.checkins[`${today}_${habit.id}`]
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
                    if (!habit) { setAddHabitOpen(true); return }
                    setEditHabitId(habit.id)
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
                          onClick={(e) => { e.stopPropagation(); setEditHabitId(habit.id) }}
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

        {/* --- 视图2：临时打卡（一排5格，最多5卡）--- */}
        <section
          className={`absolute inset-0 transition-all duration-300 ease-out ${
            view === 'temp' ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-4 pointer-events-none'
          }`}
        >
          {/* 操作区（T4 已删除「新增临时任务」按钮：空格直接新建） */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-500">今日临时事项 · 一排 5 格</div>
            <div className="text-xs text-slate-400">{state.tempTasks.length}/{GRID_SIZE_TEMP}</div>
          </div>

          {/* 1 排 5 列 卡片矩阵（T4：点击空格直接新建；点击有卡主体编辑；左上角独立勾选框打卡） */}
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: GRID_SIZE_TEMP }).map((_, i) => {
              const task = state.tempTasks[i]
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
                    if (!task) { setAddTempOpen(true); return }
                    setEditTempId(task.id)
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
                          onClick={(e) => { e.stopPropagation(); setEditTempId(task.id) }}
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
      </div>

      {/* ===================== 页面内自绘弹窗：新增习惯 ===================== */}
      {addHabitOpen && (
        <FormModal
          title="➕ 新增习惯"
          onClose={() => setAddHabitOpen(false)}
          body={
            <HabitForm
              initial={null}
              onClose={() => setAddHabitOpen(false)}
              onSubmit={(data) => {
                if (state.habits.length >= GRID_SIZE_DAILY) {
                  toast(`日常习惯最多 ${GRID_SIZE_DAILY} 个，请先删除一个再新增`); return
                }
                dispatch({ type: 'ADD_HABIT', payload: data })
                toast(`✅ 已新增：${data.title}`)
                setAddHabitOpen(false)
              }}
            />
          }
        />
      )}

      {/* ===================== 页面内自绘弹窗：编辑习惯 ===================== */}
      {editHabitId && (
        <FormModal
          title="✏️ 编辑习惯"
          onClose={() => setEditHabitId(null)}
          body={
            <HabitForm
              initial={state.habits.find(h => h.id === editHabitId) || null}
              onClose={() => setEditHabitId(null)}
              onSubmit={(data) => {
                dispatch({ type: 'UPDATE_HABIT', id: editHabitId, payload: data })
                toast('✅ 已保存修改')
                setEditHabitId(null)
              }}
            />
          }
        />
      )}

      {/* ===================== 页面内自绘弹窗：新增临时任务 ===================== */}
      {addTempOpen && (
        <FormModal
          title="➕ 新增临时任务"
          onClose={() => setAddTempOpen(false)}
          body={
            <TempForm
              initial={null}
              onClose={() => setAddTempOpen(false)}
              onSubmit={(data) => {
                if (state.tempTasks.length >= GRID_SIZE_TEMP) {
                  toast(`临时任务最多 ${GRID_SIZE_TEMP} 条，请先删除一条再新增`); return
                }
                dispatch({ type: 'ADD_TEMP_TASK', payload: data })
                toast(`✅ 已新增临时任务：${data.title}`)
                setAddTempOpen(false)
              }}
            />
          }
        />
      )}

      {/* ===================== 页面内自绘弹窗：编辑临时任务 ===================== */}
      {editTempId && (
        <FormModal
          title="✏️ 编辑临时任务"
          onClose={() => setEditTempId(null)}
          body={
            <TempForm
              initial={state.tempTasks.find(t => t.id === editTempId) || null}
              onClose={() => setEditTempId(null)}
              onSubmit={(data) => {
                dispatch({ type: 'UPDATE_TEMP_TASK', id: editTempId, payload: data })
                toast('✅ 已保存修改')
                setEditTempId(null)
              }}
            />
          }
        />
      )}

      {/* ===================== 批量打卡弹窗 ===================== */}
      {batchOpen && (
        <BatchCheckinModal
          habits={state.habits}
          checkins={state.checkins}
          today={today}
          onClose={() => setBatchOpen(false)}
          onSubmit={(habitIds, allMode) => {
            if (habitIds.length === 0) { toast('请至少勾选一个要打卡的习惯'); return }
            dispatch({ type: 'BATCH_CHECKIN', payload: { date: today, habitIds, value: true } })
            toast(allMode ? `🍺 一键打卡 ${habitIds.length} 个习惯` : `✅ 已批量打卡 ${habitIds.length} 个`)
            setBatchOpen(false)
          }}
        />
      )}

      {/* ===================== 番茄计时弹窗 ===================== */}
      {pomodoroOpen && (
        <PomodoroModal
          habits={state.habits}
          onClose={() => setPomodoroOpen(false)}
          onSubmit={(habitId, minutes) => {
            dispatch({
              type: 'ADD_TIMER_RECORD',
              payload: { habitId, minutes, startAt: Date.now(), source: 'daily-pomodoro' }
            })
            const hb = state.habits.find(h => h.id === habitId)
            toast(`🍅 已启动番茄钟：${hb ? hb.title + ' · ' : ''}${minutes} 分钟专注`)
            setPomodoroOpen(false)
          }}
        />
      )}
    </div>
  )
}

/* ============================================================================
 *  下方为子组件：FormModal / HabitForm / TempForm / BatchCheckinModal / PomodoroModal
 *  全部自绘，不经过 ModalRoot.payload 传递，避免 JSON clone 序列化风险
 * ========================================================================= */

/** 通用自绘模态容器（页面内，z-index 40 低于 ModalRoot 的 50） */
function FormModal({ title, body, onClose }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-base font-bold text-slate-800">{title}</div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center text-lg"
            title="关闭"
          >×</button>
        </div>
        {body}
      </div>
    </div>
  )
}

/** 习惯新增/编辑表单（同结构共用） */
function HabitForm({ initial, onClose, onSubmit }) {
  const dispatch = useAppDispatch()
  const toast = (m) => dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: m } })

  const [title, setTitle] = useState(initial?.title || '')
  const [reminder, setReminder] = useState(initial?.reminder || '')   // HH:MM
  const [estMinutes, setEst] = useState(initial?.estMinutes != null ? String(initial.estMinutes) : '30')
  const [difficulty, setDifficulty] = useState(initial?.difficulty || 'normal')

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) { toast('请输入任务名称'); return }
    const mins = Number(estMinutes)
    if (isNaN(mins) || mins <= 0 || mins > 480) { toast('预估耗时需为 1–480 分钟'); return }
    onSubmit({
      title: title.trim(),
      reminder: reminder || '',
      estMinutes: mins,
      difficulty,
    })
  }

  return (
    <form onSubmit={submit} className="p-5 space-y-4">
      <div>
        <label className="text-xs text-slate-600 mb-1 block">任务名称 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：练琴 / 阅读 / 跑步…"
          maxLength={20}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-indigo-400"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-600 mb-1 block">提醒时间</label>
          <input
            type="time"
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="text-xs text-slate-600 mb-1 block">预估耗时（分钟）</label>
          <input
            type="number"
            min={1}
            max={480}
            value={estMinutes}
            onChange={(e) => setEst(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-600 mb-1 block">难度</label>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-indigo-400"
        >
          {HABIT_DIFFICULTY.map(d => (
            <option key={d.k} value={d.k}>{d.badge}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback"
        >取消</button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-feedback"
        >确认提交</button>
      </div>
    </form>
  )
}

/** 临时任务新增/编辑表单 */
function TempForm({ initial, onClose, onSubmit }) {
  const dispatch = useAppDispatch()
  const toast = (m) => dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message: m } })

  const nowHH = (new Date()).getHours().toString().padStart(2, '0')
  const [title, setTitle] = useState(initial?.title || '')
  const [reminderTime, setReminderTime] = useState(initial?.reminderTime || `${nowHH}:00`)
  const [reminder, setReminder] = useState(initial?.reminder !== false)

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) { toast('请输入任务名称'); return }
    if (!reminderTime) { toast('请选择提醒时间'); return }
    onSubmit({
      title: title.trim(),
      reminderTime,
      reminder: !!reminder,
    })
  }

  return (
    <form onSubmit={submit} className="p-5 space-y-4">
      <div>
        <label className="text-xs text-slate-600 mb-1 block">任务名称 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：取快递 / 买资料 / 联系老师…"
          maxLength={20}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-indigo-400"
        />
      </div>
      <div>
        <label className="text-xs text-slate-600 mb-1 block">提醒时间 *</label>
        <input
          type="time"
          value={reminderTime}
          onChange={(e) => setReminderTime(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-indigo-400"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={reminder}
          onChange={(e) => setReminder(e.target.checked)}
          className="w-4 h-4 accent-indigo-600"
        />
        显示右下角🔔提醒图标
      </label>
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback"
        >取消</button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-feedback"
        >确认提交</button>
      </div>
    </form>
  )
}

/** 批量打卡弹窗 */
function BatchCheckinModal({ habits, checkins, today, onClose, onSubmit }) {
  const [selected, setSelected] = useState(() => {
    // 默认勾选出今日未完成的习惯
    return habits.filter(h => !checkins[`${today}_${h.id}`]).map(h => h.id)
  })
  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  const allIds = habits.map(h => h.id)

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-base font-bold text-slate-800">✅ 批量打卡 · {habits.length} 个习惯</div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center text-lg">×</button>
        </div>
        <div className="p-5 max-h-80 overflow-y-auto no-scrollbar space-y-2">
          {habits.length === 0 && <div className="text-center text-sm text-slate-400 py-6">暂无习惯</div>}
          {habits.map(h => {
            const done = !!checkins[`${today}_${h.id}`]
            const isSel = selected.includes(h.id) || done
            return (
              <label
                key={h.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} cursor-pointer hover:border-indigo-300`}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  disabled={done}
                  onChange={() => !done && toggle(h.id)}
                  className="w-4 h-4 accent-emerald-600"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${done ? 'line-through text-emerald-600' : 'text-slate-800'}`}>{h.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {h.estMinutes ? `${h.estMinutes} 分钟` : ''}
                    {h.reminder ? ` · 🔔 ${h.reminder}` : ''}
                    {done ? ' · 今日已完成' : ''}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">取消</button>
          <button
            onClick={() => {
              // 一键全部打卡：包含今日已完成和未完成的所有ID（已完成的checkin不会重复写入因为是相同 key，但这里 value=true 覆盖也行，没副作用）
              onSubmit(allIds, true)
            }}
            className="px-4 py-2 rounded-lg text-sm bg-emerald-100 hover:bg-emerald-200 text-emerald-700 touch-feedback"
          >一键全部打卡</button>
          <button
            onClick={() => onSubmit(selected, false)}
            className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-feedback"
          >确认勾选打卡 {selected.length > 0 ? `(${selected.length})` : ''}</button>
        </div>
      </div>
    </div>
  )
}

/** 番茄计时弹窗（极简版：选习惯+启动，不做倒计时挂钟） */
function PomodoroModal({ habits, onClose, onSubmit }) {
  const [habitId, setHabitId] = useState(habits[0]?.id || '')
  const [minutes, setMinutes] = useState(25)
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-base font-bold text-slate-800">🍅 番茄计时 · 启动</div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center text-lg">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">选择要专注的习惯</label>
            <select
              value={habitId}
              onChange={(e) => setHabitId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-rose-400"
            >
              {habits.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">专注时长（分钟）</label>
            <div className="grid grid-cols-4 gap-2">
              {[15, 25, 45, 60].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`py-2 rounded-lg text-xs font-medium border ${
                    minutes === m ? 'bg-rose-500 text-white border-rose-500' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-rose-300'
                  }`}
                >{m}分钟</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 touch-feedback">取消</button>
            <button
              onClick={() => habitId && onSubmit(habitId, minutes)}
              className="px-4 py-2 rounded-lg text-sm bg-rose-500 hover:bg-rose-400 text-white font-medium touch-feedback"
            >🚀 开始专注</button>
          </div>
        </div>
      </div>
    </div>
  )
}
