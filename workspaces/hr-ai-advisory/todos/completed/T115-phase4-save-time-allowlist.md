# T115 — Phase 4: Save-time enforcement (required model + tool-capability allowlist)

**Status**: ACTIVE
**Phase**: 4 (Save-time enforcement)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 132-154
**Depends on**: T114
**Specialist**: nexus-specialist

## Goal

When a user saves a BYOK Ollama config, reject it at the API boundary if the model is missing or not in the tool-capable allowlist. A non-tool-capable Ollama model silently returns plain-text answers without ever calling `search_kb` / `calculate_cpf` — that is hallucinated advice in a regulated domain. Save-time enforcement is the **first** of two enforcement layers (the second is the init-time invariant in T117).

## What to build

### 1. Add the allowlist constant to `src/hr_advisory/services/llm_config.py`

```python
OLLAMA_TOOL_CAPABLE_FAMILIES: frozenset[str] = frozenset({
    "llama3.1", "llama3.2",
    "qwen2.5",
    "mistral-nemo",
    "firefunction-v2",
    "command-r", "command-r-plus",
})
```

- Place near other module-level constants
- Add a comment naming the source: kaizen-agents `OllamaStreamAdapter` tool-call support matrix as of 2026-04-08
- Add a comment with the update procedure: bump this set when kaizen-agents adds support for more families

### 2. Add `validate_ollama_model` helper in the same file

```python
def validate_ollama_model(model: str) -> None:
    """Raise ValueError if `model` is not in the tool-capable allowlist.

    Strips the `:tag` suffix and lowercases before checking. The allowlist is
    family-level so users can pin a specific quantization (`llama3.1:70b-instruct-q4_0`)
    without us maintaining the full tag matrix.
    """
    if not model or not model.strip():
        raise ValueError("Ollama model is required and may not be empty.")
    family = model.strip().lower().split(":")[0]
    if family not in OLLAMA_TOOL_CAPABLE_FAMILIES:
        allowed = ", ".join(sorted(OLLAMA_TOOL_CAPABLE_FAMILIES))
        raise ValueError(
            f"Ollama model {model!r} is not tool-capable. Arbor requires a model "
            f"that supports tool calls. Choose from: {allowed}"
        )
```

### 3. Wire into save endpoints in `src/hr_advisory/api/routers/llm_config.py`

Two functions need updating:

- `save_company_llm_config`
- `save_user_personal_config`

For each:

- When `provider == "ollama"`:
  - If `model_pref` is `None` or empty: return HTTP 400 with body `{"detail": "model_pref is required for Ollama provider."}`
  - Otherwise call `validate_ollama_model(model_pref)` inside a `try`/`except ValueError as exc` and return HTTP 400 with `{"detail": str(exc)}`
- When `provider == "custom"` (OpenAI-compatible third-party endpoint):
  - If `model_pref` is `None` or empty: return HTTP 400 with body `{"detail": "model_pref is required for custom provider."}`
  - **Do not** call `validate_ollama_model` for custom (custom can be anything OpenAI-compatible)

## Acceptance criteria

- [ ] `OLLAMA_TOOL_CAPABLE_FAMILIES` is a `frozenset[str]` defined in `services/llm_config.py`
- [ ] `validate_ollama_model` raises `ValueError` with an actionable message naming the allowlist for non-matching input
- [ ] `validate_ollama_model("llama3.1:70b-instruct-q4_0")` does not raise
- [ ] `validate_ollama_model("qwen2.5:32b")` does not raise
- [ ] `validate_ollama_model("phi3:14b")` raises
- [ ] `validate_ollama_model("")` raises (empty)
- [ ] `validate_ollama_model("LLAMA3.1")` does not raise (case-insensitive)
- [ ] `save_company_llm_config` and `save_user_personal_config` reject Ollama saves without `model_pref` with HTTP 400
- [ ] Both endpoints reject `phi3` for Ollama with HTTP 400 whose `detail` names the allowlist
- [ ] Both endpoints reject `custom` saves without `model_pref` with HTTP 400 (no allowlist check)
- [ ] Both endpoints accept `llama3.1:70b` for Ollama with HTTP 200
- [ ] Existing save-endpoint unit tests still pass
- [ ] New unit tests:
  - `test_validate_ollama_model_allowlist_rejects_phi3`
  - `test_validate_ollama_model_allowlist_rejects_llama2`
  - `test_validate_ollama_model_allowlist_accepts_llama31`
  - `test_validate_ollama_model_allowlist_accepts_qwen25_with_tag`
  - `test_save_config_rejects_missing_model_for_ollama`
  - `test_save_config_rejects_phi3_for_ollama`
  - `test_save_config_accepts_llama31_for_ollama`
  - `test_save_config_accepts_qwen25_with_tag`

## Traps

- **Don't write `if provider == "ollama" and not model_pref:`** before checking if `model_pref` is in the request body at all — the validator class may strip empty strings to `None` before the handler runs. Be defensive: handle both `""` and `None`.
- **Frontend coordination** — T123 will make the model field required client-side. The backend rejection here is the source of truth; frontend validation is a UX courtesy.
- **Allowlist staleness** — when kaizen-agents v0.X adds tool-call support for a new family, this constant must be bumped. Add a follow-up reference in T124 to file an upstream issue asking kaizen-agents to publish a canonical list.
- **Don't return 422** — use 400 to match the existing error envelope used elsewhere in `llm_config.py`.

## Red team round 1 revisions (M4, M5)

### M4 — Specify the insertion point in the save flow

Both `save_company_llm_config` and `save_user_personal_config` call `_validate_provider`/`_validate_base_url`, then `encrypt_api_key` (line 188), then `save_llm_config` (line 202). Insert the new allowlist check **between** `_validate_provider` and `encrypt_api_key` so we never waste crypto work or DB round-trips on a request that will be rejected.

### M5 — Fix the pre-existing SSRF bypass in `save_user_personal_config`

`api/routers/llm_config.py:744-790` has NO `_validate_base_url` call at all. A user can POST `provider=ollama` with a `169.254.169.254` base_url and bypass SSRF protection on the user-personal save path. Per `zero-tolerance.md` Rule 1 ("you found it, you own it"), this MUST be fixed in the same commit:

- Add `_validate_base_url(base_url, provider)` call to `save_user_personal_config` between `_validate_provider` and the new allowlist check
- Add a regression test pinning the SSRF protection: `test_save_user_personal_config_rejects_metadata_ip` → 400
- This is in addition to the model-allowlist work above

### Updated acceptance criteria

- [ ] Allowlist check inserted between `_validate_provider` and `encrypt_api_key` in BOTH save functions
- [ ] `_validate_base_url` added to `save_user_personal_config` (pre-existing SSRF gap)
- [ ] `test_save_user_personal_config_rejects_metadata_ip` passes
- [ ] All save endpoint validation runs BEFORE crypto and DB writes
