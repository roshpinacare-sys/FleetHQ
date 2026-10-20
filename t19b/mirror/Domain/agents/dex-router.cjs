'use strict';
/**
 * dex-router.cjs — R39 SWAP-NET DESK (the swap router + arb net + counter-grids)
 *
 * Owner directive (2026-10-04, Hebrew, trace 1a1…c3a5): "צריך לטפל בו היטב
 * לדאוג שנוכל לעשות שם החלפות swap וכו לכמה שיותר רשתות... קודם חשוב שנוכל גם לעשות
 * לsteem hive blurt וכו מטבעות שגם ככה אנחנו עובדים איתם... גרידים מתנגדים על הרשת
 * שלנו מצד שני וגם כדי לפתח שוק ארביטראז רישתי... חשוב שגם נוכל באמת להחליף למטבע
 * האמיתי עם ערך ולא סתם שקר".
 *
 * The desk answers in MEASURED legs, never in promises:
 *  - VENUES: steem internal market, hive internal market, Hive-Engine diesel pools
 *    (multi-mirror, honest when the RPC is dark), the SAOS internal AMM mirror
 *    (dex/state.json), public CEX reference feeds (Binance/MEXC/HTX), and the
 *    inherited Z-27 verdict books (dex-book/bridge-desk).
 *  - ROUTES: a fixed swap catalog (STEEM/HIVE/BLURT + pegged/wrapped + SAOS sim)
 *    quoted live where the legs answer, with honest verdicts:
 *    LIVE-KEYED | GATED-KEYS | GATED-CAPITAL | C-GATE-OPERATOR | NO-RAIL | INTERNAL-SIM
 *    — every gated route names its unlock (keys / capital / operator gate), never a fake swap.
 *  - ARB NET: cross-venue edge rows (lead-lag vs the CEX-implied fair price, peg-drift
 *    on wrapped pools) with a FLOOR law: netBps must beat 2×(capture+floor) — below it
 *    the row books BELOW-FLOOR instead of pretending a trade exists (Makarov-Schoar:
 *    non-atomic cross-venue arb is structurally competed away; our edge is BEING the quote).
 *  - COUNTER-GRIDS (the opposing grids): both-side ladders anchored to the CEX-implied
 *    fair price (not the local touch), Avellaneda-style inventory skew, ATR-aware spacing
 *    with the 0.4% round-trip floor — PLAN-OWNER-GATED-NOT-BROADCAST (law 2 of market-grid).
 *
 * LAWS (in code):
 *  1. OFFICIAL SOURCES ONLY: chain nodes (condenser), the sidechain RPC, public CEX
 *     ticker APIs, and the estate's own committed mirrors. No invented prices.
 *  2. KEYLESS: reads only. The router PLANS; market-exec/grid-beat (owner-gated)
 *     are the only signing surfaces. Nothing here broadcasts, ever.
 *  3. STASIS: the brake is obeyed BEFORE any read or write (halt = healthy no-op).
 *  4. FAIL-SOFT exit 0: a dark feed is an honest row (FEED-STALE / RPC-DARK /
 *     NO-RAIL), never a crash, never a silent skip.
 *  5. VERDICT AUTHORITY (Z-26/Z-27 law): bridge disabled/min-flag truth and AMM depth
 *     authority stay with bridge-desk/dex-book books — they are read and embedded as
 *     inherited verdicts, never contradicted.
 *  6. SINGLE CANON: agents/dex-router.json + .md are the one record; the history
 *     jsonl is the append-only evidence trail (the time-series of the edge).
 *  7. HONEST MONEY: the powerdown drip (measured 2026-10-10 next payout) is the
 *     booked fuel law; no "3-day lock" exists in any estate book, and this desk
 *     does not invent one.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.DEXROUTER_JSON || path.join(ROOT, 'agents', 'dex-router.json');
const OUT_MD = path.join(OUT_JSON.replace(/\.json$/, '.md'));
const HISTORY = process.env.DEXROUTER_HISTORY || path.join(ROOT, 'agents', 'dex-router-history.jsonl');

const STEEM_NODE = 'https://api.steemit.com';
const HIVE_NODE = 'https://api.hive.blog';
const HE_MIRRORS = ['api.hive-engine.com', 'api2.hive-engine.com', 'engine.rishipanthee.com'];
const HE_PAIRS = ['SWAP.HIVE:SWAP.BTC', 'SWAP.HIVE:SWAP.ETH', 'SWAP.HIVE:SWAP.LTC', 'SWAP.HIVE:SWAP.DOGE'];
const HE_SWAP_FEE_BPS = 25;          // diesel-pool swap fee (measured doctrine: 0.25%)
const SLIP_BPS = 20;                 // conservative slippage allowance per arb leg
const PEG_MAX_DRIFT_PCT = 1.5;       // wrapped-pool peg-drift halt law
const ROUND_TRIP_FLOOR_PCT = 0.4;    // the grid fee floor (market-grid law)
const SKEW_FULL_BPS = 50;            // ladder shift at fully one-sided inventory
const POLICY_MAX_TIER_S = 1.25;      // sovereign policy per-level cap (STEEM)
const COMMIT_PCT = 0.9;              // grid-beat funding law (commitable fraction)
const RUNGS_PER_SIDE = 3;

// ── io helpers ──────────────────────────────────────────────────────────────
function get(host, p, timeout = 9000) {
  return new Promise((resolve) => {
    const req = https.request({ host, path: p, method: 'GET', servername: host, family: 4,
      headers: { accept: 'application/json', 'user-agent': 'saos-dex-router/1' }, timeout },
      (res) => { let d = ''; res.on('data', (c) => { d += c; if (d.length > 2e6) req.destroy(new Error('too large')); });
        res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', (e) => resolve({ error: String(e.message || e).slice(0, 70) }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}
function post(url, body, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }, timeout },
      (res) => { let buf = ''; res.on('data', (c) => { buf += c; if (buf.length > 1e6) req.destroy(new Error('too large')); });
        res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('bad json: ' + e.message)); } }); });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(data);
  });
}
const f = (x) => { const v = parseFloat(String(x ?? '0')); return isFinite(v) ? v : 0; };
const parseAsset = (s) => { const m = String(s || '').trim().split(/\s+/); return { amt: f(m[0]), sym: m[1] || '' }; };

// ── pure math (E62 white-box surface) ───────────────────────────────────────
/** chain legs: out = Π(leg.out) with per-leg fee bps. */
function routeCost(hops) {
  let out = 1;
  let feesBps = 0;
  for (const h of hops || []) {
    out *= f(h.rate) * (1 - f(h.feeBps) / 10000);
    feesBps += f(h.feeBps);
    out *= (1 - f(h.impactBps) / 10000);
  }
  return { out: +out.toFixed(10), feesBps: +feesBps.toFixed(2) };
}
/** implied internal fair price from two CEX legs: the price of 1 QUOTE in BASE
 * terms = quoteUsdt ÷ baseUsdt. Measured law 2026-10-04: SBD/STEEM = STEEM/USDT ÷
 * SBD/USDT (0.0635/0.602 = 0.1055) — the inverted reading (9.48) is the A1
 * parity bug caught by the desk's own first live book and fixed by measurement.
 * HBD LAW: HBD is NOT SBD — an implied HBD/HIVE fair requires a real HBD/USDT
 * leg; the SBD price is refused as its proxy (the name-is-not-the-chain law). */
