# Frontend structure (scalable)

This document describes how the frontend is organized so new features can be added with minimal changes. **The canonical frontend lives in the `frontend/` directory** (see `frontend/README.md`).

## Route configuration

All routes are defined in **`frontend/src/routes.jsx`**. To add a new page:

1. Create the page component (e.g. under `frontend/src/pages/` or a new `frontend/src/features/<name>/` folder).
2. Add one entry to the `routes` array in `frontend/src/routes.jsx`:
   ```js
   { path: '/your-path', element: <YourPage /> }
   ```
3. If the new page should appear in the top bar, add a link in `frontend/src/components/Header.jsx`.

No other files need to be changed. The app will pick up the new route automatically.

## Directory layout (under `frontend/`)

- **`src/pages/`** – Page-level components (ChatIndex, AgentManager, CreateAgent, Settings).
- **`src/components/`** – Shared UI (Header, Footer, Toast, Spinner, etc.).
- **`src/utils/`** – Shared utilities (api, currency).
- **`src/constants/`** – Shared constants (e.g. guardRails).
- **`src/routes.jsx`** – Single source of truth for routes.
- **`public/`** – Static assets (Logo.svg, icons, images).

Future features can optionally live under `src/features/<feature-name>/` (e.g. a new "Billing" feature) with their own components and a single export; the route still points to that export.
