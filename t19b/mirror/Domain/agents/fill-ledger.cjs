'use strict';
/**
 * fill-ledger.cjs — Z-64 FILL MEASUREMENT LEG of the internal-market grid (CR-0039).
 *
 * CR-0036 taught the fleet to SIGN (6 orders standing, orderids 1791050734-39).
 * This desk is what CR-0036's rung summary ordered next: the fill_order virtual-op
 * ledger that MEASURES the grid — realized proceeds, average-cost P&L, inventory —
 * and a recycle suggestion that closes the loop (fills → freed capital → executor
 * re-run). Measurement before more money: the grid can now be JUDGED, not just
 * observed standing.
 *
 * LAWS (in code):
 *  1. READ-ONLY: this desk NEVER signs, NEVER broadcasts. The only signing surface
 *     in the fleet's market stack remains CR-0036 market-exec.cjs, invoked
 *     separately. The recycle output is a SUGGESTION, never an action.
 *  2. DIRECTION LAW (fill_order semantics, steem_evaluator.cpp): in a match the
 *     OPEN order receives CURRENT_PAYS and the CURRENT order receives OPEN_PAYS.
 *     So for a headcorner fill:
 *       open_owner    == HEAD → we SOLD open_pays    and RECEIVED current_pays
 *       current_owner == HEAD → we SOLD current_pays and RECEIVED open_pays
 *     A leg is SELL (sold STEEM, received SBD) or BUY (sold SBD, received STEEM).
 *     Anything else is UNCLASSIFIED — booked honestly, never guessed into P&L.
 *  3. ASSET-FORM TOLERANCE: account_history_api serves NAI assets
 *     (@@000000013 = SBD, @@000000021 = STEEM); condenser serves string assets
 *     ("0.121 SBD"). The parser accepts both forms, resolves by nai/symbol,
 *     never by position (the run-#7 readback law, generalized).
 *  4. µ-UNIT LAW (saos-dex kernel.ts, no-float accounting): every amount is an
 *     integer count of 1e-6 units (STEEM and SBD are both precision-3, so 1e6 is
 *     lossless). Average-cost basis on a sell = round(cost * qSold / qty) — the
 *     single rounding point, ≤ 0.5 µSBD. P&L never accumulates float error.
 *  5. REPLAY LAW: agents/fill-ledger-fills.jsonl is the append-only source of
 *     truth (one line per new fill, deduped). Every run row's inventory and
 *     realized P&L are DERIVED by replaying that ledger — never mutated in place,
 *     never trusted from previous state (saos-dex stateRoot discipline).
 *  6. BOUNDED WINDOW: account_history_api caps limit at 100 (measured
 *     -32801). Pagination walks backwards minIndex-1 up to MAX_PAGES; the walk
 *     stops at FILL_LEDGER_SINCE (default: the grid's birth 2026-10-03T00:00Z).
 *  7. PULLED-SCHEDULE (no daemon): one invocation = one decision = one appended
 *     run row. The cadence driver is the LANE: fill-ledger (read) → if the row
 *     suggests recycle and the operator gate is armed → CR-0036 executor run.
 *     agents/market-cycle.cjs composes exactly that, thin, still no daemon.
 *  8. EVAL-CONTEXT OFF-SWITCH: FILL_LEDGER_SKIP_FETCH=1 books a SKIPPED-EVAL-
 *     CONTEXT row without any network (the CR-0033 CI-safety law, mirrored).
 *  9. FAIL-SOFT EXIT, FAIL-LOUD BOOK: every error lands in the run row; exit 0
 *     always (treasury law). A silent success is a lie; a loud failure is a receipt.
 * 10. SINGLE WRITER: agents/fill-ledger.json (run rows) + fill-ledger-fills.jsonl
 *     (fill rows) + fill-ledger.md (regenerated summary). require.main guard
 *     (Z-49): requiring this file for evals must never execute a run.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.FILL_LEDGER_JSON || path.join(ROOT, 'agents', 'fill-ledger.json');
const FILLS_JSONL = process.env.FILL_LEDGER_FILLS || path.join(ROOT, 'agents', 'fill-ledger-fills.jsonl');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');
const HEAD = process.env.FILL_LEDGER_HEAD || 'headcorner';
const NODE = process.env.FILL_LEDGER_NODE || 'https://api.steemit.com';
const SINCE = process.env.FILL_LEDGER_SINCE || '2026-10-03T00:00:00Z';
const MAX_PAGES = +(process.env.FILL_LEDGER_MAX_PAGES || 5);

const DEFAULTS = {
  MIN_SELL_STEEM: 0.5,   // CR-0036 MIN_REMAINING — below this a sell level would misprice
  MIN_BUY_SBD: 0.25,     // CR-0036 BUY_SBD — below this no buy level is fundable
};

const NAI = { SBD: '@@000000013', STEEM: '@@000000021' };

// ── µ-units arithmetic (law 4) ──────────────────────────────────────────────
// toMicro: NAI object or string asset → integer micro-units. Unknown symbol → null.
function assetInfo(a) {
  if (a && typeof a === 'object' && a.nai) {
    const sym = a.nai === NAI.SBD ? 'SBD' : (a.nai === NAI.STEEM ? 'STEEM' : null);
    if (!sym) return null;
    const p = Math.pow(10, a.precision != null ? a.precision : 3);
    return { sym, micro: Math.round(parseFloat(a.amount) * (1e6 / p)) };
  }
  if (typeof a === 'string') {
    const m = /^\s*([\d.]+)\s+(\S+)\s*$/.exec(a);
    if (!m) return null;
    const sym = m[2] === 'SBD' ? 'SBD' : (m[2] === 'STEEM' ? 'STEEM' : null);
    if (!sym) return null;
    return { sym, micro: Math.round(parseFloat(m[1]) * 1e6) };
  }
  return null;
}

// applyFill: one inventory step. inv = {qty, cost, realized} in µ-units.
// buy  → inventory grows at cost; sell → average-cost basis, realized P&L booked.
// UNCLASSIFIED legs pass through untouched (law 2: never guessed into P&L).
function applyFill(inv, leg) {
  const n = { qty: inv.qty, cost: inv.cost, realized: inv.realized, proceeds_unbased: (inv.proceeds_unbased || 0), n_fills: inv.n_fills + 1, n_unclassified: inv.n_unclassified };
  if (!leg || !leg.leg) { n.n_unclassified++; return n; }
  if (leg.leg === 'BUY') {
    n.qty += leg.recv.micro;  // STEEM received grows inventory (law 2: BUY = sold SBD, received STEEM)
    n.cost += leg.sold.micro; // the SBD spent is the cost of the STEEM acquired
    return n;
  }
  if (leg.leg === 'SELL') {
    if (inv.qty <= 0 || leg.sold.micro > inv.qty) { n.n_unclassified++; n.proceeds_unbased += leg.recv.micro; return n; } // selling pre-ledger STEEM: proceeds booked, basis unknown (honest)
    const basis = Math.round((inv.cost * leg.sold.micro) / inv.qty);
    n.realized += leg.recv.micro - basis;
    n.qty -= leg.sold.micro;
    n.cost -= basis;
    if (n.qty <= 0) { n.qty = 0; n.cost = 0; } // dust-floor: empty book is empty, no negative ghost
    return n;
  }
  n.n_unclassified++;
  return n;
}

// parseFill: virtual-op payload → leg classification (laws 2+3). Foreign fills → null.
function parseFill(op) {
  if (!op || op.open_owner !== HEAD && op.current_owner !== HEAD) return null;
  const oursAsOpen = op.open_owner === HEAD;
  const soldRaw = oursAsOpen ? op.open_pays : op.current_pays;
  const recvRaw = oursAsOpen ? op.current_pays : op.open_pays;
  const sold = assetInfo(soldRaw), recv = assetInfo(recvRaw);
  if (!sold || !recv) return { leg: null, reason: 'ASSET-UNREADABLE', sold: soldRaw, recv: recvRaw };
  let leg = null;
  if (sold.sym === 'STEEM' && recv.sym === 'SBD') leg = 'SELL';
  else if (sold.sym === 'SBD' && recv.sym === 'STEEM') leg = 'BUY';
  const price_micro = sold.micro > 0 ? (recv.sym === 'SBD' ? recv.micro / sold.micro : sold.micro / recv.micro) : 0;
  return {
    leg, // 'SELL' | 'BUY' | null
    reason: leg ? null : 'UNCLASSIFIED-PAIR ' + sold.sym + '->' + recv.sym,
    sold, recv,
    price: +price_micro.toFixed(6), // SBD per STEEM both directions (SBD side / STEEM side)
    counterparty: oursAsOpen ? op.current_owner : op.open_owner,
    our_orderid: oursAsOpen ? op.open_orderid : op.current_orderid,
    ours_as: oursAsOpen ? 'OPEN' : 'CURRENT',
  };
}

function dedupeKey(row) {
  const p = row.leg_parsed || {};
  return [row.seq, row.block, p.our_orderid, p.sold && p.sold.micro, p.recv && p.recv.micro, row.timestamp].join(':');
}

// recycleSuggestion (pure): is an executor run worth pulling right now?
// The executor's own STACK-EXISTS law makes a redundant run harmless — this only
// answers "is there fundable capital or fresh flow", never "place X".
function recycleSuggestion({ liquidSteem, liquidSbd, fillsNew, params = DEFAULTS }) {
  const reasons = [];
  const ls = +(parseFloat(liquidSteem) || 0), lb = +(parseFloat(liquidSbd) || 0);
  if (ls >= params.MIN_SELL_STEEM) reasons.push(`FUNDED-SELL-SIDE ${ls} STEEM`);
  if (lb >= params.MIN_BUY_SBD) reasons.push(`FUNDED-BUY-SIDE ${lb} SBD`);
  if (fillsNew > 0) reasons.push(`FILLS-${fillsNew}`);
  if (!reasons.length) reasons.push('NO-FUNDS');
  return { suggested: reasons.some((r) => r !== 'NO-FUNDS'), reasons };
}

// ── network (read-only, official node only) ─────────────────────────────────
function rpc(method, params, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const u = new URL(NODE);
    const req = https.request({ hostname: u.hostname, path: u.pathname || '/', method: 'POST', family: 4, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); if (j.error) return reject(new Error(String(j.error.message || 'rpc-error').slice(0, 90))); resolve(j.result); }
        catch (_) { reject(new Error('bad-rpc')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    req.write(payload); req.end();
  });
}

// backwards pagination, limit 100 hard cap (measured -32801).
// WIRE LAW (Z-65, measured live): account_history_api serves EMPTY op bodies on both
// official nodes (bodies arrive as {} — fills unparseable); condenser_api.get_account
// _history serves full bodies with string assets. The desk therefore walks the
// CONDENSER form; the asset parser accepts both string and NAI shapes (law 3).
async function fetchHistoryWindow() {
  const rows = [];
  let start = -1;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await rpc('condenser_api.get_account_history', [HEAD, start, 100]);
    const hist = (Array.isArray(r) ? r : ((r && (r.history || r.items)) || []));
    if (!hist.length) break;
    let minSeq = Infinity, oldestTs = null;
    for (const [seq, t] of hist) {
      minSeq = Math.min(minSeq, seq);
      oldestTs = oldestTs && oldestTs < t.timestamp ? oldestTs : t.timestamp;
      if (t.op && t.op[0] === 'fill_order') rows.push({ seq, block: t.block, timestamp: t.timestamp, op: t.op[1] });
    }
    if (oldestTs && oldestTs < SINCE) break; // window bounded (law 6)
    if (minSeq === Infinity || minSeq <= 0) break;
    start = minSeq - 1;
  }
  return rows;
}

// vwapStats (pure, Z-69, CR-0047): the realized edge of the window, from the
// replayed legs only. sellVWAP = SBD received / STEEM sold; buyVWAP = SBD spent /
// STEEM received. edge_pct > 0 means the fleet sold dearer than it bought.
// One authority (the ledger) for the sovereign's BUY-PREMIUM breaker AND the
// executor's buy-pricing cap.
function vwapStats(fills) {
  let sellSteem = 0, sellSbd = 0, buySteem = 0, buySbd = 0, nSell = 0, nBuy = 0;
  for (const f of fills || []) {
    const p = f.leg_parsed || f;
    if (!p || !p.leg || !p.sold || !p.recv) continue;
    if (p.leg === 'SELL' && p.sold.sym === 'STEEM' && p.recv.sym === 'SBD') { sellSteem += p.sold.micro; sellSbd += p.recv.micro; nSell++; }
    else if (p.leg === 'BUY' && p.sold.sym === 'SBD' && p.recv.sym === 'STEEM') { buySbd += p.sold.micro; buySteem += p.recv.micro; nBuy++; }
  }
  const sellVwap = sellSteem > 0 ? sellSbd / sellSteem : null;   // SBD per STEEM
  const buyVwap = buySteem > 0 ? buySbd / buySteem : null;       // SBD per STEEM
  const edgePct = sellVwap != null && buyVwap != null ? ((sellVwap - buyVwap) / sellVwap) * 100 : null;
  return {
    sell_vwap: sellVwap != null ? +sellVwap.toFixed(6) : null,
    buy_vwap: buyVwap != null ? +buyVwap.toFixed(6) : null,
    edge_pct: edgePct != null ? +edgePct.toFixed(4) : null,
    sells: nSell, buys: nBuy,
  };
}

// ── canon (single writer, replay law) ───────────────────────────────────────
function readFills() {
  try {
    return fs.readFileSync(FILLS_JSONL, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}
function appendFill(row) { fs.appendFileSync(FILLS_JSONL, JSON.stringify(row) + '\n'); }
function readCanon() { try { const j = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')); return Array.isArray(j) ? j : (j.rows || []); } catch (_) { return []; } }
function writeCanon(rows) { fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2) + '\n'); }

function replay(fills) {
  let inv = { qty: 0, cost: 0, realized: 0, proceeds_unbased: 0, n_fills: 0, n_unclassified: 0 };
  for (const f of fills) inv = applyFill(inv, f.leg_parsed);
  return inv;
}

function writeMd(row) {
  const L = [];
  L.push(`# fill-ledger — fill measurement leg (CR-0039)`);
  L.push('');
  L.push(`Last run: ${row.ts} · mode **${row.mode}** · head **${row.head}** · since ${row.since}`);
  L.push('');
  L.push(`| metric | value |`);
  L.push(`|---|---|`);
  L.push(`| new fills this run | ${row.new_fills.length} |`);
  L.push(`| total fills in ledger | ${row.total_fills} |`);
  L.push(`| inventory (µ-units→human) | ${(row.inventory.qty / 1e6).toFixed(3)} STEEM · avg cost ${(row.inventory.qty > 0 ? (row.inventory.cost / row.inventory.qty).toFixed(6) : '—')} SBD/STEEM |`);
  L.push(`| realized P&L (costed cycles) | ${(row.inventory.realized / 1e6).toFixed(6)} SBD |`);
  L.push(`| proceeds from pre-ledger-basis sells | ${(row.inventory.proceeds_unbased / 1e6).toFixed(6)} SBD |`);
  L.push(`| unclassified legs | ${row.inventory.n_unclassified} |`);
  L.push(`| liquid now | ${row.liquid ? row.liquid.steem + ' / ' + row.liquid.sbd : '—'} |`);
  L.push(`| own orders on book | ${row.own_orders != null ? row.own_orders : '—'} |`);
  L.push(`| recycle suggestion | **${row.recycle.suggested ? 'SUGGESTED' : 'NO'}** — ${row.recycle.reasons.join(' · ')} |`);
  L.push('');
  if (row.new_fills.length) {
    L.push(`## new fills (${row.new_fills.length})`);
    for (const f of row.new_fills) L.push(`- ${f.timestamp} ${f.leg_parsed.leg || 'UNCLASSIFIED'} ${f.leg_parsed.sold.sym}→${f.leg_parsed.recv.sym} @ ${f.leg_parsed.price} (orderid ${f.leg_parsed.our_orderid}, via ${f.leg_parsed.ours_as}, cp ${f.leg_parsed.counterparty})`);
    L.push('');
  }
  L.push(`## errors (${row.errors.length})`);
  for (const e of row.errors) L.push(`- ${e}`);
  L.push('');
  L.push(`Run history: ${row.run_index} rows in canon. Ledger: fill-ledger-fills.jsonl (append-only, replay-derived state).`);
  fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  const skip = String(process.env.FILL_LEDGER_SKIP_FETCH || '') === '1';
  const row = {
    ts: new Date().toISOString(), mode: 'READ-ONLY', head: HEAD, since: SINCE, node: NODE,
    new_fills: [], total_fills: 0, inventory: null, liquid: null, own_orders: null,
    recycle: { suggested: false, reasons: [] }, errors: [], skipped: null, run_index: 0,
  };
  const canon = readCanon();
  row.run_index = canon.length + 1;

  try {
    if (skip) {
      row.skipped = 'SKIPPED-EVAL-CONTEXT (FILL_LEDGER_SKIP_FETCH=1 — no network, CR-0033 CI-safety law)';
      row.inventory = replay([]); row.total_fills = 0;
    } else {
      const seen = new Set(readFills().map(dedupeKey));
      const vops = await fetchHistoryWindow();
      const fresh = [];
      for (const v of vops) {
        const parsed = parseFill(v.op);
        const legRow = {
          seq: v.seq, block: v.block, timestamp: v.timestamp,
          leg_parsed: parsed, // parsed includes counterparty; no secrets possible (public chain data)
        };
        const key = dedupeKey(legRow);
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(legRow);
      }
      for (const f of fresh) appendFill(f);
      row.new_fills = fresh;
      const all = readFills();
      row.total_fills = all.length;
      row.inventory = replay(all);
      row.vwap = vwapStats(all);
      // context reads (still read-only): liquid + own orders for the suggestion
      try {
        const [acc, own] = await Promise.all([
          rpc('condenser_api.get_accounts', [[HEAD]]),
          rpc('database_api.find_limit_orders', { account: HEAD }),
        ]);
        row.liquid = { steem: acc[0].balance, sbd: acc[0].sbd_balance };
        row.own_orders = (own.orders || []).length;
      } catch (e) { row.errors.push('context read failed: ' + String(e.message || e).slice(0, 80)); }
      row.recycle = recycleSuggestion({ liquidSteem: row.liquid ? row.liquid.steem : 0, liquidSbd: row.liquid ? row.liquid.sbd : 0, fillsNew: fresh.length });
    }
  } catch (e) {
    row.errors.push(String(e.message || e).slice(0, 200));
    if (!row.inventory) row.inventory = replay(readFills());
  }

  row.duration_ms = Date.now() - t0;
  canon.push(row);
  writeCanon(canon);
  writeMd(row);
  console.log(`[fill-ledger] mode=${row.mode} new=${row.new_fills.length} total=${row.total_fills} realized_sbd=${(row.inventory.realized / 1e6).toFixed(6)} vwap=${row.vwap ? `sell ${row.vwap.sell_vwap} / buy ${row.vwap.buy_vwap} (edge ${row.vwap.edge_pct}%)` : 'n/a'} recycle=${row.recycle.suggested ? row.recycle.reasons.join('|') : 'NO'} errors=${row.errors.length} in ${row.duration_ms}ms`);
  console.log(`[fill-ledger] canon: ${path.relative(ROOT, OUT_JSON)} (run #${row.run_index})`);
}

if (require.main === module) {
  main().catch((e) => { console.error('[fill-ledger] FATAL', String(e.message || e).slice(0, 200)); process.exit(0); });
} else {
  module.exports = { assetInfo, parseFill, applyFill, dedupeKey, recycleSuggestion, vwapStats, replay, DEFAULTS, HEAD, NAI };
}