function impliedFair(baseUsdt, quoteUsdt) {
  const a = f(baseUsdt), b = f(quoteUsdt);
  if (!(a > 0) || !(b > 0)) return null;
  return +(b / a).toFixed(8);
}
/** arb net edge in bps after fees + slippage. */
function arbNet(grossBps, feesBps, slipBps) {
  return +(f(grossBps) - f(feesBps) - f(slipBps)).toFixed(2);
}
/** the FLOOR law: threshold = 2×(maker capture + round-trip floor). */
function arbThreshold(spreadPct) {
  return +(2 * (f(spreadPct) * 50 + ROUND_TRIP_FLOOR_PCT * 100)).toFixed(2);
}
/** wrapped-pool peg drift vs the CEX cross (%). */
function pegDrift(poolPrice, refPrice) {
  const a = f(poolPrice), b = f(refPrice);
  if (!(a > 0) || !(b > 0)) return null;
  return +(((a - b) / b) * 100).toFixed(4);
}
/** arb verdict — honest, five branches; absence of a readable leg is FEED-STALE. */
function arbVerdict(netBps, thresholdBps, legsReadable, driftPct) {
  if (!legsReadable) return 'FEED-STALE';
  if (driftPct != null && Math.abs(driftPct) > PEG_MAX_DRIFT_PCT) return 'PEG-DRIFT-HALT';
  return f(netBps) > f(thresholdBps) ? 'CANDIDATE-FOK' : 'BELOW-FLOOR';
}
/** ATR-aware spacing law: max(vol×0.1, round-trip floor), clamped 0.5%..6%. */
function spacingLaw(pct24h, floorPct = ROUND_TRIP_FLOOR_PCT) {
  const x = Math.min(Math.max(Math.abs(f(pct24h)) / 10, floorPct), 6);
  return +x.toFixed(3);
}
/** Avellaneda-style ladder shift: ±SKEW_FULL_BPS at fully one-sided inventory. */
function skewShiftBps(steemShare) {
  const q = Math.min(Math.max(f(steemShare), 0), 1);
  return +(((q - 0.5) * 2 * SKEW_FULL_BPS)).toFixed(2);
}
/** the counter-grid: both-side ladders anchored to the fair price, skewed. */
function counterGrid(opts) {
  const anchor = f(opts.anchor);
  const spacingBps = f(opts.spacingBps);
  const skew = skewShiftBps(opts.steemShare);
  const adj = +(anchor * (1 - skew / 10000)).toFixed(8);
  const rungs = [];
  const sellCap = Math.min(f(opts.capPerRungSteem), f(opts.steemLiquid) * COMMIT_PCT / RUNGS_PER_SIDE);
  const buyCap = Math.min(f(opts.capPerRungQuote), f(opts.quoteLiquid) * COMMIT_PCT / RUNGS_PER_SIDE);
  for (let i = 1; i <= (opts.rungsPerSide || RUNGS_PER_SIDE); i++) {
    rungs.push({ side: 'buy', price: +(adj * (1 - (i * spacingBps) / 10000)).toFixed(8), size: +buyCap.toFixed(3), unit: opts.quoteUnit || 'SBD' });
  }
  for (let i = 1; i <= (opts.rungsPerSide || RUNGS_PER_SIDE); i++) {
    rungs.push({ side: 'sell', price: +(adj * (1 + (i * spacingBps) / 10000)).toFixed(8), size: +sellCap.toFixed(3), unit: opts.baseUnit || 'STEEM' });
  }
  return { anchorAdj: adj, skewShiftBps: skew, spacingBps, rungs };
}
/** constant-product pool swap with fee (out = y − k/(x+dx), fee on out). */
function poolSwapOut(ra, rb, dx, feeBps) {
  const x = f(ra), y = f(rb), d = f(dx);
  if (!(x > 0) || !(y > 0) || !(d > 0)) return null;
  const k = x * y;
  const out = (y - k / (x + d)) * (1 - f(feeBps) / 10000);
  if (!(out > 0)) return null;
  const impactBps = ((x / (x + d)) - 1) * -10000;
  return { out: +out.toFixed(6), impactBps: +impactBps.toFixed(2) };
}

