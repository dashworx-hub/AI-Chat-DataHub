# Dashworx AI Chat – Test Cases Index

**Application:** Dashworx AI Chat
**Business Domain:** Marketing / Ad Campaign Analytics
**Date:** 15/02/2026

---

## Test Suite Files

| # | File | Feature | Tests | P0 | P1 | P2 |
|---|------|---------|-------|----|----|-----|
| 1 | `01-chat-tests.md` | Chat (E2E) | 10 | 4 | 5 | 1 |
| 2 | `02-agent-management-tests.md` | Agent Management (E2E) | 6 | 1 | 4 | 1 |
| 3 | `03-create-agent-tests.md` | Create Agent (E2E) | 5 | 3 | 1 | 1 |
| 4 | `04-settings-data-sources-tests.md` | Settings & Data Sources (E2E) | 5 | 0 | 4 | 1 |
| 5 | `05-backend-api-integration-tests.md` | Backend API (Integration) | 13 | 4 | 7 | 2 |
| 6 | `06-frontend-unit-tests.md` | Frontend Components (Unit) | 7 | 1 | 5 | 1 |
| 7 | `07-backend-unit-tests.md` | Backend Logic (Unit) | 8 | 3 | 3 | 2 |
| 8 | `08-edge-cases-negative-tests.md` | Edge Cases & Negative | 16 | 4 | 4 | 8 |
| | **TOTAL** | | **70** | **20** | **33** | **17** |

---

## Recommended Testing Order

1. **Backend Unit Tests** (`07`) – Validate core logic first
2. **Frontend Unit Tests** (`06`) – Validate component behavior
3. **Backend API Integration** (`05`) – Test endpoints with real/mocked GCP
4. **Chat E2E** (`01`) – Core user flow
5. **Create Agent E2E** (`03`) – Agent provisioning flow
6. **Agent Management E2E** (`02`) – CRUD operations
7. **Settings & Data Sources E2E** (`04`) – Configuration flows
8. **Edge Cases & Negative** (`08`) – Boundary and failure scenarios

---

## Test Environment Requirements

| Requirement | Detail |
|-------------|--------|
| GCP Project | `mktg-analytics-prod` with valid service account |
| BigQuery Data | Seeded `campaign_performance` and `social_media` datasets |
| Backend | FastAPI running with `.env`, `ca_profiles.json`, `agent_labels.json` |
| Frontend | React app built and served (or Vite dev server with `/api` proxy) |
| Browser | Chrome (latest), Firefox (latest) – minimum |
| Known Bugs | TC-CHAT-009: "How we got this" feature currently broken |
