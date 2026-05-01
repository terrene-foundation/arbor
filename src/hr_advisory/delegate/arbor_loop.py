# Copyright 2026 Terrene Foundation
# SPDX-License-Identifier: Apache-2.0

"""Arbor Delegate — wires kaizen-agents Delegate with Arbor tools.

Uses the Delegate facade (kaizen-agents 0.4.0) which provides:
- True incremental token streaming via typed events (TextDelta, ToolCallStart, etc.)
- ToolHydrator for progressive tool disclosure (search_tools meta-tool)
- Budget tracking and enforcement
- Provider-agnostic (OpenAI, Ollama, vLLM, TGI, any OpenAI-compatible endpoint)
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

from kaizen_agents.delegate import Delegate, DelegateEvent, TextDelta, ErrorEvent
from kaizen_agents.delegate.adapters import StreamingChatAdapter
from kaizen_agents.delegate.loop import ToolRegistry

# Apply kaizen-agents runtime patches BEFORE any Delegate is constructed.
# Currently fixes M4: OllamaStreamAdapter tool-call args serialization.
import hr_advisory.delegate._kaizen_patches  # noqa: F401

from hr_advisory.delegate.system_prompt import build_system_prompt
from hr_advisory.delegate.tools import register_arbor_tools

logger = logging.getLogger(__name__)

__all__ = [
    "DelegateConfig",
    "create_delegate",
    "run_delegate_sync",
    "stream_delegate",
]


@dataclass
class DelegateConfig:
    """Configuration for the Arbor Delegate.

    When ``adapter`` is provided, the Delegate uses it directly (BYOK path).
    When ``adapter`` is None AND ``require_server_default`` is True, the
    request-context caller forgot to build an adapter — raise rather than
    falling through to env vars (C1 multi-tenant leak prevention).
    When ``adapter`` is None AND ``require_server_default`` is False, fall
    back to env-var resolution (legacy/script path).
    """

    model: str = ""
    api_key: str = field(default="", repr=False)
    base_url: str | None = None
    max_turns: int = 30
    budget_usd: float | None = None
    company_id: int | None = None
    jwt_token: str | None = None
    company_context: dict[str, Any] | None = None
    user_context: dict[str, Any] | None = None
    adapter: StreamingChatAdapter | None = None
    require_server_default: bool = False


def _resolve_llm_settings_from_env(
    config: DelegateConfig,
) -> tuple[str, str, str, str | None]:
    """Resolve provider, model, api_key, base_url from config + env vars.

    Used when ``DelegateConfig.adapter is None`` (legacy/script path).
    BYOK contexts MUST pass an explicit adapter via DelegateConfig.adapter.

    Resolution order:
    1. If OPENAI_API_KEY is set, use OpenAI via LLM_MODEL / OPENAI_PROD_MODEL.
    2. Else if OLLAMA_BASE_URL and OLLAMA_MODEL are set, use Ollama.
    3. Else fall back to the best-effort env values and let the downstream
       adapter factory raise a clear error.
    """
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    ollama_base_url = os.environ.get("OLLAMA_BASE_URL")
    ollama_model = os.environ.get("OLLAMA_MODEL")

    if config.api_key or openai_api_key:
        provider = "openai"
        model = (
            config.model
            or os.environ.get("LLM_MODEL")
            or os.environ.get("DEFAULT_LLM_MODEL")
            or os.environ.get("OPENAI_PROD_MODEL")
            or ""
        )
        api_key = config.api_key or openai_api_key or "not-needed"
        base_url = (
            config.base_url or os.environ.get("LLM_BASE_URL") or os.environ.get("OPENAI_BASE_URL")
        )
        return provider, model, api_key, base_url

    if ollama_base_url and ollama_model:
        # Arbor runs Ollama-first; this branch makes legacy/script/test paths
        # (e.g. run_delegate_sync in the adversarial runner) work without an
        # OpenAI key.
        return (
            "ollama",
            config.model or ollama_model,
            "not-needed",
            config.base_url or ollama_base_url,
        )

    # Last-ditch fallback: return whatever we have and let the adapter
    # factory raise a clear error downstream.
    return (
        "openai",
        config.model or os.environ.get("LLM_MODEL") or os.environ.get("DEFAULT_LLM_MODEL") or "",
        config.api_key or "not-needed",
        config.base_url,
    )


def create_delegate(config: DelegateConfig | None = None) -> Delegate:
    """Create an Arbor Delegate agent.

    Returns a Delegate instance ready for streaming via delegate.run(prompt).

    When ``config.adapter`` is provided, the adapter is passed directly to
    the Delegate — no env-var resolution occurs. When ``config.adapter`` is
    None and ``config.require_server_default`` is True, raises RuntimeError
    to prevent silent env-var fallback in request contexts (C1 fix).
    """
    if config is None:
        config = DelegateConfig()

    # Build tool registry with all Arbor tools
    registry = ToolRegistry()
    register_arbor_tools(
        registry,
        jwt_token=config.jwt_token,
        company_id=config.company_id,
    )

    # Build system prompt
    system_prompt = build_system_prompt(
        company_context=config.company_context,
        user_context=config.user_context,
    )

    if config.adapter is not None:
        # Per-request adapter injection (BYOK path) — no env mutation
        model = config.adapter._default_model
        logger.info(
            "Delegate LLM: adapter=%s, model=%s",
            type(config.adapter).__name__,
            model,
        )
        delegate = Delegate(
            model=model,
            tools=registry,
            system_prompt=system_prompt,
            max_turns=config.max_turns,
            budget_usd=config.budget_usd,
            adapter=config.adapter,
        )
    elif config.require_server_default:
        raise RuntimeError(
            "DelegateConfig.adapter is required in request context — env "
            "fallback is disabled to prevent multi-tenant key leakage. "
            "Build an adapter via build_adapter_from_context() first."
        )
    else:
        # Legacy/script/test path — resolve from env vars
        provider, model, api_key, base_url = _resolve_llm_settings_from_env(config)
        logger.info(
            "Delegate LLM: adapter=env-fallback, provider=%s, model=%s, base_url=%s",
            provider,
            model,
            base_url or "(default)",
        )
        if provider == "ollama":
            # Build an explicit Ollama adapter — kaizen-agents' model-only
            # resolution path defaults to OpenAI when no provider prefix is
            # present in the model string, which would fail without an API
            # key even though Ollama is serving locally.
            from kaizen_agents.delegate.adapters import get_adapter

            adapter = get_adapter(
                provider="ollama",
                model=model,
                api_key=api_key,
                base_url=base_url,
            )
            delegate = Delegate(
                model=model,
                tools=registry,
                system_prompt=system_prompt,
                max_turns=config.max_turns,
                budget_usd=config.budget_usd,
                adapter=adapter,
            )
        else:
            delegate = Delegate(
                model=model,
                tools=registry,
                system_prompt=system_prompt,
                max_turns=config.max_turns,
                budget_usd=config.budget_usd,
            )

    # Configure the hydrator's always-active tools so the LLM sees them
    # without needing to call search_tools first.
    _ALWAYS_ACTIVE = frozenset(
        {
            "search_tools",
            "search_kb",
            "calculate_cpf",
            "calculate_leave",
            "calculate_salary",
            "calculate_quota_levy",
            "get_company_context",
        }
    )
    if hasattr(delegate.loop, "_hydrator") and delegate.loop._hydrator is not None:
        delegate.loop._hydrator.base_tool_names = _ALWAYS_ACTIVE

    return delegate


def run_delegate_sync(
    prompt: str,
    config: DelegateConfig | None = None,
    conversation_history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Run the Delegate synchronously and return a result dict.

    Collects the full streamed response into a dict matching the format
    expected by /advisory/query:
        {response_text, risk_tier, confidence, domains, citations,
         tools_called, usage, degraded}

    Conversation history is prepended to the prompt as context.
    """
    import asyncio
    import re

    delegate = create_delegate(config)

    # Build the full prompt with conversation context
    full_prompt = prompt
    if conversation_history:
        context_parts = []
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if content:
                context_parts.append(f"[{role}]: {content}")
        if context_parts:
            full_prompt = (
                "Previous conversation:\n" + "\n".join(context_parts) + f"\n\n[user]: {prompt}"
            )

    # Collect full response
    text_parts: list[str] = []
    tools_called: list[str] = []
    usage_data: dict[str, int] = {"input_tokens": 0, "output_tokens": 0}

    async def _run() -> None:
        from kaizen_agents.delegate.loop import ToolCallStart

        async for event in delegate.run(full_prompt):
            if isinstance(event, TextDelta):
                text_parts.append(event.text)
            elif isinstance(event, ToolCallStart):
                tools_called.append(event.name)
            elif hasattr(event, "usage"):
                u = event.usage
                if hasattr(u, "prompt_tokens"):
                    usage_data["input_tokens"] += u.prompt_tokens
                if hasattr(u, "completion_tokens"):
                    usage_data["output_tokens"] += u.completion_tokens

    try:
        asyncio.run(_run())
    except RuntimeError:
        # Already in an async context — use a new event loop in a thread
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(lambda: asyncio.run(_run())).result(timeout=60)

    response_text = "".join(text_parts)

    # Strip leaked tool call JSON from response text.
    # The LLM sometimes emits tool call arguments as text before the actual
    # tool call event. These appear as JSON objects at the start of the response.
    stripped = response_text.lstrip()
    if stripped.startswith("{"):
        # Find the end of the JSON object and strip it
        brace_depth = 0
        end_idx = 0
        for i, ch in enumerate(stripped):
            if ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
                if brace_depth == 0:
                    end_idx = i + 1
                    break
        if end_idx > 0:
            response_text = stripped[end_idx:].lstrip()

    # Extract confidence/risk markers if present
    confidence = 0.7
    risk_tier = "amber"
    pattern = r"\[CONFIDENCE:\s*([\d.]+)\]\s*\[RISK:\s*(green|amber|red)\]"
    match = re.search(pattern, response_text)
    if match:
        try:
            import math

            raw = float(match.group(1))
            confidence = max(0.0, min(1.0, raw)) if math.isfinite(raw) else 0.7
        except ValueError:
            confidence = 0.7
        risk_tier = match.group(2)
        response_text = response_text[: match.start()].rstrip()

    # Extract domains from tools called
    domains = ["general"]
    if any(t == "search_kb" for t in tools_called):
        domains = ["employment_law"]
    if any(t == "calculate_cpf" for t in tools_called):
        domains = ["cpf"] if domains == ["general"] else domains + ["cpf"]

    return {
        "response_text": response_text,
        "risk_tier": risk_tier,
        "confidence": confidence,
        "domains": domains,
        "citations": [],
        "tools_called": tools_called,
        "usage": usage_data,
        "degraded": not bool(response_text),
    }


async def stream_delegate(
    prompt: str,
    config: DelegateConfig | None = None,
) -> AsyncGenerator[DelegateEvent, None]:
    """Create a delegate and stream events for a single prompt.

    Convenience wrapper for one-shot usage:
        async for event in stream_delegate("What is CPF?"):
            if isinstance(event, TextDelta):
                yield event
    """
    delegate = create_delegate(config)
    async for event in delegate.run(prompt):
        yield event
