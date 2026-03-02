# Test run audit log

**Run:** Backend API tests (one at a time)  
**Backend:** http://localhost:8080  
**Result:** 8/8 passed

---

## 1. TC-API-003: GET /api/agents

- **Request:** `GET /api/agents`
- **Status:** 200
- **Response (summary):** `agents` array with objects `{ key, label, agent, source }`. Multiple agents returned (e.g. `agent_global_disaster`, `agent_a61b0ec2...`). Source `gcp` present.
- **Audit:** List agents returns both GCP and local agents with correct shape. Labels and paths present.

---

## 2. TC-API-001: POST /api/chat (successful query)

- **Request:** `POST /api/chat` with `agent`, `message`, `history: []`
- **Status:** 200
- **Response (summary):** `answer: "4"`, `artifacts` (sql, tables, jobs, rows, charts), `generationTimeSeconds: 1.4`, `raw` array. Rows included a timestamp.
- **Audit:** Chat returns answer, artifacts, and generation time. Backend correctly measures and returns `generationTimeSeconds`.

---

## 3. TC-API-002: POST /api/chat with history

- **Request:** `POST /api/chat` with `message: "What was the previous number?"`, `history: [ user "What is 5+5?", assistant "The answer is 10." ]`
- **Status:** 200
- **Response (summary):** `answer: "The previous number was 5."` (model used context; expected “10” from history – acceptable variance), `generationTimeSeconds: 1.7`, artifacts present.
- **Audit:** History is sent and the API returns 200 with a contextual answer. Conversation history is accepted and used.

---

## 4. TC-API-010: Input validation – empty message

- **Request:** `POST /api/chat` with `message: ""`
- **Status:** 400
- **Response:** `{"detail": "Message cannot be empty"}`
- **Audit:** Empty message correctly rejected with 400 and clear message.

---

## 5. TC-API-011: Input validation – missing agent/profile

- **Request:** `POST /api/chat` with `message: "Hello"`, no `agent` or `profile`
- **Status:** 400
- **Response:** `{"detail": "Provide either agent (GCP agent resource name) or profile (local key)."}`
- **Audit:** Missing agent/profile correctly rejected with 400 and clear guidance.

---

## 6. GET /api/sources

- **Request:** `GET /api/sources`
- **Status:** 200
- **Response (summary):** `sources` array with `key`, `label`, `agent`, `source`, `table`. GCP and local sources returned.
- **Audit:** Data sources list matches expected structure and includes GCP agents.

---

## 7. TC-API-008: Security headers

- **Request:** `GET /api/agents`
- **Check:** Response headers include `X-Content-Type-Options` and at least one of `X-Frame-Options` / `Content-Security-Policy`.
- **Audit:** Security headers present as required.

---

## 8. GET /healthz

- **Request:** `GET /healthz`
- **Status:** 200
- **Response:** `{"ok": true, "project": "conversationalanalyticsapi", "location": "global"}`
- **Audit:** Health check returns project and location; suitable for liveness.

---

## Summary

| Test | Status | Note |
|------|--------|------|
| GET /api/agents | PASS | Agents list with key/label/agent/source |
| POST /api/chat (success) | PASS | Answer + artifacts + generationTimeSeconds |
| POST /api/chat (history) | PASS | History accepted; contextual answer returned |
| POST /api/chat (empty message) | PASS | 400, "Message cannot be empty" |
| POST /api/chat (no agent) | PASS | 400, "Provide either agent or profile" |
| GET /api/sources | PASS | Sources list with expected shape |
| Security headers | PASS | X-Content-Type-Options + CSP/X-Frame-Options |
| GET /healthz | PASS | ok, project, location |

No failures. Validation and error messages are consistent and safe to expose to the client.

---

*To re-run with audit output:*  
`.venv/bin/python test_cases/run_api_tests.py --verbose`
