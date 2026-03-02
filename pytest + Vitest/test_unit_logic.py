"""
Unit tests for backend pure-logic functions.

Covers guard rails, prompt building, SQL detection, chart extraction, input
validation, and cache logic. No network or GCP calls — fast & deterministic.

Business context: A marketing analytics platform must guarantee that every
agent carries data-integrity guardrails, SQL never leaks into chat answers,
and chart specs are correctly extracted for campaign dashboards.
"""
import json
import pytest
from unittest.mock import patch

# sys.path is set by conftest.py (backend dir first) so "import main" loads backend/main.py


# ======================================================================
# GUARD RAILS
# ======================================================================
class TestGuardRails:
    """
    Compliance requires every agent to carry 7 layers of guard rails. If any
    layer is missing, an agent could fabricate campaign metrics or respond
    with jokes instead of ROAS analysis.
    """

    def test_guard_rails_delimiter_format(self):
        """Delimiter must match frontend GUARD_RAILS_DELIMITER exactly so
        the Agent Manager can split user instruction from guard rails."""
        from main import GUARD_RAILS_DELIMITER
        assert GUARD_RAILS_DELIMITER == "\n\n--- GUARD RAILS (DO NOT EDIT) ---\n\n"

    def test_guard_rails_body_contains_all_seven_layers(self):
        """Every mandatory layer must be present in the backend body text."""
        from main import GUARD_RAILS_BODY
        for i in range(1, 8):
            assert f"Layer {i}" in GUARD_RAILS_BODY, f"Layer {i} missing from guard rails"

    def test_layer_1_scope_enforcement(self):
        """Layer 1 blocks jokes, poems, roleplay — not analysis tasks."""
        from main import GUARD_RAILS_BODY
        assert "Scope Enforcement" in GUARD_RAILS_BODY
        assert "jokes" in GUARD_RAILS_BODY
        assert "poems" in GUARD_RAILS_BODY
        assert "roleplay" in GUARD_RAILS_BODY

    def test_layer_2_sql_output_contract(self):
        """Layer 2 enforces raw SQL formatting so the artifacts panel
        receives clean SQL, not markdown-wrapped SQL."""
        from main import GUARD_RAILS_BODY
        assert "Output Contract" in GUARD_RAILS_BODY
        assert "raw SQL only" in GUARD_RAILS_BODY

    def test_layer_3_no_fabrication_rule(self):
        """Layer 3 is the single most important safety net — a marketing
        analyst must never get a made-up ROAS number."""
        from main import GUARD_RAILS_BODY
        assert "Data Integrity" in GUARD_RAILS_BODY
        assert "Never fabricate" in GUARD_RAILS_BODY

    def test_layer_6_quality_preservation(self):
        """Guard rails must not degrade valid analytical answers."""
        from main import GUARD_RAILS_BODY
        assert "Response Quality" in GUARD_RAILS_BODY
        assert "never degrade valid responses" in GUARD_RAILS_BODY

    def test_layer_7_mixed_request_handling(self):
        """Valid analysis must be completed even when mixed with off-topic content."""
        from main import GUARD_RAILS_BODY
        assert "Mixed Request" in GUARD_RAILS_BODY
        assert "complete the valid analytical portion" in GUARD_RAILS_BODY

    def test_guard_rails_appended_to_user_instruction(self):
        """When saving an instruction, guard rails auto-append."""
        from main import GUARD_RAILS, GUARD_RAILS_DELIMITER
        user_instruction = "Always report confidence intervals on conversion metrics."
        combined = user_instruction + GUARD_RAILS
        assert combined.startswith(user_instruction)
        assert GUARD_RAILS_DELIMITER in combined
        assert "Layer 1" in combined
        assert "Layer 7" in combined

    def test_empty_instruction_still_gets_guard_rails(self):
        """Even empty instruction must carry guard rails."""
        from main import GUARD_RAILS
        combined = "" + GUARD_RAILS
        assert "Layer 1" in combined
        assert "Layer 7" in combined


