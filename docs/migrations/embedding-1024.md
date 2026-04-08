# Embedding Dimension Migration: 1536 -> 1024

**Date**: 2026-04-08 (script created), run date TBD
**Status**: Script ready, awaiting T119 (EmbeddingPipeline) for re-embed step

## What changed

The `provisions.embedding` pgvector column is migrated from `vector(1536)` to `vector(1024)` to support dual-provider embeddings:

- **OpenAI**: `text-embedding-3-large` with `dimensions=1024` parameter
- **Ollama**: `mxbai-embed-large` (native 1024-dim)

## Why

Standardizing on 1024-dim enables:

1. Full air-gap deployment (Ollama serves both chat + embeddings)
2. Consistent vector index across providers (one HNSW index, not two)
3. Reduced storage (~33% less per vector)

## Pre-flight checklist

- [ ] Database backup taken (`pg_dump`)
- [ ] Set maintenance window (API should be stopped during ALTER TABLE)
- [ ] `EmbeddingPipeline` credentials configured (OPENAI_API_KEY or OLLAMA_BASE_URL + OLLAMA_MODEL)
- [ ] If using Ollama: `ollama pull mxbai-embed-large` on the server

## Execution

```bash
# 1. Dry run — shows what will happen
DATABASE_URL=postgresql://... python scripts/migrate_kb_to_1024_dim.py --dry-run

# 2. Stop the API
docker compose stop api

# 3. Execute the migration
DATABASE_URL=postgresql://... python scripts/migrate_kb_to_1024_dim.py --execute

# 4. Restart the API
docker compose start api
```

## Rollback

If quality drops or something goes wrong:

```bash
# 1. Restore the old column dimension
psql $DATABASE_URL -c "ALTER TABLE provisions DROP COLUMN embedding"
psql $DATABASE_URL -c "ALTER TABLE provisions ADD COLUMN embedding vector(1536)"

# 2. Reload from the backup
# The backup is at backups/embeddings_1536_<date>.jsonl.gz
python -c "
import gzip, json, psycopg
conn = psycopg.connect('$DATABASE_URL')
with gzip.open('backups/embeddings_1536_<date>.jsonl.gz', 'rt') as f:
    for line in f:
        row = json.loads(line)
        conn.execute(
            'UPDATE provisions SET embedding = %s WHERE id = %s',
            (row['embedding'], row['provision_id'])
        )
conn.commit()
"

# 3. Recreate the index from backups/index_def_<date>.sql
psql $DATABASE_URL -f backups/index_def_<date>.sql
```

## Quality verification

After migration, run the precision@5 side-by-side test (T120) to verify retrieval quality is maintained. Acceptance: precision@5 within 5% of the 1536-dim baseline.
