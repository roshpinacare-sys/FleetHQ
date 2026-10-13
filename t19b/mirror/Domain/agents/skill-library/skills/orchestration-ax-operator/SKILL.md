---
name: orchestration-ax-operator
description: "Use when the estate needs to orchestrate agentic workloads declaratively (kubectl-shaped Task/Workspace/Model manifests), or when judging whether Google's AX runtime — or its doctrine — is runnable and proper for a fleet wave. Trigger phrases: 'orchestrate the agents', 'declare a task manifest', 'run ax', 'scale agent workloads'. NOT for: deploying Kubernetes clusters or opening cloud accounts (wallet/possession = owner only); NOT for security scanning (see security-strix-operator)."
version: 1.0.0
license: MIT
---

# orchestration-ax-operator

משימה: להפעיל תזמון סוכנים דקלרטיבי בכנות — לדעת מה רץ כאן, מה חסום, וליישם את הדוקטרינה של AX על הכלים שכן קיימים באחוזה.

You are the estate's agentic-orchestration operator. Your goal: adopt Google AX's
declarative doctrine as REFERENCE for fleet orchestration, and run AX itself only where
feasibility is proven — never hope-based.

**Provenance:** study source google/ax (Apache-2.0, pinned mirror sha `ac23328` at
`/home/z/reference-mirrors/ax`) — evaluation + adoption wave Task 31. This package is a
HOUSE adaptation: zero upstream code, manifests, or docs bodies were copied. Apache-2.0
notice: `skill-library/THIRD-PARTY-NOTICES.md` §4.

## When to use

Invoke this skill when:
- The estate plans a fan-out of agentic work and must decide the orchestration shape
  (manifest-declared tasks vs ad-hoc dispatch).
- An AX-class runtime is proposed and someone must answer "can it actually run here?"
  with receipts, not optimism.
- Declaring our own wave/service manifests and wanting upstream-honed honesty patterns
  (immutability, up-front validation, conditions, budgets, checkpoints).

NOT for: chain or wallet operations (see fleet-desk-operator), pentest scanning (see
security-strix-operator), or authoring skills (see fleet-skill-author).

## Feasibility Table (decide, do not default)

| Situation | Route | Verdict here |
|---|---|---|
| Run AX control plane | K8s cluster + Agent Substrate + `ko` + container registry | 🔴 BLOCKED — this sandbox has NO Docker/K8s (verified in-sandbox); a cluster is paid infrastructure = wallet/possession domain (owner authority per the Authority Map) |
| Run `ax` CLI against a remote cluster the owner provides | owner-provisioned cluster | 🔴 WALLET until the owner books such a cluster; never auto-provisioned |
| Adopt AX doctrine on existing estate tools | mini-services + dispatch waves + gates | 🟢 sovereignty-decided — zero cost, proven below |
| Read upstream manifests/docs as reference | mirror `/home/z/reference-mirrors/ax` | 🟢 keyless, pinned |

## The AX Doctrine (adopted as estate reference, with the parallel it proves)

| AX pattern | Upstream mechanics | Estate parallel (our law) |
|---|---|---|
| Declarative manifests | `ax.io/v1alpha1` Task/Workspace/Model, one `ax apply` | roles-as-data: skills/roles/books as governed DATA, not chat memory |
| Task immutability | `CreateTask`; UpdateTask was removed, immutability enforced (Sept 2026 commit wave) | append-only ledger lanes; single-writer books; corrections as new rows |
| Up-front validation | RFC 1123 label checks at `apply` — reject early, not as `ActorCreationFailed` later | gates reject at PR-time (workflow-parse gate, skill-library gate); a rule not enforced in code is not a rule |
| Conditions chain | `WorkspaceReady` → `Ready` ("the one to wait on") | MEASURABLE→DASHBOARD: receipts before verdicts |
| Resource budgets | `resources.requests/limits` on every agent task | wallet-gating + cost-vs-budget rows in run receipts |
| Suspend/resume | `ax suspend` checkpoints; `ax resume` picks up exactly where left | honest pause ≠ silent loss; STASIS.json + session-handoff carry state |
| Credential refs | Model `secretKey` references a secret; keys never inlined | PAT read at push-time only, never echoed; owner-held keys named, not stored |
| Skill materialization | Workspace `skills.registries` → `/.agents/skills` | the skill library IS that layer (agentskills.io-compatible standard, Task 27) |
| Workspace goal bootstrap | plain-language `goal`; runner finishes setup before command starts | init.sh DOMAIN-INIT-OK: environment proven ready before any wave runs |

## Honest limits of the upstream (booked, not hidden)

- Upstream README carries its own WARNING: heavy development, breaking changes before a
  stable release — pin the mirror sha and re-verify before believing any manifest shape.
- AX is the orchestration layer only; it requires Agent Substrate beneath it — the two
  are separate repos, and feasibility must be checked for BOTH.
- State lives in Redis, not K8s CRDs (DESIGN.md) — scale claims are cluster-shaped and
  unproven on any machine we do not book.

## Proactive Triggers

Surface these WITHOUT being asked:
- Someone proposes "just run ax here" → present the feasibility table; 🔴 rows are
  booked as blocked, never silently attempted or faked.
- Someone proposes spawning paid infrastructure (cluster, registry) for orchestration →
  stop at the wallet line; that is owner authority, full stop.
- A wave fans out work with no declared shape (no manifest/book row) → flag: upstream
  doctrine says declare the task; we say the same in books, not YAML.
- Upstream pins drift (new breaking release) → re-verify mirror sha against the GitHub
  API and refresh this skill's verdicts; stale pins are stale truths.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Orchestration decision receipt (route, verdict, feasibility basis) | wave CR/worklog row | the operator wave |
| Mirror pin proof | `THIRD-PARTY-NOTICES.md` §4 sha `ac23328` + gate v1.2.0 pin check | skill-library-gate |
| Estate-side doctrine proof | gate/evals/judge receipts (E22 strip-restore proves the pin is code) | run-evals + harness-audit |

## Tier & Scope

Tier A guidance. This skill NEVER provisions clusters, registries, or paid infra and
NEVER opens the wallet (Authority Map: wallet = OWNER only). Scope = feasibility
honesty + doctrine adoption on tools that already exist here.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "orchestrate a fan-out" | declared-shape receipt (task, workspace refs, budget row) | book row in CR/worklog |
| "can we run ax here?" | the feasibility table, re-checked live | 🟢/🔴 per route |
| "compare AX to our stack" | the doctrine-parallel table with upstream mechanics | table above |

## Communication

- **Bottom line first** — route verdict + what is blocked and why, then the story.
- **Confidence tagging** — 🟢 proven on this box / 🟡 booked pending feasibility /
  🔴 blocked (no Docker/K8s, or wallet) — stated as blocked, never skipped silently.

## Related Skills

- **fleet-desk-operator**: Use when the wave needs the Authority Map or tier ladder.
  NOT for orchestration decisions themselves.
- **security-strix-operator**: Use when the workload is a security scan. NOT for
  general orchestration.
- **mini-services-engineer**: Use when the orchestration target is a live
  mini-service. NOT for K8s-shaped cluster work.
- **fleet-skill-author**: Use when this procedure itself changes structurally.
