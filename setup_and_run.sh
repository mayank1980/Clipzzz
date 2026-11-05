#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=============================================================================="
echo "       CLIPZZZ - 1-Click Setup & Auto-Launch Studio (Linux/macOS)"
echo "=============================================================================="
echo ""

# Step 1: Run setup
bash ./setup.sh

# Step 2: Run clipzzz
bash ./run_clipzzz.sh

