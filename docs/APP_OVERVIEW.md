# Dashworx AI Chat – App Overview

This document describes what the application does, its main features, and the tools and libraries used to build it.

---

## What the app does

**Dashworx AI Chat** is a web application that lets users have natural-language conversations with **AI data agents** to analyze data. The agents are backed by **Google Cloud’s Data Analytics Agent (Conversational Analytics)** and can run queries (e.g. BigQuery), return tables and charts, and explain results in plain language.

- **Chat**: Users pick an agent (from a list that can include both GCP and local profiles), send messages, and get answers that can include text, tables, and Vega-Lite charts. The UI shows “Thought for N s” (backend generation time), optional “How we got this” reasoning, and artifacts (SQL, tables, charts).
- **Agent management**: Users can list agents (from GCP and/or local config), view and edit an agent’s system instruction and display label, create new Data Analytics Agents in GCP (with BigQuery data sources), and delete agents.
- **Create Agent**: Guided flow to create a new agent: label, instructions, currency, and BigQuery project/dataset/table. The backend creates the agent in GCP and applies guard rails to the system instruction.
- **Settings**: Configure API base URL (for the frontend), optional query limits, and data sources / agent profiles.
- **Data sources**: The app can list data sources from GCP and/or a local `ca_profiles.json` file, with caching and fallback so the UI keeps working if GCP is unavailable.

The backend enforces **guard rails** (scope, output format, data integrity, no fabrication, etc.) and can append a **reasoning block** (query intent and fields used) so the UI can show “How we got this” when the model supplies it.

---

## Features

### Chat

- Select an agent and send messages with optional conversation history.
- Receive answers as markdown (with safe rendering), plus optional tables and charts.
- View **artifacts**: SQL snippets, table references, jobs, and Vega-Lite charts in a side panel.
- See **generation time** (“Thought for N s” / “Thought for N min M s”) above each assistant reply.
- Optional **“How we got this”** accordion with 4–8 bullets (query intent and fields used) when the backend provides reasoning. - Not working right now
- Configurable **API base URL** in the header (e.g. for different environments).
- **Currency formatting**: Optional formatting of numbers in chat (e.g. JPY, USD) and per-agent currency in Create Agent.

### Agent management

- **List agents** from GCP and/or local `ca_profiles.json`, with custom labels stored in `agent_labels.json`.
- **View** agent details (path, instruction, label).
- **Edit** system instruction and display label for any agent.
- **Create** new Data Analytics Agents in GCP with BigQuery project/dataset/table and system instruction (plus guard rails).
- **Delete** agents (with retry for permission propagation and handling of soft-deleted state).
- **Profiles**: Update or remove local profile labels.

### Create Agent

- Form for display name, system instruction, currency, and BigQuery data source (project → dataset → table).
- **Guard rails** (read-only) shown in the UI; they are appended automatically on the backend.
- BigQuery project/dataset/table dropdowns and optional schema preview.
- Create button calls backend to create the agent in GCP and persist the label.

### Settings

- **API base** (where the frontend sends API requests).
- **Query limits** (optional feature flag).
- **Data sources**: Add/remove BigQuery sources and optional table config; GCP fetch status and caching behavior.

### Backend behavior

- **Guard rails**: Scope, output contracts (e.g. SQL format), data integrity, analytical discipline, visuals/evidence, response quality, mixed-request handling (and optional query explanation). Applied to every agent’s system instruction.
- **Security**: CORS, security headers (CSP, X-Frame-Options, etc.), and input validation on chat and other endpoints.
- **Caching**: In-memory cache for GCP sources/agents with configurable TTL and invalidation on create/delete.
- **Error handling**: Structured errors, SQL validation tips, and fallbacks so the UI stays usable when GCP or a request fails.

---

## Tools and libraries

### Frontend (`frontend/`)

| Purpose | Technology |
|--------|------------|
| **UI framework** | React 18 |
| **Build & dev server** | Vite 7 |
| **Routing** | React Router DOM 6 |
| **Styling** | Tailwind CSS 3, PostCSS, Autoprefixer |
| **Icons** | Lucide React |
| **Markdown in chat** | Marked (parse), DOMPurify (sanitize) |
| **Charts** | Vega 6, Vega-Lite 6, Vega-Embed 7 |
| **Language** | JavaScript (JSX); no TypeScript in the current frontend |
| **Bundling** | Vite (Rollup under the hood); manual chunks for react-vendor and chart-vendor |

The frontend is a single-page application (SPA). The API base URL is configurable (e.g. for local backend or production). Vite proxies `/api` to the backend during development.

### Backend (`backend/`)

| Purpose | Technology |
|--------|------------|
| **API framework** | FastAPI |
| **ASGI server** | Uvicorn |
| **HTTP client** | Requests |
| **Validation & config** | Pydantic |
| **Environment variables** | python-dotenv |
| **Google Cloud auth** | google-auth, google-auth-oauthlib |
| **APIs used** | Google Cloud Data Analytics Agent (Conversational Analytics), BigQuery REST API |

The backend runs as a single FastAPI app (`main.py`). It loads config from `.env` (repo root or `backend/`), reads `ca_profiles.json` and `agent_labels.json` from `backend/`, and talks to GCP using a service account (e.g. `GOOGLE_APPLICATION_CREDENTIALS`).

### Infrastructure and APIs

- **Google Cloud Data Analytics Agent (Conversational Analytics)** for chat and agent CRUD.
- **BigQuery** for listing projects/datasets/tables and for agent data sources.
- **Optional**: Local `ca_profiles.json` and `agent_labels.json` for profiles and custom labels when not using GCP for everything.

---

## Summary

| Layer | Stack |
|-------|--------|
| **Frontend** | React, Vite, Tailwind, React Router, Vega/Vega-Lite, Marked, DOMPurify, Lucide |
| **Backend** | FastAPI, Uvicorn, Pydantic, Requests, python-dotenv, Google Auth |
| **Data / AI** | Google Cloud Data Analytics Agent API, BigQuery API |
| **Repo layout** | `frontend/` (canonical UI), `backend/` (canonical API), `docs/` (e.g. this file, STRUCTURE.md) |

For setup and running the app, see the root **README.md** and **frontend/README.md**, **backend/README.md**. For adding new features, see **docs/STRUCTURE.md**.
