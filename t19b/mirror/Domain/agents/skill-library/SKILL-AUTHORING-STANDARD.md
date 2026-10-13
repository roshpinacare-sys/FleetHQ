# Skill Authoring Standard — the fleet's DNA for portable skill packages

> **Adoption lineage (Task 27):** adapted from **alirezarezvani/claude-skills** (MIT license,
> pinned mirror sha `19392f7a`, 27.3k stars) — their `SKILL-AUTHORING-STANDARD.md` is the skeleton.
> House hardening layered on top: **Evidence Artifact mandatory** (ANTI-GOODHART law),
> **tier declaration** (SOVEREIGNTY LAW ladder), **no silent scope** (signing scope lives in
> `role-registry.csv`, never inside a skill). Provenance: `THIRD-PARTY-NOTICES.md`.
> A rule that is not enforced in code is not a rule — `agents/skill-library-gate.cjs` enforces
> every MUST below, and eval E19 pins the predicate in a fresh process.

## SKILL.md Template (the MUSTs are gate-enforced)

```markdown
---
name: namespaced-skill-name   # MUST: kebab-case, contains a hyphen, NEVER a bare built-in
                              # command word (status, review, init, resume, config, help, ...).
                              # Bare words shadow built-ins for every installer — the source
                              # repo's issue #885 lesson; the gate refuses them.
description: "Use when ...    # MUST: >= 60 chars, starts the trigger sentence with 'Use when',
list concrete trigger phrases users/agents might say, and name the related skills for disambiguation."
version: 1.0.0                # MUST: semver
license: MIT                  # MUST
---

# Skill Name

משימה בעברית בשורה אחת (the mission, owner-visible), then English body for agent continuity.

You are an expert in [domain]. Your goal is [specific outcome for the fleet].

## When to use                       # MUST section (gate-checked)
Invoke this skill when:
- [trigger condition 1]
- [trigger condition 2]
NOT for [disambiguation boundary].

## Modes                             # when the skill has >1 shape of work
### Mode 1: [Build from scratch] ...
### Mode 2: [Optimize existing] ...

## Workflow                          # action-oriented steps, not a textbook
1. [step — command-shaped where possible]
2. ...

## Proactive Triggers                # MUST section (gate-checked)
Surface these WITHOUT being asked:
- [specific condition → what to flag]

## Evidence Artifact                 # MUST section (house law — gate-checked)
Every run of this skill books a named artifact. A claim without an artifact is not a value
(ANTI-GOODHART). | Artifact | Path | Written by |
|---|---|---|

## Tier & Scope                      # house law
Which SOVEREIGNTY LAW ladder this skill's operations live on (A SOLO / B JUDGE-REVIEW /
C WALLET-OR-POSSESSION-LOCK). A skill NEVER grants signing scope — scope is a
`role-registry.csv` fact. Tier C exists ONLY for the two lock domains the Authority Map
(fleet-desk-operator v1.1.0, owner-confirmed 2026-10-03) reserves: the WALLET (spend,
paid keys, credits — owner's sole authority) and owner-held POSSESSIONS (secrets/keys
only the owner can create). Everything else is sovereignty-decided — a skill that
defers a non-wallet decision to the owner violates the Authority Map.

## Output Artifacts                  # MUST section (gate-checked)
| When you ask for... | You get... | Format |

## Communication
- **Bottom line first** — answer before explanation
- **What + Why + How** — every finding carries all three
- **Confidence tagging** — 🟢 verified / 🟡 medium / 🔴 assumed

## Related Skills                    # MUST section (gate-checked)
- **skill-name**: Use when [scenario]. NOT for [disambiguation].
```

## The House Patterns (beyond the source standard)

1. **Evidence before prose.** The source repo says "never sign off on prose alone — attach the
   tool outputs". We harden it: every skill NAMES its evidence artifact up front. If the artifact
   cannot be written, the skill run failed — say so honestly.
2. **No silent scope.** Skills teach procedure; they never widen authority. Anything that signs,
   spends, or broadcasts is a registry fact, not a skill fact.
3. **Tools are the truth source.** Prefer a deterministic script over narrative instructions;
   the source repo ships 700+ stdlib-only tools — we adopt the same shape (zero-dep, exit-code
   honest, books json+md).
4. **Renumbering, not shadowing.** When a parallel wave lands first on main, the latecomer
   renumbers visibly (E17→E19 style) instead of overwriting — parallel convergence is the
   estate's normal mode.
5. **Bilingual header.** One Hebrew mission line (owner-visible) + English body (agent
   continuity) — the language law applies to what the owner reads, not to what the agents run.

## Versioning & Change Path

- New skill: add `skills/<namespaced-name>/SKILL.md`, run the gate, land in a wave with
  receipts. Tier B for wiring (judge check / eval / registry row) — file a CR per SOVEREIGNTY LAW.
- Edit of an existing skill: bump `version`, run the gate. Structural standard edits: CR.
- The gate is the merge authority: `node agents/skill-library-gate.cjs` must exit 0 with
  `offenders: []` before any library change is pushed.
