#!/usr/bin/env node
/**
 * evo-windows.cjs — scheduled evolution windows over the reef harness evo desk
 * (Z-62, CR-0033).
 *
 * Z-61's CR-0030 open rung was "scheduled evolution windows (pulse evidence
 * surface)". This desk IS that rung: the GEPA-class harness evolution (CR-0030,
 * agents/reef-harness-evo.cjs) measured once per invocation decision, on a
 * cadence, with the outcome booked as evidence the pulse can carry (CR-0033).
 *
 * LAWS BOUND IN:
 *   - PULLED-SCHEDULE (no daemon): each invocation makes exactly ONE decision and
 *     appends exactly ONE row to an append-only history (the STASIS audit-trail
 *     law — history is never rewritten). Nothing lingers between invocations.
 *   - SERVE-WINDOW VIA DESK: the measured batch runs inside the CR-0030 desk's own
 *     serve-window law (shim TEST instance + reef, killed in finally, verified
 *     dead). This desk spawns no server of its own — it verifies the child's leak
 *     check from the child's book and books the verdict.
 *   - PORT-PARTITION: the scheduler passes SHIM_EVO_PORT to the child (default
 *     3052) — the sibling's CR-0031 mcp-host claimed :3041, which is the evo
 *     desk's in-file default. The scheduler owns a collision-free choice; the
 *     proven CR-0030 desk is not touched (second-mover law: adapt at the call
 *     site, never rewrite a receipted artifact).
 *   - VERIFY-ONLY: a challenger win books ADOPTION-PENDING-CR — never adoption.
 *     The pulse surface proposes (PROPOSED-CR disposition), a judged tier-B CR
 *     disposes. The winner prompt stays preserved by the evo desk
 *     (winnerPromptFile) for the judged landing.
 *   - CI-SAFE / OFF-BUDGET: EVO_WINDOWS_SKIP_RUN=1 books a due window
 *     SKIPPED-EVAL-CONTEXT without spawning the child (the eval-harness law);
 *     absent venv/shim source books SKIPPED-NO-DESK-RUNTIME (the CR-0030 desk's
 *     own CI law, mirrored upstream of the spawn).
 *   - CARRY-LAW SHARPENING (CR-0028 family): measured NUMBERS carry, HINTS
 *     expire. The pulse joins the last WINDOW-COMPLETE row regardless of age
 *     (with age_h booked honestly); it is the laya triage hints that expire at
 *     36h, never a measured reward.
 *   - Fail-soft: exit 0 always; every decision class booked honestly.
 *
 * Env:
 *   EVO_WINDOW_MIN_HOURS  cadence (default 20h — one measured window per operator day)
 *   EVO_WINDOW_BUDGET_MS  child time budget (default 2700000 = 45 min)
 *   EVO_SHIM_PORT         SHIM_EVO_PORT passed to the child (default 3052, CR-0031 partition)
 *   EVO_WINDOWS_FORCE     1 → run now (mode FORCED; the honest label stays in the row)
 *   EVO_WINDOWS_SKIP_RUN  1 → never spawn the child (eval/CI contexts)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const AG = __dirname;
const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const log = (m) => console.log(`[evo-windows] ${m}`);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return null; } };

const CADENCE_H = Math.max(0.01, parseFloat(process.env.EVO_WINDOW_MIN_HOURS ?? "20", 10) || 20);
const BUDGET_MS = Math.max(30000, parseInt(process.env.EVO_WINDOW_BUDGET_MS ?? "2700000", 10) || 2700000);
const SHIM_PORT = parseInt(process.env.EVO_SHIM_PORT ?? "3052", 10) || 3052;
const FORCE = /^(1|true|yes)$/i.test(process.env.EVO_WINDOWS_FORCE || "");
const SKIP_RUN = /^(1|true|yes)$/i.test(process.env.EVO_WINDOWS_SKIP_RUN || "");
const VENVPY = process.env.REEF_VENVPY || "/tmp/reef-venv/bin/python";
const SHIM_ENTRY = process.env.SHIM_ENTRY || "/home/z/my-project/mini-services/zai-openai-shim/index.ts";
const EVO_BOOK = path.join(AG, "reef-harness-evo.json");
const WIN_BOOK = path.join(AG, "evo-windows.json");

// ---- white-box core 1: the pulled-schedule decision (eval E27 pins this) ----
// One invocation = one decision. `historyLast` = last history row or null.
// `evoBookFresh` = the evo desk's own book exists with a measured winner inside
// the cadence (bootstrap evidence — a manual CR-0030 run counts as the window
// that happened; double-running it would be redundant measurement, not rigor).
function decide({ force, skipRun, historyLast, seededAt, evoBookFresh, hasDeskRuntime }) {
  if (!hasDeskRuntime && !skipRun) return { kind: "SKIPPED-NO-DESK-RUNTIME", run: false };
  if (force) return { kind: "RUN", run: true, mode: "FORCED" };
  if (skipRun) return { kind: "SKIPPED-EVAL-CONTEXT", run: false };
  const lastAt = historyLast && historyLast.at ? Date.parse(historyLast.at) : null;
  const elapsedH = lastAt ? (Date.now() - lastAt) / 3600000 : null;
  if (historyLast && lastAt && elapsedH < CADENCE_H) {
    // nextDue keys off the last MEASURED/SEEDED evidence, never off skip rows
    // (a skip is a non-event — it must not reschedule the cadence; Z-62 fix)
    const dueBase = seededAt || lastAt;
    return { kind: "SKIPPED-TOO-SOON", run: false, nextDueAt: new Date(dueBase + CADENCE_H * 3600000).toISOString().replace(/\.\d+Z$/, "Z") };
  }
  if (!historyLast) {
    if (evoBookFresh) return { kind: "BOOTSTRAP-SEEDED", run: false };
    return { kind: "RUN", run: true, mode: "FIRST-WINDOW" };
  }
  return { kind: "RUN", run: true, mode: "CADENCE" };
}

// ---- white-box core 2: window outcome classification (eval E27 pins this) ----
// Reads the CHILD's book (the CR-0030 desk book), never invents:
//   - winner label "v1-incumbent"  → INCUMBENT-RETAINED (the incumbent survives
//     its own evolution challenge — evidence, not failure)
//   - any other measured winner    → ADOPTION-PENDING-CR (verify-only: the pulse
//     proposes the tier-B CR; nothing auto-applies)
//   - serve_windows leak check     → PASS only if BOTH windows verified dead
function classifyOutcome(evoBook) {
  if (!evoBook || !evoBook.winner || evoBook.winner.label == null) return { status: "WINDOW-NO-WINNER", incumbentRetained: null, leakCheck: "UNVERIFIED" };
  const sw = evoBook.serve_windows || {};
  const dead = (s) => !!(s && s.verified_dead === true);
  const leakCheck = dead(sw.shim) && dead(sw.reef) ? "PASS" : "LEAK-DETECTED";
  const incumbentRetained = evoBook.winner.label === "v1-incumbent";
  return {
    status: incumbentRetained ? "INCUMBENT-RETAINED" : "ADOPTION-PENDING-CR",
    incumbentRetained, leakCheck,
    winner: String(evoBook.winner.label), meanReward: evoBook.winner.meanReward, meanTurns: evoBook.winner.meanTurns,
    evoBookAt: evoBook.at, rows: Array.isArray(evoBook.rows) ? evoBook.rows.length : null,
  };
}

function main() {
try {
  const prev = readJson(WIN_BOOK);
  const history = prev && Array.isArray(prev.windows) ? prev.windows : [];

  // ---- inputs for the decision ----
  const evoBook = readJson(EVO_BOOK);
  const evoBookAt = evoBook && evoBook.at ? Date.parse(evoBook.at) : null;
  const evoBookFresh = !!(evoBook && evoBook.winner && evoBookAt && (Date.now() - evoBookAt) / 3600000 < CADENCE_H);
  const hasDeskRuntime = fs.existsSync(VENVPY) && fs.existsSync(path.join(AG, "reef", "rung3_guarded_episode.py")) && fs.existsSync(SHIM_ENTRY);

  const d = decide({
    force: FORCE, skipRun: SKIP_RUN, historyLast: history[history.length - 1] || null,
    seededAt: (() => { const s = [...history].reverse().find((r) => r.status === "WINDOW-COMPLETE" || r.status === "BOOTSTRAP-SEEDED"); return s && s.at ? Date.parse(s.at) : null; })(),
    evoBookFresh, hasDeskRuntime,
  });

  // ---- the one row this invocation appends ----
  let row = { at, mode: d.mode || null, status: d.kind, detail: "" };

  if (d.run) {
    const t0 = Date.now();
    log(`window opening (${d.mode}) — spawning the CR-0030 evo desk (budget ${Math.round(BUDGET_MS / 60000)}min, shim test port ${SHIM_PORT}, live :3040 untouched)`);
    const child = spawnSync(process.execPath, [path.join(AG, "reef-harness-evo.cjs")], {
      cwd: AG, timeout: BUDGET_MS, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, SHIM_EVO_PORT: String(SHIM_PORT), REEF_VENVPY: VENVPY, SHIM_ENTRY },
    });
    const dur = Date.now() - t0;
    const childBook = child.status === 0 ? readJson(EVO_BOOK) : null;
    const freshChild = !!(childBook && childBook.at && Date.parse(childBook.at) >= t0 - 2000); // the child's own stamp, not the 31-min-old incumbent book
    if (child.status === null && child.error && /ETIMEDOUT|TIMEOUT/i.test(String(child.error.code || child.error.message || ""))) {
      row = { at, mode: d.mode, status: "WINDOW-RUN-TIMEOUT", detail: `budget ${BUDGET_MS}ms exceeded — booked honestly, no winner claimed`, durationMs: dur };
    } else if (child.status !== 0) {
      row = { at, mode: d.mode, status: "WINDOW-RUN-FAIL", detail: `evo desk exit ${child.status}`, durationMs: dur };
    } else if (!freshChild) {
      row = { at, mode: d.mode, status: "WINDOW-RUN-NO-BOOK", detail: `child exited 0 but its book is absent/stale (at=${childBook ? childBook.at : "none"})`, durationMs: dur };
    } else {
      const oc = classifyOutcome(childBook);
      // [zai-main-1a12d2e9 2026-10-11] status-clobber fix (measured, not assumed):
      // the first measured window (4/4 REWARD-1) booked row.status=INCUMBENT-RETAINED
      // because `...oc` spread AFTER status clobbered "WINDOW-COMPLETE" — so
      // completeCount stayed 0, lastComplete stayed null, and the pulse's carry-law
      // (which finds rows by status === "WINDOW-COMPLETE") could NEVER carry a
      // measured outcome. The informative label survives as `outcome`.
      row = { at, mode: d.mode, durationMs: dur, ...oc, outcome: oc.status, status: "WINDOW-COMPLETE",
        detail: `winner=${oc.winner} meanReward=${oc.meanReward} meanTurns=${oc.meanTurns} leak=${oc.leakCheck} (${Math.round(dur / 1000)}s)` };
      if (oc.leakCheck === "LEAK-DETECTED") log("WARNING: serve-window leak detected in the child book — booked, never silenced");
    }
  } else if (d.kind === "BOOTSTRAP-SEEDED") {
    row.detail = `no prior window in this book; the CR-0030 desk's own measured run (${evoBook.at}, winner=${evoBook.winner && evoBook.winner.label}) seeds the cadence — a manual run counts, double-running it would be redundant measurement`;
    row.evoBookAt = evoBook.at;
    row.winner = evoBook.winner && evoBook.winner.label;
  } else if (d.kind === "SKIPPED-TOO-SOON") {
    row.detail = `last window ${history[history.length - 1].at} is ${Math.round((Date.now() - Date.parse(history[history.length - 1].at)) / 3600000 * 10) / 10}h old; cadence ${CADENCE_H}h`;
    row.nextDueAt = d.nextDueAt;
  } else if (d.kind === "SKIPPED-EVAL-CONTEXT") {
    row.detail = "EVO_WINDOWS_SKIP_RUN=1 — the measured batch is off-budget in eval/CI contexts (the CR-0030 CI law, mirrored upstream of the spawn)";
  } else if (d.kind === "SKIPPED-NO-DESK-RUNTIME") {
    row.detail = `venv=${fs.existsSync(VENVPY)} runner=${fs.existsSync(path.join(AG, "reef", "rung3_guarded_episode.py"))} shim=${fs.existsSync(SHIM_ENTRY)} — honest skip, no invention`;
  }

  history.push(row);
  const lastComplete = [...history].reverse().find((r) => r.status === "WINDOW-COMPLETE") || null;
  // Z-62: nextDueAt keys off the last MEASURED/SEEDED evidence of when the desk last
  // ran — not off skip rows (the first build let every SKIPPED-* row drift the due
  // time forward: a skip is a non-event, it must not reschedule the cadence)
  const seeded = [...history].reverse().find((r) => r.status === "WINDOW-COMPLETE" || r.status === "BOOTSTRAP-SEEDED") || null;
  const nextDueAt = (() => {
    const base = lastComplete || seeded || history[history.length - 1];
    if (!base || !base.at) return null;
    return new Date(Date.parse(base.at) + CADENCE_H * 3600000).toISOString().replace(/\.\d+Z$/, "Z");
  })();

  const book = {
    ok: true, at,
    agent: "evo-windows v1.0.0 (Z-62, CR-0033 — scheduled evolution windows over the CR-0030 guarded-executor evo desk; pulse evidence surface)",
    cadenceHours: CADENCE_H, budgetMs: BUDGET_MS, shimPort: SHIM_PORT, forced: FORCE, skipRun: SKIP_RUN,
    decision: row, decisionKind: row.status,
    windows: history,
    windowCount: history.length,
    completeCount: history.filter((r) => r.status === "WINDOW-COMPLETE").length,
    lastComplete, nextDueAt,
    laws: {
      pulledSchedule: "no daemon — one decision per invocation, one appended row (history never rewritten)",
      serveWindowViaDesk: "the measured batch lives inside the CR-0030 desk's serve-window law; this desk verifies the child's leak check",
      portPartition: `SHIM_EVO_PORT=${SHIM_PORT} owned here — the sibling's CR-0031 mcp-host claimed :3041 (the evo desk's in-file default); adapt at the call site, never rewrite a receipted artifact`,
      verifyOnly: "a challenger win books ADOPTION-PENDING-CR — adoption only via a judged tier-B CR; the pulse proposes, the CR law disposes",
      carryLaw: "measured numbers carry (the pulse joins the last WINDOW-COMPLETE at any age, age_h booked); HINTS expire, numbers don't",
      offBudget: "EVO_WINDOWS_SKIP_RUN=1 → a due window is SKIPPED-EVAL-CONTEXT, no child spawned (eval/CI law)",
    },
    note: "verify-only: this desk never rewrites the runner harness — the winner prompt stays at the child's winnerPromptFile for the judged landing",
  };
  fs.writeFileSync(WIN_BOOK, JSON.stringify(book, null, 2) + "\n");

  const md = [
    `# Scheduled evolution windows — ${at}`,
    ``,
    `CR-0033: the CR-0030 GEPA-class harness evolution runs on a pulled cadence (no daemon); outcomes land here as evidence the pulse carries (verify-only: adoption via judged CR).`,
    ``,
    `- **decision this invocation:** ${row.status}${row.detail ? ` — ${row.detail}` : ""}`,
    `- **cadence:** ${CADENCE_H}h · **next due:** ${nextDueAt || "—"} · **windows:** ${history.length} (${book.completeCount} complete)`,
    ``,
    `| at | mode | status | detail |`,
    `|---|---|---|---|`,
    ...history.slice(-20).map((r) => `| ${r.at} | ${r.mode || "—"} | ${r.status} | ${String(r.detail || "").replace(/\|/g, "/").slice(0, 110)} |`),
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(AG, "evo-windows.md"), md);
  log(`${row.status}${row.nextDueAt ? ` · next due ${row.nextDueAt}` : ""} · windows=${history.length}`);
} catch (e) {
  // fail-soft: even a crashed scheduler must exit 0 and say why
  console.log(`[evo-windows] booked degraded: ${String(e && e.message).slice(0, 120)}`);
}
}
// side-effect-free require (the Z-49/Z-61 lesson — a bare require() must never
// execute the measured batch; the run happens only as a main script)
if (require.main === module) { main(); process.exit(0); }
module.exports = { decide, classifyOutcome, main };
