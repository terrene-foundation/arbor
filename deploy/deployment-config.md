# Arbor Deployment Configuration

> **Migration note (2026-05-07):** This is a legacy prose-only config. Per `rules/deploy-hygiene.md` § Exceptions, run `/deploy --onboard` to migrate to the YAML-frontmatter form documented in `.claude/skills/10-deployment-git/application-deployment.md` § "deployment-config.md Schema". Until migrated, agents fall back to manual verification.

## Scope: this file is TARGET-NEUTRAL

Arbor is an enterprise SaaS product and runs in **multiple deployments** — the
Foundation's DGX cluster today, with Azure, AWS and Google Cloud deployments planned.

This file holds only what is true of Arbor **wherever it runs**: the container
images, the environment-variable contract, the health-check endpoints, and the shape
of a release. Everything specific to one deployment — its domain, topology, access
path, exact rollout commands, failure modes, and current version — lives in its own
file under [`targets/`](targets/README.md).

**Per-target notes:**

| Target                                   | File                                               | Status              |
| ---------------------------------------- | -------------------------------------------------- | ------------------- |
| `dgx-aitelab` (DGX, `arbor.aitelab.net`) | [`targets/dgx-aitelab.md`](targets/dgx-aitelab.md) | live                |
| Azure / AWS / Google Cloud               | —                                                  | not yet provisioned |

Do not add target-specific facts here. If a claim is only true on one deployment, it
belongs in that target's file — otherwise the next deployment inherits an assumption
that was never checked against it.

## Platform Decisions (target-neutral)

| Decision        | Choice                                    | Rationale                                                                                            |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Packaging       | Two OCI images (backend, frontend)        | Same artifacts run on any container substrate                                                        |
| Build           | GitHub Actions → Docker Hub               | Tag push of `v*` triggers `.github/workflows/docker-publish.yml`                                     |
| Image tag       | git tag minus the leading `v`             | `v0.5.0` → image `0.5.0`                                                                             |
| Backend runtime | `AsyncLocalRuntime`                       | Required in containers — `LocalRuntime` hangs                                                        |
| Database        | PostgreSQL 16 + **pgvector**              | Vector search for KB embeddings. pgvector is a hard requirement on every target.                     |
| Cache           | Redis 7                                   | Sessions **and** the JWT token blocklist — see the note below                                        |
| LLM             | Provider-agnostic                         | Ollama where a GPU is attached; BYOK supports OpenAI / Anthropic / Gemini                            |
| Config          | Env vars from the platform's secret store | K8s Secret/ConfigMap, Key Vault, Secrets Manager, Secret Manager — the variable surface is identical |

**Redis is not optional.** Both consumers degrade _silently_ when it is absent:
sessions fall back to in-memory (lost on restart, broken across replicas) and the JWT
token blocklist disables itself, so revoked tokens stay valid until expiry. Any target
MUST provision Redis, whether in-cluster or managed.

## Architecture (logical — substrate-independent)

```
Internet
  │
  ▼
edge (TLS, WAF, caching)          per-target: Cloudflare, Front Door, CloudFront, Cloud CDN
  │
  ▼
ingress / router                  routes /api/* → backend, /* → frontend
  │
  ├── backend    FastAPI, port 8000,  image terrenefoundation/arbor-backend
  ├── frontend   Next.js standalone, port 3000, image terrenefoundation/arbor-frontend
  ├── postgres   PostgreSQL 16 + pgvector      in-cluster OR managed
  ├── redis      Redis 7                       in-cluster OR managed
  └── llm        Ollama (GPU) OR a BYOK provider endpoint
```

Which of Postgres / Redis / the LLM are self-hosted versus managed is a **per-target**
choice with different failure modes, backup guarantees and cost — recorded in the
target file, not here.

## Container Images

### Backend (Python)

- Dockerfile: `deploy/Dockerfile.backend`
- Base: `python:3.11-slim`
- Runtime: `AsyncLocalRuntime` (required for containers — `LocalRuntime` hangs)
- Entrypoint: `python -m hr_advisory.api.server`
- Health: `GET /health`
- Port: 8000

### Frontend (React/Next.js)

- Dockerfile: `deploy/Dockerfile.frontend`
- Base: `node:20-alpine` (build) → `node:20-alpine` (runtime)
- Build: `npm run build` with `output: "standalone"`
- Port: 3000

## Environment Variables

Set in K8s `Secret` and `ConfigMap` objects in the `arbor` namespace, mounted into pods. The variable surface below is what the backend expects; the frontend uses `NEXT_PUBLIC_API_URL` injected at build time.

### Required

| Variable                 | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string                       |
| `POSTGRES_USER`          | PostgreSQL username                                |
| `POSTGRES_PASSWORD`      | PostgreSQL password                                |
| `POSTGRES_DB`            | PostgreSQL database name                           |
| `REDIS_URL`              | Redis connection string                            |
| `REDIS_PASSWORD`         | Redis password                                     |
| `JWT_SECRET_KEY`         | JWT signing key                                    |
| `LLM_KEY_ENCRYPTION_KEY` | Fernet key for encrypting user API keys (REQUIRED) |

### Optional (LLM)

