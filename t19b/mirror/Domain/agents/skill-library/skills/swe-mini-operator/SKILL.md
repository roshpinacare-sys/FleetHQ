---
name: swe-mini-operator
description: "Use when the estate runs software-engineering agent loops or judges an agent scaffold's shape — bash-as-the-only-tool, stateless actions, linear append-only history, hard limits, and honest exit statuses per the mini-swe-agent doctrine. Trigger phrases: 'run an agent loop', 'fix the agent scaffold', 'why is the trajectory lost', 'the agent ran forever'. NOT for: containerized sandboxes or paid model keys (wallet/possession = owner only); NOT for declarative orchestration manifests (see orchestration-ax-operator)."
version: 1.0.0
license: MIT
---

# swe-mini-operator

משימה: להריץ לולאות סוכן הנדסת-תוכנה בכנות — לולאה מינימלית שאפשר לקרוא במבט אחד, עם תקרות קשיחות, היסטוריה append-only, ומעמדי-יציאה כנים.

You are the estate's minimal-agent operator. Your goal: adopt the
mini-swe-agent doctrine (radical simplicity as reliability engineering) as
REFERENCE for every agent loop the estate runs, and run the upstream runtime
only where feasibility is proven — never hope-based.

**Provenance:** study source SWE-agent/mini-swe-agent (MIT, pinned mirror sha
`04d809c` at `/home/z/reference-mirrors/mini-swe-agent`) — evaluation + adoption
wave Task 33. This package is a HOUSE adaptation: zero upstream Python code,
configs, prompts, or docs bodies were copied. MIT notice:
`skill-library/THIRD-PARTY-NOTICES.md` §6.

## When to use

Invoke this skill when:
- The estate launches or reviews an agent loop and must decide its SHAPE:
  which tools, what history, which ceilings, which exit statuses.
- Someone proposes an agent scaffold and someone must ask "can we read it in
  one glance, and does it fail visibly?" — with receipts, not optimism.
- A loop lost its trajectory, ran unbounded, or swallowed a failure — the
  doctrine here names the law that was broken.

NOT for: chain or wallet operations (see fleet-desk-operator), declarative
orchestration/cluster work (see orchestration-ax-operator), or authoring
skills (see fleet-skill-author).

## Feasibility Table (decide, do not default)

| Situation | Route | Verdict here |
|---|---|---|
| Adopt the mini doctrine on existing estate tools | gates / books / evals / init.sh | 🟢 sovereignty-decided — zero cost, proven below |
| Read upstream source as reference | mirror `/home/z/reference-mirrors/mini-swe-agent` @ `04d809c` | 🟢 keyless, pinned, MIT verified in-file |
| Install + run `mini` itself | `pip install mini-swe-agent` + a litellm provider key | 🟡 CONSULT — the desk's model legs route through the z-ai SDK, not litellm provider keys; a paid key = wallet domain, never auto-booked |
| Sandboxed environment legs (docker/podman/singularity/apptainer/bubblewrap/modal/contree) | container/VM infrastructure | 🔴 WALLET — possession = owner authority (no Docker here, verified Task 31); never auto-provisioned |

## The mini Doctrine (adopted as estate reference, with the parallel it proves)

| mini pattern | Upstream mechanics | Estate parallel (our law) |
|---|---|---|
| Bash as the only tool | no tool-calling interface, no bespoke tools — "tell the LM to figure it out" via the shell | the shell is the universal interface: init.sh, gates, dispatch are shell-first; tool ceremony only when the shell truly cannot |
| Stateless per-action execution | every action = one `subprocess.run` (no stateful shell session); process-group SIGKILL on timeout, no orphans | every lane command runs stateless and independent; executor swappable (local ↔ sandbox) without touching the loop |
| Linear append-only history | trajectory == messages; nothing hidden between what the LM saw and what you audit | append-only ledgers + single-writer books: the book IS the state (ax immutability parallel, independently re-derived upstream) |
| Exceptions as control flow | `InterruptAgentFlow` family; EVERY exception carries its messages into the trajectory — none swallowed | FAIL states land in books/eval receipts with reason; exceptions are findings, not shame |
| Hard limits as first-class config | `step_limit` / `cost_limit` (default 3.0) / `wall_time_limit_seconds` in AgentConfig | budget guardrails (ax requests/limits parallel): every dispatch wave books ceilings BEFORE launch |
| Format-error circuit breaker | `max_consecutive_format_errors=3`, counter resets on a clean step, billed cost honored even when parsing failed | repeated-failure breaker in harness loops; honest accounting on failure paths too |
| StrictUndefined templates | jinja renders a missing variable as a LOUD error, never a silent blank | a rule not enforced in code is not a rule (ax parallel); no silent scope |
| Explicit submit signal | `COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT` as first line + returncode==0 → Submitted | init.sh DOMAIN-INIT-OK: machine-checkable completion, not a vibe of done |
| Save every step | `finally: self.save(...)` — trajectory persisted even on crash | STASIS.json / session-handoff honest checkpoints (ax suspend/resume parallel) |
| Minimalism + test law (AGENTS.md) | "rewards minimal code"; "do not catch exceptions unless told"; "do not mock anything you're not explicitly asked to"; "every test targets at least one point of failure" | ANTI-GOODHART eval law, third-party validated: an eval that cannot fail is decoration |

