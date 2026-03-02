# Dashworx AI Chat – Agent Management Test Cases

**Feature:** Agent Management (List, View, Edit, Delete)
**Business Domain:** Marketing / Ad Campaign Analytics
**Date:** 15/02/2026

---

## Test Data Context

| Agent Name | Label | Source |
|------------|-------|--------|
| Q1 Campaign Analyst | `q1-campaign-agent` | GCP |
| Social Media Insights | `social-media-agent` | GCP |
| Local Dev Agent | `local-dev-agent` | Local (`ca_profiles.json`) |
| Test - Delete Me | `test-delete-agent` | GCP |

---

## TC-AGENT-001: List agents from GCP and local profiles

| Field | Detail |
|-------|--------|
| **Objective** | Verify the agent list shows both GCP-hosted agents and local profile agents |
| **Preconditions** | At least 1 GCP agent and 1 local profile in `ca_profiles.json` exist |
| **Business Context** | A team lead opens the app to see all available analytics agents — some provisioned in GCP, others configured locally for dev/testing |
| **Steps** | 1. Navigate to Agent Management page<br>2. Observe the agent list |
| **Expected Result** | List displays all agents with their labels (from `agent_labels.json`), paths, and source (GCP or Local). Labels are human-readable (e.g., "Q1 Campaign Analyst" not the GCP resource path) |
| **Priority** | P0 – Critical |

---

## TC-AGENT-002: View agent details

| Field | Detail |
|-------|--------|
| **Objective** | Verify a user can view the full details of an agent including path, instruction, and label |
| **Preconditions** | `Q1 Campaign Analyst` agent exists |
| **Business Context** | An admin wants to audit the system instruction of the campaign agent to ensure it includes proper guardrails before a client demo |
| **Steps** | 1. Navigate to Agent Management<br>2. Click on `Q1 Campaign Analyst`<br>3. View details panel |
| **Expected Result** | Details show: GCP resource path, display label, full system instruction text (including appended guard rails). Guard rails section is visible within the instruction |
| **Priority** | P1 – High |

---

## TC-AGENT-003: Edit agent system instruction

| Field | Detail |
|-------|--------|
| **Objective** | Verify a user can update the system instruction of an existing agent |
| **Preconditions** | `Q1 Campaign Analyst` agent exists |
| **Business Context** | The analytics team wants to add a new instruction: "Always include confidence intervals when reporting conversion metrics" to improve data quality |
| **Steps** | 1. Navigate to Agent Management<br>2. Click Edit on `Q1 Campaign Analyst`<br>3. Append to instruction: *"Always include confidence intervals when reporting conversion metrics."*<br>4. Click Save |
| **Expected Result** | Save succeeds with confirmation message. Re-opening the agent details shows the updated instruction. Guard rails remain intact (not overwritten). Subsequent chat queries reflect the new behavior |
| **Priority** | P1 – High |

---

## TC-AGENT-004: Edit agent display label

| Field | Detail |
|-------|--------|
| **Objective** | Verify a user can change the display label of an agent |
| **Preconditions** | `Q1 Campaign Analyst` agent exists |
| **Business Context** | Q1 is over; the team wants to rename the agent to "H1 Campaign Analyst" to reflect its expanded scope |
| **Steps** | 1. Navigate to Agent Management<br>2. Click Edit on `Q1 Campaign Analyst`<br>3. Change label to *"H1 Campaign Analyst"*<br>4. Click Save |
| **Expected Result** | Label updates in the agent list and in the chat agent dropdown. `agent_labels.json` is updated on the backend. Old label no longer appears anywhere in the UI |
| **Priority** | P1 – High |

---

## TC-AGENT-005: Delete an agent

| Field | Detail |
|-------|--------|
| **Objective** | Verify a user can delete an agent and it is removed from GCP and the UI |
| **Preconditions** | A test agent `Test - Delete Me` exists in GCP |
| **Business Context** | A deprecated Black Friday 2024 campaign agent is no longer needed and should be cleaned up to reduce clutter |
| **Steps** | 1. Navigate to Agent Management<br>2. Find `Test - Delete Me`<br>3. Click Delete<br>4. Confirm deletion in the dialog |
| **Expected Result** | Agent is removed from the list. A success message appears. The agent no longer appears in the chat dropdown. Backend handles permission propagation delays gracefully (retry logic). If the agent enters soft-deleted state, UI shows appropriate status |
| **Priority** | P1 – High |

---

## TC-AGENT-006: Delete agent – retry on permission propagation delay

| Field | Detail |
|-------|--------|
| **Objective** | Verify the backend retries deletion when GCP returns a permission propagation error |
| **Preconditions** | Agent exists; GCP may return transient permission errors |
| **Business Context** | Admin deletes an agent right after modifying its permissions. GCP needs time to propagate |
| **Steps** | 1. Delete an agent immediately after creation or permission change<br>2. Observe the delete operation |
| **Expected Result** | If GCP returns a transient error, the backend retries automatically. UI shows a brief loading state. Deletion eventually succeeds or returns a clear error message after retries are exhausted |
| **Priority** | P2 – Medium |

---

## Summary

| Priority | Count |
|----------|-------|
| P0 – Critical | 1 |
| P1 – High | 4 |
| P2 – Medium | 1 |
| **Total** | **6** |
