/**
 * 自动生成"闭眼贴片"全画布图层（1024² RGBA，透明底，仅眼睛区域有内容）
 * 1. 重算 模板1 透明裁剪框 → 建立 PSD(1024²) ⇄ 模板1(2048²) 坐标映射
 * 2. PSD 的 irides/eyewhite/eyelash 包围盒 → 眼睛区域（外扩边距）
 * 3. 映射到闭眼图(2048²)逐像素采样；alpha = 矩形羽化 × 差异掩膜(膨胀)
 * 4. 输出 art/eye_closed_layer_1024.png（Krita 图层→导入图像，位置自动精准）
 */
const fs = require('fs'), zlib = require('zlib')
function decodePNG(f){const buf=fs.readFileSync(f);let pos=8,W=0,H=0,ct=2;const idats=[];
while(pos<buf.length){const len=buf.readUInt32BE(pos);const t=buf.toString('ascii',pos+4,pos+8);const d=buf.subarray(pos+8,pos+8+len);
if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);ct=d[9]}else if(t==='IDAT')idats.push(d);else if(t==='IEND')break;pos+=12+len}
const bpp=ct===6?4:3;const raw=zlib.inflateSync(Buffer.concat(idats));const stride=W*bpp;const out=Buffer.alloc(H*stride);let p=0;
for(let y=0;y<H;y++){const fl=raw[p++];const row=raw.subarray(p,p+stride);p+=stride;const prev=y>0?out.subarray((y-1)*stride,y*stride):null;const cur=out.subarray(y*stride,(y+1)*stride);
for(let x=0;x<stride;x++){const a=x>=bpp?cur[x-bpp]:0;const b=prev?prev[x]:0;const c=prev&&x>=bpp?prev[x-bpp]:0;let v=row[x];
if(fl===1)v+=a;else if(fl===2)v+=b;else if(fl===3)v+=(a+b)>>1;else if(fl===4){const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c)}cur[x]=v&0xff}}
const rgba=Buffer.alloc(W*H*4);
for(let i=0;i<W*H;i++){rgba[i*4]=out[i*bpp];rgba[i*4+1]=out[i*bpp+1];rgba[i*4+2]=out[i*bpp+2];rgba[i*4+3]=ct===6?out[i*bpp+3]:255}
return {W,H,data:rgba}}

const A = decodePNG('art/模板1.png')
const CE = decodePNG('art/闭眼png.png')
console.log(`睁眼:${A.W}x${A.H} 闭眼:${CE.W}x${CE.H}`)

// ---- 1) 模板1 透明裁剪框重算（洪泛找背景，非背景即角色包围盒） ----
const isBg = (i) => {
  const r = A.data[i], g = A.data[i+1], b = A.data[i+2]
  return Math.abs(r-248)<=12 && Math.abs(g-248)<=12 && Math.abs(b-248)<=12
}
const vis = new Uint8Array(A.W * A.H)
const q0 = []
for (let x = 0; x < A.W; x++) q0.push(x, 0, x, A.H-1)
for (let y = 0; y < A.H; y++) q0.push(0, y, A.W-1, y)
while (q0.length) {
  const y = q0.pop(), x = q0.pop()
  if (x<0||y<0||x>=A.W||y>=A.H) continue
  const idx = y*A.W+x
  if (vis[idx] || !isBg(idx*4)) continue
  vis[idx] = 1; q0.push(x+1,y,x-1,y,x,y+1,x,y-1)
}
let bx=A.W,by=A.H,bx2=0,by2=0
for (let y=0;y<A.H;y++) for (let x=0;x<A.W;x++) {
  if (!vis[y*A.W+x]) { if(x<bx)bx=x; if(x>bx2)bx2=x; if(y<by)by=y; if(y>by2)by2=y }
}
const BW = bx2-bx+1, BH = by2-by+1
console.log(`模板1 角色包围盒: x:${bx} y:${by} 宽:${BW} 高:${BH}`)

