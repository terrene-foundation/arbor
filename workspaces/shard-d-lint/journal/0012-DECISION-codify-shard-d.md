---
type: DECISION
date: 2026-05-09
created_at: 2026-05-09T10:35:00Z
author: agent
session_id: shard-d-codify
session_turn: 64
project: shard-d-lint
topic: /codify — Shard D patterns absorbed into agent + skill + spec layer
phase: codify
tags: [shard-d, codify, agent-update, learning-codified, frontend]
---

# /codify — Shard D patterns absorbed into institutional knowledge

## What

The /codify phase for Shard D made the following updates to the project's persistent knowledge layer (`agents/`, `skills/`, `specs/`, `.github/workflows/`):

### 1. Agent update — `arbor-web-specialist`

Added a new "Canonical Patterns (read first when adding/migrating fetch logic)" section pointing to:

- `specs/frontend-data-fetching.md`
- `specs/react-hooks-correctness.md`
- `.claude/skills/project/frontend-data-fetching.md`

Added 4 new Critical Rules:

- Fetch-on-mount MUST use TanStack Query `useQuery`
- New TanStack Query hooks MUST justify `staleTime` inline per the per-domain decision protocol
- `npx eslint . --max-warnings 0` MUST pass (CI-enforced)
- `// eslint-disable-*` BLOCKED except structurally inapplicable + tracking issue

Agent file remains under the 400-line cap (now ~200 lines).

### 2. Spec promotion — already done in S5 (recorded for codified inventory)

- `specs/frontend-data-fetching.md` (241 lines)
- `specs/react-hooks-correctness.md` (261 lines)
- `specs/_index.md` updated

### 3. Skill creation — already done in S5

- `.claude/skills/project/frontend-data-fetching.md` (~140 lines, progressive disclosure)
- `.claude/skills/project/SKILL.md` updated with "Frontend (apps/web)" section

### 4. CI gate — already done in S5

- `.github/workflows/lint-web.yml` runs `npx eslint . --max-warnings 0` + `npx tsc --noEmit`

### 5. Learning system

- `.claude/learning/learning-codified.json` written for the first time, recording:
  - `last_codified`: 2026-05-09T10:35:00Z
  - `digest_hash`: daf5dbc56d39a95f4b7159685dbe8b66160805294a3d137d884bdecc65838abb (digest from 2026-04-17 was empty for our purposes — Shard D work post-dates the digest)
  - 5 actions taken + 3 actions skipped with rationale

## Why

Shard D's discoveries (per journal entries 0001–0011) had two natural homes:

1. **Spec layer** (project-root `specs/`) — the contract for what the patterns are.
2. **Skill + agent layer** (`.claude/`) — the agent-facing pointer to the contract.

S5 already promoted specs + created the skill + added the CI gate. /codify's job was to ensure the **agent** that future React work flows through (`arbor-web-specialist`) actually points at the new artifacts. Without the agent update, future Shard D-style work would re-derive the patterns instead of reading the specs.

Skipped actions:

- **Rule layer addition** — would duplicate spec content per `rules/cc-artifacts.md` "No knowledge dumps". Spec is the source of truth.
- **Upstream proposal to loom** — Arbor is downstream project repo per `rules/artifact-flow.md`. Changes stay local.
- **README update** — lint cleanup is internal hygiene, not a user-facing capability.

## Consequences

- Future agents working on `apps/web/` will see the canonical patterns via:
  1. The `arbor-web-specialist` agent file (loaded on delegation).
  2. The `frontend-data-fetching.md` skill (loaded on demand).
  3. The project-root specs (loaded by `/analyze`/`/todos` per `rules/specs-authority.md` Rule 4).
- The CI gate prevents regression of brief criterion 1 (0/0 lint).
- The 4 new Critical Rules in `arbor-web-specialist` are mechanical constraints — agents cannot work around them by ignorance.

## For Discussion

1. The `arbor-web-specialist` agent now has 13 Critical Rules (was 9). At what point do too many rules dilute attention? `rules/cc-artifacts.md` caps agent files at 400 lines but doesn't explicitly cap the rule count. Worth a meta-rule on Critical Rule density?
2. Counterfactual: if Shard D had NOT promoted specs to project root, the workspace specs would have been ignored by future `/analyze`/`/todos` cycles per Rule 4 (which reads `specs/_index.md`, not workspace specs). The promotion is what makes the codification operational rather than archival.
3. The `learning-codified.json` introduces a new institutional pattern: a structured ledger of what each `/codify` cycle did. Should the next `/codify` extend the file (append to actions_taken) or replace it (per-cycle snapshot)? The schema in the workflow contract is ambiguous; a future ADR could clarify.

## Origin

`/codify` invocation 2026-05-09 against the `shard-d-lint` workspace. Reads journal entries 0001–0011 + S5 PR (#42). Phase-complete journal entry per the /codify workflow contract.
