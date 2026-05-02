"""Unit tests for the provider-aware embedding pipeline (T119, T125).

Tests EmbeddingPipeline with mocked transport — verifies both Ollama and
OpenAI paths produce 1024-dim vectors and raise on dimension mismatches
or missing providers.

Mock contracts pinned to:
- Ollama /api/embeddings: {"embedding": [...]}
- OpenAI embeddings.create: response.data[0].embedding
"""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest

# NOTE: Earlier revisions installed `MagicMock()` into `sys.modules` for
# `kaizen.*` to work around a broken import chain. That workaround corrupted
# `sys.modules` for every test file collected after this one, causing metaclass
# conflicts when a later test imported the REAL `hr_advisory.agents.actions.document_gen`
# (which does `from kaizen import Agent as BaseAgent`). kailash-kaizen 2.7.4
# imports cleanly, so the shim has been removed.

from hr_advisory.kb.embeddings import EMBEDDING_DIMENSIONS, EmbeddingPipeline


def _make_ctx(provider: str = "openai", api_key: str = "sk-test", base_url: str = "") -> MagicMock:
    """Build a minimal LLMKeyContext mock."""
    ctx = MagicMock()
    ctx.provider = provider
    ctx.api_key = api_key
    ctx.base_url = base_url
    return ctx


class TestEmbeddingPipelineOllama:
    """Ollama embedding path with mocked httpx."""

    def test_embedding_pipeline_ollama_returns_1024_dim_vector(self) -> None:
        """Ollama path returns a 1024-dim vector when server responds correctly."""
        ctx = _make_ctx(provider="ollama", base_url="http://localhost:11434")
        pipeline = EmbeddingPipeline(ctx=ctx)

        fake_embedding = [0.1] * EMBEDDING_DIMENSIONS
        mock_response = MagicMock()
        mock_response.json.return_value = {"embedding": fake_embedding}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.post", return_value=mock_response):
            result = pipeline.generate_embedding("test text")

        assert len(result) == EMBEDDING_DIMENSIONS
        assert result == fake_embedding

    def test_embedding_pipeline_ollama_raises_on_wrong_dim(self) -> None:
        """Ollama path raises RuntimeError when vector dimensions != 1024."""
        ctx = _make_ctx(provider="ollama", base_url="http://localhost:11434")
        pipeline = EmbeddingPipeline(ctx=ctx)

        wrong_dim_embedding = [0.1] * 768  # Wrong dimensions
        mock_response = MagicMock()
        mock_response.json.return_value = {"embedding": wrong_dim_embedding}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.post", return_value=mock_response):
            with pytest.raises(RuntimeError, match="Expected 1024-dim"):
                pipeline.generate_embedding("test text")

    def test_embedding_pipeline_ollama_raises_on_missing_base_url(self) -> None:
        """Ollama path raises RuntimeError when base_url is empty."""
        ctx = _make_ctx(provider="ollama", base_url="")
        pipeline = EmbeddingPipeline(ctx=ctx)

        with pytest.raises(RuntimeError, match="OLLAMA_BASE_URL"):
            pipeline.generate_embedding("test text")


class TestEmbeddingPipelineOpenAI:
    """OpenAI embedding path with mocked openai client."""

    def test_embedding_pipeline_openai_returns_1024_dim_vector(self) -> None:
        """OpenAI path returns a 1024-dim vector when API responds correctly."""
        ctx = _make_ctx(provider="openai", api_key="sk-test-key")
        pipeline = EmbeddingPipeline(ctx=ctx)

        fake_embedding = [0.2] * EMBEDDING_DIMENSIONS

        @dataclass
        class FakeEmbeddingData:
            embedding: list[float]

        @dataclass
        class FakeResponse:
            data: list[FakeEmbeddingData]

        mock_client = MagicMock()
        mock_client.embeddings.create.return_value = FakeResponse(
            data=[FakeEmbeddingData(embedding=fake_embedding)]
        )

        with patch("openai.OpenAI", return_value=mock_client):
            result = pipeline.generate_embedding("test text")

        assert len(result) == EMBEDDING_DIMENSIONS
        assert result == fake_embedding
        # Verify dimensions=1024 was passed to the API
        call_kwargs = mock_client.embeddings.create.call_args
        assert (
            call_kwargs.kwargs.get("dimensions") == EMBEDDING_DIMENSIONS
            or call_kwargs[1].get("dimensions") == EMBEDDING_DIMENSIONS
        )


class TestEmbeddingPipelineMissingProvider:
    """Tests for missing or misconfigured provider."""

    def test_embedding_pipeline_raises_on_missing_provider(self) -> None:
        """OpenAI path raises RuntimeError when api_key is empty."""
        ctx = _make_ctx(provider="openai", api_key="")
        pipeline = EmbeddingPipeline(ctx=ctx)

        with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
            pipeline.generate_embedding("test text")

    def test_embedding_pipeline_no_silent_fallback(self) -> None:
        """EmbeddingPipeline never silently falls back between providers.

        If the context says "ollama" but base_url is empty, it must raise
        rather than silently trying OpenAI.
        """
        ctx = _make_ctx(provider="ollama", api_key="sk-openai-key", base_url="")
        pipeline = EmbeddingPipeline(ctx=ctx)

        with pytest.raises(RuntimeError, match="OLLAMA_BASE_URL"):
            pipeline.generate_embedding("test text")

    def test_embedding_pipeline_uses_dimensions_1024_for_openai(self) -> None:
        """OpenAI path passes dimensions=1024 to the API."""
        ctx = _make_ctx(provider="openai", api_key="sk-test")
        pipeline = EmbeddingPipeline(ctx=ctx)

        @dataclass
        class FakeEmbeddingData:
            embedding: list[float]

        @dataclass
        class FakeResponse:
            data: list[FakeEmbeddingData]

        mock_client = MagicMock()
        mock_client.embeddings.create.return_value = FakeResponse(
            data=[FakeEmbeddingData(embedding=[0.1] * EMBEDDING_DIMENSIONS)]
        )

        with patch("openai.OpenAI", return_value=mock_client):
            pipeline.generate_embedding("test text")

        _, kwargs = mock_client.embeddings.create.call_args
        assert kwargs["dimensions"] == 1024
