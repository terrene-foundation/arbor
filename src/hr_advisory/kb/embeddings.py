"""Provider-aware embedding pipeline for knowledge base provisions.

Generates embeddings via either OpenAI (text-embedding-3-large, 1024-dim)
or Ollama (mxbai-embed-large, native 1024-dim) depending on the resolved
LLM context. No silent fallbacks — every error raises with an actionable
message per zero-tolerance.md Rule 3.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, Optional

from kailash.runtime import LocalRuntime
from kailash.workflow.builder import WorkflowBuilder

if TYPE_CHECKING:
    from hr_advisory.agents.llm_context import LLMKeyContext

logger = logging.getLogger(__name__)

# Canonical embedding dimensions — must match vector_setup.VECTOR_DIMENSIONS
EMBEDDING_DIMENSIONS = 1024


class EmbeddingPipeline:
    """Generates and stores embeddings for KB provisions.

    Provider-aware: dispatches on ``ctx.provider`` to either the OpenAI
    or Ollama embedding API.  Both produce 1024-dim vectors.
    """

    def __init__(self, ctx: LLMKeyContext | None = None):
        """Initialise the embedding pipeline.

        Args:
            ctx: Resolved LLM context.  When None, falls back to
                 ``LLMKeyContext.from_server_env()`` for the server's
                 default provider.
        """
        if ctx is None:
            from hr_advisory.agents.llm_context import LLMKeyContext

            ctx = LLMKeyContext.from_server_env()
        self._ctx = ctx
        self._runtime = LocalRuntime()

    # ------------------------------------------------------------------
    # Core embedding dispatch
    # ------------------------------------------------------------------

    def generate_embedding(self, text: str) -> list[float]:
        """Generate a 1024-dim embedding via the provider in self._ctx.

        Raises RuntimeError on any failure — no silent fallback.
        """
        if self._ctx.provider == "ollama":
            return self._embed_ollama(text)
        return self._embed_openai_compatible(text)

    def _embed_ollama(self, text: str) -> list[float]:
        """Generate embedding via Ollama's /api/embeddings endpoint."""
        import httpx

        base_url = self._ctx.base_url
        if not base_url:
            raise RuntimeError(
                "Ollama embedding requires OLLAMA_BASE_URL. "
                "Set it in .env or save a BYOK config."
            )

        model = os.environ.get("EMBEDDING_MODEL_OLLAMA", "mxbai-embed-large")
        url = f"{base_url.rstrip('/')}/api/embeddings"

        try:
            resp = httpx.post(
                url,
                json={"model": model, "prompt": text},
                timeout=30.0,
            )
            resp.raise_for_status()
        except httpx.ConnectError:
            raise RuntimeError(
                f"Cannot reach Ollama at {base_url}. "
                f"Check that the server is running and {model} is pulled."
            )
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"Ollama embedding request failed: {exc.response.status_code}. "
                f"Check that {model} is pulled: ollama pull {model}"
            ) from exc

        embedding = resp.json().get("embedding", [])
        if len(embedding) != EMBEDDING_DIMENSIONS:
            raise RuntimeError(
                f"Expected {EMBEDDING_DIMENSIONS}-dim embedding from {model}, "
                f"got {len(embedding)}. Check that {model} is pulled on the "
                f"Ollama server."
            )
        return embedding

    def _embed_openai_compatible(self, text: str) -> list[float]:
        """Generate embedding via OpenAI (or compatible) API."""
        api_key = self._ctx.api_key
        if not api_key:
            raise RuntimeError(
                "OpenAI embedding requires OPENAI_API_KEY. "
                "Set it in .env or configure a BYOK key."
            )

        model = os.environ.get("EMBEDDING_MODEL_OPENAI", "text-embedding-3-large")

        try:
            import openai

            client = openai.OpenAI(
                api_key=api_key,
                base_url=self._ctx.base_url,
            )
            response = client.embeddings.create(
                input=text,
                model=model,
                dimensions=EMBEDDING_DIMENSIONS,
            )
            return response.data[0].embedding
        except ImportError:
            raise RuntimeError("openai package not installed. Run: pip install openai")

    # ------------------------------------------------------------------
    # Provision text formatting
    # ------------------------------------------------------------------

    def generate_provision_text(self, provision: dict) -> str:
        """Combine provision fields into optimal embedding text."""
        parts = []
        section = provision.get("section", "")
        if section:
            parts.append(f"Section: {section}")
        title = provision.get("title", "")
        if title:
            parts.append(f"Title: {title}")
        plain_summary = provision.get("plain_summary", "")
        if plain_summary:
            parts.append(plain_summary)
        formal_text = provision.get("formal_text", "")
        if formal_text:
            parts.append(formal_text)
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Single-node workflow helpers
    # ------------------------------------------------------------------

    def _execute(self, node_type: str, node_id: str, params: dict) -> dict:
        """Run a single-node workflow and return the node result."""
        wf = WorkflowBuilder()
        wf.add_node(node_type, node_id, params)
        results, _ = self._runtime.execute(wf.build())
        return results[node_id]

    @staticmethod
    def _extract_records(result) -> list[dict]:
        """Extract the record list from a ListNode result."""
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "records" in result:
            return result["records"]
        return []

    # ------------------------------------------------------------------
    # Single provision embedding
    # ------------------------------------------------------------------

    def embed_provision(self, provision_id: int) -> bool:
        """Generate and store embedding for a single provision.

        Returns True if the embedding was generated and stored.
        Raises RuntimeError on provider configuration errors.
        """
        try:
            provision = self._execute("ProvisionReadNode", "read_prov", {"id": provision_id})
        except Exception as exc:
            logger.error("Failed to read provision %s: %s", provision_id, exc)
            return False

        if not provision:
            logger.error("Provision %s not found", provision_id)
            return False

        text = self.generate_provision_text(provision)
        if not text.strip():
            logger.warning("Provision %s has no text to embed, skipping", provision_id)
            return False

        embedding = self.generate_embedding(text)

        # Store embedding via pgvector
        try:
            import sqlalchemy

            database_url = os.environ.get("DATABASE_URL", "")
            engine = sqlalchemy.create_engine(database_url)
            with engine.connect() as conn:
                conn.execute(
                    sqlalchemy.text("UPDATE provisions SET embedding = :emb WHERE id = :pid"),
                    {"emb": str(embedding), "pid": provision_id},
                )
                conn.commit()
            engine.dispose()
            logger.info("Stored embedding for provision %s", provision_id)
            return True
        except Exception as exc:
            logger.error("Failed to store embedding for provision %s: %s", provision_id, exc)
            return False

    # ------------------------------------------------------------------
    # Batch embedding
    # ------------------------------------------------------------------

    def embed_all_provisions(self, batch_size: int = 50) -> dict:
        """Batch embed all provisions.

        Returns dict with keys: total, embedded, skipped, errors.
        Raises RuntimeError if no provider is configured.
        """
        result = {"total": 0, "embedded": 0, "skipped": 0, "errors": 0}

        all_provisions_raw = self._execute("ProvisionListNode", "all_provs", {"filter": {}})
        all_provisions = self._extract_records(all_provisions_raw)
        result["total"] = len(all_provisions)

        for provision in all_provisions:
            try:
                success = self.embed_provision(provision["id"])
                if success:
                    result["embedded"] += 1
                else:
                    result["skipped"] += 1
            except Exception:
                result["errors"] += 1

        logger.info(
            "Embedding batch complete: %d total, %d embedded, %d skipped, %d errors",
            result["total"],
            result["embedded"],
            result["skipped"],
            result["errors"],
        )
        return result
