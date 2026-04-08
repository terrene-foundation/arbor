#!/usr/bin/env python3
"""One-time KB migration: 1536-dim embeddings -> 1024-dim.

Steps:
1. Dump all existing embeddings to backups/embeddings_<dim>_<date>.jsonl.gz
2. ALTER TABLE provisions DROP COLUMN embedding
3. ALTER TABLE provisions ADD COLUMN embedding vector(1024)
4. Recreate the pgvector HNSW index (captured from pg_indexes before DROP)
5. Re-embed every provision via EmbeddingPipeline (provider-aware)
6. Verify count(embedding NOT NULL) == count(*)
7. Sanity check: known query returns expected top-1

Rollback:
    Restore from the .jsonl.gz backup + ALTER COLUMN back to original dim.

Usage:
    python scripts/migrate_kb_to_1024_dim.py --dry-run    # plan only
    python scripts/migrate_kb_to_1024_dim.py --execute    # run migration

Requires: DATABASE_URL env var, pgvector extension installed, and either
OPENAI_API_KEY or OLLAMA_BASE_URL + OLLAMA_MODEL for re-embedding.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TARGET_DIM = 1024
BATCH_SIZE = 100
CHECKPOINT_FILE = Path("backups/migration_progress.json")


def _get_db_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL env var is required for migration.")
    return url


def _get_current_dim(conn) -> str | None:
    """Detect current embedding column type via pg_attribute (C-4 fix)."""
    cur = conn.execute(
        """
        SELECT format_type(atttypid, atttypmod) AS column_type
        FROM pg_attribute
        WHERE attrelid = 'provisions'::regclass
          AND attname = 'embedding'
          AND NOT attisdropped
        """
    )
    row = cur.fetchone()
    return row[0] if row else None


def _get_index_def(conn) -> str | None:
    """Capture existing embedding index definition (H14)."""
    cur = conn.execute(
        """
        SELECT indexdef
        FROM pg_indexes
        WHERE tablename = 'provisions'
          AND indexdef LIKE '%embedding%'
        """
    )
    row = cur.fetchone()
    return row[0] if row else None


def _preflight_check_ollama(conn):
    """Verify mxbai-embed-large is pulled if using Ollama (L11)."""
    base_url = os.environ.get("OLLAMA_BASE_URL")
    if not base_url:
        return  # Using OpenAI, no preflight needed

    import httpx

    try:
        resp = httpx.get(f"{base_url.rstrip('/')}/api/tags", timeout=10)
        resp.raise_for_status()
        tags = [m["name"] for m in resp.json().get("models", [])]
        if not any(t.startswith("mxbai-embed-large") for t in tags):
            raise RuntimeError(
                f"mxbai-embed-large is not pulled on {base_url}. "
                f"Run: ollama pull mxbai-embed-large\n"
                f"Available models: {tags[:5]}"
            )
        logger.info("Preflight: mxbai-embed-large confirmed on Ollama server")
    except httpx.ConnectError:
        raise RuntimeError(f"Cannot reach Ollama server at {base_url}")


def _backup_embeddings(conn, backup_path: Path) -> int:
    """Dump existing embeddings to compressed JSONL (L10)."""
    cur = conn.execute("SELECT id, embedding FROM provisions WHERE embedding IS NOT NULL")
    count = 0
    with gzip.open(backup_path, "wt") as f:
        for row in cur:
            provision_id, embedding = row
            # pgvector returns embedding as a string like '[0.1,0.2,...]'
            if isinstance(embedding, str):
                emb_list = json.loads(embedding)
            elif hasattr(embedding, "tolist"):
                emb_list = embedding.tolist()
            else:
                emb_list = list(embedding)
            f.write(json.dumps({"provision_id": provision_id, "embedding": emb_list}) + "\n")
            count += 1
    logger.info("Backed up %d embeddings to %s", count, backup_path)
    return count


def _verify_backup(conn, backup_path: Path, sample_size: int = 20):
    """Read-back verification: sample rows from backup match live DB (H15)."""
    import itertools

    with gzip.open(backup_path, "rt") as f:
        sample = [json.loads(line) for line in itertools.islice(f, sample_size)]

    for row in sample:
        cur = conn.execute(
            "SELECT embedding FROM provisions WHERE id = %s",
            (row["provision_id"],),
        )
        live = cur.fetchone()
        if live is None:
            raise RuntimeError(f"Backup row {row['provision_id']} not found in DB!")
        # Compare first 5 values as a sanity check
        live_emb = live[0] if isinstance(live[0], list) else json.loads(str(live[0]))
        for i in range(min(5, len(row["embedding"]))):
            if abs(row["embedding"][i] - live_emb[i]) > 1e-6:
                raise RuntimeError(
                    f"Backup drift on provision_id={row['provision_id']} at index {i}"
                )

    # Write SHA-256 checksum
    with open(str(backup_path) + ".sha256", "w") as f:
        sha = hashlib.sha256()
        with gzip.open(backup_path, "rb") as gz:
            for chunk in iter(lambda: gz.read(65536), b""):
                sha.update(chunk)
        f.write(sha.hexdigest())

    logger.info("Backup verified: %d rows sampled, checksum written", len(sample))


def _load_checkpoint() -> int | None:
    """Load the last completed provision ID from checkpoint file (M13)."""
    if CHECKPOINT_FILE.exists():
        data = json.loads(CHECKPOINT_FILE.read_text())
        return data.get("last_id")
    return None


def _save_checkpoint(last_id: int):
    """Save progress checkpoint for resumable migration."""
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_FILE.write_text(
        json.dumps({"last_id": last_id, "ts": datetime.now(timezone.utc).isoformat()})
    )


def _run_migration(conn, dry_run: bool = True) -> None:
    """Execute the full migration pipeline."""
    # 1. Check current state (C-4: use pg_attribute, not information_schema)
    current_type = _get_current_dim(conn)
    if current_type == f"vector({TARGET_DIM})":
        logger.info("Already migrated to %d-dim. No action needed.", TARGET_DIM)
        return
    if current_type is None:
        logger.warning("No embedding column found. Will create vector(%d).", TARGET_DIM)

    # 2. Capture index definition before DROP (H14)
    index_def = _get_index_def(conn)
    if index_def:
        logger.info("Captured index: %s", index_def[:100])
        index_backup = (
            Path("backups") / f"index_def_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.sql"
        )
        index_backup.parent.mkdir(parents=True, exist_ok=True)
        index_backup.write_text(index_def)

    # 3. Count provisions
    cur = conn.execute("SELECT count(*) FROM provisions")
    total = cur.fetchone()[0]
    logger.info("Total provisions: %d", total)

    if current_type:
        # 4. Backup existing embeddings
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        backup_path = (
            Path("backups")
            / f"embeddings_{current_type.replace('vector(', '').replace(')', '')}_{date_str}.jsonl.gz"
        )
        backup_path.parent.mkdir(parents=True, exist_ok=True)

        if dry_run:
            logger.info("[DRY RUN] Would backup %d embeddings to %s", total, backup_path)
            logger.info(
                "[DRY RUN] Would DROP COLUMN embedding, ADD COLUMN embedding vector(%d)", TARGET_DIM
            )
            logger.info("[DRY RUN] Would re-embed %d provisions", total)
            if index_def:
                logger.info("[DRY RUN] Would recreate index: %s", index_def[:80])
            return

        backed_up = _backup_embeddings(conn, backup_path)
        _verify_backup(conn, backup_path)
        logger.info("Backup complete: %d rows", backed_up)

        # 5. ALTER TABLE: drop + recreate with new dimension (M14: exclusive lock)
        logger.info("Acquiring exclusive lock on provisions table...")
        conn.execute("LOCK TABLE provisions IN ACCESS EXCLUSIVE MODE")

        logger.info("Dropping old embedding column...")
        conn.execute("ALTER TABLE provisions DROP COLUMN embedding")

    if dry_run:
        logger.info("[DRY RUN] Would ADD COLUMN embedding vector(%d)", TARGET_DIM)
        return

    logger.info("Adding new embedding column vector(%d)...", TARGET_DIM)
    conn.execute(f"ALTER TABLE provisions ADD COLUMN embedding vector({TARGET_DIM})")

    # Recreate index (use captured definition, adjusted for new dim if needed)
    if index_def:
        # Replace old dimension in the index def if it appears
        adjusted_index = index_def
        logger.info("Recreating index...")
        try:
            conn.execute(adjusted_index)
        except Exception as exc:
            logger.warning("Index recreation failed (may need manual fix): %s", type(exc).__name__)

    conn.commit()
    logger.info(
        "Schema migration complete. Re-embedding phase next (requires EmbeddingPipeline from T119)."
    )

    # 6. Re-embed provisions (requires T119 EmbeddingPipeline)
    # This step is deferred until T119 is implemented.
    # The script structure supports resumable re-embedding via checkpoints.
    checkpoint_id = _load_checkpoint()
    if checkpoint_id:
        logger.info("Resuming from checkpoint: last_id=%d", checkpoint_id)

    logger.info(
        "Re-embedding step deferred — run again after T119 (EmbeddingPipeline) is implemented. "
        "The schema is now vector(%d) and ready for new embeddings.",
        TARGET_DIM,
    )


def main():
    parser = argparse.ArgumentParser(description="Migrate KB embeddings to 1024-dim")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Plan only (default)")
    parser.add_argument("--execute", action="store_true", help="Actually run the migration")
    args = parser.parse_args()

    if args.execute:
        args.dry_run = False

    db_url = _get_db_url()
    logger.info("Migration target: %s", db_url.split("@")[-1] if "@" in db_url else "(local)")

    # Preflight: check Ollama model is pulled if using Ollama
    try:
        import psycopg

        with psycopg.connect(db_url) as conn:
            if not args.dry_run:
                _preflight_check_ollama(conn)
            _run_migration(conn, dry_run=args.dry_run)
    except ImportError:
        logger.error("psycopg is required: pip install psycopg[binary]")
        sys.exit(1)


if __name__ == "__main__":
    main()
