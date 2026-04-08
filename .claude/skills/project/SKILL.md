---
name: arbor-project-skills
description: "Arbor project skill index — HRIS engine, BYOK/Ollama, advisory safety chain, calculators, shadow agent, trust governance, MCP integrations, and related domains."
---

# Arbor Project Skills

Specialist knowledge for the Arbor HR Advisory Platform. These skills load on-demand when their domain is touched — use them for situational awareness when working inside `src/hr_advisory/`, `apps/web/`, or `apps/mobile/`.

## LLM & advisory engine

| Skill                                                  | Domain                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [ollama-byok-provider.md](./ollama-byok-provider.md)   | BYOK Ollama provider, tool-capable allowlist, 1024-dim embeddings, M4 patch   |
| [advisory-safety-chain.md](./advisory-safety-chain.md) | The post-T122 safety chain with autonomous Delegate + 5-clause Refusal Policy |
| [shadow-agent.md](./shadow-agent.md)                   | Shadow Agent PACE loop, tool registry, observation/memory, 5-layer model      |

## HRIS core

| Skill                                                      | Domain                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| [hris-engine.md](./hris-engine.md)                         | 12 HRIS modules (payroll, leave, claims, attendance, shifts, etc.) |
| [calculators.md](./calculators.md)                         | 7 SG HR calculators (CPF, leave, overtime, levy, etc.)             |
| [sg-employment-law.md](./sg-employment-law.md)             | 6 regulatory domains (Employment Act, CPF, EFMA, TAFEP, WSH, IRAS) |
| [company-user-management.md](./company-user-management.md) | Company seeding, employee profile, invitation flow                 |
| [document-generation.md](./document-generation.md)         | HR document generation (contracts, policies, forms)                |

## Platform & infra

| Skill                                                          | Domain                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| [platform-architecture.md](./platform-architecture.md)         | 60+ DataFlow models, 16 routers, 120+ endpoints, 40+ frontend pages |
| [auth-security.md](./auth-security.md)                         | JWT rotation, tenant isolation, PDPA, session management            |
| [pool-safety.md](./pool-safety.md)                             | Database pool configuration, Async SQLite, WAL mode                 |
| [dataflow-provenance-audit.md](./dataflow-provenance-audit.md) | DataFlow audit trail, UpdateNode parameter gotchas                  |
| [fabric-cache-consumers.md](./fabric-cache-consumers.md)       | Data fabric cache consumers (query tracking, invalidation)          |

## Knowledge base & integrations

| Skill                                        | Domain                                                   |
| -------------------------------------------- | -------------------------------------------------------- |
| [kb-management.md](./kb-management.md)       | KB seeding, semantic search, provisions schema, 1024-dim |
| [mcp-integrations.md](./mcp-integrations.md) | 38 connectors across 5 MCP servers                       |

## Governance & trust

| Skill                                                    | Domain                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| [trust-governance.md](./trust-governance.md)             | EATP lineage, trust chains, constraint envelopes, attestations |
| [pact-enforcement-modes.md](./pact-enforcement-modes.md) | PACT D/T/R grammar, operating envelopes, clearance lifecycle   |

## ML

| Skill                                            | Domain                                                  |
| ------------------------------------------------ | ------------------------------------------------------- |
| [ml-quick-reference.md](./ml-quick-reference.md) | Kailash ML quick reference for Arbor-adjacent use cases |

## When to use

Each skill is self-contained with enough context to reason about its domain from the skill file alone. Pair with the matching project-level specialist agent in `.claude/agents/project/` for procedural guidance:

| Skill domain                 | Paired specialist agent                     |
| ---------------------------- | ------------------------------------------- |
| `ollama-byok-provider`       | (none — use kaizen-specialist + the skill)  |
| `advisory-safety-chain`      | `advisory-safety-chain-specialist`          |
| `shadow-agent`               | `shadow-agent-specialist`                   |
| `hris-engine`, `calculators` | `hr-calculator-specialist`                  |
| `sg-employment-law`          | `sg-employment-law-expert`                  |
| `platform-architecture`      | `arbor-platform-specialist`                 |
| `auth-security`              | (use with `arbor-platform-specialist`)      |
| `kb-management`              | `kb-pipeline-specialist`                    |
| `trust-governance`           | `trust-governance-specialist`               |
| `mcp-integrations`           | (use with `mcp-specialist` framework agent) |