// ── venue readers (all fail-soft → honest rows) ─────────────────────────────
async function readInternalBook(node, chain) {
  const ticker = await post(node, { jsonrpc: '2.0', method: 'condenser_api.get_ticker', params: [], id: 1 });
  const book = await post(node, { jsonrpc: '2.0', method: 'condenser_api.get_order_book', params: [20], id: 2 });
  if (!ticker.result || !book.result) throw new Error('incomplete book from ' + node);
  const bid = f(ticker.result.highest_bid), ask = f(ticker.result.lowest_ask);
  if (!(bid > 0) || !(ask > 0)) throw new Error('empty book ' + chain);
  const spreadPct = +(((ask - bid) / ((bid + ask) / 2)) * 100).toFixed(4);
  const depthSbdSide = (book.result.bids || []).reduce((a, r) => a + f(r.sbd), 0);
  const depthSteemSide = (book.result.asks || []).reduce((a, r) => a + f(r.steem), 0);
  return { chain, bid, ask, mid: +(((bid + ask) / 2)).toFixed(8), spreadPct, pct24h: +f(ticker.result.percent_change).toFixed(3),
    depthBids: depthSbdSide, depthAsks: depthSteemSide, node: new URL(node).hostname };
}
async function readBalances() {
  const [steem, hive] = await Promise.all([
    post(STEEM_NODE, { jsonrpc: '2.0', method: 'condenser_api.get_accounts', params: [['headcorner']], id: 1 }),
    post(HIVE_NODE, { jsonrpc: '2.0', method: 'condenser_api.get_accounts', params: [['headcorner']], id: 1 }),
  ]).catch(() => [null, null]);
  const s = steem && Array.isArray(steem.result) && steem.result[0] ? steem.result[0] : null;
  const h = hive && Array.isArray(hive.result) && hive.result[0] ? hive.result[0] : null;
  return {
    steem: s ? { liquid: parseAsset(s.balance).amt, sbd: parseAsset(s.sbd_balance).amt } : null,
    hive: h ? { liquid: parseAsset(h.balance).amt, hbd: parseAsset(h.hbd_balance).amt } : null,
  };
}
async function readCexRefs() {
  const rows = [];
  const one = async (venue, host, sym, symPath) => {
    try {
      const r = await get(host, symPath);
      if (r.error || r.status !== 200) return rows.push({ venue, symbol: sym, mid: null, pct24h: null, why: 'HTTP-' + (r.status || r.error) });
      const j = JSON.parse(r.body);
      if (venue === 'HTX') {
        const d = j && j.tick ? j.tick : null;
        const close = d ? f(d.close) : 0, open = d ? f(d.open) : 0;
        rows.push({ venue, symbol: sym, mid: close > 0 ? close : null, pct24h: close > 0 && open > 0 ? +(((close - open) / open) * 100).toFixed(3) : null, why: close > 0 ? null : 'NO-TICK' });
      } else {
        const mid = f(j.lastPrice);
        rows.push({ venue, symbol: sym, mid: mid > 0 ? mid : null, pct24h: isFinite(parseFloat(j.priceChangePercent)) ? +parseFloat(j.priceChangePercent).toFixed(3) : null, why: mid > 0 ? null : 'EMPTY-TICKER' });
      }
    } catch (e) { rows.push({ venue, symbol: sym, mid: null, pct24h: null, why: String(e.message).slice(0, 60) }); }
  };
  await Promise.all([
    one('Binance', 'api.binance.com', 'STEEMUSDT', '/api/v3/ticker/24hr?symbol=STEEMUSDT'),
    one('Binance', 'api.binance.com', 'HIVEUSDT', '/api/v3/ticker/24hr?symbol=HIVEUSDT'),
    one('Binance', 'api.binance.com', 'BTCUSDT', '/api/v3/ticker/24hr?symbol=BTCUSDT'),
    one('MEXC', 'api.mexc.com', 'STEEMUSDT', '/api/v3/ticker/24hr?symbol=STEEMUSDT'),
    one('MEXC', 'api.mexc.com', 'HIVEUSDT', '/api/v3/ticker/24hr?symbol=HIVEUSDT'),
    one('HTX', 'api.huobi.pro', 'SBDUSDT', '/market/detail/merged?symbol=sbdusdt'),
    one('Binance', 'api.binance.com', 'HBDUSDT', '/api/v3/ticker/24hr?symbol=HBDUSDT'),
    one('MEXC', 'api.mexc.com', 'HBDUSDT', '/api/v3/ticker/24hr?symbol=HBDUSDT'),
    one('HTX', 'api.huobi.pro', 'HBDUSDT', '/market/detail/merged?symbol=hbdusdt'),
  ]);
  return rows;
}
/** pick the best readable CEX mid for a symbol (stale = all venues null). */
function cexMid(refs, symbol) {
  const rows = refs.filter((r) => r.symbol === symbol && r.mid > 0);
  return rows.length ? { mid: rows[0].mid, pct24h: rows[0].pct24h, venue: rows[0].venue, stale: false } : { mid: null, pct24h: null, venue: null, stale: true };
}
async function readHePools() {
  for (const host of HE_MIRRORS) {
    try {
      const res = await post('https://' + host + '/rpc/contracts', { jsonrpc: '2.0', method: 'find',
        params: { contract: 'marketpools', table: 'pools', query: { tokenPair: { $in: HE_PAIRS } }, limit: 10, offset: 0 }, id: 1 }, 8000);
      if (!Array.isArray(res.result)) continue;
      const rows = res.result.map((p) => {
        const parts = String(p.tokenPair || '').split(':');
        const base = f(p.baseQuantity), quote = f(p.quoteQuantity);
        const priceQuotePerBase = quote > 0 && base > 0 ? +(base / quote).toFixed(10) : null;
        return { pair: p.tokenPair, base: parts[0], quote: parts[1], baseReserve: base, quoteReserve: quote,
          priceQuotePerBase, feeBps: HE_SWAP_FEE_BPS, mirror: host };
      }).filter((r) => r.priceQuotePerBase > 0);
      return { alive: true, mirror: host, rows, probedMirrors: HE_MIRRORS };
    } catch (_) { /* try next mirror */ }
  }
  return { alive: false, mirror: null, rows: [], probedMirrors: HE_MIRRORS,
    why: 'HE-RPC-DARK: no mirror answered (probed: ' + HE_MIRRORS.join(', ') + ') — the venue is measured dark, not skipped' };
}
function readSaosMirror() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'dex', 'state.json'), 'utf8'));
    const pools = (s.pools || []).map((p) => ({ pair: p.key, a: p.a, b: p.b, ra: f(p.ra), rb: f(p.rb), feeBps: f(p.feeBps), mid: f(p.mid), swaps: f(p.swaps), lpYieldBps: f(p.lpYieldBps) }));
    const assets = {};
    try { for (const [k, v] of Object.entries(s.state.assets || {})) assets[k] = f(v.refPrice ?? v.ref ?? v.price ?? null) || null; } catch (_) { assets.SAOS = null; }
    const pub = s.publishedAt ? (Date.now() - new Date(s.publishedAt).getTime()) / 3600000 : null;
    return { alive: pools.length > 0, engine: s.beat ? s.beat.engine : null, publishedAt: s.publishedAt || null, mirrorAgeHours: pub != null ? +pub.toFixed(1) : null, pools, assets };
  } catch (e) { return { alive: false, why: 'SAOS-MIRROR-UNREADABLE: ' + String(e.message).slice(0, 60), pools: [], assets: {} }; }
}
function readInheritedBooks() {
  const out = {};
  for (const [name, file] of [['dexBook', 'agents/dex-book.json'], ['bridgeBook', 'agents/bridge-book.json']]) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
      out[name] = { at: j.at || j.updated || null, verdictAuthority: 'Z-27', raw: j };
    } catch (_) { out[name] = null; }
  }
  return out;
}

