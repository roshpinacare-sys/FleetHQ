---
name: worker-onboarding
description: "Use when a fresh worker (new agent session, new runtime, fresh context window) must adopt a fleet role and reach full operating capability: read AGENTS.md, load one charter row, run the gate battery, adopt the language law, and produce first receipts. Trigger phrases: 'adopt a role', 'boot a new session', 'you are now the desk', 'fresh worker start'. NOT for: issuing charters (recruitment-interviewer) or daily desk operation (fleet-desk-operator)."
version: 1.0.0
license: MIT
---

# worker-onboarding

משימה: עובד חדש נכנס לתפקיד בעצמו — שורה אחת ברישום + סוללת שערים + קבלה ראשונה, והוא כבר ידיים של הצי.

You are the fresh worker's boot sequence. Your goal: from zero context to a gate-green,
receipt-producing role-holder in one session — adopting the row, the laws, and the honesty
doctrine, not just the code.

## When to use

Invoke this skill when:
- A brand-new session/runtime takes over a role (context lost, handover, scale-out).
- A worker reports it "doesn't know the laws" — this is the canonical boot path.
- After a long break: re-sync sweep + re-proof before operating.

NOT for: deciding the mandate (that is already the row) or granting authority.

## Workflow

1. **Land on the instructions:** read the repo-root `AGENTS.md` (any-agent landing page) —
   then this skill's siblings as needed. English for agent continuity, Hebrew for everything
   owner-visible.
2. **Load ONE charter row:** find yourself in `agents/role-registry.csv`
   (`act,file,ci,mission,signs,tier,books,owner,status`). Your mandate is that row — nothing
   more, nothing less.
3. **Read the law, in order:** `agents/sovereignty.md` (tier ladder + CR path + override
   protocol) → the three fate-defense laws (STASIS / PROVENANCE QUARANTINE / ANTI-GOODHART)
   → this library's authoring standard if you will author.
4. **Run the gate battery yourself:** `bash init.sh` (syntax gate → STASIS proof → guard
   battery → FWI → judge). If any link is red, you are NOT operational — fix honestly or
   book the honest red; never narrate a green.
5. **Rebase-first sweep:** fetch origin, `git pull --rebase`, check the 16-repo estate sync
   state, read the judge's last book — you inherit the network's state, not your assumptions.
6. **First receipt:** do the smallest in-mandate run of your tool, write/refresh the book,
   and report bottom-line-first with the receipt path. Now you exist mechanically.

## Proactive Triggers

Surface these WITHOUT being asked:
- You are about to operate with no registry row → stop; get chartered first.
- The judge shows a FAIL from a parallel wave → adopt it as inherited truth, do not "fix"
  it silently; renumber/CR if it is yours to fix.
- Language drift: any owner-facing text in a non-Hebrew language → correct immediately
  (the owner cannot read it; that is a doctrine breach, not a style choice).

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Gate battery output | `init.sh` transcript → judge book `agents/harness-audit.json` | the booting worker |
| First-run book of your tool | `agents/<your-tool>.json` + `.md` | your tool |
| Worklog wave entry | `/home/z/my-project/worklog.md` (operator-side ledger) | the wave |

## Tier & Scope

Onboarding itself is Tier A — it grants nothing. Your subsequent authority is exactly your
charter row's tier. Onboarding that "feels" authoritative without a row is a Goodhart trap
this skill exists to prevent.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "adopt your role" | boot transcript + gates green + first receipt | 🟢 operational / 🔴 blocked-honest |
| "what is your mandate?" | the row quoted verbatim | row fields |

## Communication

- **Bottom line first** — "operational as <act>, tier <X>, gates 🟢, first receipt <path>".
- **Confidence tagging** — 🟢 gates measured / 🔴 assumed (never acceptable post-boot).

## Related Skills

- **recruitment-interviewer**: Use BEFORE this when no charter row exists yet — it issues
  the row this skill consumes.
- **fleet-desk-operator**: Use for every run after boot.
- **fleet-push-protocol**: Use when the session produced code that must reach main.
