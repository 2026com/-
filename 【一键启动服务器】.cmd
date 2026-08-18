@echo off
chcp 65001 >nul
REM ========== 个人成长强者体系 【一键启动服务器 V2】 ==========
REM  修复点：
REM  1. 直接 node.exe 跑 start-vite.mjs（已内置 npm install、端口探测、HTTP 就绪三阶段）
REM  2. 服务真实 HTTP 可访问后，自动用 start 命令打开默认浏览器跳转到预览地址
REM  3. start-vite.mjs 内部已经：端口冲突自动切换、启动失败输出中文提示、PID 写入 vite.pid
REM  4. 全程不依赖 PowerShell 策略、不依赖 .ps1 脚本

setlocal
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║   🚀 个人成长强者体系  -  一键启动开发服务器 V2             ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM ---- 1. Node.js 可用性检查 ----
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ 未检测到 node.exe，请先安装 Node.js 18+ 并重启电脑
    echo    下载地址：https://nodejs.org/zh-cn/download
    pause
    exit /b 1
)

REM ---- 2. 首次运行无 node_modules 则先 npm install（直接调 npm-cli.js，绕过 .ps1 限制） ----
if not exist "%PROJECT_DIR%node_modules\vite\package.json" (
    echo [准备] 📦 首次运行，正在安装依赖（约1-3分钟）...
    for /f "delims=" %%i in ('node -e "try{console.log(require.resolve('npm'))}catch(e){console.log('')}" 2^>nul') do set "NPM_CLI=%%i"
    if "%NPM_CLI%"=="" (
        node "%ProgramFiles%\nodejs\node_modules\npm\bin\npm-cli.js" install --no-audit --no-fund
    ) else (
        node "%NPM_CLI%" install --no-audit --no-fund
    )
    if errorlevel 1 (
        echo.
        echo ❌ npm install 安装失败，请检查网络后重试
        pause
        exit /b 2
    )
    echo [准备] ✅ 依赖安装完成
)

REM ---- 3. 状态提示：启动中 ----
echo.
echo ┌─────────────────────────────────────────────────────────────┐
echo │  [阶段 1/3] 🚀 [启动中] 正在启动 Vite 服务...                │
echo │             • 自动扫描 5173~5182 端口，冲突自动切换         │
echo │             • 必须 HTTP 真实可访问，才算启动成功            │
echo └─────────────────────────────────────────────────────────────┘
echo.

REM ---- 4. 调用 start-vite.mjs（detached 后台启动 + 就绪探测 + PID 文件） ----
REM     把 start-vite.mjs 的 stdout 抓到临时文件，结束后解析出 URL 自动打开浏览器
set "TMP_LOG=%PROJECT_DIR%vite-startup-run.log"
set "URL_FILE=%PROJECT_DIR%.startup-url.txt"
if exist "%TMP_LOG%" del "%TMP_LOG%"
if exist "%URL_FILE%" del "%URL_FILE%"

node "%PROJECT_DIR%start-vite.mjs" > "%TMP_LOG%" 2>&1
set "START_RC=%ERRORLEVEL%"

REM ---- 5. 从 start-vite.mjs 输出中解析最终访问 URL（优先用 start-vite 自己打印的那一行） ----
set "FINAL_URL="
for /f "usebackq tokens=*" %%a in (`type "%TMP_LOG%" 2^>nul ^| findstr /i /c:"本地访问" /c:"http://127.0.0.1:" /c:"http://localhost:"`) do (
    for /f "tokens=2 delims=：" %%b in ("%%a") do (
        for /f "tokens=*" %%c in ("%%b") do set "FINAL_URL=%%c"
    )
)
REM 兜底：如果没匹配到中文标签里的 URL，直接找 http 开头的独立行
if "%FINAL_URL%"=="" (
    for /f "usebackq tokens=*" %%a in (`type "%TMP_LOG%" 2^>nul ^| findstr /r /c:"http://127\.0\.0\.1:[0-9][0-9]*/" /c:"http://localhost:[0-9][0-9]*/"`) do (
        set "FINAL_URL=%%a"
    )
)

REM ---- 6. 状态提示：成功 or 失败 ----
echo.
if "%START_RC%"=="0" (
    echo [阶段 2/3] ✅ [启动成功] 服务已就绪
    if not "%FINAL_URL%"=="" (
        echo            访问地址：%FINAL_URL%
        echo %FINAL_URL% > "%URL_FILE%"
        echo.
        echo [阶段 3/3] 🌐 正在为您自动跳转到预览页面...
        REM 延迟 500ms，等服务 settle，然后 start 打开默认浏览器
        timeout /t 1 /nobreak >nul
        start "" "%FINAL_URL%"
    ) else (
        echo [阶段 3/3] ⚠️ 已就绪但未能自动解析 URL，请手动打开上面的地址
        echo            或在 TRAE 内置预览里粘贴： http://127.0.0.1:5173/
    )
    echo.
    echo 💡 提示：本窗口已可关闭，后台 Vite 子进程会继续运行不中断
    echo    停止服务：双击【一键停止服务器.cmd】
) else (
    echo [阶段 2/3] ❌ [启动失败] 退出码=%START_RC%
    echo.
    echo 👉 常见原因与排查：
    echo    1. 端口被占用且连续10个都不可用：先双击【一键停止服务器.cmd】清理后重试
    echo    2. 依赖丢失：在本目录运行 node "%%ProgramFiles%%\nodejs\node_modules\npm\bin\npm-cli.js" install
    echo    3. 更详细错误日志：%TMP_LOG%
    echo.
    echo ---------- 启动日志摘录 ----------
    if exist "%TMP_LOG%" (
        REM 截取最后 20 行给用户看
        for /f "usebackq delims=" %%L in (`powershell -NoProfile -Command "Get-Content '%TMP_LOG%' -Tail 20" 2^>nul`) do echo %%L
    ) else ( echo （无日志） )
    echo ---------------------------------
    echo.
)

REM 给用户留 5 秒看结果，然后自动关窗口（成功/失败都自动关，符合"一键完成"预期）
timeout /t 5 /nobreak >nul
endlocal
exit /b %START_RC%
