'use strict';
/**
 * sovereign-tick.cjs — Z-66 THE SOVEREIGN TICK (CR-0044).
 *
 * ONE invocation = ONE sovereign decision = receipts. No daemon (CR-0033 law):
 * the cadence driver is the lane/cron; every tick is a fresh child that reads
 * the canon, decides by policy, routes the hands, and books itself.
 *
 *   STASIS (halt-before-read) → measure (local canon) → decideSovereign → route:
 *     EXECUTE-LIVE → market-cycle.cjs  (MARKET_CYCLE_LIVE=1 → market-exec verify-then-sign)
 *     PLAN-DRY     → market-cycle.cjs  (DRY planning receipt, zero signatures)
 *     ESCALATE     → sovereign-pending.json (operator mailbox; nothing executes)
 *     SKIP         → receipt only
 *   → sovereign-decisions.jsonl (append-only) + sovereign-state.json (daily book)
 *
 * ENV:
 *   SOVEREIGN_MODE        'sovereign' (default, from policy) | 'operator' (overlay override)
 *   SOVEREIGN_POLICY / SOVEREIGN_STATE_JSON / SOVEREIGN_DECISIONS_JSONL /
 *   SOVEREIGN_PENDING_JSON / STASIS_JSON / HC_DERIVED          — canon paths (eval sandbox)
 *   FILL_LEDGER_JSON / MARKET_EXEC_JSON / MARKET_CYCLE_JSON     — child canon passthrough
 *   SKIP_FETCH=1           eval-context off-switch → children book SKIPPED rows, zero network
 *   SOVEREIGN_DRIP_JSON    optional drip canon for D2 (absent → honest receipt)
 *
 * LAWS: fresh child per tick · fail-soft exit 0 with fail-loud receipt ·
 * single writer per canon (this desk writes ONLY its own three files) ·
 * require.main guard (Z-49).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const sv = require('./sovereign.cjs');

const ROOT = path.resolve(__dirname, '..');

function lastLedgerRow(p) {
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const rows = Array.isArray(j) ? j : (j.rows || []);
    return rows[rows.length - 1] || null;
  } catch (_) { return null; }
}

function main() {
  const t0 = Date.now();
  const now = new Date().toISOString();
  let policy = null;
  try { policy = sv.loadPolicy(); } catch (e) { policy = { gate: { mode: 'sovereign' }, limits: {}, drip: {}, _load_error: String(e.message).slice(0, 120) }; }

  const tick = {
    ts: now,
    mode: process.env.SOVEREIGN_MODE || (policy.gate && policy.gate.mode) || 'sovereign',
    skip_fetch: String(process.env.SKIP_FETCH || '') === '1',
    stasis: null, decision: null, reason: null, tier: 'S',
    inputs: {}, routed: null, drip: null, errors: [],
  };

  try {
    // 1. STASIS FIRST — halt-before-read is structural (law #2)
    tick.stasis = sv.readStasisActive();
    let suggestion = null, liquid = null, lastBroadcast = null, dripCanon = null, ledger = null;
    if (!tick.stasis) {
      // 2. measure — LOCAL canon only (the eyes cron :17/:47 keeps it fresh; zero
      //    network here means a tick never races the ledger's own writer)
      ledger = lastLedgerRow(process.env.FILL_LEDGER_JSON || path.join(ROOT, 'agents', 'fill-ledger.json'));
      suggestion = (ledger && ledger.recycle) || null;
      liquid = sv.parseLiquid(ledger);
      lastBroadcast = sv.lastLiveBroadcastTs(process.env.MARKET_EXEC_JSON || path.join(ROOT, 'agents', 'market-exec.json'));
      const dripPath = process.env.SOVEREIGN_DRIP_JSON;
      if (dripPath) { try { dripCanon = JSON.parse(fs.readFileSync(dripPath, 'utf8')); } catch (_) { dripCanon = null; } }
    }
    const state = sv.loadState(now);
    const armed = tick.stasis ? false : sv.armedCheck();
    // day-book truth = the LEDGER (single source): fills + realized are the ledger's own
    // since-midnight counters; the state file carries decisions + broadcast pacing only.
    // Z-70 CR-0048: ledger-first via sv.ledgerDayTruth — the old Math.max fusion swallowed
    // NEGATIVE realized (a losing day read 0.000 SBD, silently DISARMING BREAKER-DAILY-LOSS).
    const effState = { ...state, ...sv.ledgerDayTruth(state, ledger) };
    tick.inputs = {
      suggested: !!(suggestion && suggestion.suggested),
      suggestion_reasons: (suggestion && suggestion.reasons) || [],
      liquid: liquid,
      armed,
      stasis: tick.stasis,
      fills_today: effState.fills_today,
      realized_today_sbd: +((effState.realized_today_micro || 0) / 1e6).toFixed(6),
      last_broadcast_ts: state.last_broadcast_ts || lastBroadcast || null,
    };

    // 3. decide (pure core) — breakers read the ledger's day-book truth
    const d = sv.decideSovereign({
      policy, stasisActive: tick.stasis, armed, suggestion, liquid, state: effState, now,
      modeOverride: process.env.SOVEREIGN_MODE || null,
      lastBroadcastTs: state.last_broadcast_ts || lastBroadcast || null,
      vwap: ledger && ledger.vwap ? ledger.vwap : null,
    });
    if (ledger && ledger.vwap) tick.inputs.vwap = ledger.vwap;
    tick.decision = d.decision; tick.reason = d.reason; tick.tier = d.tier;

    // 4. D2 drip pacing receipt (receipts even when D1 skipped — the sovereign answers BOTH keys every tick)
    tick.drip = sv.dripPacing(policy, dripCanon, now);

    // 5. route the hands
    if (d.decision === 'EXECUTE-LIVE' || d.decision === 'PLAN-DRY') {
      const env = { ...(tick.skip_fetch ? { MARKET_CYCLE_SKIP_FETCH: '1' } : {}) };
      if (d.decision === 'EXECUTE-LIVE') env.MARKET_CYCLE_LIVE = '1';
      const r = spawnSync(process.execPath, [path.join(ROOT, 'agents', 'market-cycle.cjs')], {
        env: { ...process.env, ...env }, timeout: 240000, encoding: 'utf8',
      });
      tick.routed = {
        child: 'market-cycle.cjs', env: Object.keys(env).join(',') || 'none',
        status: r.status,
        error: r.error ? String(r.error.message).slice(0, 120) : null,
        stdout_tail: ((r.stdout || '').trim().split('\n').slice(-1).join('')).slice(0, 200),
      };
      if (r.status !== 0 && r.status != null) tick.errors.push(`cycle child exit ${r.status}`);
    } else if (d.decision === 'ESCALATE') {
      sv.writePending({
        protocol: 'SAOS-SOVEREIGN-PENDING/1', at: now, decision: d.decision, tier: d.tier,
        reason: d.reason, gate: tick.mode,
        inputs: tick.inputs, drip: tick.drip,
        operator_note: 'Parked by sovereignty (dual-gate law). Execute by policy bump or by taking the intent manually; nothing here auto-runs.',
      });
      tick.routed = { child: null, env: 'none', status: null, stdout_tail: 'sovereign-pending.json written' };
    } else {
      tick.routed = { child: null, env: 'none', status: null, stdout_tail: '' };
    }

    // 6. book: state advance (decisions + pacing only — day-book truth lives in the ledger)
    const next = sv.applyReceipt(state, { now, decision: d.decision });
    sv.saveState(next);
    sv.appendDecision({
      ts: now, tick: next.decisions_today, decision: d.decision, reason: d.reason,
      tier: d.tier, gate: tick.mode, mode: tick.mode,
      inputs: tick.inputs, routed: tick.routed ? { child: tick.routed.child, status: tick.routed.status, env: tick.routed.env } : null,
      drip: tick.drip ? { decision: tick.drip.decision, tier: tick.drip.tier } : null,
      skip_fetch: tick.skip_fetch, duration_ms: Date.now() - t0,
    });
  } catch (e) {
    tick.errors.push(String(e.message || e).slice(0, 200));
    try { sv.appendDecision({ ts: now, decision: 'ERROR', reason: tick.errors.join(' | '), tier: 'S', gate: tick.mode }); } catch (_) { /* final fail-soft */ }
  }

  tick.duration_ms = Date.now() - t0;
  console.log(`[sovereign-tick] decision=${tick.decision} tier=${tick.tier} drip=${tick.drip ? tick.drip.decision : '?'} errors=${tick.errors.length} in ${tick.duration_ms}ms`);
  console.log(`[sovereign-tick] reason: ${tick.reason}`);
  // fail-soft exit 0 always (treasury law) — the receipt IS the alarm
  process.exit(0);
}

if (require.main === module) main();
else module.exports = { main };
