"""Unit tests for guardrails symbol removal (T121-T122, V1/V2/V3).

Verifies that input-side regex classifiers were permanently removed from
workflows/guardrails.py and that advisory.py does not call screen_query.
"""

from __future__ import annotations

import ast
import pathlib

import hr_advisory.workflows.guardrails as guardrails


class TestGuardrailsNoInputSideRegex:
    """V1/V2/V3: input-side regex classifiers must not exist."""

    def test_workflows_guardrails_no_circumvention_patterns_remain(self) -> None:
        """_CIRCUMVENTION_PATTERNS was removed in T121."""
        assert not hasattr(
            guardrails, "_CIRCUMVENTION_PATTERNS"
        ), "_CIRCUMVENTION_PATTERNS resurfaced in guardrails.py — autonomy violation"

    def test_workflows_guardrails_no_injection_patterns_remain(self) -> None:
        """_INJECTION_PATTERNS was removed in T121."""
        assert not hasattr(
            guardrails, "_INJECTION_PATTERNS"
        ), "_INJECTION_PATTERNS resurfaced in guardrails.py — autonomy violation"

    def test_workflows_guardrails_no_escalation_patterns_remain(self) -> None:
        """_ESCALATION_PATTERNS was removed in T121."""
        assert not hasattr(
            guardrails, "_ESCALATION_PATTERNS"
        ), "_ESCALATION_PATTERNS resurfaced in guardrails.py — autonomy violation"

    def test_workflows_guardrails_no_hr_scope_keywords(self) -> None:
        """_HR_SCOPE_KEYWORDS was removed in T121."""
        assert not hasattr(
            guardrails, "_HR_SCOPE_KEYWORDS"
        ), "_HR_SCOPE_KEYWORDS resurfaced in guardrails.py — autonomy violation"

    def test_workflows_guardrails_no_off_topic_patterns(self) -> None:
        """_OFF_TOPIC_PATTERNS was removed in T121."""
        assert not hasattr(
            guardrails, "_OFF_TOPIC_PATTERNS"
        ), "_OFF_TOPIC_PATTERNS resurfaced in guardrails.py — autonomy violation"

    def test_workflows_guardrails_no_screen_query(self) -> None:
        """screen_query function was removed in T121."""
        assert not hasattr(
            guardrails, "screen_query"
        ), "screen_query resurfaced in guardrails.py — autonomy violation"

    def test_workflows_guardrails_no_screen_injection(self) -> None:
        """screen_injection function was removed in T121."""
        assert not hasattr(
            guardrails, "screen_injection"
        ), "screen_injection resurfaced in guardrails.py — autonomy violation"

    def test_workflows_guardrails_no_screen_scope(self) -> None:
        """screen_scope function was removed in T121."""
        assert not hasattr(
            guardrails, "screen_scope"
        ), "screen_scope resurfaced in guardrails.py — autonomy violation"

    def test_workflows_guardrails_screen_response_still_exists(self) -> None:
        """screen_response (output guard) must still exist."""
        assert hasattr(
            guardrails, "screen_response"
        ), "screen_response was accidentally removed — output guard is required"
        assert callable(guardrails.screen_response)


class TestAdvisoryRouterNoScreenQuery:
    """advisory.py must not call screen_query (AST check)."""

    def test_advisory_router_does_not_call_screen_query(self) -> None:
        """AST walk: advisory.py must not contain any call to screen_query."""
        advisory_path = (
            pathlib.Path(__file__).resolve().parents[2]
            / "src"
            / "hr_advisory"
            / "api"
            / "routers"
            / "advisory.py"
        )
        assert advisory_path.exists(), f"advisory.py not found at {advisory_path}"

        tree = ast.parse(advisory_path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                # Direct call: screen_query(...)
                if isinstance(func, ast.Name) and func.id == "screen_query":
                    raise AssertionError(
                        f"advisory.py line {node.lineno}: direct call to screen_query — "
                        "input-side screening was removed in T121"
                    )
                # Attribute call: guardrails.screen_query(...)
                if isinstance(func, ast.Attribute) and func.attr == "screen_query":
                    raise AssertionError(
                        f"advisory.py line {node.lineno}: call to *.screen_query — "
                        "input-side screening was removed in T121"
                    )
