'use strict';
/**
 * dex-book.cjs — Z-27 DEPTH BOOK (read-only).
 *
 * The router book (route-desk) tracks prices. This agent tracks DEPTH — the actual
 * order books an armed rail would trade into:
 *   - steem internal market: best bid/ask, mid, depth on both sides, SBD premium vs feed;
 *   - Hive-Engine: real book rows (top-3 each side + spread) for SWAP.BTC/LTC/DOGE/ETH,
 *     LEO; SWAP.SOL existence check (confirmed absent 09-30 — re-checked every run);
 *   - blurt: no DEX exists — recorded as such, not skipped silently.
 *
 * Doctrine: read-only · secretless · fail-soft exit 0.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.DEXBOOK_JSON || path.join(ROOT, 'agents', 'dex-book.json');
const OUT_MD = path.join(ROOT, 'agents', 'dex-book.md');

function rpc(node, method, params, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const u = new URL(node);
    const req = https.request({ hostname: u.hostname, path: u.pathname || '/', method: 'POST', family: 4, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); if (j.error) return reject(new Error(String(j.error.message || 'rpc-error').slice(0, 80))); resolve(j.result); }
        catch (_) { reject(new Error('bad-rpc')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    req.write(payload); req.end();
  });
}
const get = (host, p, timeout = 12000) => new Promise((resolve) => {
  const req = https.request({ host, path: p, method: 'GET', family: 4, headers: { accept: 'application/json', 'user-agent': 'saos-dex-book/1' }, timeout }, (res) => {
    let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve({ s: res.statusCode, b: d }));
  });
  req.on('error', e => resolve({ err: String(e.message || e).slice(0, 60) }));
  req.on('timeout', () => { req.destroy(); resolve({ err: 'timeout' }); });
  req.end();
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const f = (s) => parseFloat(String(s || '0'));

const HE_SYMBOLS = ['SWAP.BTC', 'SWAP.LTC', 'SWAP.DOGE', 'SWAP.ETH', 'SWAP.SOL', 'LEO'];

(async () => {
  const t0 = Date.now();
  const book = { at: new Date().toISOString(), agent: 'dex-book', steem: {}, hiveEngine: {}, blurt: 'no DEX exists on blurt (no engine, no wrapped books) — nothing to read' };

  // ---- steem internal market ----
  try {
    const ob = await rpc('https://api.steemit.com', 'condenser_api.get_order_book', [20]);
    const fh = await rpc('https://api.steemit.com', 'condenser_api.get_feed_history', []);
    const bids = (ob.bids || []).map(x => ({ price: f(x.real_price), sbd: f(x.sbd) }));
    const asks = (ob.asks || []).map(x => ({ price: f(x.real_price), steem: f(x.steem) }));
    let premium = null, feedSbdPerSteem = null;
    if (fh && fh.current_median_history) {
      // live truth (09-30): feed base/quote = SBD per STEEM (book real_price is in the same units);
      // inverting this produced a bogus -98% "premium" — caught and fixed same session.
      feedSbdPerSteem = f(fh.current_median_history.base) / f(fh.current_median_history.quote);
      if (bids[0] && asks[0]) {
        const mid = (bids[0].price + asks[0].price) / 2;
        premium = +(((mid / feedSbdPerSteem) - 1) * 100).toFixed(3);
      }
    }
    book.steem = {
      bestBid: bids[0] ? bids[0].price : null, bestAsk: asks[0] ? asks[0].price : null,
      mid: (bids[0] && asks[0]) ? +(((bids[0].price + asks[0].price) / 2)).toFixed(6) : null,
      bidDepthSbd: +bids.reduce((s, x) => s + x.sbd, 0).toFixed(0),
      askDepthSteem: +asks.reduce((s, x) => s + x.steem, 0).toFixed(0),
      ordersBid: bids.length, ordersAsk: asks.length,
      feedSbdPerSteem: feedSbdPerSteem ? +feedSbdPerSteem.toFixed(6) : null,
      sbdPremiumPctVsFeed: premium,
      note: premium === null ? 'premium unreadable this run' : (Math.abs(premium) < 1 ? 'no convert-grade arb (|premium| < 1%)' : 'convert-grade premium — check feed math before acting'),
    };
  } catch (e) { book.steem = { error: String(e.message || e).slice(0, 80) }; }

  // ---- steem USD (for SBD implied value) ----
  try {
    const r = await get('api.coinpaprika.com', '/v1/tickers?quotes=USD&ids=steem-steem');
    if (r.s === 200) {
      const a = JSON.parse(r.b);
      const st = Array.isArray(a) ? a.find(x => x && x.symbol === 'STEEM') : null; // index-0 can be BTC on odd responses — filter, never trust position
      book.steemUsd = st && st.quotes && st.quotes.USD ? st.quotes.USD.price : null;
    }
  } catch (_) {}
  await sleep(300);

  // ---- Hive-Engine: marketpools AMM (live truth 09-30: the legacy 'book' table is
  // EMPTY for wrapped coins — all depth lives in SWAP.HIVE pools; tradesHistory confirms flow) ----
  const heFind = (method, params) => new Promise((resolve) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const req = https.request({ host: 'api.hive-engine.com', path: '/rpc/contracts', method: 'POST', family: 4, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 15000 }, (res) => {
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d).result); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload); req.end();
  });

  try {
    const metrics = (await heFind('find', { contract: 'market', table: 'metrics', query: {}, limit: 1000, offset: 0 })) || [];
    for (const sym of HE_SYMBOLS) {
      const m = metrics.find(x => x.symbol === sym) || null;
      const pool = await heFind('findOne', { contract: 'marketpools', table: 'pools', query: { tokenPair: 'SWAP.HIVE:' + sym } });
      const lastTrade = (await heFind('find', { contract: 'market', table: 'tradesHistory', query: { symbol: sym }, limit: 1, offset: 0, descending: true })) || [];
      if (!m && !pool) { book.hiveEngine[sym] = { market: 'ABSENT' }; await sleep(300); continue; }
      const entry = {
        last: m ? m.lastPrice : null, vol24h: m ? m.volume : null,
        lastTrade: lastTrade[0] ? { price: lastTrade[0].price, qty: lastTrade[0].quantity, ageH: +(((Date.now() / 1000) - lastTrade[0].timestamp) / 3600).toFixed(1) } : null,
      };
      if (pool) {
        const baseQty = f(pool.baseQuantity), quoteQty = f(pool.quoteQuantity); // base=SWAP.HIVE, quote=target token
        const hivePerToken = baseQty > 0 && quoteQty > 0 ? baseQty / quoteQty : null;
        // constant-product reference: estimated out for a given HIVE size (HE fee ~0.25% ignored — reference only)
        const impact = (hiveIn) => {
          if (!(hivePerToken > 0) || baseQty <= 0 || quoteQty <= 0) return null;
          const k = baseQty * quoteQty;
          const out = quoteQty - k / (baseQty + hiveIn);
          return { hiveIn, tokensOut: +out.toFixed(6), avgPrice: +(hiveIn / out).toFixed(2), slippagePct: +(((hiveIn / out) / hivePerToken - 1) * 100).toFixed(2) };
        };
        entry.pool = {
          hiveReserve: baseQty, tokenReserve: quoteQty,
          hivePerToken: hivePerToken ? +hivePerToken.toFixed(2) : null,
          totalShares: pool.totalShares,
          impact100Hive: impact(100), impact1000Hive: impact(1000),
        };
        entry.tradable = hivePerToken > 0 && quoteQty > 0.000001;
      } else { entry.pool = null; entry.tradable = false; }
      book.hiveEngine[sym] = entry;
      await sleep(300);
    }
  } catch (e) { book.hiveEngine = { error: String(e.message || e).slice(0, 80) }; }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1));

  const heRow = (s) => {
    const b = book.hiveEngine[s];
    if (!b || b.market === 'ABSENT') return '| ' + s + ' | no market | | |';
    const p = b.pool;
    return '| ' + s + ' | ' + (p && p.hivePerToken ? p.hivePerToken.toLocaleString('en-US') + ' HIVE' : (b.last || '?')) + ' | ' + (b.vol24h || 0) + ' | ' + (p && p.impact100Hive ? '+' + p.impact100Hive.slippagePct + '%' : 'n/a') + ' |';
  };
  const md = [
    '# DEX Depth Book (Z-27 dex-book)', '',
    'Updated: ' + book.at + ' UTC. Read-only depth mirror for the armed rail. Generated by agents/dex-book.cjs.', '',
    '## Steem internal market (SBD/STEEM)', '',
    '- best bid/ask: ' + (book.steem.bestBid || 'n/a') + ' / ' + (book.steem.bestAsk || 'n/a') + ' · mid ' + (book.steem.mid || 'n/a'),
    '- depth: ' + (book.steem.bidDepthSbd || 0) + ' SBD bid side · ' + (book.steem.askDepthSteem || 0) + ' STEEM ask side (' + (book.steem.ordersBid || 0) + '/' + (book.steem.ordersAsk || 0) + ' orders)',
    '- feed: ' + (book.steem.feedSbdPerSteem || 'n/a') + ' SBD per STEEM → SBD premium ' + (book.steem.sbdPremiumPctVsFeed !== null && book.steem.sbdPremiumPctVsFeed !== undefined ? book.steem.sbdPremiumPctVsFeed + '%' : 'n/a') + ' (' + (book.steem.note || '') + ')', '',
    '## Hive-Engine SWAP.HIVE pools (AMM truth: legacy book table is empty)', '',
    '| token | pool price | vol24h | slippage on 100 HIVE |',
    ...HE_SYMBOLS.map(heRow), '',
    'Pool price impact is constant-product reference (HE fee excluded). Legacy orderbook books: empty for wrapped coins — do not route through them.', '',
    '## Blurt', '', '- ' + book.blurt, '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);

  console.log(JSON.stringify({ state: 'ok', steem: { mid: book.steem.mid, premium: book.steem.sbdPremiumPctVsFeed }, heTradable: Object.entries(book.hiveEngine).filter(([s, b]) => b && b.tradable).map(([s]) => s), ms: Date.now() - t0 }));
  process.exit(0);
})().catch(e => {
  try { fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true }); fs.writeFileSync(OUT_JSON, JSON.stringify({ at: new Date().toISOString(), agent: 'dex-book', fatal: String(e.message || e).slice(0, 200) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
  process.exit(0);
});
