# Dashworx AI Chat – Edge Cases & Negative Test Cases

**Feature:** Cross-cutting Edge Cases and Negative Tests
**Business Domain:** Marketing / Ad Campaign Analytics
**Date:** 15/02/2026

---

## TC-EDGE-001: Chat with extremely long message

| Field | Detail |
|-------|--------|
| **Objective** | Verify the system handles an unusually long user message |
| **Business Context** | A user pastes an entire campaign brief (5,000+ words) and asks for analysis |
| **Steps** | 1. Select an agent<br>2. Paste a 5,000-word campaign brief<br>3. Ask: *"Summarize the key metrics mentioned in this brief"*<br>4. Send |
| **Expected Result** | Either: (a) message is processed and a response returned, or (b) a clear error message indicates the input exceeds the maximum length. The app does not crash or hang |
| **Priority** | P2 – Medium |

---

## TC-EDGE-002: Chat with special characters and Unicode

| Field | Detail |
|-------|--------|
| **Objective** | Verify the system handles special characters, emojis, and non-Latin scripts |
| **Business Context** | An APAC marketer asks a question in Japanese mixed with English |
| **Steps** | 1. Select `APAC Campaign Analyst`<br>2. Type: *"2025年Q1の広告費用は？ 🎯 Show me the breakdown"*<br>3. Send |
| **Expected Result** | Message is sent without encoding errors. Response is returned normally. Unicode characters render correctly in the chat UI |
| **Priority** | P2 – Medium |

---

## TC-EDGE-003: Rapid-fire messages

| Field | Detail |
|-------|--------|
| **Objective** | Verify the system handles multiple messages sent in quick succession |
| **Business Context** | An impatient user sends 5 questions within 2 seconds |
| **Steps** | 1. Select an agent<br>2. Send 5 messages rapidly without waiting for responses |
| **Expected Result** | Messages are queued or processed sequentially. No duplicate responses. No server errors (500). UI does not freeze. Each message gets its own response (or later messages are queued behind earlier ones) |
| **Priority** | P2 – Medium |

---

## TC-EDGE-004: Network timeout during chat

| Field | Detail |
|-------|--------|
| **Objective** | Verify the UI handles a network timeout gracefully |
| **Business Context** | A user on a slow VPN sends a complex query that takes too long |
| **Steps** | 1. Simulate network latency > 30 seconds<br>2. Send a chat message |
| **Expected Result** | UI shows a loading indicator. After timeout, a clear error message appears (e.g., "Request timed out. Please try again."). Send button becomes re-enabled. No infinite spinner |
| **Priority** | P1 – High |

---

## TC-EDGE-005: Agent references a deleted BigQuery table

| Field | Detail |
|-------|--------|
| **Objective** | Verify the system handles a query against a BigQuery table that no longer exists |
| **Business Context** | The data engineering team dropped an old table. An agent still references it |
| **Steps** | 1. Select an agent whose table has been deleted<br>2. Send a query |
| **Expected Result** | A clear error message like "The data source is unavailable" appears. The error includes SQL validation tips if applicable. The app does not crash. The user is guided to check data source configuration |
| **Priority** | P1 – High |

---

## TC-EDGE-006: Create agent with duplicate name

| Field | Detail |
|-------|--------|
| **Objective** | Verify behavior when creating an agent with a name that already exists |
| **Business Context** | Two team members independently try to create a "Q2 Campaign Analyst" |
| **Steps** | 1. Create agent with display name "Q2 Campaign Analyst"<br>2. Try to create another agent with the same display name |
| **Expected Result** | Either: (a) the second creation succeeds with a unique GCP path (names are labels, not IDs), or (b) a warning/error indicates a duplicate label. The behavior should be predictable and not cause data corruption in `agent_labels.json` |
| **Priority** | P2 – Medium |

---

## TC-EDGE-007: Create agent with empty system instruction

| Field | Detail |
|-------|--------|
| **Objective** | Verify behavior when the system instruction field is left empty |
| **Business Context** | A user skips the instruction field thinking defaults will apply |
| **Steps** | 1. Navigate to Create Agent<br>2. Fill in name, currency, and data source but leave instruction empty<br>3. Click Create |
| **Expected Result** | Either: (a) validation error requires a non-empty instruction, or (b) agent is created with only guard rails as the instruction (if this is valid). Behavior is documented and consistent |
| **Priority** | P2 – Medium |

---

## TC-EDGE-008: GCP service account credentials expired

| Field | Detail |
|-------|--------|
| **Objective** | Verify the system handles expired or invalid GCP credentials |
| **Business Context** | The service account key has expired overnight; the team tries to use the app in the morning |
| **Steps** | 1. Configure the backend with expired credentials<br>2. Try to list agents or send a chat message |
| **Expected Result** | Clear error message indicating an authentication issue (without exposing sensitive details). All GCP-dependent features show appropriate errors. Local profiles still work. Suggested action: "Contact your administrator to refresh credentials" |
| **Priority** | P0 – Critical |

---

## TC-EDGE-009: Concurrent agent deletion

