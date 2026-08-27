@echo off
rem 一键重启 Vite dev server（页面打不开/卡住时双击我）
rem 1) 结束占用 5173 端口的残留进程  2) 后台重启  3) 自检
rem 注意：本脚本位于 scripts\ 子目录，先回项目根再调启动器
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
cd /d "%~dp0.."
start "vite-dev" /min node start-vite.mjs
timeout /t 4 /nobreak >nul
curl -s -o nul -w "dev server status: HTTP %%{http_code}  (200 = OK)  http://127.0.0.1:5173/knowledge-base" http://127.0.0.1:5173/knowledge-base
echo.
pause