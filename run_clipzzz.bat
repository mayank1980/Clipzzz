@echo off
setlocal enabledelayedexpansion
title CLIPIT - Find the moment. Clip it.

echo ==============================================================================
echo        CLIPIT - Find the moment. Clip it.
echo        Long videos in. Perfect clips out.
echo ==============================================================================
echo.

cd /d "%~dp0"

:: Check if setup was already completed
if not exist "backend\venv\Scripts\python.exe" (
    echo [NOTICE] First-time run detected. Backend environment not found.
    echo Running setup first...
    echo.
    call setup.bat
    if not exist "backend\venv\Scripts\python.exe" (
        echo [ERROR] Setup did not complete successfully. Exiting.
        pause
        exit /b 1
    )
)

if not exist "frontend\node_modules" (
    echo [NOTICE] Frontend packages not found. Running setup...
    echo.
    call setup.bat
    if not exist "frontend\node_modules" (
        echo [ERROR] Setup did not complete successfully. Exiting.
        pause
        exit /b 1
    )
)

:: Ensure media directories exist
if not exist "backend\media\videos" mkdir "backend\media\videos"
if not exist "backend\media\audio" mkdir "backend\media\audio"
if not exist "backend\media\rendered_clips\clean" mkdir "backend\media\rendered_clips\clean"

echo Starting Backend on http://localhost:8000/api ...
start "CLIPIT - Django Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"

if exist "D:\Downloader\backend\manage.py" (
    echo Starting Connected Orbit Pro Downloader Engine on http://127.0.0.1:8001/api ...
    start "Orbit Pro - Connected Downloader Backend" cmd /k "cd /d D:\Downloader\backend && ..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8001"
)

echo Starting Frontend on http://localhost:5173 ...
start "CLIPIT - React Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Wait 3 seconds for servers to initialize, then launch browser
timeout /t 3 /nobreak >nul
echo Opening studio in browser...
start http://localhost:5173/

echo.
echo ==============================================================================
echo   CLIPIT IS RUNNING! — Find the moment. Clip it.
echo ==============================================================================
echo   Frontend Studio   : http://localhost:5173/
echo   Backend API       : http://localhost:8000/api/
echo   Orbit Pro API     : http://127.0.0.1:8001/api/
echo   Admin Panel       : http://localhost:8000/admin/
echo ==============================================================================
echo.
echo Leave this window or close it. Servers are running in their own windows.
echo To stop CLIPIT, close the Django Backend and React Frontend terminal windows.
echo.
