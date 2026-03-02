#!/usr/bin/env bash
# Run live API tests against the backend (must be running on port 8080).
# Run from project root:  ./test_cases/run-tests.sh
# Or from test_cases:     ./run-tests.sh
# Logs: each test name, PASS/FAIL, and optional request/response with --verbose.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Prefer project venv if present
PYTHON="${PROJECT_ROOT}/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="python3"
fi

echo "=============================================="
echo " Live API tests (test_cases) — backend must be running"
echo " Default: http://localhost:8080"
echo "=============================================="
echo ""

"$PYTHON" "$SCRIPT_DIR/run_api_tests.py" --verbose

echo ""
echo "=============================================="
echo " Done"
echo "=============================================="
