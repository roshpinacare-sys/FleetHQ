'use strict';
/**
 * pnl-book.cjs — R33 THE P&L VERDICT DESK (CR-0063).
 *
 * The owner's question ("a full month of work — where is the profit?") answered
 * by the ledger itself, not by a promise: one book that replays the append-only
 * fill ledger and renders the sovereignty's REALIZED trading truth — lifetime
 * and post-law windows, the measured edge, the inventory at cost, the capital
 * split (free / locked-in-orders / powered-down inflow schedule).
 *
 * LAWS (in code):
 *  1. READ-ONLY: this desk NEVER signs, NEVER trades. The signing surfaces stay
 *     CR-0036 market-exec and CR-0039 market-cycle; this desk judges them.
 *  2. REPLAY LAW: the verdict is derived by replaying fill-ledger-fills.jsonl
 *     through fill-ledger.cjs's OWN pure core (applyFill/replay/vwapStats) —
 *     one accounting law, zero re-implementation, no second truth.
 *  3. µ-PRECISION: integer micro-units end-to-end (Z-64 law inherited; floats
 *     only at the human-facing rounding boundary, always toFixed(6)).
 *  4. TWO WINDOWS: lifetime AND post-law (the CR-0047 BUY-PREMIUM law time,
 *     default 2026-10-03T22:00:00Z, env PNL_POST_LAW_SINCE). The pre-law window
 *     shows the measured leak honestly; the post-law window is the law's proof.
 *  5. CHAIN READ-BACK (keyless): liquid balances + own-order locks + the
 *     powerdown schedule read from the chain every run; free = liquid − locked
 *     (µ-safe, floored at zero). CHAIN-RECONCILED beats any book (AGENTS.md).
 *  6. STASIS OBEY: the breaker beats the verdict (FATE-DEFENSE #1).
 *  7. EVAL-CONTEXT OFF-SWITCH: PNL_BOOK_SKIP_FETCH=1 → ledger-only verdict,
 *     no network, byte-stable payload (E55 exercises exactly this).
 *  8. FAIL-SOFT EXIT, FAIL-LOUD BOOK: every error is an ERROR row; exit 0
 *     always (treasury law). A silent success is a lie.
 *  9. SINGLE WRITER: agents/pnl-book.json + agents/pnl-book.md. require.main
 *     guard (Z-49): requiring this file for evals must never execute a run.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const LEDGER = require(path.join(__dirname, 'fill-ledger.cjs'));
const OUT_JSON = process.env.PNL_BOOK_JSON || path.join(ROOT, 'agents', 'pnl-book.json');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');
const FILLS_JSONL = process.env.FILL_LEDGER_FILLS || path.join(ROOT, 'agents', 'fill-ledger-fills.jsonl');
const HEAD = process.env.PNL_BOOK_HEAD || LEDGER.HEAD || 'headcorner';
const NODE = process.env.PNL_BOOK_NODE || 'https://api.steemit.com';
const POST_LAW_SINCE = process.env.PNL_POST_LAW_SINCE || '2026-10-03T22:00:00Z'; // CR-0047 law time

const NAI = { SBD: '@@000000013', STEEM: '@@000000021' };

// ── pure core (exported for E55) ─────────────────────────────────────────────
// windowVerdict: one µ-precise replay over a filtered leg window.
function windowVerdict(fills) {
  const inv = LEDGER.replay(fills);
  const v = LEDGER.vwapStats(fills);
  return {
    fills: fills.length,
    sells: v.sells, buys: v.buys,
    sellVwap: v.sell_vwap, buyVwap: v.buy_vwap, edgePct: v.edge_pct,
    realizedSbd: +(inv.realized / 1e6).toFixed(6),
    proceedsUnbasedSbd: +(inv.proceeds_unbased / 1e6).toFixed(6),
    inventorySteem: +(inv.qty / 1e6).toFixed(3),
    inventoryAvgCostSbd: inv.qty > 0 ? +(inv.cost / inv.qty).toFixed(6) : null,
    unclassified: inv.n_unclassified,
  };
}

// pnlVerdict (pure): lifetime + post-law windows from the append-only ledger.
function pnlVerdict(fills, postLawSince = POST_LAW_SINCE) {
  const life = windowVerdict(fills);
  const post = windowVerdict(fills.filter((f) => f && f.timestamp && String(f.timestamp) >= postLawSince));
  return {
    lifetime: life,
    postLaw: { since: postLawSince, ...post },
    edgeLawHolds: post.fills === 0
      ? null
      : (post.sellVwap != null && post.buyVwap != null ? post.edgePct >= -0.0001 : null),
  };
}

// ── chain read-back (keyless, law 5) ────────────────────────────────────────
function rpc(method, params, node = NODE, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const u = new URL(node);
    const req = https.request({ hostname: u.hostname, path: u.pathname || '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); j.error ? reject(new Error(String(j.error.message || 'rpc-error').slice(0, 120))) : resolve(j.result); } catch (_) { reject(new Error('bad-rpc')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    req.write(payload); req.end();
  });
}
const f3 = (s) => Math.round(parseFloat(String(s || '0')) * 1e6); // 3dp asset → µ

async function chainRead() {
  const [accRows, orders] = await Promise.all([
    rpc('condenser_api.get_accounts', [[HEAD]]),
    rpc('database_api.find_limit_orders', { account: HEAD }),
  ]);
  const acc = (accRows && accRows[0]) || {};
  const amt = (a) => parseFloat(a.amount) / Math.pow(10, a.precision || 3);
  const isSbd = (a) => a.nai === NAI.SBD;
  let lockSteem = 0, lockSbd = 0, openOrders = 0;
  for (const od of (orders && orders.orders) || []) {
    openOrders++;
    const sp = od.sell_price, fs = od.for_sale != null ? od.for_sale : parseFloat(od.amount_to_sell && od.amount_to_sell.amount);
    const bs = amt(sp.base);
    const sellingBase = Math.abs(bs - fs / 1000) < 1e-6;
    const sellAsset = sellingBase ? (isSbd(sp.base) ? 'SBD' : 'STEEM') : (isSbd(sp.quote) ? 'SBD' : 'STEEM');
    if (sellAsset === 'STEEM') lockSteem += fs / 1000; else lockSbd += fs / 1000;
  }
  const liquidSteem = f3(acc.balance), liquidSbd = f3(acc.sbd_balance);
  const rateSp = acc.vesting_withdraw_rate ? +(parseFloat(String(acc.vesting_withdraw_rate).replace(/[^\d.]/g, '')) / 1e6).toFixed(3) : null;
  return {
    liquidSteem: +(liquidSteem / 1e6).toFixed(3), liquidSbd: +(liquidSbd / 1e6).toFixed(3),
    lockedSteem: +lockSteem.toFixed(3), lockedSbd: +lockSbd.toFixed(3),
    freeSteem: +Math.max(0, liquidSteem / 1e6 - lockSteem).toFixed(3),
    freeSbd: +Math.max(0, liquidSbd / 1e6 - lockSbd).toFixed(3),
    openOrders,
    powerdown: { active: !!(rateSp && rateSp > 0), rateSp, nextAt: acc.next_vesting_withdrawal || null },
  };
}

// ── canon (single writer, law 9) ─────────────────────────────────────────────
function readCanon() { try { const j = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')); return Array.isArray(j) ? j : (j.rows || []); } catch (_) { return []; } }
function writeCanon(rows) { fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2) + '\n'); }

function heS(x) { return x == null ? '—' : String(x); }
function writeMd(row) {
  const L = [];
  L.push('# pnl-book — ספר פסק-הדין של הרווח (CR-0063)');
  L.push('');
  L.push(`ריצה אחרונה: ${row.ts} · מצב **${row.mode}** · ראש **${row.head}** · פסק דין **${row.verdict}**`);
  L.push('');
  L.push('| מדד | כל החיים | אחרי חוק-הקצה (CR-0047) |');
  L.push('|---|---|---|');
  const pl = row.postLaw || {};
  L.push(`| מילויים | ${heS(row.lifetime && row.lifetime.fills)} | ${heS(pl.fills)} |`);
  L.push(`| רגלי-מכירה / קנייה | ${heS(row.lifetime && row.lifetime.sells)} / ${heS(row.lifetime && row.lifetime.buys)} | ${heS(pl.sells)} / ${heS(pl.buys)} |`);
  L.push(`| VWAP מכירה / קנייה | ${heS(row.lifetime && row.lifetime.sellVwap)} / ${heS(row.lifetime && row.lifetime.buyVwap)} | ${heS(pl.sellVwap)} / ${heS(pl.buyVwap)} |`);
  L.push(`| קצה נמדד | ${row.lifetime && row.lifetime.edgePct != null ? row.lifetime.edgePct + '%' : '—'} | ${pl.edgePct != null ? pl.edgePct + '%' : '—'} |`);
  L.push(`| רווח ממומש (מחזורים מתומחרים) | ${row.lifetime && row.lifetime.realizedSbd != null ? row.lifetime.realizedSbd + ' SBD' : '—'} | ${pl.realizedSbd != null ? pl.realizedSbd + ' SBD' : '—'} |`);
  L.push('');
  const ch = row.chain || {};
  L.push(`| הון נזיל | ${heS(ch.liquidSteem)} STEEM · ${heS(ch.liquidSbd)} SBD |`);
  L.push(`| נעול בפקודות עומדות | ${heS(ch.lockedSteem)} STEEM · ${heS(ch.lockedSbd)} SBD (${heS(ch.openOrders)} פקודות) |`);
  L.push(`| חופשי למדרגות חדשות | ${heS(ch.freeSteem)} STEEM · ${heS(ch.freeSbd)} SBD |`);
  L.push(`| powerdown | ${ch.powerdown && ch.powerdown.active ? `פעיל — ${heS(ch.powerdown.rateSp)} SP לגל, הבא ${heS(ch.powerdown.nextAt)}` : 'לא פעיל'} |`);
  L.push('');
  L.push(`| מלאי בעלות (מהריפליי) | ${row.lifetime && row.lifetime.inventorySteem != null ? row.lifetime.inventorySteem + ' STEEM' : '—'} · עלות ממוצעת ${row.lifetime && row.lifetime.inventoryAvgCostSbd != null ? row.lifetime.inventoryAvgCostSbd : '—'} |`);
  L.push(`| רגליים לא-מסווגות | ${heS(row.lifetime && row.lifetime.unclassified)} (נרשמות בכנות, לעולם לא מנוחשות ל-P&L) |`);
  L.push('');
  L.push(`## שגיאות (${row.errors.length})`);
  for (const e of row.errors) L.push(`- ${e}`);
  L.push('');
  L.push('חוק המקור: פסק הדין נגזר בריפליי מתוך fill-ledger-fills.jsonl דרך הליבה הטהורה של fill-ledger.cjs — חוק חשבונאות אחד, אפס אמת-שנייה. השרשרת היא האמת מאחורי הספרים.');
  fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  const skip = String(process.env.PNL_BOOK_SKIP_FETCH || '') === '1';
  const stasis = (() => { try { const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'STASIS.json'), 'utf8')); return !!(s && (s.active || s.on)); } catch (_) { return false; } })();
  const row = {
    ts: new Date().toISOString(), mode: skip ? 'EVAL-CONTEXT' : 'LIVE', head: HEAD, node: NODE,
    verdict: 'PNL-LIVE', lifetime: null, postLaw: null, chain: null, errors: [], run_index: 0,
  };
  const canon = readCanon();
  row.run_index = canon.length + 1;
  try {
    if (stasis) {
      row.mode = 'STASIS';
      row.verdict = 'SKIPPED-STASIS';
      row.errors.push('STASIS-BRAKE: המפסק פעיל — הספר מדלג על קריאת השרשרת');
    } else {
      const fills = fs.readFileSync(FILLS_JSONL, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
      const v = pnlVerdict(fills, POST_LAW_SINCE);
      row.lifetime = v.lifetime; row.postLaw = v.postLaw; row.edgeLawHolds = v.edgeLawHolds;
      if (skip) row.chain = null;
      else row.chain = await chainRead();
    }
  } catch (e) {
    row.errors.push(String(e.message || e).slice(0, 200));
  }
  row.duration_ms = Date.now() - t0;
  canon.push(row);
  writeCanon(canon);
  writeMd(row);
  const lt = row.lifetime || {};
  const pl = row.postLaw || {};
  console.log(`[pnl-book] verdict=${row.verdict} lifetime realized=${lt.realizedSbd != null ? lt.realizedSbd : 'n/a'} SBD (fills ${lt.fills != null ? lt.fills : '?'}) · post-law fills=${pl.fills != null ? pl.fills : '?'} realized=${pl.realizedSbd != null ? pl.realizedSbd : 'n/a'} · errors=${row.errors.length} in ${row.duration_ms}ms`);
}
if (require.main === module) {
  main().catch((e) => { console.error('[pnl-book] FATAL', String(e.message || e).slice(0, 200)); process.exit(0); });
} else {
  module.exports = { pnlVerdict, windowVerdict, POST_LAW_SINCE, HEAD, OUT_JSON };
}
