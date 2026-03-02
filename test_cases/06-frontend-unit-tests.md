# Dashworx AI Chat – Frontend Unit Test Cases

**Feature:** Frontend Components
**Business Domain:** Marketing / Ad Campaign Analytics
**Date:** 15/02/2026

---

## TC-FE-001: Agent dropdown renders all agents

| Field | Detail |
|-------|--------|
| **Objective** | Verify the agent selector dropdown lists all agents from the API |
| **Test Type** | Component unit test (React Testing Library) |
| **Steps** | 1. Mock GET `/api/agents` to return 3 agents<br>2. Render the Chat component<br>3. Open the dropdown |
| **Expected Result** | Dropdown contains 3 options with correct labels |
| **Priority** | P1 – High |

---

## TC-FE-002: Chat message renders markdown safely

| Field | Detail |
|-------|--------|
| **Objective** | Verify markdown is rendered and XSS is prevented |
| **Test Type** | Component unit test |
| **Steps** | 1. Render a chat message with content: `**bold** and <script>alert('xss')</script>`<br>2. Inspect the rendered output |
| **Expected Result** | "bold" is rendered as `<strong>bold</strong>`. The `<script>` tag is stripped by DOMPurify. No alert executes |
| **Priority** | P0 – Critical |

---

## TC-FE-003: Vega-Lite chart renders from spec

| Field | Detail |
|-------|--------|
| **Objective** | Verify a Vega-Lite spec is rendered as an interactive chart |
| **Test Type** | Component unit test |
| **Steps** | 1. Pass a valid Vega-Lite spec (bar chart) to the chart artifact component<br>2. Render |
| **Expected Result** | An SVG chart is rendered in the DOM. No JavaScript errors in console |
| **Priority** | P1 – High |

---

## TC-FE-004: Generation time formats correctly

| Field | Detail |
|-------|--------|
| **Objective** | Verify the "Thought for N s" label formats various durations correctly |
| **Test Type** | Unit test (pure function) |
| **Steps** | Test with inputs: `0.5`, `3.2`, `65`, `125` |
| **Expected Result** | `0.5` → "Thought for 1 s", `3.2` → "Thought for 3 s", `65` → "Thought for 1 min 5 s", `125` → "Thought for 2 min 5 s" |
| **Priority** | P2 – Medium |

---

## TC-FE-005: Create Agent form validation

| Field | Detail |
|-------|--------|
| **Objective** | Verify the form prevents submission with missing required fields |
| **Test Type** | Component unit test |
| **Steps** | 1. Render the Create Agent form<br>2. Leave display name empty<br>3. Click Create |
| **Expected Result** | Form does not submit. Validation error shown on the display name field. No API call made |
| **Priority** | P1 – High |

---

## TC-FE-006: Artifacts panel toggle

| Field | Detail |
|-------|--------|
| **Objective** | Verify the artifacts side panel opens and closes correctly |
| **Test Type** | Component unit test |
| **Steps** | 1. Render chat with a response that has artifacts<br>2. Click to open artifacts panel<br>3. Verify panel is visible<br>4. Click to close<br>5. Verify panel is hidden |
| **Expected Result** | Panel toggles between visible and hidden states. Content (SQL, tables, charts) renders inside the panel when open |
| **Priority** | P1 – High |

---

## TC-FE-007: API base URL persists after change

| Field | Detail |
|-------|--------|
| **Objective** | Verify the configured API base URL is used for all subsequent requests |
| **Test Type** | Integration unit test |
| **Steps** | 1. Set API base URL to `https://custom-api.example.com`<br>2. Trigger a chat request<br>3. Inspect the outgoing request URL |
| **Expected Result** | Request is sent to `https://custom-api.example.com/api/chat`, not the default URL |
| **Priority** | P1 – High |

---

## Summary

| Priority | Count |
|----------|-------|
| P0 – Critical | 1 |
| P1 – High | 5 |
| P2 – Medium | 1 |
| **Total** | **7** |
