# HR Advisory Workspace Specs Index

Created 2026-05-01 to close [LOW] Sweep 5 from `SWEEP-2026-04-28.md` and to give `/redteam` and `/sweep` an AST/grep-verifiable target per `rules/specs-authority.md` MUST 1.

This is a **skeleton index covering the as-built system** — Arbor M01-M59 shipped without canonical `specs/` files, so domain truth lives scattered across 143 completed todos, 21 redteam rounds, 17 journal entries, and the project memory. Rows below are placeholders for retroactive spec files; populate them as `/codify` runs against each domain or as `/analyze` opens new domain work.

The detailed sources of authority remain:

- `.claude/skills/project/SKILL.md` — 18 project skills grouped by domain (most authoritative for as-built behavior)
- `.claude/skills/project/*.md` — per-domain knowledge (advisory safety chain, ollama-byok-provider, k8s-staging-deploy, etc.)
- `.claude/agents/project/*.md` — domain agent specifications
- `memory/MEMORY.md` — institutional knowledge across sessions
- `briefs/` — original product briefs (under `workspaces/hr-ai-advisory/briefs/` if present)
- `02-plans/` — implementation plans

## Domain-organized index

Per `rules/specs-authority.md` MUST 2: organize by domain ontology, not COC process.

### HRIS Engine (12 modules, deterministic where possible)

| File                         | Domain      | Status      | Description                                                                                  |
| ---------------------------- | ----------- | ----------- | -------------------------------------------------------------------------------------------- |
| `hris-payroll.md`            | Payroll     | placeholder | CPF, OW ceiling $8k/mo, SHG routing by race, SDL, FWL — deterministic; zero LLM              |
| `hris-leave.md`              | Leave       | placeholder | Leave engine, gender-aware, service-month-aware, pro-rated; 11 leave types; encashment + OIL |
| `hris-claims.md`             | Claims      | placeholder | Claim categories, approval groups, paid integration with payroll                             |
| `hris-attendance.md`         | Attendance  | placeholder | Settings, OT eligibility, integration with payroll                                           |
| `hris-shifts.md`             | Shifts      | placeholder | Publish workflow, OT calculation                                                             |
| `hris-employee-lifecycle.md` | Employees   | placeholder | 30+ profile fields, family members, notes, events, skills, custom fields                     |
| `hris-statutory-files.md`    | Statutory   | placeholder | IR8A, IR21 generation; CPF submission                                                        |
| `hris-pii-encryption.md`     | Security    | placeholder | Fernet via `SALARY_ENCRYPTION_KEY`; PDPA audit on every PII access                           |
| `hris-appraisals.md`         | Appraisals  | placeholder | Cycle definition, 360 reviews, scoring                                                       |
| `hris-projects.md`           | Projects    | placeholder | Project tracking, allocation, timesheet                                                      |
| `hris-inventory.md`          | Inventory   | placeholder | Asset issuance, return, depreciation                                                         |
| `hris-recruitment.md`        | Recruitment | placeholder | Job postings, applications, interview scheduling                                             |

### Advisory & Shadow Agent

| File                             | Domain           | Status      | Description                                                                             |
| -------------------------------- | ---------------- | ----------- | --------------------------------------------------------------------------------------- |
| `advisory-safety-chain.md`       | Advisory         | placeholder | 13-step safety chain, autonomous Delegate, 5-clause Refusal Policy (T121/T122)          |
| `advisory-engine-autonomous.md`  | Advisory         | placeholder | LLM function-calling engine, 6 tools, KB fallback (replaced Kaizen pipeline 2026-03-21) |
| `shadow-agent-pace.md`           | Shadow           | placeholder | PACE loop, 462 tools, attachment support, 4 trust tiers                                 |
| `shadow-observation-pipeline.md` | Shadow           | placeholder | Frontend useObservation → POST /shadow/observe → DataFlow persistence                   |
| `trust-lineage.md`               | Trust governance | placeholder | LRU cache (10k) + DB persistence on finalize; EATP/CARE compliance                      |

### Knowledge Base & Search

| File                    | Domain      | Status      | Description                                                               |
| ----------------------- | ----------- | ----------- | ------------------------------------------------------------------------- |
| `kb-pipeline.md`        | KB          | placeholder | Content loading, embeddings (1024-dim Ollama), semantic search, staleness |
| `regulatory-domains.md` | Compliance  | placeholder | 6 regulatory domains: EA, CPF, EFMA, TAFEP, WSH, IRAS                     |
| `calculators.md`        | Calculators | placeholder | 7 SG HR calculators — CPF, leave, OT, levy, cost-to-company, etc.         |

