# CA API Frontend

Enterprise-grade React frontend for the CA API application.

## Features

- **React 18** with modern hooks and patterns
- **Tailwind CSS** for enterprise-grade styling
- **React Router** for navigation
- **Vite** for fast development and building
- **Lucide React** for icons
- **Marked & DOMPurify** for safe markdown rendering
- **Vega/Vega-Lite** for chart rendering

## Setup

### Backend (FastAPI)

The backend API server must be running before starting the frontend. **The canonical backend lives in the `backend/` directory.**

1. Install Python dependencies (from repo root):
```bash
pip install -r backend/requirements.txt
```

2. Ensure you have a `.env` file in the **repo root** (or in `backend/`) with required configuration:
```
CA_BILLING_PROJECT=your-project-id
CA_LOCATION=global
CA_PROFILES_PATH=ca_profiles.json
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json

# Optional: GCP Sources Fetching Configuration
ENABLE_GCP_SOURCES_FETCH=true          # Enable/disable GCP fetching (default: true)
GCP_SOURCES_CACHE_TTL=300              # Cache TTL in seconds (default: 300 = 5 minutes)
GCP_SOURCES_FETCH_TIMEOUT=10            # Request timeout in seconds (default: 10)
```

3. Start the FastAPI backend server:
```bash
./start-backend.sh
```
(This runs `uvicorn main:app --reload --port 8080` from the `backend/` directory. See `backend/README.md` for more options.)

The backend will be available at `http://localhost:8080`

### Frontend (React)

**The canonical frontend lives in the `frontend/` directory.**

1. Install dependencies (from repo root or frontend):
```bash
cd frontend && npm install
```

2. Start development server:
```bash
./start-frontend.sh
```
(Or `cd frontend && npm run dev`.)

The application will be available at `http://localhost:3000`

**Important**: Make sure the backend is running on port 8080 before starting the frontend, otherwise you'll see "Failed to load" errors.

## Build

To build the frontend for production (from repo root or frontend):
```bash
cd frontend && npm run build
```

The built files will be in `frontend/dist/`.

## Project Structure

```
backend/          # FastAPI backend (canonical; run with ./start-backend.sh)
  main.py
  ca_profiles.json
  agent_labels.json
  requirements.txt
  README.md

frontend/         # React frontend (canonical; run with ./start-frontend.sh)
  public/         # Static assets (Logo, icons)
  src/
    components/   # Shared components (Header, Toast)
    pages/        # Page components
    utils/        # API helpers, currency
    constants/    # Shared constants (e.g. guardRails)
    routes.jsx    # Central route config (add new features here)
    App.jsx, main.jsx, index.css
  index.html
  package.json
  vite.config.js
  tailwind.config.js
  postcss.config.js
  README.md

docs/
  STRUCTURE.md    # How to add new features with minimal changes
```

Legacy copies of frontend files (e.g. root `src/`, `package.json`, `index.html`) remain at repo root; the active app is in `frontend/`.

## API Connections

All API connections are preserved exactly as in the original HTML files:

- `GET /api/agents` - Load agents list (now includes GCP agents)
- `GET /api/agents/:id` - Describe agent (works with both local and GCP agents)
- `PATCH /api/agents/:id/instruction` - Save instruction (works with both local and GCP agents)
- `GET /api/sources` - Load data sources (now fetches from GCP with fallback to local file)
- `POST /api/chat` - Send chat message
- `PATCH /api/profiles/:key` - Update profile label (local profiles only)
- `DELETE /api/profiles/:key` - Remove profile (local profiles only)
- `GET /api/bq/projects` - List BigQuery projects
- `GET /api/bq/datasets` - List BigQuery datasets
- `GET /api/bq/tables` - List BigQuery tables

The API base URL is stored in localStorage and can be changed in the header.

## GCP Sources Fetching

The application now supports fetching data sources directly from Google Cloud Platform with the following precautions:

### Features
- **Automatic Fetching**: Fetches agents from GCP Data Analytics Agent API
- **Caching**: Results are cached for 5 minutes (configurable) to reduce API calls
- **Fallback**: If GCP fetch fails, automatically falls back to local `ca_profiles.json`
- **Error Handling**: Graceful error handling with logging - never breaks the application
- **Timeout Protection**: Configurable timeout (default 10 seconds) prevents hanging requests
- **Deduplication**: Automatically deduplicates agents by agent path (prefers local if duplicate)

### Configuration
- `ENABLE_GCP_SOURCES_FETCH`: Set to `false` to disable GCP fetching entirely (default: `true`)
- `GCP_SOURCES_CACHE_TTL`: Cache duration in seconds (default: `300` = 5 minutes)
- `GCP_SOURCES_FETCH_TIMEOUT`: Request timeout in seconds (default: `10`)

### How It Works
1. When `/api/sources` is called, it first checks the cache
2. If cache is expired or empty, it attempts to fetch from GCP
3. On success, results are cached and returned
4. On failure (timeout, network error, API error), it silently falls back to local file
5. Both GCP and local sources are combined and deduplicated
6. All errors are logged but never exposed to the client

### Safety Precautions
- ✅ Timeout protection (prevents hanging)
- ✅ Error handling with fallback (never breaks the app)
- ✅ Response validation (ensures data integrity)
- ✅ Caching (reduces API load)
- ✅ Logging (for debugging without exposing errors)
- ✅ Configurable (can be disabled via environment variable)

## Design Principles

- **Enterprise-grade UI**: Clean, professional design without gradients or emojis
- **Solid colors**: Professional color palette (blues, grays)
- **Clear hierarchy**: Well-structured typography and spacing
- **Consistent patterns**: Reusable components and utilities
- **Accessibility**: Semantic HTML and proper ARIA attributes
