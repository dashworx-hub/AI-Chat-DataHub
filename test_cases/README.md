# Test Cases – Dashworx AI Chat

This folder contains test case **specifications** (Markdown) and a **runnable API script** that hits the live backend over HTTP.

---

## Automated: Live backend API tests

**Prerequisite:** Backend running on port 8080 (e.g. `cd backend && uvicorn main:app --reload --port 8080`).

**Run from terminal (see logs live):**

```bash
# From repo root (recommended)
./test_cases/run-tests.sh

# Or run the Python script directly (with verbose logs)
.venv/bin/python test_cases/run_api_tests.py --verbose
.venv/bin/python test_cases/run_api_tests.py --base-url http://localhost:8080 --verbose
```

**Tests run (in order):**

1. **TC-API-003** – GET /api/agents (list agents)
2. **TC-API-001** – POST /api/chat (successful query)
3. **TC-API-002** – POST /api/chat with conversation history
4. **TC-API-010** – Input validation: empty message (expect 400)
5. **TC-API-011** – Input validation: missing agent/profile (expect 400)
6. **TC-API-007 style** – GET /api/sources (list data sources)
7. **TC-API-008** – Security headers present
8. **Health** – GET /healthz

Exit code: 0 if all pass, 1 if any fail. Use `--verbose` to see request/response summaries per test.

---

## Manual / E2E test specs

The following are **specifications** to be run manually (or with a browser/E2E tool):

| File | Description |
|------|-------------|
| `00-test-index.md` | Index and recommended order |
| `01-chat-tests.md` | Chat E2E (10 cases) |
| `02-agent-management-tests.md` | Agent Management E2E (6) |
| `03-create-agent-tests.md` | Create Agent E2E (5) |
| `04-settings-data-sources-tests.md` | Settings & Data Sources E2E (5) |
| `05-backend-api-integration-tests.md` | Backend API (13; partially covered by `run_api_tests.py`) |
| `06-frontend-unit-tests.md` | Frontend unit (7; require Jest/React Testing Library) |
| `07-backend-unit-tests.md` | Backend unit (8; require pytest + mocks) |
| `08-edge-cases-negative-tests.md` | Edge & negative (16) |

See **Recommended Testing Order** in `00-test-index.md`.

---

## Relevance to current application

- **`run_api_tests.py`** – Aligned with the current backend: uses `GET /api/agents`, `POST /api/chat` (body: `agent` or `profile`, `message`, `history`), `GET /api/sources`, `GET /healthz`, and checks response shape (`agents`/`meta`, `answer`/`text`/`message`, `sources`/`meta`, `ok`). Safe to run against the canonical backend (e.g. `backend/main.py` on 8080).
- **Markdown specs (01–08)** – Describe E2E and integration scenarios; useful as documentation. Some specs use older field names (e.g. `agent_id`); the actual API uses `agent` or `profile`. The runnable script uses the current API.
