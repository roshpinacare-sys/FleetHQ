'use strict';
/**
 * market-cycle.cjs — Z-64 PULLED-SCHEDULE CYCLE COMPOSER (CR-0039).
 *
 * The operator directive was "how do we take the internal markets AUTOMATICALLY
 * with agent grids" (2026-10-03). CR-0036 landed the hands, CR-0039 the eyes.
 * This desk is the reflex arc that joins them — THIN by law: it spawns the two
 * receipted desks and makes exactly one decision between them. It computes
 * nothing about markets itself and signs nothing itself.
 *
 *   fill-ledger (READ-ONLY, CR-0039) → recycle suggestion
 *     → decideCycle (pure) → market-exec (CR-0036) in DRY_RUN (default)
 *       or LIVE — ONLY when mode LIVE AND the ledger suggests recycle.
 *
 * LAWS (in code):
 *  1. PULLED-SCHEDULE (no daemon): one invocation = one cycle = one canon row.
 *     The cadence driver is the LANE (same law as CR-0033 evo-windows).
 *  2. MODE LAW: MARKET_CYCLE_LIVE=1 is the only path to a LIVE executor child;
 *     even then the child arms only if decideCycle says so. Default cycle runs
 *     the executor DRY (a planning receipt, zero signatures) — the decision and
 *     its reason are always booked either way.
 *  3. CHILD SEPARATION: the desks run as FRESH CHILD PROCESSES with their own
 *     canons (single-writer law per desk); this composer only reads the
 *     fill-ledger's last row and records child exit/stdout tail. It never
 *     writes into a child's canon.
 *  4. EVAL-CONTEXT OFF-SWITCH: MARKET_CYCLE_SKIP_FETCH=1 → both children book
 *     SKIPPED-EVAL-CONTEXT rows and no executor decision is taken (CR-0033
 *     CI-safety law). E29 exercises exactly this path, fresh-process.
 *  5. FAIL-SOFT EXIT, FAIL-LOUD BOOK: child failure is a booked ERROR row, not
 *     a crash; exit 0 always (treasury law). require.main guard (Z-49).
 *  6. SINGLE WRITER: agents/market-cycle.json + .md (last-row summary).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.MARKET_CYCLE_JSON || path.join(ROOT, 'agents', 'market-cycle.json');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');

// pure decision (exported for E29): what does this cycle do?
//   SKIP  = run nothing (eval-context)
//   DRY   = executor in DRY_RUN (planning receipt, zero signatures)
//   LIVE  = executor ARMED (only from LIVE mode + a recycle suggestion)
function decideCycle({ suggestion, mode, skipFetch }) {
  if (skipFetch) return { executorMode: 'SKIP', reason: 'SKIPPED-EVAL-CONTEXT' };
  if (mode === 'LIVE' && suggestion && suggestion.suggested) return { executorMode: 'LIVE', reason: 'RECYCLE-SUGGESTED: ' + suggestion.reasons.join(' · ') };
  if (mode === 'LIVE') return { executorMode: 'SKIP', reason: 'NO-RECYCLE-SUGGESTED (executor run would be a no-op; its STACK-EXISTS law makes it harmless but pointless — booked honestly)' };
  return { executorMode: 'DRY', reason: 'MODE-DRY: planning receipt only, zero signatures' };
}

function lastFillLedgerRow() {
  const p = process.env.FILL_LEDGER_JSON || path.join(ROOT, 'agents', 'fill-ledger.json');
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const rows = Array.isArray(j) ? j : (j.rows || []);
    return rows[rows.length - 1] || null;
  } catch (_) { return null; }
}

function spawnChild(script, extraEnv, timeoutMs = 120000) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'agents', script)], {
    env: { ...process.env, ...extraEnv },
    timeout: timeoutMs, encoding: 'utf8',
  });
  return {
    script, status: r.status, error: r.error ? String(r.error.message).slice(0, 120) : null,
    stdout_tail: ((r.stdout || '').trim().split('\n').slice(-2).join(' | ')).slice(0, 300),
    stderr_tail: ((r.stderr || '').trim().split('\n').slice(-1).join(' | ')).slice(0, 200),
  };
}

function main() {
  const t0 = Date.now();
  const mode = String(process.env.MARKET_CYCLE_LIVE || '') === '1' ? 'LIVE' : 'DRY';
  const skipFetch = String(process.env.MARKET_CYCLE_SKIP_FETCH || '') === '1';
  const row = {
    ts: new Date().toISOString(), mode, skip_fetch: skipFetch || String(process.env.FILL_LEDGER_SKIP_FETCH || '') === '1',
    fill_ledger: null, suggestion: null, decision: null, executor: null, errors: [],
  };
  const canon = (() => { try { const j = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')); return Array.isArray(j) ? j : (j.rows || []); } catch (_) { return []; } })();
  row.run_index = canon.length + 1;

  try {
    // 1. eyes: fill-ledger (read-only; eval-context passthrough when skipping)
    row.fill_ledger = spawnChild('fill-ledger.cjs', skipFetch ? { FILL_LEDGER_SKIP_FETCH: '1' } : {});
    const lr = lastFillLedgerRow();
    row.fill_ledger_row = lr ? { run_index: lr.run_index, new_fills: (lr.new_fills || []).length, realized_sbd: lr.inventory ? +(lr.inventory.realized / 1e6).toFixed(6) : null, recycle: lr.recycle } : null;
    row.suggestion = (lr && lr.recycle) || null;
    // 2. reflex: one decision
    row.decision = decideCycle({ suggestion: row.suggestion, mode, skipFetch: row.skip_fetch });
    // 3. hands: executor child (armed only per decision)
    if (row.decision.executorMode === 'LIVE') {
      row.executor = spawnChild('market-exec.cjs', { MARKET_EXEC_LIVE: '1' }, 180000);
    } else if (row.decision.executorMode === 'DRY') {
      row.executor = spawnChild('market-exec.cjs', { MARKET_EXEC_LIVE: '' }, 120000);
    } else {
      row.executor = { script: 'market-exec.cjs', status: null, stdout_tail: '', stderr_tail: '', skipped: row.decision.reason };
    }
    if (row.executor && row.executor.status !== 0 && row.executor.status != null) {
      row.errors.push(`executor child exit ${row.executor.status}: ${row.executor.stderr_tail || row.executor.stdout_tail}`);
    }
    if (row.fill_ledger && row.fill_ledger.status !== 0 && row.fill_ledger.status != null) {
      row.errors.push(`fill-ledger child exit ${row.fill_ledger.status}: ${row.fill_ledger.stderr_tail || row.fill_ledger.stdout_tail}`);
    }
  } catch (e) {
    row.errors.push(String(e.message || e).slice(0, 200));
  }

  row.duration_ms = Date.now() - t0;
  canon.push(row);
  fs.writeFileSync(OUT_JSON, JSON.stringify(canon, null, 2) + '\n');
  const L = [
    '# market-cycle — pulled-schedule cycle composer (CR-0039)', '',
    `Last cycle: ${row.ts} · mode **${row.mode}**${row.skip_fetch ? ' · SKIPPED-EVAL-CONTEXT' : ''}`,
    `- fill-ledger: ${row.fill_ledger ? `exit ${row.fill_ledger.status} — ${row.fill_ledger.stdout_tail}` : '—'}`,
    `- ledger row: ${row.fill_ledger_row ? `run #${row.fill_ledger_row.run_index}, new fills ${row.fill_ledger_row.new_fills}, realized ${(row.fill_ledger_row.realized_sbd || 0).toFixed(6)} SBD` : '—'}`,
    `- suggestion: ${row.suggestion ? (row.suggestion.suggested ? 'SUGGESTED — ' + row.suggestion.reasons.join(' · ') : 'NO — ' + row.suggestion.reasons.join(' · ')) : '—'}`,
    `- decision: **${row.decision ? row.decision.executorMode : '—'}** — ${row.decision ? row.decision.reason : ''}`,
    `- executor: ${row.executor ? (row.executor.skipped ? `skipped (${row.executor.skipped.slice(0, 60)})` : `exit ${row.executor.status} — ${row.executor.stdout_tail}`) : '—'}`,
    `- errors: ${row.errors.length ? row.errors.join(' ; ') : 'none'}`, '',
    `Cycle history: ${row.run_index} rows.`,
  ];
  fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
  console.log(`[market-cycle] mode=${row.mode} decision=${row.decision ? row.decision.executorMode : '?'} errors=${row.errors.length} in ${row.duration_ms}ms`);
}

if (require.main === module) {
  main(); // sync children; nothing to await — fail-soft by construction
} else {
  module.exports = { decideCycle, OUT_JSON };
}
