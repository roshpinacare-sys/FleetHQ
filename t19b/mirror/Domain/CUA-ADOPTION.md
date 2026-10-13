# CUA-ADOPTION — the sovereign capability ladder (trycua/cua study, Task 26)

_Owner directive: "בוא נבין מה יש לנו בידיים וננסים לתת לאוטונומיה הריבונית עוד יכולות ועוד כוח — https://github.com/trycua/cua לדוגמא"._

## What we HAVE in hand (the inventory, measured not narrated)

- **Voice** — broadcast rails on Steem/Hive/Blurt (curation, digests, market briefs; read-back law: the chain speaks last).
- **Money** — economy engine (STASIS-obedient), treasury desks, revenue-census chain-scanner (4848 ops/window), powerdown stream.
- **Eyes** — chain truth-scanners (capability-matrix byte-verifies authority per run), web probes, moment-watch risk feed.
- **Memory** — books (external state primitive), Merkle anchors (steem/EVM/Apex), Zip sealed vault, RESUME-KIT lifecycle.
- **Law** — command-guard (deny-before-execute), judge node (harness-audit 35 checks), 17 evals, STASIS breaker, judged CRs, role-registry (roles-as-data).
- **Convergence** — ONE-BLOC machine map (16/16 measured, drift-catching), workflow-parse gate.
- **NEW this wave: Hands** — `agents/ci-hands.cjs`: the fleet's own actuator on its CI estate. It SEES (16 repos × 30 runs), CLASSIFIES (STARTUP-FAILURE / JOB-STARTUP / STEP-FAILURE), VERDICTS (active-red / recurring / self-healed / history-transient / green), and books PROPOSALS — the Task 25 manual method mechanized, on a schedule, with a full action trajectory.

## What cua taught, mapped honestly to our laws

| cua concept | Our adoption | Status |
|---|---|---|
| "Give agents computers they can use" | The estate IS the computer: git + CI machines + chain rails. ci-hands = the actuator on it. | **REAL (this wave)** |
| Computer-Use 2.0 (one task flows across code, APIs, GUI) | Code + API layers adopted now (desks are code+API). GUI = a rung, not a story. | **REAL for code+API** |
| cua-bench contract (result.json + trajectory.json + summary pass-rate) | ci-hands books `results` + `trajectory` + lane pass-rate in ci-hands.json/md. A claim without a trajectory is not a value (ANTI-GOODHART). | **REAL (this wave)** |
| Keyvault: keys reach a machine only after approval | Tier law: env-only tokens (never printed), owner-only keys stay owner-only, keyless-first floor. | **ALREADY OUR LAW** |
| Agent-ready machines (spacesd: processes/files/screenshots/input at boot) | CI runners boot agent-ready: init.sh gates (syntax → STASIS → guard → FWI → judge) run at session start. | **REAL** |
| Lume VMs / Spaces desktops (macOS/Windows GUI control) | **Not real here.** Needs GUI runner + vision-LLM inference (tier C, operator-unlocked). Booked as a rung below — not claimed as a capability. | **RUNG (locked)** |
| CUA-S1 decision models | Requires an inference rail with vision models — our cognitive-rail is governed; vision rows would be tier C. | **RUNG (locked)** |

## The ladder (each rung states what unlocks it — no theater)

1. **Rung 0 — API hands (REAL, this wave):** ci-hands reads/writes NOTHING, only measures and proposes. Zero deps (Node built-in fetch). Keyless floor: public repos measurable with no credentials.
2. **Rung 1 — org-wide CI vision in CI:** needs an org-read-scoped Actions secret (same owner-gated item as one-bloc's 2/16 reach). Until then CI mode books the honest floor (Domain + Console).
3. **Rung 2 — actuating hands (auto-repair proposals → judged CRs):** the desk books proposals today; auto-OPENING CRs is one flag away but stays operator-unlocked (tier law: no auto-self-modification).
4. **Rung 3 — browser/GUI hands (cua Driver analog):** needs a GUI-capable runner (headless Chromium exists on CI images) + a vision-capable inference rail + tier-C unlock. The law and seat exist; the capability does NOT — booked honestly until it does.
5. **Rung 4 — VM fleet (Lume/Spaces analog):** impossible in this sandbox estate (no Apple Silicon/GUI VMs). Would require operator infrastructure outside the current sandbox. Declared impossible-here, not pretended.

## Receipts this wave

- `agents/ci-hands.cjs` v1.0.0 — first run reached 16/16 repos, 62 lanes measured, **0 active-red** (agrees with Task 25's manual ground truth), 2 startup-failures = the pre-fix recruit.yml history aging out of the window.
- Eval **E17** pins the pure classifiers (classifyRun + laneVerdict) + a black-box fresh-process run (book stamped, honest keyless floor).
- Judge check **#36** (verification subsystem) audits the book on schedule.
- `recruit.yml` runs ci-hands in CI with `github.token` — the lane is on the board.
