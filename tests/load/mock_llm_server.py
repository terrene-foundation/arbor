"""Mock Ollama-compatible LLM server for load testing.

Mimics both Ollama native (/api/chat, /api/tags) and OpenAI-compatible
(/v1/chat/completions) endpoints with configurable latency. Isolates
Arbor load tests from real LLM inference costs and GPU contention.

Usage:
    uv run python tests/load/mock_llm_server.py

Environment:
    MOCK_LLM_PORT          - Port to listen on (default: 11434)
    MOCK_LLM_LATENCY_MIN   - Minimum response delay in seconds (default: 2.0)
    MOCK_LLM_LATENCY_MAX   - Maximum response delay in seconds (default: 5.0)
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
from collections.abc import AsyncGenerator

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Mock LLM Server (Load Testing)")

LATENCY_MIN = float(os.environ.get("MOCK_LLM_LATENCY_MIN", "2.0"))
LATENCY_MAX = float(os.environ.get("MOCK_LLM_LATENCY_MAX", "5.0"))
DEFAULT_MODEL = os.environ.get("MOCK_LLM_MODEL", "qwen3:latest")

# Canned advisory responses that look realistic
CANNED_RESPONSES = [
    (
        "Under the Employment Act (Cap. 91), an employee who has served an employer "
        "for at least 3 months is entitled to paid sick leave. The entitlement is "
        "14 days of outpatient sick leave and 60 days of hospitalisation leave per year. "
        "The employer must pay the employee at the gross rate of pay for each day of "
        "paid sick leave taken."
    ),
    (
        "For CPF contributions in 2026, employers must contribute at the following rates "
        "for employees aged 55 and below: 17% employer contribution and 20% employee "
        "contribution, for a total of 37%. The Ordinary Wage ceiling is $8,000 per month. "
        "Contributions are rounded to the nearest dollar."
    ),
    (
        "Paternity leave entitlement under the Child Development Co-Savings Act (CDCSA) "
        "is 28 days (4 weeks) for eligible working fathers, effective 1 January 2025. "
        "To qualify, the father must be lawfully married to the child's mother, and the "
        "child must be a Singapore Citizen."
    ),
    (
        "The Work Injury Compensation Act (WICA) covers all employees doing manual work "
        "and non-manual employees earning $2,600 or less per month. Employers must "
        "maintain work injury compensation insurance. Claims must be filed within one "
        "year of the accident or diagnosis of occupational disease."
    ),
    (
        "Under the Employment of Foreign Manpower Act (EFMA), employers must ensure "
        "valid work passes for all foreign employees. The S Pass salary threshold is "
        "$3,150 per month (from September 2025). Employers must also pay the monthly "
        "foreign worker levy, which varies by sector and tier."
    ),
]


# ── Ollama Native API (/api/*) ────────────────────────────


@app.post("/api/chat", response_model=None)
async def ollama_chat(request: Request) -> JSONResponse | StreamingResponse:
    """Mock Ollama /api/chat endpoint (native format).

    This is what kaizen-agents OllamaStreamAdapter calls.
    """
    body = await request.json()
    delay = random.uniform(LATENCY_MIN, LATENCY_MAX)
    response_text = random.choice(CANNED_RESPONSES)
    model = body.get("model", DEFAULT_MODEL)
    stream = body.get("stream", True)  # Ollama defaults to streaming

    if stream:
        return StreamingResponse(
            _ollama_stream_response(response_text, model, delay),
            media_type="application/x-ndjson",
        )

    # Non-streaming
    await asyncio.sleep(delay)
    input_tokens = sum(len(str(m.get("content", "")).split()) * 2 for m in body.get("messages", []))
    output_tokens = len(response_text.split()) * 2

    return JSONResponse(
        {
            "model": model,
            "created_at": _iso_now(),
            "message": {"role": "assistant", "content": response_text},
            "done": True,
            "total_duration": int(delay * 1e9),
            "load_duration": 0,
            "prompt_eval_count": input_tokens,
            "prompt_eval_duration": int(delay * 0.3 * 1e9),
            "eval_count": output_tokens,
            "eval_duration": int(delay * 0.7 * 1e9),
        }
    )


async def _ollama_stream_response(
    text: str, model: str, total_delay: float
) -> AsyncGenerator[str, None]:
    """Stream Ollama-format NDJSON chunks."""
    words = text.split()
    per_word_delay = total_delay / max(len(words), 1)

    for word in words:
        chunk = {
            "model": model,
            "created_at": _iso_now(),
            "message": {"role": "assistant", "content": word + " "},
            "done": False,
        }
        yield json.dumps(chunk) + "\n"
        await asyncio.sleep(per_word_delay)

    # Final chunk
    final = {
        "model": model,
        "created_at": _iso_now(),
        "message": {"role": "assistant", "content": ""},
        "done": True,
        "total_duration": int(total_delay * 1e9),
        "eval_count": len(words) * 2,
        "eval_duration": int(total_delay * 0.7 * 1e9),
    }
    yield json.dumps(final) + "\n"


@app.get("/api/tags")
async def ollama_tags() -> JSONResponse:
    """Mock Ollama /api/tags — model discovery endpoint."""
    return JSONResponse(
        {
            "models": [
                {
                    "name": DEFAULT_MODEL,
                    "model": DEFAULT_MODEL,
                    "modified_at": _iso_now(),
                    "size": 4_000_000_000,
                    "digest": "mock-digest-sha256",
                    "details": {
                        "parent_model": "",
                        "format": "gguf",
                        "family": DEFAULT_MODEL.split(":")[0],
                        "parameter_size": "7B",
                        "quantization_level": "Q4_K_M",
                    },
                }
            ]
        }
    )


@app.post("/api/embeddings")
async def ollama_embeddings(request: Request) -> JSONResponse:
    """Mock Ollama /api/embeddings — returns random embedding vector."""
    body = await request.json()
    dimensions = int(os.environ.get("EMBEDDING_DIMENSIONS", "1024"))
    # Return a deterministic-ish embedding based on input hash
    seed = hash(body.get("prompt", "")) & 0xFFFFFFFF
    rng = random.Random(seed)
    embedding = [rng.gauss(0, 0.1) for _ in range(dimensions)]
    return JSONResponse({"embedding": embedding})


# ── OpenAI-Compatible API (/v1/*) ─────────────────────────


class ChatMessage(BaseModel):
    role: str
    content: str


class OpenAIChatRequest(BaseModel):
    model: str = DEFAULT_MODEL
    messages: list[ChatMessage] = []
    temperature: float = 0.7
    max_tokens: int | None = None
    stream: bool = False
    tools: list | None = None
    tool_choice: str | None = None


@app.post("/v1/chat/completions", response_model=None)
async def openai_chat_completions(
    request: OpenAIChatRequest,
) -> JSONResponse | StreamingResponse:
    """Mock OpenAI-compatible chat completions (for BYOK/vLLM/TGI users)."""
    delay = random.uniform(LATENCY_MIN, LATENCY_MAX)
    response_text = random.choice(CANNED_RESPONSES)
    completion_id = f"chatcmpl-{os.urandom(6).hex()}"
    created = int(time.time())

    if request.stream:
        return StreamingResponse(
            _openai_stream_response(response_text, completion_id, created, delay),
            media_type="text/event-stream",
        )

    await asyncio.sleep(delay)
    input_tokens = sum(len(m.content.split()) * 2 for m in request.messages)
    output_tokens = len(response_text.split()) * 2

    return JSONResponse(
        {
            "id": completion_id,
            "object": "chat.completion",
            "created": created,
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": response_text},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": input_tokens,
                "completion_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
            },
        }
    )


async def _openai_stream_response(
    text: str, completion_id: str, created: int, total_delay: float
) -> AsyncGenerator[str, None]:
    """Stream OpenAI-format SSE chunks."""
    words = text.split()
    per_word_delay = total_delay / max(len(words), 1)

    for word in words:
        chunk = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "choices": [{"index": 0, "delta": {"content": word + " "}, "finish_reason": None}],
        }
        yield f"data: {json.dumps(chunk, separators=(',', ':'))}\n\n"
        await asyncio.sleep(per_word_delay)

    final = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    yield f"data: {json.dumps(final, separators=(',', ':'))}\n\n"
    yield "data: [DONE]\n\n"


@app.get("/v1/models")
async def openai_list_models() -> JSONResponse:
    """Mock OpenAI-compatible models list."""
    return JSONResponse(
        {
            "object": "list",
            "data": [
                {
                    "id": DEFAULT_MODEL,
                    "object": "model",
                    "created": int(time.time()),
                    "owned_by": "mock",
                }
            ],
        }
    )


# ── Health & Utilities ─────────────────────────────────────


@app.get("/health")
async def health() -> JSONResponse:
    """Health check."""
    return JSONResponse(
        {
            "status": "ok",
            "model": DEFAULT_MODEL,
            "latency_range_s": [LATENCY_MIN, LATENCY_MAX],
            "endpoints": ["/api/chat", "/api/tags", "/api/embeddings", "/v1/chat/completions"],
        }
    )


def _iso_now() -> str:
    """Current UTC timestamp in ISO format."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    port = int(os.environ.get("MOCK_LLM_PORT", "11434"))
    print(f"Mock LLM server starting on port {port}")
    print(f"Model: {DEFAULT_MODEL}")
    print(f"Latency range: {LATENCY_MIN}s - {LATENCY_MAX}s")
    print(f"Endpoints: /api/chat, /api/tags, /api/embeddings, /v1/chat/completions")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
