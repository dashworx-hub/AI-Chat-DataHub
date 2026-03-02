#!/bin/bash
# Start the frontend dev server (runs from Frontend/ directory)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/Frontend" || { echo "Error: Frontend/ directory not found."; exit 1; }

# Install dependencies if node_modules is missing (first run or after clone)
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies (first run)..."
  npm install
fi

echo "Starting Frontend Dev Server (from Frontend/)..."
echo "Ensure backend is running on port 8080 (./start-backend.sh)"
echo ""

npm run dev