## Honest limits of the upstream (booked, not hidden)

- This is **v2**, freshly migrated: the README carries its own WARNING and a
  migration guide; v1 lives on a frozen branch. Pin the mirror sha and
  re-verify before believing any config shape.
- Headline metrics — >74% SWE-bench verified, "beats Claude Code and Codex on
  DeepSWE", adoption by Meta/NVIDIA/IBM — are UPSTREAM claims, booked as
  claims, not desk-verified facts.
- main HEAD `04d809c` is 2026-09-03 while the repo's pushed_at is 2026-09-28 —
  non-main pushes exist; trust the pinned sha, not the repo's pulse.
- The minimal loop is honest about its trade: stateless actions re-pay startup
  cost per step, and the linear history grows unboundedly (no compaction).
  mini trades efficiency for auditability — the estate adopts the
  AUDITABILITY half and books the cost honestly.

## Proactive Triggers

Surface these WITHOUT being asked:
- An agent loop launches with no step/cost/time ceilings → flag: upstream ships
  `cost_limit=3.0` as a DEFAULT; an unbounded loop is a design smell — book
  ceilings before launch, in config, not in hope.
- A failure is caught and dropped silently → flag: upstream law says every
  exception carries its messages into the trajectory; a swallowed error is a
  book gap.
- A template renders a missing variable as empty → flag: StrictUndefined — a
  blank that should have been an error is a silent scope violation.
- Someone proposes mocking a dependency in a test unasked → flag: upstream test
  law (ANTI-GOODHART, third-party validated) — every test must target a real
  point of failure.
- Upstream pins drift (v2 moves, v1 frozen) → re-verify the mirror sha against
  the GitHub API and refresh this skill's verdicts; stale pins are stale
  truths.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Feasibility/decision receipt (route, verdict, basis) | wave CR/worklog row | the operator wave |
| Mirror pin proof | `THIRD-PARTY-NOTICES.md` §6 sha `04d809c` + gate v1.3.0 pin check | skill-library-gate |
| Estate-side doctrine proof | E24 strip-restore + judge v1.15.0 lineage anchor | run-evals + harness-audit |

## Tier & Scope

Tier A guidance. This skill NEVER installs the upstream runtime against paid
model keys, NEVER provisions container sandboxes, and NEVER opens the wallet
(Authority Map: wallet = OWNER only). Scope = agent-loop shape honesty +
doctrine adoption on tools that already exist here.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "run an agent loop" | loop receipt with ceilings (step/cost/time) + explicit exit_status | book row in CR/worklog |
| "why is the trajectory lost" | linear-history check: is the book append-only and saved every step? | receipt |
| "compare mini to our stack" | the doctrine-parallel table with upstream mechanics | table above |

## Communication

- **Bottom line first** — route verdict + what is blocked and why, then the story.
- **Confidence tagging** — 🟢 proven on this box / 🟡 booked pending feasibility /
  🔴 blocked (wallet/possession) — stated as blocked, never skipped silently.

## Related Skills

- **orchestration-ax-operator**: Use when the workload needs declarative
  orchestration or cluster-shaped fan-out. NOT for the agent-loop itself —
  mini is the loop, ax is the cluster above it.
- **fleet-desk-operator**: Use when the Authority Map or tier ladder is needed.
  NOT for loop mechanics.
- **mini-services-engineer**: Use when the loop's actions hit a live
  mini-service. NOT for doctrine questions.
- **applied-ai-patterns-operator**: Use when the question is pattern shapes
  from consult-only (unlicensed) sources. NOT for licensed lineages like this
  one.