### LLM Provider & BYOK

| File                  | Domain | Status      | Description                                                           |
| --------------------- | ------ | ----------- | --------------------------------------------------------------------- |
| `llm-providers.md`    | LLM    | placeholder | Ollama primary (qwen3, gemma4); BYOK supports OpenAI/Anthropic/Gemini |
| `byok-credentials.md` | LLM    | placeholder | Per-tenant BYOK; gpt-5-mini default with $5/month cap                 |

### Platform & Auth

| File                       | Domain           | Status      | Description                                                                         |
| -------------------------- | ---------------- | ----------- | ----------------------------------------------------------------------------------- |
| `platform-architecture.md` | Platform         | placeholder | Kailash Core + DataFlow + Nexus + Kaizen; 60+ models, 23+ routers, 120+ endpoints   |
| `auth-session.md`          | Auth             | placeholder | bcrypt direct, PyJWT with `sub` as string; Redis-backed sessions; proactive refresh |
| `multi-tenant.md`          | Tenant isolation | placeholder | Company-scoped isolation; tenant_id required on every cache key                     |
| `rate-limiting.md`         | Platform         | placeholder | Token bucket per endpoint; Redis upgrade path; advisory-specific limits             |

### Frontend

| File                     | Domain | Status      | Description                                                                            |
| ------------------------ | ------ | ----------- | -------------------------------------------------------------------------------------- |
| `web-architecture.md`    | Web    | placeholder | Next.js 16, Tailwind v4, TanStack Query, i18next; 40+ pages; CSS-only charts           |
| `prism-integration.md`   | Web    | placeholder | @kailash/prism-web — wave 1-3 consumers, 0.4.0 typed `TId`, 0.5.0 in flight 2026-05-01 |
| `mobile-architecture.md` | Mobile | placeholder | Flutter, Riverpod 3 Notifier, GoRouter, Dio, flutter_secure_storage                    |

### MCP Integration Layer

| File                    | Domain | Status      | Description                                                                                              |
| ----------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| `mcp-servers.md`        | MCP    | placeholder | 5 MCP servers: arbor-government, arbor-accounting, arbor-banking, arbor-communications, arbor-regulatory |
| `mcp-connectors.md`     | MCP    | placeholder | 38 connectors (35 adapters + 3 file generators) across 56 Python files                                   |
| `mcp-infrastructure.md` | MCP    | placeholder | Token store, circuit breakers, idempotency ledger, saga (8 templates), PII filter, health monitor        |

### Production Operations

| File                   | Domain | Status      | Description                                                                                                 |
| ---------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `deploy-staging.md`    | Ops    | placeholder | tag → GH Actions → Docker Hub → jumper kubectl rollout (see `.claude/skills/project/k8s-staging-deploy.md`) |
| `deploy-production.md` | Ops    | placeholder | GCE arbor-prod (asia-southeast1-b); rsync via SSH key + docker compose rebuild                              |
| `health-probes.md`     | Ops    | placeholder | `/health` with DB probe (PR #24); 503 on DB unreachable                                                     |
| `load-testing.md`      | Ops    | placeholder | locust + mock LLM server; 4 user classes; weighted traffic mix                                              |

## Cross-domain invariants (must hold in every spec)

- **Tenant isolation** — every query filters by `company_id`; cache keys include `tenant_id` dimension
- **PDPA audit** — every PII access (NRIC, bank, salary, work_pass) logs to `PdpaAccessLog`
- **Auth on every endpoint** — no anonymous routes outside `/health` and public landing
- **Generic errors** — internal exceptions never leak stack traces or DB names to clients
- **Status guards** — state machines enforce legal transitions (PayrollRun draft→approved→paid; Leave pending→approved/rejected; Claim draft→submitted→approved→paid)
- **`.env` is the single source of truth** — no hardcoded model strings or API keys (`rules/env-models.md`)

## Populating the index

Per `rules/specs-authority.md` MUST 5: update spec files at first instance when domain truth changes. The skeleton above is intentionally placeholder-only; do not fill in everything at once. Populate a row when:

1. `/codify` extracts knowledge for that domain, OR
2. `/analyze` opens new work in that domain, OR
3. `/redteam` finds drift between behavior and the implicit spec

Each populated file MUST be detailed (per MUST 3) — comprehensive enough to be authority on its topic, with edge cases, contracts, decisions. Aim for ~150–300 lines per spec; split into sub-domain files when over 300 lines (MUST 8).
