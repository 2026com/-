@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
set "PD=%~dp0"

echo ============================================================
echo   Growth App - Stop Dev Server
echo ============================================================
echo.

set KILLED=0

if exist "%PD%vite.pid" (
    set /p RPID=<"%PD%vite.pid"
    if defined RPID (
        taskkill /F /PID !RPID! >nul 2>&1
        if not errorlevel 1 ( set KILLED=1 )
    )
    del /q "%PD%vite.pid" >nul 2>&1
)

for %%P in (5173 5174 5175 5176 5177 5178 5179 5180 5181 5182) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        if not "%%a"=="0" (
            taskkill /F /PID %%a >nul 2>&1
            if not errorlevel 1 ( set KILLED=1 )
        )
    )
)

if "!KILLED!"=="1" (
    echo Server stopped.
) else (
    echo No running server found.
)

echo.
pause
endlocal
