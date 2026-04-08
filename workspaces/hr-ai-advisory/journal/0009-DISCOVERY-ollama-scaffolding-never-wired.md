# DISCOVERY — Ollama scaffolding was never wired to the Delegate adapter

**Date:** 2026-04-08
**Initiative:** hr-ai-advisory / ollama-provider
**Type:** DISCOVERY

## What

The M13 BYOK work built 80% of an Ollama provider path: DataFlow models, services, API routes, encryption, a web settings UI, a validation endpoint, and an `LLMKeyContext.for_ollama()` factory. But the seam between this scaffolding and the kaizen-agents Delegate engine was never actually completed.

`src/hr_advisory/delegate/arbor_loop.py:95-98` tries to coerce Ollama through the OpenAI adapter by calling `os.environ.setdefault("OPENAI_BASE_URL", base_url)`. The kaizen-agents package already ships a proper `OllamaStreamAdapter` that hits Ollama's native `/api/chat` endpoint — but Arbor never constructs it. Every advisory query, including "Ollama-configured" ones, goes through `OpenAIStreamAdapter`.

## Why it's a live bug

`os.environ.setdefault` is a no-op if the key already exists. On production (where `.env` has `OPENAI_API_KEY` set), BYOK values are silently ignored. Even worse, `os.environ` is process-global in an async FastAPI app, so any BYOK base_url that DOES write successfully poisons the env for every other tenant in the same process. Company B's OpenAI API key can be sent as a bearer token to Company A's attacker-controlled endpoint.

## How it happened

The BYOK analysis in `01-analysis/13-byok-api-keys/02-architecture-assessment.md` correctly identified three options (config-level, contextvars, per-request env). Option A (config-level override) was chosen, but the implementation only threaded `api_key` / `base_url` / `model` into `DelegateConfig` as raw strings — never bridging to kaizen-agents' `adapter=` kwarg. The final hop was deferred and forgotten.

The Ollama path was never tested end-to-end because the BYOK milestone was primarily about cloud API keys. Nobody noticed that the "(optional — auto-detected if empty)" model placeholder in the Ollama form was nonsense: when the field is empty, `_resolve_llm_settings` falls back to `OPENAI_PROD_MODEL=gpt-5-chat-latest`, which fails against Ollama with a model-not-found error.

## Why this matters

This is the canonical "scaffolding without wiring" anti-pattern. A large area of code looks complete (models, services, routes, UI, validation) but the one integration seam in `arbor_loop.py` — which is 3 lines of env-var hackery — makes the whole feature non-functional. Code review would probably pass it because each file in isolation looks correct.

The lesson: any feature with a new `provider` concept needs at least one integration test that actually exercises the provider at the runtime boundary. See `rules/testing.md` — Tier 2 real-infrastructure testing exists precisely to catch this.

## Resolution

See:

- `01-analysis/17-ollama-provider/02-gap-analysis.md` for the full bug inventory
- `02-plans/06-ollama-provider-plan.md` for the end-to-end fix

The fix replaces `os.environ.setdefault` with per-request `adapter=` injection, thereby also fixing the multi-tenant data-leak bug that's been live since BYOK shipped.
