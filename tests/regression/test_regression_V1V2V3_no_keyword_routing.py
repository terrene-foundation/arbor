"""Regression: V1/V2/V3 — regex-based pre-filtering of user input.

Pre-fix: workflows/guardrails.py contained ~25 regex patterns that
pre-filtered user input before the Delegate saw it. This caused
paraphrased queries to bypass the canned refusals while legitimate
queries were blocked.

Post-fix (T121, T122): input-side regex screens deleted; refusal policy
moved into the system prompt where the LLM can reason about intent.

NEVER delete this test.
"""

from __future__ import annotations

import pytest

import hr_advisory.workflows.guardrails as guardrails


@pytest.mark.regression
def test_V1V2V3_no_input_side_regex_classifiers():
    """Regression: V1/V2/V3 — input-side regex classifiers must not exist.

    These symbols were removed in T121. If any resurfaced, it means
    someone re-introduced input-side pre-filtering that bypasses the
    autonomous Delegate's reasoning.
    """
    forbidden = [
        "_CIRCUMVENTION_PATTERNS",
        "_INJECTION_PATTERNS",
        "_ESCALATION_PATTERNS",
        "_HR_SCOPE_KEYWORDS",
        "_OFF_TOPIC_PATTERNS",
        "screen_query",
        "screen_injection",
        "screen_scope",
    ]
    for symbol in forbidden:
        assert not hasattr(guardrails, symbol), (
            f"{symbol} resurfaced in workflows/guardrails.py — autonomy violation. "
            f"See plan 06 phase 7.5 for context."
        )


@pytest.mark.regression
def test_V1V2V3_screen_response_output_guard_preserved():
    """The output-side guard (screen_response) must still exist.

    Only input-side screens were removed. screen_response is the output
    guard for TAFEP compliance and prompt leak detection.
    """
    assert hasattr(
        guardrails, "screen_response"
    ), "screen_response was removed — the output guard is required"
    assert callable(guardrails.screen_response)


@pytest.mark.regression
def test_V1V2V3_content_filter_patterns_still_exist():
    """_CONTENT_FILTER_PATTERNS (output-side) must still exist.

    These are the TAFEP compliance patterns used by screen_response.
    They are NOT input-side classifiers — they guard the LLM's output.
    """
    assert hasattr(
        guardrails, "_CONTENT_FILTER_PATTERNS"
    ), "_CONTENT_FILTER_PATTERNS was removed — output content filtering is required"