# ======================================================================
# PROMPT BUILDER (multi-turn context) — _build_prompt_with_history
# ======================================================================
class TestPromptBuilder:
    """
    A CMO drilling into campaign data sends follow-ups like 'Break that
    down by channel'. The prompt builder carries conversation context.
    """

    def test_no_history_returns_raw_message(self):
        from main import _build_prompt_with_history
        assert _build_prompt_with_history("What was Q1 spend?", None) == "What was Q1 spend?"

    def test_empty_history_returns_raw_message(self):
        from main import _build_prompt_with_history
        assert _build_prompt_with_history("What was Q1 spend?", []) == "What was Q1 spend?"

    def test_history_included_in_prompt(self):
        from main import _build_prompt_with_history
        history = [
            {"role": "user", "content": "What was total Q1 spend?"},
            {"role": "assistant", "content": "Total Q1 spend was $1.2M."},
        ]
        result = _build_prompt_with_history("Break that down by channel", history)
        assert "Context from previous conversation:" in result
        assert "User: What was total Q1 spend?" in result
        assert "Assistant: Total Q1 spend was $1.2M." in result
        assert result.endswith("Assistant:")

    def test_history_respects_max_turns(self):
        """With max_turns=2, only the last 2 messages are included."""
        from main import _build_prompt_with_history
        history = [{"role": "user", "content": f"Question {i}"} for i in range(10)]
        result = _build_prompt_with_history("Final question", history, max_turns=2)
        assert "Question 8" in result
        assert "Question 9" in result
        assert "Question 0" not in result

    def test_history_skips_malformed_items(self):
        """Entries missing role/content are silently dropped."""
        from main import _build_prompt_with_history
        history = [
            {"role": "user", "content": "Valid message"},
            {"bad": "entry"},  # no role/content
            {"role": "assistant"},  # no content key
        ]
        result = _build_prompt_with_history("Next question", history)
        assert "Valid message" in result

    def test_default_max_turns_is_6(self):
        """Default max_turns from _build_prompt_with_history signature is 6."""
        from main import _build_prompt_with_history
        history = [{"role": "user", "content": f"Q{i}"} for i in range(20)]
        result = _build_prompt_with_history("Final", history)
        # Should include last 6: Q14..Q19
        assert "Q14" in result
        assert "Q13" not in result


# ======================================================================
# SQL DETECTION — _looks_like_sql_text
# ======================================================================
class TestSqlDetection:
    """
    When the AI returns SQL as its answer, the backend must redirect it to
    the artifacts panel. A media buyer should see '$2.34 CPC', not a
    SELECT statement.
    """

    def test_select_statement_detected(self):
        from main import _looks_like_sql_text
        assert _looks_like_sql_text("SELECT channel, SUM(spend) FROM ad_spend GROUP BY channel;") is True

    def test_with_cte_detected(self):
        from main import _looks_like_sql_text
        assert _looks_like_sql_text("WITH cte AS (SELECT * FROM ad_spend) SELECT * FROM cte;") is True

    def test_insert_detected(self):
        from main import _looks_like_sql_text
        assert _looks_like_sql_text("INSERT INTO ad_spend VALUES (1, 2, 3);") is True

    def test_plain_english_not_detected(self):
        from main import _looks_like_sql_text
        assert _looks_like_sql_text("The total spend was $1.2M across all channels.") is False

    def test_partial_sql_keywords_not_triggered(self):
        """'Please select the campaign' is English, not SQL."""
        from main import _looks_like_sql_text
        assert _looks_like_sql_text("Please select the campaign you want to analyze.") is False

    def test_sql_snippets_extracted_from_nested_response(self):
        from main import _find_sql_snippets
        response = {
            "contents": [
                {"parts": ["SELECT channel, SUM(spend) AS total FROM `mktg-prod.ad_spend` GROUP BY channel;"]}
            ]
        }
        snippets = _find_sql_snippets(response)
        assert len(snippets) >= 1
        assert "SELECT" in snippets[0]

    def test_duplicate_sql_snippets_deduped(self):
        from main import _find_sql_snippets
        sql = "SELECT channel FROM ad_spend GROUP BY channel;"
        response = {"a": sql, "b": sql}
        assert len(_find_sql_snippets(response)) == 1


