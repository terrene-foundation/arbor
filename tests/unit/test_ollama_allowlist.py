# Copyright 2026 Terrene Foundation
# SPDX-License-Identifier: Apache-2.0

"""Unit tests for Ollama tool-capability allowlist (T115).

Tests:
1. validate_ollama_model — pure function (accepts/rejects families)
2. save_company_llm_config — rejects missing/bad model for ollama/custom
3. save_user_personal_config — same + SSRF protection (M5)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hr_advisory.services.llm_config import (
    OLLAMA_TOOL_CAPABLE_FAMILIES,
    validate_ollama_model,
)


# ---------------------------------------------------------------------------
# 1. validate_ollama_model — pure function tests
# ---------------------------------------------------------------------------


class TestValidateOllamaModel:
    """Test the Ollama tool-capability allowlist validator."""

    def test_allowlist_is_frozenset(self) -> None:
        """OLLAMA_TOOL_CAPABLE_FAMILIES is immutable."""
        assert isinstance(OLLAMA_TOOL_CAPABLE_FAMILIES, frozenset)

    def test_allowlist_rejects_phi3(self) -> None:
        """phi3 is not tool-capable and must be rejected."""
        with pytest.raises(ValueError, match="not tool-capable"):
            validate_ollama_model("phi3:14b")

    def test_allowlist_rejects_llama2(self) -> None:
        """llama2 is not tool-capable and must be rejected."""
        with pytest.raises(ValueError, match="not tool-capable"):
            validate_ollama_model("llama2:13b")

    def test_allowlist_accepts_llama31(self) -> None:
        """llama3.1 is tool-capable and must be accepted."""
        validate_ollama_model("llama3.1")  # no tag

    def test_allowlist_accepts_llama31_with_tag(self) -> None:
        """llama3.1 with a quantization tag must be accepted."""
        validate_ollama_model("llama3.1:70b-instruct-q4_0")

    def test_allowlist_accepts_qwen25_with_tag(self) -> None:
        """qwen2.5 with a tag must be accepted."""
        validate_ollama_model("qwen2.5:32b")

    def test_allowlist_accepts_command_r(self) -> None:
        """command-r must be accepted."""
        validate_ollama_model("command-r:latest")

    def test_allowlist_accepts_command_r_plus(self) -> None:
        """command-r-plus must be accepted."""
        validate_ollama_model("command-r-plus")

    def test_case_insensitive(self) -> None:
        """Model family matching is case-insensitive."""
        validate_ollama_model("LLAMA3.1")
        validate_ollama_model("Qwen2.5:32B")

    def test_rejects_empty_string(self) -> None:
        """Empty string must be rejected."""
        with pytest.raises(ValueError, match="required and may not be empty"):
            validate_ollama_model("")

    def test_rejects_whitespace_only(self) -> None:
        """Whitespace-only string must be rejected."""
        with pytest.raises(ValueError, match="required and may not be empty"):
            validate_ollama_model("   ")

    def test_error_message_names_allowlist(self) -> None:
        """Rejection error message lists the allowed families."""
        with pytest.raises(ValueError, match="command-r") as exc_info:
            validate_ollama_model("gemma2:9b")
        # Verify the message contains multiple families
        msg = str(exc_info.value)
        assert "llama3.1" in msg
        assert "qwen2.5" in msg


# ---------------------------------------------------------------------------
# Router test helpers
# ---------------------------------------------------------------------------

from hr_advisory.api.routers.llm_config import router, user_llm_router


def _make_company_app() -> FastAPI:
    """Build a minimal FastAPI app with the company LLM config router."""
    app = FastAPI()
    app.include_router(router, prefix="/companies")
    return app


def _make_user_app() -> FastAPI:
    """Build a minimal FastAPI app with the user LLM config router."""
    app = FastAPI()
    app.include_router(user_llm_router, prefix="/users")
    return app


def _fake_admin(company_id: int = 1) -> dict:
    return {
        "sub": 10,
        "email": "admin@example.com",
        "role": "owner",
        "company_id": company_id,
    }


@pytest.fixture()
def company_client():
    """Test client for company-level LLM config endpoints.

    Overrides get_current_user (which require_role depends on) and
    patches validate_company_access to bypass tenant isolation.
    """
    from hr_advisory.api.middleware.auth_middleware import get_current_user

    app = _make_company_app()
    app.dependency_overrides[get_current_user] = lambda: _fake_admin()
    with patch("hr_advisory.api.routers.llm_config.validate_company_access"):
        yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def user_client():
    """Test client for user-level LLM config endpoints."""
    from hr_advisory.api.middleware.auth_middleware import get_current_user

    app = _make_user_app()
    app.dependency_overrides[get_current_user] = lambda: _fake_admin()
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 2. save_company_llm_config — router-level tests
# ---------------------------------------------------------------------------


class TestSaveCompanyConfigOllamaAllowlist:
    """POST /companies/{id}/llm-config — Ollama/custom model validation."""

    @patch("hr_advisory.api.routers.llm_config.save_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    def test_save_config_rejects_missing_model_for_ollama(
        self, mock_audit, mock_save, company_client
    ) -> None:
        """Ollama save without model_pref returns 400."""
        resp = company_client.post(
            "/companies/1/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://localhost:11434",
            },
        )
        assert resp.status_code == 400
        assert "model_pref is required" in resp.json()["detail"]
        mock_save.assert_not_called()

    @patch("hr_advisory.api.routers.llm_config.save_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    def test_save_config_rejects_phi3_for_ollama(
        self, mock_audit, mock_save, company_client
    ) -> None:
        """Ollama save with phi3 (non-tool-capable) returns 400 naming the allowlist."""
        resp = company_client.post(
            "/companies/1/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://localhost:11434",
                "model_pref": "phi3:14b",
            },
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "not tool-capable" in detail
        assert "llama3.1" in detail  # allowlist named in error
        mock_save.assert_not_called()

    @patch("hr_advisory.api.routers.llm_config.save_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    def test_save_config_accepts_llama31_for_ollama(
        self, mock_audit, mock_save, company_client
    ) -> None:
        """Ollama save with llama3.1 (tool-capable) succeeds."""
        mock_save.return_value = {
            "id": 1,
            "company_id": 1,
            "provider": "ollama",
            "model_pref": "llama3.1:70b",
            "base_url": "http://localhost:11434",
            "status": "active",
            "is_active": True,
        }
        resp = company_client.post(
            "/companies/1/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://localhost:11434",
                "model_pref": "llama3.1:70b",
            },
        )
        assert resp.status_code == 200
        mock_save.assert_called_once()

    @patch("hr_advisory.api.routers.llm_config.save_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    def test_save_config_accepts_qwen25_with_tag(
        self, mock_audit, mock_save, company_client
    ) -> None:
        """Ollama save with qwen2.5:32b (tool-capable, tagged) succeeds."""
        mock_save.return_value = {
            "id": 2,
            "company_id": 1,
            "provider": "ollama",
            "model_pref": "qwen2.5:32b",
            "base_url": "http://localhost:11434",
            "status": "active",
            "is_active": True,
        }
        resp = company_client.post(
            "/companies/1/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://localhost:11434",
                "model_pref": "qwen2.5:32b",
            },
        )
        assert resp.status_code == 200
        mock_save.assert_called_once()

    @patch("hr_advisory.api.routers.llm_config.save_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    def test_save_config_rejects_missing_model_for_custom(
        self, mock_audit, mock_save, company_client
    ) -> None:
        """Custom provider save without model_pref returns 400."""
        resp = company_client.post(
            "/companies/1/llm-config",
            json={
                "provider": "custom",
                "base_url": "http://my-llm.internal:8080",
                "api_key": "sk-custom-key-1234",
            },
        )
        assert resp.status_code == 400
        assert "model_pref is required" in resp.json()["detail"]
        mock_save.assert_not_called()


# ---------------------------------------------------------------------------
# 3. save_user_personal_config — router-level tests
# ---------------------------------------------------------------------------


class TestSaveUserConfigOllamaAllowlist:
    """POST /users/me/llm-config — Ollama/custom model validation + SSRF."""

    @patch("hr_advisory.api.routers.llm_config.save_user_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    def test_save_config_rejects_missing_model_for_ollama(
        self, mock_audit, mock_save, user_client
    ) -> None:
        """User Ollama save without model_pref returns 400."""
        resp = user_client.post(
            "/users/me/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://localhost:11434",
            },
        )
        assert resp.status_code == 400
        assert "model_pref is required" in resp.json()["detail"]
        mock_save.assert_not_called()

    @patch("hr_advisory.api.routers.llm_config.save_user_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    def test_save_config_rejects_phi3_for_ollama(self, mock_audit, mock_save, user_client) -> None:
        """User Ollama save with phi3 returns 400 naming the allowlist."""
        resp = user_client.post(
            "/users/me/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://localhost:11434",
                "model_pref": "phi3:14b",
            },
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "not tool-capable" in detail
        assert "llama3.1" in detail
        mock_save.assert_not_called()

    @patch("hr_advisory.api.routers.llm_config.save_user_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    @patch("hr_advisory.api.routers.llm_config.encrypt_api_key", return_value=None)
    def test_save_config_accepts_llama31_for_ollama(
        self, mock_encrypt, mock_audit, mock_save, user_client
    ) -> None:
        """User Ollama save with llama3.1 succeeds."""
        mock_save.return_value = {
            "id": 1,
            "company_id": 1,
            "provider": "ollama",
            "model_pref": "llama3.1:70b",
            "base_url": "http://localhost:11434",
            "status": "active",
            "is_active": True,
        }
        resp = user_client.post(
            "/users/me/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://localhost:11434",
                "model_pref": "llama3.1:70b",
            },
        )
        assert resp.status_code == 200
        mock_save.assert_called_once()

    @patch("hr_advisory.api.routers.llm_config.save_user_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    @patch("hr_advisory.api.routers.llm_config.encrypt_api_key", return_value=None)
    def test_save_config_accepts_qwen25_with_tag(
        self, mock_encrypt, mock_audit, mock_save, user_client
    ) -> None:
        """User Ollama save with qwen2.5:32b succeeds."""
        mock_save.return_value = {
            "id": 2,
            "company_id": 1,
            "provider": "ollama",
            "model_pref": "qwen2.5:32b",
            "base_url": "http://localhost:11434",
            "status": "active",
            "is_active": True,
        }
        resp = user_client.post(
            "/users/me/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://localhost:11434",
                "model_pref": "qwen2.5:32b",
            },
        )
        assert resp.status_code == 200
        mock_save.assert_called_once()

    def test_save_user_personal_config_rejects_metadata_ip(self, user_client) -> None:
        """M5 SSRF regression: user save rejects cloud metadata IP."""
        resp = user_client.post(
            "/users/me/llm-config",
            json={
                "provider": "ollama",
                "base_url": "http://169.254.169.254/latest/meta-data",
                "model_pref": "llama3.1:70b",
            },
        )
        assert resp.status_code == 400
        assert "not allowed" in resp.json()["detail"]

    @patch("hr_advisory.api.routers.llm_config.save_user_llm_config")
    @patch("hr_advisory.api.routers.llm_config.log_audit_event")
    def test_save_config_rejects_missing_model_for_custom(
        self, mock_audit, mock_save, user_client
    ) -> None:
        """User custom provider save without model_pref returns 400."""
        resp = user_client.post(
            "/users/me/llm-config",
            json={
                "provider": "custom",
                "base_url": "http://my-llm.internal:8080",
                "api_key": "sk-custom-key-1234",
            },
        )
        assert resp.status_code == 400
        assert "model_pref is required" in resp.json()["detail"]
        mock_save.assert_not_called()
