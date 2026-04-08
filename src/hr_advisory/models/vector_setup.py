"""pgvector setup for semantic search over provisions.

Adds a vector embedding column to the provisions table and creates
an HNSW index for fast cosine similarity search.
"""

import os

from dataflow.adapters import PostgreSQLVectorAdapter

VECTOR_DIMENSIONS = (
    1024  # mxbai-embed-large (Ollama) / text-embedding-3-large with dimensions=1024 (OpenAI)
)


def get_vector_adapter() -> PostgreSQLVectorAdapter:
    """Create the pgvector adapter for provision embeddings."""
    database_url = os.environ.get("DATABASE_URL", "")
    return PostgreSQLVectorAdapter(
        database_url,
        vector_dimensions=VECTOR_DIMENSIONS,
        default_distance="cosine",
    )


async def setup_vector_search(adapter: PostgreSQLVectorAdapter) -> None:
    """Initialize pgvector extension, column, and index.

    Safe to call multiple times — uses IF NOT EXISTS semantics.
    """
    await adapter.ensure_pgvector_extension()

    await adapter.create_vector_column(
        table_name="provisions",
        column_name="embedding",
        dimensions=VECTOR_DIMENSIONS,
    )

    await adapter.create_vector_index(
        table_name="provisions",
        column_name="embedding",
        index_type="hnsw",
        distance="cosine",
        m=16,
        ef_construction=64,
    )
