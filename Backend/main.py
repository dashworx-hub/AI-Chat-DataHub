import asyncio
import base64
import json
import os
import re
import secrets
import time
import logging
import threading
from datetime import date
from typing import Dict, Any, List, Optional, Iterable, Tuple

import requests
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Backend root (this file's directory). Used for paths when running from backend/
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Load .env: try repo root (parent of backend/) first, then backend/
load_dotenv(os.path.join(_BACKEND_DIR, "..", ".env"))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

# Resolve GOOGLE_APPLICATION_CREDENTIALS so relative paths work when running from backend/
# Try: 1) as-is (absolute or cwd-relative), 2) relative to backend/, 3) relative to repo root
_key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
if _key_path and not os.path.isabs(_key_path):
    _candidates = [
        os.path.join(_BACKEND_DIR, _key_path),
        os.path.join(_BACKEND_DIR, "..", _key_path),
    ]
    for _c in _candidates:
        if os.path.isfile(_c):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(_c)
            break

# ---- Google Auth (service account) ----
from google.auth.transport.requests import Request as GARequest
from google.oauth2 import service_account

# ====== CONFIG ======
BILLING_PROJECT = os.getenv("CA_BILLING_PROJECT")
if not BILLING_PROJECT:
    raise RuntimeError("CA_BILLING_PROJECT is not set in .env")

LOCATION = os.getenv("CA_LOCATION", "global")
SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
CA_BASE = "https://geminidataanalytics.googleapis.com"
BQ_API = "https://bigquery.googleapis.com/bigquery/v2"
CRM_API = "https://cloudresourcemanager.googleapis.com/v1"

PROFILES_PATH = os.getenv("CA_PROFILES_PATH", os.path.join(_BACKEND_DIR, "ca_profiles.json"))
if not os.path.exists(PROFILES_PATH):
    raise RuntimeError(f"Profiles file not found at {PROFILES_PATH}")

with open(PROFILES_PATH, "r") as f:
    PROFILES: Dict[str, Dict[str, Any]] = json.load(f)

# Load agent labels mapping (custom labels for both local and GCP agents)
AGENT_LABELS_PATH = os.path.join(_BACKEND_DIR, "agent_labels.json")
AGENT_LABELS: Dict[str, str] = {}

# Persisted set of all agent IDs ever created (never reuse, even after delete)
USED_AGENT_IDS_PATH = os.path.join(_BACKEND_DIR, "used_agent_ids.json")
USED_AGENT_IDS: set = set()
# Per-agent currency (code, symbol, name) for chat prompt injection
AGENT_CURRENCIES_PATH = os.path.join(_BACKEND_DIR, "agent_currencies.json")
AGENT_CURRENCIES: Dict[str, Dict[str, str]] = {}
if os.path.exists(AGENT_LABELS_PATH):
    try:
        with open(AGENT_LABELS_PATH, "r") as f:
            AGENT_LABELS = json.load(f)
    except Exception as e:
        logger.warning(f"Failed to load agent_labels.json: {e}, starting with empty labels")
else:
    # Create empty file if it doesn't exist
    try:
        with open(AGENT_LABELS_PATH, "w") as f:
            json.dump({}, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to create agent_labels.json: {e}")

if os.path.exists(AGENT_CURRENCIES_PATH):
    try:
        with open(AGENT_CURRENCIES_PATH, "r") as f:
            AGENT_CURRENCIES.update(json.load(f))
    except Exception as e:
        logger.warning(f"Failed to load agent_currencies.json: {e}")
else:
    try:
        with open(AGENT_CURRENCIES_PATH, "w") as f:
            json.dump({}, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to create agent_currencies.json: {e}")

if os.path.exists(USED_AGENT_IDS_PATH):
    try:
        with open(USED_AGENT_IDS_PATH, "r") as f:
            data = json.load(f)
            USED_AGENT_IDS.update(data if isinstance(data, list) else [])
    except Exception as e:
        logger.warning(f"Failed to load used_agent_ids.json: {e}")
else:
    try:
        with open(USED_AGENT_IDS_PATH, "w") as f:
            json.dump([], f)
    except Exception as e:
        logger.warning(f"Failed to create used_agent_ids.json: {e}")


def _persist_used_agent_id(agent_id: str) -> None:
    """Add agent_id to used set and persist to file."""
    USED_AGENT_IDS.add(agent_id)
    try:
        with open(USED_AGENT_IDS_PATH, "w") as f:
            json.dump(sorted(USED_AGENT_IDS), f)
    except Exception as e:
        logger.warning(f"Failed to persist used_agent_ids: {e}")


def _get_agent_currency(agent_id: str) -> Optional[Dict[str, Any]]:
    """Return stored currency for agent (code, symbol, name) or None."""
    if not agent_id:
        return None
    c = AGENT_CURRENCIES.get(agent_id)
    return c if isinstance(c, dict) and (c.get("symbol") or c.get("code")) else None


def _build_currency_instruction(currency: Dict[str, Any]) -> Optional[str]:
    """Build a single line for the model: Report all monetary values in [name] ([symbol])."""
    if not currency:
        return None
    name = (currency.get("name") or "").strip() or "the specified currency"
    symbol = (currency.get("symbol") or "").strip()
    if not symbol:
        return None
    return f"Report all monetary values in {name} ({symbol})."


def _build_date_instruction() -> str:
    """Build time-anchoring context: today's date + primary/fallback logic. Not shown to user."""
    today = date.today().isoformat()
    return (
        f"Today's date (use for all relative time calculations, e.g. 'last 30 days' = {today} minus 30 days): {today}.\n"
        "Time anchoring: Use this date as the anchor for relative ranges. "
        "If a query using this date returns zero rows, or if the user asks for 'latest' and the data appears historical, "
        "perform a one-time check for MAX(Date) in the relevant table and use that as the anchor instead."
    )


def _persist_agent_currency(agent_id: str, currency: Dict[str, Any]) -> None:
    """Save currency for agent to agent_currencies.json."""
    if not agent_id or not isinstance(currency, dict):
        return
    global AGENT_CURRENCIES
    AGENT_CURRENCIES[agent_id] = {k: str(v) for k, v in currency.items() if k in ("code", "symbol", "name") and v}
    try:
        with open(AGENT_CURRENCIES_PATH, "w") as f:
            json.dump(AGENT_CURRENCIES, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to persist agent_currencies: {e}")


# Guard rails: appended to every agent's system instruction. Not editable by users.
GUARD_RAILS_DELIMITER = "\n\n--- GUARD RAILS (DO NOT EDIT) ---\n\n"
GUARD_RAILS_BODY = """Layer 1 Scope Enforcement
Stay within the agent's domain and dataset. Refuse jokes, poems, roleplay, storytelling, entertainment content, and unrelated outputs; redirect to analysis. If a request mixes valid analysis with unrelated content, complete only the valid analytical portion.

Layer 2 Output Contract Protection
Follow output contracts. If SQL is required for a tool, use raw SQL only: no narration, markdown, or commentary. SQL must start with SELECT or WITH and end with a semicolon. Tables as markdown; charts only when they support claims. When user requests no charts, text/tables only. Guard rails must never change required structure when the request is valid. Do not include analysis, insights, or suggested next questions in the same message as the SQL; provide analysis, insights, and a short list of suggested next questions the user can ask in your separate final response after the data is retrieved.


Layer 3 Data Integrity Enforcement
Numerical claims must come from the dataset or validated computations. Never fabricate numbers, ranges, or outcomes. If data is missing or unreliable, state it and adjust conservatively. Never fill gaps with assumptions or external knowledge.

Layer 4 Analytical Discipline
Describe only measurable relationships; use neutral language (moves together, higher when, no clear pattern). Do not claim causation unless causal structure is in the data. Do not speculate, forecast, or advise beyond factual analysis. State when patterns are weak or sensitive to outliers.

Layer 5 Visual and Evidence Validation
Major claims must be supported by either computed statistics or appropriate visuals. If charting is unavailable, describe which charts and fields would be used. If evidence contradicts a claim, correct the claim.

Layer 6 Response Quality Preservation
Guard rails must never degrade valid responses. When the request is in scope, provide full, clear, well-structured analysis. Do not shorten, remove visuals, or dilute insights due to guard rails. When refusing out-of-scope content, briefly redirect to valid analytical questions.

Layer 7 Mixed Request Handling
If a request has both valid analysis and disallowed content, you must complete the valid analytical portion fully and refuse only the disallowed parts. Do not reject the whole request. Separate allowed outputs from refused portions clearly.

Analytical Rules
TIME FILTERING PROTOCOL:
Anchor Usage: Always use the provided Primary Anchor for relative time questions (e.g., "last 30 days", "MTD") to write your SQL.
SQL Efficiency: Use standard BigQuery date functions like DATE_SUB(anchor_date, INTERVAL 30 DAY) instead of calling CURRENT_DATE() inside the SQL. This ensures the query results match your internal reasoning.
Zero-Row Strategy: If the Primary Anchor results in an empty table, pivot to the Fallback Logic (MAX Date) and update your reasoning.
Communication Silence: Do not explain your date calculations to the user (e.g., do not say "Since today is Feb 26, I am looking at..."). Just provide the final insight. You may still suggest a short list of next questions the user can ask at the end of your response.

INSIGHT-FIRST RESPONSE ORDER (when your final text includes a chart):
Provide your Core Business Insight (the "So What?") at the very beginning of your text response, before the Chart JSON.
Correct order: (1) One sentence of core insight. (2) The Chart JSON block. (3) Detailed breakdown and bullet points."""
GUARD_RAILS = GUARD_RAILS_DELIMITER + GUARD_RAILS_BODY

# SQL instructions: appended to every agent's system instruction. Not editable by users.
SQL_INSTRUCTIONS_DELIMITER = "\n\n--- SQL INSTRUCTIONS (DO NOT EDIT) ---\n\n"
SQL_INSTRUCTIONS_BODY = """ROLE OF SQL
You may generate SQL internally to retrieve data. SQL must be correct, executable, optimised, and safe. Never include SQL in your final answer. The system handles SQL extraction automatically.

1. OUTPUT AND STRUCTURE
One query per request. Start with SELECT or WITH; end with one semicolon. Output only SQL (no markdown, no explanations, no comments unless allowed). WITH must be followed by a final SELECT. Uppercase keywords; consistent indentation; prefer CTE over deep nesting. Do not include analysis, insights, or suggested next questions in the same message as the SQL; provide analysis, insights, and a short list of suggested next questions the user can ask in your separate final response after the data is retrieved.

2. REFERENCES
Full table path: project.dataset.table. Always alias tables; qualify columns when multiple tables. Backticks for identifiers with spaces, reserved words, special characters, or leading numbers.

3. TYPES AND NULLS
Confirm field types before use. Only aggregate numerics; never SUM/AVG booleans or aggregate strings. Use SAFE_CAST when casting; always use SAFE_DIVIDE for division. Treat NULL as unknown. Filter booleans with flag IS TRUE / flag IS FALSE. For flag counts: COUNTIF(flag IS TRUE). For rates: SAFE_DIVIDE(COUNTIF(flag IS TRUE), COUNT(1)).

4. DATES
Use date range filters in WHERE; never wrap date columns in functions in WHERE (e.g. Date >= DATE '2025-01-01' AND Date < DATE '2025-02-01'). Use DATE_TRUNC only in SELECT or CTE.

5. AGGREGATION AND DEDUP
Every non-aggregated column in GROUP BY. COUNT(1) for row counts; COUNT(DISTINCT) or APPROX_COUNT_DISTINCT only when needed. No blind DISTINCT; for dedup use ROW_NUMBER() with QUALIFY. Window functions: use only for rankings, rolling metrics, or dedup; always PARTITION BY and ORDER BY; Top N per group via QUALIFY ROW_NUMBER().

6. JOINS AND PERFORMANCE
Join only when needed; explicit join keys; matching types; INNER when both sides required, LEFT when preserving base; no CROSS JOIN unless required. No SELECT *; select only needed columns. Filter early; filter by date when available; raw date ranges in WHERE. Aggregate before joins when possible; reduce with CTEs. LIMIT on rankings (default 10). Avoid DISTINCT on large tables, unnecessary CROSS JOIN, window on full dataset.

7. DEFAULTS AND VALIDATION
If unspecified: time grain monthly, Top N 10, date range latest complete month, comparison previous month. Before finalising: correct structure, types, GROUP BY, SAFE_DIVIDE, date filters, LIMIT. On error: fix and regenerate; do not repeat. If the dataset cannot support the metric, say so; do not fabricate. Priority: correctness > stability > cost > speed > readability. Non-negotiable: no fabricated fields, no assumed schema, no SELECT *, no text inside SQL, one query only, valid aggregation, no function-wrapped partition filters in WHERE.

EXCEPTION: Step-by-step reasoning via THOUGHT is encouraged and does not violate the no-narration rule."""

SQL_INSTRUCTIONS = SQL_INSTRUCTIONS_DELIMITER + SQL_INSTRUCTIONS_BODY

# Combined instructions: guard rails + SQL instructions (appended to user instructions)
AUTO_APPENDED_INSTRUCTIONS = GUARD_RAILS + SQL_INSTRUCTIONS

# GCP fetching configuration
ENABLE_GCP_FETCH = os.getenv("ENABLE_GCP_SOURCES_FETCH", "true").lower() == "true"
GCP_CACHE_TTL = int(os.getenv("GCP_SOURCES_CACHE_TTL", "300"))  # 5 minutes default
GCP_FETCH_TIMEOUT = int(os.getenv("GCP_SOURCES_FETCH_TIMEOUT", "10"))  # 10 seconds default

# In-memory cache for GCP sources
_gcp_sources_cache: Optional[Dict[str, Any]] = None
_gcp_sources_cache_time: float = 0
_gcp_sources_error: Optional[str] = None

app = FastAPI(title="CA API Backend")

# CORS configuration - restrict for production
# Set ALLOWED_ORIGINS env var to comma-separated list of allowed origins (e.g., "https://example.com,https://app.example.com")
# If not set, defaults to "*" for development only
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",") if os.getenv("ALLOWED_ORIGINS") else ["*"]
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True if ALLOWED_ORIGINS != ["*"] else False,  # Don't allow credentials with wildcard
    allow_methods=["GET", "POST", "PATCH", "DELETE"],  # Restrict to needed methods only
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],  # Restrict headers
    expose_headers=["Content-Type"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Content Security Policy - restrict script sources and prevent inline scripts
        # Allow vega/vega-lite from CDN if needed, but prefer local bundles
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "  # unsafe-eval needed for vega expressions
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://geminidataanalytics.googleapis.com https://bigquery.googleapis.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Content-Security-Policy"] = csp
        # Strict Transport Security (only if HTTPS)
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# --------- Models ----------
class ChatBody(BaseModel):
    profile: Optional[str] = None  # Local profile key (backward compatibility)
    agent: Optional[str] = None  # Full GCP agent resource name (e.g., projects/.../dataAgents/...)
    message: str
    # history items look like: {"role": "user"|"assistant", "content": "text"}
    history: Optional[List[Dict[str, str]]] = None
    maxTurns: Optional[int] = None
    maxTurns: Optional[int] = None

class InstructionPatch(BaseModel):
    instruction: str

class CreateAgentBody(BaseModel):
    id: str  # Agent ID (slug)
    label: str  # Display label
    dataAnalyticsAgent: Dict[str, Any]  # Full agent configuration
    currency: Optional[Dict[str, Any]] = None  # Optional: { "code": "GBP", "symbol": "£", "name": "British Pound" } for prompt injection

# --------- Auth ----------
# Token cache: (token, expires_at_ts). Refresh ~5 min before expiry (GCP tokens ~1h).
_token_cache: Optional[Tuple[str, float]] = None
_token_lock = threading.Lock()
_TOKEN_REFRESH_BUFFER = 300  # seconds before expiry to refresh


def get_access_token() -> str:
    """Mint a bearer token via service account JSON. Caches token until ~5 min before expiry.
    Supports (in order): GOOGLE_CREDENTIALS_JSON_B64, GOOGLE_CREDENTIALS_JSON, GOOGLE_APPLICATION_CREDENTIALS.
    Use B64 on Railway to avoid JSON escaping issues.
    """
    global _token_cache
    now = time.time()
    with _token_lock:
        if _token_cache is not None:
            token, expires_at = _token_cache
            if now < expires_at - _TOKEN_REFRESH_BUFFER:
                return token
        # 1) Base64-encoded JSON (Railway - no escaping issues)
        b64 = os.environ.get("GOOGLE_CREDENTIALS_JSON_B64", "").strip()
        if b64:
            try:
                raw = base64.b64decode(b64).decode("utf-8")
                info = json.loads(raw)
                creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
            except Exception as e:
                raise HTTPException(500, f"GOOGLE_CREDENTIALS_JSON_B64 invalid: {e}")
        else:
            # 2) Raw JSON string
            creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON", "").strip()
            if creds_json:
                try:
                    info = json.loads(creds_json)
                    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
                except json.JSONDecodeError as e:
                    raise HTTPException(500, f"GOOGLE_CREDENTIALS_JSON invalid JSON: {e}")
            else:
                # 3) File path (local dev)
                key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
                if not key_path:
                    raise HTTPException(
                        500,
                        "Set GOOGLE_CREDENTIALS_JSON_B64 (Railway) or GOOGLE_APPLICATION_CREDENTIALS (local file path)."
                    )
                if not os.path.isfile(key_path):
                    raise HTTPException(500, f"GOOGLE_APPLICATION_CREDENTIALS file not found: {key_path}")
                creds = service_account.Credentials.from_service_account_file(key_path, scopes=SCOPES)
        creds.refresh(GARequest())
        token = creds.token
        expires_at = now + 3500
        _token_cache = (token, expires_at)
        return token

# --------- Generic extractors (schema-agnostic) ----------
_SQL_SNIPPET = re.compile(r"\b(SELECT|WITH)\b[\s\S]{10,}", re.IGNORECASE)
_TABLE_FQN = re.compile(r"(?:`)?([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)(?:`)?")
FENCED_BLOCK_RE = re.compile(r"```([a-zA-Z0-9_-]*)\n([\s\S]*?)```", re.MULTILINE)

def _walk(obj: Any, path: Tuple = ()) -> Iterable[Tuple[Tuple, Any]]:
    """Yield (path, value) pairs for every node in a nested structure."""
    yield path, obj
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk(v, path + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk(v, path + (i,))

def _all_strings(obj: Any) -> List[str]:
    return [v for _, v in _walk(obj) if isinstance(v, str)]

def _looks_like_sql_text(s: str) -> bool:
    """Heuristic to detect SQL-y answers and keep them out of the main 'answer' field."""
    s0 = s.strip().upper()
    if s0.startswith(("SELECT", "WITH", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "MERGE")):
        return True
    kw = sum(k in s0 for k in (" SELECT ", " FROM ", " JOIN ", " WHERE ", " GROUP BY ", " ORDER BY ", " WITH "))
    return kw >= 3


def _format_followup_questions_as_list(text: str) -> str:
    """
    Convert 'Follow-up Questions' / 'Suggested Questions' paragraph into markdown bullet list.
    Input: "Follow-up Questions\nQ1? Q2? Q3?" -> "Follow-up Questions\n- Q1?\n- Q2?\n- Q3?"
    """
    if not text or not isinstance(text, str):
        return text
    # Match heading (case-insensitive) followed by content
    m = re.search(
        r"((?:Follow[- ]?up|Suggested)\s+Questions)\s*:?\s*(.+?)(?=\n\n|\n##|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return text
    heading, content = m.group(1), m.group(2).strip()
    # Split on "? " (question mark + whitespace); each segment + "?" is one question
    raw_parts = re.split(r"\?\s+", content)
    questions = []
    for p in raw_parts:
        p = p.strip()
        # Strip any leading bullet chars so we don't get "- - Question" (double bullet)
        p = re.sub(r"^[-*•]\s*", "", p).strip()
        if not p:
            continue
        questions.append(f"- {p}?" if not p.endswith("?") else f"- {p}")
    if len(questions) < 2:
        return text
    replacement = f"{heading}\n\n" + "\n".join(questions)
    return text[: m.start()] + replacement + text[m.end() :]


def _best_text(obj: Any) -> Optional[str]:
    """
    Prefer FINAL_RESPONSE; collect ALL such blocks and concatenate (summary + analysis).
    Falls back to longest non-SQL natural text if no FINAL_RESPONSE.
    """
    final_parts: List[str] = []
    for _, node in _walk(obj):
        if isinstance(node, dict):
            tt = node.get("textType")
            parts = node.get("parts")
            if isinstance(tt, str) and tt.upper() == "FINAL_RESPONSE" and isinstance(parts, list):
                joined = "\n".join([p for p in parts if isinstance(p, str)]).strip()
                if joined and not _looks_like_sql_text(joined):
                    final_parts.append(joined)
    if final_parts:
        return "\n\n".join(final_parts)

    strings = _all_strings(obj)
    if not strings:
        return None

    # Prefer multi-sentence non-SQL text
    def score(s: str) -> int:
        return (s.count(".") + s.count("\n")) * 1000 + len(s)

    non_sql = [s for s in strings if not _looks_like_sql_text(s)]
    if non_sql:
        non_sql.sort(key=score, reverse=True)
        return non_sql[0].strip()

    # If all looked like SQL, pick the longest anyway
    strings.sort(key=score, reverse=True)
    return strings[0].strip()

def _to_narrative_cot(label: str, content: str) -> str:
    """Convert structured step into Google-like narrative: 'I am doing... I am generating...'"""
    c = content.strip()
    if not c:
        return ""
    narrative = {
        "Schema resolution (question)": f"I'm resolving the schema and identifying relevant data sources for your question.\n\n{c}",
        "Resolved schema for": f"I've identified the relevant tables: {c}",
        "Analysis query": f"I'm generating the analysis query to answer your question.\n\n{c}",
        "Chart instructions": f"I'm creating the visualization with these instructions.\n\n{c}",
        "Analysis question": f"I'm analyzing the data to answer: {c}",
        "Planner reasoning": f"I'm planning the approach.\n\n{c}",
        "Coder instruction": f"I'm preparing the code instructions.\n\n{c}",
        "Code": f"I'm generating the code.\n\n{c}",
    }
    return narrative.get(label, f"{label}\n\n{c}")


def _extract_chain_of_thought(obj: Any) -> Optional[str]:
    """
    Extract chain-of-thought / reasoning from the CA API response.
    CA API returns an array of Message objects; each has userMessage or systemMessage.
    systemMessage has union: text, schema, data, chart, analysis, error, exampleQueries.
    Build CoT in narrative style ('I am doing... I am generating...') like Google.
    """
    thoughts = []

    def _add_step(step_num: int, label: str, content: str) -> None:
        if content and content.strip():
            # Reasoning/Progress from model may already be narrative; pass through
            if label in ("Reasoning", "Progress"):
                thoughts.append(content.strip())
            else:
                thoughts.append(_to_narrative_cot(label, content))

    messages = obj
    if isinstance(obj, dict):
        messages = obj.get("messages") or obj.get("contents") or obj.get("chunks") or []
    if not isinstance(messages, list):
        messages = [obj] if isinstance(obj, dict) else []

    if messages:
        step = 1
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            sm = msg.get("systemMessage") or msg.get("system_message")
            if not isinstance(sm, dict):
                continue
            # TextMessage with THOUGHT or PROGRESS
            text_block = sm.get("text")
            if isinstance(text_block, dict):
                tt = text_block.get("textType") or text_block.get("text_type")
                if tt in ("THOUGHT", "PROGRESS", 2, 3):
                    t = text_block.get("text") or ""
                    if not t and isinstance(text_block.get("parts"), list):
                        t = "\n".join(p for p in text_block["parts"] if isinstance(p, str)).strip()
                    if t:
                        _add_step(step, "Reasoning" if tt in ("THOUGHT", 2) else "Progress", t)
                        step += 1
            # SchemaMessage
            schema_block = sm.get("schema")
            if isinstance(schema_block, dict):
                q = schema_block.get("query", {})
                if isinstance(q, dict):
                    question = q.get("question")
                    if isinstance(question, str) and question.strip():
                        _add_step(step, "Schema resolution (question)", question)
                        step += 1
                res = schema_block.get("result", {})
                if isinstance(res, dict):
                    ds = res.get("datasources") or []
                    if isinstance(ds, list) and ds:
                        tables = []
                        for d in ds:
                            if isinstance(d, dict):
                                bq = d.get("bigqueryTableReference") or d.get("bigQueryTableReference") or {}
                                if isinstance(bq, dict):
                                    pid = bq.get("projectId", "")
                                    did = bq.get("datasetId", "")
                                    tid = bq.get("tableId", "")
                                    if pid and did and tid:
                                        tables.append(f"{pid}.{did}.{tid}")
                        if tables:
                            _add_step(step, "Resolved schema for", ", ".join(tables))
                            step += 1
            # DataMessage (omit Generated SQL - users see it in the SQL panel)
            data_block = sm.get("data")
            if isinstance(data_block, dict):
                q = data_block.get("query", {})
                if isinstance(q, dict):
                    question = q.get("question")
                    if isinstance(question, str) and question.strip():
                        _add_step(step, "Analysis query", question)
                        step += 1
            # ChartMessage
            chart_block = sm.get("chart")
            if isinstance(chart_block, dict):
                q = chart_block.get("query", {})
                if isinstance(q, dict):
                    inst = q.get("instructions")
                    if isinstance(inst, str) and inst.strip():
                        _add_step(step, "Chart instructions", inst)
                        step += 1
            # AnalysisMessage (plannerReasoning, coderInstruction, code, etc.)
            analysis_block = sm.get("analysis")
            if isinstance(analysis_block, dict):
                aq = analysis_block.get("query", {})
                if isinstance(aq, dict):
                    question = aq.get("question")
                    if isinstance(question, str) and question.strip():
                        _add_step(step, "Analysis question", question)
                        step += 1
                ev = analysis_block.get("progressEvent", {})
                if isinstance(ev, dict):
                    for key in ("plannerReasoning", "coderInstruction", "code"):
                        val = ev.get(key)
                        if isinstance(val, str) and val.strip():
                            _add_step(step, key.replace("plannerReasoning", "Planner reasoning").replace("coderInstruction", "Coder instruction").replace("code", "Code"), val)
                            step += 1
        if messages and not thoughts:
            first_keys = list(messages[0].keys()) if messages and isinstance(messages[0], dict) else []
            logger.warning("CoT: messages present (%d) but no steps extracted; first msg keys: %s", len(messages), first_keys)

    if thoughts:
        cot_text = "\n\n".join(thoughts)
        logger.info("CoT extracted: %d steps, %d chars", len(thoughts), len(cot_text))
        return cot_text

    text_types_seen = []

    def _get_text_from_node(node: dict) -> Optional[str]:
        parts = node.get("parts", [])
        text_str = node.get("text")
        if isinstance(text_str, str) and text_str.strip():
            return text_str.strip()
        if isinstance(parts, list):
            joined = "\n".join([p for p in parts if isinstance(p, str)]).strip()
            if joined:
                return joined
        return None

    for _, node in _walk(obj):
        if isinstance(node, dict):
            tt = node.get("textType") or node.get("text_type")
            if tt is not None:
                text_types_seen.append(str(tt))
            if isinstance(tt, str) and tt.upper() == "THOUGHT":
                t = _get_text_from_node(node)
                if t:
                    thoughts.append(t)
            elif isinstance(tt, int) and tt == 2:
                t = _get_text_from_node(node)
                if t:
                    thoughts.append(t)
            thought_val = node.get("thought")
            if isinstance(thought_val, str) and thought_val.strip():
                thoughts.append(thought_val.strip())
            elif isinstance(thought_val, dict):
                t = _get_text_from_node(thought_val)
                if t:
                    thoughts.append(t)
            gmd = node.get("groundingMetadata") or node.get("grounding_metadata")
            if isinstance(gmd, dict):
                gchunks = gmd.get("groundingChunks") or gmd.get("grounding_chunks")
                if isinstance(gchunks, list):
                    for gc in gchunks:
                        if isinstance(gc, dict):
                            t = _get_text_from_node(gc)
                            if t:
                                thoughts.append(t)
                        elif isinstance(gc, str) and gc.strip():
                            thoughts.append(gc.strip())

    if not thoughts:
        if text_types_seen:
            logger.warning("CoT: no THOUGHT found; textTypes in response: %s", text_types_seen)
        else:
            top_keys = list(obj.keys()) if isinstance(obj, dict) else f"<{type(obj).__name__}>"
            logger.warning("CoT: no textType nodes found; result top-level keys: %s", top_keys)
    return "\n\n".join(thoughts) if thoughts else None


def _extract_raw_error(obj: Any) -> Optional[str]:
    """
    Extract the exact error from CA API response if present.
    CA API can return systemMessage with an 'error' block (e.g. from BigQuery schema/query failures).
    Returns a single string for display, or None if no error block found.
    """
    messages = obj
    if isinstance(obj, dict):
        messages = obj.get("messages") or obj.get("contents") or obj.get("chunks") or []
    if not isinstance(messages, list):
        return None
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        sm = msg.get("systemMessage") or msg.get("system_message")
        if not isinstance(sm, dict):
            continue
        err = sm.get("error")
        if err is None:
            continue
        if isinstance(err, str) and err.strip():
            return err.strip()
        if isinstance(err, dict):
            # Prefer message, then detail, then code+message
            text = err.get("message") or err.get("detail") or err.get("error")
            if isinstance(text, str) and text.strip():
                return text.strip()
            if err:
                return json.dumps(err, indent=2)
    return None


def _extract_cot_step_from_message(msg: Dict[str, Any]) -> Optional[Tuple[str, str]]:
    """
    Extract a single CoT step from one CA API Message for live streaming.
    Returns (label, content) or None. Caller assigns step numbers.
    """
    if not isinstance(msg, dict):
        return None
    sm = msg.get("systemMessage") or msg.get("system_message")
    if not isinstance(sm, dict):
        return None

    # TextMessage with THOUGHT or PROGRESS
    text_block = sm.get("text")
    if isinstance(text_block, dict):
        tt = text_block.get("textType") or text_block.get("text_type")
        if tt in ("THOUGHT", "PROGRESS", 2, 3):
            t = text_block.get("text") or ""
            if not t and isinstance(text_block.get("parts"), list):
                t = "\n".join(p for p in text_block["parts"] if isinstance(p, str)).strip()
            if t:
                return ("Reasoning" if tt in ("THOUGHT", 2) else "Progress", t)

    # SchemaMessage
    schema_block = sm.get("schema")
    if isinstance(schema_block, dict):
        q = schema_block.get("query", {})
        if isinstance(q, dict):
            question = q.get("question")
            if isinstance(question, str) and question.strip():
                return ("Schema resolution (question)", question.strip())
        res = schema_block.get("result", {})
        if isinstance(res, dict):
            ds = res.get("datasources") or []
            if isinstance(ds, list) and ds:
                tables = []
                for d in ds:
                    if isinstance(d, dict):
                        bq = d.get("bigqueryTableReference") or d.get("bigQueryTableReference") or {}
                        if isinstance(bq, dict):
                            pid = bq.get("projectId", "")
                            did = bq.get("datasetId", "")
                            tid = bq.get("tableId", "")
                            if pid and did and tid:
                                tables.append(f"{pid}.{did}.{tid}")
                if tables:
                    return ("Resolved schema for", ", ".join(tables))

    # DataMessage
    data_block = sm.get("data")
    if isinstance(data_block, dict):
        q = data_block.get("query", {})
        if isinstance(q, dict):
                question = q.get("question")
                if isinstance(question, str) and question.strip():
                    return ("Analysis query", question.strip())
        # Omit Generated SQL from live CoT - users see it in the SQL panel instead

    # ChartMessage
    chart_block = sm.get("chart")
    if isinstance(chart_block, dict):
        q = chart_block.get("query", {})
        if isinstance(q, dict):
            inst = q.get("instructions")
            if isinstance(inst, str) and inst.strip():
                return ("Chart instructions", inst.strip())

    # AnalysisMessage
    analysis_block = sm.get("analysis")
    if isinstance(analysis_block, dict):
        aq = analysis_block.get("query", {})
        if isinstance(aq, dict):
            question = aq.get("question")
            if isinstance(question, str) and question.strip():
                return ("Analysis question", question.strip())
        ev = analysis_block.get("progressEvent", {})
        if isinstance(ev, dict):
            for key, label in (
                ("plannerReasoning", "Planner reasoning"),
                ("coderInstruction", "Coder instruction"),
                ("code", "Code"),
            ):
                val = ev.get(key)
                if isinstance(val, str) and val.strip():
                    return (label, val.strip())
    return None


def _find_sql_snippets(obj: Any) -> List[str]:
    """Find likely SQL segments anywhere in the structure."""
    found = []
    for s in _all_strings(obj):
        m = _SQL_SNIPPET.search(s)
        if m:
            snippet = s[m.start():]
            cut = snippet.split(";", 2)
            snippet = ";".join(cut[:2]) + (";" if len(cut) > 1 else "")
            found.append(snippet.strip())
    # de-dup preserve order
    seen, uniq = set(), []
    for t in found:
        if t not in seen:
            uniq.append(t); seen.add(t)
    return uniq

def _find_table_refs(obj: Any) -> List[str]:
    """Extract project.dataset.table patterns from any string."""
    refs = []
    for s in _all_strings(obj):
        for m in _TABLE_FQN.finditer(s):
            refs.append(".".join(m.groups()))
    # de-dup preserve order
    seen, uniq = set(), []
    for r in refs:
        if r not in seen:
            uniq.append(r); seen.add(r)
    return uniq

def _looks_like_job_dict(d: Dict[str, Any]) -> bool:
    """Loose heuristic for job-ish objects (no fixed field names)."""
    if not isinstance(d, dict): return False
    text = " ".join(map(str, d.keys())).lower()
    return ("job" in text or "task" in text) and any(isinstance(v, (str, int)) for v in d.values())

def _find_jobs(obj: Any) -> List[Dict[str, Any]]:
    jobs = []
    for _, node in _walk(obj):
        if isinstance(node, dict) and _looks_like_job_dict(node):
            jobs.append(node)
    return jobs[:3]

def _first_tabular_rows(obj: Any) -> Optional[List[Dict[str, Any]]]:
    """Find the first list that looks like rows of simple dicts (no hardcoded keys)."""
    for _, node in _walk(obj):
        if isinstance(node, list) and node and all(isinstance(r, dict) for r in node):
            rows: List[Dict[str, Any]] = []
            simple = True
            for r in node[:50]:
                flat = {k: v for k, v in r.items() if isinstance(v, (str, int, float, type(None)))}
                if not flat:
                    simple = False
                    break
                rows.append(flat)
            if simple and rows:
                return rows
    return None

def _bullets_from_first_row(rows: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    """Generic bullet summary from the first tabular row (schema-agnostic)."""
    if not rows or not isinstance(rows, list) or not rows:
        return None
    row = rows[0]
    if not isinstance(row, dict) or not row:
        return None
    lines = ["Summary from first result row:"]
    for k, v in row.items():
        if isinstance(v, (str, int, float)) or v is None:
            vv = "" if v is None else str(v)
            lines.append(f"- {k}: {vv}")
    return "\n".join(lines) if len(lines) > 1 else None

# ---------------------- Chart extraction ----------------------
def _looks_like_vegalite_spec(obj: Any) -> bool:
    """Heuristic: vega-lite if $schema mentions vega-lite OR (data & encoding & mark present)."""
    if not isinstance(obj, dict):
        return False
    schema = str(obj.get("$schema", "")).lower()
    if "vega-lite" in schema:
        return True
    return all(k in obj for k in ("data", "encoding", "mark"))

def _normalize_vegalite_spec(spec: Dict[str, Any]) -> Dict[str, Any]:
    """Add a couple sane defaults for rendering."""
    if "$schema" not in spec:
        spec["$schema"] = "https://vega.github.io/schema/vega-lite/v5.json"
    spec.setdefault("width", "container")
    spec.setdefault("height", 260)
    return spec

def _extract_fenced_vegalite(answer_text: str) -> Tuple[List[Dict[str, Any]], List[Tuple[int, int]]]:
    """Get vega-lite specs from fenced blocks; return specs and spans to remove."""
    charts: List[Dict[str, Any]] = []
    spans: List[Tuple[int, int]] = []
    if not isinstance(answer_text, str):
        return charts, spans

    for m in FENCED_BLOCK_RE.finditer(answer_text):
        lang = (m.group(1) or "").strip().lower()
        code = m.group(2).strip()
        if lang in ("vega-lite", "json", "vega", ""):
            try:
                spec = json.loads(code)
                if _looks_like_vegalite_spec(spec):
                    charts.append(_normalize_vegalite_spec(spec))
                    spans.append(m.span())
            except Exception:
                pass
    return charts, spans

def _extract_json_blobs(answer_text: str) -> List[Tuple[str, Tuple[int, int]]]:
    """
    Scan the answer for balanced-JSON substrings (not only paragraph-delimited).
    Returns list of (json_string, (start,end)) for candidates.
    """
    s = answer_text
    n = len(s)
    out: List[Tuple[str, Tuple[int, int]]] = []
    i = 0
    while i < n:
        # find a '{'
        start = s.find("{", i)
        if start == -1:
            break
        # stack-based scan to find matching '}'
        depth = 0
        j = start
        in_str = False
        esc = False
        while j < n:
            ch = s[j]
            if in_str:
                if esc:
                    esc = False
                elif ch == '\\':
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        # candidate substring
                        cand = s[start:j+1]
                        if 2 <= len(cand) <= 200_000:
                            out.append((cand, (start, j+1)))
                        i = j + 1
                        break
            j += 1
        else:
            # no closing brace found
            break
        i = max(i, start + 1)
    return out

REASONING_BLOCK_RE = re.compile(
    r"(?is)\n?---\s*reasoning\s*---.*?---\s*end reasoning\s*---\n?"
)

def _strip_reasoning_block(text: str) -> str:
    """
    Remove the explicit reasoning section from model output, if present.

    We only strip content wrapped in:
      ---REASONING--- ... ---END REASONING---
    """
    if not isinstance(text, str) or not text:
        return str(text or "")
    return REASONING_BLOCK_RE.sub("", text).strip()

def _extract_chart_instructions_from_result(obj: Any) -> List[str]:
    """Extract chart.query.instructions from CA API message array. Used to strip from main answer."""
    instructions = []
    if isinstance(obj, list):
        for msg in obj:
            if not isinstance(msg, dict):
                continue
            sm = msg.get("systemMessage") or msg.get("system_message")
            if not isinstance(sm, dict):
                continue
            chart_block = sm.get("chart")
            if isinstance(chart_block, dict):
                q = chart_block.get("query", {})
                if isinstance(q, dict):
                    inst = q.get("instructions")
                    if isinstance(inst, str) and inst.strip():
                        instructions.append(inst.strip())
    return instructions

def _strip_chart_instructions(text: str, instructions: List[str]) -> str:
    """Remove chart instruction text from answer so it only appears in CoT accordion."""
    if not text or not instructions:
        return text
    result = text
    for inst in instructions:
        if inst and inst in result:
            result = result.replace(inst, "").strip()
            result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()

def extract_charts_and_clean(answer_text: str, full_result: Any) -> Tuple[List[Dict[str, Any]], str]:
    """
    Collect charts from:
      (A) fenced blocks in the answer,
      (B) any balanced-JSON substrings in the answer that look like Vega-Lite,
      (C) anywhere inside the full API result (walk the object and pick dicts that look like Vega-Lite).
    Remove only the blocks found in the answer from the visible text.
    """
    if not isinstance(answer_text, str):
        answer_text = str(answer_text or "")

    charts: List[Dict[str, Any]] = []
    remove_spans: List[Tuple[int, int]] = []

    # (A) fenced
    fenced_specs, spans = _extract_fenced_vegalite(answer_text)
    charts.extend(fenced_specs)
    remove_spans.extend(spans)

    # Temporarily remove fenced spans to avoid double-detection
    tmp = []
    last = 0
    for s0, s1 in sorted(remove_spans):
        tmp.append(answer_text[last:s0])
        last = s1
    tmp.append(answer_text[last:])
    text_wo_fenced = "".join(tmp)

    # (B) balanced-JSON scan on remaining text
    for cand, (s0, s1) in _extract_json_blobs(text_wo_fenced):
        try:
            obj = json.loads(cand)
            if _looks_like_vegalite_spec(obj):
                charts.append(_normalize_vegalite_spec(obj))
                # map span back to original indexes by reconstructing index
                # We recompute positions in the original text conservatively:
                # find the first occurrence of cand inside answer_text and remove that slice.
                pos = answer_text.find(cand)
                if pos != -1:
                    remove_spans.append((pos, pos + len(cand)))
        except Exception:
            pass

    # (C) search the entire result object for embedded specs
    for _, node in _walk(full_result):
        if isinstance(node, dict) and _looks_like_vegalite_spec(node):
            charts.append(_normalize_vegalite_spec(node))

    # de-dup charts (by JSON string) while preserving order
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for c in charts:
        key = json.dumps(c, sort_keys=True)
        if key not in seen:
            deduped.append(c)
            seen.add(key)
    charts = deduped

    # Build cleaned answer (remove spans from original text)
    cleaned_parts: List[str] = []
    last = 0
    for s0, s1 in sorted(remove_spans):
        cleaned_parts.append(answer_text[last:s0])
        last = s1
    cleaned_parts.append(answer_text[last:])
    cleaned_answer = _strip_reasoning_block("".join(cleaned_parts).strip())

    # Strip chart instructions (e.g. "Generate a line chart showing...") so they only appear in CoT accordion
    chart_instructions = _extract_chart_instructions_from_result(full_result)
    cleaned_answer = _strip_chart_instructions(cleaned_answer, chart_instructions)

    return charts, cleaned_answer

# --------- History cleaner (reduces prompt size for faster prefill) ----------
_MAX_HISTORY_CONTENT_CHARS = 2000
_SQL_FENCED_RE = re.compile(r"```(?:sql)?\s*\n([\s\S]*?)```", re.IGNORECASE | re.MULTILINE)
_CHART_LANG_RE = re.compile(r"```(?:vega-lite|json|vega)\s*\n([\s\S]*?)```", re.IGNORECASE | re.MULTILINE)
_MARKDOWN_TABLE_RE = re.compile(r"(\|[^\n]+\|\n(?:\|[\s\-:|]+\|\n)?(?:\|[^\n]+\|\n)*)", re.MULTILINE)


def _clean_history_content(content: str, role: str) -> str:
    """
    Strip SQL, chart JSON, and truncate long content from history before including in prompt.
    Reduces prompt size for faster prefill; preserves semantic context (prose, insights).
    Only applied when building the prompt; does not modify stored history.
    """
    if not content or not isinstance(content, str):
        return content
    s = content.strip()
    if not s:
        return s
    # Only clean assistant content (user messages are usually short)
    if role and str(role).lower() != "assistant":
        return s

    # 1) Replace fenced SQL blocks with placeholder
    s = _SQL_FENCED_RE.sub("\n(SQL omitted)\n", s)
    # 2) Replace fenced chart JSON blocks with placeholder
    s = _CHART_LANG_RE.sub("\n(Chart omitted)\n", s)
    # 3) Truncate very long markdown tables
    def _shorten_table(m: re.Match) -> str:
        block = m.group(1)
        lines = block.strip().split("\n")
        if len(lines) > 12 or len(block) > 600:
            return "\n(Table omitted)\n"
        return block
    s = _MARKDOWN_TABLE_RE.sub(_shorten_table, s)
    # 4) Cap total length per turn
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    if len(s) > _MAX_HISTORY_CONTENT_CHARS:
        s = s[:_MAX_HISTORY_CONTENT_CHARS].rsplit("\n", 1)[0] + "\n\n… (truncated for context)"
    return s.strip()

# --------- Multi-turn prompt builder ----------
def _build_prompt_with_history(
    message: str,
    history: Optional[List[Dict[str, str]]],
    max_turns: int = 3,
    currency_instruction: Optional[str] = None,
    date_instruction: Optional[str] = None,
) -> str:
    """
    Build a compact conversational context from the last N turns and append the current user question.
    If currency_instruction is provided (e.g. "Report all monetary values in British pounds (£)."),
    it is prepended so the model uses that currency in the response.
    If date_instruction is provided (today's date + time-anchoring logic), it is prepended first so the model uses it for relative time.
    """
    base = message.strip()
    if history:
        tail = [h for h in history if isinstance(h, dict) and "role" in h and "content" in h][-max_turns:]
        lines = ["Context from previous conversation:"]
        for t in tail:
            role = "User" if t["role"].lower() == "user" else "Assistant"
            raw_content = str(t["content"]).strip()
            content = _clean_history_content(raw_content, t.get("role", "")) if raw_content else ""
            if content:
                lines.append(f"{role}: {content}")
        lines.append("")
        lines.append(f"User: {base}")
        lines.append("Assistant:")
        base = "\n".join(lines).strip()
    if date_instruction and date_instruction.strip():
        base = f"{date_instruction.strip()}\n\n{base}"
    if currency_instruction and currency_instruction.strip():
        base = f"{currency_instruction.strip()}\n\n{base}"
    return base

# --------- Helpers for Google API ---------
def ga_headers() -> Dict[str, str]:
    """Get headers for Google API requests."""
    token = get_access_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "x-goog-user-project": BILLING_PROJECT,
        "x-server-timeout": "600",
    }

def ga_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """GET a resource from Google API (e.g., describe an agent or list agents)."""
    url = f"{CA_BASE}/v1beta/{path}"
    r = requests.get(url, headers=ga_headers(), params=params or {}, timeout=60)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()

def ga_patch(path: str, update_mask: str, payload: Dict[str, Any]) -> Any:
    """PATCH a resource on Google API (e.g., update agent instruction)."""
    url = f"{CA_BASE}/v1beta/{path}?updateMask={update_mask}"
    r = requests.patch(url, headers=ga_headers(), json=payload, timeout=60)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()

def ga_post(path: str, payload: Dict[str, Any], params: Optional[Dict[str, Any]] = None) -> Any:
    """POST to create a resource on Google API (e.g., create an agent)."""
    url = f"{CA_BASE}/v1beta/{path}"
    r = requests.post(url, headers=ga_headers(), json=payload, params=params or {}, timeout=60)
    if r.status_code != 200:
        # Extract detailed error message
        error_detail = r.text
        try:
            error_json = r.json()
            if isinstance(error_json, dict):
                error_obj = error_json.get("error", {})
                if isinstance(error_obj, dict):
                    error_detail = error_obj.get("message", error_detail)
        except:
            pass
        raise HTTPException(r.status_code, error_detail)
    return r.json()

def ga_delete(path: str, max_retries: int = 3, initial_delay: float = 2.0) -> Any:
    """DELETE a resource from Google API (e.g., delete an agent).
    
    Includes retry logic for permission errors (403) which may occur due to
    propagation delays after agent creation.
    """
    url = f"{CA_BASE}/v1beta/{path}"
    
    for attempt in range(max_retries):
        r = requests.delete(url, headers=ga_headers(), timeout=60)
        
        # Success case
        if r.status_code == 200:
            # DELETE requests may return empty body on success (204) or JSON (200)
            if r.text:
                try:
                    return r.json()
                except:
                    return {"success": True}
            return {"success": True}
        
        # Extract detailed error message
        error_detail = r.text
        try:
            error_json = r.json()
            if isinstance(error_json, dict):
                error_obj = error_json.get("error", {})
                if isinstance(error_obj, dict):
                    error_detail = error_obj.get("message", error_detail)
        except:
            pass
        
        # Check for soft-deleted state (409 Failed Precondition)
        if r.status_code == 409 and "SOFT_DELETED" in error_detail:
            # Agent is already soft-deleted, treat as success (it's effectively deleted)
            logger.info(f"Agent {path} is already in SOFT_DELETED state, treating as successfully deleted")
            return {"success": True, "already_deleted": True, "message": "Agent was already deleted (soft-deleted)"}
        
        # For permission errors (403), retry with exponential backoff
        # This handles propagation delays after agent creation
        if r.status_code == 403 and attempt < max_retries - 1:
            delay = initial_delay * (2 ** attempt)  # Exponential backoff: 2s, 4s, 8s
            logger.warning(f"Permission denied (403) on delete attempt {attempt + 1}/{max_retries}. "
                         f"Retrying in {delay} seconds... Error: {error_detail[:100]}")
            time.sleep(delay)
            continue
        
        # For other errors or final attempt, raise exception
        raise HTTPException(r.status_code, error_detail)
    
    # Should not reach here, but just in case
    raise HTTPException(500, "Unexpected error in delete retry logic")

def _bq_get(url: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Helper for BigQuery API GET requests."""
    r = requests.get(url, headers=ga_headers(), params=params or {}, timeout=60)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()

def _crm_get(url: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Helper for Cloud Resource Manager API GET requests."""
    r = requests.get(url, headers=ga_headers(), params=params or {}, timeout=60)
    if r.status_code != 200:
        # Try to surface a human-friendly Google error message (instead of raw 403)
        error_detail = r.text
        missing_permission = None
        try:
            error_json = r.json()
            if isinstance(error_json, dict):
                err = error_json.get("error")
                if isinstance(err, dict):
                    error_detail = err.get("message", error_detail)
                    # Try to extract missing permission from google.rpc.ErrorInfo metadata
                    for d in err.get("details", []) or []:
                        if not isinstance(d, dict):
                            continue
                        t = d.get("@type", "") or ""
                        if "google.rpc.ErrorInfo" in t:
                            md = d.get("metadata", {}) or {}
                            if isinstance(md, dict):
                                missing_permission = md.get("permission") or md.get("Permission")
                                if missing_permission:
                                    break
        except Exception:
            pass

        if missing_permission:
            error_detail = f"{error_detail} (Missing permission: {missing_permission})"

        raise HTTPException(r.status_code, error_detail)
    return r.json()

# --------- GCP Sources Fetching (with precautions) ---------
def _fetch_sources_from_gcp() -> Tuple[Optional[List[Dict[str, str]]], Optional[str]]:
    """
    Fetch data agents from GCP API.
    Returns (sources_list, error_message) tuple.
    - If successful: (sources_list, None)
    - If error: (None, error_message)
    """
    if not ENABLE_GCP_FETCH:
        logger.info("GCP sources fetching is disabled via ENABLE_GCP_SOURCES_FETCH")
        return None, "GCP fetching is disabled"
    
    try:
        # Build the list endpoint path (same pattern as ga_get uses)
        path = f"projects/{BILLING_PROJECT}/locations/{LOCATION}/dataAgents"
        url = f"{CA_BASE}/v1beta/{path}"
        
        logger.info(f"Fetching data agents from GCP: {url}")
        
        # Get headers (this might fail if credentials are missing)
        try:
            headers = ga_headers()
        except Exception as e:
            error_msg = f"Authentication failed: {str(e)}"
            logger.error(error_msg)
            return None, error_msg
        
        # Make request directly so we can parse error responses properly
        try:
            response = requests.get(
                url,
                headers=headers,
                params={"pageSize": 100},
                timeout=GCP_FETCH_TIMEOUT
            )
        except requests.Timeout:
            error_msg = f"Request timed out after {GCP_FETCH_TIMEOUT} seconds"
            logger.warning(error_msg)
            return None, error_msg
        except requests.ConnectionError as e:
            error_msg = f"Connection error: {str(e)}"
            logger.warning(error_msg)
            return None, error_msg
        except requests.RequestException as e:
            error_msg = f"Request failed: {str(e)}"
            logger.warning(error_msg)
            return None, error_msg
        
        # Handle non-200 responses with detailed error extraction
        if response.status_code != 200:
            error_detail = "Unknown error"
            try:
                # Try to parse JSON error response
                error_json = response.json()
                logger.info(f"GCP API error response (status {response.status_code}): {json.dumps(error_json, indent=2)}")
                
                if isinstance(error_json, dict):
                    # GCP API error format: {"error": {"code": 403, "message": "...", "status": "PERMISSION_DENIED"}}
                    error_obj = error_json.get("error", {})
                    if isinstance(error_obj, dict):
                        error_detail = error_obj.get("message", "")
                        if not error_detail:
                            # Try other possible fields
                            error_detail = error_obj.get("detail", "") or error_obj.get("reason", "") or str(error_obj)
                        # Also include status code if available
                        status = error_obj.get("status", "")
                        if status:
                            error_detail = f"{status}: {error_detail}"
                    else:
                        error_detail = str(error_obj)
                else:
                    error_detail = str(error_json)
            except (json.JSONDecodeError, ValueError) as e:
                # If not JSON, use the raw text
                error_detail = response.text[:1000] if response.text else f"HTTP {response.status_code}"
                logger.warning(f"Failed to parse error JSON: {e}, raw response: {error_detail[:200]}")
            
            error_msg = f"GCP API returned {response.status_code}: {error_detail}"
            logger.warning(f"GCP API error: {error_msg}")
            return None, error_msg
        
        # Parse successful JSON response
        try:
            data = response.json()
            # Log the full response for debugging
            logger.info(f"GCP API response received. Keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
            logger.info(f"Full response (first 2000 chars): {json.dumps(data, indent=2)[:2000]}")
        except json.JSONDecodeError as e:
            error_msg = f"Failed to parse JSON response: {str(e)}. Response: {response.text[:500]}"
            logger.warning(error_msg)
            return None, error_msg
        
        # Validate response structure
        if not isinstance(data, dict):
            error_msg = f"GCP API returned invalid response structure (not a dict). Type: {type(data)}, Value: {str(data)[:500]}"
            logger.warning(error_msg)
            return None, error_msg
        
        # Extract agents from response - the field is "dataAgents" not "dataAnalyticsAgents"
        agents = data.get("dataAgents", [])
        if not agents:
            # Try alternative field names for backward compatibility
            agents = data.get("dataAnalyticsAgents", [])
        if not agents:
            # Try checking if it's a different structure
            logger.warning(f"No 'dataAgents' or 'dataAnalyticsAgents' field found. Available keys: {list(data.keys())}")
            logger.warning(f"Full response structure: {json.dumps(data, indent=2)[:3000]}")
        
        logger.info(f"GCP API returned {len(agents) if isinstance(agents, list) else 0} agents")
        
        if not isinstance(agents, list):
            error_msg = f"GCP API returned invalid agents list. Type: {type(agents)}, Value: {str(agents)[:500]}"
            logger.warning(f"{error_msg}. Response structure: {list(data.keys())}")
            return None, error_msg
        
        if len(agents) == 0:
            # Log the full response to understand what we got
            logger.warning(f"GCP API returned 0 agents. Full response keys: {list(data.keys())}")
            logger.warning(f"Full response: {json.dumps(data, indent=2)[:3000]}")
            # Check if there's pagination info
            if "nextPageToken" in data:
                logger.info("Response has nextPageToken - there might be more agents on next page")
        
        # Transform GCP agents to extract their BigQuery data sources
        sources = []
        seen_sources = set()  # Track unique data sources to avoid duplicates
        
        for agent in agents:
            try:
                # Extract agent path (full resource name)
                agent_path = agent.get("name", "")
                if not agent_path:
                    continue
                
                # Extract agent's data sources configuration
                agent_data = agent.get("dataAnalyticsAgent", {})
                data_sources = agent_data.get("dataSources", [])
                
                # Extract display name for the agent
                display_name = agent.get("displayName", "")
                if not display_name:
                    # Extract agent ID from path: projects/.../dataAgents/ID
                    parts = agent_path.split("/")
                    display_name = parts[-1] if parts else "Unknown Agent"
                
                # Process each data source in the agent
                for ds in data_sources:
                    bigquery_ds = ds.get("bigquery", {})
                    if not bigquery_ds:
                        continue
                    
                    project_id = bigquery_ds.get("projectId", "")
                    dataset_id = bigquery_ds.get("datasetId", "")
                    table_id = bigquery_ds.get("tableId", "")
                    
                    if not project_id or not dataset_id:
                        continue
                    
                    # Create a unique key for this data source
                    if table_id:
                        source_key = f"{project_id}.{dataset_id}.{table_id}"
                        source_label = f"{dataset_id}.{table_id}"
                    else:
                        source_key = f"{project_id}.{dataset_id}"
                        source_label = f"{dataset_id} (dataset)"
                    
                    # Avoid duplicates
                    if source_key in seen_sources:
                        continue
                    seen_sources.add(source_key)
                    
                    # Check for custom label for this agent, use it as prefix if available
                    agent_id = agent_path.split("/")[-1]
                    agent_key = f"agent_{agent_id}"
                    custom_label = AGENT_LABELS.get(agent_id) or AGENT_LABELS.get(agent_key)
                    # If custom label exists, use it; otherwise use the dataset.table format
                    final_label = custom_label if custom_label else source_label
                    
                    # Create source entry
                    sources.append({
                        "key": source_key,
                        "label": final_label,
                        "agent": agent_path,  # Keep reference to the agent
                        "table": source_key,  # Full table path
                        "source": "gcp",  # Mark as from GCP
                        "project": project_id,
                        "dataset": dataset_id,
                        "table_name": table_id if table_id else None
                    })
                
                # If agent has no data sources configured, still add it as a source using agent info
                if not data_sources:
                    agent_id = agent_path.split("/")[-1]
                    agent_key = f"agent_{agent_id}"
                    if agent_key not in seen_sources:
                        seen_sources.add(agent_key)
                        # Check for custom label first, then use displayName
                        custom_label = AGENT_LABELS.get(agent_id) or AGENT_LABELS.get(agent_key)
                        final_label = custom_label if custom_label else display_name
                        
                        sources.append({
                            "key": agent_key,
                            "label": final_label,
                            "agent": agent_path,
                            "source": "gcp",
                            "table": None
                        })
                        
            except Exception as e:
                logger.warning(f"Error processing agent from GCP: {e}")
                continue
        
        if len(sources) == 0:
            # Check if we had agents but they had no data sources configured
            if len(agents) > 0:
                logger.warning(f"GCP API returned {len(agents)} agents but none have BigQuery data sources configured")
                return sources, f"Found {len(agents)} agents but none have BigQuery data sources configured"
            else:
                logger.info("GCP API call succeeded but returned 0 data agents. No agents exist in this project/location.")
                return sources, "No data analytics agents found in this project/location"
        else:
            logger.info(f"Successfully extracted {len(sources)} data sources from {len(agents)} GCP agents")
            return sources, None
        
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(f"Unexpected error fetching from GCP: {error_msg}", exc_info=True)
        return None, error_msg

def _get_cached_gcp_sources() -> Tuple[Optional[List[Dict[str, str]]], Optional[str]]:
    """Get cached GCP sources if still valid, otherwise None. Returns (sources, error)."""
    global _gcp_sources_cache, _gcp_sources_cache_time, _gcp_sources_error
    
    if _gcp_sources_cache is None:
        return None, _gcp_sources_error
    
    # Check if cache is still valid
    if time.time() - _gcp_sources_cache_time > GCP_CACHE_TTL:
        _gcp_sources_cache = None
        return None, _gcp_sources_error
    
    return _gcp_sources_cache, None

def _set_cached_gcp_sources(sources: List[Dict[str, str]], error: Optional[str] = None) -> None:
    """Cache GCP sources with current timestamp."""
    global _gcp_sources_cache, _gcp_sources_cache_time, _gcp_sources_error
    _gcp_sources_cache = sources
    _gcp_sources_cache_time = time.time()
    _gcp_sources_error = error

def _invalidate_gcp_cache() -> None:
    """Invalidate the GCP sources cache."""
    global _gcp_sources_cache, _gcp_sources_cache_time, _gcp_sources_error
    _gcp_sources_cache = None
    _gcp_sources_cache_time = 0
    _gcp_sources_error = None

# --------- CA call ----------
def ca_chat_with_agent_context(agent_path: str, messages: List[Dict[str, str]]) -> Any:
    """
    Call CA API using the project-level :chat endpoint, referencing a Data Agent.
    Response is a JSON array of messages (not SSE). Read full body and parse once.
    """
    url = f"{CA_BASE}/v1beta/projects/{BILLING_PROJECT}/locations/{LOCATION}:chat"
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "x-goog-user-project": BILLING_PROJECT,
        "x-server-timeout": "600",
    }
    payload = {
        "parent": f"projects/{BILLING_PROJECT}/locations/{LOCATION}",
        "messages": [{"userMessage": {"text": m["text"]}} for m in messages],
        "data_agent_context": {"data_agent": agent_path},
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=600)
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text)
    return resp.json()


def _iter_streaming_messages(
    agent_path: str,
    messages: List[Dict[str, str]],
) -> Iterable[Tuple[Dict[str, Any], List[Dict[str, Any]]]]:
    """
    Stream CA API response and yield (parsed_message, accumulated_messages).
    Supports: (1) NDJSON - one JSON object per line, (2) chunked array format ([{, }], ,).
    """
    url = f"{CA_BASE}/v1beta/projects/{BILLING_PROJECT}/locations/{LOCATION}:chat"
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "x-goog-user-project": BILLING_PROJECT,
        "x-server-timeout": "600",
    }
    payload = {
        "parent": f"projects/{BILLING_PROJECT}/locations/{LOCATION}",
        "messages": [{"userMessage": {"text": m["text"]}} for m in messages],
        "data_agent_context": {"data_agent": agent_path},
    }
    accumulated: List[Dict[str, Any]] = []
    acc = ""
    with requests.Session() as s:
        resp = s.post(url, headers=headers, json=payload, timeout=600, stream=True)
        if resp.status_code != 200:
            raise HTTPException(resp.status_code, resp.text)
        for line in resp.iter_lines():
            if not line:
                continue
            try:
                decoded = line.decode("utf-8")
            except UnicodeDecodeError:
                continue
            # NDJSON: each line is a complete JSON object
            stripped = decoded.strip()
            if stripped.startswith("{") and not acc:
                try:
                    obj = json.loads(stripped)
                    if isinstance(obj, dict):
                        accumulated.append(obj)
                        yield (obj, accumulated)
                except json.JSONDecodeError:
                    acc = stripped
                continue
            # Chunked array format from CA API docs
            if decoded == "[{":
                acc = "{"
            elif decoded == "}]":
                acc += "}"
            elif decoded == ",":
                # End of object: try to parse accumulated object
                if acc.strip():
                    try:
                        obj = json.loads(acc)
                        if isinstance(obj, dict):
                            accumulated.append(obj)
                            yield (obj, accumulated)
                    except json.JSONDecodeError:
                        pass
                acc = ""
            else:
                acc += decoded
            # Try parse after each addition (handles multi-line objects)
            if acc.strip():
                try:
                    obj = json.loads(acc)
                    if isinstance(obj, dict):
                        accumulated.append(obj)
                        yield (obj, accumulated)
                        acc = ""
                    elif isinstance(obj, list):
                        # Buffered response: full array arrived at once
                        for item in obj:
                            if isinstance(item, dict):
                                accumulated.append(item)
                                yield (item, accumulated)
                        acc = ""
                except json.JSONDecodeError:
                    pass

# --------- Routes ----------
@app.get("/")
def root():
    """Serve the UI: index.html from repo root, frontend/dist/, or root dist/ (production build)."""
    for rel_path in (
        "index.html",
        os.path.join("dist", "index.html"),
        os.path.join("Frontend", "dist", "index.html"),
    ):
        path = os.path.join(_BACKEND_DIR, "..", rel_path)
        if os.path.exists(path):
            return FileResponse(path)
    return {"message": "Backend is up. Build the Frontend (cd Frontend && npm run build) or put index.html in repo root."}

@app.get("/healthz")
def healthz():
    return {"ok": True, "project": BILLING_PROJECT, "location": LOCATION}

# --------- Agent Management APIs ---------
def _fetch_agents_from_gcp() -> Tuple[Optional[List[Dict[str, str]]], Optional[str]]:
    """
    Fetch agents directly from GCP API (not data sources).
    Returns (agents_list, error_message) tuple.
    - If successful: (agents_list, None)
    - If error: (None, error_message)
    """
    if not ENABLE_GCP_FETCH:
        logger.info("GCP agents fetching is disabled via ENABLE_GCP_SOURCES_FETCH")
        return None, "GCP fetching is disabled"
    
    try:
        # Build the list endpoint path
        path = f"projects/{BILLING_PROJECT}/locations/{LOCATION}/dataAgents"
        url = f"{CA_BASE}/v1beta/{path}"
        
        logger.info(f"Fetching agents from GCP: {url}")
        
        # Get headers
        try:
            headers = ga_headers()
        except Exception as e:
            error_msg = f"Authentication failed: {str(e)}"
            logger.error(error_msg)
            return None, error_msg
        
        # Make request
        try:
            response = requests.get(
                url,
                headers=headers,
                params={"pageSize": 100},
                timeout=GCP_FETCH_TIMEOUT
            )
        except requests.Timeout:
            error_msg = f"Request timed out after {GCP_FETCH_TIMEOUT} seconds"
            logger.warning(error_msg)
            return None, error_msg
        except requests.ConnectionError as e:
            error_msg = f"Connection error: {str(e)}"
            logger.warning(error_msg)
            return None, error_msg
        except requests.RequestException as e:
            error_msg = f"Request failed: {str(e)}"
            logger.warning(error_msg)
            return None, error_msg
        
        # Handle non-200 responses
        if response.status_code != 200:
            error_detail = "Unknown error"
            try:
                error_json = response.json()
                logger.info(f"GCP API error response (status {response.status_code}): {json.dumps(error_json, indent=2)}")
                
                if isinstance(error_json, dict):
                    error_obj = error_json.get("error", {})
                    if isinstance(error_obj, dict):
                        error_detail = error_obj.get("message", "")
                        if not error_detail:
                            error_detail = error_obj.get("detail", "") or error_obj.get("reason", "") or str(error_obj)
                        status = error_obj.get("status", "")
                        if status:
                            error_detail = f"{status}: {error_detail}"
                    else:
                        error_detail = str(error_obj)
                else:
                    error_detail = str(error_json)
            except (json.JSONDecodeError, ValueError) as e:
                error_detail = response.text[:1000] if response.text else f"HTTP {response.status_code}"
                logger.warning(f"Failed to parse error JSON: {e}, raw response: {error_detail[:200]}")
            
            error_msg = f"GCP API returned {response.status_code}: {error_detail}"
            logger.warning(f"GCP API error: {error_msg}")
            return None, error_msg
        
        # Parse successful JSON response
        try:
            data = response.json()
            logger.info(f"GCP API response received. Keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
        except json.JSONDecodeError as e:
            error_msg = f"Failed to parse JSON response: {str(e)}. Response: {response.text[:500]}"
            logger.warning(error_msg)
            return None, error_msg
        
        # Validate response structure
        if not isinstance(data, dict):
            error_msg = f"GCP API returned invalid response structure (not a dict). Type: {type(data)}, Value: {str(data)[:500]}"
            logger.warning(error_msg)
            return None, error_msg
        
        # Extract agents from response - the field is "dataAgents"
        agents = data.get("dataAgents", [])
        if not agents:
            # Try alternative field names for backward compatibility
            agents = data.get("dataAnalyticsAgents", [])
        
        logger.info(f"GCP API returned {len(agents) if isinstance(agents, list) else 0} agents")
        
        if not isinstance(agents, list):
            error_msg = f"GCP API returned invalid agents list. Type: {type(agents)}, Value: {str(agents)[:500]}"
            logger.warning(f"{error_msg}. Response structure: {list(data.keys())}")
            return None, error_msg
        
        # Transform GCP agents to agent list format
        agent_list = []
        for agent in agents:
            try:
                # Extract agent path (full resource name)
                agent_path = agent.get("name", "")
                if not agent_path:
                    continue
                
                # Extract display name for the agent
                display_name = agent.get("displayName", "")
                if not display_name:
                    # Extract agent ID from path: projects/.../dataAgents/ID
                    parts = agent_path.split("/")
                    display_name = parts[-1] if parts else "Unknown Agent"
                
                # Extract agent ID for key
                agent_id = agent_path.split("/")[-1]
                agent_key = f"agent_{agent_id}"
                
                # Check for custom label first, then use displayName
                agent_id = agent_path.split("/")[-1]
                custom_label = AGENT_LABELS.get(agent_id) or AGENT_LABELS.get(agent_key)
                final_label = custom_label if custom_label else display_name
                
                agent_list.append({
                    "key": agent_key,
                    "label": final_label,
                    "agent": agent_path,
                    "source": "gcp",  # Mark as from GCP
                })
            except Exception as e:
                logger.warning(f"Error processing agent from GCP: {e}")
                continue
        
        if len(agent_list) == 0:
            logger.info("GCP API call succeeded but returned 0 agents")
            return agent_list, "No data analytics agents found in this project/location"
        else:
            logger.info(f"Successfully fetched {len(agent_list)} agents from GCP")
            return agent_list, None
        
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(f"Unexpected error fetching agents from GCP: {error_msg}", exc_info=True)
        return None, error_msg

@app.get("/api/agents")
def list_agents():
    """List agents from both ca_profiles.json and GCP (key/label/agent path)."""
    out = []
    gcp_error = None
    gcp_status = "unknown"
    
    # First, collect GCP agents (source of truth)
    gcp_agent_paths = set()
    gcp_agents_list = []
    
    try:
        gcp_agents, gcp_error = _fetch_agents_from_gcp()
        
        if gcp_agents is not None:
            # gcp_agents can be [] (empty list) or list with agents
            if len(gcp_agents) > 0:
                gcp_status = "success"
                logger.info(f"GCP agents fetched: {len(gcp_agents)}")
                for agent in gcp_agents:
                    agent_path = agent.get("agent", "")
                    if agent_path:
                        gcp_agent_paths.add(agent_path)
                        gcp_agents_list.append({
                            "key": agent.get("key", ""),
                            "label": agent.get("label", ""),
                            "agent": agent_path,
                            "source": "gcp",  # Mark as from GCP
                        })
                        logger.info(f"Added GCP agent: key={agent.get('key')}, label={agent.get('label')}, path={agent_path}")
                    else:
                        logger.warning(f"Skipping GCP agent (no agent path): {agent.get('key')}")
            else:
                # Empty list - no agents found
                gcp_status = "empty"
                if gcp_error:
                    logger.warning(f"GCP fetch returned 0 agents: {gcp_error}")
                else:
                    logger.info("GCP fetch returned 0 agents (no error)")
        else:
            # gcp_agents is None - error occurred
            gcp_status = "failed"
            if gcp_error:
                logger.error(f"Failed to fetch GCP agents: {gcp_error}")
            else:
                gcp_error = "Unknown error - no error message captured"
                logger.error("Failed to fetch GCP agents but no error message was returned")
    except Exception as e:
        # Log error but don't fail the request - still return local agents
        gcp_status = "failed"
        gcp_error = f"Unexpected error: {str(e)}"
        logger.error(f"Error fetching GCP agents: {gcp_error}", exc_info=True)
    
    # Add GCP agents first (source of truth)
    out.extend(gcp_agents_list)
    
    # Add local agents that are NOT in GCP (to avoid duplicates, prefer GCP)
    for key, v in PROFILES.items():
        agent_path = v.get("agent", "")
        if agent_path and agent_path not in gcp_agent_paths:
            # Check for custom label first, then use ca_profiles.json label
            agent_id = agent_path.split("/")[-1] if agent_path else ""
            custom_label = AGENT_LABELS.get(agent_id) or AGENT_LABELS.get(key)
            final_label = custom_label if custom_label else v.get("label", key)
            
            out.append({
                "key": key,
                "label": final_label,
                "agent": agent_path,
                "source": "local",  # Mark as local
            })
            logger.info(f"Added local agent (not in GCP): key={key}, path={agent_path}")
        else:
            if agent_path in gcp_agent_paths:
                logger.info(f"Skipping local agent (exists in GCP): key={key}, path={agent_path}")
    
    # Return agents with metadata about GCP fetch status
    return {
        "agents": out,
        "meta": {
            "gcp_status": gcp_status,
            "gcp_error": gcp_error,
            "gcp_count": len(gcp_agents_list),
            "local_count": len([a for a in out if a.get("source") == "local"]),
            "total": len(out)
        }
    }

def _find_agent_path_by_id(agent_id: str) -> Optional[str]:
    """
    Find agent path by agent ID (last segment).
    Checks both local PROFILES and GCP sources.
    Returns the agent path if found, None otherwise.
    """
    # First check local PROFILES
    for v in PROFILES.values():
        ap = v.get("agent")
        if ap and ap.split("/")[-1] == agent_id:
            return ap
    
    # If not found locally, check GCP sources (from cache or fetch)
    gcp_sources, _ = _get_cached_gcp_sources()
    if gcp_sources is None:
        gcp_sources, _ = _fetch_sources_from_gcp()
        if gcp_sources is not None:
            _set_cached_gcp_sources(gcp_sources, None)
    
    if gcp_sources:
        for src in gcp_sources:
            ap = src.get("agent", "")
            if ap and ap.split("/")[-1] == agent_id:
                return ap
    
    return None


def _get_all_existing_agent_ids() -> set:
    """Collect agent IDs from used set, GCP, and local profiles."""
    ids = set(USED_AGENT_IDS)
    ids.update(PROFILES.keys())
    gcp_agents, _ = _fetch_agents_from_gcp()
    if gcp_agents:
        for a in gcp_agents:
            agent_path = a.get("agent") or ""
            if agent_path:
                aid = agent_path.split("/")[-1]
                if aid:
                    ids.add(aid)
    return ids


@app.get("/api/agents/generate-id")
def generate_agent_id():
    """
    Generate a unique agent ID with format dashworx_<suffix>.
    Never reuses IDs (even after deletion). Checks persisted used IDs + GCP + local profiles.
    """
    existing = _get_all_existing_agent_ids()
    for _ in range(50):  # Retry up to 50 times on collision
        suffix = secrets.token_hex(4)  # 8 hex chars
        candidate = f"dashworx_{suffix}"
        if candidate not in existing:
            return {"agentId": candidate}
    raise HTTPException(500, "Failed to generate unique agent ID after retries")


@app.get("/api/agents/{agent_id}")
def describe_agent(agent_id: str):
    """Describe an agent by its ID (last path segment) via GCP."""
    agent_path = _find_agent_path_by_id(agent_id)
    if not agent_path:
        raise HTTPException(404, f"Agent id '{agent_id}' not found in local profiles or GCP")
    return ga_get(agent_path)

@app.patch("/api/agents/{agent_id}/instruction")
def patch_instruction(agent_id: str, body: InstructionPatch):
    """Update published system instruction for the agent on GCP."""
    agent_path = _find_agent_path_by_id(agent_id)
    if not agent_path:
        raise HTTPException(404, f"Agent id '{agent_id}' not found in local profiles or GCP")

    update_mask = "dataAnalyticsAgent.publishedContext.systemInstruction"
    user_instruction = (body.instruction or "").strip()
    payload = {
        "dataAnalyticsAgent": {
            "publishedContext": {
                "systemInstruction": user_instruction + AUTO_APPENDED_INSTRUCTIONS
            }
        }
    }
    return ga_patch(agent_path, update_mask, payload)

@app.delete("/api/agents/{agent_id}")
def delete_agent(agent_id: str, agent_path: Optional[str] = Query(None, description="Optional agent path to bypass lookup")):
    """Delete a Data Analytics Agent from GCP.
    
    Accepts optional query parameter 'agent_path' to bypass lookup.
    This is useful when the agent was just created and might not be in cache yet.
    """
    # If agent_path is provided as query parameter, use it directly (bypass lookup)
    if agent_path:
        logger.info(f"Using provided agent_path for deletion: {agent_path}")
    
    # Otherwise, try to find the agent path
    if not agent_path:
        agent_path = _find_agent_path_by_id(agent_id)
        
        # If still not found, try with a short delay and retry (for newly created agents)
        if not agent_path:
            logger.warning(f"Agent {agent_id} not found in cache, waiting 2 seconds and retrying...")
            time.sleep(2)
            # Invalidate cache and retry
            _invalidate_gcp_cache()
            agent_path = _find_agent_path_by_id(agent_id)
    
    if not agent_path:
        raise HTTPException(404, f"Agent id '{agent_id}' not found in local profiles or GCP. The agent may not have propagated yet. Please try again in a few moments.")
    
    logger.info(f"Deleting agent: {agent_id} at {agent_path}")
    
    try:
        # Call GCP API to delete the agent (with retry logic for permission errors)
        result = ga_delete(agent_path, max_retries=3, initial_delay=2.0)
        
        # Check if agent was already soft-deleted
        if result.get("already_deleted"):
            logger.info(f"Agent {agent_id} was already soft-deleted")
            # Still invalidate cache and remove label
            _invalidate_gcp_cache()
            if agent_id in AGENT_LABELS:
                try:
                    del AGENT_LABELS[agent_id]
                    with open(AGENT_LABELS_PATH, "w") as f:
                        json.dump(AGENT_LABELS, f, indent=2)
                except Exception as e:
                    logger.warning(f"Failed to remove custom label: {e}")
            
            return {
                "success": True,
                "agent_id": agent_id,
                "agent_path": agent_path,
                "message": f"Agent '{agent_id}' was already deleted (soft-deleted)"
            }
        
        logger.info(f"Successfully deleted agent: {agent_path}")
        
        # Invalidate cache after deletion so list refreshes
        _invalidate_gcp_cache()
        
        # Also remove custom label if it exists
        if agent_id in AGENT_LABELS:
            try:
                del AGENT_LABELS[agent_id]
                with open(AGENT_LABELS_PATH, "w") as f:
                    json.dump(AGENT_LABELS, f, indent=2)
            except Exception as e:
                logger.warning(f"Failed to remove custom label: {e}")
        
        return {
            "success": True,
            "agent_id": agent_id,
            "agent_path": agent_path,
            "message": f"Agent '{agent_id}' deleted successfully"
        }
    except HTTPException as e:
        # Provide helpful error messages for common cases
        error_detail = str(e.detail)
        
        # Check if it's a soft-deleted state error (409)
        if e.status_code == 409 and "SOFT_DELETED" in error_detail:
            # Agent is already soft-deleted, treat as success
            logger.info(f"Agent {agent_id} is already soft-deleted")
            _invalidate_gcp_cache()
            if agent_id in AGENT_LABELS:
                try:
                    del AGENT_LABELS[agent_id]
                    with open(AGENT_LABELS_PATH, "w") as f:
                        json.dump(AGENT_LABELS, f, indent=2)
                except Exception as e:
                    logger.warning(f"Failed to remove custom label: {e}")
            
            return {
                "success": True,
                "agent_id": agent_id,
                "agent_path": agent_path,
                "message": f"Agent '{agent_id}' was already deleted (soft-deleted)"
            }
        
        # Check if it's a permission error
        if e.status_code == 403:
            if "Permission" in error_detail and "denied" in error_detail:
                # Check if it might be a propagation delay issue
                if "may not exist" in error_detail:
                    error_msg = (
                        f"Permission denied. This may be due to a propagation delay after agent creation. "
                        f"Please wait a few moments and try again. "
                        f"Original error: {error_detail}"
                    )
                else:
                    error_msg = (
                        f"Permission denied. The service account may not have the required "
                        f"'geminidataanalytics.dataAgents.delete' permission, or there may be a propagation delay. "
                        f"Please check permissions or try again in a few moments. "
                        f"Original error: {error_detail}"
                    )
            else:
                error_msg = f"Permission denied: {error_detail}"
        elif e.status_code == 404:
            error_msg = (
                f"Agent not found. The agent may not have propagated yet after creation. "
                f"Please try again in a few moments. Original error: {error_detail}"
            )
        else:
            error_msg = error_detail
        
        logger.error(f"Failed to delete agent {agent_id}: {error_msg}")
        raise HTTPException(e.status_code, error_msg)
    except Exception as e:
        # Handle unexpected errors
        error_msg = f"Unexpected error deleting agent: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise HTTPException(500, error_msg)

@app.patch("/api/agents/{agent_id}/label")
def update_agent_label(agent_id: str, body: Dict[str, str]):
    """Update an agent's custom label in agent_labels.json. Works for both local and GCP agents."""
    new_label = body.get("label", "").strip()
    if not new_label:
        raise HTTPException(400, "Label cannot be empty")
    
    # Update in-memory cache
    AGENT_LABELS[agent_id] = new_label
    
    # Write back to file
    try:
        with open(AGENT_LABELS_PATH, "w") as f:
            json.dump(AGENT_LABELS, f, indent=2)
        logger.info(f"Updated label for agent {agent_id}: {new_label}")
        return {"agent_id": agent_id, "label": new_label}
    except Exception as e:
        raise HTTPException(500, f"Failed to update agent_labels.json: {e}")


@app.post("/api/agents")
def create_agent_endpoint(body: CreateAgentBody):
    """Create a new Data Analytics Agent in GCP."""
    # Validate agent ID format
    agent_id = body.id.strip()
    if not agent_id:
        raise HTTPException(400, "Agent ID cannot be empty")
    
    # Validate slug format (lowercase letters, numbers, hyphens, underscores)
    if not re.match(r'^[a-z0-9_-]+$', agent_id):
        raise HTTPException(400, "Agent ID must contain only lowercase letters, numbers, hyphens, or underscores")
    
    # Validate label
    label = body.label.strip()
    if not label:
        raise HTTPException(400, "Label cannot be empty")
    
    # Validate dataAnalyticsAgent structure
    if not isinstance(body.dataAnalyticsAgent, dict):
        raise HTTPException(400, "dataAnalyticsAgent must be an object")
    
    # Validate that dataSources exist if provided
    if "dataSources" in body.dataAnalyticsAgent:
        data_sources = body.dataAnalyticsAgent.get("dataSources", [])
        if not isinstance(data_sources, list):
            raise HTTPException(400, "dataSources must be an array")
        if len(data_sources) == 0:
            raise HTTPException(400, "At least one data source is required")
    
    # Build the create endpoint path
    parent_path = f"projects/{BILLING_PROJECT}/locations/{LOCATION}"
    create_path = f"{parent_path}/dataAgents"
    
    # Prepare the payload for GCP API
    # GCP API expects camelCase field names (not snake_case)
    # The structure matches what we use for PATCH operations
    
    # Build publishedContext with system instruction (guard rails + SQL instructions appended automatically)
    published_context = {}
    if "publishedContext" in body.dataAnalyticsAgent:
        pub_ctx = body.dataAnalyticsAgent["publishedContext"]
        if "systemInstruction" in pub_ctx:
            user_instruction = (pub_ctx["systemInstruction"] or "").strip()
            published_context["systemInstruction"] = user_instruction + AUTO_APPENDED_INSTRUCTIONS
        # Pass through options (e.g. bigQueryMaxBilledBytes for per-query cost limit)
        if "options" in pub_ctx and isinstance(pub_ctx["options"], dict):
            published_context["options"] = pub_ctx["options"]
    
    # Build datasourceReferences from dataSources
    # The API expects datasourceReferences inside publishedContext
    if "dataSources" in body.dataAnalyticsAgent:
        data_sources = body.dataAnalyticsAgent["dataSources"]
        if data_sources and len(data_sources) > 0:
            # Collect all BigQuery table references
            table_refs = []
            for ds in data_sources:
                if "bigquery" in ds:
                    bq = ds["bigquery"]
                    project_id = bq.get("projectId", "")
                    dataset_id = bq.get("datasetId", "")
                    table_id = bq.get("tableId", "")
                    
                    if project_id and dataset_id:
                        if table_id:
                            # Specific table reference
                            table_refs.append({
                                "projectId": project_id,
                                "datasetId": dataset_id,
                                "tableId": table_id
                            })
                        else:
                            # Dataset-level reference (no specific table)
                            table_refs.append({
                                "projectId": project_id,
                                "datasetId": dataset_id
                            })
            
            # Add datasourceReferences to publishedContext
            if table_refs:
                # The API expects bq with tableReferences array
                bq_datasource = {
                    "tableReferences": table_refs
                }
                published_context["datasourceReferences"] = {
                    "bq": bq_datasource
                }
    
    # Build the dataAnalyticsAgent object
    data_analytics_agent = {}
    
    # Add publishedContext (required)
    if published_context:
        data_analytics_agent["publishedContext"] = published_context
    
    # Build the final payload structure
    # The API expects DataAgent object with camelCase fields
    # displayName is at the root level of DataAgent, NOT inside dataAnalyticsAgent
    gcp_payload = {
        "displayName": label,  # displayName at root level of DataAgent (camelCase)
        "dataAnalyticsAgent": data_analytics_agent
    }
    
    # Query parameter for agent ID (required by GCP API)
    # Use camelCase for the parameter name (matches API convention)
    params = {"dataAgentId": agent_id}
    
    logger.info(f"Creating agent: {agent_id} at {create_path}")
    logger.debug(f"Payload structure: {json.dumps(gcp_payload, indent=2)[:1000]}")
    
    try:
        # Call GCP API to create the agent
        result = ga_post(create_path, gcp_payload, params=params)
        
        # Extract the created agent path from response
        created_agent_path = result.get("name", f"{create_path}/{agent_id}")
        
        logger.info(f"Successfully created agent: {created_agent_path}")
        
        # Invalidate GCP cache so the new agent appears in lists
        _invalidate_gcp_cache()
        
        # Persist this agent ID so it is never reused (even after deletion)
        _persist_used_agent_id(agent_id)
        
        # Persist currency for this agent so chat can inject it into the prompt
        if body.currency and isinstance(body.currency, dict) and (body.currency.get("symbol") or body.currency.get("code")):
            _persist_agent_currency(agent_id, body.currency)
        
        # Optionally save custom label if different from displayName
        if label and label != agent_id:
            try:
                AGENT_LABELS[agent_id] = label
                with open(AGENT_LABELS_PATH, "w") as f:
                    json.dump(AGENT_LABELS, f, indent=2)
            except Exception as e:
                logger.warning(f"Failed to save custom label: {e}")
        
        return {
            "success": True,
            "agent_id": agent_id,
            "agent_path": created_agent_path,
            "label": label,
            "message": f"Agent '{agent_id}' created successfully"
        }
    except HTTPException as e:
        # Give a clear message when GCP says the agent ID already exists (e.g. reserved after delete)
        detail = e.detail
        if isinstance(detail, dict):
            detail = detail.get("message", detail.get("detail", str(detail)))
        detail = str(detail or "")
        if e.status_code == 409 or "already exists" in detail.lower():
            raise HTTPException(
                409,
                f"An agent with ID '{agent_id}' already exists or that ID is still reserved (e.g. after a recent delete). "
                "Please use a different agent ID."
            )
        logger.error(f"Failed to create agent {agent_id}: {e.detail}")
        raise
    except Exception as e:
        # Handle unexpected errors
        error_msg = f"Unexpected error creating agent: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise HTTPException(500, error_msg)

@app.patch("/api/profiles/{profile_key}")
def update_profile_label(profile_key: str, body: Dict[str, str]):
    """Update a profile's label in ca_profiles.json."""
    if profile_key not in PROFILES:
        raise HTTPException(404, f"Profile '{profile_key}' not found")
    
    new_label = body.get("label", "").strip()
    if not new_label:
        raise HTTPException(400, "Label cannot be empty")
    
    PROFILES[profile_key]["label"] = new_label
    
    # Write back to file
    try:
        with open(PROFILES_PATH, "w") as f:
            json.dump(PROFILES, f, indent=2)
        return {"key": profile_key, "label": new_label}
    except Exception as e:
        raise HTTPException(500, f"Failed to update ca_profiles.json: {e}")

@app.delete("/api/profiles/{profile_key}")
def remove_profile(profile_key: str):
    """Remove a profile from ca_profiles.json."""
    if profile_key not in PROFILES:
        raise HTTPException(404, f"Profile '{profile_key}' not found")
    
    del PROFILES[profile_key]
    
    # Write back to file
    try:
        with open(PROFILES_PATH, "w") as f:
            json.dump(PROFILES, f, indent=2)
        return {"message": f"Profile '{profile_key}' removed"}
    except Exception as e:
        raise HTTPException(500, f"Failed to update ca_profiles.json: {e}")

# --------- BigQuery APIs ---------
def _bq_list_projects_impl() -> list:
    """Sync impl for bq_list_projects (run in thread pool)."""
    url = f"{BQ_API}/projects"
    projects = []
    page_token = None
    while True:
        data = _bq_get(url, params={"maxResults": 1000, "pageToken": page_token})
        for p in data.get("projects", []):
            projects.append({"id": p.get("id"), "friendlyName": p.get("friendlyName")})
        page_token = data.get("nextPageToken")
        if not page_token or len(projects) >= 2000:
            break
    return projects


@app.get("/api/bq/projects")
async def bq_list_projects():
    """Lists BigQuery projects visible to the service account."""
    return await asyncio.to_thread(_bq_list_projects_impl)


def _bq_list_org_projects_impl(org_id: str) -> list:
    """Sync impl for bq_list_org_projects (run in thread pool)."""
    if org_id.startswith("organizations/"):
        org_id_clean = org_id.replace("organizations/", "")
    else:
        org_id_clean = org_id
    if not org_id_clean or not org_id_clean.isdigit():
        raise HTTPException(400, "Organization ID must be numeric (e.g., '123456789')")
    url = f"{CRM_API}/projects"
    filter_param = f"parent.type:organization parent.id:{org_id_clean} lifecycleState:ACTIVE"
    projects = []
    page_token = None
    while True:
        params = {"filter": filter_param, "pageSize": 1000}
        if page_token:
            params["pageToken"] = page_token
        data = _crm_get(url, params=params)
        for p in data.get("projects", []):
            projects.append({
                "id": p.get("projectId"),
                "name": p.get("name", ""),
                "projectNumber": p.get("projectNumber", ""),
                "lifecycleState": p.get("lifecycleState", "UNKNOWN")
            })
        page_token = data.get("nextPageToken")
        if not page_token or len(projects) >= 2000:
            break
    return projects


@app.get("/api/bq/organizations/{org_id}/projects")
async def bq_list_org_projects(org_id: str):
    """Lists projects under a GCP organization."""
    return await asyncio.to_thread(_bq_list_org_projects_impl, org_id)


def _bq_list_datasets_impl(project: str) -> list:
    """Sync impl for bq_list_datasets (run in thread pool)."""
    if not project:
        raise HTTPException(400, "project is required")
    url = f"{BQ_API}/projects/{project}/datasets"
    datasets = []
    page_token = None
    while True:
        data = _bq_get(url, params={"all": False, "maxResults": 1000, "pageToken": page_token})
        for d in data.get("datasets", []):
            ref = d.get("datasetReference", {})
            datasets.append({"id": ref.get("datasetId")})
        page_token = data.get("nextPageToken")
        if not page_token or len(datasets) >= 5000:
            break
    return datasets


@app.get("/api/bq/datasets")
async def bq_list_datasets(project: str):
    """Lists datasets within a project."""
    return await asyncio.to_thread(_bq_list_datasets_impl, project)


def _bq_list_tables_impl(project: str, dataset: str) -> list:
    """Sync impl for bq_list_tables (run in thread pool)."""
    if not project or not dataset:
        raise HTTPException(400, "project and dataset are required")
    url = f"{BQ_API}/projects/{project}/datasets/{dataset}/tables"
    tables = []
    page_token = None
    while True:
        data = _bq_get(url, params={"maxResults": 1000, "pageToken": page_token})
        for t in data.get("tables", []):
            ref = t.get("tableReference", {})
            tables.append({"id": ref.get("tableId")})
        page_token = data.get("nextPageToken")
        if not page_token or len(tables) >= 10000:
            break
    return tables


@app.get("/api/bq/tables")
async def bq_list_tables(project: str, dataset: str):
    """Lists tables in a dataset (optional selection)."""
    return await asyncio.to_thread(_bq_list_tables_impl, project, dataset)


def _bq_get_table_schema_impl(project: str, dataset: str, table: str) -> dict:
    """Sync impl for bq_get_table_schema (run in thread pool)."""
    if not project or not dataset or not table:
        raise HTTPException(400, "project, dataset, and table are required")
    url = f"{BQ_API}/projects/{project}/datasets/{dataset}/tables/{table}"
    data = _bq_get(url)
    schema = data.get("schema", {})
    fields = schema.get("fields", [])
    return {
        "tableId": table,
        "fields": [{"name": f.get("name"), "type": f.get("type", "STRING"), "mode": f.get("mode", "NULLABLE")} for f in fields]
    }


@app.get("/api/bq/table-schema")
async def bq_get_table_schema(project: str, dataset: str, table: str):
    """Returns the schema (field names and types) for a BigQuery table."""
    return await asyncio.to_thread(_bq_get_table_schema_impl, project, dataset, table)


def _list_sources_impl(force_refresh: bool) -> dict:
    """Sync implementation of list_sources (run in thread pool for async concurrency)."""
    sources = []
    gcp_count = 0
    gcp_status = "disabled"
    gcp_error = None
    
    # Try to get GCP sources (with caching)
    if force_refresh:
        # Force fresh fetch, clear cache
        global _gcp_sources_cache, _gcp_sources_cache_time, _gcp_sources_error
        _gcp_sources_cache = None
        _gcp_sources_cache_time = 0
        _gcp_sources_error = None
        gcp_sources, gcp_error = _fetch_sources_from_gcp()
        if gcp_sources is not None:
            # gcp_sources can be [] (empty list = success but no agents) or list with agents
            _set_cached_gcp_sources(gcp_sources, gcp_error)
        elif gcp_error:
            # Error occurred, cache the error
            _set_cached_gcp_sources([], gcp_error)
    else:
        gcp_sources, cached_error = _get_cached_gcp_sources()
        if gcp_sources is None:
            # Cache miss or expired, fetch fresh
            gcp_sources, gcp_error = _fetch_sources_from_gcp()
            if gcp_sources is not None:
                # gcp_sources can be [] (empty list = success but no agents) or list with agents
                _set_cached_gcp_sources(gcp_sources, gcp_error)
            elif gcp_error:
                # Error occurred, cache the error
                _set_cached_gcp_sources([], gcp_error)
        else:
            gcp_error = cached_error
    
    # Handle the result: gcp_sources can be None (error), [] (could be success or failure), or [sources...]
    if gcp_sources is not None:
        # gcp_sources is a list (could be empty)
        gcp_count = len(gcp_sources)
        
        if gcp_error is not None:
            # There's an error message, treat as failure
            gcp_status = "failed"
            logger.warning(f"GCP fetch completed but with error: {gcp_error}. Found {gcp_count} sources.")
            # Still add the sources we found (if any)
            if gcp_count > 0:
                sources.extend(gcp_sources)
        elif gcp_count > 0:
            # Success with sources
            gcp_status = "success"
            sources.extend(gcp_sources)
            logger.info(f"GCP fetch succeeded: {gcp_count} data sources found")
        else:
            # Empty list with no error - this means no agents or no data sources in agents
            gcp_status = "empty"
            logger.info("GCP fetch succeeded but returned 0 data sources")
    else:
        # gcp_sources is None - this means an error occurred
        if ENABLE_GCP_FETCH:
            gcp_status = "failed"
            if gcp_error:
                logger.warning(f"GCP fetch failed: {gcp_error}")
            else:
                gcp_error = "Unknown error - fetch returned None"
                logger.warning("GCP fetch returned None but no error was captured")
        else:
            gcp_status = "disabled"
            gcp_error = "GCP fetching is disabled via ENABLE_GCP_SOURCES_FETCH"
            logger.info("GCP sources fetching is disabled, using local file only")
    
    # Only use local file sources as fallback if GCP fetch failed or returned empty
    if gcp_status == "failed" and not sources:
        # GCP fetch failed completely, fall back to local file
        logger.info("GCP fetch failed, falling back to ca_profiles.json")
        local_sources = [{"key": k, "label": v.get("label", k), "source": "local", "agent": v.get("agent"), "table": v.get("table")} for k, v in PROFILES.items()]
        sources.extend(local_sources)
    elif gcp_status == "empty":
        # GCP returned 0 agents, also include local as fallback
        logger.info("GCP returned 0 agents, including local sources as fallback")
        local_sources = [{"key": k, "label": v.get("label", k), "source": "local", "agent": v.get("agent"), "table": v.get("table")} for k, v in PROFILES.items()]
        sources.extend(local_sources)
    
    # Deduplicate by agent path (in case same agent exists in both)
    seen_agents = set()
    deduped = []
    for src in sources:
        agent_path = src.get("agent", "")
        if agent_path and agent_path in seen_agents:
            # Skip duplicate, prefer GCP version if available
            continue
        if agent_path:
            seen_agents.add(agent_path)
        deduped.append(src)
    
    # Ensure gcp_error is always a string (not None) when status is failed
    if gcp_status == "failed" and not gcp_error:
        gcp_error = "No error message captured - check backend logs for details"
        logger.warning(f"GCP status is 'failed' but no error was captured. This should not happen.")
    
    result = {
        "sources": deduped,
        "meta": {
            "gcp_count": gcp_count,
            "local_count": len([s for s in deduped if s.get("source") == "local"]),
            "gcp_status": gcp_status,
            "gcp_error": gcp_error,
            "total": len(deduped)
        }
    }
    # Log the response for debugging
    logger.info(f"Returning sources: status={gcp_status}, error={gcp_error}, gcp_count={gcp_count}, total={len(deduped)}")
    return result


@app.get("/api/sources")
async def list_sources(force_refresh: bool = Query(False, description="Force refresh from GCP, bypassing cache")):
    """
    List data sources by fetching Data Analytics Agents from GCP.
    Runs blocking GCP fetch in thread pool for concurrency.
    """
    return await asyncio.to_thread(_list_sources_impl, force_refresh)


def _chat_impl(body: ChatBody):
    """Sync implementation of chat (run in thread pool for async concurrency)."""
    agent_path = None
    
    # Priority 1: Use agent field if provided (GCP agent resource name)
    if body.agent:
        if not isinstance(body.agent, str) or not body.agent.strip():
            raise HTTPException(400, "agent field must be a non-empty string")
        # Validate agent path format to prevent path traversal
        agent_path = body.agent.strip()
        if not re.match(r'^projects/[^/]+/locations/[^/]+/dataAgents/[^/]+$', agent_path):
            raise HTTPException(400, "Invalid agent path format")
    # Priority 2: Fall back to profile lookup (backward compatibility)
    elif body.profile:
        # Validate profile key to prevent injection
        if not isinstance(body.profile, str) or not re.match(r'^[a-zA-Z0-9_-]+$', body.profile):
            raise HTTPException(400, "Invalid profile key format")
        prof = PROFILES.get(body.profile)
        if not prof:
            raise HTTPException(400, "Unknown profile")
        agent_path = prof.get("agent")
        if not agent_path:
            raise HTTPException(400, "No agent configured for this profile")
    else:
        # Neither agent nor profile provided
        raise HTTPException(400, "Provide either agent (GCP agent resource name) or profile (local key).")

    # Validate message input
    if not isinstance(body.message, str):
        raise HTTPException(400, "Message must be a string")
    if len(body.message.strip()) == 0:
        raise HTTPException(400, "Message cannot be empty")
    if len(body.message) > 10000:  # Reasonable limit
        raise HTTPException(400, "Message is too long (max 10000 characters)")

    # Validate history if provided
    if body.history:
        if not isinstance(body.history, list):
            raise HTTPException(400, "History must be an array")
        if len(body.history) > 100:  # Reasonable limit
            raise HTTPException(400, "History is too long (max 100 messages)")
        for item in body.history:
            if not isinstance(item, dict) or 'role' not in item or 'content' not in item:
                raise HTTPException(400, "Invalid history item format")
            if item['role'] not in ['user', 'assistant']:
                raise HTTPException(400, "Invalid role in history")
            if not isinstance(item['content'], str) or len(item['content']) > 10000:
                raise HTTPException(400, "Invalid content in history")

    # Resolve agent_id for currency lookup (last segment of path)
    agent_id = (agent_path or "").split("/")[-1] if agent_path else ""
    currency = _get_agent_currency(agent_id)
    currency_instruction = _build_currency_instruction(currency) if currency else None

    # Build a contextual prompt from prior turns (client-provided)
    max_turns = body.maxTurns if body.maxTurns is not None else 6
    # Validate maxTurns
    if not isinstance(max_turns, int) or max_turns < 1 or max_turns > 50:
        max_turns = 6  # Default to safe value
    date_instruction = _build_date_instruction()
    prompt = _build_prompt_with_history(body.message, body.history, max_turns=max_turns, currency_instruction=currency_instruction, date_instruction=date_instruction)

    # Send a single userMessage with the contextualized prompt
    messages = [{"text": prompt}]
    t0 = time.perf_counter()
    result = ca_chat_with_agent_context(agent_path, messages)
    generation_seconds = round(time.perf_counter() - t0, 1)

    # Build generic, well-structured JSON response
    answer_text = _best_text(result) or ""

    # Extract charts (from text + entire result) and clean answer
    charts, cleaned_answer = extract_charts_and_clean(answer_text, result)

    artifacts = {
        "sql": _find_sql_snippets(result),
        "tables": _find_table_refs(result),
        "jobs": _find_jobs(result),
        "rows": _first_tabular_rows(result),
        "charts": charts,
    }

    # Keep SQL out of the main answer. Fall back to bullets from first row if needed.
    final_answer = cleaned_answer
    if _looks_like_sql_text(final_answer):
        from_rows = _bullets_from_first_row(artifacts["rows"])
        if from_rows:
            final_answer = from_rows
        else:
            final_answer = "I generated a query to answer your question. See the SQL panel below."
    final_answer = _format_followup_questions_as_list(final_answer)

    chain_of_thought = _extract_chain_of_thought(result)
    if chain_of_thought:
        logger.info("Returning chainOfThought: %d chars", len(chain_of_thought))
    else:
        if isinstance(result, (list, dict)):
            result_type = "list" if isinstance(result, list) else "dict"
            result_keys = list(result.keys())[:5] if isinstance(result, dict) else []
            logger.warning("chainOfThought is empty; result type=%s keys=%s", result_type, result_keys)
        # No fallback from SQL - user sees SQL in the SQL panel, not in CoT

    exact_error = _extract_raw_error(result)

    return {
        "answer": final_answer,   # human-friendly text (no chart code)
        "artifacts": artifacts,   # sql/tables/jobs/rows + charts (vega-lite specs)
        "generationTimeSeconds": generation_seconds,  # time to generate response in backend
        "chainOfThought": chain_of_thought,  # chain-of-thought reasoning if present
        "exactError": exact_error,  # raw error from GCP/CA API when present (e.g. cross-org)
        "raw": result             # full stream for debugging
    }


@app.post("/api/chat")
async def chat(body: ChatBody):
    """Non-streaming chat. Runs blocking CA API call in thread pool for concurrency."""
    return await asyncio.to_thread(_chat_impl, body)


def _resolve_agent_path_from_body(body: ChatBody) -> str:
    """Resolve agent path from ChatBody. Raises HTTPException if invalid."""
    if body.agent:
        if not isinstance(body.agent, str) or not body.agent.strip():
            raise HTTPException(400, "agent field must be a non-empty string")
        agent_path = body.agent.strip()
        if not re.match(r"^projects/[^/]+/locations/[^/]+/dataAgents/[^/]+$", agent_path):
            raise HTTPException(400, "Invalid agent path format")
        return agent_path
    if body.profile:
        if not isinstance(body.profile, str) or not re.match(r"^[a-zA-Z0-9_-]+$", body.profile):
            raise HTTPException(400, "Invalid profile key format")
        prof = PROFILES.get(body.profile)
        if not prof:
            raise HTTPException(400, "Unknown profile")
        agent_path = prof.get("agent")
        if not agent_path:
            raise HTTPException(400, "No agent configured for this profile")
        return agent_path
    raise HTTPException(400, "Provide either agent (GCP agent resource name) or profile (local key).")


def _validate_chat_body(body: ChatBody) -> None:
    """Validate chat body. Raises HTTPException if invalid."""
    if not isinstance(body.message, str):
        raise HTTPException(400, "Message must be a string")
    if len(body.message.strip()) == 0:
        raise HTTPException(400, "Message cannot be empty")
    if len(body.message) > 10000:
        raise HTTPException(400, "Message is too long (max 10000 characters)")
    if body.history:
        if not isinstance(body.history, list):
            raise HTTPException(400, "History must be an array")
        if len(body.history) > 100:
            raise HTTPException(400, "History is too long (max 100 messages)")
        for item in body.history:
            if not isinstance(item, dict) or "role" not in item or "content" not in item:
                raise HTTPException(400, "Invalid history item format")
            if item["role"] not in ("user", "assistant"):
                raise HTTPException(400, "Invalid role in history")
            if not isinstance(item["content"], str) or len(item["content"]) > 10000:
                raise HTTPException(400, "Invalid content in history")


def _generate_chat_stream(body: ChatBody):
    """Generator that yields SSE events for live CoT and final response."""
    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    try:
        agent_path = _resolve_agent_path_from_body(body)
        _validate_chat_body(body)
        max_turns = body.maxTurns if body.maxTurns is not None else 6
        if not isinstance(max_turns, int) or max_turns < 1 or max_turns > 50:
            max_turns = 6
        agent_id = (agent_path or "").split("/")[-1] if agent_path else ""
        currency = _get_agent_currency(agent_id)
        currency_instruction = _build_currency_instruction(currency) if currency else None
        date_instruction = _build_date_instruction()
        prompt = _build_prompt_with_history(body.message, body.history or [], max_turns=max_turns, currency_instruction=currency_instruction, date_instruction=date_instruction)
        messages = [{"text": prompt}]
        t0 = time.perf_counter()
        cot_step_num = 1
        cot_parts: List[str] = []
        result: Optional[List[Dict[str, Any]]] = None
        try:
            for msg, accumulated in _iter_streaming_messages(agent_path, messages):
                result = accumulated
                step_info = _extract_cot_step_from_message(msg)
                if step_info:
                    label, content = step_info
                    part = content.strip() if label in ("Reasoning", "Progress") else _to_narrative_cot(label, content)
                    if part:
                        cot_parts.append(part)
                        yield sse("cot_step", {"step": cot_step_num, "label": label, "content": part, "chainOfThought": "\n\n".join(cot_parts)})
                        cot_step_num += 1
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Stream error: %s", e)
            yield sse("error", {"message": str(e)})
            return
        if result is None:
            # Fallback: use non-streaming call if stream yielded nothing
            result = ca_chat_with_agent_context(agent_path, messages)
            if isinstance(result, list):
                pass
            elif isinstance(result, dict):
                result = result.get("messages") or result.get("contents") or [result]
            else:
                result = [result] if result else []
        generation_seconds = round(time.perf_counter() - t0, 1)
        answer_text = _best_text(result) or ""
        charts, cleaned_answer = extract_charts_and_clean(answer_text, result)
        artifacts = {
            "sql": _find_sql_snippets(result),
            "tables": _find_table_refs(result),
            "jobs": _find_jobs(result),
            "rows": _first_tabular_rows(result),
            "charts": charts,
        }
        final_answer = cleaned_answer
        if _looks_like_sql_text(final_answer):
            from_rows = _bullets_from_first_row(artifacts["rows"])
            final_answer = from_rows if from_rows else "I generated a query to answer your question. See the SQL panel below."
        final_answer = _format_followup_questions_as_list(final_answer)
        chain_of_thought = "\n\n".join(cot_parts) if cot_parts else _extract_chain_of_thought(result)
        # No fallback from SQL - user sees SQL in the SQL panel
        exact_error = _extract_raw_error(result)
        yield sse("done", {
            "answer": final_answer,
            "artifacts": artifacts,
            "generationTimeSeconds": generation_seconds,
            "chainOfThought": chain_of_thought,
            "exactError": exact_error,
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Chat stream setup error: %s", e)
        yield sse("error", {"message": str(e)})


@app.post("/api/chat/stream")
def chat_stream(body: ChatBody):
    """
    Streaming chat endpoint: emits live CoT steps via SSE, then a final 'done' event.
    Preserves same response shape as /api/chat in the 'done' event.
    """
    return StreamingResponse(
        _generate_chat_stream(body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )