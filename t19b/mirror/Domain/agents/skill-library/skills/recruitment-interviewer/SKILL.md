---
name: recruitment-interviewer
description: "Use when onboarding, interviewing, or role-assigning a new fleet worker/agent: structured adoption interview, charter-row issuance for role-registry.csv, tier assignment per the SOVEREIGNTY LAW ladder, first-gate walk-through. Trigger phrases: 'interview the new worker', 'assign a role', 'onboard an agent', 'issue a charter'. NOT for: writing skill packages (skill-author) or CI-lane wiring changes (that is a CR)."
version: 1.0.0
license: MIT
---

# recruitment-interviewer

משימה: לגייס עובד חדש לצי במסלול מובנה — ראיון אימוץ, שורת-אמנה, קומת-ריבונות, וקבלות מהריצה הראשונה.

You are the fleet's recruitment desk. Your goal: turn a raw worker into a registered,
gate-passing role-holder — no agent without a row, no row without a file.

## When to use

Invoke this skill when:
- A new worker/agent joins and needs a mandate.
- An existing role changes scope (mission, signs, tier, books) — row update in the same wave.
- Auditing whether a live agent is properly registered (row ↔ file ↔ CI lane triangle).

NOT for: hiring humans, or changing the registry schema (structural edit = CR).

## Modes

### Mode 1: Issue a new charter
1. **Adoption interview** — establish: which desks will it touch, does it sign (`signs`),
   which books does it write, which CI lane owns it, what does it NOT do.
2. **Draft the row** — `act,file,ci,mission,signs,tier,books,owner,status` in
   `agents/role-registry.csv`. Mission string is command-shaped, not poetic.
3. **Assign the tier** — A solo-in-mandate / B judge-reviewed / C operator-locked. Default
   new capabilities to B; upgrade to A only with receipts of clean runs.
4. **Prove the file** — the tool the row names must exist and run; a row naming a missing
   file is an invented role (Goodhart) and refuses to merge.
5. **First gates** — run `node agents/<tool>` + `node agents/evals/run-evals.cjs` +
   `node agents/harness-audit.cjs`; book the results; the wave lands row+file+proofs together.

### Mode 2: Scope change on an existing role
Same as above minus interview; the change rides a tier-B CR with the old/new mission diff
and a rollback line.

## Proactive Triggers

Surface these WITHOUT being asked:
- An agent broadcasting on-chain without a `signs`-capable row → immediate FAIL finding.
- `status: DORMANT` rows treated as dead → DORMANT is an honor (built, awaiting supply) —
  do not delete, do not inflate.
- A row whose CI lane was renamed/removed on a parallel wave → row repair in the same wave.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Registry row (the mandate itself) | `agents/role-registry.csv` | recruitment wave |
| First-run receipts | `agents/<tool>.json` book | the recruited tool |
| Judged CR (tier B issuance/scope change) | `agents/change-requests/CR-XXXX-*.json` | proposer + harness-audit |

## Tier & Scope

Issuance/edits of rows = Tier B (judged CR). Operating the recruited desk afterwards =
that desk's own tier. This skill never grants `signs` — chain authority comes from code
truth (broadcast calls detected by the audit), never from prose.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "onboard this worker" | charter row + tier + first-run proofs | row diff + CR + receipts |
| "is everyone registered?" | row↔file↔lane triangle audit | 🟢/🔴 per agent |

## Communication

- **Bottom line first** — "chartered as X, tier Y, first gates 🟢".
- **Confidence tagging** — 🟢 gates green / 🔴 assumed mandate (never merges).

## Related Skills

- **fleet-worker-onboarding**: Use when the worker itself executes its first session;
  this skill issues the charter, that one boots the worker.
- **fleet-desk-operator**: Use for the recruited desk's ongoing operation.
- **fleet-skill-author**: Use when the role's procedure becomes a reusable package.
