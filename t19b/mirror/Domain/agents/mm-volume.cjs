#!/usr/bin/env node
/* MM-VOLUME (CR-0058..CR-0061, fleet Rungs 28-31 — THE VOLUME ENGINE + THE SHARE LADDER
 * + THE CALIBRATED ENGINE + THE MEASURED BINDING & THE VENUE EXPANSION)
 * — the fleet-scale market-making planner: how the fleet becomes the volume leader
 * of the venues it stands on, PROVABLY, before a single owner-gated sat moves.
 *
 * Owner directive (2026-10-04): "אני רוצה שנהיה השחקנים של market maker וגריד הכי
 * גדולים ומרווחים על הרשתות... כמות מאוד גדולה של עסקאות עושה שוק... גם חלק מסחר
 * בינינו זה טוב... ניקח גם את העמלות של המשתמשים האחרים" — maximum provable
 * volume, fleet-partitioned ladders, bounded internal flow, fee-aware profitability,
 * and (v1.1.0) the SHARE LADDER: the measured 24h pond from the chain itself vs the
 * fleet's projected volume — "the BIGGEST" is a measured share, not a boast, plus
 * REALIZED metering (fill-ledger fills vs projection — the accuracy number).
 *
 * The ENGINEERING QUERIES this desk answers (asked and answered, in code):
 *  Q1 WHERE does provable volume live?  → the chains-side internal markets
 *     (SBD/STEEM, HBD/HIVE) charge ZERO trade fee (fee-doctrine law) and carry a
 *     measured tape — volume there costs nothing per trade and captures the spread.
 *  Q2 WHAT bounds profitability? → maker edge = captured spread − venue fees;
 *     BUY-EDGE law (no buy above realized sell VWAP − 0.3%); spacing floor keeps
 *     rungs wider than the round-trip cost.
 *  Q3 HOW does a fleet share one ladder? → deterministic partition: rung j goes to
 *     account (j mod N) — disjoint, complete cover, no stacking across accounts.
 *  Q4 WHAT about trading between our own soldiers? → internal flow is REAL volume
 *     at ZERO fee on the internal markets and it is BOUNDED (cap % of projected
 *     volume), LABELED INTERNAL-FLOW in every row, and EXCLUDED from the realized
 *     VWAP/edge books (the poison guard: internal fills must never teach the fleet
 *     a fake edge).
 *  Q5 HOW do we take other users' fees? → on chain internal markets fees are zero —
 *     we capture the SPREAD from their flow; on OUR OWN venue (saos-dex-kernel,
 *     30 bps, 30% treasury cut) their fees route to the treasury by law.
 *  Q6 WHAT stops bleeding? → caps from treasury liquid (85% sells), MAX_NEW_ORDERS,
 *     band caps, internal-flow cap, STASIS brake, and the owner gate: this desk is
 *     PLAN-ONLY — the live broadcast path stays market-exec.cjs law (MARKET_EXEC_LIVE).
 *  Q7 (v1.1.0) HOW BIG IS THE POND? → market-grid v1.1.0 reads condenser get_volume
 *     from the chains themselves; the share ladder = fleet volume / measured pond
 *     for N∈{1,2,3,5} soldiers. A share above 100% is possible and HONEST — it
 *     means the capacity ladder saturates the pond and the tape bound rules.
 *  Q8 WHEN DO WE KNOW THE PROJECTION IS WRONG? → realized24h: the fill-ledger's
 *     REAL fills (direction-law parsed, µ-precise) metered over a 24h window that
 *     ends at the LAST fill (deterministic from data alone), against the projection.
 *  Q9 WHAT KILLED THE GREAT MARKET MAKERS, AND WHICH GUARD ANSWERS EACH? → the
 *     doctrine map (adverse selection, inventory skew, fee drag, self-poison,
 *     silent rot, overtrading) — learned-before-burned, shipped WITH the plan.
 *  Q13 (v1.3.0) WHAT IS THE TRUE TAPE RATE? → calibratedTape: the fill-ledger
 *     meters OUR REAL CAPTURE RATE over the window ending at the last fill
 *     (fills/min, µ-honest) — 0.0861 fpm measured ≈ 124 fills/day vs the 10 fpm
 *     market-tape prior. THE MEASURED BINDING: the venue projection now runs on
 *     min(tape, capacity, CAPTURE) — reality says the choke is CAPTURE (the
 *     fill-through of our current posture), not order capacity; the capture
 *     grows exactly the way the owner directive says: more rungs × fill-through
 *     × funded soldiers × bounded internal flow. The prior tape rides along,
 *     labeled — calibration is NEVER a silent rewrite (Q12's law, second dial).
 *  Q14 (v1.3.0) WHICH OTHER VENUES CAN WE PRICE TODAY? → the venue expansion:
 *     the Hive-Engine basket (BEE/WAIV/SWAP.DOGE/SWAP.LTC/CENT) priced PER-TOKEN
 *     from the measured marketFeePercentage of the tokens contract (v1.2.0
 *     market-grid; absent = 0) — each venue priced by ITS OWN fee row (the
 *     doctrine law), edge from the measured spread; volume projection waits for
 *     a measured tape (honest nullReason, never invented). The Blurt internal
 *     market is PROBED (probe-first fail-loud): dark today → booked as a dark
 *     surface with its reason; alive tomorrow → priced at 0 bps.
 *  Q16 (v1.4.0) HOW DOES A VOLUME PROJECTION OPEN WITHOUT A TAPE? → THE SIDECHAIN
 *     POND: the venue's own measured 24h volume IS the bound — no one can trade
 *     more than everything that trades (pondBound = floor(pondSbd / avgSize)) —
 *     the projection opens on min(pond, capacity) with the binding NAMED
 *     ('pond' or 'capacity'), never a borrowed tape prior. The pond rides in
 *     SWAP.HIVE from the HE metrics contract and converts to SBD-term by the
 *     MEASURED cross-rate (the HBD/HIVE internal-market mid from the chains
 *     themselves) — the rate is measured, the SBD≈HBD parity is a labeled
 *     doctrine conversion (both are the chains' own USD-like assets).
 *  Q17 (v1.4.0) WHAT IS STILL MISSING FOR THE SIDECHAIN TAPE? → the per-trade
 *     tape: marketHistory/history is probed EVERY RUN (probe-first, market-grid
 *     v1.3.0) and measured dark today (not RPC-exposed) — booked as a dark
 *     surface with its reason; the day it answers, the pond becomes a SERIES
 *     with zero new code. Standing depth (buyBook/sellBook) is the next rung.
 *  Q10 (v1.2.0) WHAT IS THE TRUE FILL SIZE? → calibratedAvgSize: the fill-ledger's
 *     REAL classified fills (µ-precise) give the actual average notional per fill
 *     (0.703 SBD measured vs 0.068 planned — reality runs ~10× the plan). When the
 *     ledger speaks, the projection RUNS ON IT; the prior size is carried as
 *     priorAvgSizeSbd with its source — calibration is NEVER a silent rewrite.
 *  Q11 DOES THE SHARE MOVE? → shareSeries: the append-only plan ledger IS the time
 *     series; the desk reads its own past rows and emits the last K {at, sharePct}
 *     points per venue — dominance becomes a TREND, not a single frame. The series
 *     lives in the book's `series` namespace (time-born → excluded from the
 *     byte-stable payload; the VALUES are deterministic, the timestamps are the axis).
 *  Q12 WHAT DID CALIBRATION CHANGE? → the book carries a calibration block: prior
 *     size → calibrated size, both sources, n, and the projection lift % — the
 *     owner sees the lift AND where it came from, side by side, never overwritten.
 *
 * Laws carried (all pre-existing, re-honored here):
 *  · STASIS halt-before-read — TWO brakes, ONE law: the DIR-local brake (market-grid
 *    law; works in eval sandboxes) + the borrowed census brake (the SAME fleet-wide
 *    brake, second-mover law). Either active = halt-before-read.
 *  · MMV_SKIP off-switch + MMV_DIR eval seam (fresh-process fixtures never touch the
 *    real tree).
 *  · Single-writer atomic books: agents/mm-volume.json (+ .md — AT-FREE, HEBREW owner
 *    surface per the owner-language law).
 *  · Append-only plan ledger: agents/mm-volume-plan.jsonl (one row per run).
 *  · Fail-soft: unreadable/corrupt inputs degrade to null sections with honest
 *    nullReasons, exit 0 always. The share/realized sections are ENHANCEMENTS —
 *    missing their inputs nulls the section, never the plan.
 *  · Determinism: venues/routes sorted, numbers rounded (4 decimals), the stable
 *    payload (book minus `at`) is byte-identical for the same tree (E50/E51-guarded).
 */

