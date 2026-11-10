@echo off
setlocal enabledelayedexpansion
title CLIPIT - 1-Click Setup & Launcher

echo ==============================================================================
echo        CLIPIT - Find the moment. Clip it.
echo        Long videos in. Perfect clips out.
echo ==============================================================================
echo.

cd /d "%~dp0"

:: Step 1: Run the full setup check and installer
echo [1/2] Verifying and configuring dependencies...
call setup.bat
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Setup encountered an issue. Please review the errors above.
    pause
    exit /b %ERRORLEVEL%
)

:: Step 2: Launch CLIPIT and open browser
echo.
echo [2/2] Launching CLIPIT services and opening studio...
call run_clipit.bat

