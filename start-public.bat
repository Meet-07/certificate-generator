@echo off
title CertGen Public HTTPS Server
cd /d "%~dp0"
echo ========================================================
echo   CertGen Server + Cloudflare Free HTTPS
echo ========================================================
echo.
echo [1/2] Starting Node.js server...
start /b node server.js
timeout /t 2 /nobreak >nul
echo.
echo [2/2] Starting Cloudflare HTTPS tunnel...
echo (Your public https:// link will appear in the lines below)
echo ========================================================
.\cloudflared.exe tunnel --url http://127.0.0.1:8080
pause
