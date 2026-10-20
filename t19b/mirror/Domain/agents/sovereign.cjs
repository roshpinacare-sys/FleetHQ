'use strict';
// measurement-only lane — capital gate N/A (STASIS scope)
/**
 * sovereign.cjs — Z-66 SOVEREIGN DECISION LAYER (CR-0044).
 *
 * The operator directive (2026-10-03, chat 288e97be) transferred the LAST TWO
 * operator-held decisions to sovereignty — "תן לריבונות להחליט החלטות שהשארת לי
 * תעביר לריבונות הכל ... הכל צריך להיפתח ולהתייעל למקסימום ... ריבונות אוטונומית
 * ללא תלות" — and named the gate law in the same breath: the gate must exist BOTH
 * WITHOUT the operator AND WITH the operator ("צריך גם ללא וגם כולל השער שלי").
 *
 * This desk is that transfer, in code:
 *   D1 live-fire  — the sovereign decides WHEN the signed loop fires (per tick,
 *                   from policy + breakers + fuel), instead of a lane waiting on
 *                   a human. market-exec's own laws (DRY default, verify-then-sign,
 *                   caps, band, ADD-ONLY) still bind AT FIRE TIME.
 *   D2 drip-pacing — the sovereign RECEIPTS the fuel posture per policy and
 *                   escalates a recommendation when runway thins. Authority ops
 *                   stay OFF (allow_authority_ops:false) — receipts, never silent
 *                   powerdown surgery.
 *
 * LAWS (in code):
 *  1. DUAL GATE: policy.gate.mode 'sovereign' auto-executes in-policy intents;
 *     the operator overlay is ALWAYS armed — STASIS (halts BEFORE any read),
 *     Tier-E escalation (out-of-policy intent parks in sovereign-pending.json,
 *     never auto-executed), SOVEREIGN_MODE=operator override.
 *  2. STASIS FIRST: the breaker is read before any canon — halt-before-read is
 *     structural (FATE-DEFENSE law #1, same law as census/grid cadence desks).
 *  3. ARMING HONESTY: the vault check is PRESENCE-ONLY — the key material is
 *     never read into memory by this desk, never logged, never echoed. A keyless
 *     runtime is NOT a lie ("DISARMED-NO-KEY" taught us): it books PLAN-DRY
 *     receipts 24/7 and names exactly what arms it.
 *  4. BREAKERS BEFORE HANDS: gap pacing, day caps, daily-loss stop, consecutive-
 *     loss stop, fuel floors — every one returns a reason code, never a silent pass.
 *  5. RECEIPTS: every decision appends to sovereign-decisions.jsonl and advances
 *     sovereign-state.json (daily rollover by UTC date). ESCALATE writes
 *     sovereign-pending.json (the operator mailbox). Nothing is ever deleted.
 *  6. PURE CORE: decideSovereign/dripPacing/applyReceipt are exported for E36;
 *     require.main guard (Z-49) — requiring never runs a tick.
 *  7. FAIL-SOFT EXIT, FAIL-LOUD BOOK (treasury law) — enforced in sovereign-tick.cjs.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POLICY_JSON = process.env.SOVEREIGN_POLICY || path.join(ROOT, 'agents', 'sovereign-policy.json');
const STATE_JSON = process.env.SOVEREIGN_STATE_JSON || path.join(ROOT, 'agents', 'sovereign-state.json');
const DECISIONS_JSONL = process.env.SOVEREIGN_DECISIONS_JSONL || path.join(ROOT, 'agents', 'sovereign-decisions.jsonl');
const PENDING_JSON = process.env.SOVEREIGN_PENDING_JSON || path.join(ROOT, 'agents', 'sovereign-pending.json');
const STASIS_JSON = process.env.STASIS_JSON || path.join(ROOT, 'agents', 'STASIS.json');
const HC_DERIVED = process.env.HC_DERIVED || '/home/z/my-project/.fleet/headcorner-derived.json';

// ── canon readers (all fail-soft, presence-only for secrets) ────────────────
function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_JSON, 'utf8'));
}
function readStasisActive() {
  try { return !!JSON.parse(fs.readFileSync(STASIS_JSON, 'utf8')).active; } catch (_) { return false; }
}
// PRESENCE-ONLY: same shape market-exec.loadActiveWif accepts, but we return a
// boolean and never keep the material (law #3).
function armedCheck(vaultPath) {
  try {
    const j = JSON.parse(fs.readFileSync(vaultPath || HC_DERIVED, 'utf8'));
    const s = j && j.steem;
    const w = s && (typeof s.active === 'string' ? s.active : (s.active && s.active.wif));
    return typeof w === 'string' && w.length >= 40;
  } catch (_) { return false; }
}
// last LIVE broadcast ts from market-exec canon (array or {rows:[...]}) — fail-soft
function lastLiveBroadcastTs(execJsonPath) {
  try {
    const j = JSON.parse(fs.readFileSync(execJsonPath, 'utf8'));
    const rows = Array.isArray(j) ? j : (j.rows || []);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i] && rows[i].mode === 'LIVE' && rows[i].ts) return rows[i].ts;
    }
  } catch (_) { /* honest null */ }
  return null;
}
// liquid numbers from a fill-ledger row: "0.792 STEEM"/"0.078 SBD" string assets
function parseLiquid(ledgerRow) {
  const out = { steem: 0, sbd: 0 };
  const liq = ledgerRow && ledgerRow.liquid;
  if (!liq) return out;
  const num = (v) => { const f = parseFloat(String(v).split(' ')[0]); return isFinite(f) ? f : 0; };
  for (const k of Object.keys(liq)) {
    const s = String(k).toUpperCase();
    if (s.includes('STEEM')) out.steem = num(liq[k]);
    else if (s.includes('SBD')) out.sbd = num(liq[k]);
  }
  if (liq.steem != null && !out.steem) out.steem = num(liq.steem);
  if (liq.sbd != null && !out.sbd) out.sbd = num(liq.sbd);
  return out;
}

