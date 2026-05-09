---
type: GAP
date: 2026-05-08
tags: [shard-d, regression-testing, behavioral-parity]
---

# No E2E coverage on the 6 fetch-on-mount pages targeted for TanStack Query migration

## What we discovered

Brief criterion 4 says "no production behavior regression — every changed page/component verified to render and behave identically." The implementation plan v1 offloaded this to "manual playwright check OR existing E2E run". Audit of `apps/web/tests/e2e/`:

- `00-route-intercept-verify.spec.ts`
- `04-advisory-chat.spec.ts`
- `05-calculators.spec.ts`
- `10-production-smoke.spec.ts`
- `11-v041-authenticated-verify.spec.ts`
- helpers/

NONE of these exercise the 6 pages slated for migration:

- `analytics/page.tsx` (6 fetches → 6 useQuery)
- `dashboard/page.tsx`
- `documents/page.tsx`
- `documents/[id]/preview/page.tsx`
- `signup/page.tsx` (invite-validation flow)
- `EmployeePicker` (embedded in employee detail flow)

## Why this is a GAP, not a RISK

A risk is "something might go wrong"; this is a documented contract gap. Brief criterion 4 cannot be satisfied by the v1 plan. Per `rules/testing.md` § "End-to-End Pipeline Regression Above Unit + Integration", every canonical user flow MUST have a Tier 2+ regression test executing docs-exact code against real infra.

Adding the regression suite is now Shard 2's gating dependency — the migration cannot ship without it.

## What to apply

Before any future fetch-pattern migration in this codebase: enumerate the user-visible flow on each affected page and confirm a Tier 2+ regression test exists. If not, the test is a same-shard prerequisite, not a follow-up.

## Resolution path

Plan v2 § Shard 2.5 mandates a regression test per migrated page at `apps/web/tests/regression/test_migration_<page>.spec.ts`. The test mocks the API endpoint via MSW with canned fixture data, mounts the page, asserts loading/error/empty/success states. This becomes the per-shard acceptance gate.

## Origin

Shard D redteam Round 1 finding F9, 2026-05-08. Full discussion at `01-analysis/04-redteam-round-1.md` § F9.
