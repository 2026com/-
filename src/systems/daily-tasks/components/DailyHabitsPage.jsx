import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useAppState, useAppDispatch } from '../../../context/AppContext.jsx'
import { dateUtil } from '../../../utils/storage.js'
import { HABIT_DIFFICULTY } from '../../../utils/constants.js'
import { DailySection, TempSection, GRID_SIZE_DAILY, GRID_SIZE_TEMP } from './habits/CheckinSections.jsx'
import WheelTimePicker from './habits/WheelTimePicker.jsx'
import BatchCheckinModal from './habits/BatchCheckinModal.jsx'
import PomodoroModal from './habits/PomodoroModal.jsx'
import { pushBackHandler } from '../../../utils/backStack.js'

/**
 * 双页打卡真实交互版
 * 日常打卡（3列×4行=12卡）/ 临时打卡（6列×2行=12卡）
 * 全部增删改查 / 批量打卡 / 番茄计时 均为本页弹窗，不跳路由
 * 数据 100% 走 reducer → localStorage 持久化，刷新不丢
 */
export default function DailyHabitsPage() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [today, setToday] = useState(() => dateUtil.today())

  // 每天自动刷新日期：跨天（定时器）、切回标签页、窗口聚焦时立即更新，保证打卡按当天记录
  useEffect(() => {
    const update = () => setToday(dateUtil.today())
    const timer = setInterval(update, 30 * 1000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
    }
  }, [])
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
          { key: 'temp',  label: '临时打卡' },
          { key: 'daily', label: '日常打卡' },
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
          {/* 打卡列表（日常）—— 拆分迁移至 components/habits/CheckinSections.jsx */}
          <DailySection
            visible={view === 'daily'}
            habits={state.habits}
            checkins={state.checkins}
            today={today}
            dispatch={dispatch}
            toast={toast}
            confirmHabitDelete={confirmHabitDelete}
            onOpenPomodoro={() => setPomodoroOpen(true)}
            onOpenBatch={() => setBatchOpen(true)}
            onCreateHabit={() => setAddHabitOpen(true)}
            onEditHabit={(id) => setEditHabitId(id)}
          />
        </section>

        {/* --- 视图2：临时打卡（一排5格，最多5卡）--- */}
        <section
          className={`absolute inset-0 transition-all duration-300 ease-out ${
            view === 'temp' ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-4 pointer-events-none'
          }`}
        >
          {/* 打卡列表（临时）—— 拆分迁移至 components/habits/CheckinSections.jsx */}
          <TempSection
            visible={view === 'temp'}
            tempTasks={state.tempTasks}
            dispatch={dispatch}
            confirmTempDelete={confirmTempDelete}
            onCreateTemp={() => setAddTempOpen(true)}
            onEditTemp={(id) => setEditTempId(id)}
          />
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
                // V2: 移除创建成功 toast，弹窗关闭即确认
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
                // V2: 移除编辑成功 toast，弹窗关闭即确认
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
                dispatch({ type: 'ADD_TEMP_TASK', payload: data })
                // V2: 移除创建成功 toast，弹窗关闭即确认
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
                // V2: 移除编辑成功 toast，弹窗关闭即确认
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
 *  表单子组件：FormModal / HabitForm / TempForm（BatchCheckinModal / PomodoroModal 已拆分至 components/habits/，打卡列表已拆分至 CheckinSections.jsx）
 *  全部自绘，不经过 ModalRoot.payload 传递，避免 JSON clone 序列化风险
 * ========================================================================= */

/** 通用自绘模态容器（页面内，z-index 40 低于 ModalRoot 的 50） */
function FormModal({ title, body, onClose }) {
  // 返回键关闭表单浮层（注册全局返回栈；ref 保证 onClose 始终最新、只注册一次）
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => pushBackHandler(() => closeRef.current()), [])
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
  const [reminderOn, setReminderOn] = useState(!!initial?.reminder)   // 是否开启到点提醒
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
      <div>
        <label className="flex items-center gap-2 text-xs text-slate-600 mb-1">
          <input
            type="checkbox"
            checked={reminderOn}
            onChange={(e) => { setReminderOn(e.target.checked); if (!e.target.checked) setReminder('') }}
            className="w-3.5 h-3.5 accent-indigo-600"
          />
          到点提醒（可选）
        </label>
        {reminderOn && (
          <div className="mt-1">
            <WheelTimePicker value={reminder || '09:00'} onChange={setReminder} />
          </div>
        )}
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
        <WheelTimePicker value={reminderTime} onChange={setReminderTime} />
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
