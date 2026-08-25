@echo off
setlocal
cd /d "%~dp0"

if not exist "package.json" (
  echo [ERROR] package.json not found. Run this file from the project root.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not available. Install Node.js 22 or newer first.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm is not available.
  echo Run these commands once in PowerShell, then run this file again:
  echo   corepack enable
  echo   corepack prepare pnpm@10.4.1 --activate
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Installing dependencies for the first run...
  call pnpm install --frozen-lockfile
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting RF PVP Analyzer Localhost Bridge on 127.0.0.1:8787...
call pnpm bridge
pause