// ── route catalog (the honest swap map) ─────────────────────────────────────
function buildRoutes(ctx) {
  const { steem, hive, cex, he, saos, implied } = ctx;
  const routes = [];
  const topAsk = steem ? steem.ask : null, topBid = steem ? steem.bid : null;
  // R1/R2 — the live signed rail (headcorner active key is held and verified by market-exec)
  routes.push({ id: 'R1', from: 'SBD', to: 'STEEM', via: 'STEEM-INTERNAL', legs: [{ venue: 'steem-internal', pair: 'SBD/STEEM' }],
    sizeNote: '≤ 1.25 STEEM/rung ×3 (sovereign policy)', quote: topAsk ? { in: '1.000 SBD', out: +(1 / topAsk).toFixed(6) + ' STEEM', impliedPrice: +topAsk.toFixed(8), impactBps: null } : null,
    verdict: 'LIVE-KEYED', unlock: null, why: 'the only rail the fleet can sign today (headcorner active key, verify-then-sign in market-exec)' });
  routes.push({ id: 'R2', from: 'STEEM', to: 'SBD', via: 'STEEM-INTERNAL', legs: [{ venue: 'steem-internal', pair: 'SBD/STEEM' }],
    sizeNote: '≤ 85% liquid STEEM, 3 levels', quote: topBid ? { in: '1.000 STEEM', out: +topBid.toFixed(6) + ' SBD', impliedPrice: +topBid.toFixed(8), impactBps: null } : null,
    verdict: 'LIVE-KEYED', unlock: null, why: 'same live rail, ask→bid side' });
  // R3/R4 — hive internal (keys measured absent in R38)
  routes.push({ id: 'R3', from: 'HBD', to: 'HIVE', via: 'HIVE-INTERNAL', legs: [{ venue: 'hive-internal', pair: 'HBD/HIVE' }],
    sizeNote: '—', quote: hive ? { in: '1.000 HBD', out: +(1 / hive.ask).toFixed(6) + ' HIVE', impliedPrice: +hive.ask.toFixed(8), impactBps: null } : null,
    verdict: 'GATED-KEYS', unlock: 'HIVE active key material (R38 measured: none held) + ≥0.2 HIVE/HBD level fuel', why: 'quoted live; the desk cannot sign what it does not hold' });
  routes.push({ id: 'R4', from: 'HIVE', to: 'HBD', via: 'HIVE-INTERNAL', legs: [{ venue: 'hive-internal', pair: 'HBD/HIVE' }],
    sizeNote: '—', quote: hive ? { in: '1.000 HIVE', out: +hive.bid.toFixed(6) + ' HBD', impliedPrice: +hive.bid.toFixed(8), impactBps: null } : null,
    verdict: 'GATED-KEYS', unlock: 'HIVE active key material + inventory', why: 'quoted live; authority verdict NO-KEYS (CR-0068)' });
  // R5/R6 — wrapped pools (HIVE→SWAP.HIVE→SWAP.*): the real-value bridge for small/medium size
  const btcPool = (he.rows || []).find((r) => r.pair === 'SWAP.HIVE:SWAP.BTC');
  const ltcPool = (he.rows || []).find((r) => r.pair === 'SWAP.HIVE:SWAP.LTC');
  routes.push({ id: 'R5', from: 'HIVE', to: 'BTC', via: 'HIVE-ENGINE (SWAP.HIVE→SWAP.BTC)', legs: [{ venue: 'he-peg-in', pair: 'HIVE→SWAP.HIVE', feeBps: 75 }, { venue: 'he-pool', pair: 'SWAP.HIVE:SWAP.BTC', feeBps: HE_SWAP_FEE_BPS }],
    sizeNote: '≤ 2% of pool depth per trade (MEV/peg cap law)',
    quote: btcPool ? (() => { const dx = btcPool.baseReserve * 0.01; const s = poolSwapOut(btcPool.baseReserve, btcPool.quoteReserve, dx, HE_SWAP_FEE_BPS);
      return s ? { in: +(dx).toFixed(3) + ' SWAP.HIVE (1% pool)', out: s.out + ' SWAP.BTC', impliedPrice: +(btcPool.priceQuotePerBase).toFixed(6) + ' HIVE/BTC', impactBps: s.impactBps } : null; })() : null,
    verdict: 'GATED-CAPITAL', unlock: 'HIVE keys + HIVE inventory (0.034 HIVE dust today — R38 measured)',
    why: he.alive ? 'deepest real-value corridor (pool ~' + Math.round(btcPool ? btcPool.baseReserve : 0) + ' HIVE side)' : (he.why || 'HE dark') });
  routes.push({ id: 'R6', from: 'SWAP.HIVE', to: 'SWAP.LTC', via: 'HIVE-ENGINE', legs: [{ venue: 'he-pool', pair: 'SWAP.HIVE:SWAP.LTC', feeBps: HE_SWAP_FEE_BPS }],
    sizeNote: '≤ 2% of pool depth', quote: null,
    verdict: 'GATED-CAPITAL', unlock: 'HIVE keys + SWAP.HIVE inventory', why: 'thin pools — quoted only when HE answers; SWAP.ETH/SOL stay POOL-DUST per Z-27' });
  // R7/R8 — the LARGE-SIZE real-value rails (CEX, operator-gated)
  const steemRef = cexMid(cex, 'STEEMUSDT'), hbdRef = cexMid(cex, 'SBDUSDT');
  routes.push({ id: 'R7', from: 'STEEM', to: 'USDT', via: 'CEX (MEXC/Binance native deposit → sell)', legs: [{ venue: 'cex-rail', pair: 'STEEM/USDT' }],
    sizeNote: 'large sizes allowed — the designated big-rail', quote: steemRef.mid ? { in: '1.000 STEEM', out: +(steemRef.mid * (1 - 0.0005)).toFixed(6) + ' USDT', impliedPrice: +steemRef.mid.toFixed(8), impactBps: null } : null,
    verdict: 'C-GATE-OPERATOR', unlock: 'operator MEXC/Binance account + API keys (tier-C operator lock, keys never in repos)', why: 'MEXC/Binance list STEEM/USDT live (2026-10-04 measured tickers)' });
  routes.push({ id: 'R8', from: 'SBD', to: 'USDT', via: 'CEX (HTX native deposit → sell)', legs: [{ venue: 'cex-rail', pair: 'SBD/USDT' }],
    sizeNote: 'the only deep SBD book is HTX (Upbit ended SBD support 2025-02)', quote: hbdRef.mid ? { in: '1.000 SBD', out: +(hbdRef.mid * (1 - 0.0005)).toFixed(6) + ' USDT', impliedPrice: +hbdRef.mid.toFixed(8), impactBps: null } : null,
    verdict: 'C-GATE-OPERATOR', unlock: 'operator HTX account + API keys', why: 'SBD external value is measured here — the parity anchor for the whole grid' });
  routes.push({ id: 'R9', from: 'BTC/USDT', to: 'STEEM', via: 'CEX → native withdraw → internal market', legs: [{ venue: 'cex-rail', pair: 'USDT→STEEM' }, { venue: 'steem-internal', pair: 'SBD/STEEM' }],
    sizeNote: 'ingress of real value — funds the grid', quote: steemRef.mid ? { in: '100.000 USDT', out: +(100 / steemRef.mid).toFixed(6) + ' STEEM', impliedPrice: +steemRef.mid.toFixed(8), impactBps: null } : null,
    verdict: 'C-GATE-OPERATOR', unlock: 'operator CEX keys + withdrawal whitelist (deposit doors already live in dex/watch.json)', why: 'the value-IN direction: BTC/USDT → STEEM → our book' });
  // R10 — blurt: measured absence (Z-27 law: no DEX on blurt, no CEX listing)
  routes.push({ id: 'R10', from: 'BLURT', to: 'BTC', via: 'none', legs: [], sizeNote: '—', quote: null,
    verdict: 'NO-RAIL', unlock: 'a blurt book coming alive (engine/pool/CEX) would be measured by market-grid before this route opens',
    why: 'NO-RAIL measured: no blurt DEX (Z-27), no CEX listing (2026-10-04 probes), TradeOgre bot-walled from sandbox — absence is booked, never faked' });
  // R11 — the SAOS internal corridor (sim book, real-money-audited, zero keys)
  const saosPool = (saos.pools || []).find((p) => p.pair === 'SAOS/USDS');
  const wsteemPool = (saos.pools || []).find((p) => p.pair === 'USDS/WSTEEM');
  routes.push({ id: 'R11', from: 'SAOS', to: 'WSTEEM', via: 'SAOS-AMM (SAOS→USDS→WSTEEM)', legs: [{ venue: 'saos-pool', pair: 'SAOS/USDS' }, { venue: 'saos-pool', pair: 'USDS/WSTEEM' }],
    sizeNote: 'quoted at 1% of each pool per hop (thin-pool honesty)',
    quote: (() => { if (!saosPool || !wsteemPool) return null;
      const l1 = poolSwapOut(saosPool.ra, saosPool.rb, saosPool.ra * 0.01, saosPool.feeBps);
      const l2 = l1 ? poolSwapOut(wsteemPool.ra, wsteemPool.rb, l1.out, wsteemPool.feeBps) : null;
      return l2 ? { in: +(saosPool.ra * 0.01 / 1e6).toFixed(3) + ' SAOS (1% pool)', out: +(l2.out / 1e6).toFixed(6) + ' WSTEEM', impliedPrice: null, impactBps: +(l1.impactBps + l2.impactBps).toFixed(2) } : null; })(),
    verdict: 'INTERNAL-SIM', unlock: 'exit corridor WSTEEM→STEEM runs on the engine rail (armed-needs-sovereign-identity, dex/agent.json); then R7',
    why: 'the sim book is labeled SIM — the corridor to real value is the peg-out rail, not a promise' });
  // R12 — TRON door (WTRX corridor)
  routes.push({ id: 'R12', from: 'WTRX', to: 'TRX→USDT', via: 'TRON-RAIL', legs: [{ venue: 'tron-door', pair: 'WTRX→TRX' }],
    sizeNote: '—', quote: null, verdict: 'GATED-KEYS', unlock: 'sovereign TRON identity (relay identities.tron = null; custody 2.0 TRX, peg-outbox threshold 1.05 TRX)', why: 'the deposit door is live (dex/watch.json); the signing identity is not' });
  return routes;
}

