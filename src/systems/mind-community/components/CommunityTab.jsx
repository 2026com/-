import React, { useEffect, useState } from 'react'
import { ME_USER, MOCK_USERS } from '../services/mockData.js'
import { loadMindState, saveMindState, timeAgo } from '../services/communityStorage.js'
import { pushBackHandler } from '../../../utils/backStack.js'

/**
 * 社区 Tab（板块内 Tab2）：朋友圈式信息流 + 发帖
 * - 数据来源：本地模拟（loadMindState），发帖/点赞只写本地存储；
 * - 本期仅支持文字帖（可含 emoji），无图片/评论/转发；
 * - 发帖编辑框为自绘浮层，注册返回键栈（backStack）保证安卓返回键先关浮层。
 */

function userOf(id) {
  if (id === ME_USER.id) return ME_USER
  return MOCK_USERS.find(u => u.id === id) || { id, name: '未知用户', avatar: '👤' }
}

export default function CommunityTab() {
  const [state, setState] = useState(() => loadMindState())
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState('')

  // 发帖浮层打开时注册返回键：返回键关闭浮层而非退出页面
  useEffect(() => {
    if (!composerOpen) return undefined
    return pushBackHandler(() => setComposerOpen(false))
  }, [composerOpen])

  /** 通用状态更新：改内存 state 同时落库 */
  const update = (next) => {
    setState(next)
    saveMindState(next)
  }

  const publish = () => {
    const content = draft.trim()
    if (!content) return
    const post = { id: `p_${Date.now()}`, userId: ME_USER.id, content, likes: 0, createdAt: Date.now() }
    update({ ...state, posts: [post, ...state.posts] })
    setDraft('')
    setComposerOpen(false)
  }

  const toggleLike = (postId) => {
    const liked = state.likedPostIds.includes(postId)
    const posts = state.posts.map(p => (p.id === postId ? { ...p, likes: p.likes + (liked ? -1 : 1) } : p))
    const likedPostIds = liked ? state.likedPostIds.filter(id => id !== postId) : [...state.likedPostIds, postId]
    update({ ...state, posts, likedPostIds })
  }

  const posts = [...state.posts].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="h-full w-full relative bg-slate-50 overflow-hidden">
      {/* 信息流 */}
      <div className="h-full overflow-y-auto px-3 pt-3 pb-24">
        {posts.length === 0 && (
          <div className="text-center text-sm text-slate-400 pt-16">还没有帖子，点右下角发第一帖吧</div>
        )}
        <div className="flex flex-col gap-3">
          {posts.map(post => {
            const author = userOf(post.userId)
            const liked = state.likedPostIds.includes(post.id)
            return (
              <div key={post.id} className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-lg shrink-0">
                    {author.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">
                      {author.name}{post.userId === ME_USER.id && <span className="text-[10px] text-indigo-500 ml-1">(我)</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">{timeAgo(post.createdAt)}</div>
                  </div>
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap break-words">{post.content}</div>
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`text-xs px-2 py-1 rounded-full transition-colors touch-feedback ${liked ? 'text-rose-500 bg-rose-50' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {liked ? '❤️' : '🤍'} {post.likes > 0 ? post.likes : ''}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 发帖悬浮按钮 */}
      {!composerOpen && (
        <button
          onClick={() => setComposerOpen(true)}
          className="absolute bottom-5 right-4 w-12 h-12 rounded-full bg-indigo-600 text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          aria-label="发帖"
        >
          ＋
        </button>
      )}

      {/* 发帖编辑浮层 */}
      {composerOpen && (
        <div className="absolute inset-0 z-40 flex flex-col bg-slate-900/40" onClick={() => setComposerOpen(false)}>
          <div className="mt-auto mb-2 mx-2 bg-white rounded-2xl p-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setComposerOpen(false)} className="text-sm text-slate-400 px-2 py-1">取消</button>
              <span className="text-sm font-semibold text-slate-800">发帖</span>
              <button
                onClick={publish}
                disabled={!draft.trim()}
                className={`text-sm px-3 py-1 rounded-full ${draft.trim() ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'}`}
              >
                发布
              </button>
            </div>
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="说点什么吧…（此刻的心情、想法、生活）"
              maxLength={500}
              className="w-full h-28 resize-none text-sm text-slate-700 outline-none placeholder:text-slate-300"
            />
            <div className="text-right text-[11px] text-slate-300">{draft.length}/500</div>
          </div>
        </div>
      )}
    </div>
  )
}
