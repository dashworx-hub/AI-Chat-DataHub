# Running the app – same behavior, no errors

After the file rearrangement (`backend/`, `frontend/`), the app behaves the same. Use the scripts below so everything works without errors.

---

## Recommended way (canonical layout)

**1. Backend**

```bash
# One-time: install Python deps
pip install -r backend/requirements.txt

# Ensure .env exists (repo root or backend/) with CA_BILLING_PROJECT, GOOGLE_APPLICATION_CREDENTIALS, etc.

./start-backend.sh
```

- Runs from `backend/`, uses `backend/ca_profiles.json` and `backend/agent_labels.json`.
- Loads `.env` from repo root or `backend/`.
- Listens on port 8080.

**2. Frontend**

```bash
./start-frontend.sh
```

- Runs from `frontend/`. If `frontend/node_modules` is missing, it runs `npm install` once.
- Proxies `/api` to `http://localhost:8080`.
- App at `http://localhost:3000`.

Result: same chat, agent management, create agent, settings, and API behavior as before.

---

## Alternative: run from root (legacy)

- **Backend**: `uvicorn main:app --reload --port 8080` from repo root (uses root `main.py`, root `ca_profiles.json` / `agent_labels.json`).
- **Frontend**: `npm install` then `npm run dev` from repo root (uses root `src/`, root `package.json`).

Same app; only the file locations differ. No need to change code.

---

## What stays the same

- All API endpoints and request/response shapes.
- Chat, agent list, create/delete agent, instruction/label updates, BigQuery project/dataset/table, sources, settings.
- Guard rails, generation time, “How we got this,” artifacts (SQL, tables, charts).
- Frontend routes, pages, and UI behavior.
- Config: API base URL, `.env` (root or backend), and optional query limits.

---

## If something fails

| Symptom | Fix |
|--------|-----|
| `Module not found` in frontend | Run `cd frontend && npm install`, then `./start-frontend.sh` again. |
| Backend: “Profiles file not found” | Ensure `backend/ca_profiles.json` exists (copy from root if needed). |
| Backend: “CA_BILLING_PROJECT is not set” | Add `.env` in repo root or `backend/` with required vars (see README). |
| Backend: “GOOGLE_APPLICATION_CREDENTIALS is not set or file not found” | Set `GOOGLE_APPLICATION_CREDENTIALS` in `.env` to your GCP service account JSON path. Use an **absolute path**, or put the key in repo root / `backend/` and use e.g. `service-account.json` or `./service-account.json`. See `backend/README.md`. |
| Frontend: “Failed to load” / API errors | Start the backend first (`./start-backend.sh`) on port 8080. |
| Port 8080 already in use | Stop the other process or change the backend port (and frontend proxy in `frontend/vite.config.js` if needed). |

Using `./start-backend.sh` and `./start-frontend.sh` with the one-time setup above keeps the app working the same way with no extra steps.
