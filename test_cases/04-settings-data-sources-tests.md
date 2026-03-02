# Dashworx AI Chat – Settings & Data Sources Test Cases

**Feature:** Settings & Data Sources
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

## TC-SETTINGS-001: Configure API base URL

| Field | Detail |
|-------|--------|
| **Objective** | Verify the user can change the API base URL and the frontend uses the new endpoint |
| **Preconditions** | App is running with default API base |
| **Business Context** | A developer needs to switch from the staging backend to production backend for a client demo |
| **Steps** | 1. Open Settings<br>2. Change API base URL to `https://api-prod.dashworx.example.com`<br>3. Save<br>4. Navigate to Chat and send a message |
| **Expected Result** | Frontend sends requests to the new base URL. If the URL is valid, chat works normally. If invalid, a clear error message appears (not a silent failure) |
| **Priority** | P1 – High |

---

## TC-SETTINGS-002: List data sources from GCP

| Field | Detail |
|-------|--------|
| **Objective** | Verify the settings page shows available BigQuery data sources from GCP |
| **Preconditions** | GCP connection is active |
| **Business Context** | An admin reviews available data sources to ensure the campaign_performance dataset is connected before onboarding a new team member |
| **Steps** | 1. Open Settings → Data Sources<br>2. Observe the data sources list |
| **Expected Result** | All BigQuery datasets and tables accessible via the service account are listed. GCP fetch status shows "Connected" or similar. Caching indicator shows when data was last fetched |
| **Priority** | P1 – High |

---

## TC-SETTINGS-003: Data sources fallback when GCP is unavailable

| Field | Detail |
|-------|--------|
| **Objective** | Verify the app falls back to local `ca_profiles.json` when GCP is unreachable |
| **Preconditions** | GCP connection is down or returns errors; local `ca_profiles.json` has valid profiles |
| **Business Context** | During a GCP outage, the team still needs to access local agent profiles to continue their work |
| **Steps** | 1. Simulate GCP unavailability (e.g., invalid credentials or network block)<br>2. Open Settings → Data Sources<br>3. Observe behavior |
| **Expected Result** | UI does not crash. Data sources from `ca_profiles.json` are displayed. A warning banner indicates GCP is unavailable. Agents from local profiles are still selectable in chat |
| **Priority** | P1 – High |

---

## TC-SETTINGS-004: Add a new BigQuery data source

| Field | Detail |
|-------|--------|
| **Objective** | Verify a user can add a new BigQuery data source in settings |
| **Preconditions** | Settings page is accessible |
| **Business Context** | The team just created a new BigQuery dataset for influencer marketing and needs to make it available as a data source |
| **Steps** | 1. Open Settings → Data Sources<br>2. Click Add Data Source<br>3. Enter project, dataset, and table details<br>4. Save |
| **Expected Result** | New data source appears in the list. It becomes available in the Create Agent form's dropdowns. Cache is invalidated so fresh data is fetched |
| **Priority** | P1 – High |

---

## TC-SETTINGS-005: Remove a data source

| Field | Detail |
|-------|--------|
| **Objective** | Verify a user can remove a data source from settings |
| **Preconditions** | At least one removable data source exists |
| **Business Context** | A deprecated staging dataset should be removed to prevent accidental agent creation against test data |
| **Steps** | 1. Open Settings → Data Sources<br>2. Click Remove on the staging data source<br>3. Confirm removal |
| **Expected Result** | Data source removed from the list. No longer appears in Create Agent dropdowns. Existing agents connected to this source are not affected (they reference GCP directly) |
| **Priority** | P2 – Medium |

---

## Summary

| Priority | Count |
|----------|-------|
| P0 – Critical | 0 |
| P1 – High | 4 |
| P2 – Medium | 1 |
| **Total** | **5** |