// ── state (daily rollover by UTC date) ──────────────────────────────────────
function freshState(now) {
  return {
    date: String(now).slice(0, 10),
    fills_today: 0,
    realized_today_micro: 0,
    decisions_today: 0,
    consecutive_loss_fills: 0,
    last_broadcast_ts: null,
    last_tick_ts: now,
  };
}
function loadState(now) {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_JSON, 'utf8'));
    if (s && s.date === String(now).slice(0, 10)) return s;
    // rollover: consecutive-loss carries across days only if the breaker wanted it to —
    // a new day is a clean book for fills/realized; consecutive-loss persists (the
    // tape did not forget) unless the policy says otherwise.
    const n = freshState(now);
    n.consecutive_loss_fills = typeof s.consecutive_loss_fills === 'number' ? s.consecutive_loss_fills : 0;
    return n;
  } catch (_) { return freshState(now); }
}
function saveState(s) { fs.writeFileSync(STATE_JSON, JSON.stringify(s, null, 2) + '\n'); }
function appendDecision(row) { fs.appendFileSync(DECISIONS_JSONL, JSON.stringify(row) + '\n'); }
function writePending(p) { fs.writeFileSync(PENDING_JSON, JSON.stringify(p, null, 2) + '\n'); }

// ── Z-70 CR-0048: ledger-first day-truth (pure, exported for E39) ───────────
// The ledger row IS the day-book (single source). Z-70 MEASURED DEFECT: the old
// Math.max(state, ledger) fusion swallowed NEGATIVE realized (a losing day read
// 0.000 SBD forever) — which silently DISARMED BREAKER-DAILY-LOSS (the -0.05 SBD
// stop could never fire from ledger truth). Ledger wins when present; state is
// the honest fallback only.
function ledgerDayTruth(state, ledgerRow) {
  const fills = (ledgerRow && typeof ledgerRow.total_fills === 'number') ? ledgerRow.total_fills : null;
  const realized = (ledgerRow && ledgerRow.inventory && typeof ledgerRow.inventory.realized === 'number') ? ledgerRow.inventory.realized : null;
  return {
    fills_today: fills != null ? fills : (state && state.fills_today) || 0,
    realized_today_micro: realized != null ? realized : (state && state.realized_today_micro) || 0,
  };
}

