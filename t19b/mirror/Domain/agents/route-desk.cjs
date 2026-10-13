'use strict';
/**
 * route-desk.cjs — Z-26 LIQUIDITY ROUTER BOOK (keyless, read-only).
 *
 * R-ONEBLOC-3 (2026-10-01): VERDICT AUTHORITY MOVED TO Z-27.
 * Z-27's dex-book.cjs (live AMM depth + slippage) and bridge-desk.cjs (per-coin
 * disabled/min-flag truth) are now the ONLY books allowed to say OPEN/BLOCKED.
 * This agent keeps the ORACLE + BRIDGE-REACHABILITY probes (real data the other
 * desks do not collect) but its own path verdicts are LEGACY and frozen; the
 * output is stamped so no reader mistakes it for a decision book. This kills
 * the two-books-contradict-each-other defect (godex 404 vs 200, SWAP.SOL
 * "unverified" vs measured pool) without losing the probe value.
 *
 * עונה-יומית-על-השאלה: מאיפה-נכנס-נזילות-של-BTC/ETH/SOL/LTC/DOGE אל-הרשת-שלנו.
 * אורקלים (CoinPaprika+Coinlore+MEXC), ספר-HE-DEX, וגשרים-ללא-חשבון.
 *
 * פלט: agents/routes.json + agents/routes.md (מחויבים-לrepo) · אפס-סודות · fail-soft.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.ROUTES_JSON || path.join(ROOT, 'agents', 'routes.json');
const OUT_MD = path.join(ROOT, 'agents', 'routes.md');

function get(host, p, timeout = 12000) {
  return new Promise((resolve) => {
    const req = https.request({ host, path: p, method: 'GET', servername: host, family: 4, headers: { accept: 'application/json', 'user-agent': 'saos-route-desk/1' }, timeout }, (res) => {
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ error: String(e.message || e).slice(0, 60) }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}
const f = (s) => parseFloat(String(s || '0'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function oracles() {
  const o = { paprika: {}, coinlore: {}, mexc: {}, source: [] };
  let r = await get('api.coinpaprika.com', '/v1/tickers?quotes=USD&ids=btc-bitcoin,eth-ethereum,sol-solana,hive-hive,steem-steem,ltc-litecoin,doge-dogecoin');
  if (r.status === 200) {
    try { for (const t of JSON.parse(r.body)) o.paprika[t.symbol] = t.quotes.USD.price; o.source.push('paprika'); } catch (_) {}
  }
  await sleep(400);
  r = await get('api.coinlore.net', '/api/tickers/?start=0&limit=100');
  if (r.status === 200) {
    try { for (const t of JSON.parse(r.body).data || []) o.coinlore[t.symbol] = f(t.price_usd); o.source.push('coinlore'); } catch (_) {}
  }
  for (const s of ['STEEMUSDT', 'HIVEUSDT', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT']) {
    r = await get('api.mexc.com', '/api/v3/ticker/price?symbol=' + s);
    if (r.status === 200) { try { o.mexc[s.replace('USDT', '')] = f(JSON.parse(r.body).price); } catch (_) {} }
    await sleep(250);
  }
  const pick = (sym) => o.paprika[sym] || o.coinlore[sym] || null;
  return { btc: pick('BTC'), eth: pick('ETH'), sol: pick('SOL'), hive: pick('HIVE'), steem: pick('STEEM'), ltc: pick('LTC'), doge: pick('DOGE'), raw: o };
}

async function heMarket(hiveUsd) {
  const heFind = (method, params) => new Promise((resolve) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const req = https.request({ host: 'api.hive-engine.com', path: '/rpc/contracts', method: 'POST', family: 4, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 15000 }, (res) => {
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d).result); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload); req.end();
  });
  const metrics = (await heFind('find', { contract: 'market', table: 'metrics', query: {}, limit: 1000, offset: 0 })) || [];
  const want = ['SWAP.BTC', 'SWAP.ETH', 'SWAP.SOL', 'SWAP.LTC', 'SWAP.DOGE', 'LEO'];
  const book = [];
  for (const m of metrics) {
    if (!want.includes(m.symbol)) continue;
    const lastHive = f(m.lastPrice);
    book.push({
      symbol: m.symbol, lastPriceHive: m.lastPrice,
      usd: hiveUsd ? +(lastHive * hiveUsd).toFixed(4) : null,
      volume24h: m.volume, bid: m.highestBid, ask: m.lowestAsk,
    });
  }
  return book;
}

async function bridges() {
  const out = {};
  // blocktrades (no-account bridge; TLS may fail from some networks — record honestly)
  let r = await get('blocktrades.us', '/api/v2/coins');
  out.blocktrades = { reachable: r.status === 200, http: r.status || r.error };
  if (r.status === 200) {
    try {
      const coins = JSON.parse(r.body);
      const has = (code) => (Array.isArray(coins) ? coins : []).some(c => (c.coin || c.code || '').toLowerCase().includes(code));
      out.blocktrades.steem = has('steem'); out.blocktrades.hive = has('hive'); out.blocktrades.btc = has('btc'); out.blocktrades.sol = has('sol');
    } catch (_) {}
  }
  await sleep(400);
  r = await get('api.godex.io', '/api/v2/currencies');
  out.godex = { reachable: r.status === 200, http: r.status || r.error };
  if (r.status === 200) { try { const b = r.body.toLowerCase(); out.godex.steem = b.includes('"steem"'); out.godex.hive = b.includes('"hive"'); out.godex.btc = b.includes('"btc"'); } catch (_) {} }
  await sleep(400);
  r = await get('exolix.com', '/api/v2/currencies');
  out.exolix = { reachable: r.status === 200, http: r.status || r.error };
  if (r.status === 200) { try { const b = r.body.toLowerCase(); out.exolix.steem = b.includes('steem'); out.exolix.hive = b.includes('hive'); } catch (_) {} }
  await sleep(400);
  r = await get('api.stealthex.io', '/api/v1/currencies?fixed=true');
  out.stealthex = { reachable: r.status === 200, http: r.status || r.error };
  return out;
}

(async () => {
  const t0 = Date.now();
  const px = await oracles();
  const he = await heMarket(px.hive);
  const br = await bridges();

  const routes = { at: new Date().toISOString(), book: 'LEGACY-PROBE-FEEDER — verdict authority is dex-book.cjs + bridge-desk.cjs (Z-27). Path statuses below are legacy, do not decide from them.', oracles: { btc: px.btc, eth: px.eth, sol: px.sol, hive: px.hive, steem: px.steem, ltc: px.ltc, doge: px.doge }, heMarket: he, bridges: br, paths: [] };

  const P = (target, route, status, detail) => routes.paths.push({ target, route, status, detail });
  // BTC ingress paths (from OUR capital base: headcorner STEEM/HIVE + fuel stream)
  P('BTC', 'STEEM -> blocktrades(no-account) -> self-custody BTC wallet', br.blocktrades && br.blocktrades.reachable && br.blocktrades.steem ? 'OPEN' : 'PROBE-FAILED-FROM-NETWORK', 'probe from CI runner; TLS-blocked from sandbox on 09-30');
  P('BTC', 'STEEM -> MEXC account (deposit+sell) -> BTC withdraw', 'C-GATE-OPERATOR', 'needs MEXC account+API keys (operator one-time action)');
  P('BTC', 'HIVE -> Hive-Engine DEX -> SWAP.BTC', (Array.isArray(he) && he.find(x => x.symbol === 'SWAP.BTC')) ? 'OPEN-NEEDS-HIVE-CAPITAL' : 'MARKET-MISSING', 'active key held; HIVE liquid 1.34 = dust');
  P('ETH', 'HIVE -> HE -> SWAP.ETH', (Array.isArray(he) && he.find(x => x.symbol === 'SWAP.ETH')) ? 'OPEN-NEEDS-HIVE-CAPITAL' : 'NO-LIVE-METRICS', 'check token existence');
  P('SOL', 'any -> HE -> SWAP.SOL', (Array.isArray(he) && he.find(x => x.symbol === 'SWAP.SOL')) ? 'OPEN-NEEDS-CAPITAL' : 'NO-LIVE-METRICS', 'SOL wraps on HE unverified');
  P('LTC', 'STEEM -> blocktrades -> LTC', br.blocktrades && br.blocktrades.reachable ? 'PROBE' : 'PROBE-FAILED-FROM-NETWORK', 'LTC = cheapest bridge coin (low fees)');
  P('LTC', 'HIVE -> HE -> SWAP.LTC', (Array.isArray(he) && he.find(x => x.symbol === 'SWAP.LTC')) ? 'OPEN-NEEDS-HIVE-CAPITAL' : 'MARKET-MISSING', null);
  P('DOGE', 'HIVE -> HE -> SWAP.DOGE', (Array.isArray(he) && he.find(x => x.symbol === 'SWAP.DOGE')) ? 'OPEN-NEEDS-HIVE-CAPITAL' : 'MARKET-MISSING', null);

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(routes, null, 1));

  // markdown mirror (committed, human-readable router book)
  const rows = routes.paths.map(p => '| ' + p.target + ' | ' + p.route + ' | ' + p.status + ' | ' + (p.detail || '') + ' |').join('\n');
  const heRows = Array.isArray(he) ? he.map(x => '| ' + x.symbol + ' | ' + x.lastPriceHive + ' HIVE | $' + x.usd + ' | ' + x.volume24h + ' |').join('\n') : '| HE market: ' + (he && he.error) + ' | | | |';
  const md = [
    '# Liquidity Router Book (Z-26 route-desk) — LEGACY PROBE FEEDER',
    '',
    '> **R-ONEBLOC-3:** verdict authority moved to the Z-27 desks. `dex-book.md` (live AMM depth, slippage) and `bridge-book.md` (per-coin disabled/min-flag truth) are the only decision books. This file keeps the daily oracle + bridge-reachability probes; the path table below is legacy and may disagree with them — do not decide from it.',
    '',
    'Updated: ' + routes.at + ' UTC. Keyless daily mirror: oracles, Hive-Engine wrapped-coin books, no-account bridge probes. Generated by agents/route-desk.cjs.',
    '',
    '## Oracles (USD)',
    '',
    '- BTC ' + (px.btc || 'n/a') + ' | ETH ' + (px.eth || 'n/a') + ' | SOL ' + (px.sol || 'n/a') + ' | HIVE ' + (px.hive || 'n/a') + ' | STEEM ' + (px.steem || 'n/a') + ' | LTC ' + (px.ltc || 'n/a') + ' | DOGE ' + (px.doge || 'n/a'),
    '- MEXC public: STEEM ' + (px.raw.mexc.STEEM || 'n/a') + ' | HIVE ' + (px.raw.mexc.HIVE || 'n/a'),
    '',
    '## Hive-Engine wrapped books (price in USD via HIVE oracle)',
    '',
    '| token | last | usd | vol24h |', heRows,
    '',
    '## Ingress paths for competitor-network liquidity',
    '',
    '| target | path | status | note |', rows,
    '',
    '## Bridge probes (from this run network)',
    '',
    '```json', JSON.stringify(br, null, 1), '```',
    '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);

  console.log(JSON.stringify({ state: 'ok', oracles: routes.oracles, heTokens: Array.isArray(he) ? he.length : he, bridges: Object.fromEntries(Object.entries(br).map(([k, v]) => [k, v.reachable])), paths: routes.paths.length, ms: Date.now() - t0 }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) })); process.exit(0); });