// ── arb net rows ────────────────────────────────────────────────────────────
function buildArb(ctx) {
  const { steem, hive, cex, he, saos, implied, impliedHive } = ctx;
  const rows = [];
  // A1 — SBD/STEEM internal vs the CEX-implied fair (the lead-lag edge)
  if (steem && implied != null) {
    const gross = +(((steem.mid - implied) / implied) * 10000).toFixed(2);
    const net = arbNet(Math.abs(gross), 0, SLIP_BPS);
    rows.push({ id: 'A1', name: 'SBD/STEEM internal vs CEX-implied fair (lead-lag)', legs: ['steem-internal', 'cex:STEEMUSDT+SBDUSDT'],
      localMid: steem.mid, impliedFair: implied, grossBps: gross, feesBps: 0, slipBps: SLIP_BPS, netBps: net,
      thresholdBps: arbThreshold(steem.spreadPct), driftPct: null,
      verdict: arbVerdict(net, arbThreshold(steem.spreadPct), true, null),
      railOwner: 'headcorner (STEEM active — LIVE)',
      why: 'maker lead-lag: when the CEX leads, we re-center first (the counter-grid anchor) and get filled by local traders who lag' });
  } else rows.push({ id: 'A1', name: 'SBD/STEEM internal vs CEX-implied fair', legs: ['steem-internal', 'cex'], verdict: 'FEED-STALE', railOwner: 'headcorner', why: 'a needed leg did not answer — never guessed' });
  // A2 — HBD/HIVE vs implied (HBD LAW: a real HBD/USDT leg is required; the SBD
  // price is refused as the HBD proxy — the name-is-not-the-asset law)
  if (hive && impliedHive != null) {
    const gross = +(((hive.mid - impliedHive) / impliedHive) * 10000).toFixed(2);
    const net = arbNet(Math.abs(gross), 0, SLIP_BPS);
    rows.push({ id: 'A2', name: 'HBD/HIVE internal vs CEX-implied fair (real HBD leg)', legs: ['hive-internal', 'cex:HBDUSDT+HIVEUSDT'],
      localMid: hive.mid, impliedFair: impliedHive, grossBps: gross, feesBps: 0, slipBps: SLIP_BPS, netBps: net,
      thresholdBps: arbThreshold(hive.spreadPct), driftPct: null,
      verdict: arbVerdict(net, arbThreshold(hive.spreadPct), true, null),
      railOwner: 'headcorner-hive (NO-KEYS — CR-0068 measured)', why: 'the rail is quoted but unkeyed — plan only' });
  } else rows.push({ id: 'A2', name: 'HBD/HIVE internal vs CEX-implied fair', legs: ['hive-internal', 'cex'], verdict: 'FEED-STALE', railOwner: 'headcorner-hive',
    why: 'no readable HBD/USDT leg (SBD is refused as the HBD proxy — the assets are different dollars); never guessed' });
  // A3 — SWAP.HIVE:SWAP.BTC peg drift vs the CEX cross
  const btcRef = cexMid(cex, 'BTCUSDT'), hiveRef = cexMid(cex, 'HIVEUSDT');
  const btcPool = (he.rows || []).find((r) => r.pair === 'SWAP.HIVE:SWAP.BTC');
  if (btcPool && btcRef.mid > 0 && hiveRef.mid > 0) {
    const cross = btcRef.mid / hiveRef.mid; // USDT/HIVE → HIVE per BTC
    const drift = pegDrift(btcPool.priceQuotePerBase, cross);
    const gross = drift != null ? +(Math.abs(drift) * 100).toFixed(2) : null;
    const net = gross != null ? arbNet(gross, HE_SWAP_FEE_BPS + 75, SLIP_BPS) : null;
    rows.push({ id: 'A3', name: 'SWAP.HIVE:SWAP.BTC pool vs CEX cross (peg drift)', legs: ['he-pool', 'cex:BTCUSDT+HIVEUSDT'],
      poolPriceHivePerBtc: btcPool.priceQuotePerBase, cexCrossHivePerBtc: +cross.toFixed(6), grossBps: gross,
      feesBps: +(HE_SWAP_FEE_BPS + 75).toFixed(2), slipBps: SLIP_BPS, netBps: net, thresholdBps: arbThreshold(0.4), driftPct: drift,
      verdict: arbVerdict(net, arbThreshold(0.4), true, drift), railOwner: 'headcorner-hive (NO-KEYS + HE RPC)',
      why: 'the custodial peg is real only while the pool hugs the cross — 1.5% drift halts the venue' });
  } else rows.push({ id: 'A3', name: 'SWAP.HIVE:SWAP.BTC pool vs CEX cross', legs: ['he-pool', 'cex'], verdict: 'FEED-STALE',
    railOwner: 'headcorner-hive', why: he.alive ? 'a CEX leg did not answer' : (he.why || 'HE dark') });
  // A4 — SAOS/USDS vs its own ref (internal honesty probe)
  const saosPool = (saos.pools || []).find((p) => p.pair === 'SAOS/USDS');
  if (saosPool && saos.assets && saos.assets.SAOS > 0) {
    const drift = pegDrift(saosPool.mid, saos.assets.SAOS);
    rows.push({ id: 'A4', name: 'SAOS/USDS pool vs booked ref price (internal)', legs: ['saos-pool'],
      poolMid: saosPool.mid, refPrice: saos.assets.SAOS, grossBps: drift != null ? +(Math.abs(drift) * 100).toFixed(2) : null,
      feesBps: saosPool.feeBps, slipBps: SLIP_BPS, netBps: drift != null ? arbNet(Math.abs(drift) * 100, saosPool.feeBps, SLIP_BPS) : null,
      thresholdBps: arbThreshold(0.4), driftPct: drift, verdict: arbVerdict(drift != null ? arbNet(Math.abs(drift) * 100, saosPool.feeBps, SLIP_BPS) : null, arbThreshold(0.4), drift != null, drift),
      railOwner: 'saos-dex engine (operator-gated)', why: 'internal-AMM honesty: the pool may not wander from the booked ref unnoticed' });
  } else rows.push({ id: 'A4', name: 'SAOS/USDS pool vs booked ref price', legs: ['saos-pool'], verdict: 'FEED-STALE', railOwner: 'saos-dex engine', why: 'mirror unreadable or ref price absent' });
  return rows;
}

