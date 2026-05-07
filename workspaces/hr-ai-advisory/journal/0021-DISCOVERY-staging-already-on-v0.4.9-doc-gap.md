---
type: DISCOVERY
date: 2026-05-07
tags: [staging, deploy, doc-gap, k8s, codify]
---

# Staging was already on v0.4.9 + jumper-deploy doc gap

## What happened

Session-notes (2026-05-05) said staging was on v0.4.5 awaiting v0.4.9 rollout. On checking the cluster:

```
kubectl get pods -n arbor -l 'app in (arbor-backend,arbor-frontend)' -o ...
arbor-backend-95bcd4866-x8ndl   docker.io/terrenefoundation/arbor-backend:0.4.9   2026-05-05T02:07:44Z
arbor-frontend-665dc56449-bz42k docker.io/terrenefoundation/arbor-frontend:0.4.9  2026-05-05T02:07:50Z
```

Pods came up at `2026-05-05T02:07Z`, ~4 min after build #25353560211 finished (queued at `01:49:41Z`, ~14 min runtime). So either auto-deploy is wired (image-pull policy + restart hook) or the rollout was performed by another session/operator between `/wrapup` and now. Smoke test green: `/api/health` 200 healthy, public landing page renders.

## Doc gap surfaced

Three artifacts referenced staging deploy but the action recipe wasn't on disk:

- `MEMORY.md` mentioned `.claude/skills/project/k8s-staging-deploy.md` — file did NOT exist
- Reference memory `reference_k8s_deploy.md` claimed `kubectl` was pre-installed on the jumper — **wrong**, `kubectl: not found` on first invocation. `specs/k8s-staging-resilience.md` Rule 2 already documents kubectl is NOT baked in (lost on every pod restart, must `apk add`).
- No journal entry codifying the playwright-mcp jumper flow despite the URL `arbordev.aitelab.net` being in active use.

User had to surface the URL manually because the agent could not find it.

## What I did

1. Created `.claude/skills/project/k8s-staging-deploy.md` capturing: jumper URL, ttyd→xterm playwright-mcp wiring, pre-rollout image-vs-startedAt check, container names, known failure modes, prod-is-separate disclaimer.
2. Rebuilt `.claude/skills/project/SKILL.md` from the stale "no project skills" sentinel into an actual lookup table over the 18 skill files on disk.
3. Updated MEMORY.md and `reference_k8s_deploy.md` to correct the kubectl-pre-installed claim.

## Why this matters

The skill+memory combo is what lets the next session run the rollout without asking the user for the URL. The "approved" → "drop me the URL" turn was preventable; codifying closes that loop for next release (v0.4.10+).

## Correction (same session)

User clarified: there is no GCE `arbor-prod`. `arbor.aitelab.net` IS production. `arbordev.aitelab.net` is the ttyd jumper for that cluster. The "staging" framing in the original skill name and in prior session notes was wrong — single environment, single rollout.

Narrow fixes applied:

- Renamed `.claude/skills/project/k8s-staging-deploy.md` → `k8s-deploy.md`; rewrote framing to "one environment".
- Updated `MEMORY.md` (removed GCE arbor-prod lines), `reference_k8s_deploy.md` ("Single environment" section).
- `.claude/skills/project/SKILL.md` — link updated to new filename.

Broader purge deferred (separate workstream): `deploy/deployment-config.md`, `deploy/ship.sh`, `deploy/sync-env.sh`, `deploy/setup-server.sh`, `deploy/docker-compose.prod.yml`, `deploy/.env.production.template`, `deploy/.last-deployed`, `deploy/deployments/*.md`, `specs/production-hardening.md`, `.claude/hooks/validate-prod-deploy.js`, `.claude/skills/10-deployment-git/application-deployment.md` — all assume the fictional GCE path. Need a session to triage what's pure fiction vs. salvageable historical record.

## Open

- Broader purge of fictional GCE deploy artifacts (above).
- Shard D lint-debt /analyze cycle (31 react-hooks violations, TanStack Query migration) — still parked.
- PACT M60 still parked at `workspaces/pact/.session-notes`.
