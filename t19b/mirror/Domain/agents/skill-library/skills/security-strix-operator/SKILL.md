---
name: security-strix-operator
description: "Use when the estate needs an offensive-security audit of its OWN assets (the 16-repo estate, deployed apps, own APIs): operate the usestrix/strix autonomous pentest tool against authorized targets only, read its findings honestly (exit-code semantics, budget-wrap caveats, SARIF + PoC artifacts), and pick OSS-CLI vs cloud per real feasibility. Trigger phrases: 'pentest the estate', 'security scan Domain', 'run strix', 'audit our apps for vulnerabilities'. NOT for: scanning anything we do not own or are not authorized to test — the authorization boundary is absolute; NOT for authoring skills (see fleet-skill-author)."
version: 1.0.0
license: MIT
---

# security-strix-operator

משימה: להפעיל את כלי ה-pentest האוטונומי usestrix/strix על נכסים מורשים שלנו בלבד — כנות מלאה בכיסוי, בעלויות ובגבולות.

You are the estate's security-scan operator. Your goal: run Strix-class autonomous
pentesting against AUTHORIZED estate assets only, read the findings with their honest
caveats, and never let a tool label substitute for verification.

**Provenance:** study source usestrix/strix (Apache-2.0, pinned mirror sha 99c0711 at
`/home/z/reference-mirrors/strix`) — evaluation wave Task 28, adoption wave Task 29.
This package is a HOUSE adaptation: zero upstream SKILL.md bodies were copied; the
structural ideas (honest exit codes, decision tables, digest-bound approvals) are
referenced, and the 9 upstream consumer skills live in the mirror under `skills/`.
Apache-2.0 notice: `skill-library/THIRD-PARTY-NOTICES.md` §3.

## When to use

Invoke this skill when:
- The estate asks for a security audit of its own code or deployed surfaces.
- A Strix run finished and its findings/costs must be read honestly (a `0` exit is
  NOT full coverage — budget wrap-up is documented, check `run.json`).
- Deciding whether a scan route is even runnable here (feasibility, not hope).

NOT for: scanning third-party assets without written authorization (absolute refusal),
chain debugging (see desk-operator), or wallet decisions (cloud credits = owner only).

## The Authorization Boundary (absolute)

- Targets: the 16-repo estate and surfaces we own or are explicitly authorized to test.
- Before any scan: name the target and the authorization basis in the run receipt.
- The tool's own guardrail is the estate's law: "Only scan targets the user is
  authorized to test."

## Feasibility Table (decide, do not default — mirrors upstream's honest table)

| Situation | Route | Verdict here |
|---|---|---|
| Sandbox local run | OSS CLI (Docker sandbox, BYO LLM key) | 🔴 BLOCKED — this sandbox has NO Docker (verified Task 28: `which docker` empty); book honestly, do not fake |
| Strix Cloud managed scan | owner account + credits | 🔴 WALLET — owner authority per the Authority Map; never auto-opened |
| Another machine with Docker, our assets | OSS CLI | 🟢 sovereignty-decided — run inside the authorization boundary |
| Findings review from any past run | local | 🟢 read `run.json` + `vulnerabilities/*.md`, verify PoCs before believing |

## Reading a run honestly (upstream's own semantics, adopted)

- Exit codes: `0` = clean **in what was analyzed** (a budget/turn wrap-up still exits 0 —
  check `run.json` status + `llm_usage.cost` vs `--max-budget`), `1` = fatal, `2` = findings.
- Artifacts: `penetration_test_report.md`, `vulnerabilities/*.md` (one PoC per finding),
  `vulnerabilities.json/csv`, `findings.sarif` (SARIF 2.1.0), `run.json`.
- A finding is not a truth until its PoC reproduces; a clean exit is not a proof of
  coverage. Both directions get verified — MEASURABLE→DASHBOARD, no prose sign-off.

## Proactive Triggers

Surface these WITHOUT being asked:
- Someone proposes pointing the scanner at a target outside the estate → refuse + book
  the refusal; the boundary is not a judgment call.
- A scan receipt shows budget-wrap (`status: stopped` or cost ≈ cap) while the report
  claims coverage → flag the gap explicitly in the books.
- Feasibility drift — Docker appears in a future sandbox or the owner opens a cloud
  account → re-run the feasibility table and update this skill's verdicts, do not
  carry stale 🔴 rows forward silently.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Scan decision receipt (target, authorization basis, route, verdict) | `agents/skill-library/skills/security-strix-operator/` book row in the wave's CR/worklog | the operator wave |
| Strix run artifacts (when a run is possible) | `strix_runs/<run>/run.json` + `findings.sarif` + per-finding PoC md | the tool |
| Mirror pin proof | `THIRD-PARTY-NOTICES.md` §3 sha `99c0711` + gate v1.1.0 pin check | skill-library-gate |

## Tier & Scope

Tier A guidance. This skill NEVER grants scan authority over non-estate targets and
NEVER opens the wallet (cloud credits are owner authority per the Authority Map in
fleet-desk-operator). Scope = authorization boundary + honesty rules above.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "pentest the estate" | feasibility verdict + route decision + authorization row | receipt in books/worklog |
| "read the scan" | verified findings with PoC status + coverage caveats | findings table |
| "can we run strix here?" | the feasibility table, re-checked live | 🟢/🔴 per route |

## Communication

- **Bottom line first** — route verdict + what is blocked and why, then the story.
- **Confidence tagging** — 🟢 run artifacts verified / 🟡 booked pending feasibility /
  🔴 blocked (Docker / wallet) — stated as blocked, never skipped silently.

## Related Skills

- **fleet-desk-operator**: Use when the scan wave needs the Authority Map or tier ladder.
  NOT for running the scan itself.
- **fleet-push-protocol**: Use when scan-driven fixes must reach main. NOT for books.
- **fleet-skill-author**: Use when this procedure itself changes structurally.
