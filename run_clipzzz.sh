#!/usr/bin/env bash
# ==============================================================================
# CLIPZZZ - Studio Runner (Linux / macOS)
# ==============================================================================
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Check if setup was run
if [ ! -d "backend/venv" ] || [ ! -d "frontend/node_modules" ]; then
    echo "First-time setup detected. Running setup.sh..."
    bash "$DIR/setup.sh"
fi

mkdir -p backend/media/videos backend/media/audio backend/media/rendered_clips/clean

echo -e "\n=============================================================================="
echo "  LAUNCHING CLIPZZZ SERVICES..."
echo "=============================================================================="
cd "$DIR/backend"
venv/bin/python manage.py runserver 0.0.0.0:8000 &
BACKEND_PID=$!

cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!

cleanup() {
    echo -e "\nStopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

echo -e "\n=============================================================================="
echo "  CLIPZZZ IS LIVE AND READY!"
echo "=============================================================================="
echo "  Frontend UI : http://localhost:5173/"
echo "  Backend API : http://localhost:8000/api/"
echo "=============================================================================="
echo "Press Ctrl+C to stop both servers."

wait
