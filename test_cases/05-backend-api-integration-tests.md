# Dashworx AI Chat – Backend API Integration Test Cases

**Feature:** Backend API Endpoints
**Business Domain:** Marketing / Ad Campaign Analytics
**Date:** 15/02/2026

---

## TC-API-001: POST /api/chat – successful query

| Field | Detail |
|-------|--------|
| **Objective** | Verify the chat API returns a valid response with text, optional artifacts, and generation time |
| **Preconditions** | Backend running, agent configured |
| **Business Context** | Frontend sends a chat message about campaign CPA |
| **Steps** | 1. Send POST `/api/chat` with body: `{ "agent_id": "<agent_path>", "message": "What is the average CPA across all campaigns?", "history": [] }` |
| **Expected Result** | Response 200. Body contains: `text` (non-empty string), `generation_time` (positive number), optional `artifacts` array (with SQL, table, or chart objects). Content-type is `application/json` |
| **Priority** | P0 – Critical |

---

## TC-API-002: POST /api/chat – with conversation history

| Field | Detail |
|-------|--------|
| **Objective** | Verify the chat API accepts and uses conversation history for context |
| **Preconditions** | Backend running, agent configured |
| **Business Context** | Follow-up question referencing previous context |
| **Steps** | 1. Send POST `/api/chat` with: `{ "agent_id": "<agent_path>", "message": "Break that down by channel", "history": [{"role": "user", "content": "What is total Q1 spend?"}, {"role": "assistant", "content": "Total Q1 spend was $1.2M."}] }` |
| **Expected Result** | Response 200. The answer references "spend" and provides a channel breakdown, demonstrating context was used |
| **Priority** | P0 – Critical |

---

## TC-API-003: GET /api/agents – list agents

| Field | Detail |
|-------|--------|
| **Objective** | Verify the agents listing endpoint returns both GCP and local agents |
| **Preconditions** | At least one GCP agent and one local profile exist |
| **Steps** | 1. Send GET `/api/agents` |
| **Expected Result** | Response 200. Body is an array of agent objects, each with `path`, `label`, `source` (GCP or local). Labels from `agent_labels.json` are applied |
| **Priority** | P0 – Critical |

---

## TC-API-004: POST /api/agents – create agent

| Field | Detail |
|-------|--------|
| **Objective** | Verify the create agent endpoint provisions the agent in GCP with guard rails |
| **Preconditions** | Valid GCP credentials and BigQuery access |
| **Steps** | 1. Send POST `/api/agents` with: `{ "display_name": "Integration Test Agent", "instruction": "You analyze marketing data.", "currency": "USD", "bigquery_source": { "project": "mktg-analytics-prod", "dataset": "campaign_performance", "table": "ad_spend" } }` |
| **Expected Result** | Response 201. Body contains the new agent's GCP path. The agent's instruction in GCP includes the user instruction + appended guard rails. Label is persisted in `agent_labels.json`. Agent cache is invalidated |
| **Priority** | P0 – Critical |

---

## TC-API-005: DELETE /api/agents/{id} – delete agent

| Field | Detail |
|-------|--------|
| **Objective** | Verify the delete endpoint removes the agent from GCP |
| **Preconditions** | Test agent exists |
| **Steps** | 1. Send DELETE `/api/agents/{agent_id}` |
| **Expected Result** | Response 200 or 204. Agent no longer returned by GET `/api/agents`. Cache is invalidated. If soft-deleted, response indicates the state |
| **Priority** | P1 – High |

---

## TC-API-006: PUT /api/agents/{id} – update instruction

| Field | Detail |
|-------|--------|
| **Objective** | Verify the update endpoint modifies the agent instruction while preserving guard rails |
| **Preconditions** | Agent exists with current instruction |
| **Steps** | 1. Send PUT `/api/agents/{agent_id}` with: `{ "instruction": "Updated: Focus on social media metrics only.", "label": "Social Only Agent" }` |
| **Expected Result** | Response 200. GET agent details shows updated instruction with guard rails still appended. Label updated in `agent_labels.json` |
| **Priority** | P1 – High |

---

## TC-API-007: GET /api/datasources – list BigQuery sources

| Field | Detail |
|-------|--------|
| **Objective** | Verify the data sources endpoint returns available BigQuery projects, datasets, and tables |
| **Steps** | 1. Send GET `/api/datasources` |
| **Expected Result** | Response 200. Body contains hierarchical data: projects → datasets → tables. Cached responses include a TTL indicator |
| **Priority** | P1 – High |

---

## TC-API-008: Security headers are present

| Field | Detail |
|-------|--------|
| **Objective** | Verify all API responses include required security headers |
| **Steps** | 1. Send any GET or POST request<br>2. Inspect response headers |
| **Expected Result** | Headers include: `Content-Security-Policy`, `X-Frame-Options: DENY` (or SAMEORIGIN), `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (if HTTPS). CORS headers are correctly configured (allowed origins only) |
| **Priority** | P1 – High |

---

## TC-API-009: CORS – reject unauthorized origin

| Field | Detail |
|-------|--------|
| **Objective** | Verify the backend rejects requests from unauthorized origins |
| **Steps** | 1. Send a request with `Origin: https://evil-site.example.com` |
| **Expected Result** | Response does not include `Access-Control-Allow-Origin` for the unauthorized origin. Browser would block the response |
| **Priority** | P1 – High |

---

## TC-API-010: Input validation – empty message

| Field | Detail |
|-------|--------|
| **Objective** | Verify the chat endpoint rejects an empty message |
| **Steps** | 1. Send POST `/api/chat` with `{ "agent_id": "<path>", "message": "", "history": [] }` |
| **Expected Result** | Response 400 or 422 with a clear validation error message. No query is sent to GCP |
| **Priority** | P1 – High |

---

## TC-API-011: Input validation – missing agent_id

| Field | Detail |
|-------|--------|
| **Objective** | Verify the chat endpoint rejects a request without agent_id |
| **Steps** | 1. Send POST `/api/chat` with `{ "message": "Hello" }` |
| **Expected Result** | Response 400 or 422 with validation error indicating `agent_id` is required |
| **Priority** | P1 – High |

---

## TC-API-012: Cache invalidation on agent create

| Field | Detail |
|-------|--------|
| **Objective** | Verify the agent cache is invalidated when a new agent is created |
| **Steps** | 1. GET `/api/agents` (cache populated)<br>2. POST `/api/agents` to create a new agent<br>3. GET `/api/agents` again |
| **Expected Result** | The second GET returns the newly created agent. The response is not a stale cached version |
| **Priority** | P2 – Medium |

---

## TC-API-013: Cache invalidation on agent delete

| Field | Detail |
|-------|--------|
| **Objective** | Verify the agent cache is invalidated when an agent is deleted |
| **Steps** | 1. GET `/api/agents` (cache populated)<br>2. DELETE `/api/agents/{id}`<br>3. GET `/api/agents` again |
| **Expected Result** | The deleted agent no longer appears in the list. Cache was properly invalidated |
| **Priority** | P2 – Medium |

---

## Summary

| Priority | Count |
|----------|-------|
| P0 – Critical | 4 |
| P1 – High | 7 |
| P2 – Medium | 2 |
| **Total** | **13** |
