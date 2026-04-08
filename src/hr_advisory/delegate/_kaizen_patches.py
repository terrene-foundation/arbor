# Copyright 2026 Terrene Foundation
# SPDX-License-Identifier: Apache-2.0

"""Runtime patches for kaizen-agents bugs that block the Ollama provider.

These patches are applied at import time and are reversible by removing the
import. Each patch documents the upstream issue link and the exact line
being patched. Once kaizen-agents ships a fix, the corresponding patch
should be removed and the kaizen-agents version pinned in pyproject.toml.

Per `rules/zero-tolerance.md` Rule 4: SDK bugs should be fixed upstream,
not worked around. The exception here is documented:
- We have filed the upstream issue (see UPSTREAM_ISSUE constants below)
- The patch is isolated to a single module that is easy to delete
- The patch is verified by a regression test in tests/regression/

Bugs patched:

M4 — `_convert_messages_for_ollama` does not unwrap stringified tool-call
arguments before sending the assistant message back to Ollama. The kaizen
loop stores tool_call.function.arguments as a JSON STRING (OpenAI format),
but Ollama's `/api/chat` expects an OBJECT in `tool_calls[].function.arguments`.
Sending the string back triggers Ollama 400: "Value looks like object, but
can't find closing '}' symbol".

Verified bug at API level by `tests/regression/test_regression_M4_kaizen_ollama_tool_args.py`.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

UPSTREAM_ISSUE_M4 = "https://github.com/terrene-foundation/kailash-py/issues/361"


def _patch_ollama_message_converter() -> None:
    """Patch kaizen-agents OllamaStreamAdapter to unwrap stringified tool-call args.

    The original `_convert_messages_for_ollama` passes tool_calls through
    unchanged. The kaizen loop stores them in OpenAI format (arguments as
    JSON string). Ollama's /api/chat expects arguments as an object, so the
    second-turn tool-result message gets rejected with HTTP 400.

    This patch wraps the original function: every assistant message with
    tool_calls has its arguments unwrapped from JSON strings back to objects
    before being sent to Ollama.
    """
    import kaizen_agents.delegate.adapters.ollama_adapter as _ollama_mod

    if getattr(_ollama_mod, "_arbor_m4_patched", False):
        return  # already patched

    original_converter = _ollama_mod._convert_messages_for_ollama

    def _patched_converter(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Wrap original converter with stringified-args unwrapping."""
        converted = original_converter(messages)
        for msg in converted:
            if msg.get("role") != "assistant":
                continue
            tool_calls = msg.get("tool_calls")
            if not tool_calls:
                continue
            fixed_calls = []
            for tc in tool_calls:
                if not isinstance(tc, dict):
                    fixed_calls.append(tc)
                    continue
                func = tc.get("function")
                if not isinstance(func, dict):
                    fixed_calls.append(tc)
                    continue
                args = func.get("arguments")
                if isinstance(args, str):
                    # OpenAI-style stringified arguments — unwrap to object
                    try:
                        parsed = json.loads(args) if args else {}
                    except json.JSONDecodeError:
                        logger.warning(
                            "M4 patch: could not unwrap tool args, sending as-is: %r",
                            args[:80],
                        )
                        fixed_calls.append(tc)
                        continue
                    new_func = dict(func)
                    new_func["arguments"] = parsed
                    new_tc = dict(tc)
                    new_tc["function"] = new_func
                    fixed_calls.append(new_tc)
                else:
                    fixed_calls.append(tc)
            msg["tool_calls"] = fixed_calls
        return converted

    _ollama_mod._convert_messages_for_ollama = _patched_converter
    _ollama_mod._arbor_m4_patched = True
    logger.info(
        "Applied kaizen-agents M4 patch: OllamaStreamAdapter tool-call args unwrap. "
        "Upstream: %s",
        UPSTREAM_ISSUE_M4,
    )


# Apply patches at import time
_patch_ollama_message_converter()
