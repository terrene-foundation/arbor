# T116 — Phase 5: Validate endpoint checks model is pulled on Ollama server

**Status**: ACTIVE
**Phase**: 5 (Validation endpoint)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 156-164
**Depends on**: T114 (and the allowlist constant from T115 if reusing)
**Specialist**: nexus-specialist

## Goal

The "Test & Save" button in the Ollama settings UI hits a `/validate` endpoint that today only checks reachability of the Ollama server. It does NOT verify that the user's chosen model is actually pulled on that server. Result: a user can save a config that the server cannot serve, then watch every advisory query fail at runtime.

## What to do — `src/hr_advisory/api/routers/llm_config.py:397-437` (`_validate_ollama`)

### 1. Accept `model_pref` from the request body

- Verify the function already receives `model_pref` (per the plan at line 359 it does, but the body of `_validate_ollama` does not use it)
- If not in the function signature, thread it through from the public validate endpoint

### 2. After successfully fetching `/api/tags` from the Ollama server, verify the model is present

- The `/api/tags` response contains a list of pulled models with names like `llama3.1:8b`, `mxbai-embed-large:latest`, etc.
- Build a set of "model identifiers" from the tag list — include both the full `name:tag` form and the bare family `name` form (so that `llama3.1` matches `llama3.1:8b`)
- Check if `model_pref` is in this set (try as-is, then with-and-without `:` tag)
- On miss: return `valid=False` with a `message` field naming the user's requested model AND the first 5 available models the server has

### 3. On unreachable server (existing behavior)

- Keep the existing HTTP error / connection error handling — no changes needed

## Acceptance criteria

- [ ] `_validate_ollama` accepts and uses `model_pref` from the request body
- [ ] When the requested model is in `/api/tags`, returns `{valid: true, message: "...", available_models: [...]}` (include the available models for UI display)
- [ ] When the requested model is NOT in `/api/tags`, returns `{valid: false, message: "<model_pref> is not pulled on this Ollama server. Available models: <first 5>. Run `ollama pull <model>` first."}`
- [ ] When the Ollama server is unreachable, returns `{valid: false, message: "Cannot reach Ollama at <base_url>. Check that the server is running."}`
- [ ] New unit tests (mocked httpx):
  - `test_validate_endpoint_returns_valid_when_model_in_tags`
  - `test_validate_endpoint_returns_invalid_when_model_missing`
  - `test_validate_endpoint_returns_invalid_when_unreachable`
- [ ] Tier-2 integration tests deferred to T126 (real Ollama in docker-compose):
  - `test_validate_endpoint_real_ollama_reachable_with_pulled_model`
  - `test_validate_endpoint_real_ollama_reachable_missing_model`
  - `test_validate_endpoint_unreachable_ollama`

## Traps

- **Tag matching** — `/api/tags` may report `llama3.1:8b-instruct-q4_K_M` while the user typed `llama3.1:8b`. Strip the trailing quantization suffix or substring-match. The plan calls for "with or without the tag" — be lenient on the model side, strict on the family side.
- **Slow `/api/tags` on big servers** — set a 10s timeout on the httpx call. Return a clear "validation timed out" message if it expires.
- **No allowlist enforcement here** — that lives in T115's save flow. The validate endpoint's job is "reachable + has the model"; allowlist rejection should already have happened before the user reaches the validate flow if the form is wired correctly.
- **Don't leak the Ollama server's full model list** — limit to 5 entries for the UI message. A user might have 50+ models pulled and we don't need to dump them.

## Red team round 1 revisions (M6, M7, M8)

### M6 — Specify the model-match algorithm precisely

"With or without the tag" is ambiguous and substring-anywhere matching can produce false positives (`llama3.1:8b` ⊂ `llama3.1:8b-instruct`). Use this explicit algorithm:

```python
def _model_in_tags(requested: str, available_tags: list[str]) -> bool:
    """Match a requested model against the Ollama server's pulled models.

    Algorithm:
    1. Exact-match: requested == tag
    2. Family-prefix match: requested.split(":")[0] == tag.split(":")[0]
    3. Never substring-anywhere
    """
    if not requested or not available_tags:
        return False
    if requested in available_tags:
        return True
    requested_family = requested.split(":")[0].lower()
    for tag in available_tags:
        if tag.split(":")[0].lower() == requested_family:
            return True
    return False
```

Add a unit test: `test_validate_endpoint_rejects_substring_false_positive` — server has `llama3.1:8b-instruct-q4_K_M`, user typed `llama-3.1:8b` (note the dash) → returns valid=false (no false-positive substring match).

### M7 — Cover the stored-config validation branch

`validate_company_llm_config` at `llm_config.py:362-371` has a "validate stored config" branch that reads `model_pref` from the DB row. T116 originally only addressed the user-input branch. Both branches must thread `model_pref` into `_validate_ollama` and apply the new model-pulled check.

Add unit test: `test_validate_stored_ollama_config_with_missing_model_returns_invalid`.

### M8 — Mask `base_url` in error logs

Current logging at `llm_config.py:433` (`logger.warning("Ollama validation failed: %s", exc)`) embeds the full URL because exception messages typically include it. Private DGX addresses are arguably sensitive.

Required logging change:

```python
# Before:
logger.warning("Ollama validation failed: %s", exc)

# After:
logger.warning(
    "Ollama validation failed: %s (base_url masked, see request_id=%s)",
    exc.__class__.__name__,
    request_id,
)
```

Also: in the HTTP response body, return a generic message like "Could not reach Ollama endpoint" without echoing the user-supplied URL.

### Updated acceptance criteria

- [ ] `_model_in_tags` helper exists with the exact 3-step algorithm
- [ ] `test_validate_endpoint_rejects_substring_false_positive` passes
- [ ] Stored-config branch at `llm_config.py:362-371` also threads `model_pref` and applies the model-pulled check
- [ ] `test_validate_stored_ollama_config_with_missing_model_returns_invalid` passes
- [ ] Validation error logs include exception class only, NOT `%s` of the exception (which would embed the URL)
- [ ] HTTP error response body does not echo `base_url` back to the caller
