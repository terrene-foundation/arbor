# CONNECTION — Ollama tool-capability gate couples LLM provider choice to regulatory posture

**Date:** 2026-04-08
**Initiative:** hr-ai-advisory / ollama-provider
**Type:** CONNECTION

## What

Two concerns that looked independent turn out to be the same decision:

1. **"Which Ollama models should Arbor support?"** (LLM infrastructure question)
2. **"Will the advisory engine produce cited, grounded answers or hallucinate?"** (regulatory compliance question)

They are the same question because tool-capability is a binary property of the Ollama model, and Arbor's advisory engine relies on tool calls (`search_kb`, `calculate_cpf`, `calculate_leave`, etc.) to ground answers in the legal knowledge base and deterministic calculators.

## How it connects

- Newer Ollama models (`llama3.1+`, `qwen2.5`, `mistral-nemo`, `firefunction-v2`, `command-r*`) support tool calls. They call Arbor's tools, retrieve legal provisions, compute CPF deterministically, cite sources.
- Older / smaller Ollama models (`llama2`, `phi3`, `gemma2`, `codellama`, most 7B models) **silently ignore** the `tools` field in the API request. They return plain-text chat with no tool calls.
- When tool calls are dropped, the advisory engine never hits the knowledge base. It returns whatever the base model's training data says about SG employment law — hallucinated and uncited.
- The `tools_called` list is empty but `response_text` is non-empty → `degraded=False` → Arbor returns the hallucinated answer with confidence markers like real advice.

## Why this is regulatory, not cosmetic

Arbor's advisory is positioned as "SG employment law guidance for SMEs". Wrong guidance on CPF, retrenchment, maternity leave, or MOM work pass rules exposes the customer to:

- MOM enforcement action (fines, license suspension)
- Employee grievances and disputes
- PDPA non-compliance if employee data handling advice is wrong
- Loss of TAFEP/WSH compliance if workplace safety advice is wrong

A hallucinated "CPF OW ceiling is $6,000/month" (it's $8,000 as of 2026) directly causes under-contribution and triggers CPF Board enforcement. Arbor's shadow-agent layer can't save this — the shadow agent trusts the advisory engine's output.

## The design implication

The Ollama model picker is not just a config field. It's a **regulatory gate**. The allowlist in `OLLAMA_TOOL_CAPABLE_FAMILIES` determines whether the advisory engine can function in its grounded mode. Letting users save non-allowlisted models would require a separate "non-grounded chat mode" with different UI warnings, different audit logs, and probably a different endpoint. That's a much bigger feature than this PR.

**Decision (pending Q1 in `04-open-questions.md`):** Hard reject non-allowlisted Ollama models at save time. No soft warning, no graceful degradation. A silent wrong answer in this domain is worse than no answer.

## Secondary connection — the kailash-py SDK is the source of truth for this allowlist

The allowlist is ultimately determined by Ollama upstream (which models honor the `tools` field) and by kaizen-agents (which ships the `OllamaStreamAdapter` that forwards tools). Arbor maintains a mirror of the allowlist today, but long-term this should be a kaizen-agents constant that Arbor imports. File in `terrene-foundation/kailash-py`: "kaizen-agents should expose a canonical `OLLAMA_TOOL_CAPABLE_FAMILIES` constant and optionally auto-check via `/api/show` at runtime".

## Related

- `01-analysis/17-ollama-provider/02-gap-analysis.md` — bug C2 (the allowlist enforcement)
- `02-plans/06-ollama-provider-plan.md` — Phase 4 (save-time enforcement), Phase 9 (upstream issue)
- `rules/agent-reasoning.md` — the LLM is the router, but only if the LLM can actually call tools
- `memory/project_byok_decision.md` — "Ollama/DGX for local" intent
- `memory/Autonomous Advisory Engine (2026-03-21)` — the advisory engine is tool-call dependent
