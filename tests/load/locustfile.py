"""Arbor HRIS load testing suite.

Locust test scenarios for the Arbor advisory platform.
Tests advisory queries, shadow agent, CRUD operations, and auth flows.

Usage:
    # Web UI
    uv run locust -f tests/load/locustfile.py --host http://localhost:8000

    # Headless
    uv run locust -f tests/load/locustfile.py --host http://localhost:8000 \
        --headless --users 50 --spawn-rate 5 --run-time 5m

Prerequisites:
    - Arbor backend running (pointed at mock LLM for advisory tests)
    - Mock LLM server running (tests/load/mock_llm_server.py)
    - At least one registered user (auto-created on first run)
"""

from __future__ import annotations

import logging
import os
import random
import time
import uuid

from locust import HttpUser, between, events, tag, task

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────

BASE_PASSWORD = os.environ.get("LOAD_TEST_PASSWORD", "LoadTest123!")
USER_EMAIL_PREFIX = os.environ.get("LOAD_TEST_EMAIL_PREFIX", "loadtest")
USER_EMAIL_DOMAIN = os.environ.get("LOAD_TEST_EMAIL_DOMAIN", "example.com")

# SG employment law questions for realistic advisory load
ADVISORY_QUERIES = [
    "What is the CPF contribution rate for employees aged 55 and below in 2026?",
    "How many days of annual leave is an employee entitled to after 1 year of service?",
    "What are the requirements for paternity leave under the CDCSA?",
    "Can an employer terminate an employee during probation without notice?",
    "What is the maximum overtime hours allowed per month under the Employment Act?",
    "How do I calculate the pro-rated annual leave for a mid-year joiner?",
    "What are the employer obligations under the Work Injury Compensation Act?",
    "Is an employer required to provide medical insurance for foreign workers?",
    "What is the S Pass salary threshold from September 2025?",
    "How should I handle an employee's resignation during the notice period?",
    "What are the rules around deducting salary for unauthorized absence?",
    "Can an employer require employees to work on a public holiday?",
    "What is the maternity leave entitlement for the third child?",
    "How do I calculate the ordinary wage ceiling for CPF contributions?",
    "What are the penalties for late CPF contribution payments?",
]

# Scenario selection — controls user class weights for targeted tests
SCENARIO = os.environ.get("LOCUST_SCENARIO", "baseline")

SHADOW_PAGES = ["dashboard", "employees", "payroll", "leave", "compliance", "documents"]

SHADOW_COMMANDS = [
    "Show me employees with expiring work passes",
    "What is our compliance score?",
    "Calculate CPF for salary of $5000",
    "Show leave balances for all employees",
    "What are the upcoming statutory deadlines?",
    "Generate a summary of payroll costs this month",
]


# ── Auth helpers ───────────────────────────────────────────


