# Arbor Deployment Targets

Arbor is an enterprise SaaS product and will run in **multiple deployments** — the
Foundation's own DGX cluster today, and customer- or Foundation-operated deployments
on Azure, AWS, and Google Cloud as they are provisioned.

**One file per target, in this directory.** Each target file is the single, complete
set of notes for that deployment: its identity, topology, access path, rollout
procedure, known failure modes, and current state. Target files do not depend on each
other and are not merged.

Anything true of Arbor **regardless of where it runs** — container images, the
environment-variable contract, health-check endpoints, the tag → build → publish →
roll out → verify shape — lives in `../deployment-config.md`, not here. If you find
yourself writing the same paragraph into two target files, it belongs there instead.

## Registry

| Target        | File                             | Cloud / substrate                      | Domain              | Status              |
| ------------- | -------------------------------- | -------------------------------------- | ------------------- | ------------------- |
| `dgx-aitelab` | [dgx-aitelab.md](dgx-aitelab.md) | Foundation-owned DGX, self-managed K8s | `arbor.aitelab.net` | **live**            |
| Azure         | —                                | —                                      | —                   | not yet provisioned |
| AWS           | —                                | —                                      | —                   | not yet provisioned |
| Google Cloud  | —                                | —                                      | —                   | not yet provisioned |

The three cloud rows are recorded as **planned, not built**. There is deliberately no
file for them: an empty target file would be a stub asserting a deployment that does
not exist (`rules/zero-tolerance.md` Rule 2). A row here becomes a file the day the
deployment is real.

## What a target file MUST contain

When a new deployment is provisioned, its file carries all of:

1. **Identity** — target name, substrate, owner, region, and whether it is
   production, staging, or a customer tenant. State this explicitly; do not let the
   reader infer it from the domain.
2. **Topology** — the running components and how traffic reaches them, including
   which of Postgres / Redis / the LLM are in-cluster versus managed services.
3. **Access** — how an operator reaches the control plane (jumper, cloud shell,
   kubeconfig, IAM role), and what authentication that requires.
4. **Rollout** — the exact commands for this target. The generic sequence lives in
   `../deployment-config.md`; this section holds the substitutions and anything the
   target does differently.
5. **Rollback** — the exact command, verified against this target.
6. **Known failure modes** — target-specific traps, each with its remedy.
7. **State of persistence, backup, and monitoring** — including honest "not
   configured yet" entries. An absent section reads as "handled"; it usually is not.
8. **Current version** — what is deployed right now, and when it was verified.

## What is deliberately NOT assumed

- **That any one target is "production".** `dgx-aitelab` is production _today_, and
  its file says so. That is a property of that target, not of Arbor.
- **That every target has a staging sibling.** `dgx-aitelab` has none, which is a
  real operational constraint recorded in its file. Other targets may differ.
- **That the rollout path is `kubectl`.** It is on DGX. A managed-container target
  (App Service, ECS, Cloud Run) will not use it at all.
- **That in-cluster Postgres / Redis / Ollama is the shape.** On DGX they are pods;
  on a cloud target they are more likely managed services with different failure
  modes, backup guarantees, and cost profiles.

Do not generalise a claim from one target file to another without checking it there.
