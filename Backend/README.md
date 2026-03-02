# CA API Backend

Backend API for the Dashworx AI Chat application. Run from this directory or use the root `start-backend.sh` script.

## Setup

1. **Python**: Use Python 3.10+.
2. **Dependencies**: From repo root:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. **Environment**: Create a `.env` file in the **repo root** (or in `backend/`) with at least:
   - `CA_BILLING_PROJECT` – Google Cloud billing project ID
   - `GOOGLE_APPLICATION_CREDENTIALS` – Path to your GCP service account JSON key. Can be:
     - **Absolute**: e.g. `/Users/you/keys/my-project.json`
     - **Relative to repo root**: e.g. `service-account.json` (put the key file in the repo root)
     - **Relative to backend/**: e.g. `./service-account.json` (put the key file in `backend/`)
4. **Config**: Ensure `backend/ca_profiles.json` exists (copy from root if needed).

## Run

From repo root:

```bash
./start-backend.sh
```

Or from this directory:

```bash
cd backend
uvicorn main:app --reload --port 8080
```

The API will be available at `http://localhost:8080`. The frontend (Vite dev server) proxies `/api` to this port.

## Files in this directory

- `main.py` – FastAPI application and all API routes
- `ca_profiles.json` – Agent profiles (synced/copied from root for convenience)
- `agent_labels.json` – Custom display labels for agents
- `requirements.txt` – Python dependencies