class TokenManager:
    """Manages JWT tokens for load test users.

    Each Locust user gets a unique email and registers on first use.
    Tokens are cached and refreshed when needed.
    """

    def __init__(self, client, user_index: int):
        self._client = client
        self._user_index = user_index
        self._email = f"{USER_EMAIL_PREFIX}_{user_index}_{uuid.uuid4().hex[:6]}@{USER_EMAIL_DOMAIN}"
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._company_id: int | None = None
        self._token_acquired_at: float = 0.0

    @property
    def headers(self) -> dict[str, str]:
        """Auth headers for API requests."""
        if not self._access_token:
            return {}
        return {"Authorization": f"Bearer {self._access_token}"}

    @property
    def company_id(self) -> int | None:
        return self._company_id

    def ensure_authenticated(self) -> bool:
        """Register or login. Returns True if authenticated."""
        # Try login first (user may exist from previous run)
        if self._try_login():
            return True
        # Register new user
        return self._register()

    def refresh_if_stale(self) -> None:
        """Refresh token if older than 10 minutes."""
        if time.time() - self._token_acquired_at > 600 and self._refresh_token:
            self._refresh()

    def _register(self) -> bool:
        company_name = f"LoadTest Co {self._user_index}"
        with self._client.post(
            "/register",
            json={
                "email": self._email,
                "password": BASE_PASSWORD,
                "name": f"Load Tester {self._user_index}",
                "company_name": company_name,
            },
            name="/register (setup)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self._access_token = data.get("access_token")
                self._refresh_token = data.get("refresh_token")
                user_data = data.get("user", {})
                self._company_id = user_data.get("company_id")
                self._token_acquired_at = time.time()
                resp.success()
                return True
            elif resp.status_code == 409:
                # Email already exists — try login
                resp.success()  # Not a test failure
                return self._try_login()
            else:
                resp.failure(f"Registration failed: {resp.status_code}")
                return False

    def _try_login(self) -> bool:
        with self._client.post(
            "/login",
            json={"email": self._email, "password": BASE_PASSWORD},
            name="/login (setup)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self._access_token = data.get("access_token")
                self._refresh_token = data.get("refresh_token")
                user_data = data.get("user", {})
                self._company_id = user_data.get("company_id")
                self._token_acquired_at = time.time()
                resp.success()
                return True
            else:
                resp.success()  # Login failure during setup is not a test failure
                return False

    def _refresh(self) -> None:
        with self._client.post(
            "/refresh",
            json={"refresh_token": self._refresh_token},
            name="/refresh (background)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self._access_token = data.get("access_token")
                self._token_acquired_at = time.time()
                resp.success()
            else:
                # Token expired — re-login
                resp.success()
                self._try_login()


# ── User counter for unique emails ────────────────────────

_user_counter = 0


def _next_user_index() -> int:
    global _user_counter
    _user_counter += 1
    return _user_counter


# ── Advisory User ─────────────────────────────────────────


class AdvisoryUser(HttpUser):
    """Simulates a user asking SG employment law questions.

    Weight 3: advisory queries are the primary load target.
    """

    weight = 3
    wait_time = between(5, 15)

    def on_start(self) -> None:
        self._token_mgr = TokenManager(self.client, _next_user_index())
        if not self._token_mgr.ensure_authenticated():
            logger.error("AdvisoryUser: failed to authenticate")
        self._conversation_id: int | None = None

    @task(5)
    @tag("advisory", "query")
    def advisory_query(self) -> None:
        """POST /advisory/query — core advisory endpoint."""
        self._token_mgr.refresh_if_stale()
        query = random.choice(ADVISORY_QUERIES)

        payload: dict = {"query": query}
        if self._conversation_id:
            payload["conversation_id"] = self._conversation_id

        with self.client.post(
            "/advisory/query",
            json=payload,
            headers=self._token_mgr.headers,
            timeout=65,  # slightly above the 60s server timeout
            name="/advisory/query",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                # Track conversation for multi-turn testing
                if "conversation_id" in data:
                    self._conversation_id = data["conversation_id"]
                resp.success()
            elif resp.status_code == 429:
                resp.success()  # Rate limit is expected behavior under load
            else:
                resp.failure(f"Advisory query failed: {resp.status_code}")

    @task(2)
    @tag("advisory", "stream")
    def advisory_stream(self) -> None:
        """POST /advisory/stream — SSE streaming endpoint."""
        self._token_mgr.refresh_if_stale()
        query = random.choice(ADVISORY_QUERIES)

        with self.client.post(
            "/advisory/stream",
            json={"query": query},
            headers=self._token_mgr.headers,
            timeout=120,
            name="/advisory/stream",
            catch_response=True,
            stream=True,
        ) as resp:
            if resp.status_code == 200:
                # Consume the SSE stream
                content_length = 0
                for chunk in resp.iter_content(chunk_size=1024):
                    content_length += len(chunk)
                if content_length > 0:
                    resp.success()
                else:
                    resp.failure("Empty stream response")
            elif resp.status_code == 429:
                resp.success()
            else:
                resp.failure(f"Advisory stream failed: {resp.status_code}")

    @task(1)
    @tag("advisory", "conversations")
    def list_conversations(self) -> None:
        """GET /advisory/conversations — conversation list."""
        self._token_mgr.refresh_if_stale()
        with self.client.get(
            "/advisory/conversations",
            headers=self._token_mgr.headers,
            name="/advisory/conversations",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 429):
                resp.success()
            else:
                resp.failure(f"List conversations failed: {resp.status_code}")

    @task(1)
    @tag("advisory", "stream", "sse-durability")
    def advisory_stream_durability(self) -> None:
        """POST /advisory/stream — verify SSE completes without premature disconnect."""
        self._token_mgr.refresh_if_stale()
        query = random.choice(ADVISORY_QUERIES)

        with self.client.post(
            "/advisory/stream",
            json={"query": query},
            headers=self._token_mgr.headers,
            timeout=180,
            name="/advisory/stream (durability)",
            catch_response=True,
            stream=True,
        ) as resp:
            if resp.status_code == 200:
                chunks_received = 0
                last_chunk = b""
                for chunk in resp.iter_content(chunk_size=512):
                    chunks_received += 1
                    last_chunk = chunk
                if chunks_received > 1 and last_chunk:
                    resp.success()
                else:
                    resp.failure(f"SSE incomplete: only {chunks_received} chunks")
            elif resp.status_code == 429:
                resp.success()
            else:
                resp.failure(f"SSE durability failed: {resp.status_code}")

    @task(1)
    @tag("advisory", "overflow")
    def conversation_overflow(self) -> None:
        """Rapidly create conversations to test LRU eviction (10K boundary)."""
        self._token_mgr.refresh_if_stale()
        for _ in range(5):
            with self.client.post(
                "/advisory/query",
                json={"query": "test " + uuid.uuid4().hex[:8]},
                headers=self._token_mgr.headers,
                timeout=65,
                name="/advisory/query (overflow)",
                catch_response=True,
            ) as resp:
                if resp.status_code in (200, 429):
                    resp.success()
                else:
                    resp.failure(f"Overflow test failed: {resp.status_code}")
                    break


# ── Shadow Agent User ─────────────────────────────────────


class ShadowUser(HttpUser):
    """Simulates a user interacting with the shadow agent.

    Weight 2: shadow context is fetched on every page navigation.
    """

    weight = 2
    wait_time = between(3, 10)

    def on_start(self) -> None:
        self._token_mgr = TokenManager(self.client, _next_user_index())
        if not self._token_mgr.ensure_authenticated():
            logger.error("ShadowUser: failed to authenticate")

    @task(4)
    @tag("shadow", "context")
    def shadow_context(self) -> None:
        """GET /shadow/context — fetched on every page navigation."""
        self._token_mgr.refresh_if_stale()
        page = random.choice(SHADOW_PAGES)

        with self.client.get(
            f"/shadow/context?page={page}",
            headers=self._token_mgr.headers,
            name="/shadow/context",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 429):
                resp.success()
            else:
                resp.failure(f"Shadow context failed: {resp.status_code}")

    @task(1)
    @tag("shadow", "execute")
    def shadow_execute(self) -> None:
        """POST /shadow/execute — shadow agent command."""
        self._token_mgr.refresh_if_stale()
        command = random.choice(SHADOW_COMMANDS)

        with self.client.post(
            "/shadow/execute",
            json={"message": command, "page_context": random.choice(SHADOW_PAGES)},
            headers=self._token_mgr.headers,
            timeout=65,
            name="/shadow/execute",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 429):
                resp.success()
            else:
                resp.failure(f"Shadow execute failed: {resp.status_code}")

    @task(1)
    @tag("shadow", "history")
    def shadow_history(self) -> None:
        """GET /shadow/history — action history."""
        self._token_mgr.refresh_if_stale()

        with self.client.get(
            "/shadow/history",
            headers=self._token_mgr.headers,
            name="/shadow/history",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 429):
                resp.success()
            else:
                resp.failure(f"Shadow history failed: {resp.status_code}")


# ── CRUD User (Mixed Workload) ────────────────────────────


class CrudUser(HttpUser):
    """Simulates standard HRIS CRUD operations.

    Weight 4: CRUD is the majority of real-world traffic.
    """

    weight = 4
    wait_time = between(1, 5)

    def on_start(self) -> None:
        self._token_mgr = TokenManager(self.client, _next_user_index())
        if not self._token_mgr.ensure_authenticated():
            logger.error("CrudUser: failed to authenticate")

    @task(5)
    @tag("crud", "employees")
    def list_employees(self) -> None:
        """GET /employees — employee directory."""
        self._token_mgr.refresh_if_stale()

        with self.client.get(
            "/employees",
            headers=self._token_mgr.headers,
            name="/employees",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 429):
                resp.success()
            else:
                resp.failure(f"List employees failed: {resp.status_code}")

    @task(3)
    @tag("crud", "me")
    def get_my_profile(self) -> None:
        """GET /employees/me — current user profile."""
        self._token_mgr.refresh_if_stale()

        with self.client.get(
            "/employees/me",
            headers=self._token_mgr.headers,
            name="/employees/me",
            catch_response=True,
        ) as resp:
            # 404 is acceptable (user may not have an employee record yet)
            if resp.status_code in (200, 404, 429):
                resp.success()
            else:
                resp.failure(f"Get profile failed: {resp.status_code}")

    @task(2)
    @tag("crud", "leave")
    def get_my_leave(self) -> None:
        """GET /employees/me/leave — leave balances."""
        self._token_mgr.refresh_if_stale()

        with self.client.get(
            "/employees/me/leave",
            headers=self._token_mgr.headers,
            name="/employees/me/leave",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404, 429):
                resp.success()
            else:
                resp.failure(f"Get leave failed: {resp.status_code}")

    @task(2)
    @tag("crud", "health")
    def health_check(self) -> None:
        """GET /health — system health."""
        with self.client.get(
            "/health",
            name="/health",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Health check failed: {resp.status_code}")

    @task(1)
    @tag("crud", "me")
    def get_me(self) -> None:
        """GET /me — auth user info."""
        self._token_mgr.refresh_if_stale()

        with self.client.get(
            "/me",
            headers=self._token_mgr.headers,
            name="/me",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 429):
                resp.success()
            else:
                resp.failure(f"Get me failed: {resp.status_code}")


# ── Auth Stress User ──────────────────────────────────────


class AuthUser(HttpUser):
    """Simulates auth-heavy flows: login, refresh, logout cycles.

    Weight 1: auth is a smaller fraction of total traffic.
    """

    weight = 1
    wait_time = between(2, 8)

    def on_start(self) -> None:
        self._user_index = _next_user_index()
        self._email = (
            f"{USER_EMAIL_PREFIX}_{self._user_index}_{uuid.uuid4().hex[:6]}@{USER_EMAIL_DOMAIN}"
        )
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._register()

    def _register(self) -> None:
        with self.client.post(
            "/register",
            json={
                "email": self._email,
                "password": BASE_PASSWORD,
                "name": f"Auth Tester {self._user_index}",
                "company_name": f"Auth Test Co {self._user_index}",
            },
            name="/register (setup)",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 409):
                if resp.status_code == 200:
                    data = resp.json()
                    self._access_token = data.get("access_token")
                    self._refresh_token = data.get("refresh_token")
                resp.success()
            else:
                resp.failure(f"Auth setup failed: {resp.status_code}")

    @task(3)
    @tag("auth", "login")
    def login_cycle(self) -> None:
        """Login → /me → verify identity."""
        with self.client.post(
            "/login",
            json={"email": self._email, "password": BASE_PASSWORD},
            name="/login",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self._access_token = data.get("access_token")
                self._refresh_token = data.get("refresh_token")
                resp.success()

                # Follow up with /me
                self.client.get(
                    "/me",
                    headers={"Authorization": f"Bearer {self._access_token}"},
                    name="/me (post-login)",
                )
            elif resp.status_code == 429:
                resp.success()
            else:
                resp.failure(f"Login failed: {resp.status_code}")

    @task(2)
    @tag("auth", "refresh")
    def refresh_token(self) -> None:
        """Refresh access token."""
        if not self._refresh_token:
            return

        with self.client.post(
            "/refresh",
            json={"refresh_token": self._refresh_token},
            name="/refresh",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self._access_token = data.get("access_token")
                resp.success()
            elif resp.status_code in (401, 429):
                resp.success()  # Expired token or rate limit is expected
            else:
                resp.failure(f"Refresh failed: {resp.status_code}")

    @task(1)
    @tag("auth", "logout")
    def logout(self) -> None:
        """Logout and re-login."""
        if not self._access_token:
            return

        with self.client.post(
            "/logout",
            json={"refresh_token": self._refresh_token} if self._refresh_token else {},
            headers={"Authorization": f"Bearer {self._access_token}"},
            name="/logout",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401, 429):
                resp.success()
                self._access_token = None
                self._refresh_token = None
            else:
                resp.failure(f"Logout failed: {resp.status_code}")


# ── Scenario-based weight adjustment ─────────────────────

if SCENARIO == "gpu_saturation":
    # Advisory-only: ramp advisory users, disable others
    AdvisoryUser.weight = 10
    ShadowUser.weight = 0
    CrudUser.weight = 0
    AuthUser.weight = 0
elif SCENARIO == "thread_exhaustion":
    # 10 advisory + 10 CRUD — test thread pool isolation
    AdvisoryUser.weight = 5
    ShadowUser.weight = 0
    CrudUser.weight = 5
    AuthUser.weight = 0
elif SCENARIO == "crud_only":
    # Pure CRUD — baseline without LLM load
    AdvisoryUser.weight = 0
    ShadowUser.weight = 0
    CrudUser.weight = 10
    AuthUser.weight = 1
# else: "baseline" — use default weights (3/2/4/1)


# ── Event hooks for reporting ─────────────────────────────


@events.test_start.add_listener
def on_test_start(environment, **kwargs) -> None:
    """Log test configuration at start."""
    logger.info(
        "Load test starting | host=%s users=%s spawn_rate=%s",
        environment.host,
        getattr(environment.parsed_options, "num_users", "?"),
        getattr(environment.parsed_options, "spawn_rate", "?"),
    )


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs) -> None:
    """Log summary at end."""
    stats = environment.runner.stats
    logger.info(
        "Load test complete | total_requests=%d total_failures=%d",
        stats.total.num_requests,
        stats.total.num_failures,
    )
    # Print summary table
    print("\n" + "=" * 70)
    print("LOAD TEST SUMMARY")
    print("=" * 70)
    for entry in stats.entries.values():
        if entry.num_requests > 0:
            print(
                f"  {entry.method:6s} {entry.name:40s} "
                f"reqs={entry.num_requests:5d}  "
                f"fail={entry.num_failures:3d}  "
                f"p50={entry.get_response_time_percentile(0.5) or 0:7.0f}ms  "
                f"p95={entry.get_response_time_percentile(0.95) or 0:7.0f}ms  "
                f"p99={entry.get_response_time_percentile(0.99) or 0:7.0f}ms"
            )
    print("=" * 70)
