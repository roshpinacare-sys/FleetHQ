---
name: frugal-router-operator
description: "Use when the estate routes AI traffic through a local multi-provider proxy or must decide what deserves a model call at all — frugal fast-paths, strict sliding-window admission, classified failures, egress guards, and persistent correction-to-rule memory per the free-claude-code + Graft doctrine. Trigger phrases: 'route through a proxy', 'we are burning tokens on nothing', 'the provider is rate-limiting us', 'is this proxy safe', 'the agent keeps forgetting my corrections'. NOT for: supplying provider API keys (wallet/possession = owner only); NOT for agent-loop shape (see swe-mini-operator); NOT for declarative cluster orchestration (see orchestration-ax-operator)."
version: 1.1.0
license: MIT
---

# frugal-router-operator

משימה: לנהל ניתוב AI מקומי בחסכוניות ובכנות — לא לבזבז קריאת מודל על עבודה מכנית, לאכוף קיבולת עם ערבויות מפורשות, לסווג כישלונות כך שכל אחד נושא את התרופה שלו, ולשמור על גבולות יציאה כמו על הכיס.

You are the estate's local-routing-proxy operator. Your goal: adopt the
free-claude-code (FCC) doctrine — token frugality, formal capacity guarantees,
classified failures, and network-edge trust boundaries — as REFERENCE for
every routing/proxy layer the estate builds or reviews, and never confuse
"free tokens" with "the desk may open the wallet".

**Provenance:** study source Alishahryar1/free-claude-code (AGPL-3.0-only,
verified IN-FILE at the pinned mirror: `LICENSE` 34,108 bytes, standard AGPL
text with `SPDX-License-Identifier: AGPL-3.0-only`, "Copyright (c) 2026 Ali
Khokhar"; the repo API reports NOASSERTION — a false negative this estate
overrode by reading the file, per the Task 33 license-honesty rule) — pinned
mirror sha `03aca36` at `/home/z/reference-mirrors/free-claude-code` —
evaluation + adoption wave Task 35. Second study source: trailhq/Graft (MIT,
verified IN-FILE, "Copyright (c) 2026 Context Graph Engine contributors"),
pinned mirror sha `fe30ead` at `/home/z/reference-mirrors/Graft` — Task 36
five-repo sweep (the repo MOVED org NanoNets→trailhq; pin the current
name). Both are HOUSE adaptations: zero upstream code or docs bodies were
copied. Notices: `skill-library/THIRD-PARTY-NOTICES.md` §8 (FCC, AGPL
copyleft boundary) and §9 (Graft, MIT).

## When to use

Invoke this skill when:
- The estate builds or reviews a proxy/router in front of model providers and
  must decide: what is answered mechanically, what is admitted, what fails how.
- Token spend is questioned ("why is a model call happening here?") — the
  doctrine here names the law: never spend a model call on mechanical work.
- A provider integration's compliance is questioned (ToS, license, trust
  boundary) — removal and refusal are features, not failures.

NOT for: chain or wallet operations (see fleet-desk-operator), agent-loop
shape/history law (see swe-mini-operator), declarative orchestration (see
orchestration-ax-operator).

## Feasibility Table (decide, do not default)

| Situation | Route | Verdict here |
|---|---|---|
| Adopt the FCC doctrine on estate gates/books/proxies | doctrine tables below + triggers | 🟢 sovereignty-decided — zero cost, proven below |
| Read upstream source as reference | mirror `/home/z/reference-mirrors/free-claude-code` @ `03aca36` | 🟢 keyless, pinned, AGPL-3.0-only verified in-file |
| Install + run FCC itself (local proxy) | `fcc-server` + user-supplied provider keys (NVIDIA NIM free tier etc.) | 🟡 CONSULT — provider keys = credentials = possession = OWNER authority; also redundant here (desk model leg = z-ai SDK); never auto-booked |
| Copy upstream code into an estate repo | any incorporation of FCC Python | 🔴 WALLET+LICENSE — AGPL-3.0-only: code-level incorporation triggers §13 network-source obligations estate-wide; the standing estate rule is ZERO-COPY doctrine adoption; incorporation requires an owner-gated license decision |
| 59-provider free-tier catalog as "free compute" | free tiers controlled by each provider | 🟡 CLAIM — "1.3B+ free tokens/month" is an UPSTREAM claim; free-tier limits are provider-controlled and may change; booked as claim, not desk-verified fact |

