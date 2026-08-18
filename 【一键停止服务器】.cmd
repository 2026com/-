@echo off
chcp 65001 >nul
REM ========== 个人成长强者体系 【一键停止服务器 V2】 ==========
REM  修复点：
REM  1. 同时清理两套 PID 记录文件：.vite-pid.txt（旧 CMD 写的）+ vite.pid（start-vite.mjs 写的）
REM  2. 四层兜底：PID记录 → 5173~5182 端口扫描 → vite.js 命令行关键字 node 进程 → 端口兜底重复
REM  3. 全部杀死后再二次确认端口无残留，做到"真停止"

setlocal
set "PROJECT_DIR=%~dp0"
set "PID_FILE_OLD=%PROJECT_DIR%.vite-pid.txt"
set "PID_FILE_NEW=%PROJECT_DIR%vite.pid"

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║   ⏹ 个人成长强者体系 - 开发服务器一键停止 V2                ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set KILLED=0

REM ---------- 第一层：按两个 PID 记录文件杀 ----------
echo [1/4] 🔎 读取 PID 记录文件并尝试终止...
for %%F in ("%PID_FILE_OLD%" "%PID_FILE_NEW%") do (
    if exist %%F (
        set /p RECORDED_PID=<%%F
        setlocal enabledelayedexpansion
        if defined RECORDED_PID (
            if not "!RECORDED_PID!"=="" (
                tasklist /FI "PID eq !RECORDED_PID!" /NH 2>nul | find /i "node.exe" >nul
                if not errorlevel 1 (
                    echo       · 文件 %%~nxF 记录 PID=!RECORDED_PID! → 终止中...
                    taskkill /F /PID !RECORDED_PID! >nul 2>&1
                    if not errorlevel 1 ( echo         ✅ PID !RECORDED_PID! 已终止 & set "KILLED=1" )
                ) else (
                    echo       · 文件 %%~nxF 记录 PID=!RECORDED_PID! → 进程已不存在（跳过）
                )
            )
        )
        endlocal
        del /q %%F >nul 2>&1
    )
)

REM ---------- 第二层：5173 ~ 5182 端口占用扫描杀 ----------
echo.
echo [2/4] 🔎 扫描 5173~5182 端口占用的进程...
for %%P in (5173 5174 5175 5176 5177 5178 5179 5180 5181 5182) do (
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%%P " ^| findstr LISTENING 2^>nul') do (
        if not "%%a"=="0" (
            echo       · 端口 %%P 占用 PID=%%a → 终止中...
            taskkill /F /PID %%a >nul 2>&1
            if not errorlevel 1 ( echo         ✅ PID %%a 已终止 & set "KILLED=1" )
        )
    )
)

REM ---------- 第三层：所有带 vite.js / vite-preview.mjs / start-vite.mjs 命令行的 node 进程 ----------
echo.
echo [3/4] 🔎 扫描带 vite 关键字的 node.exe 进程...
REM 兜底 CSV 方式取 PID
for /f "tokens=2 delims=," %%a in ('wmic process where "name='node.exe' and (CommandLine like '%%vite.js%%' or CommandLine like '%%vite-preview.mjs%%' or CommandLine like '%%start-vite.mjs%%')" get ProcessId^,CommandLine /format:csv 2^>nul ^| findstr /r /v "^$"') do (
    if not "%%a"=="" (
        REM %%a 此时就是纯数字 PID
        tasklist /FI "PID eq %%a" /NH 2>nul | find /i "node.exe" >nul
        if not errorlevel 1 (
            echo       · node.exe PID=%%a（含 vite 关键字） → 终止中...
            taskkill /F /PID %%a >nul 2>&1
            if not errorlevel 1 ( echo         ✅ PID %%a 已终止 & set "KILLED=1" )
        )
    )
)

REM ---------- 第四层：再扫端口，确保无残留 ----------
echo.
echo [4/4] 🧪 二次校验端口是否已释放...
set LEAK=0
for %%P in (5173 5174 5175 5176 5177 5178 5179 5180 5181 5182) do (
    netstat -ano 2>nul | findstr ":%%P " | findstr LISTENING >nul 2>&1
    if not errorlevel 1 (
        echo       ⚠️ 端口 %%P 仍被占用
        set "LEAK=1"
    )
)

echo.
echo ──────────────────────────────────────────────────────────────
if "%KILLED%"=="1" (
    echo 🎉 已执行停止操作。
) else (
    echo ℹ️  当前未检测到运行中的 Vite 服务（不需要停止）。
)
if "%LEAK%"=="1" (
    echo ⚠️ 仍有端口未释放，可能是非 Vite 程序占用，可用：netstat -ano ^| findstr :端口号  查看后手动 taskkill
)
echo ──────────────────────────────────────────────────────────────
echo.
pause
endlocal
exit /b 0
