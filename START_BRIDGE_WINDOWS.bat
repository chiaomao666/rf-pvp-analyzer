@echo off
setlocal EnableExtensions

rem Always resolve paths relative to this .bat file, not the current PowerShell folder.
set "SCRIPT_DIR=%~dp0"
set "BRIDGE_SCRIPT="

if exist "%SCRIPT_DIR%bridge\rf-bridge.mjs" set "BRIDGE_SCRIPT=%SCRIPT_DIR%bridge\rf-bridge.mjs"
if not defined BRIDGE_SCRIPT if exist "%SCRIPT_DIR%rf-bridge.mjs" set "BRIDGE_SCRIPT=%SCRIPT_DIR%rf-bridge.mjs"
if not defined BRIDGE_SCRIPT if exist "%SCRIPT_DIR%..\bridge\rf-bridge.mjs" set "BRIDGE_SCRIPT=%SCRIPT_DIR%..\bridge\rf-bridge.mjs"

if not defined BRIDGE_SCRIPT (
  echo [ERROR] Cannot find rf-bridge.mjs.
  echo Put this file in the RF PVP Analyzer project root, next to the bridge folder,
  echo or put it in the same folder as rf-bridge.mjs.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not available. Install Node.js 22 or newer first.
  pause
  exit /b 1
)

echo [INFO] Starting RF PVP Analyzer Localhost Bridge on 127.0.0.1:8787...
node "%BRIDGE_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [ERROR] Bridge stopped with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%

