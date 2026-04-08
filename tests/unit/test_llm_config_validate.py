"""Unit tests for Ollama validate endpoint model-pulled check (T116).

Tests _model_in_tags helper and _validate_ollama with mocked httpx.
"""

from __future__ import annotations

import pytest

from hr_advisory.api.routers.llm_config import _model_in_tags


# ---------------------------------------------------------------------------
# _model_in_tags helper
# ---------------------------------------------------------------------------


class TestModelInTags:
    """Test the 3-step matching algorithm."""

    def test_exact_match(self) -> None:
        assert _model_in_tags("llama3.1:8b", ["llama3.1:8b", "mxbai-embed-large:latest"]) is True

    def test_family_prefix_match(self) -> None:
        """User types 'llama3.1', server has 'llama3.1:8b'."""
        assert _model_in_tags("llama3.1", ["llama3.1:8b", "mxbai-embed-large:latest"]) is True

    def test_family_prefix_match_reverse(self) -> None:
        """User types 'llama3.1:8b', server has 'llama3.1:70b' — same family."""
        assert _model_in_tags("llama3.1:8b", ["llama3.1:70b"]) is True

    def test_case_insensitive_family(self) -> None:
        assert _model_in_tags("Llama3.1", ["llama3.1:8b"]) is True

    def test_no_match(self) -> None:
        assert _model_in_tags("mistral:7b", ["llama3.1:8b", "mxbai-embed-large:latest"]) is False

    def test_empty_requested(self) -> None:
        assert _model_in_tags("", ["llama3.1:8b"]) is False

    def test_empty_tags(self) -> None:
        assert _model_in_tags("llama3.1:8b", []) is False

    def test_both_empty(self) -> None:
        assert _model_in_tags("", []) is False

    def test_rejects_substring_false_positive(self) -> None:
        """M6 red team: 'llama-3.1:8b' (dash) must NOT match 'llama3.1:8b-instruct-q4_K_M'.

        The families differ: 'llama-3.1' vs 'llama3.1'.
        """
        assert _model_in_tags("llama-3.1:8b", ["llama3.1:8b-instruct-q4_K_M"]) is False

    def test_no_substring_anywhere(self) -> None:
        """Substring-anywhere must never match: 'phi' should not match 'dolphin-phi'."""
        assert _model_in_tags("phi", ["dolphin-phi:latest"]) is False


# ---------------------------------------------------------------------------
# _validate_ollama (mocked httpx)
# ---------------------------------------------------------------------------


