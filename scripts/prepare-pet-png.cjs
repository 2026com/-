/**
 * 桌宠立绘预处理：棋盘格背景抠图 → 裁剪 → 缩小
 * 用法：node scripts/prepare-pet-png.js [输入] [输出]
 * 零依赖（node 内置 zlib）；仅处理本项目的立绘资产
 * 步骤：
 *  1. 解码 PNG（RGB）；
 *  2. 从图像四边采样检测棋盘格双色 → 容差匹配；
 *  3. 从边缘 BFS 洪泛填充（只删与边连通的背景，角色内部的近似色不受影响）；
 *  4. 按 alpha 包围盒裁剪（留 8px 边距）；
 *  5. 最近邻缩放到最长边 512；
 *  6. 编码 RGBA PNG 覆盖输出。
 */
const fs = require('fs')
const zlib = require('zlib')

const [, , IN = 'public/pet/base.png', OUT = 'public/pet/base.png'] = process.argv

// ---------- PNG 解码 ----------
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG')
  let pos = 8, width = 0, height = 0, bitDepth = 8, colorType = 2
  const idats = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`暂不支持 bitDepth=${bitDepth} colorType=${colorType}`)
      if (data[12] !== 0) throw new Error('不支持隔行扫描')
    } else if (type === 'IDAT') idats.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = zlib.inflateSync(Buffer.concat(idats))
  // 还原滤波
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const row = raw.subarray(p, p + stride); p += stride
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
      let v = row[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
  }
  // 展开 RGBA
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = out[i * bpp]
    rgba[i * 4 + 1] = out[i * bpp + 1]
    rgba[i * 4 + 2] = out[i * bpp + 2]
    rgba[i * 4 + 3] = colorType === 6 ? out[i * bpp + 3] : 255
  }
  return { width, height, data: rgba }
}

// ---------- PNG 编码（RGBA，filter 0） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8bit RGBA
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 主流程 ----------
let img = decodePNG(fs.readFileSync(IN))
const { width: W, height: H, data } = img

// 1) 检测棋盘格双色：取最外圈 2px 的颜色，量化统计取前两名
const quant = (r, g, b) => `${r >> 4},${g >> 4},${b >> 4}`
const counts = new Map()
for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) {
  const i = (y * W + x) * 4
  const k = quant(data[i], data[i + 1], data[i + 2])
  counts.set(k, (counts.get(k) || 0) + 1)
}
for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) {
  const i = (y * W + x) * 4
  const k = quant(data[i], data[i + 1], data[i + 2])
  counts.set(k, (counts.get(k) || 0) + 1)
}
const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
  .map(([k]) => k.split(',').map(n => (parseInt(n) << 4) + 8))
console.log('棋盘格底色:', JSON.stringify(palette))

const isBg = (i) => palette.some(([pr, pg, pb]) =>
  Math.abs(data[i] - pr) <= 10 && Math.abs(data[i + 1] - pg) <= 10 && Math.abs(data[i + 2] - pb) <= 10)

// 2) 从边缘洪泛：只删与边连通的背景
const visited = new Uint8Array(W * H)
const queue = []
for (let x = 0; x < W; x++) { queue.push(x, 0, x, H - 1) }
for (let y = 0; y < H; y++) { queue.push(0, y, W - 1, y) }
while (queue.length) {
  const y = queue.pop(), x = queue.pop()
  if (x < 0 || y < 0 || x >= W || y >= H) continue
  const idx = y * W + x
  if (visited[idx]) continue
  if (!isBg(idx * 4)) continue
  visited[idx] = 1
  data[idx * 4 + 3] = 0
  queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
}
const removed = visited.reduce((s, v) => s + v, 0)
console.log(`背景剔除: ${removed} 像素 (${(removed / (W * H) * 100).toFixed(1)}%)`)

// 2.5) 孤岛清理：抗锯齿线可能圈住少数棋盘格残块（不与边连通）。对仍匹配底色、
//      且连通面积较小的块整体删除（阈值 20000px；角色白发是大连通块，不受影响）
{
  const seen = new Uint8Array(W * H)
  const match = (idx) => !visited[idx] && isBg(idx * 4)
  let removedIslands = 0, islands = 0
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || !match(start)) continue
    const comp = []
    const q = [start]; seen[start] = 1
    while (q.length) {
      const idx = q.pop(); comp.push(idx)
      const x = idx % W, y = (idx / W) | 0
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const ni = ny * W + nx
        if (!seen[ni] && match(ni)) { seen[ni] = 1; q.push(ni) }
      }
    }
    if (comp.length <= 20000) {
      islands++
      comp.forEach(idx => { data[idx * 4 + 3] = 0 })
      removedIslands += comp.length
    }
  }
  console.log(`孤岛清理: ${islands} 块 / ${removedIslands} 像素`)
}

// 2.6) 去斑点：透明边界的抗锯齿灰点残留清理
//   a) 孤立不透明小块（<30px，周围基本全透明）→ 整块透明（漂浮杂点）
//   b) 透明像素占比 ≥4/8 邻居的不透明像素 → 透明（吃掉 AA 光晕，跑 2 轮）
{
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : data[(y * W + x) * 4 + 3]
  for (let round = 0; round < 2; round++) {
    const toClear = []
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (data[i * 4 + 3] === 0) continue
      let trans = 0
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1], [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]]) {
        if (alphaAt(nx, ny) === 0) trans++
      }
      if (trans >= 4) toClear.push(i)
    }
    toClear.forEach(i => { data[i * 4 + 3] = 0 })
  }
  // 孤立不透明小块
  const seen2 = new Uint8Array(W * H)
  let specks = 0
  for (let s = 0; s < W * H; s++) {
    if (seen2[s] || data[s * 4 + 3] === 0) continue
    const comp = []
    const q = [s]; seen2[s] = 1
    while (q.length) {
      const idx = q.pop(); comp.push(idx)
      const x = idx % W, y = (idx / W) | 0
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const ni = ny * W + nx
        if (!seen2[ni] && data[ni * 4 + 3] !== 0) { seen2[ni] = 1; q.push(ni) }
      }
    }
    if (comp.length < 30) { specks++; comp.forEach(idx => { data[idx * 4 + 3] = 0 }) }
  }
  console.log(`去斑点: 清理边缘杂点 2 轮 + 孤立小块 ${specks} 块`)
}

// 3) alpha 包围盒裁剪（留 8px）
let minX = W, minY = H, maxX = 0, maxY = 0
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (data[(y * W + x) * 4 + 3] > 8) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
}
minX = Math.max(0, minX - 8); minY = Math.max(0, minY - 8)
maxX = Math.min(W - 1, maxX + 8); maxY = Math.min(H - 1, maxY + 8)
const cw = maxX - minX + 1, ch = maxY - minY + 1
console.log(`裁剪: ${W}x${H} -> ${cw}x${ch}`)

// 4) 缩放到最长边 512（最近邻）
const MAX = 512
const scale = Math.min(1, MAX / Math.max(cw, ch))
const tw = Math.max(1, Math.round(cw * scale)), th = Math.max(1, Math.round(ch * scale))
const out = Buffer.alloc(tw * th * 4)
for (let y = 0; y < th; y++) {
  const sy = minY + Math.min(ch - 1, Math.floor(y / scale))
  for (let x = 0; x < tw; x++) {
    const sx = minX + Math.min(cw - 1, Math.floor(x / scale))
    const si = (sy * W + sx) * 4, di = (y * tw + x) * 4
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3]
  }
}
fs.mkdirSync(require('path').dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, encodePNG(tw, th, out))
console.log(`输出: ${OUT} ${tw}x${th} ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`)
