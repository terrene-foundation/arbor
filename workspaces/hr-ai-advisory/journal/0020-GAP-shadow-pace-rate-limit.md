# GAP: Shadow PACE endpoints use default rate limit, not advisory-specific

**Date:** 2026-04-14
**Phase:** /redteam round 1
**Severity:** MEDIUM

## Discovery

Spec compliance audit found that 3 shadow PACE endpoints (`/confirm`, `/continue`, streaming execute) still use the default 30/60s rate limit instead of the tighter 5/60s advisory-specific limit. These endpoints trigger LLM calls.

## Analysis

The spec (`specs/production-hardening.md` §3) explicitly names only `/advisory/query`, `/advisory/stream`, and `/shadow/execute`. The PACE endpoints were not mentioned. This is a spec coverage gap, not an implementation deviation.

## Decision

Accept for now — the PACE endpoints are triggered by user confirmation flows (not direct queries), so burst abuse is structurally unlikely. Update the spec to document the exclusion and rationale. If future load testing shows GPU contention from PACE endpoints, tighten their rate limit.
