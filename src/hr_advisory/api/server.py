"""Server entrypoint for the HR Advisory Nexus platform.

Starts the Nexus server with configuration from environment variables.
Can be run directly: ``python -m hr_advisory.api.server``
"""

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root before any settings are read
_project_root = Path(__file__).resolve().parents[3]
load_dotenv(_project_root / ".env")

from hr_advisory.api.platform import create_platform
from hr_advisory.config.settings import Settings, get_settings


def _validate_env_invariants(settings: Settings) -> None:
    """Pre-construct validation: env-only, no DB access.

    Raises ``RuntimeError`` if the server-default LLM configuration is
    invalid.  Skipped in test mode so that pytest can import this module
    without needing a fully configured LLM provider.
    """
    # Test-mode carve-out: skip the invariant check during pytest runs.
    if settings.app_env == "test" or os.environ.get("PYTEST_CURRENT_TEST"):
        return

    has_openai = bool(settings.openai_api_key)
    has_ollama_model = bool(settings.ollama_model)
    # Only treat Ollama URL as "explicitly configured" when it differs from
    # the dataclass default — the default is always present.
    _default_ollama_url = "http://localhost:11434"
    has_explicit_ollama_url = bool(
        settings.ollama_base_url and settings.ollama_base_url != _default_ollama_url
    )

    # At least one provider must be configured
    if not has_openai and not has_ollama_model:
        # Distinguish: user set a custom URL but forgot the model name
        if has_explicit_ollama_url:
            raise RuntimeError(
                "OLLAMA_BASE_URL is set but OLLAMA_MODEL is empty. "
                "Set OLLAMA_MODEL to a tool-capable model (e.g. 'llama3.1:70b')."
            )
        raise RuntimeError(
            "No LLM provider configured. Set OPENAI_API_KEY for a cloud "
            "provider, or OLLAMA_MODEL + OLLAMA_BASE_URL for local Ollama. "
            "See docs/setup.md for details."
        )

    # Validate the Ollama model is tool-capable
    if has_ollama_model:
        from hr_advisory.services.llm_config import validate_ollama_model

        try:
            validate_ollama_model(settings.ollama_model)
        except ValueError as exc:
            raise RuntimeError(
                f"OLLAMA_MODEL={settings.ollama_model!r} is not tool-capable: {exc}"
            ) from exc


def main() -> None:
    """Configure logging and start the Nexus platform."""
    settings = get_settings()

    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    logger = logging.getLogger(__name__)

    # Validate LLM env invariants before constructing the platform
    _validate_env_invariants(settings)

    logger.info(
        "Starting HR Advisory API (env=%s, host=%s, port=%d)",
        settings.app_env,
        settings.api_host,
        settings.api_port,
    )

    app = create_platform(settings)

    # app.start() is blocking (runs uvicorn under the hood)
    app.start()


if __name__ == "__main__":
    main()