| Field | Detail |
|-------|--------|
| **Objective** | Verify behavior when two users try to delete the same agent simultaneously |
| **Business Context** | Two admins both see a deprecated agent and try to delete it at the same time |
| **Steps** | 1. Send DELETE for agent X from browser A<br>2. Immediately send DELETE for agent X from browser B |
| **Expected Result** | One request succeeds (200/204). The other returns a 404 (already deleted) or a clear error. No server crash. `agent_labels.json` is not corrupted |
| **Priority** | P2 – Medium |

---

## TC-EDGE-010: Chat query that returns no data

| Field | Detail |
|-------|--------|
| **Objective** | Verify the agent handles a query that matches no rows in BigQuery |
| **Business Context** | A marketer asks about a campaign that hasn't launched yet, so there's no data |
| **Steps** | 1. Select `Q1 Campaign Analyst`<br>2. Type: *"What was the performance of the Summer 2026 campaign?"*<br>3. Send |
| **Expected Result** | Agent returns a helpful text response indicating no data was found (not fabricated numbers). E.g., "No data found for a Summer 2026 campaign in the current dataset." Guard rails enforce no fabrication |
| **Priority** | P0 – Critical |

---

## TC-EDGE-011: XSS attempt in agent display name

| Field | Detail |
|-------|--------|
| **Objective** | Verify the app sanitizes agent names against XSS |
| **Business Context** | A malicious or accidental input like `<img onerror=alert(1) src=x>` in the agent name field |
| **Steps** | 1. Navigate to Create Agent<br>2. Enter display name: `<img onerror=alert(1) src=x> Test Agent`<br>3. Create the agent<br>4. View it in the agent list and dropdown |
| **Expected Result** | The name is sanitized. No script executes. The label displays as plain text (escaped HTML). DOMPurify or backend validation prevents the attack |
| **Priority** | P0 – Critical |

---

## TC-EDGE-012: Backend returns malformed JSON

| Field | Detail |
|-------|--------|
| **Objective** | Verify the frontend handles a malformed backend response gracefully |
| **Business Context** | A backend bug causes truncated JSON in the response |
| **Steps** | 1. Mock the backend to return invalid JSON<br>2. Send a chat message |
| **Expected Result** | Frontend shows a user-friendly error message (e.g., "Something went wrong. Please try again."). No raw error or stack trace displayed. Console logs the parse error for debugging |
| **Priority** | P1 – High |

---

## TC-EDGE-013: Very large table artifact (10,000+ rows)

| Field | Detail |
|-------|--------|
| **Objective** | Verify the UI handles a large data table without freezing |
| **Business Context** | An analyst asks for all individual ad impressions for the quarter — 10,000+ rows |
| **Steps** | 1. Send a query that returns a table with 10,000+ rows |
| **Expected Result** | Either: (a) table is paginated or truncated with a message ("Showing first 100 of 10,432 rows"), or (b) virtual scrolling is used. The browser does not freeze. A download/export option is available if pagination is used |
| **Priority** | P2 – Medium |

---

## TC-EDGE-014: SQL injection via chat message

| Field | Detail |
|-------|--------|
| **Objective** | Verify the system is not vulnerable to SQL injection through user chat input |
| **Business Context** | A penetration tester sends a malicious message |
| **Steps** | 1. Select any agent<br>2. Type: *"Show me spend'; DROP TABLE ad_spend; --"*<br>3. Send |
| **Expected Result** | The message is treated as natural language, not SQL. The backend/agent does not execute raw SQL from user input. The response is either a valid answer or a safe error. No tables are dropped or modified |
| **Priority** | P0 – Critical |

---

## TC-EDGE-015: Agent list when no agents exist

| Field | Detail |
|-------|--------|
| **Objective** | Verify the UI handles an empty agent list |
| **Business Context** | A fresh deployment with no agents configured yet |
| **Steps** | 1. Ensure no GCP agents and no local profiles exist<br>2. Open the app |
| **Expected Result** | Agent list shows an empty state message (e.g., "No agents configured. Create your first agent."). Chat page shows the dropdown as empty with guidance. No errors or blank screens |
| **Priority** | P1 – High |

---

## TC-EDGE-016: Profile label update and removal

| Field | Detail |
|-------|--------|
| **Objective** | Verify local profile labels can be updated and removed |
| **Business Context** | A team removes the custom label from a local profile to revert to the default display |
| **Steps** | 1. Navigate to Agent Management<br>2. Edit a local profile's label to "Custom Label"<br>3. Save → verify label shows "Custom Label"<br>4. Remove the custom label (clear the field)<br>5. Save |
| **Expected Result** | After step 3, label is "Custom Label" everywhere. After step 5, the profile reverts to its default display (GCP path or profile name). `agent_labels.json` no longer has an entry for this profile |
| **Priority** | P2 – Medium |

---

## Summary

| Priority | Count |
|----------|-------|
| P0 – Critical | 4 |
| P1 – High | 4 |
| P2 – Medium | 8 |
| **Total** | **16** |
