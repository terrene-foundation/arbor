# T118 — Phase 7A: Vector dimension migration 1536 → 1024 + migration script

**Status**: ACTIVE
**Phase**: 7A (Embeddings — vector dim migration)
**Plan ref**: `02-plans/06-ollama-provider-plan.md` lines 234-248
**Depends on**: T112 (legacy cleanup must be done before touching the embedding pipeline)
**Blocks**: T119
**Specialist**: dataflow-specialist (pgvector ALTER + index), ml-specialist (embedding model dims)

## Goal

Migrate the `provisions.embedding` pgvector column from 1536-dim to 1024-dim. 1024 is the canonical dimension for the new dual-provider strategy:

- OpenAI: `text-embedding-3-large` with `dimensions=1024` parameter
- Ollama: `mxbai-embed-large` (native 1024-dim)

This dimension change requires DROP COLUMN + ADD COLUMN + re-embed every existing provision. The migration is one-time, irreversible without backup, and touches production KB data — therefore the script MUST dump existing vectors to JSONL before any DROP.

## What to build

### 1. Update the dimension constants in source

- File: `src/hr_advisory/models/vector_setup.py:11`
  - `VECTOR_DIMENSIONS = 1024  # was 1536; matches mxbai-embed-large (Ollama) and OpenAI text-embedding-3-large with dimensions=1024`
- File: `src/hr_advisory/models/vector_search_node.py:27`
  - Update the parameter description: `Query embedding vector (1024-dim)`
- Search for any other hardcoded `1536` references in `src/hr_advisory/` and update them. Use `rg "1536" src/hr_advisory/` and decide each.

### 2. Create migration script `scripts/migrate_kb_to_1024_dim.py`

Outline (the dataflow-specialist should review whether to use a `DataFlow` workflow or a one-shot psycopg connection — likely the latter for migrations):

```python
"""One-time KB migration: 1536-dim embeddings → 1024-dim.

Steps:
1. Dump all existing 1536-dim embeddings to backups/embeddings_1536_<date>.jsonl
2. ALTER TABLE provisions DROP COLUMN embedding
3. ALTER TABLE provisions ADD COLUMN embedding vector(1024)
4. Recreate the pgvector index (HNSW or IVFFlat — match what was in place)
5. Iterate every provision, re-embed via the new provider-aware EmbeddingPipeline (T119)
6. Verify count(embedding NOT NULL) == count(*)
7. Sanity check: a known query returns the expected top-1 provision

Rollback:
- The JSONL backup is the rollback. To restore, ALTER COLUMN back to vector(1536)
  and bulk-load the JSONL.

Usage:
    python scripts/migrate_kb_to_1024_dim.py --dry-run    # plan only
    python scripts/migrate_kb_to_1024_dim.py --execute    # actually run
"""
```

The script MUST:

- Be idempotent: running it twice on a 1024-dim DB is a no-op (detect by querying `information_schema.columns` for the embedding type)
- Take an explicit `--execute` flag — never run irreversibly without it
- Print a clear progress bar (every 100 rows or every 10%)
- Write the JSONL backup to `backups/embeddings_1536_<YYYY-MM-DD>.jsonl` with the schema `{"provision_id": <id>, "embedding": [...]}`
- Use `EmbeddingPipeline` from T119 — therefore this todo blocks on T119 in terms of execution order, but the file structure of the script can be written first against an interface

### 3. Document the migration in `docs/migrations/2026-04-08-embedding-1024.md`

- What changed
- Why (link to plan)
- Pre-flight checklist (backup DB, set maintenance window, verify EmbeddingPipeline credentials)
- Execution steps (dry-run first, then execute)
- Rollback procedure (restore vector(1536) column, bulk-load JSONL)
- Post-migration validation (the precision@5 quality test from T120)

## Acceptance criteria

