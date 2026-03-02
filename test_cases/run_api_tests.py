#!/usr/bin/env python3
"""
Run backend API test cases from test_cases/ one at a time.
Requires: backend running on BASE_URL (default http://localhost:8080).
Usage: python run_api_tests.py [--base-url URL]
"""
import argparse
import json
import sys

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

BASE_URL = "http://localhost:8080"
RESULTS = []
VERBOSE = False


def run(name, fn):
    """Run one test and record result."""
    try:
        fn()
        RESULTS.append((name, True, None))
        print(f"  PASS: {name}")
        return True
    except AssertionError as e:
        RESULTS.append((name, False, str(e)))
        print(f"  FAIL: {name} — {e}")
        return False
    except Exception as e:
        RESULTS.append((name, False, str(e)))
        print(f"  ERROR: {name} — {e}")
        return False


def _log(method, path, status, body=None):
    if not VERBOSE:
        return
    line = f"    [AUDIT] {method} {path} -> {status}"
    if body is not None:
        if isinstance(body, dict):
            preview = json.dumps(body)[:200] + ("..." if len(json.dumps(body)) > 200 else "")
        else:
            preview = str(body)[:200] + ("..." if len(str(body)) > 200 else "")
        line += f" | body: {preview}"
    print(line)


def get(path, expected_status=200):
    r = requests.get(f"{BASE_URL}{path}", timeout=30)
    out = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
    _log("GET", path, r.status_code, out if VERBOSE and isinstance(out, dict) else None)
    assert r.status_code == expected_status, f"GET {path}: expected {expected_status}, got {r.status_code}"
    return out


def post(path, json_body=None, expected_status=None):
    r = requests.post(f"{BASE_URL}{path}", json=json_body or {}, timeout=60)
    out = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
    _log("POST", path, r.status_code, out if VERBOSE and isinstance(out, dict) else None)
    if expected_status is not None:
        assert r.status_code == expected_status, f"POST {path}: expected {expected_status}, got {r.status_code}"
    return out


def main():
    global BASE_URL
    global VERBOSE
    p = argparse.ArgumentParser(description="Run backend API tests one at a time")
    p.add_argument("--base-url", default="http://localhost:8080", help="Backend base URL")
    p.add_argument("--verbose", "-v", action="store_true", help="Audit log: print request/response per test")
    args = p.parse_args()
    BASE_URL = args.base_url.rstrip("/")
    VERBOSE = args.verbose

    print(f"Backend: {BASE_URL}")
    if VERBOSE:
        print("Audit logging: ON (request/response summary per test)\n")
    print("Running test cases one at a time...\n")

    # --- TC-API-003: GET /api/agents ---
    def test_list_agents():
        data = get("/api/agents")
        assert isinstance(data, dict), "Response should be an object with agents/meta"
        agents = data.get("agents", data) if isinstance(data.get("agents"), list) else (data if isinstance(data, list) else [])
        if not isinstance(agents, list):
            agents = []
        for item in agents:
            assert "agent" in item or "path" in item, "Each agent should have agent or path"
            assert "label" in item or "key" in item, "Each agent should have label or key"

    run("TC-API-003: GET /api/agents – list agents", test_list_agents)

    # --- TC-API-001 style: POST /api/chat (need agent or profile) ---
    def test_chat_success():
        data = get("/api/agents")
        agents = (data.get("agents") or []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        if not agents:
            raise AssertionError("No agents to chat with; create one or add ca_profiles")
        first = agents[0]
        agent_path = first.get("agent") or first.get("path")
        profile = first.get("key")
        body = {"message": "What is 2+2? (short answer)", "history": []}
        if agent_path:
            body["agent"] = agent_path
        elif profile:
            body["profile"] = profile
        else:
            raise AssertionError("Agent has no agent path or key")
        data = post("/api/chat", body)
        assert isinstance(data, dict), "Chat response should be JSON object"
        assert "answer" in data or "text" in data or "message" in data, "Response should contain answer/text/message"
        if "generationTimeSeconds" in data:
            assert isinstance(data["generationTimeSeconds"], (int, float)), "generationTimeSeconds should be number"

    run("TC-API-001: POST /api/chat – successful query", test_chat_success)

    # --- TC-API-002: POST /api/chat with history ---
    def test_chat_with_history():
        data = get("/api/agents")
        agents = (data.get("agents") or []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        if not agents:
            raise AssertionError("No agents")
        first = agents[0]
        agent_path = first.get("agent") or first.get("path")
        profile = first.get("key")
        body = {
            "message": "What was the previous number?",
            "history": [
                {"role": "user", "content": "What is 5+5?"},
                {"role": "assistant", "content": "The answer is 10."},
            ],
        }
        if agent_path:
            body["agent"] = agent_path
        else:
            body["profile"] = profile
        data = post("/api/chat", body)
        assert isinstance(data, dict)
        assert "answer" in data or "text" in data or "message" in data

    run("TC-API-002: POST /api/chat – with conversation history", test_chat_with_history)

    # --- TC-API-010: Input validation – empty message ---
    def test_chat_empty_message():
        data = get("/api/agents")
        agents = (data.get("agents") or []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        first = agents[0] if agents else {}
        body = {"message": "", "history": []}
        if first.get("agent"):
            body["agent"] = first["agent"]
        elif first.get("key"):
            body["profile"] = first["key"]
        else:
            body["agent"] = "projects/x/locations/global/dataAgents/fake"
        post("/api/chat", body, expected_status=400)

    run("TC-API-010: Input validation – empty message (expect 400)", test_chat_empty_message)

    # --- TC-API-011: Missing agent and profile ---
    def test_chat_missing_agent():
        post("/api/chat", {"message": "Hello", "history": []}, expected_status=400)

    run("TC-API-011: Input validation – missing agent/profile (expect 400)", test_chat_missing_agent)

    # --- GET /api/sources ---
    def test_list_sources():
        data = get("/api/sources")
        assert isinstance(data, dict), "Sources response should be object"
        assert "sources" in data or "meta" in data, "Should have sources or meta"

    run("TC-API-007 style: GET /api/sources – list data sources", test_list_sources)

    # --- Security headers ---
    def test_security_headers():
        r = requests.get(f"{BASE_URL}/api/agents", timeout=10)
        header_names = [h.lower() for h in r.headers]
        assert "x-content-type-options" in header_names, "X-Content-Type-Options should be present"
        assert any(
            h in ["x-frame-options", "content-security-policy"] for h in header_names
        ), "Security header (X-Frame-Options or CSP) expected"

    run("TC-API-008: Security headers present", test_security_headers)

    # --- Health ---
    def test_healthz():
        data = get("/healthz")
        assert data.get("ok") is True or data.get("ok") == "true", "healthz should return ok"

    run("Health: GET /healthz", test_healthz)

    # Summary
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    print(f"\n--- Summary: {passed}/{total} passed ---")
    if passed < total:
        for name, ok, err in RESULTS:
            if not ok:
                print(f"  FAIL: {name} — {err}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
