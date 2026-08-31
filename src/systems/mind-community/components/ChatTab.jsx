import React, { useEffect, useRef, useState } from 'react'
import { ME_USER, MOCK_USERS, AUTO_REPLIES } from '../services/mockData.js'
import { loadMindState, saveMindState, timeAgo } from '../services/communityStorage.js'
import { pushBackHandler } from '../../../utils/backStack.js'

/**
 * 聊天 Tab（板块内 Tab3）：好友列表 + 一对一聊天
 * - 【已停用模拟好友】不再展示「可能认识的人」，好友列表默认为空；
 *   聊天体系等接入真实用户（账号系统/后端）后开放；
 * - 下方聊天窗口代码保留（真实好友接入后复用），当前无好友不可达。
 */

function userOf(id) {
  return MOCK_USERS.find(u => u.id === id) || { id, name: '未知用户', avatar: '👤' }
}

export default function ChatTab() {
  const [state, setState] = useState(() => loadMindState())
  const [activeFriendId, setActiveFriendId] = useState(null)

  /** 追加一条消息：函数式更新避免旧闭包覆盖丢消息 */
  const appendMessage = (friendId, msg) => {
    setState(prev => {
      const next = { ...prev, chats: { ...prev.chats, [friendId]: [...(prev.chats[friendId] || []), msg] } }
      saveMindState(next)
      return next
    })
  }

  const friends = MOCK_USERS.filter(u => state.friends.includes(u.id))
  const activeFriend = activeFriendId ? userOf(activeFriendId) : null

  // 聊天窗口打开时注册返回键：返回键回好友列表而非退出页面
  useEffect(() => {
    if (!activeFriendId) return undefined
    return pushBackHandler(() => setActiveFriendId(null))
  }, [activeFriendId])

  const lastMessageOf = (userId) => {
    const msgs = state.chats[userId] || []
    return msgs.length > 0 ? msgs[msgs.length - 1] : null
  }

  return (
    <div className="h-full w-full relative bg-slate-50 overflow-hidden">
      {/* ===== 好友列表 ===== */}
      <div className="h-full overflow-y-auto px-3 pt-3 pb-4">
        {/* 好友（真实好友接入前保持为空，不展示任何模拟用户） */}
        <div className="text-xs text-slate-400 px-1 mb-2">好友（{friends.length}）</div>
        {friends.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-12 text-center">
            <div className="text-3xl mb-2">🫂</div>
            <div className="text-sm text-slate-500 font-medium">暂无好友</div>
            <div className="text-xs text-slate-400 mt-1">聊天功能将在后续版本接入真实用户后开放</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {friends.map(u => {
              const last = lastMessageOf(u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => setActiveFriendId(u.id)}
                  className="w-full flex items-center gap-3 p-3 text-left touch-feedback hover:bg-slate-50"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-xl shrink-0">{u.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{u.name}</span>
                      {last && <span className="text-[10px] text-slate-300 shrink-0">{timeAgo(last.createdAt)}</span>}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{last ? last.content : '开始聊几句吧'}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="text-center text-[11px] text-slate-300 pt-4">社区与聊天为本地功能 · 好友体系将在接入真实账号后开放</div>
      </div>

      {/* ===== 聊天窗口（浮层） ===== */}
      {activeFriend && (
        <ChatWindow
          friend={activeFriend}
          messages={state.chats[activeFriend.id] || []}
          onClose={() => setActiveFriendId(null)}
          onAppend={(msg) => appendMessage(activeFriend.id, msg)}
        />
      )}
    </div>
  )
}

/** 一对一聊天窗口（好友气泡居左白底、我方居右靛蓝；新消息自动滚到底部） */
function ChatWindow({ friend, messages, onClose, onAppend }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)
  const repliedRef = useRef(true) // 防止重复自动回复：仅在发送新消息时解锁

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = () => {
    const content = draft.trim()
    if (!content) return
    onAppend({ id: `m_${Date.now()}`, from: ME_USER.id, content, createdAt: Date.now() })
    setDraft('')
    // 本地模拟：好友 1.2s 后自动回复一条
    repliedRef.current = false
    setTimeout(() => {
      if (repliedRef.current) return
      repliedRef.current = true
      const pool = AUTO_REPLIES[friend.id] || ['😊']
      const content2 = pool[Math.floor(Math.random() * pool.length)]
      onAppend({ id: `m_${Date.now()}_r`, from: friend.id, content: content2, createdAt: Date.now() })
    }, 1200)
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-slate-50">
      {/* 顶部：返回 + 好友名 */}
      <div className="h-11 shrink-0 bg-white border-b border-slate-200 flex items-center px-2 gap-1">
        <button onClick={onClose} className="px-2 py-1 text-slate-500 hover:text-slate-800 text-lg leading-none" aria-label="返回好友列表">‹</button>
        <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-base">{friend.avatar}</div>
        <span className="text-sm font-semibold text-slate-800 ml-1">{friend.name}</span>
        <span className="ml-auto text-[10px] text-slate-300 pr-2">本地模拟</span>
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="text-center text-xs text-slate-300 pt-10">还没有消息，打个招呼吧 👋</div>
        )}
        {messages.map(m => {
          const mine = m.from === ME_USER.id
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-sm shrink-0">
                {mine ? ME_USER.avatar : friend.avatar}
              </div>
              <div className={`max-w-[72%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${mine ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm'}`}>
                {m.content}
              </div>
              <span className="text-[10px] text-slate-300 shrink-0">{timeAgo(m.createdAt)}</span>
            </div>
          )
        })}
      </div>

      {/* 输入区 */}
      <div className="shrink-0 bg-white border-t border-slate-200 flex items-center gap-2 p-2" style={{ paddingBottom: 'calc(0.5rem + var(--safe-bottom, 0px))' }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder={`发消息给 ${friend.name}…`}
          maxLength={300}
          className="flex-1 h-9 px-3 rounded-full bg-slate-100 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-300"
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          className={`h-9 px-4 rounded-full text-sm shrink-0 ${draft.trim() ? 'bg-indigo-600 text-white active:scale-95 transition-transform' : 'bg-slate-100 text-slate-300'}`}
        >
          发送
        </button>
      </div>
    </div>
  )
}
