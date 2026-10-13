# AGENTS.md — Domain (fleet public home) · חוקי-על לכל סוכן שנוחת כאן

> Adopted Z-35 from the walkinglabs/learn-harness-engineering study (their #1
> CRITICAL: instructions must exist at repo root). Domain is the fleet's public
> home: agents, books, workflows, hub pages. Zero secrets ever live here.
> Task 19: extended into the full LHE harness protocol (startup workflow,
> verification commands, scope rules, end-of-session, state artifacts).

## Startup path (in order)
1. Read `FLEET-NOTE.md` — what this repo is and is not.
2. Read the doctrine canon in the sibling private repo `Defi`: `fleet/AGENTS.md`,
   `fleet/DOCTRINE.md`, `fleet/DOCTRINE-economics.md` (the law you operate under).
3. Read the latest receipts: `Defi/fleet/CLAIMS.md` (public) — never re-do what
   a receipt already closes.
4. Books are the truth: `agents/*.json` are machine books (econ-book,
   money-ledger, ventures, fills-ledger, harness-audit). Read before writing.
   The chain is the truth behind the books (read-back law).

## Working rules
- **Zero secrets in any repo.** Keys arrive as runtime env/vault only, in-memory,
  wiped after run. A secret printed = owned incident + rotation recommendation.
- **verify-then-sign.** No signature without preflight evidence; no claim without
  chain read-back. `CHAIN-RECONCILED` beats any book.
- **Keyless desks are fail-soft, exit 0.** A desk never breaks a CI run; honest
  red in a book beats a crashed workflow.
- **Measured, never estimated.** Oracle data or null. `[object Object]`-class
  concat bugs are the third-time family — coerce with num()/f() on every chain field.
- **Parallel runtimes are real.** `git pull --rebase` before push; conflicts in
  measurement books resolve to the freshest census; never double-run another
  runtime's lane (DELEGATION-SELECTION LAW).
