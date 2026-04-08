# T120 — Phase 7C+D: Embedding deployment docs + retrieval quality verification

**Status**: ACTIVE
**Phase**: 7C + 7D (Embeddings — deployment + quality)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 310-328
**Depends on**: T118, T119
**Specialist**: ml-specialist (precision@5 design), dataflow-specialist (test fixture)

## Goal

Two follow-on tasks once the embedder and migration script exist:

1. **Deployment documentation** — self-hosted Ollama operators need to know they need TWO models pulled (chat + embeddings). Production GCE keeps OpenAI for embeddings (decision deferred).
2. **Retrieval quality verification** — `mxbai-embed-large` is theoretically equivalent to or better than `text-embedding-3-small`, but we MUST verify on Arbor's actual HR query distribution before merging the dim migration. If precision@5 drops > 5%, escalate.

## Part C — Deployment documentation

### `docs/setup.md` updates

- Add a section "Self-hosted Ollama deployment requirements"
- Document that Ollama operators need both:
  - A chat model from `OLLAMA_TOOL_CAPABLE_FAMILIES` (e.g. `ollama pull llama3.1:8b`)
  - The embedding model: `ollama pull mxbai-embed-large`
- Document the `EMBEDDING_MODEL_OLLAMA` env var
- Note the storage requirement (`mxbai-embed-large` is ~670 MB; `llama3.1:8b` is ~4.7 GB; total ~5.5 GB minimum)
- Add a troubleshooting entry: "KB search returns no results after Ollama setup" → check that `mxbai-embed-large` is pulled

### Production GCE arbor-prod deployment note

- Document the current decision in `docs/migrations/2026-04-08-embedding-1024.md` and in the deploy runbook:
  - GCE arbor-prod continues to use `OPENAI_API_KEY` for embeddings via the `text-embedding-3-large` (`dimensions=1024`) path
  - Switching arbor-prod to Ollama for embeddings would require provisioning an Ollama server with `mxbai-embed-large` pulled — not in this PR's scope
- Add a TODO entry in the deploy runbook for the future "all-on-Ollama" mode

## Part D — Retrieval quality verification

### Build the side-by-side test harness

