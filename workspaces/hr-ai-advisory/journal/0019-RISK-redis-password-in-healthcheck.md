# RISK: Redis healthcheck leaked password via CLI argument

**Date:** 2026-04-14
**Phase:** /redteam round 1
**Severity:** HIGH (H3)
**Fixed in:** commit 33d2584

## Discovery

Security reviewer found that the Redis healthcheck in `docker-compose.prod.yml` used `redis-cli -a ${REDIS_PASSWORD} ping`, which passes the password as a CLI argument visible in `ps aux` and `/proc/*/cmdline` to any process in the container.

## Fix

Replaced with `REDISCLI_AUTH=$REDIS_PASSWORD redis-cli ping`, which passes the password via environment variable instead of CLI argument.

## Scope

This was in the Docker Compose file only — the password was never in code or git history. Risk was limited to processes within the same container or host with shared PID namespace.
