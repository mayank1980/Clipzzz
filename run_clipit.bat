@echo off
setlocal enabledelayedexpansion
title CLIPIT - Find the moment. Clip it.

echo ==============================================================================
echo        CLIPIT - Find the moment. Clip it.
echo        Long videos in. Perfect clips out.
echo ==============================================================================
echo.

cd /d "%~dp0"

:: 1. Verify CLIPIT setup
if not exist "backend\venv\Scripts\python.exe" (
    echo [NOTICE] First-time run detected for CLIPIT. Running setup.bat...
    call setup.bat
    if not exist "backend\venv\Scripts\python.exe" (
        echo [ERROR] CLIPIT setup failed. Exiting.
        pause
        exit /b 1
    )
)

if not exist "frontend\node_modules" (
    echo [NOTICE] Installing CLIPIT frontend packages...
    cd frontend
    call npm install
    cd /d "%~dp0"
)

:: Ensure CLIPIT media directories exist
if not exist "backend\media\videos" mkdir "backend\media\videos"
if not exist "backend\media\audio" mkdir "backend\media\audio"
if not exist "backend\media\rendered_clips\clean" mkdir "backend\media\rendered_clips\clean"

:: 2. Launch CLIPIT Services (Ports 8000 & 5173)
echo [1/2] Starting CLIPIT Backend API on http://localhost:8000/api ...
start "CLIPIT - Django Backend (:8000)" /D "%~dp0backend" cmd /k "venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"

echo [2/2] Starting CLIPIT Studio UI on http://localhost:5173 ...
start "CLIPIT - React Studio (:5173)" /D "%~dp0frontend" cmd /k "npm run dev"

:: 3. Wait briefly for servers to initialize, then open CLIPIT Studio
timeout /t 3 /nobreak >nul
echo Opening CLIPIT Studio in browser...
start http://localhost:5173/

echo.
echo ==============================================================================
echo   CLIPIT IS RUNNING! — Find the moment. Clip it.
echo ==============================================================================
echo   CLIPIT Studio      : http://localhost:5173/
echo   CLIPIT Backend API : http://localhost:8000/api/
echo   Admin Panel        : http://localhost:8000/admin/
echo ==============================================================================
echo.
echo To stop CLIPIT, close the Django Backend and React Studio terminal windows.
echo.
