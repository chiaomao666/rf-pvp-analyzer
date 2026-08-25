@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title RF PVP Analyzer - Local Preview

echo.
echo ==========================================
echo   RF PVP Analyzer - Local Preview
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 22 or newer is not installed.
  echo Install it from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm is not available.
  echo Run these commands once in PowerShell, then run this file again:
  echo   corepack enable
  echo   corepack prepare pnpm@10.4.1 --activate
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] Installing project packages. This only happens on the first run.
  call pnpm install --frozen-lockfile
  if errorlevel 1 goto :failed
)

echo [2/2] Starting the local static preview.
echo Open the Local URL displayed below, usually http://localhost:5173
echo Data is saved only in this browser. Press Ctrl+C here to stop the preview.
call pnpm dev
goto :end

:failed
echo.
echo [ERROR] The local preview could not start. Read the error above and try again.
pause
exit /b 1

:end
endlocal
