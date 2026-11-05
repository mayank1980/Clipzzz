@echo off
setlocal enabledelayedexpansion
title CLIPZZZ - 1-Click Setup & Launch Studio

echo ==============================================================================
echo        CLIPZZZ - 1-Click Setup & Auto-Launch Studio
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

:: Step 2: Launch the backend, frontend, and open browser
echo.
echo [2/2] Launching CLIPZZZ services and opening web studio...
call run_clipzzz.bat