# ======================================================================
# CHART EXTRACTION — extract_charts_and_clean
# ======================================================================
class TestChartExtraction:
    """
    The AI often returns Vega-Lite specs inline. The frontend needs clean
    specs in artifacts.charts and the JSON removed from visible text.
    """

    def test_vegalite_spec_detected_by_schema(self):
        from main import _looks_like_vegalite_spec
        spec = {"$schema": "https://vega.github.io/schema/vega-lite/v5.json", "data": {}, "mark": "bar", "encoding": {}}
        assert _looks_like_vegalite_spec(spec) is True

    def test_vegalite_spec_detected_by_structure(self):
        """Even without $schema, presence of data+encoding+mark is enough."""
        from main import _looks_like_vegalite_spec
        assert _looks_like_vegalite_spec({"data": {}, "encoding": {}, "mark": "point"}) is True

    def test_plain_dict_not_detected_as_chart(self):
        from main import _looks_like_vegalite_spec
        assert _looks_like_vegalite_spec({"channel": "Google", "spend": 100}) is False

    def test_non_dict_not_detected(self):
        from main import _looks_like_vegalite_spec
        assert _looks_like_vegalite_spec("not a dict") is False
        assert _looks_like_vegalite_spec(42) is False

    def test_normalize_adds_defaults(self):
        from main import _normalize_vegalite_spec
        spec = {"data": {"values": []}, "mark": "bar", "encoding": {}}
        result = _normalize_vegalite_spec(spec)
        assert result["$schema"] == "https://vega.github.io/schema/vega-lite/v5.json"
        assert result["width"] == "container"
        assert result["height"] == 260

    def test_fenced_vegalite_extracted_and_cleaned(self):
        """Fenced ```vega-lite block must be extracted and removed from text."""
        from main import extract_charts_and_clean
        chart_json = json.dumps({
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "data": {"values": [{"channel": "Google", "spend": 560385}]},
            "mark": "bar",
            "encoding": {
                "x": {"field": "channel", "type": "nominal"},
                "y": {"field": "spend", "type": "quantitative"},
            },
        })
        answer = f"Here is the breakdown:\n\n```vega-lite\n{chart_json}\n```\n\nGoogle led spend."
        charts, cleaned = extract_charts_and_clean(answer, {})
        assert len(charts) >= 1
        assert "```" not in cleaned
        assert "Google led spend" in cleaned

    def test_charts_deduped(self):
        """Same chart in fenced block and full result → only one entry."""
        from main import extract_charts_and_clean
        spec = {
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "data": {"values": [{"x": 1}]},
            "mark": "point",
            "encoding": {"x": {"field": "x", "type": "quantitative"}},
        }
        answer = f"```json\n{json.dumps(spec)}\n```"
        full_result = {"embedded_chart": spec}
        charts, _ = extract_charts_and_clean(answer, full_result)
        assert len(charts) == 1

    def test_none_answer_does_not_crash(self):
        from main import extract_charts_and_clean
        charts, cleaned = extract_charts_and_clean(None, {})
        assert charts == []
        assert isinstance(cleaned, str)


# ======================================================================
# TABLE REFERENCE EXTRACTION — _find_table_refs
# ======================================================================
class TestTableRefExtraction:

    def test_fqn_table_ref_extracted(self):
        from main import _find_table_refs
        refs = _find_table_refs({"sql": "SELECT * FROM `mktg-prod.campaign_performance.ad_spend`"})
        assert "mktg-prod.campaign_performance.ad_spend" in refs

    def test_duplicate_table_refs_deduped(self):
        from main import _find_table_refs
        sql = "SELECT * FROM `mktg-prod.campaign_performance.ad_spend` UNION SELECT * FROM `mktg-prod.campaign_performance.ad_spend`"
        assert _find_table_refs({"sql": sql}).count("mktg-prod.campaign_performance.ad_spend") == 1


# ======================================================================
# TABULAR ROW EXTRACTION — _first_tabular_rows
# ======================================================================
class TestTabularRows:

    def test_flat_rows_extracted(self):
        from main import _first_tabular_rows
        response = {
            "data": [
                {"channel": "Google", "spend": 560385, "impressions": 1200000},
                {"channel": "Meta", "spend": 373590, "impressions": 980000},
            ]
        }
        rows = _first_tabular_rows(response)
        assert rows is not None
        assert len(rows) == 2
        assert rows[0]["channel"] == "Google"

    def test_nested_dicts_skipped(self):
        from main import _first_tabular_rows
        assert _first_tabular_rows({"data": [{"complex": {"nested": "value"}}]}) is None

    def test_empty_list_returns_none(self):
        from main import _first_tabular_rows
        assert _first_tabular_rows({"data": []}) is None

    def test_bullets_from_first_row(self):
        from main import _bullets_from_first_row
        rows = [{"channel": "Google", "spend": 560385, "cpc": 2.34}]
        result = _bullets_from_first_row(rows)
        assert "channel: Google" in result
        assert "spend: 560385" in result

    def test_bullets_from_empty_rows_returns_none(self):
        from main import _bullets_from_first_row
        assert _bullets_from_first_row(None) is None
        assert _bullets_from_first_row([]) is None


