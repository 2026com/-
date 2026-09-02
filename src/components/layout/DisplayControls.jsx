import React, { useEffect, useState } from 'react'
import { useAppTheme, toggleTheme } from '../../services/theme.js'
import { setScreenOrientation, isLandscapeNow } from '../../services/device.js'

/**
 * 显示控制悬浮球组 V1.0（挂载于：长期目标横线本 / 3D 知识库）
 * - ⛶ 纯净模式：隐藏顶部状态栏/左侧抽屉/底部 Tab/计时悬浮窗（App.jsx 响应），
 *   再点一次退出；纯净态下本悬浮球保留，作为唯一操作入口
 * - ⇄ 横竖屏：点击在横屏/竖屏间切换（原生 AppBridge 插件；Web 全屏时降级）
 * - 🌙/☀️ 深浅色：全局主题切换（IndexedDB 持久化，启动时自动恢复）
 */

export default function DisplayControls({ pureMode = false, onTogglePure }) {
  const theme = useAppTheme()
  const [landscape, setLandscape] = useState(isLandscapeNow)

  useEffect(() => {
    const onResize = () => setLandscape(isLandscapeNow())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const handleOrientation = async () => {
    const ok = await setScreenOrientation(landscape ? 'portrait' : 'landscape')
    if (ok) setLandscape(!landscape)
  }

  const btn = 'w-11 h-11 rounded-full flex items-center justify-center text-[15px] backdrop-blur border transition-all touch-feedback shadow-lg select-none'

  return (
    <div
      className="fixed right-3 z-[60] flex flex-col gap-2"
      style={{ bottom: pureMode ? 18 : 'calc(var(--bottombar-total, 64px) + 14px)' }}
    >
      <button
        onClick={onTogglePure}
        title={pureMode ? '退出纯净模式' : '纯净模式（隐藏边框/抽屉/底部栏）'}
        aria-label={pureMode ? '退出纯净模式' : '纯净模式'}
        className={`${btn} ${pureMode ? 'bg-indigo-500 border-indigo-300/40 text-white' : 'bg-slate-900/70 border-white/10 text-white hover:bg-slate-900/90'}`}
      >⛶</button>
      {/* 纯净模式下只保留 ⛶ 退出入口（横竖屏/日夜切换全部隐藏；退出即恢复） */}
      {!pureMode && (
        <button
          onClick={handleOrientation}
          title={landscape ? '切换为竖屏' : '切换为横屏'}
          aria-label={landscape ? '切换为竖屏' : '切换为横屏'}
          className={`${btn} bg-slate-900/70 border-white/10 text-white hover:bg-slate-900/90`}
        >{landscape ? '📱' : '🖥️'}</button>
      )}
      {!pureMode && (
        <button
          onClick={() => toggleTheme()}
          title={theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
          aria-label={theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
          className={`${btn} bg-slate-900/70 border-white/10 text-white hover:bg-slate-900/90`}
        >{theme === 'dark' ? '☀️' : '🌙'}</button>
      )}
    </div>
  )
}