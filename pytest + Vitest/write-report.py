#!/usr/bin/env python3
"""
Generate a human-readable test report (REPORT.md) from pytest.xml and vitest.json.
Each test is listed with a short description and Pass/Fail so a human can understand what was tested.
"""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def _pytest_name_to_description(classname: str, name: str) -> str:
    """Turn pytest classname and test name into a human-readable one-liner."""
    # Strip test_ prefix and replace underscores with spaces, then title-case
    short = name.replace("test_", "", 1).replace("_", " ").title()
    # Shorten classname: "TestHealthEndpoint" -> "Health endpoint", "TestSecurityHeaders" -> "Security headers"
    cls = classname.split(".")[-1] if "." in classname else classname
    if cls.startswith("Test"):
        cls = cls[4:]  # TestHealthEndpoint -> HealthEndpoint
    # Add space before capitals: HealthEndpoint -> Health Endpoint
    area = "".join(" " + c if c.isupper() else c for c in cls).strip()
    area = area.lower().capitalize() if area else "Backend"
    return f"{area}: {short}"


def _parse_pytest_xml(path: Path) -> list[dict]:
    """Return list of { description, passed, failure_message }."""
    if not path.exists():
        return []
    root = ET.parse(path).getroot()
    results = []
    for tc in root.iter("testcase"):
        classname = tc.get("classname", "")
        name = tc.get("name", "")
        desc = _pytest_name_to_description(classname, name)
        failure = tc.find("failure")
        if failure is not None:
            msg = (failure.text or "").strip()
            # Keep first line of failure message for report
            if msg:
                msg = msg.split("\n")[0][:200]
            results.append({"description": desc, "passed": False, "failure_message": msg})
        else:
            results.append({"description": desc, "passed": True, "failure_message": None})
    return results


def _parse_vitest_json(path: Path) -> list[dict]:
    """Return list of { description, passed, failure_message }."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    results = []
    for suite in data.get("testResults", []):
        for ar in suite.get("assertionResults", []):
            # fullName is already human-readable, e.g. "Markdown Detection ... detects ## heading"
            desc = ar.get("fullName") or ar.get("title") or "Frontend test"
            status = ar.get("status", "passed")
            passed = status == "passed"
            msgs = ar.get("failureMessages", [])
            failure_message = msgs[0][:200] if msgs else None
            results.append({"description": desc, "passed": passed, "failure_message": failure_message})
    return results


def write_report(log_dir: Path) -> None:
    """Write REPORT.md into log_dir."""
    pytest_results = _parse_pytest_xml(log_dir / "pytest.xml")
    vitest_results = _parse_vitest_json(log_dir / "vitest.json")

    pytest_passed = sum(1 for r in pytest_results if r["passed"])
    pytest_failed = len(pytest_results) - pytest_passed
    vitest_passed = sum(1 for r in vitest_results if r["passed"])
    vitest_failed = len(vitest_results) - vitest_passed

    lines = [
        "# Test Run Report",
        "",
        "Human-readable summary of what was tested and whether each test passed.",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Suite    | Passed | Failed | Total |",
        "|----------|--------|--------|-------|",
        f"| Backend  | {pytest_passed} | {pytest_failed} | {len(pytest_results)} |",
        f"| Frontend | {vitest_passed} | {vitest_failed} | {len(vitest_results)} |",
        "",
        "---",
        "",
        "## Backend tests (pytest)",
        "",
        "What each test does and whether it passed.",
        "",
    ]

    for r in pytest_results:
        status = "✅ Pass" if r["passed"] else "❌ Fail"
        lines.append(f"- **{status}** — {r['description']}")
        if not r["passed"] and r.get("failure_message"):
            lines.append(f"  - *Reason:* {r['failure_message']}")
        lines.append("")

    lines.extend([
        "---",
        "",
        "## Frontend tests (Vitest)",
        "",
        "What each test does and whether it passed.",
        "",
    ])

    for r in vitest_results:
        status = "✅ Pass" if r["passed"] else "❌ Fail"
        lines.append(f"- **{status}** — {r['description']}")
        if not r["passed"] and r.get("failure_message"):
            lines.append(f"  - *Reason:* {r['failure_message']}")
        lines.append("")

    report_path = log_dir / "REPORT.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written: {report_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python write-report.py <log_dir>", file=sys.stderr)
        sys.exit(1)
    log_dir = Path(sys.argv[1])
    if not log_dir.is_dir():
        print(f"Not a directory: {log_dir}", file=sys.stderr)
        sys.exit(1)
    write_report(log_dir)