// ── counter-grid rows (the opposing grids) ──────────────────────────────────
function buildCounterGrids(ctx) {
  const { steem, hive, cex, implied, impliedHive, balances } = ctx;
  const out = {};
  const steemRef = cexMid(cex, 'STEEMUSDT');
  if (steem) {
    const useImplied = implied != null;
    const anchor = +((useImplied ? implied : steem.mid)).toFixed(8); // the booked anchor is THE number the rungs derive from
    const spacing = spacingLaw(steemRef.pct24h != null ? steemRef.pct24h : steem.pct24h);
    const steemVal = balances.steem ? balances.steem.liquid * steem.mid : 0;
    const sbdVal = balances.steem ? balances.steem.sbd : 0;
    const share = (steemVal + sbdVal) > 0 ? steemVal / (steemVal + sbdVal) : 0.5;
    const g = counterGrid({ anchor, spacingBps: +(spacing * 100).toFixed(0), steemShare: share,
      steemLiquid: balances.steem ? balances.steem.liquid : 0, quoteLiquid: balances.steem ? balances.steem.sbd : 0,
      capPerRungSteem: POLICY_MAX_TIER_S, capPerRungQuote: POLICY_MAX_TIER_S * anchor,
      baseUnit: 'STEEM', quoteUnit: 'SBD' });
    out.steem = { market: 'SBD/STEEM (STEEM internal)', anchor: +anchor.toFixed(8), anchorSource: useImplied ? 'CEX-IMPLIED-FAIR (SBDUSDT/STEEMUSDT — lead-lag anchor, the opposing side of the local book)' : 'LOCAL-MID-FALLBACK (CEX feed stale)',
      localMid: steem.mid, spreadPct: steem.spreadPct, spacingPct: spacing, ...g,
      liquid: balances.steem, inventoryShareSteem: +share.toFixed(4),
      verdict: 'PLAN-OWNER-GATED-NOT-BROADCAST', executor: 'market-exec.cjs / saos-dex grid-beat (owner-gated signing surfaces)' };
  }
  if (hive) {
    const useImplied = impliedHive != null;
    const anchor = +((useImplied ? impliedHive : hive.mid)).toFixed(8);
    const hiveRef = cexMid(cex, 'HIVEUSDT');
    const spacing = spacingLaw(hiveRef.pct24h != null ? hiveRef.pct24h : hive.pct24h);
    const g = counterGrid({ anchor, spacingBps: +(spacing * 100).toFixed(0), steemShare: 0.5,
      steemLiquid: balances.hive ? balances.hive.liquid : 0, quoteLiquid: balances.hive ? balances.hive.hbd : 0,
      capPerRungSteem: 0.2, capPerRungQuote: 0.2 * anchor, baseUnit: 'HIVE', quoteUnit: 'HBD', rungsPerSide: 3 });
    out.hive = { market: 'HBD/HIVE (HIVE internal)', anchor: +anchor.toFixed(8), anchorSource: useImplied ? 'CEX-IMPLIED-FAIR' : 'LOCAL-MID-FALLBACK (CEX feed stale)',
      localMid: hive.mid, spreadPct: hive.spreadPct, spacingPct: spacing, ...g,
      liquid: balances.hive, inventoryShareSteem: 0.5,
      verdict: 'PLAN-OWNER-GATED-NOT-BROADCAST', executor: 'saos-dex grid-beat HIVE leg (owner-gated; keys measured absent — CR-0068)' };
  }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────
function stasisCheck() {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'STASIS.json'), 'utf8'));
    return st && st.active === true ? st : null;
  } catch (_) { return null; }
}
function writeBook(obj) {
  const tmp = OUT_JSON + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, OUT_JSON);
}
function selftest() {
  const checks = [];
  const c = (cond, name) => checks.push({ ok: !!cond, name });
  const rc = routeCost([{ rate: 2, feeBps: 30, impactBps: 0 }, { rate: 1.5, feeBps: 0, impactBps: 100 }]);
  c(rc.out === 2 * 0.997 * 1.5 * 0.99, 'routeCost-f gymnastics') ;
  c(arbNet(200, 25, 20) === 155, 'arbNet-law');
  c(arbThreshold(0.43) === 2 * (21.5 + 40), 'arbThreshold-law');
  c(arbVerdict(160, 123, true, null) === 'CANDIDATE-FOK', 'verdict-candidate');
  c(arbVerdict(100, 123, true, null) === 'BELOW-FLOOR', 'verdict-below-floor');
  c(arbVerdict(999, 1, true, 2.1) === 'PEG-DRIFT-HALT', 'verdict-peg-halt');
  c(arbVerdict(999, 1, false, null) === 'FEED-STALE', 'verdict-feed-stale');
  c(pegDrift(1.01 * 500000, 500000) === 1, 'peg-drift-pct');
  c(impliedFair(0.6577, 0.0627) === +(0.0627 / 0.6577).toFixed(8), 'implied-fair-law (quoteUsdt/baseUsdt)');
  c(impliedFair(0, 5) === null && impliedFair(5, 0) === null, 'implied-fair-zero-law');
  c(spacingLaw(0.1) === 0.4 && spacingLaw(40) === 4 && spacingLaw(999) === 6, 'spacing-law');
  c(skewShiftBps(1) === 50 && skewShiftBps(0) === -50 && skewShiftBps(0.5) === 0, 'skew-flip-law');
  const g = counterGrid({ anchor: 0.1, spacingBps: 100, steemShare: 1, steemLiquid: 30, quoteLiquid: 10, capPerRungSteem: 1.25, capPerRungQuote: 0.125 });
  c(g.anchorAdj === +(0.1 * (1 - 50 / 10000)).toFixed(8), 'grid-skew-shift');
  c(g.rungs.filter((r) => r.side === 'sell').every((r) => r.size === Math.min(1.25, 30 * 0.9 / 3)), 'grid-sell-cap');
  const ps = poolSwapOut(1000, 1000, 10, 0);
  c(Math.abs(ps.out - (1000 - 1000000 / 1010)) < 1e-6 && ps.impactBps === 99.01, 'pool-swap-law');
  const ok = checks.filter((x) => x.ok).length;
  console.log(`DEX-ROUTER-SELFTEST-OK ${ok}/${checks.length}`);
  if (ok !== checks.length) { for (const x of checks) if (!x.ok) console.error('SELFTEST-FAIL ' + x.name); }
  return ok === checks.length ? 0 : 1;
}

