#!/usr/bin/env bash
# Run backend + frontend tests with live, verbose output.
# Saves readable logs under test-results/<timestamp>/ (optional: use --no-logs to skip).
# Run from project root:  ./"pytest + Vitest/run-tests.sh"
# Or from this folder:   ./run-tests.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Optional: pass --no-logs to skip writing log files
SAVE_LOGS=true
for arg in "$@"; do
  if [[ "$arg" == "--no-logs" ]]; then
    SAVE_LOGS=false
    break
  fi
done

if [[ "$SAVE_LOGS" == "true" ]]; then
  TS="$(date +%Y-%m-%d_%H-%M-%S)"
  LOG_DIR="$SCRIPT_DIR/test-results/$TS"
  mkdir -p "$LOG_DIR"
  cat > "$LOG_DIR/README.txt" << 'LOGREADME'
Log files from pytest + Vitest run:

  REPORT.md    - Human-readable report: what each test does + Pass/Fail (open this first)
  pytest.log   - Raw backend test output
  pytest.xml   - Backend results in JUnit XML (CI/tools)
  vitest.log   - Raw frontend test output
  vitest.json  - Frontend results in JSON (machine-readable)
LOGREADME
  echo "Logs will be saved to: $LOG_DIR"
  echo ""
fi

echo "=============================================="
echo " Backend (pytest) — verbose, live output"
echo "=============================================="
if [[ "$SAVE_LOGS" == "true" ]]; then
  "$PROJECT_ROOT/.venv/bin/python" -m pytest \
    "pytest + Vitest/test_api_endpoints.py" \
    "pytest + Vitest/test_unit_logic.py" \
    -v \
    --tb=short \
    -s \
    --junitxml="$LOG_DIR/pytest.xml" \
    2>&1 | tee "$LOG_DIR/pytest.log"
  PYTEST_EXIT=${PIPESTATUS[0]}
else
  "$PROJECT_ROOT/.venv/bin/python" -m pytest \
    "pytest + Vitest/test_api_endpoints.py" \
    "pytest + Vitest/test_unit_logic.py" \
    -v \
    --tb=short \
    -s
  PYTEST_EXIT=$?
fi

echo ""
echo "=============================================="
echo " Frontend (Vitest) — verbose, live output"
echo "=============================================="
cd "$SCRIPT_DIR"
if [[ "$SAVE_LOGS" == "true" ]]; then
  npx vitest run --config vitest.config.js --reporter=verbose --reporter=json --outputFile="$LOG_DIR/vitest.json" 2>&1 | tee "$LOG_DIR/vitest.log"
  VITEST_EXIT=${PIPESTATUS[0]}
else
  npx vitest run --config vitest.config.js --reporter=verbose
  VITEST_EXIT=$?
fi

echo ""
echo "=============================================="
echo " Done"
echo "=============================================="

if [[ "$SAVE_LOGS" == "true" ]]; then
  # Generate human-readable report: what each test was about + Pass/Fail
  if [[ -f "$LOG_DIR/pytest.xml" ]] && [[ -f "$LOG_DIR/vitest.json" ]]; then
    PY="$PROJECT_ROOT/.venv/bin/python"
    [[ -x "$PY" ]] || PY="python3"
    "$PY" "$SCRIPT_DIR/write-report.py" "$LOG_DIR" 2>/dev/null || true
  fi
  echo ""
  echo "Logs saved to: $LOG_DIR"
  echo "  - REPORT.md    (human-readable: what each test does + Pass/Fail)"
  echo "  - pytest.log   (raw backend log)"
  echo "  - pytest.xml   (JUnit XML)"
  echo "  - vitest.log   (raw frontend log)"
  echo "  - vitest.json (machine-readable frontend results)"
fi

# Exit with failure if either suite failed
if [[ $PYTEST_EXIT -ne 0 ]] || [[ $VITEST_EXIT -ne 0 ]]; then
  exit 1
fi
exit 0
