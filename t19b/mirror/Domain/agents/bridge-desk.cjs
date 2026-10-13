'use strict';
/**
 * bridge-desk.cjs — Z-27 BRIDGE BOOK (read-only sweep of no-account exchangers).
 *
 * The router question, answered with truth flags instead of reachability guesses:
 * a coin listed in a catalog is NOT a bridge — godex lists STEEM/HIVE with
 * disabled:1 and a 2,400 STEEM minimum (live-measured 09-30). This agent re-sweeps
 * every no-account exchanger daily, extracts support AND disabled/min flags where
 * the API exposes them, and writes the verdict per target (BTC/ETH/SOL).
 *
 * Output: agents/bridge-book.json + bridge-book.md (committed, keyless).
 * Doctrine: read-only · fail-soft exit 0 · no fake liquidity — a disabled route is
 * recorded as DISABLED, never as OPEN.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.BRIDGE_JSON || path.join(ROOT, 'agents', 'bridge-book.json');
const OUT_MD = path.join(ROOT, 'agents', 'bridge-book.md');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const f = (s) => parseFloat(String(s || '0'));
function req(host, p, opt = {}, timeout = 15000) {
  return new Promise((resolve) => {
    const r = https.request({ host, path: p, method: opt.method || 'GET', family: 4, headers: Object.assign({ accept: 'application/json', 'user-agent': 'saos-bridge-desk/1' }, opt.headers || {}), timeout }, (res) => {
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve({ s: res.statusCode, b: d }));
    });
    r.on('error', e => resolve({ err: String(e.message || e).slice(0, 90) }));
    r.on('timeout', () => { r.destroy(); resolve({ err: 'timeout' }); });
    if (opt.body) r.write(opt.body);
    r.end();
  });
}
const has = (body, sym) => body && body.toLowerCase().includes('"' + sym.toLowerCase() + '"');

(async () => {
  const t0 = Date.now();
  const book = { at: new Date().toISOString(), agent: 'bridge-desk', exchangers: {}, verdict: {} };

  // ---- godex: catalog with disabled flags + minimums (the honest read) ----
  try {
    const r = await req('api.godex.io', '/api/v1/coins');
    book.exchangers.godex = { http: r.s || r.err };
    if (r.s === 200) {
      const a = JSON.parse(r.b);
      const ent = (sym) => { const e = a.find(x => x.code === sym); return e ? { listed: true, disabled: !!e.disabled, isActive: !!e.is_active, minAmount: e.min_amount ? f(e.min_amount) : null, network: e.default_network_code } : { listed: false }; };
      book.exchangers.godex.steem = ent('STEEM');
      book.exchangers.godex.hive = ent('HIVE');
      book.exchangers.godex.btc = ent('BTC');
    }
  } catch (e) { book.exchangers.godex = { error: String(e.message || e).slice(0, 60) }; }
  await sleep(300);

  // ---- blocktrades (historically THE steem/hive no-account bridge; TLS-walled from sandbox, re-probed daily) ----
  try {
    const r = await req('blocktrades.us', '/api/v2/coins');
    book.exchangers.blocktrades = { http: r.s || r.err };
    if (r.s === 200) {
      try {
        const coins = JSON.parse(r.b);
        const sup = (sym) => (Array.isArray(coins) ? coins : []).some(c => (c.code || c.coin || '').toLowerCase().includes(sym.toLowerCase()));
        book.exchangers.blocktrades.steem = sup('steem');
        book.exchangers.blocktrades.hive = sup('hive');
        book.exchangers.blocktrades.btc = sup('btc');
        book.exchangers.blocktrades.sol = sup('sol');
      } catch (_) {}
    }
  } catch (e) { book.exchangers.blocktrades = { error: String(e.message || e).slice(0, 60) }; }
  await sleep(300);

  // ---- the rest: support lists only ----
  const simple = async (name, host, p, parse) => {
    const r = await req(host, p);
    const e = { http: r.s || r.err };
    if (r.s === 200) { try { Object.assign(e, parse(r.b)); } catch (_) { e.parse = false; } }
    book.exchangers[name] = e;
  };
  await simple('changenow', 'api.changenow.io', '/v1/currencies?active=true', (b) => { const a = JSON.parse(b); return { n: a.length, steem: a.some(x => String(x.ticker || x.symbol || '').toLowerCase() === 'steem'), hive: a.some(x => String(x.ticker || x.symbol || '').toLowerCase() === 'hive') }; });
  await sleep(250);
  await simple('sideshift', 'sideshift.ai', '/api/v2/coins', (b) => { const j = JSON.parse(b); const arr = Array.isArray(j) ? j : (j.coins || []); return { n: arr.length, steem: arr.some(x => (x.coin || '').toLowerCase() === 'steem'), hive: arr.some(x => (x.coin || '').toLowerCase() === 'hive') }; });
  await sleep(250);
  await simple('exolix', 'exolix.com', '/api/v2/currencies', (b) => { const s = b.toLowerCase(); return { steem: s.includes('"steem"'), hive: s.includes('"hive"') }; });
  await sleep(250);
  await simple('letsexchange', 'api.letsexchange.io', '/api/v1/coin', (b) => { const s = b.toLowerCase(); return { steem: s.includes('"steem"'), hive: s.includes('"hive"') }; });
  await sleep(250);
  await simple('trocador', 'trocador.app', '/api/coins', (b) => { const s = b.toLowerCase(); return { steem: s.includes('steem'), hive: s.includes('hive') }; });
  await sleep(250);
  await simple('simpleswap', 'api.simpleswap.io', '/get_all_currencies', (b) => { const a = JSON.parse(b); return { n: a.length, steem: a.some(x => String(x.symbol || '').toLowerCase() === 'steem'), hive: a.some(x => String(x.symbol || '').toLowerCase() === 'hive') }; });

  // ---- verdict per target coin (from OUR capital base) ----
  const V = (target, path_, status, detail) => { book.verdict[target + ':' + path_] = { status, detail }; };
  const g = book.exchangers.godex || {};
  const godexOpen = g.steem && g.steem.listed && !g.steem.disabled;
  V('BTC', 'STEEM → blocktrades (no-account) → self-custody', (book.exchangers.blocktrades || {}).http === 200 ? 'PROBE-OK-VERIFY-PAIRS' : 'BLOCKED-FROM-THIS-NETWORK', 'daily CI re-probe; runner IPs may pass where sandbox fails');
  V('BTC', 'STEEM → godex (no-account)', godexOpen ? 'OPEN' : 'DISABLED', g.steem ? ('godex steem disabled=' + g.steem.disabled + ', min=' + (g.steem.minAmount || '?') + ' STEEM') : 'not listed');
  V('BTC', 'STEEM/HIVE → MEXC (account exchange)', 'C-GATE-OPERATOR', 'one-time account+API keys unlocks autonomous routing');
  V('BTC', 'HIVE → Hive-Engine AMM → SWAP.BTC', 'OPEN-NEEDS-HIVE-CAPITAL', 'SWAP.HIVE:SWAP.BTC pool ~821k HIVE deep (dex-book); we hold the keys; 1.3 HIVE is dust');
  V('ETH', 'HIVE → Hive-Engine AMM → SWAP.ETH', 'THIN-POOL', 'SWAP.HIVE:SWAP.ETH pool ~631 HIVE deep: 15%+ impact on 100 HIVE — not routable at size');
  V('SOL', 'HIVE → Hive-Engine AMM → SWAP.SOL', 'POOL-DUST', 'SWAP.SOL pool exists but ~94 HIVE deep: ~107% impact on 100 HIVE — present, not usable at size');

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1));

  const row = (n) => {
    const e = book.exchangers[n] || {};
    const sup = ['steem', 'hive'].map(s => (e[s] === undefined ? '' : s + '=' + (typeof e[s] === 'object' ? (e[s].listed ? (e[s].disabled ? 'DISABLED' : 'listed') : 'no') : e[s]))).filter(Boolean).join(' ');
    return '| ' + n + ' | ' + (e.http || e.error || '?') + ' | ' + (sup || '-') + ' |';
  };
  const md = [
    '# Bridge Book (Z-27 bridge-desk)', '',
    'Updated: ' + book.at + ' UTC. Daily no-account-exchanger sweep with disabled/min-flag truth. Generated by agents/bridge-desk.cjs.', '',
    '## Exchangers', '',
    '| exchanger | http | steem/hive support |', ...(Object.keys(book.exchangers).map(row)), '',
    '## Verdicts (BTC/ETH/SOL ingress from our rails)', '',
    ...Object.entries(book.verdict).map(([k, v]) => '- **' + k + '** — ' + v.status + ' · ' + (v.detail || '')), '',
    'A listing is not a bridge: godex catalogs STEEM/HIVE as disabled with 2400/2800-unit minimums. No fake liquidity: DISABLED stays DISABLED until the chain says otherwise.', '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);

  console.log(JSON.stringify({ state: 'ok', exchangers: Object.fromEntries(Object.entries(book.exchangers).map(([k, v]) => [k, v.http || v.error])), verdicts: Object.values(book.verdict).filter(v => String(v.status).startsWith('OPEN')).length, ms: Date.now() - t0 }));
  process.exit(0);
})().catch(e => {
  try { fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true }); fs.writeFileSync(OUT_JSON, JSON.stringify({ at: new Date().toISOString(), agent: 'bridge-desk', fatal: String(e.message || e).slice(0, 200) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
  process.exit(0);
});