const fs = require('fs');
const path = require('path');
const { stasisHalt } = require('./fleet-census.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIR = process.env.MMV_DIR ? path.resolve(process.env.MMV_DIR) : path.join(ROOT, 'agents');
const BOOK_JSON = path.join(DIR, 'mm-volume.json');
const BOOK_MD = path.join(DIR, 'mm-volume.md');
const PLAN_JSONL = path.join(DIR, 'mm-volume-plan.jsonl');

// ---------- constants (the caps are LAW, encoded as data) ----------
const LAW = {
  SELL_CAP_PCT: 0.85,          // market-exec law: sells ≤ 85% of liquid inventory
  MAX_NEW_PER_RUN: 6,          // market-exec law: orders per run per account
  RUNS_PER_DAY: 96,            // the 15-min grid cadence
  INTERNAL_FLOW_CAP_PCT: 0.25, // internal flow ≤ 25% of projected volume (bounded honesty)
  BUY_EDGE_FLOOR_PCT: 0.3,     // BUY-EDGE law: no buy above sellVwap × (1 − 0.3%)
  TAPE_FILLS_PER_MIN: 10,      // market-tape PRIOR (SBD/STEEM recon 2026-10-03); the LEDGER-calibrated capture rate rides beside it (Q13)
  ASSUMED_AVG_SIZE_SBD: 0.1,   // assumption label carried when no realized rows exist
  REALIZED_WINDOW_H: 24,       // realized metering window (ends at the LAST fill — determinism law)
  GROWTH_NS: [1, 2, 3, 5],     // the recruit growth ladder
  SHARE_SERIES_K: 24,          // share-series length cap (the plan-ledger window)
};

// ---------- pure helpers (E50/E51 white-box surface) ----------
const r4 = (x) => (typeof x === 'number' && isFinite(x)) ? Math.round(x * 10000) / 10000 : null;

/** per-venue volume economics. feeBps = per-side fee in basis points (0 on chain
 * internal markets). Returns both conservative (half-spread capture) and
 * optimistic (full-spread capture) projections; volume is bounded by the measured
 * tape AND by the fleet's order capacity AND — when the ledger speaks (Q13,
 * v1.3.0) — by the MEASURED CAPTURE RATE (the fills our posture actually got),
 * whichever bites first. The binding names the smallest bound; ties resolve in
 * the deterministic order tape → capture → pond → capacity. */
function venueEconomics({ feeBps, spreadPct, fillsPerMin, avgSizeSbd, runsPerDay = LAW.RUNS_PER_DAY, maxNewPerRun = LAW.MAX_NEW_PER_RUN, accounts = 1, captureTradesDay = null, pondVolumeSbd = null }) {
  // validity: fee/spread/size always required; volume truth = a measured tape OR
  // a measured pond (v1.4.0) — a venue with neither has no honest projection.
  const feeOk = typeof feeBps === 'number' && isFinite(feeBps) && feeBps >= 0;
  const spreadOk = typeof spreadPct === 'number' && isFinite(spreadPct) && spreadPct >= 0;
  const sizeOk = typeof avgSizeSbd === 'number' && isFinite(avgSizeSbd) && avgSizeSbd > 0;
  const tapeOk = typeof fillsPerMin === 'number' && isFinite(fillsPerMin) && fillsPerMin >= 0;
  const pondOk = typeof pondVolumeSbd === 'number' && isFinite(pondVolumeSbd) && pondVolumeSbd > 0;
  if (![feeOk, spreadOk, sizeOk].every(Boolean) || (!tapeOk && !pondOk)) return null;
  const feeRoundTripPct = (feeBps * 2) / 100;
  const edgeConsPct = Math.max(0, r4(spreadPct / 2 - feeRoundTripPct));
  const edgeOptPct = Math.max(0, r4(spreadPct - feeRoundTripPct));
  const tapeBound = tapeOk ? fillsPerMin * 60 * 24 : null;
  const capBound = maxNewPerRun * runsPerDay * Math.max(1, accounts);
  const captureBound = (typeof captureTradesDay === 'number' && isFinite(captureTradesDay) && captureTradesDay > 0) ? captureTradesDay : null;
  // Q16 — the pond bound: even capturing the ENTIRE measured daily pond caps the
  // volume; trades are integral, so the bound floors at whole fills.
  const pondBound = pondOk ? Math.floor(pondVolumeSbd / avgSizeSbd) : null;
  const candidates = [['tape', tapeBound], ['capture', captureBound], ['pond', pondBound], ['capacity', capBound]].filter((c) => c[1] != null);
  candidates.sort((a, b) => a[1] - b[1]);
  const projTradesDay = Math.min(tapeBound != null ? tapeBound : Infinity, capBound, captureBound != null ? captureBound : Infinity, pondBound != null ? pondBound : Infinity);
  const projVolumeSbd = r4(projTradesDay * avgSizeSbd);
  return {
    feeBps, spreadPct: r4(spreadPct), feeRoundTripPct: r4(feeRoundTripPct),
    edgeConsPct, edgeOptPct,
    bounds: { tapeBoundTradesDay: tapeBound != null ? Math.round(tapeBound) : null, capBoundTradesDay: Math.round(capBound), captureTradesDay: captureBound != null ? Math.round(captureBound) : null, pondBoundTradesDay: pondBound != null ? pondBound : null, binding: candidates[0][0] },
    projTradesDay, projVolumeSbd,
    projNetConsSbd: r4((projVolumeSbd * edgeConsPct) / 100),
    projNetOptSbd: r4((projVolumeSbd * edgeOptPct) / 100),
  };
}

/** Q13 (v1.3.0) — the calibrated tape: the fill-ledger meters OUR REAL CAPTURE
 * RATE (fills/min over the window ending at the LAST fill — the determinism law).
 * The prior market-tape number rides along with its source, labeled — the same
 * honesty law as calibratedAvgSize (Q12): calibration is never a silent rewrite.
 * Fallback chain: ledger-window fills → exec-recon prior → law assumption. */
function calibratedTape(fillsRows, priorFpm, windowH = LAW.REALIZED_WINDOW_H) {
  const hasPrior = typeof priorFpm === 'number' && isFinite(priorFpm) && priorFpm > 0;
  const rows = (fillsRows || []).filter((f) => f && typeof f.timestamp === 'string' && !isNaN(Date.parse(f.timestamp)));
  if (!rows.length) {
    return { fillsPerMin: hasPrior ? priorFpm : LAW.TAPE_FILLS_PER_MIN, source: hasPrior ? 'exec-recon-prior' : 'law-assumption', n: 0, priorFpm: hasPrior ? priorFpm : null, windowEnd: null };
  }
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const end = Date.parse(rows[rows.length - 1].timestamp);
  const start = end - windowH * 3600000;
  const win = rows.filter((f) => Date.parse(f.timestamp) >= start);
  const fpm = r4(win.length / Math.max(1, windowH * 60));
  if (win.length > 0 && fpm > 0) {
    return { fillsPerMin: fpm, source: 'fill-ledger-realized', n: win.length, priorFpm: hasPrior ? priorFpm : null, windowEnd: rows[rows.length - 1].timestamp };
  }
  return { fillsPerMin: hasPrior ? priorFpm : LAW.TAPE_FILLS_PER_MIN, source: hasPrior ? 'exec-recon-prior' : 'law-assumption', n: 0, priorFpm: hasPrior ? priorFpm : null, windowEnd: rows[rows.length - 1].timestamp };
}

/** Q16 (v1.4.0) — the pond in SBD term: pond (SWAP.HIVE) × the MEASURED cross-rate
 * (HBD/HIVE internal mid from the chains). The SBD≈HBD parity is a labeled
 * doctrine conversion (both are the chains' own USD-like assets); the RATE is
 * measured, never hardcoded. Null when either input is invalid. */
function pondSbdTerm(pondHive, hbdHiveMid) {
  if (!(typeof pondHive === 'number' && isFinite(pondHive) && pondHive >= 0)) return null;
  if (!(typeof hbdHiveMid === 'number' && isFinite(hbdHiveMid) && hbdHiveMid > 0)) return null;
  return r4(pondHive * hbdHiveMid);
}

/** Q14 (v1.3.0) — pricing WITHOUT a measured tape (the venue expansion):
 * edge = captured spread − round-trip fee, floored at zero — the pricing half of
 * the economics, exact, with no volume fiction. Null edges when inputs invalid. */
function edgeFromSpread(feeBps, spreadPct) {
  if (![feeBps, spreadPct].every((x) => typeof x === 'number' && isFinite(x) && x >= 0)) return { edgeConsPct: null, edgeOptPct: null };
  const feeRT = (feeBps * 2) / 100;
  return { edgeConsPct: Math.max(0, r4(spreadPct / 2 - feeRT)), edgeOptPct: Math.max(0, r4(spreadPct - feeRT)) };
}

/** deterministic fleet partition: rung j → account (j mod N). Disjoint, complete
 * cover. Zero rungs or zero accounts = no ladder at all → covers:false (honest). */
function partitionLadder(accounts, rungs) {
  const accs = (accounts || []).filter((a) => typeof a === 'string' && a.length > 0).sort();
  const n = rungs | 0;
  if (!accs.length || n < 1) return { accounts: accs, slices: [], covers: false };
  const slices = accs.map((a) => ({ account: a, rungs: [] }));
  for (let j = 0; j < n; j++) slices[j % accs.length].rungs.push(j);
  const covered = slices.reduce((s, x) => s + x.rungs.length, 0);
  return { accounts: accs, slices, covers: covered === n };
}

/** internal-flow plan (trading between our own soldiers): REAL volume at the
 * venue's round-trip fee; eligible ONLY where feeRoundTripPct === 0 (on fee'd
 * venues self-crossing bleeds the fee into the venue). Bounded by capPct of the
 * projected volume. Guards are data, not prose. */
function selfFlowPlan({ accounts, projVolumeSbd, capPct = LAW.INTERNAL_FLOW_CAP_PCT, feeBps }) {
  const n = (accounts || []).length;
  const feeRoundTripPct = (feeBps * 2) / 100;
  const eligible = n >= 1 && feeRoundTripPct === 0 && typeof projVolumeSbd === 'number' && projVolumeSbd > 0;
  const internalCapSbd = eligible ? r4(capPct * projVolumeSbd) : 0;
  return {
    eligible,
    accounts: n,
    feeRoundTripPct: r4(feeRoundTripPct),
    capPct,
    internalCapSbd,
    guards: ['VWAP-EXCLUSION: internal fills never enter realized sell VWAP / edge books (poison guard)',
      'LABEL: every internal row carries INTERNAL-FLOW',
      `CAP: internal flow ≤ ${Math.round(capPct * 100)}% of projected volume`,
      'FEE-NULL-ONLY: internal flow armed only on zero-fee round-trip venues'],
    blockedReason: eligible ? null : (n < 1 ? 'NO-FLEET-ACCOUNTS' : feeRoundTripPct !== 0 ? 'FEE-ROUND-TRIP-NONZERO' : 'NO-PROJECTED-VOLUME'),
  };
}

/** BUY-EDGE law: the ceiling above which NO buy may be priced. Null when no
 * realized sell VWAP exists (buys then bounded by band only — honestly null). */
function buyEdgeFloor(sellVwap, floorPct = LAW.BUY_EDGE_FLOOR_PCT) {
  if (typeof sellVwap !== 'number' || !isFinite(sellVwap) || sellVwap <= 0) return null;
  return r4(sellVwap * (1 - floorPct / 100));
}

/** realized sell VWAP from market-exec run rows (placed sells, realized price ×
 * STEEM amount, SBD-weighted). Fail-soft: null when no rows. */
function sellVwapFromRuns(runs) {
  let sbd = 0, steem = 0;
  for (const run of runs || []) {
    for (const o of (run && run.placed) || []) {
      const amt = parseFloat(String(o.amount_to_sell || '').split(' ')[0]);
      const isSteem = String(o.amount_to_sell || '').endsWith('STEEM');
      if (isSteem && typeof o.realized === 'number' && amt > 0) { steem += amt; sbd += amt * o.realized; }
    }
  }
  return steem > 0 ? r4(sbd / steem) : null;
}

/** average sell notional in SBD from the same rows (the honest avgSize input);
 * falls back to the law default with the assumption labeled. */
function avgSellNotional(runs) {
  const notions = [];
  for (const run of runs || []) {
    for (const o of (run && run.placed) || []) {
      const amt = parseFloat(String(o.amount_to_sell || '').split(' ')[0]);
      if (String(o.amount_to_sell || '').endsWith('STEEM') && amt > 0 && typeof o.realized === 'number') notions.push(amt * o.realized);
    }
  }
  if (!notions.length) return { avgSizeSbd: LAW.ASSUMED_AVG_SIZE_SBD, assumed: true, n: 0 };
  const avg = notions.reduce((s, x) => s + x, 0) / notions.length;
  return { avgSizeSbd: r4(avg) || LAW.ASSUMED_AVG_SIZE_SBD, assumed: false, n: notions.length };
}

/** Q10 — calibrated average fill notional (SBD) from the fill-ledger's REAL
 * classified fills (µ-precise, direction-law parsed). Fallback chain: real fills
 * → exec-runs planned notion → law assumption. The source is ALWAYS carried, and
 * the prior size rides along (priorAvgSizeSbd) — calibration never rewrites history.
 * Unclassified fills are ignored (the same honesty law as realized24h). */
function calibratedAvgSize(fillsRows, prior) {
  const notions = [];
  for (const f of fillsRows || []) {
    const lp = f && f.leg_parsed;
    if (!lp) continue;
    let micro = null;
    if (lp.leg === 'SELL' && lp.recv && lp.recv.sym === 'SBD' && isFinite(lp.recv.micro)) micro = lp.recv.micro;
    else if (lp.leg === 'BUY' && lp.sold && lp.sold.sym === 'SBD' && isFinite(lp.sold.micro)) micro = lp.sold.micro;
    if (micro != null && micro > 0) notions.push(micro / 1e6);
  }
  if (notions.length) {
    const avg = notions.reduce((s, x) => s + x, 0) / notions.length;
    return {
      avgSizeSbd: r4(avg) || (prior && prior.avgSizeSbd) || LAW.ASSUMED_AVG_SIZE_SBD,
      source: 'fill-ledger-realized', n: notions.length,
      priorAvgSizeSbd: prior ? prior.avgSizeSbd : null,
      priorSource: prior ? (prior.assumed ? 'law-assumption' : 'exec-runs-planned') : null,
    };
  }
  if (prior && !prior.assumed) return { avgSizeSbd: prior.avgSizeSbd, source: 'exec-runs-planned', n: prior.n || 0, priorAvgSizeSbd: null, priorSource: null };
  return { avgSizeSbd: (prior && prior.avgSizeSbd) || LAW.ASSUMED_AVG_SIZE_SBD, source: 'law-assumption', n: 0, priorAvgSizeSbd: null, priorSource: null };
}

/** Q11 — the share as a TIME series: the append-only plan ledger IS the series.
 * Reads the desk's OWN past rows (sorted by `at`), filters rows carrying shares
 * for the venue whose label contains venueSub, returns the last capK points
 * {at, sharePct}. Null when no row ever spoke — young series are honest too. */
function shareSeries(planRows, venueSub, capK = LAW.SHARE_SERIES_K) {
  const rows = (planRows || [])
    .filter((r) => r && typeof r.at === 'string' && !isNaN(Date.parse(r.at)) && Array.isArray(r.shares))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const pts = [];
  for (const r of rows) {
    const s = r.shares.find((x) => x && typeof x.venue === 'string' && String(x.venue).includes(venueSub) && typeof x.sharePct === 'number');
    if (s) pts.push({ at: r.at, sharePct: s.sharePct });
  }
  return pts.length ? pts.slice(-capK) : null;
}

/** fleet growth table: the lift path from the funded fleet of today to a
 * partitioned fleet of N. Lift is honest: capacity scales with N, tape does not. */
function growthTable({ accounts, fillsPerMin, avgSizeSbd, ns = LAW.GROWTH_NS, runsPerDay = LAW.RUNS_PER_DAY, maxNewPerRun = LAW.MAX_NEW_PER_RUN }) {
  const out = [];
  for (const n of ns) {
    const e = venueEconomics({ feeBps: 0, spreadPct: 1, fillsPerMin, avgSizeSbd, runsPerDay, maxNewPerRun, accounts: n });
    if (!e) continue;
    out.push({ n, ordersDayCap: Math.round(e.bounds.capBoundTradesDay), volumeBoundSbd: e.projVolumeSbd, binding: e.bounds.binding });
  }
  return out;
}

/** Q7 — market share: our projected daily volume over the measured 24h market
 * volume. >100% is possible and HONEST — it means the capacity ladder saturates
 * the pond (the caller flags it; the tape bound is what reality lets through). */
function sharePct(projVolumeSbd, marketVolumeSbd) {
  if (typeof projVolumeSbd !== 'number' || !isFinite(projVolumeSbd) || projVolumeSbd <= 0) return null;
  if (typeof marketVolumeSbd !== 'number' || !isFinite(marketVolumeSbd) || marketVolumeSbd <= 0) return null;
  return r4((projVolumeSbd / marketVolumeSbd) * 100);
}

/** the share ladder: for N funded soldiers, the projected volume AND its share
 * of the measured pond. This is the answer to "the BIGGEST" — a ladder, not a boast.
 * The pond bound (v1.4.0) rides through: capacity scales with N, the pond does not. */
function shareLadder({ marketVolumeSbd, spreadPct, fillsPerMin, avgSizeSbd, ns = LAW.GROWTH_NS, runsPerDay = LAW.RUNS_PER_DAY, maxNewPerRun = LAW.MAX_NEW_PER_RUN, pondVolumeSbd = null }) {
  if (typeof marketVolumeSbd !== 'number' || !isFinite(marketVolumeSbd) || marketVolumeSbd <= 0) return null;
  const out = [];
  for (const n of ns) {
    const e = venueEconomics({ feeBps: 0, spreadPct, fillsPerMin, avgSizeSbd, runsPerDay, maxNewPerRun, accounts: n, pondVolumeSbd });
    if (!e) continue;
    const share = sharePct(e.projVolumeSbd, marketVolumeSbd);
    out.push({ n, volumeSbd: e.projVolumeSbd, sharePct: share, saturates: share != null && share >= 100, binding: e.bounds.binding });
  }
  return out.length ? out : null;
}

/** Q8 — realized fills metering over the fill-ledger ledger (fill_order virtual
 * ops, direction-law parsed by fill-ledger.cjs). The window is RELATIVE to the
 * last fill (not to now) so the number is deterministic from the data alone. */
function realized24h(fills, windowH = LAW.REALIZED_WINDOW_H) {
  const rows = (fills || []).filter((f) => f && typeof f.timestamp === 'string' && !isNaN(Date.parse(f.timestamp)) && f.leg_parsed);
  if (!rows.length) return null;
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const end = Date.parse(rows[rows.length - 1].timestamp);
  const start = end - windowH * 3600000;
  const win = rows.filter((f) => Date.parse(f.timestamp) >= start);
  let sellSbd = 0, buySbd = 0, sells = 0, buys = 0;
  for (const f of win) {
    const lp = f.leg_parsed || {};
    if (lp.leg === 'SELL' && lp.recv && lp.recv.sym === 'SBD' && isFinite(lp.recv.micro)) { sellSbd += lp.recv.micro / 1e6; sells++; }
    else if (lp.leg === 'BUY' && lp.sold && lp.sold.sym === 'SBD' && isFinite(lp.sold.micro)) { buySbd += lp.sold.micro / 1e6; buys++; }
  }
  const fillsCount = win.length;
  const unclassified = win.length - sells - buys;
  return {
    windowHours: windowH, windowEnd: rows[rows.length - 1].timestamp,
    fillsCount, unclassified, sells, buys,
    realizedSellSbd: r4(sellSbd), realizedBuySbd: r4(buySbd),
    avgFillSbd: sells + buys > 0 ? r4((sellSbd + buySbd) / (sells + buys)) : null,
    ledgerRows: rows.length,
  };
}

/** Q9 — the doctrine map: how the great market-making failures of the past map
 * onto the guards this fleet ships WITH the plan (learned-before-burned). */
function doctrineMap() {
  return [
    { failure: 'adverse selection — buying into a falling tape', guard: 'BUY-EDGE law: no buy above the realized sell VWAP − 0.3%; flow-catch floors' },
    { failure: 'inventory skew — stranded one-sided stock', guard: 'SELL-CAP-85% + fill-ledger recycle suggestions close the loop' },
    { failure: 'fee drag on thin venues', guard: 'fee-doctrine: zero-fee chain markets first; every fee-priced venue priced by its own book' },
    { failure: 'self-trading poisoning the edge books', guard: 'VWAP-EXCLUSION + INTERNAL-FLOW labeling + the 25% cap' },
    { failure: 'silent capacity rot (a cadence that dies quietly)', guard: 'cadence legs + no-noise comparator + census wiring checks' },
    { failure: 'overtrading beyond what the tape absorbs', guard: 'volume = min(tape bound, capacity bound); the binding is surfaced, never hidden' },
  ];
}

// ---------- main (fail-soft, exit 0 always; require.main guard at the bottom) ----------
async function run() {
  // TWO brakes, ONE law: (1) the DIR-local brake (market-grid law — works in eval
  // sandboxes, honors a per-surface halt), (2) the borrowed census brake (the SAME
  // fleet-wide brake, second-mover law). Either active = halt-before-read.
  let haltSrc = null, haltReason = null;
  try {
    const local = JSON.parse(fs.readFileSync(path.join(DIR, 'STASIS.json'), 'utf8'));
    if (local && local.active === true) { haltSrc = 'local:' + path.basename(DIR); haltReason = local.reason || null; }
  } catch (_) { /* no local brake declared → run normally */ }
  const halt = stasisHalt();
  if (halt.active && !haltSrc) { haltSrc = halt.source; haltReason = null; }
  if (haltSrc) {
    const at = new Date().toISOString();
    const book = { at, agent: 'mm-volume v1.4.0', verdict: 'MMV-HALTED-STASIS', halted: true, reason: haltReason, scope: haltSrc, venues: [], darkSurfaces: [], fleet: null, selfFlow: null, projections: null, calibration: null, tapeCalibration: null, series: null, ownerGate: { mode: 'PLAN-ONLY-OWNER-GATED' }, blockedReasons: ['STASIS'], errors: [] };
    try { fs.writeFileSync(BOOK_JSON, JSON.stringify(book, null, 1)); } catch (_) {}
    console.log(`STASIS-HALT mm-volume · ${at}`);
    return;
  }
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (_) { return null; } };
  const readJsonl = (f) => {
    try {
      const rows = [];
      for (const line of String(fs.readFileSync(path.join(DIR, f), 'utf8')).split('\n')) {
        const t = line.trim(); if (!t) continue;
        try { rows.push(JSON.parse(t)); } catch (_) { /* corrupt lines ignored */ }
      }
      return rows;
    } catch (_) { return []; }
  };

  const errors = [];
  const feeDoctrine = read('fee-doctrine.json');
  const dexBook = read('dex-book.json');
  const mgHist = readJsonl('market-grid-history.jsonl');
  const money = read('money-ledger.json');
  const execRuns = Array.isArray(read('market-exec.json')) ? read('market-exec.json') : [];
  const registry = read('agent-registry.json');
  const mgBook = read('market-grid.json');       // v1.1.0 live book: spreads + the 24h pond
  const fillsRows = readJsonl('fill-ledger-fills.jsonl'); // v1.1.0 realized metering
  const planRows = readJsonl('mm-volume-plan.jsonl');     // v1.2.0 the desk's OWN past — the share time-series source

  const blockedReasons = [];
  if (!feeDoctrine) blockedReasons.push('NO-FEE-DOCTRINE');
  if (!dexBook) blockedReasons.push('NO-DEX-BOOK');
  if (!money || !money.book) blockedReasons.push('NO-TREASURY-BOOK');

  // fleet accounts (steem:// owners from the registry; headcorner is the funded one)
  const accounts = [];
  if (registry && Array.isArray(registry.identity)) {
    for (const it of registry.identity) {
      const owner = it && it.metadata && typeof it.metadata.owner === 'string' ? it.metadata.owner : null;
      if (owner && owner.startsWith('steem://')) {
        const acct = owner.slice('steem://'.length);
        if (!accounts.includes(acct)) accounts.push(acct);
      }
    }
  }
  if (!accounts.length) { accounts.push('headcorner'); blockedReasons.push('REGISTRY-EMPTY-DEFAULTED-HEAD'); }

  // measured spreads: live book first (market-grid v1.1.0), history fallback
  const mgSorted = mgHist.filter((r) => r && typeof r.at === 'string' && !isNaN(Date.parse(r.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const lastMg = mgSorted.length ? mgSorted[mgSorted.length - 1] : null;
  const liveMarkets = (mgBook && Array.isArray(mgBook.markets)) ? mgBook.markets : [];
  const spreadFrom = (chainName, marketIncludes) => {
    const lm = liveMarkets.find((m) => m && m.chain === chainName && typeof m.spreadPct === 'number');
    if (lm) return { spreadPct: lm.spreadPct, from: 'market-grid live book', volSbdTerm: typeof lm.volume24hSbdTerm === 'number' ? lm.volume24hSbdTerm : null, volRaw: lm.volume24h || null };
    const hs = lastMg && Array.isArray(lastMg.spreads) ? (lastMg.spreads.find((s) => String(s.market).includes(marketIncludes)) || {}).spreadPct : null;
    if (typeof hs === 'number') return { spreadPct: hs, from: 'market-grid-history last row', volSbdTerm: null, volRaw: null };
    return null;
  };
  // Q16 — the measured HBD/HIVE cross-rate for the HE pond conversion: live book
  // first, history fallback (mids ride in the history since market-grid v1.3.0).
  const hiveMidFrom = () => {
    const lm = liveMarkets.find((m) => m && m.chain === 'hive' && typeof m.mid === 'number' && m.mid > 0);
    if (lm) return { mid: lm.mid, from: 'market-grid live book (chain condenser mid)' };
    const hm = lastMg && Array.isArray(lastMg.mids) ? (lastMg.mids.find((m) => m && m.chain === 'hive' && typeof m.mid === 'number' && m.mid > 0) || {}).mid : null;
    if (typeof hm === 'number') return { mid: hm, from: 'market-grid-history last row' };
    return null;
  };
  const hiveMid = hiveMidFrom();

  const notion = avgSellNotional(execRuns);
  const calib = calibratedAvgSize(fillsRows, notion); // Q10: the projection runs on REAL fills when the ledger speaks
  const tapeCal = calibratedTape(fillsRows, LAW.TAPE_FILLS_PER_MIN); // Q13: the REAL capture rate (fills/min) over the window ending at the last fill
  const captureTradesDay = Math.round(tapeCal.fillsPerMin * 1440); // the measured capture bound — the reality anchor (Q15)
  const captureLedger = tapeCal.source === 'fill-ledger-realized'; // the capture bound binds ONLY where the ledger speaks (steem-side fills)
  const vwap = sellVwapFromRuns(execRuns);
  const edgeFloor = buyEdgeFloor(vwap);
  const internalFeeBps = 0; // fee-doctrine: chains-side internal markets charge zero trade fee

  const venues = [];
  for (const [chainName, label, marketIncludes] of [['steem', 'SBD/STEEM (internal steem)', 'steem'], ['hive', 'HBD/HIVE (internal hive)', 'HBD/HIVE']]) {
    const src = spreadFrom(chainName, marketIncludes);
    if (!src) { if (chainName === 'steem') blockedReasons.push('NO-MEASURED-STEEM-SPREAD'); continue; }
    const venueCapture = chainName === 'steem' && captureLedger ? captureTradesDay : null; // the ledger meters steem-side fills only — honest scoping
    const econ = venueEconomics({ feeBps: internalFeeBps, spreadPct: src.spreadPct, fillsPerMin: LAW.TAPE_FILLS_PER_MIN, avgSizeSbd: calib.avgSizeSbd, accounts: 1, captureTradesDay: venueCapture });
    venues.push({
      venue: label, layer: 'chain-internal', feeBps: internalFeeBps,
      spreadPct: r4(src.spreadPct), measuredFrom: src.from,
      avgSizeSbd: calib.avgSizeSbd, avgSizeSource: calib.source, avgSizeAssumed: calib.source === 'law-assumption', avgSizeN: calib.n, avgSizePriorSbd: calib.priorAvgSizeSbd,
      tapeFpm: LAW.TAPE_FILLS_PER_MIN, tapeSource: 'exec-recon-prior', captureFpm: venueCapture != null ? tapeCal.fillsPerMin : null, captureSource: venueCapture != null ? tapeCal.source : null, captureN: venueCapture != null ? tapeCal.n : null,
      sellVwap: chainName === 'steem' ? vwap : null, buyEdgeFloor: chainName === 'steem' ? edgeFloor : null,
      econ,
      marketVolume24h: src.volRaw || null,
      marketVolume24hSbdTerm: src.volSbdTerm,
      sharePct: econ ? sharePct(econ.projVolumeSbd, src.volSbdTerm) : null,
      shareLadder: econ ? shareLadder({ marketVolumeSbd: src.volSbdTerm, spreadPct: src.spreadPct, fillsPerMin: LAW.TAPE_FILLS_PER_MIN, avgSizeSbd: calib.avgSizeSbd }) : null,
      realized: chainName === 'steem' ? (function () {
        const r = realized24h(fillsRows);
        if (!r) return { measured: false, nullReason: 'NO-FILLS-LEDGER' };
        const acc = econ && econ.projVolumeSbd > 0 ? r4((r.realizedSellSbd / econ.projVolumeSbd) * 100) : null;
        return { measured: true, ...r, projectionAccuracyPct: acc };
      })() : null,
      selfFlow: selfFlowPlan({ accounts, projVolumeSbd: econ ? econ.projVolumeSbd : 0, feeBps: internalFeeBps }),
    });
  }
  // the fleet's OWN venue: other users' fees route to the treasury by doctrine
  if (feeDoctrine && Array.isArray(feeDoctrine.venues)) {
    const kernel = feeDoctrine.venues.find((v) => v && v.id === 'saos-dex-kernel');
    if (kernel && typeof kernel.feeBpsSource === 'number') {
      venues.push({
        venue: 'saos-dex-kernel (L1 our own DEX)', layer: 'saos-L1', feeBps: kernel.feeBpsSource,
        treasuryCutPct: kernel.treasuryCutPct != null ? kernel.treasuryCutPct : null,
        spreadPct: null, econ: null,
        selfFlow: selfFlowPlan({ accounts, projVolumeSbd: 0, feeBps: kernel.feeBpsSource }),
        note: 'feeBpsSource=' + kernel.feeBpsSource + ' bps per-swap input fee, ' + kernel.treasuryCutPct + '% treasury cut — other users\u2019 fees ARE the fleet\u2019s income here; volume metering is operator-gated future',
      });
    }
  }

  // Q14/Q16 (v1.4.0) — THE VENUE EXPANSION, NOW WITH THE POND: the Hive-Engine
  // sidechain basket priced PER-TOKEN by its OWN measured fee, and the volume
  // projection OPENS on the measured pond bound (min(pond, capacity), binding
  // NAMED — no borrowed tape prior). The pond rides in SWAP.HIVE from the HE
  // metrics contract and converts to SBD-term by the measured HBD/HIVE mid.
  let heVenuesPriced = 0;
  let heVenuesProjected = 0;
  const heRows = (mgBook && mgBook.hiveEngine && Array.isArray(mgBook.hiveEngine.rows)) ? mgBook.hiveEngine.rows : [];
  for (const row of heRows
    .filter((r) => r && typeof r.symbol === 'string' && typeof r.spreadPct === 'number')
    .sort((a, b) => a.symbol.localeCompare(b.symbol))) {
    const feeBps = typeof row.feeBps === 'number' ? row.feeBps : 0;
    const edge = edgeFromSpread(feeBps, row.spreadPct);
    const priced = edge.edgeConsPct != null;
    if (priced) heVenuesPriced++;
    const pondHive = (row.pond24hHive != null) ? row.pond24hHive : (typeof row.volume24h === 'number' && isFinite(row.volume24h) && row.volume24h >= 0 ? row.volume24h : null);
    const pondSbd = pondSbdTerm(pondHive, hiveMid ? hiveMid.mid : null);
    // the projection opens on the measured pond; the capture bound does NOT apply
    // here (the ledger meters steem-side fills only — the honest-scoping law)
    const heEcon = priced && pondSbd != null && pondSbd > 0
      ? venueEconomics({ feeBps, spreadPct: row.spreadPct, fillsPerMin: null, avgSizeSbd: calib.avgSizeSbd, pondVolumeSbd: pondSbd }) : null;
    if (heEcon) heVenuesProjected++;
    const projectionNullReason = heEcon ? null
      : (priced ? (pondSbd == null ? (pondHive == null ? 'NO-MEASURED-POND-HE' : 'NO-MEASURED-HBD-HIVE-MID') : 'NO-PROJECTED-VOLUME') : 'NO-MEASURED-SPREAD');
    venues.push({
      venue: row.symbol + '/SWAP.HIVE (hive-engine)', layer: 'hive-engine-sidechain',
      feeBps, feeMeasured: typeof row.feeBps === 'number' ? 'tokens-contract-live' : 'doctrine-law-absent-zero',
      spreadPct: r4(row.spreadPct), measuredFrom: 'market-grid live book (HE RPC)',
      edge, econ: heEcon, projectionNullReason,
      pond24hHive: pondHive, pondTerm: 'SWAP.HIVE (base-asset units, HE metrics.volume)',
      pond24hSbdTerm: pondSbd, pondConversion: pondSbd != null ? (hiveMid ? hiveMid.from : null) : null,
      pondConversionLaw: 'SBD≈HBD parity (both chains\u2019 USD-like assets), rate = measured HBD/HIVE internal mid',
      marketVolume24h: typeof row.volume24h === 'number' ? r4(row.volume24h) : null,
      marketVolumeTerm: 'SWAP.HIVE (quote-asset units)',
      sharePct: heEcon ? sharePct(heEcon.projVolumeSbd, pondSbd) : null,
      shareLadder: heEcon ? shareLadder({ marketVolumeSbd: pondSbd, spreadPct: row.spreadPct, fillsPerMin: null, avgSizeSbd: calib.avgSizeSbd, pondVolumeSbd: pondSbd }) : null,
      gridFeasible: row.gridFeasible === true,
      selfFlow: selfFlowPlan({ accounts, projVolumeSbd: heEcon ? heEcon.projVolumeSbd : 0, feeBps }),
    });
  }

  // Q14 — the Blurt internal market: probe-first (market-grid v1.2.0). Dark today
  // → an honest dark-surface row with its reason; alive tomorrow → priced at 0 bps.
  // Q17 (v1.4.0) — the HE daily-history probe surfaces the same law (probe-first,
  // market-grid v1.3.0): measured dark today, a series the day it answers.
  const darkSurfaces = [];
  const heHist = mgBook && mgBook.hiveEngine && mgBook.hiveEngine.historyProbe ? mgBook.hiveEngine.historyProbe : null;
  if (heHist && heHist.alive === false) {
    darkSurfaces.push({ surface: 'he-daily-history', reason: heHist.reason || 'HE-DAILY-HISTORY-DARK', pondSource: 'metrics.volume 24h snapshot instead of a series', probedAt: mgBook.at || null });
  }
  const blurt = mgBook && mgBook.blurt ? mgBook.blurt : null;
  if (blurt && blurt.alive === false) {
    darkSurfaces.push({ surface: 'blurt-internal-market', reason: blurt.reason || 'SURFACE-DARK', feeBpsSource: 0, probedAt: mgBook.at || null });
  } else if (blurt && blurt.alive === true && typeof blurt.spreadPct === 'number') {
    venues.push({
      venue: 'BLURT internal (blurt chain)', layer: 'chain-internal', feeBps: 0,
      spreadPct: r4(blurt.spreadPct), measuredFrom: 'market-grid live blurt probe',
      edge: edgeFromSpread(0, blurt.spreadPct), econ: null, projectionNullReason: 'NO-MEASURED-TAPE-BLURT',
      marketVolume24h: null, marketVolume24hSbdTerm: null, sharePct: null, shareLadder: null, realized: null,
      selfFlow: selfFlowPlan({ accounts, projVolumeSbd: 0, feeBps: 0 }),
    });
  }

  // fleet partition over the steem internal ladder (rungs = the market-grid 10-rung grid)
  const partition = partitionLadder(accounts, 10);
  const fleet = {
    accountsNow: accounts.length,
    fundedAccounts: accounts.includes('headcorner') ? ['headcorner'] : [],
    partition,
    growth: growthTable({ accounts, fillsPerMin: LAW.TAPE_FILLS_PER_MIN, avgSizeSbd: (venues[0] && venues[0].avgSizeSbd) || LAW.ASSUMED_AVG_SIZE_SBD }),
    rolloutPath: 'fleet rollout = fund + key-provision recruits (recruit.cjs contract path), one derived-key vault per account, each account re-runs market-exec law with its own caps; the partition above pre-assigns the rungs',
  };

  // totals (over venues with economics)
  const withEcon = venues.filter((v) => v.econ);
  const heProjected = venues.filter((v) => v.layer === 'hive-engine-sidechain' && v.econ);
  const projections = {
    venuesMeasured: withEcon.length,
    projVolumeSbdDay: r4(withEcon.reduce((s, v) => s + (v.econ.projVolumeSbd || 0), 0)),
    projNetConsSbdDay: r4(withEcon.reduce((s, v) => s + (v.econ.projNetConsSbd || 0), 0)),
    projNetOptSbdDay: r4(withEcon.reduce((s, v) => s + (v.econ.projNetOptSbd || 0), 0)),
    internalFlowCapSbdDay: r4(withEcon.reduce((s, v) => s + (v.selfFlow && v.selfFlow.internalCapSbd ? v.selfFlow.internalCapSbd : 0), 0)),
    captureTradesDay: captureLedger ? captureTradesDay : null,
    captureFillThroughPct: captureLedger && withEcon.length ? r4((captureTradesDay / (LAW.MAX_NEW_PER_RUN * LAW.RUNS_PER_DAY)) * 100) : null,
    heVenuesPriced,
    heVenuesProjected,
    hePondSbdDay: r4(heProjected.reduce((s, v) => s + (v.pond24hSbdTerm || 0), 0)),
    heProjVolumeSbdDay: r4(heProjected.reduce((s, v) => s + (v.econ.projVolumeSbd || 0), 0)),
    heProjNetConsSbdDay: r4(heProjected.reduce((s, v) => s + (v.econ.projNetConsSbd || 0), 0)),
  };

  const verdict = blockedReasons.length === 0 && withEcon.length > 0 ? 'MMV-PLAN-LIVE' : (withEcon.length > 0 ? 'MMV-PARTIAL' : 'MMV-BLOCKED-INPUTS');
  const at = new Date().toISOString();
  const book = {
    at, agent: 'mm-volume v1.4.0 (CR-0058..CR-0062, fleet Rungs 28-32 — the volume engine + the share ladder + the calibrated engine + the measured binding & the venue expansion + THE SIDECHAIN POND)', verdict,
    law: {
      planOnly: 'this desk PLANs and MEASURES — it never signs; the live broadcast path is market-exec.cjs law (MARKET_EXEC_LIVE=1, verify-then-sign)',
      guards: ['SELL-CAP-85% of liquid inventory', 'MAX-NEW-ORDERS 6/run/account', 'BUY-EDGE: no buy above realized sell VWAP − 0.3%', 'SPACING-FLOOR 0.4% (market-grid)', 'INTERNAL-FLOW capped 25% + labeled + VWAP-excluded', 'STASIS halt-before-read'],
    },
    doctrine: doctrineMap(),
    calibration: {
      avgSizePriorSbd: notion.avgSizeSbd,
      avgSizePriorSource: notion.assumed ? 'law-assumption' : 'exec-runs-planned',
      avgSizePriorN: notion.n,
      avgSizeCalibratedSbd: calib.avgSizeSbd,
      avgSizeCalibratedSource: calib.source,
      avgSizeCalibratedN: calib.n,
      liftPct: (typeof calib.avgSizeSbd === 'number' && typeof notion.avgSizeSbd === 'number' && notion.avgSizeSbd > 0) ? r4(((calib.avgSizeSbd / notion.avgSizeSbd) - 1) * 100) : null,
      law: 'Q12: the projection runs on the REAL fill size when the ledger speaks; the prior stays carried side-by-side — calibration is never a silent rewrite',
    },
    tapeCalibration: {
      priorTapeFpm: LAW.TAPE_FILLS_PER_MIN,
      priorSource: 'exec-recon 2026-10-03 (market-exec header)',
      measuredFpm: tapeCal.fillsPerMin,
      measuredSource: tapeCal.source,
      measuredN: tapeCal.n,
      windowEnd: tapeCal.windowEnd,
      captureTradesDay: captureLedger ? captureTradesDay : null,
      captureShareOfTapePct: r4((tapeCal.fillsPerMin / LAW.TAPE_FILLS_PER_MIN) * 100),
      binding: captureLedger ? 'capture' : 'tape-vs-capacity',
      law: 'Q13/Q15: the ledger meters OUR capture rate, not the market tape — the projection runs on min(tape, capacity, CAPTURE); capture grows the way the directive says: more rungs × fill-through × funded soldiers × bounded internal flow',
    },
    venues, darkSurfaces, fleet, projections,
    series: {
      law: 'Q11: time-born namespace — the desk\u2019s own past (the append-only plan ledger); excluded from the byte-stable payload (values deterministic, timestamps are the axis)',
      planLedgerRows: planRows.length,
      shareSeries: venues.filter((v) => v.sharePct != null).map((v) => ({ venue: v.venue, points: shareSeries(planRows, v.layer === 'hive-engine-sidechain' ? v.venue.split('/')[0] : (String(v.venue).includes('hive') ? 'hive' : 'steem')) || [] })),
    },
    ownerGate: { mode: 'PLAN-ONLY-OWNER-GATED', livePath: 'market-exec.cjs (headcorner) — fleet rollout per fleet.rolloutPath', previewNote: 'per-venue order previews are emitted by market-grid executorPreview; this book carries counts and prices only' },
    inputs: {
      feeDoctrine: feeDoctrine ? (feeDoctrine.format || 'present') : null,
      dexBookAt: dexBook && dexBook.at ? dexBook.at : null,
      marketGridBookAt: mgBook && mgBook.at ? mgBook.at : null,
      marketGridHistoryRows: mgSorted.length,
      lastMarketGridAt: lastMg ? lastMg.at : null,
      treasuryAt: money && money.updated ? money.updated : null,
      execRunRows: execRuns.length,
      fillLedgerRows: fillsRows.length,
      registryAccounts: accounts,
    },
    blockedReasons, errors,
  };

  try { fs.writeFileSync(BOOK_JSON + '.tmp', JSON.stringify(book, null, 1)); fs.renameSync(BOOK_JSON + '.tmp', BOOK_JSON); } catch (e) { errors.push({ book: String(e.message) }); }

  // append-only plan ledger (one row per run; STASIS rows never reach here)
  try { fs.appendFileSync(PLAN_JSONL, JSON.stringify({ at, verdict, projVolumeSbdDay: projections.projVolumeSbdDay, projNetConsSbdDay: projections.projNetConsSbdDay, internalFlowCapSbdDay: projections.internalFlowCapSbdDay, captureTradesDay: projections.captureTradesDay, tapeFpm: tapeCal.fillsPerMin, tapeSource: tapeCal.source, heVenuesPriced: projections.heVenuesPriced, heVenuesProjected: projections.heVenuesProjected, hePondSbdDay: projections.hePondSbdDay, shares: venues.filter((v) => v.sharePct != null).map((v) => ({ venue: v.venue, sharePct: v.sharePct })), errors: errors.length }) + '\n'); } catch (e) { errors.push({ plan: String(e.message) }); }

  // Hebrew owner surface (AT-FREE)
  const he = [
    '# מנוע הנפח — תוכנית עושה-השוק של הצי (CR-0058..CR-0062, Rung 28-32)',
    '',
    `פסק דין: **${verdict === 'MMV-PLAN-LIVE' ? 'מנוע-נפח-חי' : verdict === 'MMV-PARTIAL' ? 'חלקי' : 'חסום-קלטים'}**`,
    projections.venuesMeasured ? `נפח מוקרן: **${projections.projVolumeSbdDay} SBD/יום** · רווח נטו מוקרן (שמרני→אופטימי): **${projections.projNetConsSbdDay} → ${projections.projNetOptSbdDay} SBD/יום**` : 'אין נפח מוקרן — חסרות מדידות',
    '',
    '| זירה | עמלה (bps) | מרווח נמדד % | קצה שמרני % | נפח מוקרן SBD/יום | נפח שוק 24ש׳ | נתח חייל אחד |',
    '|---|---|---|---|---|---|---|',
    ...venues.map((v) => `| ${v.venue} | ${v.feeBps} | ${v.spreadPct != null ? v.spreadPct : '—'} | ${v.econ ? v.econ.edgeConsPct : '—'} | ${v.econ ? v.econ.projVolumeSbd : '—'} | ${v.marketVolume24hSbdTerm != null ? v.marketVolume24hSbdTerm : '—'} | ${v.sharePct != null ? v.sharePct + '%' : '—'} |`),
    '',
    ...(venues.filter((v) => Array.isArray(v.shareLadder)).map((v) => [
      `סולם הנתח ב${v.venue} (מימון מהמדידה של השרשרת):`,
      ...v.shareLadder.map((s) => `- N=${s.n} חיילים → ${s.volumeSbd} SBD/יום = ${s.sharePct}% מהבריכה${s.saturates ? ' — **הבריכה נשבעת: התקרה היא הטייפ, לא היכולת**' : ''}`),
    ]).flat()),
    '',
    ...(venues.filter((v) => v.realized && v.realized.measured).map((v) => [
      `מימוש מול פרויקציה (${v.venue}): ${v.realized.fillsCount} מילויים אמיתיים ב-24 שעות מהמילוי האחרון · נמכר ${v.realized.realizedSellSbd} SBD · נקנה ${v.realized.realizedBuySbd} SBD · מילוי ממוצע ${v.realized.avgFillSbd} SBD · דיוק הפרויקציה ${v.realized.projectionAccuracyPct}%`,
    ]).flat()),
    ...(book.calibration && book.calibration.avgSizeCalibratedSource === 'fill-ledger-realized' ? [
      `כיול מהמילויים האמיתיים (Q10): גודל מתוכנן ${book.calibration.avgSizePriorSbd} SBD (${book.calibration.avgSizePriorSource}) → מילוי אמתי נמדד ${book.calibration.avgSizeCalibratedSbd} SBD (${book.calibration.avgSizeCalibratedN} מילויים מסווגים) — הפרויקציה רצה על האמת (${book.calibration.liftPct > 0 ? '+' : ''}${book.calibration.liftPct}% תיקון)`,
    ] : []),
    ...(book.tapeCalibration && book.tapeCalibration.measuredSource === 'fill-ledger-realized' ? [
      `כיול הטייפ (Q13): קצב הלכידה שלנו נמדד **${book.tapeCalibration.measuredFpm} מילויים/דק׳ = ${book.tapeCalibration.captureTradesDay} מילויים/יום** (${book.tapeCalibration.measuredN} מילויים בחלון) מול טייפ-השוק ${book.tapeCalibration.priorTapeFpm}/דק׳ — **החנק האמיתי הוא הלכידה, לא היכולת** (מילוי-דרך ${projections.captureFillThroughPct}% מתקרת הפקודות); הלכידה צומחת בדיוק כפי שההוראה קובעת: עוד מדרגות × מילוי-דרך × חיילים ממומנים × זרימה פנימי מגובלת`,
    ] : []),
    ...(venues.filter((v) => v.layer === 'hive-engine-sidechain').length ? [
      `הרחבת הזירות (Q14/Q16): ${venues.filter((v) => v.layer === 'hive-engine-sidechain').length} זירות Hive-Engine מתומחרות per-token מהחוזה החי — והבריכה הנמדדת פותחת את הפרויקציה: הבריכה של כל טוקן (${venues.filter((v) => v.layer === 'hive-engine-sidechain').map((v) => `${v.venue.split('/')[0]} בריכה ${v.pond24hSbdTerm != null ? v.pond24hSbdTerm : '—'} SBD/24ש׳`).join(' · ')}) מתורגמת מ-SWAP.HIVE לשער HBD/HIVE **נמדד** (חוק ההמרה: SBD≈HBD, שניהם נכסי-דולר של השרשרות; השער נמדד — לא מוצק)`,
    ] : []),
    ...(venues.filter((v) => v.layer === 'hive-engine-sidechain' && v.econ).length ? [
      `פרויקציית הבריכה (Q16): אף אחד לא יכול לסחור יותר מכל מה שנסחר — הנפח נפתח על min(בריכה, יכולת) עם החוסם **מתויג**; ${projections.heVenuesProjected} זירות HE עם נפח מוקרן: ${projections.heProjVolumeSbdDay} SBD/יום (בריכה כוללת ${projections.hePondSbdDay} SBD) · רווח נטו מוקרן ${projections.heProjNetConsSbdDay} SBD/יום — בלי שאילת טייפ אחת מושאלת`,
    ] : []),
    ...(book.darkSurfaces && book.darkSurfaces.length ? [
      `משטחים חשוכים (כנים, מדודים): ` + book.darkSurfaces.map((d) => `${d.surface} — ${d.reason}`).join(' · '),
    ] : []),
    ...(book.series && book.series.shareSeries.some((s) => s.points.length) ? [
      `נתח-זמן (Q11): ` + book.series.shareSeries.filter((s) => s.points.length).map((s) => `${s.venue}: ${s.points.length} נקודות — אחרון ${s.points[s.points.length - 1].sharePct}%`).join(' · ') + ` (פנקס התוכניות הוא הסדרה — הנתח כמגמה, לא תמונה)`,
    ] : []),
    '',
    `סולם הצי: ${fleet.accountsNow} חשבון/ות ממומנים (${fleet.fundedAccounts.join(', ')}) · חלוקת סולמות מכסה ${partition.covers ? 'את כל' : 'חלק מ'} ה-10 המדרגות`,
    `זרימה פנימית (מסחר בין החיילים): ${venues[0] && venues[0].selfFlow && venues[0].selfFlow.eligible ? `זמינה — תקרה ${projections.internalFlowCapSbdDay} SBD/יום, מתויגת INTERNAL-FLOW, מוחרגת מה-VWAP` : 'חסומה'}`,
    '',
    'חוקי הבטיחות: ' + book.law.guards.join(' · '),
    'מפת הכשלים (מה שהפיל עושי-שוק גדולים → החוסם שלנו): ' + book.doctrine.map((d) => d.failure.split(' — ')[0] + '→' + d.guard.split(':')[0]).join(' · '),
    blockedReasons.length ? 'חסימות כנות: ' + blockedReasons.join(' · ') : '',
    '',
    'השער: טייפ-השוק ' + LAW.TAPE_FILLS_PER_MIN + ' מילויים/דק׳ (recon 2026-10-03 — prior שנשאר נישא); קצב הלכידה שלנו נמדד מהפנקס; ' + LAW.MAX_NEW_PER_RUN + ' פקודות/ריצה × 96 ריצות/יום = תקרת יכולת; הנפח מוגבל למינימום מהטייפ, מהיכולת ומהלכידה המדודה; נפח הבריכה = condenser get_volume מהשרשרת עצמה.',
    'כל פקודה בפועל נשארת OWNER-GATED (market-exec.cjs). הספר הזה תוכנית ומדידה — לעולם לא חתימה.',
  ].filter(Boolean).join('\n');
  try { fs.writeFileSync(BOOK_MD, he); } catch (e) { errors.push({ md: String(e.message) }); }

  console.log(`mm-volume: ${verdict} · venues ${venues.length} (HE priced ${projections.heVenuesPriced}, HE projected ${projections.heVenuesProjected} on pond ${projections.hePondSbdDay} SBD) · projVol ${projections.projVolumeSbdDay} SBD/day · netCons ${projections.projNetConsSbdDay} · avgSize ${calib.avgSizeSbd} (${calib.source}, n=${calib.n}) · tape ${tapeCal.fillsPerMin}/min (${tapeCal.source}, capture ${captureLedger ? captureTradesDay : '—'}/day) · dark ${darkSurfaces.length} · series ${book.series.planLedgerRows} rows · blocked ${blockedReasons.length}`);
}

// Z-49 law: requiring this file for evals must never execute a run
if (require.main === module) {
  if (process.env.MMV_SKIP === '1') { console.log('mm-volume skipped (MMV_SKIP)'); process.exit(0); }
  run().catch((e) => { console.error('mm-volume FATAL:', e.message); process.exit(0); });
}

module.exports = { venueEconomics, calibratedTape, edgeFromSpread, pondSbdTerm, partitionLadder, selfFlowPlan, buyEdgeFloor, sellVwapFromRuns, avgSellNotional, calibratedAvgSize, shareSeries, growthTable, sharePct, shareLadder, realized24h, doctrineMap, LAW };
