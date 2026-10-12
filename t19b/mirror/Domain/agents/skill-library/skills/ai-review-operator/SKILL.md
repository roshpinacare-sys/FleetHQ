---
name: ai-review-operator
description: "Use when the estate designs or judges an AI code-review surface — reviewer-only separation of powers, authority pre-flight before any push, progressive skill loading, and reaction-gated application, per the OpenReview doctrine. Trigger phrases: 'AI code review', 'review bot on PRs', 'auto-fix the linter', 'who approves the bot's changes'. NOT for: deploying the upstream bot or any paid review infra (wallet/possession = owner only); NOT for security pentest scanning (see security-strix-operator)."
version: 1.0.0
license: MIT
---

# ai-review-operator

משימה: לתכנן ולשפוט משטחי ביקורת-קוד AI בכנות — הסוקר מציע, האדם מכריע; נבדקת סמכות לפני כל דחיפה; כל סירוב נושא סיבה מנומקת.

You are the estate's AI-review-surface operator. Your goal: adopt the
OpenReview doctrine (reviewer-only powers, authority pre-flight, progressive
skill loading) as REFERENCE for any review automation the estate designs,
and run the upstream bot only where feasibility is proven — never hope-based.

**Provenance:** study source vercel-labs/openreview — CONSULT-ONLY reference
(pinned mirror sha `672deb2` at `/home/z/reference-mirrors/openreview`),
evaluation wave Task 34. **License honesty finding:** the upstream README
claims "License: MIT" but NO LICENSE file exists in the repository (repo API
reports license: null) at the pinned sha — the claim is unbacked, so the
source is treated as ALL RIGHTS RESERVED and this package is a HOUSE
adaptation of pattern shapes (ideas restated originally): zero upstream code,
configs, or docs bodies were copied, and NO gate pin is booked (pins =
licensed adoptions only). Notice: `skill-library/THIRD-PARTY-NOTICES.md` §7.

## When to use

Invoke this skill when:
- The estate designs review automation (bot, gate, or wave) that comments on,
  fixes, or pushes code — and someone must decide what the machine may do
  ALONE versus what needs a human verdict.
- An automation is about to push anywhere — the pre-flight law below applies.
- Someone proposes loading whole instruction bodies into a live context —
  the progressive-loading law below applies.

NOT for: wallet or credential operations (see fleet-desk-operator), pentest
scanning (see security-strix-operator), or loop mechanics (see
swe-mini-operator).

## Feasibility Table (decide, do not default)

| Situation | Route | Verdict here |
|---|---|---|
| Adopt the review doctrine on existing estate gates | judge / evals / push-protocol / CR ladder | 🟢 sovereignty-decided — zero cost, proven below |
| Read upstream source as reference | mirror `/home/z/reference-mirrors/openreview` @ `672deb2` | 🟢 keyless, pinned — consult-only, zero-copy |
| Self-host OpenReview itself | Vercel deploy + Sandbox + Workflow + Upstash + GitHub App private key + ANTHROPIC_API_KEY | 🔴 WALLET — paid infra + credentials = owner authority; never auto-provisioned |
| Wired into our own stack as a working bot | would need a model leg + a webhook surface | 🟡 BOOKED CANDIDATE — possible at zero marginal cost with z-ai legs, but only through a future judged CR; nothing silent |

## The OpenReview Doctrine (adopted as estate reference, with the parallel it proves)

