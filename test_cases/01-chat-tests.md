# Dashworx AI Chat – Chat Feature Test Cases

**Feature:** Chat
**Business Domain:** Marketing / Ad Campaign Analytics
**Date:** 15/02/2026

---

## Test Data Context

| Agent Name | Label | Data Source | Currency |
|------------|-------|-------------|----------|
| Q1 Campaign Analyst | `q1-campaign-agent` | `campaign_performance.ad_spend` | USD |
| Social Media Insights | `social-media-agent` | `social_media.engagement_metrics` | USD |
| APAC Campaign Analyst | `apac-campaign-agent` | `campaign_performance.ad_spend` | JPY |

---

## TC-CHAT-001: Ask a simple campaign performance question

| Field | Detail |
|-------|--------|
| **Objective** | Verify a user can select an agent and get a plain-language answer about ad spend |
| **Preconditions** | `Q1 Campaign Analyst` agent exists and is connected to `campaign_performance.ad_spend` |
| **Business Context** | A marketing manager wants to know total Q1 ad spend across all channels before a budget review meeting |
| **Steps** | 1. Open Dashworx AI Chat<br>2. Select `Q1 Campaign Analyst` from the agent dropdown<br>3. Type: *"What was the total ad spend across all channels in Q1 2025?"*<br>4. Press Send |
| **Expected Result** | Assistant returns a text answer with the total spend (e.g., "$1,245,300"), shows "Thought for N s" generation time above the reply, and the response renders as sanitized markdown |
| **Priority** | P0 – Critical |

---

## TC-CHAT-002: Receive a table artifact in response

| Field | Detail |
|-------|--------|
| **Objective** | Verify the chat returns a data table artifact when the answer includes tabular data |
| **Preconditions** | Agent connected to `campaign_performance.ad_spend` with multi-channel data |
| **Business Context** | A media buyer needs a channel-by-channel breakdown of spend vs. budget to identify overspend |
| **Steps** | 1. Select `Q1 Campaign Analyst`<br>2. Type: *"Show me a table of ad spend vs. budget by channel for January 2025"*<br>3. Press Send |
| **Expected Result** | Response includes a markdown text summary AND an artifacts side panel opens showing a table with columns (Channel, Spend, Budget, Variance). Table rows are populated with real data from BigQuery |
| **Priority** | P0 – Critical |

---

## TC-CHAT-003: Receive a Vega-Lite chart artifact

| Field | Detail |
|-------|--------|
| **Objective** | Verify a Vega-Lite chart is rendered when the agent returns visualization data |
| **Preconditions** | Agent connected to `campaign_performance.impressions` |
| **Business Context** | A campaign director wants to see the trend of impressions over the last 90 days to identify seasonal dips |
| **Steps** | 1. Select `Q1 Campaign Analyst`<br>2. Type: *"Show me a line chart of daily impressions for the last 90 days"*<br>3. Press Send |
| **Expected Result** | Artifacts panel shows a rendered Vega-Lite line chart with date on X-axis and impressions on Y-axis. Chart is interactive (hover tooltips). Text summary accompanies the chart |
| **Priority** | P0 – Critical |

---

## TC-CHAT-004: View SQL artifact for transparency

| Field | Detail |
|-------|--------|
| **Objective** | Verify the SQL query used by the agent is visible in the artifacts panel |
| **Preconditions** | Agent is configured and returning results |
| **Business Context** | A data analyst wants to verify the exact SQL the AI used to calculate ROAS to ensure correctness before presenting to leadership |
| **Steps** | 1. Select `Q1 Campaign Analyst`<br>2. Type: *"What is the ROAS by campaign for February 2025?"*<br>3. Press Send<br>4. Open the artifacts side panel |
| **Expected Result** | Artifacts panel displays the SQL snippet used (e.g., a `SELECT` with `SUM(revenue)/SUM(spend)` grouped by campaign). SQL is syntax-highlighted or displayed in a code block |
| **Priority** | P1 – High |

---

## TC-CHAT-005: Multi-turn conversation with context retention

| Field | Detail |
|-------|--------|
| **Objective** | Verify the agent retains context across multiple messages in a conversation |
| **Preconditions** | Agent connected to `campaign_performance` dataset |
| **Business Context** | A CMO is drilling down into campaign data: first asking for overall performance, then narrowing to underperforming channels, then asking for recommendations |
| **Steps** | 1. Select `Q1 Campaign Analyst`<br>2. Send: *"What was the overall campaign performance in Q1 2025?"*<br>3. Wait for response<br>4. Send: *"Which channels underperformed their targets?"*<br>5. Wait for response<br>6. Send: *"For those underperforming channels, show me the weekly trend"* |
| **Expected Result** | Message 2 correctly references Q1 2025 without being told again. Message 3 correctly filters to only the underperforming channels identified in message 2. Each response shows its own "Thought for N s" timer |
| **Priority** | P0 – Critical |

