# Arbor Deployment Configuration

> **Migration note (2026-05-07):** This is a legacy prose-only config. Per `rules/deploy-hygiene.md` § Exceptions, run `/deploy --onboard` to migrate to the YAML-frontmatter form documented in `.claude/skills/10-deployment-git/application-deployment.md` § "deployment-config.md Schema". Until migrated, agents fall back to manual verification.

## Decision Summary

| Decision      | Choice                                     | Rationale                                                                                                      |
| ------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Cluster       | DGX K8s (`arbor.aitelab.net`)              | Single environment owned by the Foundation; GPU-attached for Ollama                                            |
| Orchestration | Kubernetes deployments + services          | Native pod scheduling, rolling updates, health probes                                                          |
| Ingress       | Cloudflare → in-cluster ingress            | TLS terminated at Cloudflare; ingress routes `/api/*` to backend, `/*` to frontend                             |
| Domain        | `arbor.aitelab.net`                        | Production. There is no separate staging environment.                                                          |
| Build         | GitHub Actions → Docker Hub                | Tag push of `v*` triggers `.github/workflows/docker-publish.yml`                                               |
| Rollout       | `kubectl set image` from in-cluster jumper | `arbordev.aitelab.net` ttyd terminal → `arbor-jumper` pod                                                      |
| Database      | PostgreSQL 16 + pgvector (in-cluster)      | Vector search for KB embeddings. PVC `arbor-pgdata` is non-persistent — see `specs/k8s-staging-resilience.md`. |
| Cache         | Redis 7 (in-cluster)                       | Session management                                                                                             |
| LLM           | Ollama (in-cluster, GPU-attached)          | qwen3 default; BYOK supports OpenAI/Anthropic/Gemini                                                           |

## Architecture

```
Internet
  │
  ▼
Cloudflare (TLS, WAF, caching) — arbor.aitelab.net
  │
  ▼
DGX K8s cluster, namespace=arbor
  │
  ├── ingress (routes /api/* → backend, /* → frontend)
  ├── deploy/arbor-backend   (FastAPI, port 8000, image=terrenefoundation/arbor-backend)
  ├── deploy/arbor-frontend  (Next.js standalone, port 3000, image=terrenefoundation/arbor-frontend)
  ├── deploy/arbor-jumper    (ttyd at arbordev.aitelab.net, namespace-locked SA)
  ├── deploy/postgres        (PostgreSQL 16 + pgvector, PVC arbor-pgdata)
  ├── deploy/redis           (Redis 7)
  └── deploy/ollama          (Ollama, GPU reservation, PVC for model cache)
```

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

The full runbook lives in `.claude/skills/project/k8s-deploy.md`. Summary:

1. **Tag & push** — `git tag v<X.Y.Z> && git push origin v<X.Y.Z>` triggers the GH Actions matrix build (backend + frontend, multi-arch). Push tags one at a time (per `rules/deployment.md`).
2. **Verify build** — `gh run view <run-id>` shows both `build-and-push` jobs green; images on Docker Hub at `terrenefoundation/arbor-{backend,frontend}:<X.Y.Z>`.
3. **Roll out** — Open `https://arbordev.aitelab.net` (ttyd jumper). On the jumper:
   - `apk add --no-cache kubectl` (kubectl is not baked into the jumper image; lost on restart per `specs/k8s-staging-resilience.md` Rule 2).
   - Pre-rollout check: compare running image + pod `startedAt` vs. build completion time. If pods are already on the target tag, skip `set image`.
   - `kubectl set image -n arbor deploy/arbor-backend backend=terrenefoundation/arbor-backend:<X.Y.Z>` and the same for `arbor-frontend`/`frontend`.
   - `kubectl rollout status -n arbor deploy/arbor-backend --timeout=180s` (and frontend).
4. **Smoke test** — `curl https://arbor.aitelab.net/api/health` returns `{"status":"healthy"}`; landing page renders.

### Rollback

Roll back to a prior published tag by `kubectl set image` to that tag, or `kubectl rollout undo deploy/arbor-backend -n arbor`.

## Health Check Endpoints

| Endpoint               | Method | Expected | Description               |
| ---------------------- | ------ | -------- | ------------------------- |
| `/api/health`          | GET    | 200 OK   | Basic liveness            |
| `/api/health/ready`    | GET    | 200 OK   | Readiness (DB connected)  |
| `/api/health/detailed` | GET    | 200 OK   | Detailed component status |

## Backup & Recovery

- PostgreSQL PVC `arbor-pgdata` is currently non-persistent (data is lost on DGX reboot). Full recovery playbook + planned hardening in `specs/k8s-staging-resilience.md`.
- No automated daily backups today; pending the PVC migration.

## Monitoring

Not yet configured. Cloudflare provides basic uptime; in-cluster Prometheus / GPU monitoring is on the hardening roadmap.

## Cost

Cluster is part of the DGX hardware footprint owned by the Foundation. No GCP/AWS bill attached to Arbor itself.
