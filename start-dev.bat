@echo off
title ERP Playground Dev Server
cd /d C:\Users\Gogo\erp-playground

echo.
echo ========================================
echo   ERP Playground Dev Server
echo ========================================
echo.
echo Project: C:\Users\Gogo\erp-playground
echo URL:     http://localhost:3001/apps
echo.
echo Keep this window open while using the app.
echo To stop the server, press Ctrl+C in this window.
echo.

start "" cmd /c "timeout /t 5 >nul && start http://localhost:3001/apps"
npm run dev

echo.
echo Server stopped.
pause
