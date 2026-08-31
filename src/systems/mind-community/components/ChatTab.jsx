import React, { useEffect, useRef, useState } from 'react'
import { ME_USER, MOCK_USERS, AUTO_REPLIES } from '../services/mockData.js'
import { loadMindState, saveMindState, timeAgo } from '../services/communityStorage.js'
import { pushBackHandler } from '../../../utils/backStack.js'

/**
 * 聊天 Tab（板块内 Tab3）：好友列表 + 一对一聊天
 * - 数据来源：本地模拟；好友来自预置模拟用户，「添加」即模拟通过；
 * - 发送消息后由好友延时自动回复一条（本地模拟活跃感），只写本地存储；
 * - 聊天窗口为自绘浮层，注册返回键栈（backStack）保证安卓返回键先回好友列表。
 */

function userOf(id) {
  return MOCK_USERS.find(u => u.id === id) || { id, name: '未知用户', avatar: '👤' }
}

export default function ChatTab() {
  const [state, setState] = useState(() => loadMindState())
  const [activeFriendId, setActiveFriendId] = useState(null)

  const update = (next) => {
    setState(next)
    saveMindState(next)
  }

  const addFriend = (userId) => {
    if (state.friends.includes(userId)) return
    update({ ...state, friends: [...state.friends, userId], chats: { ...state.chats, [userId]: state.chats[userId] || [] } })
  }

  /** 追加一条消息：函数式更新避免旧闭包覆盖丢消息（自动回复延时回调捕获的 state 可能已过期） */
  const appendMessage = (friendId, msg) => {
    setState(prev => {
      const next = { ...prev, chats: { ...prev.chats, [friendId]: [...(prev.chats[friendId] || []), msg] } }
      saveMindState(next)
      return next
    })
  }

  const friends = MOCK_USERS.filter(u => state.friends.includes(u.id))
  const strangers = MOCK_USERS.filter(u => !state.friends.includes(u.id))
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
        {/* 好友 */}
        <div className="text-xs text-slate-400 px-1 mb-2">好友（{friends.length}）</div>
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

        {/* 可能认识的人（模拟：点击即添加） */}
        {strangers.length > 0 && (
          <>
            <div className="text-xs text-slate-400 px-1 mt-5 mb-2">可能认识的人</div>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {strangers.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-xl shrink-0">{u.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400 truncate">{u.bio}</div>
                  </div>
                  <button
                    onClick={() => addFriend(u.id)}
                    className="text-xs px-3 py-1.5 rounded-full bg-indigo-600 text-white active:scale-95 transition-transform shrink-0"
                  >
                    ＋ 添加
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="text-center text-[11px] text-slate-300 pt-4">第一期为本地模拟 · 好友与消息仅存于本机</div>
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
