/**
 * 心理情绪板块 · 本地模拟数据（第一期：无后端，数据全部本地模拟）
 * ============================================================================
 * - 模拟用户 / 示例帖子 / 示例好友与聊天记录，供社区与聊天 Tab 首次种子使用；
 * - 「我」固定为 ME_USER（将来账号系统接通后替换为真实登录用户）；
 * - 数据结构定义见 communityStorage.js 顶部注释。
 */

/** 当前登录用户（本地模拟：固定为小美） */
export const ME_USER = { id: 'me', name: '小美', avatar: '🌸' }

/** 模拟用户池（帖子作者 + 可添加好友） */
export const MOCK_USERS = [
  { id: 'u1', name: '简一',   avatar: '🌵', bio: '每天进步一点点' },
  { id: 'u2', name: '阿澈',   avatar: '🌊', bio: '跑步 · 读书 · 早睡' },
  { id: 'u3', name: '柚子茶', avatar: '🍋', bio: '记录生活的甜' },
  { id: 'u4', name: '星野',   avatar: '⭐', bio: '追光的人' },
  { id: 'u5', name: '木棉',   avatar: '🌺', bio: '慢慢来，比较快' },
]

/** 首次预置为好友的模拟用户 */
export const SEED_FRIEND_IDS = ['u1', 'u2', 'u3']

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** 示例帖子（相对当前时间的偏移量生成 createdAt，保证时间线自然） */
export const SEED_POSTS = [
  { id: 'sp1', userId: 'u3', content: '今天把房间彻底收拾了一遍，晒过太阳的被子真的会带来好心情 ☀️', offset: 30 * MIN, likes: 12 },
  { id: 'sp2', userId: 'u1', content: '连续第 14 天早起打卡。原来坚持这件事，开始之后比想象中容易。', offset: 2 * HOUR, likes: 23 },
  { id: 'sp3', userId: 'u5', content: '分享一个缓解焦虑的小方法：把担心的事情写在纸上，写完就会发现，真正需要立刻处理的没几件。', offset: 5 * HOUR, likes: 41 },
  { id: 'sp4', userId: 'u2', content: '夜跑 5 公里完成 🏃 江边的风太舒服了，运动完整个人都松弛下来了。', offset: 9 * HOUR, likes: 8 },
  { id: 'sp5', userId: 'u4', content: '今天状态很差，什么都不想做。允许自己摆烂一个晚上，明天再重新开始。', offset: DAY + 2 * HOUR, likes: 17 },
  { id: 'sp6', userId: 'u1', content: '读完《被讨厌的勇气》。「一切烦恼都来自人际关系」，但改变也从关系开始。推荐给每一个内耗的朋友。', offset: DAY + 6 * HOUR, likes: 35 },
  { id: 'sp7', userId: 'u3', content: '下午和好朋友聊了两个小时，说出来之后心里舒服多了。情绪需要出口，别一个人扛 🍋', offset: DAY + 11 * HOUR, likes: 26 },
  { id: 'sp8', userId: 'u2', content: '打卡 100 天里程碑达成！从每天 10 分钟开始，到现在已经成了习惯。你也可以的。', offset: 2 * DAY + 3 * HOUR, likes: 58 },
  { id: 'sp9', userId: 'u5', content: '今天学着自己做了一顿饭，虽然卖相一般，但好好吃饭就是好好爱自己 🌺', offset: 2 * DAY + 9 * HOUR, likes: 19 },
  { id: 'sp10', userId: 'u4', content: '本周情绪记录：波动比上周小了。觉察本身就是进步，继续观察，不评判。', offset: 3 * DAY + 2 * HOUR, likes: 14 },
]

/** 示例聊天记录：key 为好友 id，from 'me' 表示我发的消息 */
export const SEED_CHATS = {
  u1: [
    { id: 'c1a', from: 'u1', content: '早呀，今天早起打卡了吗？', offset: DAY + 8 * HOUR },
    { id: 'c1b', from: 'me', content: '打啦！你第 14 天了，太强了', offset: DAY + 8 * HOUR + 12 * MIN },
    { id: 'c1c', from: 'u1', content: '一起加油，目标是 30 天 💪', offset: DAY + 8 * HOUR + 15 * MIN },
  ],
  u2: [
    { id: 'c2a', from: 'me', content: '看你夜跑 5 公里，好厉害，我也想开始跑步', offset: 8 * HOUR },
    { id: 'c2b', from: 'u2', content: '从 2 公里慢慢加就行，重要的是出门 🌊', offset: 8 * HOUR + 9 * MIN },
    { id: 'c2c', from: 'u2', content: '周末要不要一起去江边跑？', offset: 8 * HOUR + 11 * MIN },
  ],
  u3: [
    { id: 'c3a', from: 'u3', content: '刚发了条帖子，晒被子真的治愈 🍋', offset: 28 * MIN },
    { id: 'c3b', from: 'me', content: '看到了哈哈，我也想晒被子了', offset: 25 * MIN },
  ],
}

/** 聊天自动回复语料（本地模拟：发消息后由好友随机回复一条） */
export const AUTO_REPLIES = {
  u1: ['嗯嗯，有道理 👍', '哈哈哈真的吗', '一起加油 💪', '今天也元气满满！', '说起来，你最近在忙什么呀？'],
  u2: ['哈哈哈可以', '周末约起来 🌊', '刚跑完步，累但爽', '你说，我听着呢', '早点休息呀'],
  u3: ['柠檬精已上线 🍋', '好耶！', '真的吗真的吗？', '抱抱你，会好起来的', '改天一起喝奶茶！'],
  u4: ['✨', '追光中，勿念', '好巧，我也刚想到这个', '收到～'],
  u5: ['慢慢来，比较快 🌺', '嗯嗯', '你说得对', '今天也要好好吃饭哦'],
}

/** 由种子数据构建初始板块状态（首次打开时写入本地存储） */
export function buildSeedState() {
  const now = Date.now()
  return {
    friends: [...SEED_FRIEND_IDS],
    likedPostIds: [],
    posts: SEED_POSTS.map(p => ({
      id: p.id,
      userId: p.userId,
      content: p.content,
      likes: p.likes,
      createdAt: now - p.offset,
    })),
    chats: Object.fromEntries(
      Object.entries(SEED_CHATS).map(([uid, msgs]) => [
        uid,
        msgs.map(m => ({ id: m.id, from: m.from, content: m.content, createdAt: now - m.offset })),
      ])
    ),
  }
}
