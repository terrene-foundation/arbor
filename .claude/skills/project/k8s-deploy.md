# K8s Deploy (DGX `arbor.aitelab.net`)

Roll a published image (`terrenefoundation/arbor-{backend,frontend}:<version>`) onto the DGX K8s cluster. Build is GH Actions → Docker Hub; rollout is jumper-pod kubectl.

**There is one environment.** `arbor.aitelab.net` is production. There is no separate staging or GCE `arbor-prod`; references to those are fictional (see `deploy/deployment-config.md` and friends, pending purge).

## Access

- **Public app:** `https://arbor.aitelab.net` (Cloudflare → ingress → frontend/backend)
- **Jumper web terminal:** `https://arbordev.aitelab.net` (ttyd → in-cluster `arbor-jumper` pod, namespace-locked to `arbor`)

The jumper is reached via browser only (no SSH key, no local kubeconfig). Drive it via playwright-mcp. The xterm.js textbox accepts `mcp__playwright__browser_type` against `.xterm-helper-textarea` with `submit: true` to send Enter.

## Prerequisites

1. Image already on Docker Hub. Verify with `gh run view <run-id>` — both `build-and-push` jobs green.
2. Tag matches what was just released (e.g., `0.4.9`). The leading `v` is dropped in the image tag.

## Rollout Flow

```
1. Open https://arbordev.aitelab.net via playwright-mcp → confirm prompt is `~ #` on `arbor-jumper-*`
2. apk add --no-cache kubectl       # kubectl is NOT baked in; lost on every pod restart
3. kubectl get deploy -n arbor      # confirm arbor-backend, arbor-frontend exist
4. Verify deployment image + pod start time vs. build completion time:
   kubectl get deploy/arbor-backend deploy/arbor-frontend -n arbor \
     -o jsonpath='{range .items[*]}{.metadata.name}: {.spec.template.spec.containers[*].image}{"\n"}{end}'
   kubectl get pods -n arbor -l 'app in (arbor-backend,arbor-frontend)' \
     -o custom-columns=NAME:.metadata.name,IMAGE:.status.containerStatuses[*].image,STARTED:.status.containerStatuses[*].state.running.startedAt
5. If image is older than target version, run rollout (skip if already current — see "Pre-Rollout Check" below):
   kubectl set image -n arbor deploy/arbor-backend backend=terrenefoundation/arbor-backend:<version>
   kubectl set image -n arbor deploy/arbor-frontend frontend=terrenefoundation/arbor-frontend:<version>
   kubectl rollout status -n arbor deploy/arbor-backend --timeout=180s
   kubectl rollout status -n arbor deploy/arbor-frontend --timeout=180s
6. Smoke test:
   curl -sS https://arbor.aitelab.net/api/health     # expect {"status":"healthy", ...}
   playwright-mcp navigate https://arbor.aitelab.net/   # expect landing page renders
```

## Pre-Rollout Check (MUST)

Compare deployment image + pod `startedAt` against the GH Actions build completion time **before** running `kubectl set image`. If pods came up after the build finished and image already matches the target tag, the rollout is already done — likely via auto-deploy hook or a prior session. Re-applying `set image` with the same tag is a no-op but logs a meaningless event; verifying first prevents the assumption that rollout is still pending when the cluster is already on the new version.

**Origin:** 2026-05-07 — session-notes said the cluster was on v0.4.5 awaiting v0.4.9 rollout; in fact pods had been on 0.4.9 since 2026-05-05T02:07Z, ~4 min after build #25353560211 completed.

## Container Names (deploy/container)

| Deployment       | Container  | Image                                    |
| ---------------- | ---------- | ---------------------------------------- |
| `arbor-backend`  | `backend`  | `terrenefoundation/arbor-backend:<tag>`  |
| `arbor-frontend` | `frontend` | `terrenefoundation/arbor-frontend:<tag>` |

If `set image` errors with "container not found", re-derive: `kubectl get deploy/<name> -n arbor -o jsonpath='{.spec.template.spec.containers[*].name}'`.

## Known Failure Modes

- **`kubectl: not found`** — `apk add --no-cache kubectl`. Per `specs/k8s-staging-resilience.md` Rule 2, kubectl is not baked into the jumper image; it is reinstalled at runtime and lost on every pod restart.
- **Cloudflare 1010 / proxy timeout** on long advisory queries — frontend should use `/advisory/stream`, not synchronous `/advisory/query`. See `specs/k8s-staging-resilience.md` Rule 5.
- **Postgres data wiped after DGX reboot** — PVC `arbor-pgdata` is non-persistent. Full recovery playbook in `specs/k8s-staging-resilience.md`. (The spec file is named `k8s-staging-resilience.md` but applies to the only env — the name predates the discovery that there's no separate staging.)
- **Ollama cold start ~47s** for first qwen3 inference — model cache may be empty if pod was restarted without PVC.