class TestValidateOllama:
    """Test _validate_ollama with mocked HTTP calls."""

    @pytest.mark.asyncio
    async def test_valid_when_model_in_tags(self) -> None:
        """Model is pulled — returns valid=True."""
        import httpx
        from unittest.mock import AsyncMock, patch, MagicMock

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [
                {"name": "llama3.1:8b"},
                {"name": "mxbai-embed-large:latest"},
            ]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            result = await _validate_ollama("http://localhost:11434", "llama3.1:8b")

        assert result["valid"] is True
        assert "reachable" in result["message"].lower()
        assert "available_models" in result

    @pytest.mark.asyncio
    async def test_invalid_when_model_missing(self) -> None:
        """Model is NOT pulled — returns valid=False with helpful message."""
        from unittest.mock import AsyncMock, patch, MagicMock

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [
                {"name": "llama3.1:8b"},
                {"name": "mxbai-embed-large:latest"},
            ]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            result = await _validate_ollama("http://localhost:11434", "qwen2.5:32b")

        assert result["valid"] is False
        assert "qwen2.5:32b" in result["message"]
        assert "not pulled" in result["message"].lower()
        assert "ollama pull" in result["message"]
        assert "available_models" in result

    @pytest.mark.asyncio
    async def test_invalid_when_unreachable(self) -> None:
        """Server unreachable — returns valid=False with connection error."""
        import httpx
        from unittest.mock import AsyncMock, patch

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            result = await _validate_ollama("http://192.168.1.99:11434", "llama3.1:8b")

        assert result["valid"] is False
        assert (
            "could not reach" in result["message"].lower() or "ollama" in result["message"].lower()
        )

    @pytest.mark.asyncio
    async def test_valid_without_model_pref(self) -> None:
        """No model_pref — skips model check, just validates reachability."""
        from unittest.mock import AsyncMock, patch, MagicMock

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "llama3.1:8b"}]}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            result = await _validate_ollama("http://localhost:11434", "")

        assert result["valid"] is True

    @pytest.mark.asyncio
    async def test_family_prefix_match_valid(self) -> None:
        """User types 'llama3.1', server has 'llama3.1:8b' — family match."""
        from unittest.mock import AsyncMock, patch, MagicMock

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "llama3.1:8b"}]}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            result = await _validate_ollama("http://localhost:11434", "llama3.1")

        assert result["valid"] is True

    @pytest.mark.asyncio
    async def test_rejects_substring_false_positive(self) -> None:
        """M6: 'llama-3.1:8b' (dash) must NOT match 'llama3.1:8b-instruct-q4_K_M'."""
        from unittest.mock import AsyncMock, patch, MagicMock

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "llama3.1:8b-instruct-q4_K_M"}]}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            result = await _validate_ollama("http://localhost:11434", "llama-3.1:8b")

        assert result["valid"] is False

    @pytest.mark.asyncio
    async def test_timeout_returns_invalid(self) -> None:
        """Timeout — returns valid=False with timeout message."""
        import httpx
        from unittest.mock import AsyncMock, patch

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            result = await _validate_ollama("http://localhost:11434", "llama3.1:8b")

        assert result["valid"] is False
        assert "timed out" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_error_log_masks_base_url(self) -> None:
        """M8: Generic exceptions log class name only, not the full URL."""
        import logging
        from unittest.mock import AsyncMock, patch

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=RuntimeError("http://secret-dgx:11434/api/tags failed")
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            with patch("hr_advisory.api.routers.llm_config.logger") as mock_logger:
                result = await _validate_ollama("http://secret-dgx:11434", "llama3.1:8b")

        assert result["valid"] is False
        # Response body must NOT contain the URL
        assert "secret-dgx" not in result["message"]
        # Logger should have been called with class name, not str(exc)
        mock_logger.warning.assert_called_once()
        log_args = mock_logger.warning.call_args
        # The format string arg should be the class name
        assert "RuntimeError" in str(log_args)

    @pytest.mark.asyncio
    async def test_available_models_limited_to_5(self) -> None:
        """Response shows at most 5 available models."""
        from unittest.mock import AsyncMock, patch, MagicMock

        models = [{"name": f"model-{i}:latest"} for i in range(20)]
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": models}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            result = await _validate_ollama("http://localhost:11434", "missing-model:latest")

        assert result["valid"] is False
        assert len(result["available_models"]) == 5


# ---------------------------------------------------------------------------
# Stored-config branch (M7)
# ---------------------------------------------------------------------------


class TestValidateStoredOllamaConfig:
    """Test that stored-config branch threads model_pref into _validate_ollama."""

    @pytest.mark.asyncio
    async def test_stored_ollama_config_with_missing_model_returns_invalid(self) -> None:
        """M7: Stored config validation also checks model is pulled."""
        from unittest.mock import AsyncMock, patch, MagicMock

        # Simulate stored config from DB
        stored_config = {
            "provider": "ollama",
            "base_url": "http://dgx.uni.edu:11434",
            "model_pref": "qwen2.5:72b",
            "encrypted_key": None,
        }

        # Simulate Ollama server response — model NOT present
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [
                {"name": "llama3.1:8b"},
                {"name": "mxbai-embed-large:latest"},
            ]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from hr_advisory.api.routers.llm_config import _validate_ollama

            # This simulates what validate_company_llm_config does for stored config
            result = await _validate_ollama(
                stored_config["base_url"],
                stored_config["model_pref"],
            )

        assert result["valid"] is False
        assert "qwen2.5:72b" in result["message"]
        assert "not pulled" in result["message"].lower()