// ---- 2) PSD 眼睛区域 ----
const { readPsd } = require('ag-psd')
const psdBuf = fs.readFileSync('art/seethrough_output (1).psd')
const psd = readPsd(psdBuf.buffer.slice(psdBuf.byteOffset, psdBuf.byteOffset + psdBuf.byteLength), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true })
let ex1=1e9, ey1=1e9, ex2=0, ey2=0
psd.children.forEach(l => {
  if (['irides','eyewhite','eyelash'].includes(l.name) && l.left != null) {
    ex1 = Math.min(ex1, l.left); ey1 = Math.min(ey1, l.top)
    ex2 = Math.max(ex2, l.right); ey2 = Math.max(ey2, l.bottom)
  }
})
const M = 22
ex1 -= M; ey1 -= M; ex2 += M; ey2 += M
console.log(`PSD 眼睛区域(含边距): x:${Math.round(ex1)}-${Math.round(ex2)} y:${Math.round(ey1)}-${Math.round(ey2)}`)

// ---- 3) 生成贴片图层 ----
const layer = Buffer.alloc(1024 * 1024 * 4)
const DILATE = 14
for (let py = 0; py < 1024; py++) for (let px = 0; px < 1024; px++) {
  if (px < ex1 || px > ex2 || py < ey1 || py > ey2) continue
  // PSD → 模板1 坐标（PSD 1024² = 透明版(BWxBH)拉伸满画布；透明版 = 模板1 从(bx,by)裁剪）
  const tx = bx + px / 1024 * BW
  const ty = by + py / 1024 * BH
  const cxi = Math.min(CE.W - 1, Math.max(0, Math.round(tx)))
  const cyi = Math.min(CE.H - 1, Math.max(0, Math.round(ty)))
  // 差异掩膜：闭眼图此像素相对原图是否真的被改过（膨胀采样）
  let dsum = 0, dn = 0
  for (let dy2 = -DILATE; dy2 <= DILATE; dy2 += 4) for (let dx2 = -DILATE; dx2 <= DILATE; dx2 += 4) {
    const mx = cxi + dx2, my = cyi + dy2
    if (mx < 0 || my < 0 || mx >= CE.W || my >= CE.H) continue
    const ai = (my * A.W + mx) * 4, bi = (my * CE.W + mx) * 4
    dsum += Math.abs(A.data[ai]-CE.data[bi]) + Math.abs(A.data[ai+1]-CE.data[bi+1]) + Math.abs(A.data[ai+2]-CE.data[bi+2])
  }
  const diffK = Math.min(1, (dsum / dn) / 60)
  // 矩形边缘羽化（16px 内线性渐隐）
  const fx = Math.min(px - ex1, ex2 - px, 64) / 16
  const fy = Math.min(py - ey1, ey2 - py, 64) / 16
  const feather = Math.max(0, Math.min(1, fx, fy))
  const alpha = diffK * feather
  if (alpha < 0.02) continue
  const di = (py * 1024 + px) * 4
  const ci = (cyi * CE.W + cxi) * 4
  layer[di] = CE.data[ci]; layer[di+1] = CE.data[ci+1]; layer[di+2] = CE.data[ci+2]; layer[di+3] = Math.round(alpha * 255)
}

// ---- 4) 编码输出 ----
const CRC_TABLE=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c}return t})();
const crc32=(b)=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC_TABLE[(c^b[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t,'ascii'),d]);const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(td));return Buffer.concat([l,td,cr])};
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1024,0);ihdr.writeUInt32BE(1024,4);ihdr[8]=8;ihdr[9]=6;
const s2=1024*4;const raw2=Buffer.alloc(1024*(s2+1));
for(let y=0;y<1024;y++){raw2[y*(s2+1)]=0;layer.copy(raw2,y*(s2+1)+1,y*s2,(y+1)*s2)}
const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw2,{level:9})),chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync('art/eye_closed_layer_1024.png', png)
let opaque = 0
for (let i = 3; i < layer.length; i += 4) if (layer[i] > 0) opaque++
console.log(`已生成 art/eye_closed_layer_1024.png（${(png.length/1024).toFixed(0)}KB，贴片有效像素 ${opaque}）`)
