@echo off
setlocal enabledelayedexpansion
title CLIPIT - 1-Click Setup & Unified Suite Launcher

echo ==============================================================================
echo        CLIPIT + Orbit Pro - 1-Click Setup & Auto-Launch Studio
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

:: Step 2: Launch CLIPIT + Connected Orbit Pro and open browser
echo.
echo [2/2] Launching CLIPIT & Orbit Pro services and opening web studio...
call run_clipit.bat

