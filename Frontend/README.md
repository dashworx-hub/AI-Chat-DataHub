# Frontend – Dashworx AI Chat

React + Vite frontend for the CA API application. This directory is the **canonical frontend**; run all frontend commands from here (or use the root `start-frontend.sh` script).

## Structure

```
frontend/
├── public/           # Static assets (Logo.svg, icons, images)
├── src/
│   ├── components/   # Shared UI (Header, Footer, Toast, Spinner, etc.)
│   ├── pages/        # Page components (ChatIndex, AgentManager, CreateAgent, Settings)
│   ├── utils/        # API helpers, currency formatting
│   ├── constants/    # Shared constants (e.g. guardRails)
│   ├── routes.jsx    # Central route config – add new features here
│   ├── App.jsx       # App shell and routing
│   ├── main.jsx      # Entry point
│   └── index.css     # Global styles
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── README.md         # This file
```

For how to add new features with minimal changes, see **`docs/STRUCTURE.md`** in the repo root.

## Setup

1. **Install dependencies** (from this directory or repo root):

   ```bash
   cd frontend && npm install
   ```

2. **Backend**: Ensure the backend is running on port 8080 (e.g. `./start-backend.sh` from repo root). The Vite dev server proxies `/api` to `http://localhost:8080`.

## Run

From repo root:

```bash
./start-frontend.sh
```

Or from this directory:

```bash
cd frontend
npm run dev
```

The app will be at `http://localhost:3000`.

## Build

From this directory:

```bash
npm run build
```

Output goes to `frontend/dist/`. For production, serve this folder or point the backend’s static serving at `frontend/dist/`.
