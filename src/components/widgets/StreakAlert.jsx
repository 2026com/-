import React, { useEffect } from 'react'
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx'
import { dateUtil } from '../../utils/storage.js'
import { dbGet, dbSet } from '../../services/db.js'

/**
 * 阶段4：断卡提醒机制
 * 连续多日断卡未打卡，弹出温和提示弹窗
 */
export default function StreakAlert() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  useEffect(() => {
    const today = new Date(dateUtil.today())
    let missedDays = 0
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const ds = dateUtil.format(d)
      const anyDone = state.habits.some(h => state.checkins[`${ds}_${h.id}`])
      if (!anyDone) missedDays++
      else break
    }
    const key = 'streak_alert_shown_' + dateUtil.today()
    // 存储已迁至 IndexedDB：改走 db.js 内存镜像（同步读，启动门已保证镜像就绪）
    if (missedDays >= 3 && !dbGet(key)) {
      dbSet(key, '1')
      setTimeout(() => {
        dispatch({
          type: 'PUSH_MODAL',
          payload: {
            type: 'confirm',
            title: '🌸 温和提醒',
            message: `检测到你已连续 ${missedDays} 天未打卡啦～\n\n不必焦虑，强者体系讲究「弹性坚持」。\n哪怕今天只完成1个微习惯，也是向前的一步！💪\n\n是否立即进入今日打卡页面？`,
            onOk: () => {
              window.location.hash = ''
              window.history.pushState({}, '', '/daily')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }
          }
        })
      }, 1200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
