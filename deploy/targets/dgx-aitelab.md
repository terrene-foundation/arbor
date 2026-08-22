# Deployment target: `dgx-aitelab`

The Foundation's own DGX cluster. This is **one** Arbor deployment among several
planned (see [README.md](README.md)); nothing here should be read as a property of
Arbor generally.

## Identity

|                 |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| Target name     | `dgx-aitelab`                                                        |
| Substrate       | Foundation-owned DGX hardware, self-managed Kubernetes               |
| Namespace       | `arbor`                                                              |
| Public domain   | `arbor.aitelab.net` (Cloudflare → in-cluster ingress)                |
| Operator access | `arbordev.aitelab.net` (ttyd web terminal → `arbor-jumper` pod)      |
| Role            | **Production.**                                                      |
| Staging sibling | **None.** See the constraint below.                                  |
| Owner           | Terrene Foundation                                                   |
| Cost            | Part of the DGX hardware footprint. No cloud bill attached to Arbor. |

### Constraint: this target has no staging

`arbor.aitelab.net` is the only running instance of this deployment. There is no
staging or pre-production sibling, so **first contact with cluster-specific behaviour
— networking, resource limits, PVC semantics — happens in production.**

This is a property of _this target_, not of Arbor. A cloud target may well be
provisioned with a staging sibling, and the moment one exists this constraint stops
being the whole picture.

Practical consequence: verify as much as possible off-cluster before rolling out
(unit + integration suites against real Postgres/Redis locally), and keep
`kubectl rollout undo` ready.

## Topology

```
Internet
  │
  ▼
Cloudflare (TLS, WAF, caching) — arbor.aitelab.net
  │
  ▼
DGX K8s cluster, namespace=arbor
  │
  ├── ingress            routes /api/* → backend, /* → frontend
  ├── deploy/arbor-backend    FastAPI, port 8000,  image terrenefoundation/arbor-backend
  ├── deploy/arbor-frontend   Next.js standalone, port 3000, image terrenefoundation/arbor-frontend
  ├── deploy/arbor-jumper     ttyd at arbordev.aitelab.net, namespace-locked ServiceAccount
  ├── deploy/postgres         PostgreSQL 16 + pgvector, PVC arbor-pgdata
  ├── deploy/redis            Redis 7 — sessions + JWT token blocklist
  └── deploy/ollama           Ollama, GPU reservation, PVC for model cache
```

Postgres, Redis and the LLM are all **in-cluster pods** on this target — not managed
services. Their failure modes (below) follow from that.

## Access

Control-plane access is **browser-only**: no SSH key, no local kubeconfig. The
operator opens `https://arbordev.aitelab.net`, which is HTTP-basic-auth protected and
drops into the namespace-locked `arbor-jumper` pod.

Credentials live in `.env` as `JUMPER_USERNAME` / `JUMPER_PASSWORD`. **Never paste
them into a command line, a URL, or an agent transcript** — that writes a production
credential into a durable artifact (`rules/security.md` § "No secrets in logs"). An
agent driving the jumper needs the browser profile already authenticated for the
origin; if it is not, the correct move is to stop and hand back, not to embed the
credential in a navigate URL.

`kubectl` is **not** baked into the jumper image and is lost on every pod restart:

```sh
apk add --no-cache kubectl
```

## Rollout

The generic release shape (tag → GH Actions → Docker Hub) is in
`../deployment-config.md`. Substitutions and target specifics:

Container names differ from deployment names — `deploy/arbor-backend` runs container
`backend`, `deploy/arbor-frontend` runs `frontend`. If `set image` reports "container
not found", re-derive with
`kubectl get deploy/<name> -n arbor -o jsonpath='{.spec.template.spec.containers[*].name}'`.

**The image tag drops the leading `v`** — git tag `v0.5.0` publishes image tag `0.5.0`.

