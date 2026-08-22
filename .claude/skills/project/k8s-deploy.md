# Deploying Arbor to a Target

Arbor is an enterprise SaaS product with **multiple deployments** — the Foundation's
DGX cluster today, with Azure, AWS and Google Cloud planned. This skill is the
target-neutral procedure. **Every deployment-specific fact lives in that
deployment's own file** under `deploy/targets/`.

**Step 0 is always: identify the target and open its file.**

| Target                              | File                            | Status              |
| ----------------------------------- | ------------------------------- | ------------------- |
| `dgx-aitelab` (`arbor.aitelab.net`) | `deploy/targets/dgx-aitelab.md` | live                |
| Azure / AWS / Google Cloud          | —                               | not yet provisioned |

Registry + the contract for adding a new target: `deploy/targets/README.md`.
Target-neutral platform facts (images, env contract, health endpoints):
`deploy/deployment-config.md`.

## Do not generalise across targets

The DGX deployment reaches its control plane through a browser-only ttyd jumper,
runs Postgres/Redis/Ollama as in-cluster pods, rolls out with `kubectl set image`,
and has **no staging sibling**. Every one of those is a property of _that_ target. A
managed-container deployment may share none of them.

Read the target's file before running anything. Carrying a DGX assumption onto a
cloud deployment is the failure mode this split exists to prevent.

## Procedure

### 1. Build (shared across all targets)

One build produces the artifacts every deployment consumes.

```sh
git tag -a v<X.Y.Z> -m "<summary>" && git push origin v<X.Y.Z>
gh run list --limit 5          # find the "Publish Docker Images" run
gh run watch <run-id> --exit-status
```

Both `build-and-push` jobs must be green. **The image tag drops the leading `v`** —
`v0.5.0` publishes `0.5.0`.

Confirm the images are actually on the registry before touching any deployment —
a green build is necessary, not sufficient:

```sh
curl -sS "https://hub.docker.com/v2/repositories/terrenefoundation/arbor-backend/tags/<X.Y.Z>"
curl -sS "https://hub.docker.com/v2/repositories/terrenefoundation/arbor-frontend/tags/<X.Y.Z>"
```

### 2. Pre-rollout check (MUST, per target)

Before rolling, compare **the running image and its start time** against the build
completion time. If the deployment already carries the target tag and started after
the build, the rollout is already done — via a prior session or an auto-deploy path —
and re-applying it only logs a meaningless event.

Origin: 2026-05-07 — session notes claimed the DGX cluster awaited a v0.4.9 rollout;
pods had been on 0.4.9 since 2026-05-05T02:07Z, ~4 min after the build completed.

### 3. Roll out (per target)

The mechanism is substrate-specific: `kubectl set image` on self-managed K8s, a
revision or slot swap on a managed-container service. **Use the commands in the
target's file** — they are written against that deployment's real resource names.

### 4. Verify from outside (MUST)

Verify against the deployment's **public URL**, not from inside the control plane. A
successful rollout command is not evidence that users are being served the new code
(`rules/deploy-hygiene.md` — "users see it or it's not done").

```sh
curl -sS https://<target-domain>/api/health    # expect {"status":"healthy", ...}
# and load https://<target-domain>/ — landing page renders
```

**The backend exposes no version endpoint** (`/api/version` → 404), so a healthy
response does **not** confirm which version is running. Confirming the deployed
version needs a control-plane reading on that target. Do not report a version as
deployed on the strength of a health check.

### 5. Rollback if needed

Every target file documents a verified rollback command. Images are immutable and
retained, so a previously published tag is always a valid destination.

## Secrets and control-plane access

Control-plane credentials for a target (jumper basic auth, cloud IAM, kubeconfig)
are **never** pasted into a command line, a URL, or an agent transcript — that writes
a production credential into a durable artifact (`rules/security.md` § "No secrets in
logs"). If an agent cannot reach a control plane because authentication is missing,
the correct move is to stop and hand back to the operator, not to embed the
credential.

## Adding a new deployment

Follow `deploy/targets/README.md` § "What a target file MUST contain". Create the
target file only when the deployment is real — an empty target file asserts a
deployment that does not exist (`rules/zero-tolerance.md` Rule 2). Add the row to the
registry, this table, and `deploy/deployment-config.md`.

When the second deployment lands, re-read `deploy/deployment-config.md` and move
anything that turns out to be DGX-specific into the DGX file. The split is only
correct as long as it keeps being checked.
