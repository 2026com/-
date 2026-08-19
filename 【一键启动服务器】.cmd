@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
set "PD=%~dp0"
cd /d "%PD%"

echo ============================================================
echo   Growth App - Start Dev Server
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] node.exe not found. Install Node.js 18+ first.
    pause
    exit /b 1
)

if not exist "%PD%node_modules\vite\package.json" (
    echo [PREP] Installing dependencies...
    node "%ProgramFiles%\nodejs\node_modules\npm\bin\npm-cli.js" install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 2
    )
)

echo.
echo Starting Vite server, please wait...
echo.

del /q "%PD%.startup-url.txt" 2>nul
node "%PD%start-vite.mjs"
set "RC=!ERRORLEVEL!"

if "!RC!"=="0" (
    echo.
    echo OK - server started.
    if exist "%PD%.startup-url.txt" (
        set /p MYURL=<"%PD%.startup-url.txt"
        echo URL: !MYURL!
        timeout /t 1 /nobreak >nul
        start "" "!MYURL!"
    )
    echo.
    echo You can close this window. Vite runs in background.
    echo To stop: double-click the stop script.
) else (
    echo.
    echo FAILED to start. Check vite-startup.log for details.
)

timeout /t 4 /nobreak >nul
endlocal
