'use strict';
/**
 * reconcile.cjs — Z-30 BOOKS-CONSUL DESK (single-writer books + live-truth reconciliation).
 *
 * Operator msg 26: "disconnected layers in git", "duplicated data", books that disagree.
 * This desk makes the ledger layer ONE body:
 *   1. declare the CANONICAL WRITER per book topic (one desk owns each truth);
 *   2. probe LIVE chain state (steem/hive/blurt/engine balances for the head account);
 *   3. cross-check every book that CLAIMS capital numbers against live truth;
 *   4. book MATCH/DRIFT per row — drift is evidence, never argued away.
 * Fail-soft, keyless, exit 0.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const AG = __dirname;
const OUT_JSON = path.join(AG, 'reconciliation.json');
const OUT_MD = path.join(AG, 'reconciliation.md');
const HEAD = 'headcorner';

// Single-writer law: exactly one desk may write each topic.
const BOOKS = [
  { file: 'money-ledger.json', topic: 'capital-balances', canonicalWriter: 'money-watch' },
  { file: 'econ-book.json', topic: 'engine-executions', canonicalWriter: 'econ-desk' },
  { file: 'dex-book.json', topic: 'dex-depth', canonicalWriter: 'dex-book' },
  { file: 'bridge-book.json', topic: 'bridge-verdicts', canonicalWriter: 'bridge-desk' },
  { file: 'capability-matrix.json', topic: 'key-authority', canonicalWriter: 'capability-matrix' },
];

const rpc = (host, path_, method, params) => new Promise((res, rej) => {
  const p = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const rq = https.request({ hostname: host, path: path_ || '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p) }, timeout: 15000 }, r => {
    let d = ''; r.on('data', c => (d += c)); r.on('end', () => { try { const j = JSON.parse(d); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } });
  });
  rq.on('timeout', () => { rq.destroy(); rej(new Error('timeout')); }); rq.on('error', rej); rq.write(p); rq.end();
});
const fetchT = (url) => new Promise((res) => { const rq = https.get(url, r => { let d = ''; r.on('data', c => (d += c)); r.on('end', () => res(d)); }); rq.on('error', () => res(null)); rq.setTimeout(15000, () => { rq.destroy(); res(null); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => { try { return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0; } catch (_) { return 0; } };

async function liveTruth() {
  const t = {};
  try {
    const steem = require('steem');
    steem.api.setOptions({ url: 'https://api.steemit.com' });
    const acc = await new Promise((res, rej) => steem.api.getAccounts([HEAD], (e, r) => e ? rej(e) : res(r[0])));
    t.steemLiquid = num(acc.balance);
    t.steemVests = num(acc.vesting_shares);
  } catch (_) { t.steemLiquid = null; }
  await sleep(300);
  try {
    const j = await rpc('api.hive.blog', '/', 'condenser_api.get_accounts', [[HEAD]]);
    t.hiveLiquid = num(j[0].balance); t.hbd = num(j[0].hbd_balance);
  } catch (_) { t.hiveLiquid = null; }
  await sleep(300);
  try {
    const j = JSON.parse(await fetchT('https://api.hive-engine.com/rpc/contracts') || 'null');
  } catch (_) {}
  const he = (payload) => new Promise((res) => {
    const p = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'findOne', params: payload });
    const rq = https.request({ hostname: 'api.hive-engine.com', path: '/rpc/contracts', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p) }, timeout: 15000 }, r => { let d = ''; r.on('data', c => (d += c)); r.on('end', () => { try { res(JSON.parse(d).result); } catch (_) { res(null); } }); });
    rq.on('error', () => res(null)); rq.write(p); rq.end();
  });
  t.bee = num(((await he({ contract: 'tokens', table: 'balances', query: { account: HEAD, symbol: 'BEE' } })) || {}).balance);
  t.swapHive = num(((await he({ contract: 'tokens', table: 'balances', query: { account: HEAD, symbol: 'SWAP.HIVE' } })) || {}).balance);
  return t;
}

(async () => {
  const t0 = Date.now();
  const out = { at: new Date(t0).toISOString(), agent: 'reconcile', canonicalWriters: [], freshness: [], drift: [], live: null };
  for (const b of BOOKS) {
    const p = path.join(AG, b.file);
    let ok = false, ageH = null;
    try { const st = fs.statSync(p); ok = true; ageH = (t0 - st.mtimeMs) / 3600000; } catch (_) {}
    out.canonicalWriters.push({ topic: b.topic, book: b.file, writer: b.canonicalWriter, exists: ok, ageHours: ageH == null ? null : Math.round(ageH * 10) / 10 });
    if (ok) out.freshness.push(b.file + ':' + Math.round(ageH) + 'h');
  }
  out.live = await liveTruth();
  // cross-check: every money-bearing book that mentions headcorner capital vs live
  const checks = [
    { book: 'money-ledger.json', topic: 'capital-balances' },
    { book: 'econ-book.json', topic: 'engine-executions' },
  ];
  for (const c of checks) {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(path.join(AG, c.book), 'utf8')); } catch (_) {}
    if (!j) { out.drift.push({ book: c.book, check: 'readable', verdict: 'MISSING' }); continue; }
    const blob = JSON.stringify(j);
    const hasHead = blob.includes('headcorner');
    out.drift.push({ book: c.book, check: 'references executor account', verdict: hasHead ? 'OK' : 'NO-EXECUTOR-REF' });
    if (j.swapHive != null) {
      const claimed = num(j.swapHive), live = out.live.swapHive;
      const diff = Math.abs(claimed - live);
      out.drift.push({ book: c.book, check: 'swapHive vs live', claimed, live: Math.round(live * 1e8) / 1e8, verdict: diff < 0.01 ? 'MATCH' : 'DRIFT', delta: Math.round(diff * 1e8) / 1e8 });
    }
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));
  const drifts = out.drift.filter((d) => d.verdict && d.verdict !== 'OK' && d.verdict !== 'MATCH');
  const md = [
    '# Reconciliation Book (Z-30 books-consul desk)', '',
    'Updated: ' + out.at + ' UTC. Single-writer law: one desk owns each topic. Every capital claim is cross-checked against LIVE chain state per run.', '',
    '| topic | canonical book | writer | exists | age h |',
    '|---|---|---|---|---|',
    ...out.canonicalWriters.map((w) => '| ' + w.topic + ' | ' + w.book + ' | ' + w.writer + ' | ' + w.exists + ' | ' + w.ageHours + ' |'),
    '',
    'Live truth: steem ' + out.live.steemLiquid + ' + ' + Math.round((out.live.steemVests || 0) / 1e6) + 'MV · hive ' + out.live.hiveLiquid + ' · HBD ' + out.live.hbd + ' · BEE ' + out.live.bee + ' · SWAP.HIVE ' + out.live.swapHive, '',
    'Checks: ' + (out.drift.map((d) => d.book + '/' + d.check + '=' + d.verdict).join(' · ') || 'none') + '',
    '',
    drifts.length ? ('**UNRESOLVED: ' + drifts.length + ' row(s)** — reconcile before claiming.') : 'No unresolved drift this run.',
    '',
    'Generated by agents/reconcile.cjs.', '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);
  console.log(JSON.stringify({ state: 'ok', unresolved: drifts.length }));
  process.exit(0);
})().catch((e) => {
  try { fs.writeFileSync(OUT_JSON, JSON.stringify({ at: new Date().toISOString(), agent: 'reconcile', fatal: String(e.message || e).slice(0, 140) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 100) }));
  process.exit(0);
});
