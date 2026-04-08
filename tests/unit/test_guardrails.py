"""Unit tests for the abuse prevention and guardrails module.

Tests response content filtering, confidence escalation, and rate limiting.
Input-side screening functions were removed in T122 — the autonomous Delegate
handles scope, injection, escalation, and circumvention via its system prompt.
"""

from __future__ import annotations

from hr_advisory.workflows.guardrails import (
    EscalationReason,
    ScreeningResult,
    check_confidence_escalation,
    check_rate_limit,
    screen_response,
)


class TestResponseScreening:
    """Test response content filtering for TAFEP compliance."""

    def test_clean_response_passes(self) -> None:
        """A clean response should pass content filtering."""
        result = screen_response(
            "Under the Employment Act, all employees are entitled to annual leave "
            "based on their years of service."
        )
        assert result.result == ScreeningResult.PASS

    def test_discriminatory_hiring_blocked(self) -> None:
        """Response suggesting discriminatory hiring should be blocked."""
        result = screen_response("You should only accept Chinese candidates for this role.")
        assert result.result == ScreeningResult.BLOCK

    def test_age_discrimination_blocked(self) -> None:
        """Response with age-discriminatory advice should be blocked."""
        result = screen_response("Set an age limit of 40 for new hires.")
        assert result.result == ScreeningResult.BLOCK

    def test_pregnancy_discrimination_blocked(self) -> None:
        """Response suggesting pregnancy discrimination should be blocked."""
        result = screen_response("Don't hire pregnant candidates.")
        assert result.result == ScreeningResult.BLOCK


class TestConfidenceEscalation:
    """Test confidence-based escalation."""

    def test_high_confidence_no_escalation(self) -> None:
        """High confidence should not trigger escalation."""
        result = check_confidence_escalation(0.9)
        assert result is None

    def test_medium_confidence_no_escalation(self) -> None:
        """Medium confidence (>= 0.5) should not trigger escalation."""
        result = check_confidence_escalation(0.5)
        assert result is None

    def test_low_confidence_escalation(self) -> None:
        """Low confidence (< 0.5) should trigger escalation."""
        result = check_confidence_escalation(0.3)
        assert result is not None
        assert result.result == ScreeningResult.ESCALATE
        assert result.escalation_reason == EscalationReason.LOW_CONFIDENCE


class TestRateLimiting:
    """Test in-memory rate limiting."""

    def test_first_request_allowed(self) -> None:
        """First request should always be allowed."""
        assert check_rate_limit("test-user-unique-1") is True

    def test_rate_limit_enforced(self) -> None:
        """Exceeding rate limit should return False."""
        user_id = "test-rate-limit-user"
        # Send 30 requests (the limit)
        for _ in range(30):
            check_rate_limit(user_id)
        # 31st should be blocked
        assert check_rate_limit(user_id) is False