- [ ] `VECTOR_DIMENSIONS = 1024` in `vector_setup.py`
- [ ] All hardcoded `1536` references in `src/hr_advisory/` resolved (either updated to 1024 or documented why they stay)
- [ ] `scripts/migrate_kb_to_1024_dim.py` exists with the structure above
- [ ] Script is idempotent (re-running on a 1024-dim DB exits cleanly with "already migrated")
- [ ] Script writes JSONL backup BEFORE any DROP COLUMN
- [ ] Script supports `--dry-run` (plan-only output)
- [ ] `docs/migrations/2026-04-08-embedding-1024.md` exists with rollback procedure
- [ ] Script tested against a fresh sqlite/postgres test DB (Tier 2 — actual run is part of T120 validation)
- [ ] `rg "1536" src/hr_advisory/` returns only intentional non-embedding references (e.g., a `1536`-byte buffer is fine — vector dimensions are not)

## Out of scope

- Running the migration against production (that's the deploy phase, not /implement)
- The actual `EmbeddingPipeline` refactor (T119)
- Retrieval quality verification (T120)

## Traps

- **DROP COLUMN before backup** — the most expensive mistake possible. Backup write MUST happen and be verified (`os.path.exists(backup_path)` AND `os.path.getsize(backup_path) > 0`) before any ALTER TABLE statement runs.
- **Index recreation** — when you DROP COLUMN, the pgvector index goes with it. Recreate it with the same operator class (`vector_cosine_ops` typically) and the same parameters (`m`, `ef_construction` for HNSW, or `lists` for IVFFlat). Find the original CREATE INDEX statement first.
- **Concurrent writes during migration** — gate the migration behind a maintenance window. The script MUST take an exclusive lock or document that the operator must stop the API before running.
- **`vector(1024)` dimension bound** — pgvector enforces dimension at insert time. If a row leaks in mid-migration with the wrong dim, the INSERT fails. The script's iteration order should be: ALTER COLUMN first, then re-embed and update each row, so any half-state is "row exists with NULL embedding" rather than "row exists with wrong-dim embedding".
- **`EmbeddingPipeline` is built in T119** — until T119 is done, this script can be drafted but cannot run. Mark the implementation order: T118 (script structure + ALTER + backup logic) → T119 (EmbeddingPipeline) → T118 again to finish the iteration loop → T120 (run + verify).

## Red team round 1 revisions (C-4, H13, H14, H15, M13, M14, M17, L10, L11, L13)

### C-4 — pgvector idempotency check uses the wrong catalog

`information_schema.columns.udt_name` returns `'vector'` with NO dimension. It cannot distinguish `vector(1024)` from `vector(1536)`. Use `pg_attribute` instead:

```sql
SELECT format_type(atttypid, atttypmod) AS column_type
FROM pg_attribute
WHERE attrelid = 'provisions'::regclass
  AND attname = 'embedding';
-- Returns 'vector(1024)' or 'vector(1536)'
```

If the result is `vector(1024)`, exit with "already migrated, no action".

### H13 — Avoid DataFlow ListNode for the migration loop

Project memory: ListNode default limit ~10, results wrapped in `{"records": [...], "count": N}`, caching must be disabled after raw writes. The naive DataFlow approach silently migrates 10 of ~3,000 rows.

**Use raw psycopg directly for the migration:**

```python
import psycopg
with psycopg.connect(DATABASE_URL) as conn:
    conn.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM provisions ORDER BY id")
        provision_ids = [row[0] for row in cur.fetchall()]

    # Batch in groups of 100
    for batch in itertools.batched(provision_ids, 100):
        with conn.cursor() as cur:
            for pid in batch:
                cur.execute("SELECT raw_text FROM provisions WHERE id = %s", (pid,))
                text = cur.fetchone()[0]
                vec = embedder.generate_embedding(text)
                cur.execute("UPDATE provisions SET embedding = %s WHERE id = %s", (vec, pid))
        conn.commit()
        # Write progress checkpoint
        save_checkpoint({"last_id": batch[-1], "ts": datetime.utcnow().isoformat()})
```

This bypasses the ListNode trap entirely.

### H14 — HNSW vs IVFFlat detection

Before DROP, capture the index definition:

```sql
SELECT indexdef
FROM pg_indexes
WHERE tablename = 'provisions' AND indexname LIKE '%embedding%';
-- Returns the full CREATE INDEX statement
```

Save this to a file (`backups/index_def_<date>.sql`), DROP the column (which drops the index too), then after the new column is created and re-embedded, replay the saved statement verbatim. Both HNSW and IVFFlat are preserved.

### H15 — Backup read-back / checksum

The script trusts `os.path.exists(backup_path) and getsize > 0`. Strengthen to:

```python
# After writing the backup:
with gzip.open(backup_path, "rt") as f:
    sample = [json.loads(line) for line in itertools.islice(f, 20)]

# Read 20 random rows from live DB and assert they match the sampled backup
for row in sample:
    cur.execute("SELECT embedding FROM provisions WHERE id = %s", (row["provision_id"],))
    live_vec = cur.fetchone()[0]
    assert live_vec == row["embedding"], f"Backup drift on provision_id={row['provision_id']}"

# Write a SHA-256 checksum file alongside the backup
import hashlib
with open(backup_path, "rb") as f:
    digest = hashlib.sha256(f.read()).hexdigest()
with open(backup_path + ".sha256", "w") as f:
    f.write(digest)
```

### M13 — Single transaction vs per-row commit

The recommended pattern: ALTER TABLE + index recreation in ONE transaction; re-embed in batches of 100 with per-batch commit; resumable checkpoint file `migration_progress.json` tracks `last_completed_id`. On crash, the next run picks up from the checkpoint instead of restarting.

### M14 — Exclusive lock during migration

Add to the script entry point:

```sql
LOCK TABLE provisions IN ACCESS EXCLUSIVE MODE;
```

Inside the same transaction as ALTER TABLE. If the API is running concurrently, this blocks reads — document the explicit `docker compose stop api` step in the runbook for production.

### M17 — Remove sqlite test path

SQLite has no pgvector. Replace "tested against fresh sqlite" in acceptance with: "tested against a disposable Postgres+pgvector container (testcontainers or `docker compose -f tests/integration/docker-compose.yml up postgres-test`)".

### L10 — Compress the backup

Use `.jsonl.gz` (gzip streaming write) instead of `.jsonl`. ~3,000 × 1536 floats compresses ~10x; saves disk and speeds up copy.

### L11 — Pre-flight model check

Before any DROP COLUMN, verify the embedding model is pulled on the configured Ollama server:

```python
import httpx
resp = httpx.get(f"{ollama_base_url}/api/tags")
tags = [m["name"] for m in resp.json()["models"]]
if not any(t.startswith("mxbai-embed-large") for t in tags):
    raise RuntimeError(
        f"mxbai-embed-large is not pulled on {ollama_base_url}. "
        f"Run: ollama pull mxbai-embed-large"
    )
```

### L13 — Don't hardcode date in filename

Use `datetime.utcnow().strftime("%Y-%m-%d")` for both the backup filename and the migration doc filename. The original `2026-04-08` may not match the actual run date.

### Updated acceptance criteria

- [ ] Idempotency check uses `pg_attribute.format_type`, NOT `information_schema.udt_name`
- [ ] Migration loop uses raw psycopg, NOT DataFlow ListNode
- [ ] Index definition captured from `pg_indexes` BEFORE DROP and replayed verbatim AFTER re-embed
- [ ] Backup is `.jsonl.gz` with a `.sha256` checksum file
- [ ] Backup read-back: sample 20 rows from backup, compare to live DB, assert match BEFORE any DROP
- [ ] Single transaction wraps ALTER + index recreate; per-batch commit on re-embed loop
- [ ] Resumable checkpoint file `migration_progress.json` tracks `last_completed_id`
- [ ] `LOCK TABLE provisions IN ACCESS EXCLUSIVE MODE` in the migration transaction
- [ ] Pre-flight `GET /api/tags` confirms `mxbai-embed-large` is pulled
- [ ] Acceptance test runs against disposable Postgres+pgvector (NOT sqlite)
- [ ] Backup filename and migration doc filename use `datetime.utcnow()`, not hardcoded date
