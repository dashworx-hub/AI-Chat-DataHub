"""
Shared pytest fixtures for Dashworx AI Chat backend tests.

Mocks external dependencies (GCP APIs, file I/O, credentials) so tests
run fast and offline — no GCP project, no service account key needed.

Ensures backend/ is on sys.path so "import main" loads backend/main.py
(the canonical app). Env and tmp paths are set so tests run offline.
"""
import os
import sys
import json
import pytest
from unittest.mock import patch, MagicMock

# Backend dir (canonical app) — required for "import main" to load backend/main.py
_TEST_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_TEST_DIR, ".."))
_BACKEND_DIR = os.path.abspath(os.path.join(_PROJECT_ROOT, "backend"))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# ---------------------------------------------------------------------------
# Mock data matching the actual app's ca_profiles.json and agent_labels.json
# ---------------------------------------------------------------------------
_MOCK_PROFILES = {
    "test-campaign": {
        "label": "Test Campaign Agent",
        "agent": "projects/mktg-prod/locations/global/dataAgents/test-campaign",
        "table": "mktg-prod.campaign_performance.ad_spend",
    },
    "test-social": {
        "label": "Social Media Insights",
        "agent": "projects/mktg-prod/locations/global/dataAgents/test-social",
        "table": "mktg-prod.social_media.engagement_metrics",
    },
}

_MOCK_AGENT_LABELS = {
    "test-campaign": "Q1 Campaign Analyst",
    "test-social": "Social Media Insights",
}


@pytest.fixture(autouse=True)
def _set_env(tmp_path):
    """Write temp config files and set env vars BEFORE main.py loads."""
    profiles_file = tmp_path / "ca_profiles.json"
    profiles_file.write_text(json.dumps(_MOCK_PROFILES))

    labels_file = tmp_path / "agent_labels.json"
    labels_file.write_text(json.dumps(_MOCK_AGENT_LABELS))

    key_file = tmp_path / "fake-key.json"
    key_file.write_text(json.dumps({"type": "service_account", "project_id": "mktg-prod"}))

    env = {
        "CA_BILLING_PROJECT": "mktg-prod",
        "CA_LOCATION": "global",
        "GOOGLE_APPLICATION_CREDENTIALS": str(key_file),
        "CA_PROFILES_PATH": str(profiles_file),
        "ENABLE_GCP_SOURCES_FETCH": "false",
        "GCP_SOURCES_CACHE_TTL": "5",
    }
    with patch.dict(os.environ, env, clear=False):
        yield


@pytest.fixture(autouse=True)
def _patch_google_auth():
    """Prevent any real GCP auth from happening."""
    mock_creds = MagicMock()
    mock_creds.token = "fake-token-for-tests"
    mock_creds.valid = True
    with patch(
        "google.oauth2.service_account.Credentials.from_service_account_file",
        return_value=mock_creds,
    ):
        yield


@pytest.fixture()
def client(_set_env, _patch_google_auth):
    """FastAPI TestClient — lazy-imported so env patches take effect first."""
    from fastapi.testclient import TestClient
    import main
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# Reusable mock GCP responses (marketing analytics domain)
# ---------------------------------------------------------------------------
@pytest.fixture()
def mock_gcp_chat_response():
    """Standard response: human-readable text about campaign spend."""
    return {
        "contents": [
            {
                "textType": "FINAL_RESPONSE",
                "parts": [
                    "The total ad spend across all channels in Q1 2025 was $1,245,300. "
                    "Google Ads accounted for 45% ($560,385), Meta Ads 30% ($373,590), "
                    "and the remaining 25% was split across LinkedIn, TikTok, and Display."
                ],
            }
        ],
    }


@pytest.fixture()
def mock_gcp_chat_response_with_sql():
    """Response containing both SQL and a FINAL_RESPONSE text block."""
    return {
        "contents": [
            {
                "textType": "SQL_QUERY",
                "parts": [
                    "SELECT channel, SUM(spend) AS total_spend "
                    "FROM `mktg-prod.campaign_performance.ad_spend` "
                    "WHERE date BETWEEN '2025-01-01' AND '2025-03-31' "
                    "GROUP BY channel ORDER BY total_spend DESC;"
                ],
            },
            {
                "textType": "FINAL_RESPONSE",
                "parts": ["Here is the channel breakdown for Q1 2025."],
            },
        ],
    }


@pytest.fixture()
def mock_gcp_chat_response_with_thought():
    """Response containing THOUGHT (chain-of-thought) and FINAL_RESPONSE."""
    return {
        "contents": [
            {
                "textType": "THOUGHT",
                "parts": [
                    "The user wants Q1 ad spend. I need to query the campaign_performance "
                    "table for date range 2025-01-01 to 2025-03-31 and aggregate by channel."
                ],
            },
            {
                "textType": "FINAL_RESPONSE",
                "parts": [
                    "The total ad spend across all channels in Q1 2025 was $1,245,300."
                ],
            },
        ],
    }


@pytest.fixture()
def mock_vegalite_chart_response():
    """Response with a Vega-Lite bar chart spec fenced inside the answer text."""
    chart_spec = json.dumps({
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "data": {"values": [
            {"channel": "Google", "spend": 560385},
            {"channel": "Meta", "spend": 373590},
        ]},
        "mark": "bar",
        "encoding": {
            "x": {"field": "channel", "type": "nominal"},
            "y": {"field": "spend", "type": "quantitative"},
        },
    })
    return {
        "contents": [
            {
                "textType": "FINAL_RESPONSE",
                "parts": [
                    f"Here is the spend breakdown:\n\n```vega-lite\n{chart_spec}\n```\n\nGoogle Ads led spend."
                ],
            }
        ],
    }


@pytest.fixture()
def valid_chat_body():
    """Valid ChatBody payload for POST /api/chat."""
    return {
        "agent": "projects/mktg-prod/locations/global/dataAgents/test-campaign",
        "message": "What was total ad spend in Q1 2025?",
        "history": [],
        "maxTurns": 6,
    }


@pytest.fixture()
def valid_create_agent_body():
    """Valid CreateAgentBody payload for POST /api/agents."""
    return {
        "id": "q2-campaign-analyst",
        "label": "Q2 Campaign Analyst",
        "dataAnalyticsAgent": {
            "publishedContext": {
                "systemInstruction": "You are a marketing analytics assistant focused on Q2 2025."
            },
            "dataSources": [
                {
                    "bigquery": {
                        "projectId": "mktg-prod",
                        "datasetId": "campaign_performance",
                        "tableId": "ad_spend",
                    }
                }
            ],
        },
    }
