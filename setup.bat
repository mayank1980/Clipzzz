@echo off
setlocal enabledelayedexpansion
title CLIPZZZ - Initial Setup & Dependencies Installer

echo ==============================================================================
echo        CLIPZZZ - AI YouTube Shorts Clipper Studio (Setup)
echo ==============================================================================
echo.

:: 1. Check Python installation
echo [1/5] Checking Python installation...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10, 3.11, or 3.12 from https://www.python.org/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set PYTHON_VER=%%i
echo   [OK] Found %PYTHON_VER%

:: 2. Check Node.js and NPM installation
echo.
echo [2/5] Checking Node.js and NPM...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js (LTS version) from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo   [OK] Found Node.js %NODE_VER%

:: 3. Check FFmpeg installation
echo.
echo [3/5] Checking FFmpeg (Required for video slicing and subtitles)...
ffmpeg -version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [WARNING] FFmpeg is not found in PATH!
    echo   You can install it automatically in Windows Terminal by running:
    echo     winget install Gyan.FFmpeg
    echo   Or download from: https://www.gyan.dev/ffmpeg/builds/
    echo.
) else (
    echo   [OK] FFmpeg is installed and ready.
)

:: 4. Setup Backend (Virtualenv, dependencies, .env, migrations)
echo.
echo [4/5] Setting up Python Backend...
cd /d "%~dp0backend"

if not exist ".env" (
    echo   [+] Creating backend\.env from template...
    copy ".env.example" ".env" >nul
)

if not exist "venv\Scripts\python.exe" (
    echo   [+] Creating Python virtual environment (backend\venv)...
    python -m venv venv
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
)

echo   [+] Installing/Updating Python dependencies...
venv\Scripts\python.exe -m pip install --upgrade pip --quiet
venv\Scripts\pip.exe install -r requirements.txt --quiet
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install Python dependencies from requirements.txt!
    pause
    exit /b 1
)

:: Ensure media directories exist
if not exist "media\videos" mkdir "media\videos"
if not exist "media\audio" mkdir "media\audio"
if not exist "media\rendered_clips\clean" mkdir "media\rendered_clips\clean"

echo   [+] Running database migrations...
venv\Scripts\python.exe manage.py migrate --noinput
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Django migrations failed!
    pause
    exit /b 1
)
echo   [OK] Backend setup complete.

:: 5. Setup Frontend (npm install)
echo.
echo [5/5] Setting up React + Vite Frontend...
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo   [+] Installing Node.js packages (this may take a minute)...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install frontend npm packages!
        pause
        exit /b 1
    )
) else (
    echo   [OK] Frontend node_modules already installed.
)
echo   [OK] Frontend setup complete.

cd /d "%~dp0"
echo.
echo ==============================================================================
echo   SETUP COMPLETED SUCCESSFULLY!
echo ==============================================================================
echo.
echo   All dependencies, virtual environment, and databases are configured.
echo   You only need to run setup once.
echo.
echo   To launch CLIPZZZ now or anytime in the future, double-click:
echo     run_clipzzz.bat
echo.
echo ==============================================================================
echo.
pause
