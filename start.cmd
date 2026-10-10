@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22.13+ from https://nodejs.org/
  pause
  exit /b 1
)
node scripts/launch.mjs
if errorlevel 1 pause
