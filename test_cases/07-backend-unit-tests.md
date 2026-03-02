# Dashworx AI Chat – Backend Unit Test Cases

**Feature:** Backend Logic
**Business Domain:** Marketing / Ad Campaign Analytics
**Date:** 15/02/2026

---

## TC-BE-001: Guard rails are appended to system instruction

| Field | Detail |
|-------|--------|
| **Objective** | Verify the guard rails function correctly appends all required sections |
| **Test Type** | Python unit test |
| **Steps** | 1. Call the guard rails function with instruction: `"You are a marketing analyst."` |
| **Expected Result** | Output contains the original instruction plus guard rail blocks for: scope, output contracts, data integrity, analytical discipline, visuals/evidence, response quality, mixed-request handling. Original instruction is not modified |
| **Priority** | P0 – Critical |

---

## TC-BE-002: Reasoning block appended when enabled

| Field | Detail |
|-------|--------|
| **Objective** | Verify the optional reasoning block is appended to the instruction when configured |
| **Test Type** | Python unit test |
| **Steps** | 1. Call the instruction builder with reasoning enabled |
| **Expected Result** | Instruction includes a reasoning block requesting query intent and fields used |
| **Priority** | P2 – Medium |

---

## TC-BE-003: Input validation rejects malicious input

| Field | Detail |
|-------|--------|
| **Objective** | Verify the backend validates and sanitizes chat input |
| **Test Type** | Python unit test |
| **Steps** | Test with inputs: empty string, string > 10,000 chars, string with SQL injection attempt (`"; DROP TABLE --`), string with script tags |
| **Expected Result** | Empty string → validation error. Oversized input → validation error. SQL injection and script tags → either sanitized or rejected. No raw input is passed to GCP without validation |
| **Priority** | P0 – Critical |

---

## TC-BE-004: Cache TTL expiration

| Field | Detail |
|-------|--------|
| **Objective** | Verify the in-memory cache expires after the configured TTL |
| **Test Type** | Python unit test |
| **Steps** | 1. Set cache TTL to 1 second<br>2. Populate cache<br>3. Wait 1.5 seconds<br>4. Request cached data |
| **Expected Result** | Cache miss after TTL expiration. Fresh data is fetched from GCP |
| **Priority** | P2 – Medium |

---

## TC-BE-005: Agent labels CRUD in agent_labels.json

| Field | Detail |
|-------|--------|
| **Objective** | Verify agent labels are correctly created, read, updated, and deleted in the JSON file |
| **Test Type** | Python unit test |
| **Steps** | 1. Create label for agent path<br>2. Read label<br>3. Update label<br>4. Delete label |
| **Expected Result** | Each operation modifies `agent_labels.json` correctly. File is valid JSON after each operation. Concurrent access does not corrupt the file |
| **Priority** | P1 – High |

---

## TC-BE-006: GCP API error handling

| Field | Detail |
|-------|--------|
| **Objective** | Verify the backend handles GCP API errors gracefully |
| **Test Type** | Python unit test (mocked GCP responses) |
| **Steps** | Test with: 401 Unauthorized, 403 Forbidden, 404 Not Found, 429 Rate Limited, 500 Internal Server Error |
| **Expected Result** | Each error returns a structured JSON error to the frontend with appropriate HTTP status code and user-friendly message. No stack traces exposed. 429 includes retry-after guidance |
| **Priority** | P0 – Critical |

---

## TC-BE-007: BigQuery data source listing

| Field | Detail |
|-------|--------|
| **Objective** | Verify the backend correctly lists BigQuery projects, datasets, and tables |
| **Test Type** | Python unit test (mocked BigQuery API) |
| **Steps** | 1. Mock BigQuery API to return 2 projects, 3 datasets, 5 tables<br>2. Call the listing function |
| **Expected Result** | Returns hierarchical structure matching the mock data. Projects, datasets, and tables are correctly nested |
| **Priority** | P1 – High |

---

## TC-BE-008: Pydantic model validation for chat request

| Field | Detail |
|-------|--------|
| **Objective** | Verify the Pydantic model rejects invalid chat request payloads |
| **Test Type** | Python unit test |
| **Steps** | Test with: missing `message` field, `agent_id` as integer instead of string, `history` with invalid role values |
| **Expected Result** | Pydantic raises `ValidationError` for each invalid case with descriptive error messages |
| **Priority** | P1 – High |

---

## Summary

| Priority | Count |
|----------|-------|
| P0 – Critical | 3 |
| P1 – High | 3 |
| P2 – Medium | 2 |
| **Total** | **8** |
