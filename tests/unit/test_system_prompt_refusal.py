"""Unit tests for system prompt Refusal Policy (T122).

Verifies that the Refusal Policy section is present, correctly positioned
before tool instructions, and contains all five refusal clauses.
"""

from __future__ import annotations


class TestRefusalPolicyPosition:
    """The Refusal Policy must appear before the tool-use section so the
    LLM applies refusal reasoning before deciding to call tools."""

    def test_system_prompt_refusal_policy_position(self) -> None:
        from hr_advisory.delegate.system_prompt import build_system_prompt

        prompt = build_system_prompt(company_context={}, user_context={})
        refusal_idx = prompt.find("## Refusal Policy")
        tools_idx = prompt.find("## Tools")
        assert refusal_idx > 0, "Refusal Policy heading missing"
        assert tools_idx > 0, "Tools heading missing"
        assert (
            refusal_idx < tools_idx
        ), "Refusal Policy must come BEFORE Tools so the LLM refuses before reaching for a tool."

    def test_system_prompt_contains_all_five_refusal_sections(self) -> None:
        from hr_advisory.delegate.system_prompt import build_system_prompt

        prompt = build_system_prompt(company_context={}, user_context={})
        for heading in [
            "### 1. Off-topic",
            "### 2. Prompt injection",
            "### 3. High-stakes escalation",
            "### 4. Circumvention",
            "### 5. Indirect injection",
        ]:
            assert heading in prompt, f"Missing refusal section: {heading}"

    def test_refusal_policy_before_base_role(self) -> None:
        """Refusal Policy should come after the base role description."""
        from hr_advisory.delegate.system_prompt import build_system_prompt

        prompt = build_system_prompt(company_context={}, user_context={})
        role_idx = prompt.find("You are Arbor")
        refusal_idx = prompt.find("## Refusal Policy")
        assert role_idx < refusal_idx, "Base role should come before Refusal Policy"

    def test_each_section_has_examples(self) -> None:
        """Each refusal section must contain at least one concrete example."""
        from hr_advisory.delegate.system_prompt import build_system_prompt

        prompt = build_system_prompt(company_context={}, user_context={})
        # Each section should have examples — look for the marker patterns
        assert "weather in Singapore" in prompt, "Off-topic section missing weather example"
        assert "Ignore previous instructions" in prompt, "Injection section missing example"
        assert "MOM" in prompt, "Escalation section missing MOM example"
        assert "avoid" in prompt.lower(), "Circumvention section missing avoidance example"
        assert (
            "search_kb result" in prompt
        ), "Indirect injection section missing tool output example"
