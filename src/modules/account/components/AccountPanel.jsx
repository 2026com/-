import React, { useState, useEffect } from 'react'
import { useAppDispatch } from '../../../context/AppContext.jsx'
import {
  register, login, logout, getSession,
  validateAccount, validatePassword,
  uploadToCloud, downloadFromCloud, applySnapshot, getCloudInfo,
  ACCOUNT_PROVIDER,
} from '../services/accountService.js'

/**
 * 账号面板（当前为本地模拟后端形态，界面与真实云端版本一致）
 * - 未登录：登录 / 注册 双 Tab（手机号或邮箱 + 密码）；
 * - 已登录：账号信息 + 云同步区（备份到云端 / 从云端恢复）+ 退出登录；
 * - 恢复属覆盖性操作：先二次确认（本地现有数据将被云端备份覆盖），完成后自动刷新应用；
 * - 模拟后端阶段数据不出设备；真实接入 BaaS 后本组件零改动。
 */
export default function AccountPanel({ open, onClose }) {
  const dispatch = useAppDispatch()
  const [session, setSession] = useState(null)
  const [mode, setMode] = useState('login')        // 'login' | 'register'
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [cloudInfo, setCloudInfo] = useState(null)

  useEffect(() => {
    if (!open) return
    const s = getSession()
    setSession(s)
    setCloudInfo(s ? getCloudInfo(s.userId) : null)
    setErr('')
  }, [open])

  if (!open) return null

  const toast = (message) => dispatch({ type: 'PUSH_MODAL', payload: { type: 'toast', message } })

  const handleSubmit = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      const fn = mode === 'login' ? login : register
      const s = await fn({ account, password, nickname })
      setSession(s)
      setCloudInfo(getCloudInfo(s.userId))
      setPassword('')
      toast(mode === 'login' ? `👋 欢迎回来，${s.nickname}` : `🎉 注册成功，已登录为 ${s.nickname}`)
    } catch (e) {
      setErr(e?.message || '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const handleUpload = () => {
    if (!session || busy) return
    setBusy(true)
    try {
      const rec = uploadToCloud(session.userId)
      setCloudInfo({ savedAt: rec.savedAt, device: rec.device, keyCount: Object.keys(rec.data).length })
      toast('☁️ 已备份当前设备数据到云端')
    } catch (e) {
      toast('⚠️ 备份失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = () => {
    if (!session || busy) return
    const info = getCloudInfo(session.userId)
    if (!info) { toast('☁️ 云端还没有备份，请先在旧设备上「备份到云端」'); return }
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '从云端恢复数据？',
        message: `将用云端备份（${new Date(info.savedAt).toLocaleString()} · ${info.device}）覆盖本机现有全部数据。\n\n此操作不可撤销，确定继续吗？`,
        okText: '覆盖恢复',
        onOk: () => {
          try {
            const snap = downloadFromCloud(session.userId)
            const n = applySnapshot(snap)
            toast(`✅ 已恢复 ${n} 类数据，正在刷新…`)
            setTimeout(() => window.location.reload(), 900)
          } catch (e) {
            toast('⚠️ 恢复失败，请重试')
          }
        }
      }
    })
  }

  const handleLogout = () => {
    dispatch({
      type: 'PUSH_MODAL',
      payload: {
        type: 'confirm',
        title: '退出登录？',
        message: '本机数据不会被删除；下次登录同一账号即可继续使用云同步。',
        okText: '退出',
        onOk: () => {
          logout()
          setSession(null)
          setCloudInfo(null)
          setAccount(''); setPassword(''); setErr('')
        }
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {session ? '账号与云同步' : '登录小美账号'}
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex items-center justify-center touch-feedback">✕</button>
        </div>

        {!session ? (
          <>
            {/* 登录/注册 Tab */}
            <div className="flex px-5 pt-3 gap-1">
              {[['login', '登录'], ['register', '注册']].map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setErr('') }}
                  className={`px-3 py-1.5 text-xs rounded-lg font-semibold touch-feedback transition-colors ${
                    mode === m ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >{label}</button>
              ))}
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="手机号或邮箱"
                inputMode="email"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/50"
              />
              {mode === 'register' && (
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="昵称（选填）"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/50"
                />
              )}
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                placeholder="密码（至少 6 位）"
                type="password"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/50"
              />
              {err && <div className="text-xs text-rose-500 px-1">⚠️ {err}</div>}
              <button
                onClick={handleSubmit}
                disabled={busy || !account || !password}
                className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-bold transition-colors touch-feedback disabled:cursor-not-allowed"
              >
                {busy ? '处理中…' : (mode === 'login' ? '登 录' : '注 册 并 登 录')}
              </button>
              <div className="text-[10px] text-slate-400 leading-relaxed px-1">
                🔒 密码加密存储，任何人（包括开发者）无法查看原文；数据存储遵循隐私政策。当前为本地模拟后端演示（{ACCOUNT_PROVIDER}），正式版接入云端后本界面不变。
              </div>
            </div>
          </>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* 账号信息 */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg font-bold shrink-0">
                {session.nickname.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{session.nickname}</div>
                <div className="text-[11px] text-slate-400 truncate">{session.account}</div>
              </div>
            </div>

            {/* 云同步区 */}
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">☁️ 云同步</span>
                {cloudInfo ? (
                  <span className="text-[10px] text-emerald-500">已备份</span>
                ) : (
                  <span className="text-[10px] text-slate-400">云端暂无备份</span>
                )}
              </div>
              {cloudInfo && (
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  上次备份：{new Date(cloudInfo.savedAt).toLocaleString()} · 来自 {cloudInfo.device} · {cloudInfo.keyCount} 类数据
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  disabled={busy}
                  className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold touch-feedback disabled:opacity-50"
                >↑ 备份到云端</button>
                <button
                  onClick={handleRestore}
                  disabled={busy}
                  className="flex-1 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-xs font-bold touch-feedback disabled:opacity-50"
                >↓ 从云端恢复</button>
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                备份内容：打卡、目标、笔记、知识库等全部业务数据。换手机时：新设备登录同一账号 → 「从云端恢复」即可。
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold touch-feedback"
            >退出登录</button>
          </div>
        )}
      </div>
    </div>
  )
}
