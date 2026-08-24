@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title RF PVP Analyzer - Local Server

echo.
echo ==========================================
echo   RF PVP Analyzer - Windows Local Server
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
  echo Run this command once in PowerShell, then run this file again:
  echo   corepack enable
  pause
  exit /b 1
)

if not exist ".env" (
  copy /Y "env.template" ".env" >nul
  echo [SETUP REQUIRED] A new .env file has been created and opened in Notepad.
  echo Set DATABASE_URL and JWT_SECRET, save the file, then run START_WINDOWS.bat again.
  start "" notepad ".env"
  pause
  exit /b 1
)

findstr /C:"USERNAME:PASSWORD@HOST" ".env" >nul 2>&1
if not errorlevel 1 (
  echo [SETUP REQUIRED] DATABASE_URL is still the example value in .env.
  echo Replace it with your MySQL-compatible database connection string, save, and run again.
  start "" notepad ".env"
  pause
  exit /b 1
)

findstr /C:"replace-with-a-long-random-secret" ".env" >nul 2>&1
if not errorlevel 1 (
  echo [SETUP REQUIRED] JWT_SECRET is still the example value in .env.
  echo Replace it with a long random value, save, and run again.
  start "" notepad ".env"
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing project packages. This only happens on the first run.
  call pnpm install --frozen-lockfile
  if errorlevel 1 goto :failed
)

echo [2/3] Applying the current database schema.
call pnpm db:push
if errorlevel 1 goto :failed

echo [3/3] Starting the local server.
echo Open http://localhost:3000 in your browser.
echo Keep this window open while using the website. Press Ctrl+C here to stop it.
call pnpm dev
goto :end

:failed
echo.
echo [ERROR] The local server could not start. Read the error above, verify .env and MySQL, then try again.
pause
exit /b 1

:end
endlocal