| Variable            | Default                     | Description                                    |
| ------------------- | --------------------------- | ---------------------------------------------- |
| `OPENAI_API_KEY`    | —                           | Server default OpenAI key (optional with BYOK) |
| `ANTHROPIC_API_KEY` | —                           | Anthropic API key                              |
| `DEFAULT_LLM_MODEL` | `qwen3:latest`              | Default LLM model                              |
| `OPENAI_PROD_MODEL` | `gpt-5-mini-2025-08-07`     | Production OpenAI model when used              |
| `OLLAMA_BASE_URL`   | `http://ollama:11434`       | In-cluster Ollama service                      |
| `OLLAMA_MODEL`      | `qwen3:latest`              | Ollama model name                              |
| `LOG_LEVEL`         | `INFO`                      | Logging level                                  |
| `APP_ENV`           | `production`                | Environment name                               |
| `CORS_ORIGINS`      | `https://arbor.aitelab.net` | Allowed CORS origins                           |

### Integration Layer (MCP servers — all optional, enable as needed)

| Variable                     | Description                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| `INTEGRATION_ENCRYPTION_KEY` | Fernet key for OAuth token encryption (REQUIRED in production) |
| `ENVIRONMENT`                | Set to `production` to enforce encryption key                  |
| `DATA_GOV_SG_API_KEY`        | data.gov.sg API key (free, self-service)                       |
| `RESEND_API_KEY`             | Resend email delivery                                          |
| `TELEGRAM_BOT_TOKEN`         | Telegram notification bot                                      |
| `TELEGRAM_MONITOR_BOT_TOKEN` | Telegram regulatory monitoring bot                             |
| `WHATSAPP_ACCESS_TOKEN`      | WhatsApp Cloud API token                                       |
| `WHATSAPP_PHONE_NUMBER_ID`   | WhatsApp phone number ID                                       |
| `SLACK_BOT_TOKEN`            | Slack bot token                                                |
| `AWS_S3_BUCKET`              | S3 bucket for document storage                                 |
| `XERO_CLIENT_ID`             | Xero OAuth app client ID                                       |
| `XERO_CLIENT_SECRET`         | Xero OAuth app client secret                                   |
| `QBO_CLIENT_ID`              | QuickBooks OAuth client ID                                     |
| `QBO_CLIENT_SECRET`          | QuickBooks OAuth client secret                                 |
| `ZOHO_CLIENT_ID`             | Zoho Books OAuth client ID                                     |
| `ZOHO_CLIENT_SECRET`         | Zoho Books OAuth client secret                                 |
| `ASPIRE_CLIENT_ID`           | Aspire API client ID                                           |
| `ASPIRE_API_KEY`             | Aspire API key                                                 |
| `WISE_API_KEY`               | Wise Business API key                                          |
| `SSG_API_KEY`                | SkillsFuture SSG developer portal key                          |

Integration env vars are only needed when enabling specific connectors. The platform starts and runs without them — connectors gracefully degrade to "not configured" status.

## Deployment Runbook

Steps 1–2 are the same for **every** target — one build produces the artifacts every
deployment consumes. Steps 3–5 are **per-target**: read the target's file for the exact
commands.

1. **Tag & push** — `git tag v<X.Y.Z> && git push origin v<X.Y.Z>` triggers the GH Actions matrix build (backend + frontend, multi-arch). Push tags one at a time (per `rules/deployment.md`).
2. **Verify build** — `gh run view <run-id>` shows both `build-and-push` jobs green; images on Docker Hub at `terrenefoundation/arbor-{backend,frontend}:<X.Y.Z>` (image tag drops the leading `v`).
3. **Pre-rollout check** _(per target)_ — compare the running image **and** its start time against the build completion time. If the target already carries the tag, the rollout is done; skip it.
4. **Roll out** _(per target)_ — the mechanism differs by substrate: `kubectl set image` on self-managed K8s, a revision/slot swap on a managed-container service. See the target file.
5. **Smoke test** _(per target)_ — the target's public health URL returns `{"status":"healthy"}` and the landing page renders. Verify from **outside** the deployment, not from the control plane.

Target procedures: [`targets/dgx-aitelab.md`](targets/dgx-aitelab.md).

### Rollback

Every target MUST document a verified rollback command in its own file, and MUST be
able to return to a previously published image tag. The images are immutable and
retained, so the prior tag is always a valid rollback destination.

### Verifying what is actually deployed

The backend exposes **no version endpoint** today — `/api/version` returns 404 — so
the running version cannot be read from outside a deployment. Determining it requires
control-plane access on that target.

Treat any claim about a deployed version that is not backed by a control-plane reading
as unverified. Adding a version field to `/api/health` would close this across every
target at once and is worth doing before a second deployment is stood up.

## Health Check Endpoints

| Endpoint               | Method | Expected | Description               |
| ---------------------- | ------ | -------- | ------------------------- |
| `/api/health`          | GET    | 200 OK   | Basic liveness            |
| `/api/health/ready`    | GET    | 200 OK   | Readiness (DB connected)  |
| `/api/health/detailed` | GET    | 200 OK   | Detailed component status |

## Backup, Monitoring, Cost — per-target

These three are **properties of a deployment, not of Arbor**, and they diverge sharply
between a self-hosted cluster and a managed cloud. Each target file records its own
state, including honest "not configured yet" entries.

What every target owes, regardless of substrate:

- **Persistence** — Postgres data survives a restart of the substrate. State plainly
  whether it does; on `dgx-aitelab` today it does **not**.
- **Backup** — a stated recovery point objective, or an explicit record that there is
  no automated backup.
- **Monitoring** — at minimum liveness; ideally the `/api/health/detailed` component
  surface scraped on an interval.
- **Cost** — who pays and roughly what. A Foundation-owned box and a cloud
  subscription are not comparable and should not be summarised together.

Current per-target state: [`targets/dgx-aitelab.md`](targets/dgx-aitelab.md)
§ "Persistence, backup, monitoring".
