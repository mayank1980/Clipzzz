@echo off
setlocal enabledelayedexpansion
title CLIPIT + Orbit Pro - Unified Suite Launcher

echo ==============================================================================
echo        CLIPIT — Find the moment. Clip it.
echo        Connected with Orbit Pro Downloader (D:\Downloader)
echo ==============================================================================
echo.

cd /d "%~dp0"

:: Locate sibling Orbit Pro folder cleanly
set "ORBIT_DIR="
for %%I in ("%~dp0..") do set "PARENT_DIR=%%~fI"
if exist "%PARENT_DIR%\Downloader\backend\manage.py" (
    set "ORBIT_DIR=%PARENT_DIR%\Downloader"
) else if exist "D:\Downloader\backend\manage.py" (
    set "ORBIT_DIR=D:\Downloader"
)

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

:: Detect npm/pnpm for frontend runners
set "ORBIT_PKG=npm"
where pnpm >nul 2>nul
if %ERRORLEVEL% EQU 0 set "ORBIT_PKG=pnpm"

:: 2. Launch CLIPIT Services (Ports 8000 & 5173)
echo [1/4] Starting CLIPIT Backend API on http://localhost:8000/api ...
start "CLIPIT - Django Backend (:8000)" /D "%~dp0backend" cmd /k "venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"

echo [2/4] Starting CLIPIT Unified Studio UI on http://localhost:5173 ...
start "CLIPIT - React Studio (:5173)" /D "%~dp0frontend" cmd /k "npm run dev"

:: 3. Launch Connected Orbit Pro Services (Ports 8001 & 3000)
if defined ORBIT_DIR (
    echo [3/4] Starting Orbit Pro Backend Engine on http://127.0.0.1:8001/api ...
    if exist "%ORBIT_DIR%\venv\Scripts\python.exe" (
        start "Orbit Pro - Django Backend (:8001)" /D "%ORBIT_DIR%\backend" cmd /k "..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8001"
    ) else (
        start "Orbit Pro - Django Backend (:8001)" /D "%ORBIT_DIR%\backend" cmd /k "python manage.py runserver 127.0.0.1:8001"
    )

    if exist "%ORBIT_DIR%\frontend\node_modules" (
        echo [4/4] Starting Orbit Pro Standalone UI on http://localhost:3000 ...
        start "Orbit Pro - React UI (:3000)" /D "%ORBIT_DIR%\frontend" cmd /k "%ORBIT_PKG% run dev"
    ) else (
        echo [4/4] Orbit Pro Frontend available directly inside CLIPIT at http://localhost:5173/
    )
) else (
    echo [NOTICE] Separate Orbit Pro folder (Downloader) not found. Running CLIPIT standalone.
)

:: 4. Wait briefly for servers to initialize, then open CLIPIT Studio
timeout /t 4 /nobreak >nul
echo Opening CLIPIT Unified Studio in browser...
start http://localhost:5173/

echo.
echo ==============================================================================
echo   BOTH PLATFORMS ARE RUNNING!
echo ==============================================================================
echo   CLIPIT Studio (Unified UI) : http://localhost:5173/
echo   CLIPIT Backend API         : http://localhost:8000/api/
if defined ORBIT_DIR (
echo   Orbit Pro Engine API       : http://127.0.0.1:8001/api/
if exist "%ORBIT_DIR%\frontend\node_modules" (
echo   Orbit Pro Standalone UI    : http://localhost:3000/
)
)
echo   Admin Panel                : http://localhost:8000/admin/
echo ==============================================================================
echo.
echo Switch between CLIPIT Shorts and Orbit Pro anytime from the top navbar pill!
echo To stop the apps, close the opened terminal windows.
echo.
