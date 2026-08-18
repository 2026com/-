import React from 'react'
import { NavLink } from 'react-router-dom'
import { MAIN_TABS } from '../../utils/constants.js'

export default function BottomTabs() {
  return (
    <nav
      className="w-full bg-white border-t border-slate-200 flex items-center justify-around z-30"
      style={{ height: 64, paddingBottom: 'var(--safe-bottom)' }}
    >
      {MAIN_TABS.map(tab => (
        <NavLink key={tab.id} to={tab.path} end>
          {({ isActive }) => (
            <div
              className={`
                h-full w-[calc(100vw/3)] flex flex-col items-center justify-center gap-1 touch-feedback transition-colors cursor-pointer
                ${isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}
              `}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className={`text-xs ${isActive ? 'font-semibold' : 'font-normal'}`}>{tab.name}</span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
