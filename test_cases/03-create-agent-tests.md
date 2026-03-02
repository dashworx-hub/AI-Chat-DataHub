# Dashworx AI Chat – Create Agent Test Cases

**Feature:** Create Agent
**Business Domain:** Marketing / Ad Campaign Analytics
**Date:** 15/02/2026

---

## Test Data Context

| GCP Project | Dataset | Tables |
|-------------|---------|--------|
| `mktg-analytics-prod` | `campaign_performance` | `ad_spend`, `impressions`, `conversions`, `channel_attribution` |
| `mktg-analytics-prod` | `social_media` | `engagement_metrics`, `audience_demographics`, `post_performance` |
| `mktg-analytics-staging` | `campaign_performance` | `ad_spend`, `impressions` |

---

## TC-CREATE-001: Create a new agent with full configuration

| Field | Detail |
|-------|--------|
| **Objective** | Verify the full create-agent flow from form to GCP provisioning |
| **Preconditions** | GCP project `mktg-analytics-prod` with `campaign_performance` dataset accessible |
| **Business Context** | The marketing team is launching a Q2 campaign and needs a dedicated AI analyst agent scoped to the new Q2 data tables |
| **Steps** | 1. Navigate to Create Agent<br>2. Enter display name: *"Q2 Campaign Analyst"*<br>3. Enter system instruction: *"You are a marketing analytics assistant focused on Q2 2025 campaign performance. Always report metrics with week-over-week comparisons."*<br>4. Set currency to USD<br>5. Select project: `mktg-analytics-prod`<br>6. Select dataset: `campaign_performance`<br>7. Select table: `ad_spend`<br>8. Review guard rails (read-only section)<br>9. Click Create |
| **Expected Result** | Agent is created in GCP. Success message displayed. Agent appears in the agent list and chat dropdown. System instruction includes user-provided text PLUS appended guard rails. Label is saved in `agent_labels.json` |
| **Priority** | P0 – Critical |

---

## TC-CREATE-002: Guard rails are displayed read-only and appended automatically

| Field | Detail |
|-------|--------|
| **Objective** | Verify guard rails are shown in the UI and automatically appended to the system instruction |
| **Preconditions** | User is on the Create Agent form |
| **Business Context** | Compliance requires that every agent has data integrity and no-fabrication guardrails. The marketing team should see but not modify these |
| **Steps** | 1. Navigate to Create Agent<br>2. Fill in basic fields<br>3. Observe the guard rails section |
| **Expected Result** | Guard rails (scope, output format, data integrity, no fabrication, etc.) are displayed in a read-only block. User cannot edit them. After creation, viewing the agent's instruction shows the user instruction followed by the guard rails block |
| **Priority** | P0 – Critical |

---

## TC-CREATE-003: BigQuery project → dataset → table cascading dropdowns

| Field | Detail |
|-------|--------|
| **Objective** | Verify the cascading dropdown behavior for selecting BigQuery data sources |
| **Preconditions** | User has access to `mktg-analytics-prod` with multiple datasets |
| **Business Context** | A new analyst is setting up an agent and needs to navigate the BigQuery hierarchy to find the correct social media table |
| **Steps** | 1. Navigate to Create Agent<br>2. Click the Project dropdown → select `mktg-analytics-prod`<br>3. Observe the Dataset dropdown populates<br>4. Select `social_media`<br>5. Observe the Table dropdown populates<br>6. Select `engagement_metrics` |
| **Expected Result** | Each dropdown loads data from BigQuery API. Dataset dropdown only shows after project is selected. Table dropdown only shows after dataset is selected. Loading spinners appear during API calls. All items match what exists in BigQuery |
| **Priority** | P0 – Critical |

---

## TC-CREATE-004: Optional schema preview for selected table

| Field | Detail |
|-------|--------|
| **Objective** | Verify the user can preview the schema of the selected BigQuery table |
| **Preconditions** | Table `ad_spend` is selected |
| **Business Context** | Before creating the agent, the analyst wants to verify the table has the expected columns (campaign_id, channel, spend, date, etc.) |
| **Steps** | 1. Complete project/dataset/table selection<br>2. Click schema preview (if available) |
| **Expected Result** | Schema displays column names, data types, and optionally descriptions. E.g., `campaign_id: STRING`, `spend: FLOAT64`, `date: DATE` |
| **Priority** | P2 – Medium |

---

## TC-CREATE-005: Create agent with JPY currency

| Field | Detail |
|-------|--------|
| **Objective** | Verify an agent can be created with a non-USD currency |
| **Preconditions** | GCP project accessible |
| **Business Context** | The APAC marketing team needs an agent that reports all monetary values in Japanese Yen |
| **Steps** | 1. Navigate to Create Agent<br>2. Enter display name: *"APAC Q2 Analyst"*<br>3. Set currency to JPY<br>4. Complete remaining fields<br>5. Click Create |
| **Expected Result** | Agent created successfully. When chatting with this agent, monetary values display in JPY format (¥ symbol, no decimals) |
| **Priority** | P1 – High |

---

## Summary

| Priority | Count |
|----------|-------|
| P0 – Critical | 3 |
| P1 – High | 1 |
| P2 – Medium | 1 |
| **Total** | **5** |
