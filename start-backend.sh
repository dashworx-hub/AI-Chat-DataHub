#!/bin/bash
# Start the FastAPI backend server (runs from Backend/ directory)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/Backend" || { echo "Error: Backend/ directory not found."; exit 1; }

echo "Starting CA API Backend Server (from Backend/)..."
echo "Make sure you have:"
echo "  1. Python dependencies installed: pip install -r Backend/requirements.txt"
echo "  2. .env file configured (in repo root or in Backend/)"
echo "  3. Backend/ca_profiles.json present"
echo ""

# Use python3 -m uvicorn instead of uvicorn directly (more reliable)
# This works even if uvicorn isn't in PATH
python3 -m uvicorn main:app --reload --port 8080
