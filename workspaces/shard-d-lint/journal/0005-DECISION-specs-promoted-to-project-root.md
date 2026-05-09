---
type: DECISION
date: 2026-05-08
created_at: 2026-05-08T00:00:00Z
author: co-authored
session_id: shard-d-todos
session_turn: 5
project: shard-d-lint
topic: Promote frontend-data-fetching + react-hooks-correctness specs from workspace to project-root specs/
phase: todos
tags: [shard-d, todos, specs-authority, codify]
---

# Promote Shard D specs from workspace draft to project-root canonical home

## What

S5 § 5.4 (spec landing) was updated to promote the two workspace-draft specs to the project-root `specs/` directory:

- `workspaces/shard-d-lint/specs/frontend-data-fetching.md` → `specs/frontend-data-fetching.md`
- `workspaces/shard-d-lint/specs/react-hooks-correctness.md` → `specs/react-hooks-correctness.md`
- `specs/_index.md` (project root, already exists with 3 entries: `k8s-staging-resilience`, `load-testing`, `production-hardening`) gets two new entries.
- Workspace specs at `workspaces/shard-d-lint/specs/` REMAIN as the historical working draft per the workspace contract — not deleted.

## Why

Per `rules/specs-authority.md` Rule 1, "Every project has a `specs/` directory with `_index.md`. Phases read `_index.md` to find relevant files, then read only those." The project-root `specs/_index.md` is the authoritative manifest for the project's domain truth. Workspace specs at `workspaces/<project>/specs/` are working drafts produced during `/analyze` — they belong to the workstream, not the project.

The brief at `briefs/01-shard-d-brief.md` line 48 originally said "A spec file at `specs/frontend-data-fetching.md` (or workspace equivalent) documents the canonical fetch-state-render pattern". The "or workspace equivalent" clause was the redteam's escape hatch during /analyze convergence — but at /todos time, FT3 (MED) flagged that defaulting to workspace-only risks future drift: agents loading the project skill `decide-framework` or `react-specialist` would not see the spec because they read from project-root `specs/`, not `workspaces/<closed-workstream>/specs/`.

Promotion to project-root closes the drift gap: future agent delegations include `specs/frontend-data-fetching.md` (per `rules/specs-authority.md` Rule 7 spec-content-in-delegation discipline), and the /redteam phase's "5b sibling-spec re-derivation" sweep covers them.

## Alternatives considered

- **Keep specs in workspace only**. Rejected: brief criterion 3 demands the canonical pattern be documented; "documented in a closed workspace" is not equivalent to "documented in project specs/". A future agent fixing a TanStack Query bug will not find the spec.
- **Promote AND delete the workspace draft**. Rejected per `rules/specs-authority.md` Rule 5b — workspace specs are the trail of how the project-root spec was derived, including the redteam-driven addenda. Deletion erases the audit trail.
- **Inline the 4 redteam addenda (F15/F16/F17/F24) directly into the workspace draft, without project-root promotion**. Rejected: same drift problem as the first alternative; addenda live where future agents won't find them.

## Consequences

- S5 § 5.4 now writes to `specs/` (project root) and updates `specs/_index.md`.
- S5 § Files list updated to reflect dual locations.
- Workspace specs become the immutable working draft — referenced by future audits but not the active source.
- Future `/redteam` runs against shard-d (or any frontend follow-up) will include `specs/frontend-data-fetching.md` + `specs/react-hooks-correctness.md` per Rule 5b sibling re-derivation.

## For Discussion

1. The workspace-spec drafts include in-progress notes and decision rationales that are valuable for `/codify` but cluttered for active spec authority. Should the promoted project-root specs be a strict subset (canonical patterns + addenda only) and the workspace drafts retain the rationale prose? Or should the project-root specs include the full rationale for completeness?
2. Counterfactual: if FT3 had not flagged the workspace-only risk, the spec would have shipped to the workspace location and the brief criterion 3 would be technically satisfied. How many similar workstreams have closed with their specs trapped in `workspaces/<name>/specs/`, invisible to future delegations? (A grep across closed workspaces would surface them.)
3. The new specs introduce vocabulary (`staleTime`, `useMemo` deps, `key=<field>` choice) that may overlap with patterns documented elsewhere (e.g., `.claude/skills/30-claude-code-patterns/` or `.claude/skills/22-conversation-ux/`). Per Rule 5b the edit MUST trigger sibling-spec re-derivation. Is there a sweep planned across existing project-root specs to confirm no terminology drift before S5 § 5.4 lands?

## Origin

`/todos` red-team Round 1 finding FT3 (MED), produced by `analyst` agent on 2026-05-08 against `S5-spec-landing-and-ci-gate.md`. Cross-references `rules/specs-authority.md` Rules 1, 5b, 7.