(async () => {
  if (require.main !== module) return; // judge separation (R40 base repair): requiring the laws never fires a tick — dex-core imports the FLOOR/parity laws, the evals import the exports; a tick only runs when the router IS the main
  const arg = (process.argv[2] || 'status').toLowerCase();
  if (arg === 'selftest') process.exit(selftest());
  const at = new Date().toISOString();
  // STASIS before any read/write (law 3)
  const stasis = stasisCheck();
  if (stasis) {
    writeBook({ protocol: 'SAOS-DEX-ROUTER/1', at, agent: 'dex-router v1.0.0 (R39 SWAP-NET, CR-0069)', mode: 'KEYLESS-READ',
      verdict: 'DEX-ROUTER-HALTED-STASIS', stasisHalted: true, stasisReason: stasis.reason || null, venues: {}, routes: [], arb: [], counterGrid: {}, errors: [] });
    console.log(`STASIS-HALT dex-router · ${at}`);
    return;
  }
  const out = { protocol: 'SAOS-DEX-ROUTER/1', at, agent: 'dex-router v1.0.0 (R39 SWAP-NET, CR-0069)', mode: 'KEYLESS-READ', stasisHalted: false,
    laws: ['official sources only', 'keyless: the router plans, owner-gated desks sign', 'fail-soft exit 0 (dark feeds are honest rows)',
      'verdict authority inherited from Z-27 (dex-book/bridge-desk)', 'single canon book + append-only history', 'honest money: the powerdown drip is the booked fuel law'],
    venues: {}, routes: [], arb: [], counterGrid: {}, tiers: {}, summary: {}, errors: [] };

  const results = await Promise.allSettled([
    readInternalBook(STEEM_NODE, 'steem'), readInternalBook(HIVE_NODE, 'hive'), readCexRefs(), readHePools(), readBalances(),
  ]);
  const steem = results[0].status === 'fulfilled' ? results[0].value : null;
  const hive = results[1].status === 'fulfilled' ? results[1].value : null;
  const cex = results[2].status === 'fulfilled' ? results[2].value : [];
  const he = results[3].status === 'fulfilled' ? results[3].value : { alive: false, rows: [], why: 'HE probe crashed' };
  const balances = results[4].status === 'fulfilled' ? results[4].value : { steem: null, hive: null };
  for (const [i, name] of [[0, 'steem-internal'], [1, 'hive-internal'], [2, 'cex-refs'], [3, 'he-pools'], [4, 'balances']]) {
    if (results[i].status === 'rejected') out.errors.push({ venue: name, error: String(results[i].reason && results[i].reason.message || results[i].reason).slice(0, 90) });
  }
  const saos = readSaosMirror();
  const inherited = readInheritedBooks();

  const steemRef = cexMid(cex, 'STEEMUSDT');
  const sbdRef = cexMid(cex, 'SBDUSDT');
  const implied = sbdRef.mid > 0 && steemRef.mid > 0 ? impliedFair(sbdRef.mid, steemRef.mid) : null;
  const hiveRef = cexMid(cex, 'HIVEUSDT');
  const hbdReal = cexMid(cex, 'HBDUSDT'); // the HBD LAW: only a real HBD/USDT leg may price HBD/HIVE
  const impliedHive = hbdReal.mid > 0 && hiveRef.mid > 0 ? impliedFair(hbdReal.mid, hiveRef.mid) : null;

  out.venues = {
    'steem-internal': steem ? { alive: true, ...steem } : { alive: false, why: 'node did not answer' },
    'hive-internal': hive ? { alive: true, ...hive } : { alive: false, why: 'node did not answer' },
    'cex-refs': { rows: cex, primarySymbols: ['STEEMUSDT', 'HIVEUSDT', 'BTCUSDT', 'SBDUSDT'], note: 'public tickers, no keys; SBD only on HTX (measured 2026-10-04)' },
    'he-pools': he,
    'saos-mirror': { alive: saos.alive, engine: saos.engine, publishedAt: saos.publishedAt, mirrorAgeHours: saos.mirrorAgeHours, pools: saos.pools.map((p) => ({ pair: p.pair, feeBps: p.feeBps, mid: p.mid, lpYieldBps: p.lpYieldBps, swaps: p.swaps })), assets: saos.assets },
    inherited: { dexBook: inherited.dexBook ? { at: inherited.dexBook.at, verdictAuthority: 'Z-27' } : null, bridgeBook: inherited.bridgeBook ? { at: inherited.bridgeBook.at, verdictAuthority: 'Z-27' } : null },
  };

  const ctx = { steem, hive, cex, he, saos, implied, impliedHive, balances };
  out.routes = buildRoutes(ctx);
  out.arb = buildArb(ctx);
  out.counterGrid = buildCounterGrids(ctx);

  out.tiers = {
    t0_internal_book: { venue: 'SAOS internal AMM + steem internal market', state: 'LIVE (steem keyed; saos = engine operator-gated)' },
    t1_wrapped_pools: { venue: 'Hive-Engine diesel pools', state: he.alive ? 'QUOTED — gated on HIVE keys + inventory' : 'RPC-DARK (multi-mirror probed, honest)' },
    t2_external_rails: { venue: 'CEX (MEXC/Binance/HTX) + no-account exchangers', state: 'C-GATE-OPERATOR for size; no-account STEEM/HIVE paths measured disabled/blocked (Z-27 books embedded below)', inheritedBridge: inherited.bridgeBook ? inherited.bridgeBook.raw : null },
  };

  const liveRoutes = out.routes.filter((r) => r.verdict === 'LIVE-KEYED');
  const candidates = out.arb.filter((r) => r.verdict === 'CANDIDATE-FOK');
  const halts = out.arb.filter((r) => r.verdict === 'PEG-DRIFT-HALT');
  out.summary = {
    venuesAlive: [steem ? 'steem-internal' : null, hive ? 'hive-internal' : null, he.alive ? 'he-pools' : null, saos.alive ? 'saos-mirror' : null].filter(Boolean),
    routesTotal: out.routes.length, routesLiveKeyed: liveRoutes.map((r) => r.id),
    routesGated: out.routes.filter((r) => r.verdict.startsWith('GATED') || r.verdict === 'C-GATE-OPERATOR').map((r) => `${r.id}:${r.verdict}`),
    routesNoRail: out.routes.filter((r) => r.verdict === 'NO-RAIL').map((r) => r.id),
    arbCandidates: candidates.map((r) => r.id), pegDriftHalts: halts.map((r) => r.id),
    counterGridMarkets: Object.keys(out.counterGrid),
    verdict: steem && (out.routes.length >= 10) ? 'SWAP-NET-LIVE' : 'PARTIAL',
  };

  try {
    fs.appendFileSync(HISTORY, JSON.stringify({ at, verdict: out.summary.verdict, impliedFair, impliedHive,
      localMidSteem: steem ? steem.mid : null, edgeBpsSteem: (out.arb.find((r) => r.id === 'A1') || {}).grossBps ?? null,
      heAlive: he.alive, cexRefs: cex.map((r) => ({ venue: r.venue, symbol: r.symbol, mid: r.mid })),
      arbCandidates: out.summary.arbCandidates, pegHalts: out.summary.pegDriftHalts, routesLive: out.summary.routesLiveKeyed.length, errors: out.errors.length }) + '\n');
  } catch (e) { out.errors.push({ venue: 'history', error: String(e.message).slice(0, 80) }); }

  writeBook(out);
  const md = [
    '# dex-router — SWAP-NET (R39, CR-0069)',
    '',
    `At: ${at} · Verdict: **${out.summary.verdict}** · mode: KEYLESS-READ (the router plans; owner-gated desks sign)`,
    '',
    `Venues alive: ${out.summary.venuesAlive.join(', ') || 'none'} · Routes: ${out.summary.routesTotal} (LIVE-KEYED: ${out.summary.routesLiveKeyed.join(',') || 'none'}) · Arb candidates: ${out.summary.arbCandidates.join(',') || 'none'} · Peg halts: ${out.summary.pegDriftHalts.join(',') || 'none'}`,
    '',
    '| Route | From→To | Verdict | Quote | Unlock |',
    '|---|---|---|---|---|',
    ...out.routes.map((r) => `| ${r.id} ${r.via} | ${r.from}→${r.to} | ${r.verdict} | ${r.quote ? r.quote.in + ' → ' + r.quote.out : '—'} | ${r.unlock || '—'} |`),
    '',
    'Arb net (floor law: net must beat 2×(capture+0.4% floor); FOK legs only, single block):',
    ...out.arb.map((r) => `- ${r.id} ${r.name}: net ${r.netBps != null ? r.netBps + 'bps' : '—'} vs threshold ${r.thresholdBps}bps → **${r.verdict}** · ${r.why || ''}`),
    '',
    'Counter-grids (opposing grids anchored to the CEX-implied fair, skewed by inventory, PLAN-OWNER-GATED-NOT-BROADCAST):',
    ...Object.values(out.counterGrid).map((g) => `- ${g.market}: anchor ${g.anchor} (${g.anchorSource}) · spacing ${g.spacingPct}% · skew ${g.skewShiftBps}bps · rungs ${g.rungs.length} · executor ${g.executor}`),
    '',
    `Laws: ${out.laws.join(' · ')}`,
    '',
    `Errors: ${out.errors.length ? JSON.stringify(out.errors) : '0'}`,
    '',
    'Sources: api.steemit.com, api.hive.blog (condenser), api.hive-engine.com mirrors, Binance/MEXC/HTX public tickers, dex/state.json mirror, Z-27 books. Zero secrets.',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);
  console.log(`dex-router: ${out.summary.verdict} · venues ${out.summary.venuesAlive.length} · routes ${out.summary.routesTotal} (live ${out.summary.routesLiveKeyed.length}) · arb ${out.arb.length} (cand ${out.summary.arbCandidates.length}) · grids ${out.summary.counterGridMarkets.length} · errors ${out.errors.length}`);
  return;
})().catch((e) => {
  try {
    fs.writeFileSync(OUT_JSON, JSON.stringify({ protocol: 'SAOS-DEX-ROUTER/1', at: new Date().toISOString(), agent: 'dex-router v1.0.0', verdict: 'ERROR', error: String(e.message).slice(0, 200), errors: [{ fatal: true, message: String(e.message).slice(0, 200) }] }, null, 1));
  } catch (_) { /* the error book must not crash */ }
  console.error('dex-router FATAL (booked honestly):', e.message);
  process.exit(0);
});

module.exports = { routeCost, impliedFair, arbNet, arbThreshold, pegDrift, arbVerdict, spacingLaw, skewShiftBps, counterGrid, poolSwapOut };