## The FCC Doctrine (adopted as estate reference, with the parallel it proves)

| FCC pattern | Upstream mechanics (verified in mirror @ `03aca36`) | Estate parallel (our law) |
|---|---|---|
| Never spend a model call on mechanical work | `api/optimization_handlers.py`: quota probes, command-prefix detection, title generation, suggestion mode, filepath extraction are answered LOCALLY with synthetic `MessagesResponse` — no provider call; RTK filters terminal output ("up to 90% fewer terminal-output tokens") | gates/evals/judge/init.sh are mechanical, never LLM-called; a design smell is ANY model call a local heuristic could answer — flag it on sight |
| Formal capacity guarantee | `core/rate_limit.py` `StrictSlidingWindowLimiter`: "at most `rate_limit` acquisitions in any interval of length `rate_window`" — stated in the docstring, enforced by the deque+lock | single-writer lane books: the guarantee is stated and mechanically enforced, not aspirational |
| Admission independent of client lifetime | `providers/admission_policy.py` + `admission_registry.py`: validated dataclass (rate/window/concurrency, `__post_init__` loud on bad values), ONE protection budget per configured provider — one provider's exhaustion cannot starve the others | per-lane budgets in dispatch waves; a stuck lane never consumes another lane's quota |
| Classified failures with named remedies | `providers/failure_policy.py`: auth/billing/rate-limit/overload/context-window/invalid-request each carry a distinct, actionable message ("Provider authentication failed. Check API key."; "Provider requires payment... Add credits.") | named refusal reasons (ai-review-operator parallel); a FAIL state names its kind and its remedy, never a bare errno |
| Recovery is authorized, never silent | `providers/request_recovery.py` + `stream_recovery.py` + `history_replay.py`: corrections authorized within one execution and public stream; retry bodies replayed from history | exceptions-carry-messages (mini parallel); every recovery is booked, bounded, and visible |
| SSRF egress guard with DNS-rebinding pinning | `runtime/web_tools/egress.py`: scheme allowlist, host resolution validation, and connect PINNED to the exact `getaddrinfo` results so DNS cannot rebind between resolve and connect | trust boundaries at the network edge (gateway parallel: relative paths only, port rewrite via `XTransformPort` only); validate, then pin, then connect |
| Reviewable installers | README: "You can review the installers before running them" — supply-chain honesty as a feature | secret-scan before every push; no curl-pipe-bash without reading the script first |
| Exact pins over ranges | `pyproject.toml`: `requires-python ==3.14.7`, `github-copilot-sdk==1.0.14` — exact equality where drift hurts | quad-pinned lineage shas; pins are re-verified against the API, stale pins are stale truths |
| Harness capabilities preserved | README: "Agent capabilities stay intact — stream responses, use tools, preserve native interleaved thinking"; route at the protocol boundary, never degrade the client | ONE-BLOC: one estate, many desks — routing/normalization must never strip native capability |
| ToS-friendliness as enforced design | README claim: "FCC follows provider terms and removes integrations if they stop being allowed" (booked as upstream claim; the admission/policy plumbing shows enforcement intent) | license honesty precedent (Task 32 consult-only; Task 34 ALL RIGHTS RESERVED): compliance removal is a feature — an integration that loses its permit loses its place |
| Hook over note (Graft) | "The ones that can't break get a hook that blocks it, not a note it ignores" — corrections that must never repeat become enforced hooks; prose memory is maintained separately (src/upkeep.ts manages CLAUDE.md/AGENTS.md) | the estate law, independently re-derived at scale: a rule not enforced in code is not a rule — a note is a wish, a hook is a law (gate/evals/judge are the hooks) |
| Correction → persistent rule (Graft) | "Every correction you make becomes a rule your agent keeps" — session corrections fold back into managed memory instead of evaporating | every owner correction lands in DOCTRINE/worklog/skill prose the same wave — a correction that evaporated was never received |
| Blast radius before action (Graft) | src/blast: diff → owners → rendered impact (who is touched by this change) before proceeding | rebase-first + one-bloc: measure what the change touches BEFORE pushing; push receipts name the blast radius |

## Honest limits of the upstream (booked, not hidden)

- **License is AGPL-3.0-only, not MIT**: study/reference/pin are fine (this
  wave copied nothing), but any CODE incorporation would impose AGPL
  obligations including the §13 network-service source offer. The estate's
  standing rule: zero-copy doctrine adoption only; incorporation = owner-gated
  license decision. This is the first non-permissive lineage the gate pins —
  the pin certifies STUDY PROVENANCE, not redistribution permission.
