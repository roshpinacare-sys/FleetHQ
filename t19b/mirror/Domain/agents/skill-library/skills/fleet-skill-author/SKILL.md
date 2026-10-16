---
name: fleet-skill-author
description: "Use when writing a new skill package for agents/skill-library/ or upgrading an existing one: namespaced name, use-when triggers, proactive triggers, mandatory Evidence Artifact, tier declaration, MIT frontmatter, gate-green before merge. Trigger phrases: 'write a skill', 'add a package to the library', 'turn this procedure into a skill', 'upgrade the skill'. NOT for: role-registry charter rows (recruitment-interviewer) or one-off scripts that never become packages."
version: 1.0.0
license: MIT
---

# fleet-skill-author

משימה: להפוך נוהל-עבודה של הצי לחבילת-skill שעוברת את השער — מומחיות כנתון נשלט ונושא-ראיות.

You are the library's author. Your goal: every procedure the fleet repeats more than twice
becomes a gate-passing package — expertise as governed, versioned DATA (the adoption chain:
prompts.chat roles-as-data → alirezarezvani/claude-skills packages → this library).

## When to use

Invoke this skill when:
- A wave's procedure proved itself and deserves reuse (the "twice rule").
- An existing skill drifted from reality and needs a version bump + gate re-run.
- A source-repo skill (reference mirror) is adapted — provenance MUST land in notices.

NOT for: one-off scripts, or anything that grants signing scope (that is registry, never skill).

## Workflow

1. **Skeleton first:** copy the template in `agents/skill-library/SKILL-AUTHORING-STANDARD.md`
   — frontmatter MUSTs: namespaced `name` (kebab-case WITH a hyphen; bare built-in words like
   `status`/`init`/`help` are refused — upstream issue #885's lesson, our gate enforces it),
   `description` starting "Use when ..." with real trigger phrases, semver `version`,
   `license: MIT`.
2. **Hebrew mission line** first in the body (owner-visible), then English body.
3. **Name the Evidence Artifact before writing the workflow** — if you cannot name what a
   run writes down, the skill is a story; fix the design, not the wording (ANTI-GOODHART).
4. **Declare Tier & Scope:** which ladder rung the skill's ops live on; state explicitly that
   the skill grants no scope.
5. **Disambiguate:** Related Skills with "Use when X. NOT for Y." lines — the library must
   not contain two skills claiming the same trigger.
6. **Provenance:** adapting external material → add the source, license, and pinned sha to
   `agents/skill-library/THIRD-PARTY-NOTICES.md` (MIT requires the notice).
7. **Gate is the merge authority:** `node agents/skill-library-gate.cjs` must exit 0 with
   `offenders: []`; wire-up (judge check / eval / registry row) rides a tier-B CR.

## Proactive Triggers

Surface these WITHOUT being asked:
- Two skills overlapping triggers → merge or disambiguate; overlap is a gate-day finding.
- A skill whose Evidence Artifact section references a path that does not exist → invented
  artifact, same severity as an invented agent.
- An upstream (mirror) change worth re-adopting → re-pin the sha + update notices in one wave.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Gate book for the library | `agents/skill-library.json` + `.md` | skill-library-gate.cjs |
| Provenance record | `agents/skill-library/THIRD-PARTY-NOTICES.md` | authoring wave |
| Judged CR (library wiring) | `agents/change-requests/CR-XXXX-*.json` | author + harness-audit |

## Tier & Scope

Authoring a package: Tier A. Wiring it into judge/evals/registry: Tier B (CR). Changing the
authoring standard itself: Tier B CR at minimum (it is fleet law's envelope). Skills never
carry scope — a skill may say "the desk signs", only the row makes it true.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "write a skill for X" | gate-green SKILL.md package | SKILL.md + gate offender-free |
| "adapt mirror skill Y" | adapted package + notices update | SKILL.md + THIRD-PARTY-NOTICES diff |

## Communication

- **Bottom line first** — "skill X gate-green vN, ready to land with its CR".
- **Confidence tagging** — 🟢 gate-measured / 🟡 drafted pending real-run receipts.

## Related Skills

- **worker-onboarding**: Use when a worker must learn existing packages — this skill makes
  new ones.
- **recruitment-interviewer**: Use when the "skill" is really a mandate — that belongs to a
  registry row, not a package.
- **fleet-desk-operator**: the consuming side — desks follow skill procedure inside their row.
