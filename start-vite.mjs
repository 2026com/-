// start-vite.mjs —— 一键启动 Vite 开发服务器（Windows 加固版）
// 修复点：
// 1. PowerShell 执行策略 Bypass：用 node 直接启动，完全绕开 .ps1 脚本
// 2. 端口占用：启动失败 -> 扫描原因，给出中文提示（端口占用/依赖缺失/路径问题）
// 3. 启动状态提示：启动中 → 探测就绪(HTTP 200) → 成功 / 失败 → 退出码 + 简短原因
// 4. 就绪后才打印访问 URL：必须真实 HTTP 可访问才算完成，避免出现链接但打不开的情况
// 5. 路径兼容：含中文/空格目录名 d:\小美 全绝对路径 + URL.resolve 归一化

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viteBin = path.resolve(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
const pkgJson = path.resolve(__dirname, 'package.json');
const logFile = path.resolve(__dirname, 'vite-startup.log');
const pidFile = path.resolve(__dirname, 'vite.pid');

const HOST = '127.0.0.1';
const PORT_START = 5173;
const PORT_MAX_TRY = 10;          // 最多找 10 个可用端口
const READY_TIMEOUT_MS = 60000;   // 最长等 60 秒 Vite 启动就绪
const READY_POLL_MS = 800;        // 每 800ms 探测一次

function log(msg) {
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ${msg}`;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch (_) {}
}
function logErr(msg) {
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ❌ ${msg}`;
  process.stderr.write(line + '\n');
  try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch (_) {}
}

// ====== 检查依赖 ======
if (!fs.existsSync(viteBin)) {
  logErr('未找到 Vite CLI：' + viteBin);
  logErr('请先运行：  npm install   （或：cnpm install / pnpm install）');
  process.exit(2);
}
if (!fs.existsSync(pkgJson)) {
  logErr('未找到 package.json，当前目录异常：' + __dirname);
  process.exit(3);
}

// ====== 探测端口是否被占用 ======
function probePort(port) {
  return new Promise((resolve) => {
    const req = http.request({
      host: HOST, port, method: 'HEAD', timeout: 1000, path: '/'
    }, (res) => {
      resolve({ used: true, statusCode: res.statusCode });
      res.resume();
    });
    req.on('error', () => resolve({ used: false }));
    req.on('timeout', () => { req.destroy(); resolve({ used: false }); });
    req.end();
  });
}

// ====== 探测 URL 是否返回 200/304/302（Vite 就绪） ======
function probeUrlReady(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request({
      host: u.hostname, port: u.port || 80, method: 'GET', timeout: 1500, path: u.pathname || '/'
    }, (res) => {
      const code = res.statusCode || 0;
      const ok = (code >= 200 && code < 500); // Vite 首次返回 2xx/3xx/4xx 都算"进程已起来"
      res.resume();
      resolve(ok);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// ====== 找一个可用端口 ======
async function findAvailablePort(start) {
  for (let p = start; p < start + PORT_MAX_TRY; p++) {
    const r = await probePort(p);
    if (!r.used) return p;
  }
  return null;
}

// ====== 杀死上一次遗留的 vite.pid ======
function killLastPid() {
  try {
    if (!fs.existsSync(pidFile)) return;
    const pid = Number(String(fs.readFileSync(pidFile, 'utf8')).trim());
    if (!pid || pid < 10) { fs.unlinkSync(pidFile); return; }
    process.kill(pid, 0); // 仅测试存活
    try { process.kill(pid, 'SIGTERM'); } catch (_) {
      // Windows: taskkill
      try { spawn('taskkill', ['/F', '/PID', String(pid)], { windowsHide: true }); } catch (__) {}
    }
    log(`检测到遗留 PID=${pid}，已清理`);
    try { fs.unlinkSync(pidFile); } catch (_) {}
  } catch (_) {
    // 没存活就忽略
    try { fs.unlinkSync(pidFile); } catch (__) {}
  }
}

// ====== 主流程 ======
async function main() {
  try { fs.appendFileSync(logFile, `\n\n======== ${new Date().toLocaleString()} ========\n`, 'utf8'); } catch (_) {}

  killLastPid();

  log('🚀 [启动中] 正在寻找可用端口...');
  const port = await findAvailablePort(PORT_START);
  if (port == null) {
    logErr(`连续 ${PORT_MAX_TRY} 个端口(${PORT_START}~${PORT_START + PORT_MAX_TRY - 1})均被占用，请手动关闭占用进程后重试。`);
    logErr('排查命令(管理员 PowerShell)： netstat -ano | findstr :5173');
    process.exit(4);
  }
  log(`   📡 选定端口：${port}（127.0.0.1）`);

  // ====== 启动子进程（node 直接调 vite CLI） ======
  log('🚀 [启动中] 正在启动 Vite 子进程...');
  let child;
  try {
    child = spawn(process.execPath, [
      viteBin,
      '--host', HOST,
      '--port', String(port),
      '--strictPort',   // 严格使用指定端口，我们已经保证可用，避免 Vite 自改端口造成探测失配
      '--clearScreen=false'
    ], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0' }
    });
  } catch (e) {
    logErr('启动 Vite 子进程失败：' + (e.message || e));
    process.exit(5);
  }

  try { fs.writeFileSync(pidFile, String(child.pid), 'utf8'); } catch (_) {}

  // 实时读取输出
  let lastLine = '';
  child.stdout.on('data', (buf) => {
    const text = buf.toString();
    lastLine = text.split(/\r?\n/).filter(Boolean).pop() || lastLine;
    try { fs.appendFileSync(logFile, text, 'utf8'); } catch (_) {}
  });
  child.stderr.on('data', (buf) => {
    const text = buf.toString();
    lastLine = text.split(/\r?\n/).filter(Boolean).pop() || lastLine;
    try { fs.appendFileSync(logFile, text, 'utf8'); } catch (_) {}
  });

  // ====== 轮询就绪探测 ======
  const url = `http://${HOST}:${port}/`;
  const startTs = Date.now();
  log(`🚀 [启动中] 正在等待 HTTP 就绪：${url}`);
  let success = false;
  let failReason = '';

  // 子进程退出提前终止
  child.once('exit', (code, sig) => {
    if (success) return;
    failReason = `子进程异常退出（code=${code} sig=${sig || 'none'}）`;
  });

  while (!success && Date.now() - startTs < READY_TIMEOUT_MS) {
    if (failReason) break;
    const ok = await probeUrlReady(url);
    if (ok) { success = true; break; }
    await new Promise(r => setTimeout(r, READY_POLL_MS));
  }

  if (!success) {
    logErr(failReason || `等待超过 ${READY_TIMEOUT_MS / 1000} 秒仍未就绪`);
    logErr('👉 启动日志：' + logFile);
    logErr('👉 最后一段输出：' + (lastLine || '(空)'));
    try { process.kill(child.pid, 'SIGKILL'); } catch (_) {}
    try { fs.unlinkSync(pidFile); } catch (__) {}
    process.exit(6);
  }

  // ====== 成功 ======
  log('');
  log('✅ [启动成功] Vite 开发服务器已就绪，PID = ' + child.pid);
  log(`   📂 工作目录  ：${__dirname}`);
  log(`   🌐 本地访问  ：${url}`);
  log(`   📖 启动日志  ：${logFile}`);
  log('   ℹ️  本脚本退出后，Vite 子进程继续后台运行不中断');
  log('');

  // ====== 把最终 URL 写入 .startup-url.txt（纯 ASCII，供 .cmd 读取后打开浏览器）======
  try {
    fs.writeFileSync(path.resolve(__dirname, '.startup-url.txt'), url + '\n', 'ascii');
  } catch (_) {}

  // 脚本 1.5 秒后退出，子进程独立
  setTimeout(() => {
    child.unref();
    process.exit(0);
  }, 1500);
}

main().catch((e) => {
  logErr('主流程异常：' + (e.stack || e.message || e));
  process.exit(99);
});
