---
type: CONNECTION
date: 2026-05-08
tags: [shard-d, sequencing, dead-code]
---

# Shard 2's analytics rewrite eliminates Shard 3's analytics Type-D quartet as a side effect

## The connection

`analytics/page.tsx` appears in 3 shards in the v1 plan:

- **Shard 1**: `react-hooks/immutability` at line 122 (conic-gradient closure mutation)
- **Shard 2**: `react-hooks/set-state-in-effect` at line 400 (the 6-fetch-on-mount migration)
- **Shard 3**: 4 Type D dead state hooks at lines 369-377 (`reportLoading`, `metricsError`, `feedbackError`, `reportError`)

All 4 Type D state hooks belong to the very effect Shard 2 rewrites. When Shard 2 replaces the `useState + useEffect + 6× fetch` block with 6 `useQuery` hooks, ALL 4 dangling state hooks disappear automatically — `reportLoading` becomes `reportQuery.isLoading`, `metricsError` becomes `metricsQuery.error`, etc.

## Why it's worth recording

If Shard 3 ran in parallel with Shard 2 (per v1's design), it would either (a) merge-conflict on the file, or (b) succeed-then-be-undone when Shard 2 lands and the entire effect block is replaced. The v1 plan called this a "merge conflict on `types/api.ts`" — that was the wrong abstraction; the real conflict is at the page-file level, and the resolution is sequencing, not type ownership.

This same pattern (one shard's larger rewrite eliminates another shard's smaller surgical fix) recurs whenever a TanStack Query migration replaces a `useState + useEffect + fetch` block: any cleanup the linter wants on the BEING-REPLACED variables is moot.

## How to apply

When two shards both edit the same file, check whether one shard's rewrite SUBSUMES the other's surgical fix. If yes, merge them into one shard with explicit "this fix is moot after the rewrite" comments. The file→owner matrix in plan v2 captures this.

## Origin

Shard D redteam Round 1 findings F4 + F12, 2026-05-08. Plan v2 § "File→owner matrix" + § Shard 2.4 Analytics quartet absorption.