---

## TC-CHAT-006: Generation time display

| Field | Detail |
|-------|--------|
| **Objective** | Verify "Thought for N s" or "Thought for N min M s" is displayed correctly |
| **Preconditions** | Any working agent |
| **Business Context** | Operations team monitors response latency to ensure SLA compliance for real-time dashboard queries |
| **Steps** | 1. Select any agent<br>2. Send: *"What was the total spend last month?"*<br>3. Observe the generation time indicator above the response |
| **Expected Result** | A label like "Thought for 3 s" (or "Thought for 1 min 12 s" for longer queries) appears above the assistant's reply. The time is non-zero and plausible |
| **Priority** | P1 – High |

---

## TC-CHAT-007: Currency formatting in chat responses

| Field | Detail |
|-------|--------|
| **Objective** | Verify monetary values are formatted according to the agent's configured currency |
| **Preconditions** | `APAC Campaign Analyst` agent with currency set to JPY |
| **Business Context** | A regional marketing lead in Tokyo queries APAC ad spend and expects values in Japanese Yen, not USD |
| **Steps** | 1. Select `APAC Campaign Analyst`<br>2. Type: *"What was the total ad spend in Japan for March 2025?"*<br>3. Press Send |
| **Expected Result** | Response shows monetary values formatted as JPY (e.g., "¥14,500,000") without decimal places (JPY convention). No USD symbols appear |
| **Priority** | P1 – High |

---

## TC-CHAT-008: Markdown rendering with safe HTML

| Field | Detail |
|-------|--------|
| **Objective** | Verify chat responses render markdown correctly and sanitize unsafe HTML |
| **Preconditions** | Agent returns a response containing markdown formatting (bold, lists, headers) |
| **Business Context** | A strategist asks for a structured summary and the response includes bullet points, bold KPIs, and a header |
| **Steps** | 1. Select any agent<br>2. Type: *"Give me a structured summary of our top 5 campaigns by conversion rate, with key metrics highlighted"*<br>3. Press Send |
| **Expected Result** | Response renders with proper markdown: headers are styled, bold text appears bold, lists are bulleted. No raw HTML tags visible. DOMPurify strips any unsafe elements |
| **Priority** | P1 – High |

---

## TC-CHAT-009: "How we got this" reasoning accordion (known broken)

| Field | Detail |
|-------|--------|
| **Objective** | Document current behavior of the broken reasoning feature |
| **Preconditions** | Feature is flagged as not working |
| **Business Context** | An analyst wants to understand how the AI determined attribution percentages |
| **Steps** | 1. Select `Q1 Campaign Analyst`<br>2. Type: *"What is the multi-touch attribution breakdown for our Google Ads campaigns?"*<br>3. Look for "How we got this" accordion below the response |
| **Expected Result** | **Current (Bug):** Accordion does not appear or does not expand to show reasoning bullets.<br>**Expected (When Fixed):** Accordion appears below the response, expands to show 4–8 bullets describing query intent and fields used |
| **Priority** | P2 – Medium (blocked/known bug) |
| **Bug Ref** | DASH-XXX – "How we got this" reasoning not rendering |

---

## TC-CHAT-010: Switch agents mid-session

| Field | Detail |
|-------|--------|
| **Objective** | Verify a user can switch from one agent to another and the new agent responds from its own data source |
| **Preconditions** | Both `Q1 Campaign Analyst` and `Social Media Insights` agents exist |
| **Business Context** | A marketing VP first checks paid ad performance, then switches to social media engagement without opening a new session |
| **Steps** | 1. Select `Q1 Campaign Analyst`<br>2. Send: *"What was our CPC last month?"*<br>3. Receive response (should reference ad spend data)<br>4. Switch to `Social Media Insights` from the dropdown<br>5. Send: *"What was our engagement rate on Instagram last week?"* |
| **Expected Result** | After switching, the new agent responds using `social_media.engagement_metrics` data. Previous conversation context from the old agent does not bleed into the new agent's responses |
| **Priority** | P1 – High |

---

## Summary

| Priority | Count |
|----------|-------|
| P0 – Critical | 4 |
| P1 – High | 5 |
| P2 – Medium | 1 |
| **Total** | **10** |