# ======================================================================
# BEST TEXT EXTRACTION — _best_text
# ======================================================================
class TestBestText:

    def test_final_response_preferred(self):
        from main import _best_text
        response = {
            "contents": [
                {"textType": "SQL_QUERY", "parts": ["SELECT * FROM ad_spend;"]},
                {"textType": "FINAL_RESPONSE", "parts": ["Total Q1 spend was $1.2M."]},
            ]
        }
        assert _best_text(response) == "Total Q1 spend was $1.2M."

    def test_longest_non_sql_chosen_when_no_final_response(self):
        from main import _best_text
        response = {
            "a": "Short.",
            "b": "The total ad spend across all channels was $1,245,300 in Q1 2025. Google Ads was the top channel.",
        }
        assert "1,245,300" in _best_text(response)

    def test_empty_response_returns_none(self):
        from main import _best_text
        assert _best_text({}) is None


# ======================================================================
# INPUT VALIDATION REGEXES
# ======================================================================
class TestInputValidation:
    """
    These regexes are used in the actual chat, create-agent, and profile
    endpoints to reject malicious input before any GCP call is made.
    """

    def test_agent_path_regex_accepts_valid(self):
        import re
        pattern = r'^projects/[^/]+/locations/[^/]+/dataAgents/[^/]+$'
        assert re.match(pattern, "projects/mktg-prod/locations/global/dataAgents/q1-analyst")

    def test_agent_path_regex_rejects_traversal(self):
        import re
        pattern = r'^projects/[^/]+/locations/[^/]+/dataAgents/[^/]+$'
        assert re.match(pattern, "projects/../etc/passwd/locations/global/dataAgents/x") is None

    def test_agent_id_slug_must_be_lowercase(self):
        import re
        pattern = r'^[a-z0-9_-]+$'
        assert re.match(pattern, "q2-campaign-analyst")
        assert re.match(pattern, "Q2-Campaign") is None
        assert re.match(pattern, "has spaces") is None
        assert re.match(pattern, "has/slash") is None

    def test_profile_key_format(self):
        import re
        pattern = r'^[a-zA-Z0-9_-]+$'
        assert re.match(pattern, "test-campaign")
        assert re.match(pattern, "'; DROP TABLE --") is None


# ======================================================================
# CACHE LOGIC
# ======================================================================
class TestCacheLogic:
    """Cache tests save/restore module state so order and parallelism are safe."""

    def test_cache_invalidation_resets_state(self):
        import main
        from main import _invalidate_gcp_cache
        saved_cache = getattr(main, "_gcp_sources_cache", None)
        saved_time = getattr(main, "_gcp_sources_cache_time", 0)
        try:
            main._gcp_sources_cache = [{"key": "old"}]
            main._gcp_sources_cache_time = 999999
            _invalidate_gcp_cache()
            assert main._gcp_sources_cache is None
            assert main._gcp_sources_cache_time == 0
        finally:
            main._gcp_sources_cache = saved_cache
            main._gcp_sources_cache_time = saved_time

    def test_set_and_get_cache_roundtrip(self):
        import main
        from main import _set_cached_gcp_sources, _get_cached_gcp_sources
        saved_cache = getattr(main, "_gcp_sources_cache", None)
        saved_time = getattr(main, "_gcp_sources_cache_time", 0)
        try:
            main._gcp_sources_cache = None
            main._gcp_sources_cache_time = 0
            test_data = [{"key": "test-source", "agent": "projects/p/locations/l/dataAgents/a"}]
            _set_cached_gcp_sources(test_data, None)
            result, error = _get_cached_gcp_sources()
            assert result is not None
            assert len(result) == 1
            assert error is None
        finally:
            main._gcp_sources_cache = saved_cache
            main._gcp_sources_cache_time = saved_time