```sh
# 0. pre-rollout check (MUST — see below)
kubectl get deploy/arbor-backend deploy/arbor-frontend -n arbor \
  -o jsonpath='{range .items[*]}{.metadata.name}: {.spec.template.spec.containers[*].image}{"\n"}{end}'
kubectl get pods -n arbor -l 'app in (arbor-backend,arbor-frontend)' \
  -o custom-columns=NAME:.metadata.name,IMAGE:.status.containerStatuses[*].image,STARTED:.status.containerStatuses[*].state.running.startedAt

# 1. roll
kubectl set image -n arbor deploy/arbor-backend  backend=terrenefoundation/arbor-backend:<version>
kubectl set image -n arbor deploy/arbor-frontend frontend=terrenefoundation/arbor-frontend:<version>

# 2. wait
kubectl rollout status -n arbor deploy/arbor-backend  --timeout=180s
kubectl rollout status -n arbor deploy/arbor-frontend --timeout=180s

# 3. smoke test from outside the cluster
curl -sS https://arbor.aitelab.net/api/health     # expect {"status":"healthy", ...}
# and load https://arbor.aitelab.net/ — landing page renders
```

### Pre-rollout check (MUST)

Compare the running image **and** pod `startedAt` against the GH Actions build
completion time _before_ `kubectl set image`. If pods came up after the build finished
and already carry the target tag, the rollout is done — via a prior session or an
auto-deploy path — and re-applying `set image` only logs a meaningless event.

Origin: 2026-05-07 — session notes claimed the cluster awaited a v0.4.9 rollout; pods
had in fact been on 0.4.9 since 2026-05-05T02:07Z, ~4 minutes after the build.

### Rollback

```sh
kubectl rollout undo -n arbor deploy/arbor-backend
kubectl rollout undo -n arbor deploy/arbor-frontend
```

Or `kubectl set image` back to a previously published tag.

## Known failure modes

| Symptom                                             | Cause                                                                     | Remedy                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `kubectl: not found` on the jumper                  | Not baked into the image; lost on pod restart                             | `apk add --no-cache kubectl` (`specs/k8s-staging-resilience.md` Rule 2)                                |
| Jumper returns HTTP 401                             | Basic auth not present in the browser profile                             | Authenticate the profile interactively. Do **not** embed credentials in a URL.                         |
| Cloudflare 1010 / proxy timeout on advisory queries | Synchronous endpoint exceeds the proxy budget                             | Frontend must use `/advisory/stream`, not `/advisory/query` (`specs/k8s-staging-resilience.md` Rule 5) |
| Postgres empty after a DGX reboot                   | PVC `arbor-pgdata` is **non-persistent**                                  | Full recovery playbook in `specs/k8s-staging-resilience.md`                                            |
| First qwen3 inference ~47s                          | Ollama cold start; model cache empty if the pod restarted without its PVC | Expected on cold start; warm the model                                                                 |

`specs/k8s-staging-resilience.md` is named for a "staging" environment that never
existed separately — it documents **this** target. The name predates that discovery.

## Persistence, backup, monitoring

Recorded honestly, including what is absent:

- **Persistence** — PVC `arbor-pgdata` is non-persistent; Postgres data is lost on
  DGX reboot. Hardening is planned in `specs/k8s-staging-resilience.md`.
- **Backup** — no automated backups today. Pending the PVC migration.
- **Monitoring** — not configured. Cloudflare provides basic uptime; in-cluster
  Prometheus and GPU monitoring are on the hardening roadmap.

Each of these is a real gap on this target, not an oversight in these notes. A cloud
target would be expected to close most of them through managed services.

## Current state

|                         |                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Deployed version        | **Unverified.** Last confirmed rollout was `0.4.9`.                                          |
| Latest published images | `0.5.0` — both `arbor-backend` and `arbor-frontend`, pushed 2026-08-21T17:16Z                |
| Outstanding             | `v0.5.0` is tagged and built but **not rolled out**. Blocked on jumper authentication (401). |
| Health at last check    | `/api/health` → `{"status":"healthy"}` (2026-08-22)                                          |

The backend exposes **no version endpoint**, so the running version cannot be
determined from outside the cluster. `/api/version` returns 404. Confirming what is
deployed requires the jumper — treat any claim about the running version that is not
backed by a `kubectl get deploy` reading as unverified.

Adding a version field to `/api/health` would remove that blind spot and is worth
doing before the next deployment target is stood up.
