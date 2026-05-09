# Specs Index

| File                       | Domain         | Description                                                                                                                                         |
| -------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| load-testing.md            | Infrastructure | Load test suite, mock LLM, scenarios, success criteria                                                                                              |
| production-hardening.md    | Infrastructure | Ollama tuning, thread pool, rate limiting, deployment config                                                                                        |
| k8s-staging-resilience.md  | Infrastructure | DGX reboot recovery, PVC persistence, jumper hardening, playbook                                                                                    |
| frontend-data-fetching.md  | Frontend       | Canonical TanStack Query pattern, queryKey conventions, per-hook staleTime decision protocol, when `useEffect+setState` is wrong (Shard D, S5)      |
| react-hooks-correctness.md | Frontend       | 7 antipatterns + when `useEffect` IS the right tool, `key=` choice for refetch flows, TanStack-Query `data?.X ?? []` exhaustive-deps gotcha (Shard D, S5) |
