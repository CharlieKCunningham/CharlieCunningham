@echo off
rem Double-click launcher for the ChazzasBlog local authoring tool.
rem Starts the server in its own window, then opens the tool in a
rem chromeless "app" window (no tabs/address bar) so it feels like a
rem native app instead of a browser tab. Safe to close the server
rem console window when you're done - this never touches git by itself.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo Node.js not found on PATH - install Node.js first: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

start "Author Tool Server" /min cmd /k "node server.js"
timeout /t 2 /nobreak >nul

set "APP_URL=http://127.0.0.1:3001/index.html"
set "EDGE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "EDGE_PATH_X64=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_PATH_X86=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if exist "%EDGE_PATH%" (
    start "" "%EDGE_PATH%" --app=%APP_URL%
) else if exist "%EDGE_PATH_X64%" (
    start "" "%EDGE_PATH_X64%" --app=%APP_URL%
) else if exist "%CHROME_PATH%" (
    start "" "%CHROME_PATH%" --app=%APP_URL%
) else if exist "%CHROME_PATH_X86%" (
    start "" "%CHROME_PATH_X86%" --app=%APP_URL%
) else (
    rem No known Chromium browser found - fall back to a normal tab in
    rem whatever the default browser is. Still fully usable, just not
    rem a chromeless window.
    start "" %APP_URL%
)
