#!/usr/bin/env bash
# ==============================================================================
# CLIPZZZ - Initial Setup & Dependencies Installer (Linux / macOS)
# ==============================================================================
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=============================================================================="
echo "       CLIPZZZ - AI YouTube Shorts Clipper Studio (Setup)"
echo "=============================================================================="

# 1. Check Python
echo -e "\n[1/5] Checking Python..."
if command -v python3 &>/dev/null; then
    PYTHON_CMD=python3
elif command -v python &>/dev/null; then
    PYTHON_CMD=python
else
    echo "[ERROR] Python is not installed. Please install Python 3.10+."
    exit 1
fi
echo "  [OK] Using $($PYTHON_CMD --version)"

# 2. Check Node & npm
echo -e "\n[2/5] Checking Node.js & npm..."
if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
    echo "[ERROR] Node.js and npm are required. Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo "  [OK] Using Node $(node --version) and npm $(npm --version)"

# 3. Check FFmpeg
echo -e "\n[3/5] Checking FFmpeg..."
if ! command -v ffmpeg &>/dev/null; then
    echo "  [WARNING] FFmpeg is not installed in PATH. Install via 'brew install ffmpeg' or 'sudo apt install ffmpeg'."
else
    echo "  [OK] FFmpeg is ready."
fi

# 4. Setup Backend
echo -e "\n[4/5] Setting up Backend..."
cd "$DIR/backend"
if [ ! -f ".env" ]; then
    echo "  [+] Creating backend/.env from .env.example..."
    cp .env.example .env
fi

if [ ! -d "venv" ]; then
    echo "  [+] Creating Python virtual environment (backend/venv)..."
    $PYTHON_CMD -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

mkdir -p media/videos media/audio media/rendered_clips/clean
python manage.py migrate --noinput
echo "  [OK] Backend setup complete."

# 5. Setup Frontend
echo -e "\n[5/5] Setting up Frontend..."
cd "$DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "  [+] Installing Node packages..."
    npm install
fi
echo "  [OK] Frontend setup complete."

echo -e "\n=============================================================================="
echo "  SETUP COMPLETED SUCCESSFULLY!"
echo "=============================================================================="
echo "  All dependencies and databases are configured."
echo "  To launch CLIPZZZ, run: ./run_clipzzz.sh"
echo "=============================================================================="
