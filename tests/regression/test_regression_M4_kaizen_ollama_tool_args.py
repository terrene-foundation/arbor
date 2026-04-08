"""Regression: M4 — kaizen-agents OllamaStreamAdapter tool-call args bug.

The kaizen-agents adapter stores tool_call.function.arguments as a JSON
STRING (OpenAI format), but Ollama's `/api/chat` expects an OBJECT in
`tool_calls[].function.arguments`. Sending the string back on turn 2
triggers Ollama 400: "Value looks like object, but can't find closing
'}' symbol".

Our runtime patch in `hr_advisory.delegate._kaizen_patches` wraps
`_convert_messages_for_ollama` to unwrap the stringified arguments back
to objects before they reach Ollama.

This test verifies the patch is applied AND functional via direct unit
test of the patched converter — no live Ollama required for the
regression assertion.
"""

from __future__ import annotations

import json

import pytest

# Importing arbor_loop applies the patch
import hr_advisory.delegate.arbor_loop  # noqa: F401


@pytest.mark.regression
def test_M4_patch_unwraps_stringified_tool_call_args():
    """Patch must convert OpenAI-style stringified args to Ollama-style objects."""
    import kaizen_agents.delegate.adapters.ollama_adapter as ollama_mod

    # Verify the patch flag is set
    assert getattr(ollama_mod, "_arbor_m4_patched", False), "M4 patch not applied"

    # Build messages exactly as the kaizen loop would after a tool call:
    # assistant message with stringified tool_call arguments (OpenAI format)
    messages = [
        {"role": "user", "content": "Search the KB"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_123",
                    "type": "function",
                    "function": {
                        "name": "search_kb",
                        # OpenAI-style stringified args — kaizen loop format
                        "arguments": '{"query": "Section 12", "limit": 5}',
                    },
                }
            ],
        },
        {"role": "tool", "content": "[]"},
    ]

    converted = ollama_mod._convert_messages_for_ollama(messages)

    # The assistant message should have its tool_call args UNWRAPPED to a dict
    assistant_msg = converted[1]
    assert assistant_msg["role"] == "assistant"
    assert "tool_calls" in assistant_msg
    tc = assistant_msg["tool_calls"][0]
    args = tc["function"]["arguments"]
    assert isinstance(
        args, dict
    ), f"M4 regression: expected unwrapped dict, got {type(args).__name__}: {args!r}"
    assert args == {"query": "Section 12", "limit": 5}


@pytest.mark.regression
def test_M4_patch_preserves_already_object_args():
    """If args are already a dict (correct Ollama format), patch is a no-op."""
    import kaizen_agents.delegate.adapters.ollama_adapter as ollama_mod

    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "function": {
                        "name": "search_kb",
                        "arguments": {"query": "test"},  # already a dict
                    }
                }
            ],
        },
    ]

    converted = ollama_mod._convert_messages_for_ollama(messages)
    args = converted[0]["tool_calls"][0]["function"]["arguments"]
    assert args == {"query": "test"}
    assert isinstance(args, dict)


@pytest.mark.regression
def test_M4_patch_handles_malformed_json_gracefully():
    """If args string is not valid JSON, patch logs a warning and passes through."""
    import kaizen_agents.delegate.adapters.ollama_adapter as ollama_mod

    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "function": {
                        "name": "search_kb",
                        "arguments": "not valid json {",  # malformed
                    }
                }
            ],
        },
    ]

    # Should not raise; passes through as-is
    converted = ollama_mod._convert_messages_for_ollama(messages)
    args = converted[0]["tool_calls"][0]["function"]["arguments"]
    assert args == "not valid json {"


@pytest.mark.regression
def test_M4_patch_idempotent():
    """Re-applying the patch should be a no-op (the flag prevents double-wrapping)."""
    from hr_advisory.delegate._kaizen_patches import _patch_ollama_message_converter

    # Apply twice — should not double-wrap
    _patch_ollama_message_converter()
    _patch_ollama_message_converter()

    # The function should still work correctly
    import kaizen_agents.delegate.adapters.ollama_adapter as ollama_mod

    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "function": {
                        "name": "search_kb",
                        "arguments": '{"query": "test"}',
                    }
                }
            ],
        },
    ]
    converted = ollama_mod._convert_messages_for_ollama(messages)
    # Args still unwrapped to dict, not double-parsed or stringified
    args = converted[0]["tool_calls"][0]["function"]["arguments"]
    assert args == {"query": "test"}
