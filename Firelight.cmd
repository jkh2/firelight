@echo off
title Firelight
cd /d "%~dp0server"
where node >nul 2>nul || (echo Node.js is not installed yet. See server\README.md. & pause & exit /b 1)
echo Getting Firelight ready...
call npm.cmd install --omit=dev --no-fund --no-audit --loglevel=error >nul 2>nul
pushd ..\mcp && call npm.cmd install --omit=dev --no-fund --no-audit --loglevel=error >nul 2>nul & popd
node control.js
if errorlevel 1 pause