- **Destructive ops are tier-C, mechanically enforced** (Z-38, adopted from
  Dicklesworthstone/destructive_command_guard): `agents/command-guard.cjs` v1.0.0 —
  the governing gate (CR-0002) — classifies commands BEFORE they run:
  whitelist-first (the fleet's `pull --rebase` rebase law is pinned un-blockable
  by eval E7), default-allow for unknown commands, strictest templates on books/
  `agents/`/repo history (`reset --hard`, `push --force`, `rm -rf`, `stash drop`),
  context-aware (a destructive string in grep/echo is DATA, not execution), and
  every decision booked in `command-guard.json` (check #27 + E7-E9 pin it).
  CI executable surfaces are scanned (`scan .github/workflows agents`) — zero
  unbooked DENY is the law. Every lane that pushes or mutates estate state
  passes through it.
- **Evals are runnable expectations, not hopes** (`agents/evals/run-evals.cjs`, Z-36):
  pure functions get white-box evals, desk processes get black-box fresh-process
  evals; a new failure class becomes an eval within one wave of discovery.
  The fleet's real workflow is drawn in `agents/fleet-graph.md` — read it before
  adding a node, and update it when you add one.
- **Detection without containment is theater** (Z-40, adopted from world.emergence.ai
  — their S2 finding: "detection did not ensure containment ... acting on it up to
  46 hours later"). `agents/collapse-drill.cjs` injects four mechanical fault classes
  (registry corruption, guard neutered, book stamps stripped, forbidden rail LIVE)
  into throwaway `git archive HEAD` trees; the fresh-process judge must catch every
  one in the SAME run — receipts prove it (E14 + audit #29 pin it; CI runs it on
  schedule). Content never enters a book or decision without provenance
  (MEMORY-IMMUNITY); disagreement is bookable, never silently conformed
  (ANTI-CONFORMITY); the proof surface is chain state, never observer perception
  (OBSERVER-FLIP).
- **Books must stamp themselves** (`at`/`updated` ISO) — freshness is audited
  (`agents/harness-audit.cjs` runs on schedule; its FAILs are next work, not noise).
- **Role voice is data, not code** (Z-37, adopted from f/prompts.chat): every
  FILLED role's act-prompt lives in `agents/role-prompts.csv` (their CSV
  schema + `${Var:default}` binding), loaded via `agents/role-prompts.cjs`.
  Amending the fleet's collective behavior = a reviewed CSV commit, visible
  in git history — never a silent code edit. Completeness is audited.

## Startup Workflow (LHE harness protocol — before writing code)
1. Run `./init.sh` — syntax-gates the desks and refreshes the audit book when
   the `Defi` canon sibling is checked out (fail-honest note when it is not).
2. Read `feature_list.json` — the fleet features this repo carries, their
   status, dependencies, and evidence. Pick **one feature at a time**.
3. Check `progress.md` (Current State · Current Objective · Recommended Next
   Step) and `session-handoff.md` (Blockers · Files · Next Session) — resume
   from the books alone, no tribal memory.
4. Review recent commits `git log --oneline -5`; if baseline verification is
   failing, repair that first before adding new scope.

## Verification Commands
- `./init.sh` — the standard entrypoint (syntax + audit-book refresh)
- `node agents/harness-audit.cjs` — the fresh-context judge node (fail-soft)
- `node agents/canon-liveness.cjs` — the canon reachability legs (Z-42, CR-0005):
  L1 sibling content · L2 authenticated rail · L3 anonymous-raw standing probe.
  Cross-repo desks name their leg; CANON-DARK is a stop condition, not a vibe.
- `bash /home/z/.fleet-restore/restore.sh check` — local sandbox legs + one-command
  re-clone (Z-42 re-codification; creds live OUTSIDE repos in a 600-perm file,
  never printed, never committed — sandbox resets are a law of nature)
- `node agents/hands-book.cjs` — the hands desk (Z-43, CR-0006): the sovereignty's
- **daily pulse (agents/pulse.cjs, CR-0009)**: the self-improvement loop closed under law — day ledger → typed proposals (PROPOSED-CR / GATED-BLOCKED / DEFERRED-TIER-C / ACCEPTED-TODAY / ROLLED-BACK / BOOKED) → judge+evals gates booked verbatim → settle; verify-only: the pulse proposes, the CR law disposes, nothing auto-applies (reef/SkillClaw Rung 1, Z-48/Z-49).
  execution surfaces PROBED fresh (shell · git rail · browser computer-use ·
  keyless web · vm-stack · inference-rail cross-ref) — every LIVE row carries a
  receipt, ABSENT is an honest answer, tier-C locks are policy and policy beats
  probe. A capability claimed without a receipt is a story (cua-pattern adoption:
  probe-before-trust, permission-at-launch, action ladder)
- `bash -n <script>` / `node --check <script>` — per-change static lint gate
  (full-tree lint/build/type checks run in CI: org-selftests + agent-verify)
- gitleaks + agent-verify run in CI on schedule (16/16 repos, head=0 law)

## Scope rules
- **One feature at a time** — pick exactly one unfinished feature from
  `feature_list.json`, take it to done only when its evidence exists.
- **Stay in scope** — no drive-by rewrites of another desk's files; conflicts
  in measurement books resolve to the freshest census (one-writer law).

## Definition of Done
A change is done only when ALL of the following are true: books updated
honestly, receipts appended (CLAIMS + worklog), verification actually ran
(not "should pass"), commit pushed with rebase-first race handling, and the
next agent/session can resume from the books alone — the repo stays
restartable from this file + `./init.sh`.

## End of Session (before ending, always)
1. Update `progress.md` (state, objective, next step) and `feature_list.json`
   (status + evidence).
2. Record unresolved risks in `session-handoff.md`.
3. Commit with a fact-bearing message; push with `git pull --rebase` first.
4. Leave the repo clean enough for the next session to run `./init.sh`.
