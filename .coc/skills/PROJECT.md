---
id: "PROJECT"
---

# Project Skills Index

Project-specific skills for Arbor (HRIS + AI advisory for SG SMEs). Use this index to find the right skill before reading individual files.

## Platform & Architecture

| File                                                 | When to use                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [platform-architecture.md](platform-architecture.md) | Adding endpoints, middleware, component connections                                                 |
| [pool-safety.md](pool-safety.md)                     | Connection pool sizing, lifecycle, leak detection                                                   |
| [k8s-deploy.md](k8s-deploy.md)                       | Rolling out a new image to the DGX K8s cluster (the only env) via the `arbordev.aitelab.net` jumper |

## HRIS Engine

| File                                                     | When to use                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| [hris-engine.md](hris-engine.md)                         | Payroll, leave, claims, attendance, shifts, employee lifecycle |
| [calculators.md](calculators.md)                         | CPF, leave, salary, quota/levy, OT, notice, retrenchment       |
| [sg-employment-law.md](sg-employment-law.md)             | KB content, provision accuracy, regulatory compliance          |
| [company-user-management.md](company-user-management.md) | Onboarding, user CRUD, roles, workforce composition            |
| [document-generation.md](document-generation.md)         | Templates, generation endpoints, download, history             |

## AI / Advisory

| File                                                 | When to use                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| [advisory-safety-chain.md](advisory-safety-chain.md) | Advisory endpoints, Delegate, refusal policy                      |
| [shadow-agent.md](shadow-agent.md)                   | PACE loop, shadow agent tools, observability                      |
| [ollama-byok-provider.md](ollama-byok-provider.md)   | Tool-capable allowlist, per-request adapters, 1024-dim embeddings |
| [kb-management.md](kb-management.md)                 | Provisions, semantic search, embeddings, regulatory updates       |
| [ml-quick-reference.md](ml-quick-reference.md)       | kailash-ml engine surface                                         |

## Governance & Trust

| File                                                   | When to use                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| [trust-governance.md](trust-governance.md)             | Trust lineage, attestations, constraint envelopes, expert review |
| [pact-enforcement-modes.md](pact-enforcement-modes.md) | ENFORCE / SHADOW / DISABLED, envelope-to-execution adapter       |
| [auth-security.md](auth-security.md)                   | JWT, password handling, tenant isolation, rate limiting, PDPA    |

## Data Fabric

| File                                                         | When to use                                           |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| [dataflow-provenance-audit.md](dataflow-provenance-audit.md) | Provenance[T] field tracking, audit-trail persistence |
| [fabric-cache-consumers.md](fabric-cache-consumers.md)       | Cache control, consumer adapters, MCP tool generation |

## MCP Integrations

| File                                       | When to use                                                        |
| ------------------------------------------ | ------------------------------------------------------------------ |
| [mcp-integrations.md](mcp-integrations.md) | 5 MCP servers, 38 connectors, circuit breakers, idempotency, sagas |

## Frontend (apps/web)

| File                                                       | When to use                                                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [frontend-data-fetching.md](frontend-data-fetching.md)     | Adding/migrating data-fetch logic. TanStack Query patterns, per-hook staleTime decisions, key= for refetch flows, useEffect antipatterns |
