@echo off
rem Double-click launcher for the ChazzasBlog local authoring tool.
rem Starts the server in its own window, then opens the tool in the
rem default browser. Safe to close the server window when you're done -
rem this never touches git by itself.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo Node.js not found on PATH - install Node.js first: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

start "Author Tool Server" cmd /k "node server.js"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:3001
