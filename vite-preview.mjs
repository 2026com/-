// vite-preview.mjs —— TRAE 内置预览专用：前台长驻模式（不 detached / 不 unref）
// 解决痛点 1：OpenPreview 绑定的 command_id 对应的进程必须持续存活，否则预览侧会"服务不可用"
// 解决痛点 2：就绪 -> 打印分隔线，外层脚本可精准捕获 URL 并自动跳转
// 保留功能：依赖检查、端口自动回退（5173 ~ 5182）、启动中/成功/失败三态中文提示、就绪轮询

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viteBin = path.resolve(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
const logFile = path.resolve(__dirname, 'vite-preview.log');

const HOST = '127.0.0.1';
const PORT_START = 5173;
const PORT_MAX_TRY = 10;
const READY_TIMEOUT_MS = 60000;
const READY_POLL_MS = 800;

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

// 端口占用探测
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
// 就绪探测
function probeUrlReady(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request({
      host: u.hostname, port: u.port || 80, method: 'GET', timeout: 1500, path: u.pathname || '/'
    }, (res) => {
      const code = res.statusCode || 0;
      const ok = (code >= 200 && code < 500);
      res.resume();
      resolve(ok);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}
// 找 10 个端口内第一个可用
async function findAvailablePort(start) {
  for (let p = start; p < start + PORT_MAX_TRY; p++) {
    const r = await probePort(p);
    if (!r.used) return p;
  }
  return null;
}

async function main() {
  try { fs.appendFileSync(logFile, `\n\n======== ${new Date().toLocaleString()}  [vite-preview.mjs 长驻模式] ========\n`, 'utf8'); } catch (_) {}

  // 1) 依赖检查
  if (!fs.existsSync(viteBin)) {
    logErr('未找到 Vite CLI：' + viteBin);
    logErr('请先在项目目录运行：  node "%ProgramFiles%\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" install --no-audit --no-fund');
    process.exit(2);
  }

  // 2) 端口扫描 + 自动回退
  log('🚀 [启动中] 正在扫描可用端口（5173 ~ ' + (PORT_START + PORT_MAX_TRY - 1) + '）...');
  const port = await findAvailablePort(PORT_START);
  if (port == null) {
    logErr(`连续 ${PORT_MAX_TRY} 个端口均被占用。\n排查命令（管理员 PowerShell）： netstat -ano | findstr LISTENING | findstr :5`);
    process.exit(4);
  }
  if (port !== PORT_START) {
    log(`   📡 端口 ${PORT_START} 已占用 → 自动切换到：${port}`);
  } else {
    log(`   📡 选定端口：${port}`);
  }

  // 3) 前台直接启动 Vite（关键：stdio = inherit，不 detached，不 unref，不 setTimeout 退出）
  log('🚀 [启动中] 正在启动 Vite 开发服务器（前台长驻模式，Ctrl+C 停止）...');
  let child;
  try {
    child = spawn(process.execPath, [
      viteBin,
      '--host', HOST,
      '--port', String(port),
      '--strictPort',
      '--clearScreen=false'
    ], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
      // 注意：这里不写 detached: true → 进程与当前 command_id 同生命周期，OpenPreview 能绑定
    });
  } catch (e) {
    logErr('启动 Vite 子进程失败：' + (e.message || e));
    process.exit(5);
  }

  // Vite 子进程输出 -> 转发到我们自己的 stdout，供 OpenPreview / 日志观察
  child.stdout.on('data', (buf) => {
    try { fs.appendFileSync(logFile, buf.toString(), 'utf8'); } catch (_) {}
  });
  child.stderr.on('data', (buf) => {
    const txt = buf.toString();
    // Vite 初始化阶段有时把 ready 信息打在 stderr，不转交给用户以免当错误，保留在日志
    try { fs.appendFileSync(logFile, '[vite-stderr] ' + txt, 'utf8'); } catch (_) {}
  });
  child.on('exit', (code, sig) => {
    log(`Vite 进程已退出（code=${code} sig=${sig || 'none'}），前台长驻模式随之结束`);
    process.exit(code || 0);
  });

  // 4) 就绪轮询（最多 60 秒）
  const url = `http://${HOST}:${port}/`;
  log(`🚀 [启动中] 正在等待 HTTP 就绪：${url}`);
  const startTs = Date.now();
  let success = false;
  let failReason = '';

  // 子进程意外退出时立刻终止等待
  const exitHandler = (code, sig) => {
    if (success) return;
    failReason = `子进程异常退出（code=${code} sig=${sig || 'none'}）`;
  };
  child.once('exit', exitHandler);

  while (!success && Date.now() - startTs < READY_TIMEOUT_MS) {
    if (failReason) break;
    try {
      const ok = await probeUrlReady(url);
      if (ok) { success = true; break; }
    } catch (_) {}
    await new Promise(r => setTimeout(r, READY_POLL_MS));
  }
  child.removeListener('exit', exitHandler);

  if (!success) {
    logErr(failReason || `等待超过 ${READY_TIMEOUT_MS / 1000} 秒仍未就绪`);
    logErr('👉 详细启动日志：' + logFile);
    try { process.kill(child.pid, 'SIGKILL'); } catch (_) {}
    process.exit(6);
  }

  // 5) 成功 — 打印分隔线（外层脚本解析这一段拿到 URL，用于自动跳转预览）
  log('');
  log('══════════════════════════════════════════════════════════');
  log('✅ [启动成功] TRAE 前台长驻模式已就绪，服务 PID = ' + child.pid);
  log(`   🌐 预览地址  ：${url}`);
  log(`   📂 项目目录  ：${__dirname}`);
  log(`   📖 运行日志  ：${logFile}`);
  log('   ℹ️  保持此命令窗口运行即可，关闭 = 停止服务');
  log('═══ TRACE_OPEN_PREVIEW_BEGIN ═══');
  console.log(url);                 // 单独一行纯 URL，方便机器解析
  log('═══ TRACE_OPEN_PREVIEW_END ═════');
  log('');

  // 关键：不在此处退出。前台长驻模式下，父进程（我们）和 Vite 子进程一起常驻，
  // OpenPreview 绑定的 command_id 对应的进程就是当前这个，保证预览期间始终存活。
}

main().catch((e) => {
  logErr('主流程异常：' + (e.stack || e.message || e));
  process.exit(99);
});
