# K8s Staging Resilience Specification

## Objective

Prevent data loss and service disruption when the DGX host reboots (OS updates, power events, GPU driver updates).

## Root Cause (2026-04-14 Incident)

DGX OS update rebooted the host. All K8s pods restarted. PostgreSQL lost all data because the PVC is backed by non-persistent storage (emptyDir or local-path that doesn't survive node reboot). The K8s API server was slow to recover, blocking kubectl access for cluster management.

### Cascading Failures

1. **DGX reboots** → all pods restart (expected)
2. **PostgreSQL PVC wiped** → all user accounts, company data, LLM configs gone
3. **K8s API server slow recovery** → kubectl unreachable, can't manage pods
4. **Jumper pod loses kubectl** → installed at runtime via `apk add`, not in image
5. **Ollama cold start** → first inference takes 47s (qwen3 thinking mode)
6. **Cloudflare timeout** → advisory requests cut at ~30s by Cloudflare proxy
7. **No BYOK config in DB** → advisory falls back to server env (may be misconfigured)

## Required Fixes (San / Infra)

### 1. Persistent PostgreSQL Storage (CRITICAL)

The PVC `arbor-pgdata` must be backed by a StorageClass that survives node reboots.

```bash
# Check current StorageClass
kubectl get pvc arbor-pgdata -n arbor -o jsonpath='{.spec.storageClassName}'
kubectl get storageclass

# If using local-path or emptyDir, migrate to a persistent StorageClass
# (OpenEBS, Longhorn, or NFS for DGX)
```

### 2. Bake kubectl Into Jumper Image (HIGH)

The jumper pod (`arbor-jumper`) loses kubectl on every restart because it's installed at runtime. Bake it into the image:

```dockerfile
# In the jumper Dockerfile
RUN apk add --no-cache kubectl curl wget
```

Or use the existing `terrenefoundation/arbor-build-toolkit` image which has kubectl baked in.

### 3. K8s API Server Recovery (MEDIUM)

After DGX reboot, the K8s control plane may take several minutes to recover. The jumper pod starts before the API server is ready. Add a startup script that waits:

```bash
# In jumper entrypoint
until kubectl cluster-info 2>/dev/null; do
  echo "Waiting for K8s API server..."
  sleep 5
done
```

### 4. Ollama Model Persistence (HIGH)

Ollama pod must have a PVC for `/root/.ollama` (model cache). Without it, models are re-downloaded on every pod restart (4GB+ per model).

### 5. Cloudflare Proxy Timeout (MEDIUM)

Cloudflare's default proxy read timeout (~100s) is sufficient for most requests, but Cloudflare error 1010 ("Access Denied") may be triggered by long-running requests without streaming. The advisory streaming endpoint (`/advisory/stream`) should be used by the frontend instead of the synchronous `/advisory/query` for long queries.

## Recovery Playbook (When DGX Reboots)

```bash
# 1. Install kubectl on jumper (if lost)
apk add --no-cache kubectl

# 2. Wait for API server
kubectl cluster-info  # retry until success

# 3. Check pods
kubectl get pods -n arbor

# 4. Check if postgres data survived
kubectl exec -it postgres-0 -n arbor -- psql -U postgres -c "\du"
kubectl exec -it postgres-0 -n arbor -- psql -U postgres -c "\l"

# 5. If arbor role/db missing, recreate:
kubectl get secret arbor-secrets -n arbor -o jsonpath='{.data.postgres-password}' | base64 -d
kubectl exec -it postgres-0 -n arbor -- psql -U postgres -c "CREATE ROLE arbor WITH LOGIN PASSWORD '<password>'"
kubectl exec -it postgres-0 -n arbor -- psql -U postgres -c "CREATE DATABASE arbor OWNER arbor"
kubectl exec -it postgres-0 -n arbor -- psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE arbor TO arbor"

# 6. Restart backend (DataFlow auto-migrates tables)
kubectl rollout restart deploy/arbor-backend -n arbor

# 7. Register a test account (DB is fresh)
curl -s -X POST https://arbor.aitelab.net/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Origin: https://arbor.aitelab.net" \
  -d '{"email":"admin@arbor.sg","password":"ArborDemo2026!","name":"Admin","company_name":"Demo Pte Ltd"}'
```