// ── THE decision (pure, exported for E36) ───────────────────────────────────
// Gate order is the law: STASIS → mode → armed → suggestion → gap → day caps →
// loss breakers → fuel floors → size tier → EXECUTE.
function decideSovereign(input) {
  const { policy, stasisActive, armed, suggestion, liquid, state, now, modeOverride, lastBroadcastTs } = input;
  const L = policy.limits;
  const mode = modeOverride || (policy.gate && policy.gate.mode) || 'sovereign';
  const g = (decision, reason, tier) => ({ decision, reason, tier: tier || 'S', gate: mode, at: now });

  if (stasisActive) return g('SKIP', 'STASIS-HALT: breaker active — halted BEFORE any read (FATE-DEFENSE law #1)');
  if (mode === 'operator') {
    return suggestion && suggestion.suggested
      ? g('ESCALATE', 'OPERATOR-GATE: mode is operator — LIVE intent parked in sovereign-pending.json, execution waits for the operator', 'E')
      : g('PLAN-DRY', 'OPERATOR-GATE: mode is operator, no recycle suggestion — planning receipt only');
  }
  if (!armed) return g('PLAN-DRY', 'NOT-ARMED: no signing vault in this runtime — keyless sovereignty books decisions and DRY receipts 24/7 (arm = provide the derived-keys vault / runner secret, presence is checked only)');
  if (!suggestion || !suggestion.suggested) return g('PLAN-DRY', 'NO-RECYCLE-SUGGESTED: the ledger does not ask for hands');

  const last = lastBroadcastTs ? Date.parse(lastBroadcastTs) : 0;
  const gapSec = last ? (Date.parse(now) - last) / 1000 : Infinity;
  if (isFinite(gapSec) && gapSec < L.min_broadcast_gap_sec) {
    return g('PLAN-DRY', `GAP-PACING: ${Math.max(0, Math.ceil(gapSec))}s since last LIVE broadcast < ${L.min_broadcast_gap_sec}s — the hands are paced, not frenzied`);
  }
  if ((state.fills_today || 0) >= L.max_fills_per_day) {
    return g('PLAN-DRY', `DAY-CAPS: fills today ${state.fills_today} >= ${L.max_fills_per_day} — the day is booked, receipts continue`);
  }
  if ((state.decisions_today || 0) >= L.max_decisions_per_day) {
    return g('PLAN-DRY', `DAY-CAPS: decisions today ${state.decisions_today} >= ${L.max_decisions_per_day}`);
  }
  const lossStopMicro = Math.round(L.daily_realized_loss_stop_sbd * 1e6);
  if ((state.realized_today_micro || 0) <= -lossStopMicro) {
    return g('SKIP', `BREAKER-DAILY-LOSS: realized today ${(state.realized_today_micro / 1e6).toFixed(6)} SBD crossed the −${L.daily_realized_loss_stop_sbd} SBD stop — hands off until the next day (receipts continue)`);
  }
  if ((state.consecutive_loss_fills || 0) >= L.max_consecutive_loss_fills) {
    return g('SKIP', `BREAKER-CONSEC-LOSS: ${state.consecutive_loss_fills} consecutive losing fills >= ${L.max_consecutive_loss_fills} — the tape said stop`);
  }
  // BUY-PREMIUM BREAKER (Z-69, CR-0047): the ledger's realized edge is the authority.
  // If the window's buy VWAP exceeds the sell VWAP beyond the policy floor, the hands
  // route DRY (the executor's VWAP-capped plan composes as a receipt, zero signatures)
  // until the ledger heals — measured leak 2026-10-03: buys 0.1022 vs sells 0.1001.
  const V = input.vwap || null;
  const premiumPct = L.max_buy_premium_vs_sell_vwap_pct != null ? L.max_buy_premium_vs_sell_vwap_pct : 0.3;
  if (V && (V.buys || 0) >= 3 && V.buy_vwap != null && V.sell_vwap != null && V.sell_vwap > 0) {
    const premium = (V.buy_vwap - V.sell_vwap) / V.sell_vwap * 100;
    if (premium > premiumPct) {
      return g('PLAN-DRY', `BUY-PREMIUM-BREAKER: ledger edge ${premium.toFixed(4)}% (buy ${V.buy_vwap} > sell ${V.sell_vwap} x ${1 + premiumPct / 100}) over ${V.buys} buys — the hands compose VWAP-capped plans as receipts until the ledger heals; LIVE resumes on a clean window`);
    }
  }
  const liq = liquid || { steem: 0, sbd: 0 };
  if (liq.steem < L.min_liquid_keep_steem && liq.sbd < L.min_liquid_keep_sbd) {
    return g('SKIP', `FUEL-FLOOR: liquid ${(+liq.steem).toFixed(3)} STEEM / ${(+liq.sbd).toFixed(3)} SBD both below keep floors (${L.min_liquid_keep_steem}/${L.min_liquid_keep_sbd}) — sovereignty preserves the seed`);
  }
  if (liq.steem > L.max_tier_s_steem) {
    return g('ESCALATE', `TIER-E-SIZE: liquid ${(+liq.steem).toFixed(3)} STEEM exceeds the sovereign cycle posture ${L.max_tier_s_steem} (the per-level cap of the executor) — parked in sovereign-pending.json; a policy bump is the visible knob`, 'E');
  }
  return g('EXECUTE-LIVE', `IN-POLICY: recycle suggested (${(suggestion.reasons || []).join(' · ')}), breakers green, gap ok, fuel above floors — sovereignty fires the hands (market-exec verify-then-sign + caps still bind at fire time)`);
}