- Use Tier 2 (real DB, real embeddings) — this test cannot be mocked
- Steps:
  1. Build a fixture set: 50 representative HR queries from `tests/fixtures/representative_hr_queries.json` (create the file if it doesn't exist; pull from existing Tier 2 fixtures or from `quality/adversarial_runner` scenarios for inspiration)
  2. Restore a copy of the production KB (or seed a representative subset of provisions)
  3. Run each query through the OLD pipeline (text-embedding-3-small, 1536-dim) on a copy of the DB → record top-5 provision IDs per query
  4. Run each query through the NEW pipeline (configured per provider — both Ollama mxbai AND OpenAI text-3-large@1024 — record top-5 separately)
  5. Compute precision@5 against a ground-truth set (use the OLD top-5 as ground truth, then human-spot-check 5-10 queries to validate)
- Report the comparison in `docs/migrations/2026-04-08-embedding-1024.md` under "Quality verification"

### Acceptance gate

- [ ] If precision@5 (new vs old) is within 5% — merge proceeds
- [ ] If precision@5 drops > 5% — STOP. Document the result in the migration doc, file an escalation in the user-facing brief, and consider the fallback: keep `text-embedding-3-large` at full 3072-dim (which would require OpenAI as a hard dependency for cloud customers)
- [ ] The decision is captured in `journal/0014-DECISION-embedding-quality-result.md` regardless of outcome

### Run the migration on a copy of production

- After Part C docs are in place and Part D quality is acceptable, run the T118 migration script against a fresh copy of the production DB in staging
- Verify:
  - Backup JSONL exists at `backups/embeddings_1536_<date>.jsonl`
  - All ~3,000 KB provisions re-embedded
  - pgvector column type is `vector(1024)`
  - Sanity query: "How many days of paternity leave?" returns the expected provision in top-1
- Document the staging-run timestamp and any observations in `docs/migrations/2026-04-08-embedding-1024.md`

## Acceptance criteria

- [ ] `docs/setup.md` documents the two-model Ollama requirement
- [ ] `docs/migrations/2026-04-08-embedding-1024.md` documents the deployment decision (GCE keeps OpenAI for now)
- [ ] `tests/fixtures/representative_hr_queries.json` exists with 50 queries
- [ ] Side-by-side precision@5 test was run against a representative DB
- [ ] Quality result documented in the migration doc with precision@5 numbers
- [ ] Decision captured in `journal/0014-DECISION-embedding-quality-result.md`
- [ ] Staging migration run completed successfully on a copy of production DB
- [ ] Sanity query returns expected provision from the new 1024-dim index

## Traps

- **The 5% threshold is a heuristic** — if quality drops 4%, that's still real degradation. Use judgment, escalate to user when in doubt.
- **Ground truth via "old top-5"** — this measures CONSISTENCY, not absolute correctness. If the old pipeline was wrong about a query, the new one being "different" might actually be better. Spot-check 5-10 queries with human review to calibrate.
- **Don't run the side-by-side test against the live production DB** — always use a copy. The OLD pipeline will hit the 1536-dim column; the NEW pipeline will need either a 1024-dim column or in-memory comparison.
- **Provider variance** — Ollama mxbai and OpenAI text-3-large@1024 may produce different precision@5. Report both numbers separately. Decide whether to fail merge if EITHER is below threshold.

## Red team round 1 revisions (C-3, M15, M16)

### C-3 — Side-by-side test is architecturally impossible as written

The original plan says "run the OLD pipeline against the 1536-dim DB and the NEW pipeline against the same DB". A single `provisions` table cannot hold both `vector(1024)` and `vector(1536)` columns simultaneously. **Use a shadow table approach:**

1. On a copy of production DB (still 1536-dim), create a shadow table:
   ```sql
   CREATE TABLE provisions_new_emb (
       provision_id BIGINT PRIMARY KEY REFERENCES provisions(id),
       embedding vector(1024) NOT NULL
   );
   CREATE INDEX ON provisions_new_emb USING hnsw (embedding vector_cosine_ops);
   ```
2. Populate `provisions_new_emb` with the new pipeline (Ollama mxbai AND OpenAI text-3-large@1024 — separate runs)
3. For each query in the 50-query fixture set:
   - OLD top-5: query `provisions.embedding` (1536-dim, current pipeline)
   - NEW top-5 (Ollama): query `provisions_new_emb.embedding` after Ollama-populated run
   - NEW top-5 (OpenAI): query `provisions_new_emb.embedding` after OpenAI-populated run
4. Report precision@5 for both new pipelines vs the old baseline

**Also resolve the model mismatch:** the original plan referenced `text-embedding-3-small` (1536-dim) as the production baseline, but T119 targets `text-embedding-3-large@1024`. **Confirm with the user which model production currently uses** (likely 3-small per `kb/embeddings.py:79` — check it). If 3-small is the baseline, the comparison is "3-small vs mxbai" and "3-small vs 3-large@1024" — three pipelines, three result sets.

### M15 — Production DB acquisition path

T120 says "run on a copy of production DB" without specifying provenance. Production is GCE arbor-prod (`34.87.60.241`) with no documented staging Postgres. Add explicit acquisition:

```bash
# 1. SSH to prod and dump
gcloud compute ssh arbor-prod --zone=asia-southeast1-b -- \
  pg_dump -Fc -d arbor -t provisions -t kb_documents -f /tmp/arbor_kb.dump

# 2. Copy dump locally
gcloud compute scp arbor-prod:/tmp/arbor_kb.dump ./arbor_kb.dump

# 3. Restore into a local container
docker run -d --name arbor-staging-pg -e POSTGRES_PASSWORD=staging \
  -p 5433:5432 pgvector/pgvector:pg16
docker exec arbor-staging-pg createdb -U postgres arbor_staging
pg_restore -h localhost -p 5433 -U postgres -d arbor_staging arbor_kb.dump

# 4. Run the migration script with --execute against arbor_staging
DATABASE_URL=postgresql://postgres:staging@localhost:5433/arbor_staging \
  python scripts/migrate_kb_to_1024_dim.py --execute
```

### M16 — Promote ground-truth spot-check from aspirational to required

The original "spot-check 5-10 queries with human review" is in the Traps section but NOT in the acceptance. Promote it:

- [ ] Spot-check at least 8 queries from the 50-query fixture set with human review of top-5 relevance
- [ ] For each spot-checked query, document: query text, OLD top-5 IDs, NEW top-5 IDs (per provider), human verdict (NEW better / NEW worse / equivalent)
- [ ] Spot-check log lives in `docs/migrations/2026-04-08-embedding-1024.md` under "Quality verification → spot-check log"
- [ ] If spot-check shows NEW worse on > 30% of cases, ESCALATE and reconsider the model choice

### Updated acceptance criteria

- [ ] Side-by-side comparison uses a shadow table `provisions_new_emb`, NOT a destructive in-place migration of the test DB
- [ ] Production baseline model name confirmed (3-small vs 3-large@1024) and documented
- [ ] Three result sets reported: baseline / Ollama mxbai / OpenAI text-3-large@1024
- [ ] DB acquisition path documented with exact `gcloud` and `pg_restore` commands
- [ ] Human spot-check covers ≥ 8 queries with documented verdicts
- [ ] Spot-check log lives in the migration doc