- **API metadata mismatch**: GitHub reports license `NOASSERTION`/"Other" —
  overridden by in-file verification (Task 33 rule: the file is the truth).
- **"59 providers / 1.3B+ free tokens / ToS friendly"** are upstream headline
  claims; provider free tiers are provider-controlled and may change without
  notice. Desk-verified facts: the code mechanics in the doctrine table above.
- **Model failover ("automatically tries your next configured model")** is a
  README headline claim; the mirror shows the supporting machinery
  (`request_recovery`, `stream_recovery`, classified failures) — the
  end-to-end behavior was not executed here (no provider keys in desk hands).
- Size: 392 Python files / 67,669 LOC — a substantial dependency surface
  (`uv.lock` 413 KB); the desk ran NO installs; the mirror is read-only
  reference outside the 16-repo estate.
- main HEAD `03aca36` is 2026-10-02 while pushed_at is 2026-10-03 — non-main
  pushes exist; trust the pinned sha, not the repo's pulse.

## Proactive Triggers

Surface these WITHOUT being asked:
- A model call is proposed for quota checks, title generation, prefix/file
  detection, or any mechanical classification → flag: FCC answers these
  locally with synthetic responses; spending a model call there is a design
  smell — route it through a local heuristic first.
- A proxy/router launches with no stated rate/concurrency guarantee → flag:
  upstream states its sliding-window guarantee in the docstring; an unstated
  guarantee is an unenforced one (a rule not in code is not a rule).
- One provider's failure can starve other providers' traffic → flag: one
  protection budget per provider (upstream admission registry) — isolation is
  the design, not an afterthought.
- An error surfaces as a bare status code or swallowed exception → flag:
  classified failures with named remedies; every failure carries its kind and
  its cure.
- A web-fetch path resolves DNS then connects without pinning → flag: SSRF +
  DNS-rebinding guard (validate → pin → connect); an unpinned connect is a
  rebind waiting to happen.
- Someone proposes copying FCC Python into an estate repo → flag: AGPL-3.0-only
  copyleft boundary; zero-copy doctrine adoption only; incorporation is an
  owner-gated license decision.
- Upstream pin drifts → re-verify the mirror sha against the GitHub API and
  refresh this skill's verdicts; stale pins are stale truths.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Feasibility/decision receipt (route, verdict, basis) | wave CR/worklog row | the operator wave |
| Mirror pin proof | `THIRD-PARTY-NOTICES.md` §8 sha `03aca36` + gate v1.4.0 pin check | skill-library-gate |
| Estate-side doctrine proof | E25 strip-restore + judge v1.16.0 lineage anchor | run-evals + harness-audit |

## Tier & Scope

Tier A guidance. This skill NEVER installs the upstream runtime, NEVER
provisions provider API keys, NEVER copies AGPL code into estate repos, and
NEVER opens the wallet (Authority Map: wallet = OWNER only). Scope = routing
frugality + admission/failure/egress doctrine on tools that already exist
here.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "should this be a model call?" | mechanical-work test: local heuristic or booked model call, with the smell named if mechanical | receipt |
| "review this proxy design" | admission/failure/egress checklist against the doctrine table | table |
| "is this provider integration compliant?" | ToS/license/egress verdict with named refusal reasons | receipt |

## Communication

- **Bottom line first** — route verdict + what is blocked and why, then the story.
- **Confidence tagging** — 🟢 proven on this box / 🟡 booked pending feasibility /
  🔴 blocked (wallet/possession/license) — stated as blocked, never skipped silently.

## Related Skills

- **swe-mini-operator**: Use when the question is agent-loop shape, history
  law, or hard limits. NOT for the routing/proxy layer between loop and
  providers — this skill owns that boundary.
- **ai-review-operator**: Use when the boundary work is authority pre-flight
  and named refusals at review time. NOT for token frugality or provider
  admission — this skill owns those.
- **codebase-graph-operator**: Use when the frugality question is code
  exploration (index-first vs file-wandering). NOT for provider routing.
- **fleet-desk-operator**: Use when the Authority Map or tier ladder is needed.
  NOT for routing mechanics.
- **orchestration-ax-operator**: Use when the workload needs declarative
  cluster fan-out above the router. NOT for the router itself.
- **mini-services-engineer**: Use when the router is implemented as a
  mini-service. NOT for doctrine questions.