| OpenReview pattern | Upstream mechanics | Estate parallel (our law) |
|---|---|---|
| Authority pre-flight | `check-push-access` BEFORE any work: repo archived? installation has write? branch restrictions include the app? — refusal with a NAMED reason, never an assumed canPush | the Authority Map as working code: check authority before acting; every refusal carries its named reason (mini exceptions-carry-messages parallel) |
| Reviewer-only separation | bot posts inline suggestions; 👍/❤️ reaction APPLIES, 👎/😕 skips — the machine proposes, the human disposes | the Jev three-point review-gate parallel (Task 32); desk proposes via CR, owner disposes on wallet/possession tiers |
| Autonomy gradient | auto-push ONLY for mechanical fixes (formatting/lint); everything judgment-shaped = suggestion | mechanical waves (lane books, gate regeneration) run unattended; tier-B+ judgments ride the CR ladder |
| On-demand trigger | reviews run when @mentioned — pulled, not pushed silently | no unsolicited verdicts; every audit output lands in books where it was asked for |
| Uncommitted-changes honesty | `has-uncommitted-changes` checked before commit-and-push | the selective-staging law (Task 31/33 push waves): lane books restored to lane ownership, only the wave's files staged |
| Progressive skill loading | system prompt carries ONLY skill names + descriptions; `loadSkill` fetches the full body on demand; missing frontmatter = loud throw | description-as-router: frontmatter descriptions ARE the routing surface (agentskills.io standard, Task 27); context economy — load bodies on demand, not wholesale |
| Skills lockfile | `skills-lock.json`: per-skill source + sourceType + computedHash — skills as pinned dependencies | sharper than library-level pins; BOOKED CANDIDATE: a hash lockbook for our 11 packages (zero cost) through a future judged CR |
| Durable resumable steps | workflow steps are single-purpose, resumable, cleaned up (`stop-sandbox`) | stateless steps (mini parallel) + STASIS checkpoints (ax parallel) — third lineage agreeing from a third source |

## Honest limits of the upstream (booked, not hidden)

- **License mismatch (first-class):** README says MIT, the file does not
  exist — the exact pattern of Task 32's Hands-On-AI-Engineering. Two
  occurrences make it a NAMED upstream anti-pattern: a license badge is not
  a license. Re-verify on every consult; if a LICENSE file lands, this
  section updates and a pin becomes possible.
- **Dormant:** last push 2026-03-06 (seven months before this evaluation);
  final commit is a CSS tweak; README declares beta — "built as an internal
  project… expect rough edges and breaking changes". Trust the pinned sha,
  never the repo's future.
- **Paid legs everywhere:** Vercel Sandbox/Workflow, Upstash, Claude API key,
  GitHub App private key — every runnable route crosses the wallet line.

## Proactive Triggers

Surface these WITHOUT being asked:
- An automation is about to push or act on a repo → demand the pre-flight:
  authority checked, refusal reasons named, BEFORE any work starts.
- A review bot proposes to auto-apply judgment-shaped changes → flag: the
  autonomy gradient — mechanical fixes may auto-run with receipts; judgment
  rides the CR ladder and human verdicts.
- Someone pastes a whole instruction corpus into a live prompt → flag:
  progressive loading — route by description, load the body on demand.
- Someone cites a repo's README license badge as proof → flag: badge is not
  a license; check the file at the pinned sha (this is the second booked
  occurrence).
- Upstream state drifts (new commit, or a LICENSE file appears) → re-verify
  the pinned sha; stale pins are stale truths.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| License-mismatch finding + consult-only posture | `THIRD-PARTY-NOTICES.md` §7 | this wave |
| Review-automation decision receipt (autonomy gradient, pre-flight basis) | wave CR/worklog row | the operator wave |
| Gate integrity (library stays GREEN with 11 packages, no pin added) | `skill-library.json` / `skill-library.md` | skill-library-gate v1.3.0 |

## Tier & Scope

Tier A guidance. This skill NEVER deploys the upstream bot, NEVER provisions
Vercel/Upstash/paid-model legs, and NEVER touches credentials or the wallet
(Authority Map: wallet = OWNER only). Scope = review-surface design honesty +
doctrine adoption on tools that already exist here.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "design a review bot" | the autonomy gradient + pre-flight plan + refusal-reason list | receipt in CR/worklog |
| "can the bot push this?" | pre-flight verdict: authority checked, named reasons | 🟢/🔴 per check |
| "should suggestions auto-apply?" | the gradient: mechanical auto-with-receipts, judgment human-gated | table above |

## Communication

- **Bottom line first** — route verdict + what is blocked and why, then the story.
- **Confidence tagging** — 🟢 proven on this box / 🟡 booked pending a judged CR /
  🔴 blocked (wallet/possession or unbacked license) — stated as blocked,
  never skipped silently.

## Related Skills

- **applied-ai-patterns-operator**: Use when the question is applied-AI
  pattern shapes from consult-only sources (Jev review gates). NOT for
  review-surface mechanics — this package owns that.
- **swe-mini-operator**: Use when the question is agent-loop shape
  (ceilings, history, exit statuses). NOT for review automation design.
- **security-strix-operator**: Use when the review is a security scan.
  NOT for general PR review doctrine.
- **fleet-desk-operator**: Use when the Authority Map or tier ladder is
  needed. NOT for review mechanics.
