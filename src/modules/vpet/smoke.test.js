/**
 * 控制中心全链路冒烟测试（node 直跑；esbuild 打包后 node 执行）
 * 验证：协议校验 / 优先级抢占 / 过期回落待机 / work 完成 / 参数分区防线
 */
import { createMockDirector } from './index.js'

let pass = 0, fail = 0
const assert = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg) } else { fail++; console.error('  ✗', msg) } }

const d = createMockDirector()
const events = []
d.on('rejected', (e) => events.push(['rejected', e.reason]))
d.on('preempted', (e) => events.push(['preempted', e.replaced.type, '->', e.by.type]))
d.on('settled', (e) => events.push(['settled', e.channel, e.finished.type]))
d.on('work-done', (e) => events.push(['work-done', e.taskId]))

console.log('== 1) 协议校验 ==')
assert(d.submit({ type: 'dance' }).ok === false, '未知指令类型被拒绝')
assert(d.submit({ type: 'work' }).ok === false, 'work 缺 name 被拒绝')
assert(d.submit({ type: 'emote', durationMs: 99999 }).ok === false, '超长 durationMs 被拒绝')

console.log('== 2) 正常提交 + 通道内替换 ==')
assert(d.submit({ type: 'motion', name: 'nod' }).ok, 'motion 提交成功')
let f = d.tick()
assert(f.body.ParamAngleY !== undefined, '身体执行器输出点头动作')
assert(f.modelUpdate.ParamMouthForm === undefined, '分区防线：身执行器越权的嘴参数被剥除')
assert(d.submit({ type: 'motion', name: 'shake' }).ok, '同级 motion 替换成功')
d.submit({ type: 'emote', name: 'happy' })
f = d.tick()
assert(f.face.ParamMouthForm > 0, 'emote happy 平滑生效（嘴角上扬）')
assert(events.filter(e => e[0] === 'preempted' && e[3] === 'emote').length === 0, 'emote 提交时脸通道为空，不应有抢占事件（不同通道互不抢占）')

console.log('== 3) 通道内优先级 + speak 口型 ==')
assert(d.submit({ type: 'speak', durationMs: 500 }).ok, 'speak 提交成功（抢占脸通道）')
f = d.tick()
assert(f.face.ParamMouthOpenY !== undefined, 'speak 口型输出')
assert(events.some(e => e[0] === 'preempted' && e[3] === 'speak'), 'speak 抢占 emote 有事件')
const lowPri = d.submit({ type: 'emote', name: 'happy' })
assert(lowPri.ok === false && lowPri.reason === 'low-priority', '低优先级 emote 被拒绝（speak 表演中）')

console.log('== 4) 过期回落待机 ==')
await new Promise(r => setTimeout(r, 600))
f = d.tick()
assert(!d.channels.face.instruction, 'speak 过期后脸通道清空')
d.submit({ type: 'idle' })
await new Promise(r => setTimeout(r, 80))
f = d.tick()
assert(f.body.ParamBreath !== undefined, '无指令时身体回落待机（呼吸输出）')

console.log('== 5) work + completeWork ==')
assert(d.submit({ type: 'work', name: 'cast', params: { taskId: 'bg-123' } }).ok, 'work 提交成功')
await new Promise(r => setTimeout(r, 80))
f = d.tick()
assert(f.body.ParamBodyAngleY !== undefined, 'work cast 动作输出')
assert(d.completeWork('bg-123'), 'completeWork 结束工作')
assert(!d.channels.body.instruction, 'work 结束后身通道清空')
assert(d.completeWork('bg-123') === false, '重复 completeWork 返回 false')

console.log('== 6) idle 全通道复位 ==')
d.submit({ type: 'motion', name: 'nod' })
d.submit({ type: 'idle' })
assert(!d.channels.face.instruction && !d.channels.body.instruction, 'idle 清空双通道')

console.log('== 7) 真实适配器（阶段二骨架） ==')
const { SoullinkFaceExecutor } = await import('./executors/soullinkFaceAdapter.js')
const { Ag99BodyExecutor } = await import('./executors/ag99BodyAdapter.js')
const sf = new SoullinkFaceExecutor()
const ab = new Ag99BodyExecutor()
const d2 = createMockDirector({ faceExecutor: sf, bodyExecutor: ab })

// 7a) SoulLink 脸适配器：emote 输出仅脸参数（越权身参数被剥除）
assert(d2.submit({ type: 'emote', name: 'happy' }).ok, '真实脸适配器 emote 提交')
await new Promise(r => setTimeout(r, 60))
f = d2.tick()
assert(f.face.mouthForm > 0 && f.face.cheek > 0, 'SoulLink 适配器通用表情键输出')
assert(f.modelUpdate.bodyAngleX === undefined, '分区防线：脸适配器越权身参数被剥除')

// 7b) AG99 身适配器：语义轴 → 参数；脸语义轴被剥除
ab.setAxisLevels({ head_yaw: 2, body_yaw: -2, brow_bias: 4 })
assert(ab.lastDroppedFaceAxes.brow_bias === 4, 'AG99 脸语义轴(brow_bias)被适配器剥除并留痕')
await new Promise(r => setTimeout(r, 60))
d2.tick()
await new Promise(r => setTimeout(r, 60))
f = d2.tick()
assert(f.body.angleX > 5 && f.body.bodyAngleX < 0, '语义轴换算生效（head_yaw→angleX, body_yaw→bodyAngleX）')
assert(f.body.mouthForm === undefined && f.body.browLY === undefined, '分区防线：身适配器越权嘴/眉参数被剥除')
assert(f.body.breath !== undefined, '呼吸节奏常驻输出')

// 7c) 分区表保护：物理参数（头发）不可直写
assert((await import('./channels.js')).isPhysicsParam('ParamHairFront'), '头发参数识别为物理参数')

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
