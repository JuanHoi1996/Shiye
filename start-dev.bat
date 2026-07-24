@echo off
setlocal
chcp 65001 >nul
title Shiye
cd /d "%~dp0"

echo.
echo  Shiye — starting SearXNG + API + UI...
echo  Open http://localhost:5174 when ready.
echo  Close this window (or Ctrl+C) to stop.
echo.

where powershell >nul 2>&1
if errorlevel 1 (
  echo [ERROR] PowerShell not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo start-dev exited with code %EXITCODE%.
  pause
)
exit /b %EXITCODE%