// ── D2: drip pacing (pure, exported for E36) ────────────────────────────────
// drip: { remaining_sp, daily_sp, updated_at } or null (canon absent → honest receipt)
function dripPacing(policy, drip, now) {
  const D = policy.drip || {};
  if (D.allow_authority_ops === false && drip == null) {
    return { decision: 'RECEIPT', tier: 'S', reason: 'NO-DRIP-CANON: drip state absent — posture stays "' + (D.posture || 'steady') + '" by policy; authority ops disabled (allow_authority_ops:false), monitoring continues', at: now };
  }
  const runwayDays = drip && drip.daily_sp > 0 ? drip.remaining_sp / drip.daily_sp : Infinity;
  const reserveDays = (D.reserve_weeks || 2) * 7;
  if (runwayDays >= reserveDays) {
    return { decision: 'STEADY', tier: 'S', reason: `runway ${isFinite(runwayDays) ? Math.round(runwayDays) : '∞'}d >= reserve ${reserveDays}d — drip posture "${D.posture}" holds`, at: now };
  }
  return {
    decision: 'ESCALATE', tier: 'E',
    reason: `RUNWAY-THIN: runway ${Math.round(runwayDays)}d < reserve ${reserveDays}d — RECOMMENDATION parked in sovereign-pending.json: re-pace withdraw_vesting to extend runway (authority ops stay disabled; this is a receipt for the operator, never a silent op)`,
    at: now,
  };
}

// ── state advance (pure, exported for E36) ──────────────────────────────────
function applyReceipt(state, opts) {
  const { now, decision, fillsDelta, realizedDeltaMicro, broadcast } = opts || {};
  let s = { ...state };
  if (s.date !== String(now).slice(0, 10)) s = { ...freshState(now), consecutive_loss_fills: s.consecutive_loss_fills || 0 };
  s.decisions_today = (s.decisions_today || 0) + 1;
  s.last_tick_ts = now;
  s.fills_today = (s.fills_today || 0) + (fillsDelta || 0);
  s.realized_today_micro = (s.realized_today_micro || 0) + (realizedDeltaMicro || 0);
  if (broadcast) s.last_broadcast_ts = now;
  if (decision === 'EXECUTE-LIVE') s.last_broadcast_ts = now; // pacing counts the attempt, not just the success
  return s;
}

module.exports = {
  loadPolicy, readStasisActive, armedCheck, lastLiveBroadcastTs, parseLiquid,
  freshState, loadState, saveState, appendDecision, writePending,
  decideSovereign, dripPacing, applyReceipt, ledgerDayTruth,
  POLICY_JSON, STATE_JSON, DECISIONS_JSONL, PENDING_JSON, STASIS_JSON, HC_DERIVED,
};

if (require.main === module) {
  console.log('sovereign.cjs is a library — run agents/sovereign-tick.cjs for a tick');
}
