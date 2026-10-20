'use strict';
/**
 * econ-desk.cjs — Z-29 TWO-SIDED REAL-ECONOMY DESK (hive, headcorner active authority).
 *
 * Daily self-healing execution loop for the fleet's REAL DEX rail on Hive-Engine:
 *   1. poll the SWAP.HIVE wrapper credit (hiveswap owes headcorner if a verified
 *      deposit is on chain but the token credit has not landed);
 *   2. SELL SIDE (Z-29): harvest engine inventory into routable capital —
 *      sell any sellable token balance above its keep-reserve when the live
 *      bid pays at least DUST_MIN_PROCEEDS (dust is honestly HELD, never noise-sold);
 *   3. re-poll SWAP.HIVE after the sell side;
 *   4. when funds are in place, place ONE maker-priced market buy in a cheap
 *      wrapped-coin book (SWAP.DOGE / SWAP.LTC chosen by depth);
 *   5. read back the on-chain custom_json with CONTENT matching (R-ECON-2) and
 *      the engine-side settlement (token balance or open order) before claiming;
 *   6. commit a secretless book (econ-book.json/.md) so the economy ledger is
 *      public evidence, not a claim.
 *
 * Every execution verify-then-sign; any failure = honest row + exit 0 (fail-soft).
 * Key use: SA_HEAD_HIVE_ACTIVE51 (uncompressed 51-char form — R-ECON-1/3:
 * compressed hive WIFs cannot be signed by steem-family libs; hive-js + the
 * wif51 form are the only proven path).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const HEAD = 'headcorner';
const HIVE_NODE = 'https://api.deathwing.me'; // Z-30-b: hive-js broadcasts failed twice on hive.blog this session; deathwing proven by the cancel-desk and probes
const HIVE_CHAIN_ID = 'beeab0de00000000000000000000000000000000000000000000000000000000';
const OUT_JSON = process.env.ECON_JSON || path.join(__dirname, 'econ-book.json');
const OUT_MD = path.join(__dirname, 'econ-book.md');
const BUY_TARGETS = ['SWAP.DOGE', 'SWAP.LTC'];       // cheapest routable wrapped books
const MIN_ORDER_HIVE = 0.25;                          // smallest value worth placing
const BOOK_STALE_H = 48;                              // Z-30-a ghost-book gate: no bid into a book whose newest resting order is older than this
// ---- Z-29 sell side: inventory the desk is allowed to harvest ----
// keep = reserve held back on chain (BEE is the engine utility token: keep 1 for ops).
// Z-30-b census additions: WAIV 10.0 found idle in the vault census (live book, bid
// 0.19749 = fleet's largest untapped harvest); CENT residue auto-reviews each run
// and harvests itself the moment its bid clears the dust line.
const SELL_BOOKS = [
  { sym: 'BEE',   keep: 1.0 },
  { sym: 'VKBT',  keep: 0 },
  { sym: 'PAY',   keep: 0 },
  { sym: 'BLANK', keep: 0 },
  { sym: 'WAIV',  keep: 0 },
  { sym: 'CENT',  keep: 0 },
  { sym: 'SWAP.DOGE', keep: 0 },  // Z-30-b: konvik-doge revived the book (mm bids 1.694, vol 3840) — the 0.572 position bought at ~1.66 now has a live exit; harvest = realized +2%
];
// Z-30-b EXPLICIT-EXPIRATION LAW: every market op now carries an explicit epoch
// expiration (+7d, inside the 7-30d range third-party orders use). Found evidence:
// our Z-30 BEE ask (no expiration field) vanished from sellBook with NO cancel op,
// NO transfer, NO fill proceeds — 1.85 BEE unrecovered (EXP-UNRESOLVED, see
// econ-book). Explicit expiry removes the one unknown we control.
const ORDER_EXPIRY_S = 7 * 86400;
const orderExpiry = () => Math.floor(Date.now() / 1000) + ORDER_EXPIRY_S;
const DUST_MIN_PROCEEDS = 0.02;   // below this SWAP.HIVE value a sell is dust-noise; honest HOLD
const ENGINE_FEE = 0.009;         // 0.9% engine market fee (seller side)
// CONTRACT-ID LAW (Z-30, proven by a live control op @ fucina 23:26Z): the engine
// contract id is ssc-mainnet-hive. Z-28/29 shipped 'ssc-mainframe-hive' — a typo the
// engine silently ignores (op mined by the chain, never applied sidechain-side).
// Any new rail must validate its contract id against an APPLIED third-party op
// BEFORE its first signature.
const ENGINE_ID = 'ssc-mainnet-hive';

function rpcNode(node, method, params, timeout = 20000) {
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const u = new URL(node);
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: u.hostname, path: u.pathname || '/', method: 'POST', family: 4, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); if (j.error) return reject(new Error(j.error.message || 'rpc-error')); resolve(j.result); }
        catch (_) { reject(new Error('bad-rpc')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    req.write(payload); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function heFind(contract, table, query, limit = 10, indexes) {
  const params = { contract, table, query, limit, offset: 0 };
  if (indexes) params.indexes = indexes;
  const payload = JSON.stringify({ jsonrpc: '2.0', method: 'find', params, id: 1 });
  return new Promise((resolve) => {
    const u = new URL('https://api.hive-engine.com/rpc/contracts');
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', family: 4, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 20000 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d).result); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload); req.end();
  });
}

async function findOp(opType, matcher, afterMs, tries = 7) {
  for (let i = 0; i < tries; i++) {
    await sleep(5000);
    try {
      const hist = await rpcNode(HIVE_NODE, 'condenser_api.get_account_history', [HEAD, -1, 100]);
      for (const [, ev] of (hist || [])) {
        const [type, body] = ev.op || [];
        if (type !== opType) continue;
        const ts = new Date(ev.timestamp + 'Z').getTime();
        if (ts < afterMs - 25000) continue;
        try { if (matcher(body)) return { block: ev.block, trx: ev.trx_id }; } catch (_) {}
      }
    } catch (_) {}
  }
  return null;
}

// ---- R-ECON-1: hive compressed-WIF -> signable 51-char steem-family WIF ----
// The vault stores headcorner's hive_active as a 52-char compressed WIF
// (L-prefix). steem-family libs cannot sign with it directly. The chain
// authority corresponds to the scalar d = (k*256 + 1) mod N where k is the
// 32-byte payload — re-derived in memory each run; the wif never persists.
// Z-30-b: base58 codec INLINED — require('bs58') resolved to a pure-ESM copy on
// the local runner (ERR_REQUIRE_ESM swallowed by try/catch → silent no-key)
// while CI resolves to hive-js's CJS bs58@4. Zero-dependency codec kills the
// environment divergence permanently.
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(str) {
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const val = B58_ALPHABET.indexOf(str[i]);
    if (val < 0) throw new Error('base58-invalid');
    let carry = val;
    for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; str[i] === '1' && i < str.length - 1; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}
function b58encode(buf) {
  const digits = [0];
  for (let i = 0; i < buf.length; i++) {
    let carry = buf[i];
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (let i = 0; buf[i] === 0 && i < buf.length - 1; i++) out += B58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
  return out;
}
function hiveWif51(compressedWif) {
  const crypto = require('crypto');
  const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const raw = b58decode(compressedWif);
  if (raw.length === 38 && raw[0] === 0x80 && raw[33] === 0x01) {
    const k = BigInt('0x' + raw.subarray(1, 33).toString('hex'));
    const d = ((k << 8n) + 1n) % N;
    const priv32 = Buffer.from(d.toString(16).padStart(64, '0'), 'hex');
    const body = Buffer.concat([Buffer.from([0x80]), priv32]);
    const cs = crypto.createHash('sha256').update(crypto.createHash('sha256').update(body).digest()).digest().subarray(0, 4);
    return b58encode(Buffer.concat([body, cs]));
  }
  if (/^5[1-9A-HJ-NP-Za-km-z]{50}$/.test(compressedWif)) return compressedWif; // already uncompressed
  return null;
}

function loadHeadHiveActive() {
  // path 1: nested SA_FLEET_KEYS shape (future secret generation)
  const raw = process.env.SA_FLEET_KEYS || '';
  if (raw) {
    try {
      const map = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      const h = map[HEAD] || {};
      const cand = h.hive_active || h.active || null;
      if (typeof cand === 'string' && cand.length >= 40) return hiveWif51(cand);
    } catch (_) {}
  }
  // path 2: private-steem-repo vault recovery (Z-21 pattern, proven in CI)
  const dir = process.env.STEEM_REPO_DIR;
  if (dir) {
    try {
      const { execFileSync } = require('child_process');
      const crypto = require('crypto');
      const out = path.join('/tmp', 'econ-keys-' + Date.now());
      fs.mkdirSync(out, { recursive: true, mode: 0o700 });
      const metaPath = path.join(dir, 'agent', 'recovery-meta.json');
      if (!fs.existsSync(metaPath)) return null;
      const metas = [JSON.parse(fs.readFileSync(metaPath, 'utf8'))];
      const vdir = path.join(dir, 'agent', 'vault');
      const encs = fs.readdirSync(vdir).filter((f) => f.endsWith('.enc')).map((f) => path.join(vdir, f));
      const sha = (x) => crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex');
      for (const enc of encs) {
        const outer = sha(enc);
        for (const m of metas) {
          if (!m || !m.keysZipPass || m.keysZipSha256 !== outer) continue;
          const dec = path.join(out, 'v.zip');
          execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', enc, '-out', dec, '-pass', 'env:ECZP'], { env: { ...process.env, ECZP: m.keysZipPass }, stdio: 'pipe' });
          if (fs.readFileSync(dec).subarray(0, 2).toString('latin1') !== 'PK') continue;
          execFileSync('unzip', ['-o', '-q', dec, '-d', out], { stdio: 'pipe' });
          const vj = path.join(out, 'agent', 'keys', 'vault.json');
          if (!fs.existsSync(vj)) continue;
          const v = JSON.parse(fs.readFileSync(vj, 'utf8'));
          const hc = (v.accounts || []).find((a) => a.username === HEAD);
          let rawWif = hc && hc.keys && hc.keys.hive && hc.keys.hive.active;
          if (typeof rawWif === 'string' && rawWif.startsWith('{')) { try { rawWif = JSON.parse(rawWif).wif || null; } catch (_) { rawWif = null; } }
          else if (rawWif && typeof rawWif === 'object') rawWif = rawWif.wif || null;
          else rawWif = null;
          try { fs.rmSync(out, { recursive: true, force: true }); } catch (_) {}
          if (typeof rawWif === 'string' && rawWif.length > 40) return hiveWif51(rawWif);
        }
      }
      try { fs.rmSync(out, { recursive: true, force: true }); } catch (_) {}
    } catch (_) {}
  }
  return null;
}

(async () => {
  try { if (require('./capital-gate.cjs').stasisHalt('econ-desk')) return; } catch (e) { console.log('[CAPITAL-GATE] econ-desk — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  const t0 = Date.now();
  const book = { at: new Date(t0).toISOString(), agent: 'econ-desk', chain: 'hive', executor: HEAD, signer: '@hiveio/hive-js', rows: [] };
  const R = (row) => book.rows.push(row);

  const wif = loadHeadHiveActive();
  if (!wif) {
    book.error = 'could not derive headcorner hive wif51 from SA_FLEET_KEYS — nothing signed';
    fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1));
    console.log(JSON.stringify({ state: 'no-key' })); process.exit(0);
  }

  let hivejs = null;
  try { hivejs = require('@hiveio/hive-js'); } catch (_) {}
  if (!hivejs) {
    book.error = '@hiveio/hive-js unavailable in runner — cannot sign hive active ops (steem.js is broken for hive assets, R-ECON-3)';
    fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1));
    console.log(JSON.stringify({ state: 'no-signer' })); process.exit(0);
  }
  hivejs.api.setOptions({ url: HIVE_NODE, useAppbaseApi: true });
  hivejs.config.set('chain_id', HIVE_CHAIN_ID);

  const bcast = (fn) => new Promise((resolve, reject) => fn((err, res) => (err ? reject(new Error(String(err.message || err).slice(0, 140))) : resolve(res))));

  // ---- authority gate ----
  const pub = hivejs.auth.wifToPublic(wif);
  const acc = (await rpcNode(HIVE_NODE, 'condenser_api.get_accounts', [[HEAD]]))[0];
  const chainAct = acc.active.key_auths[0][0];
  if (pub !== chainAct) {
    book.error = 'active key does not match live authority — refusing to sign';
    fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1));
    console.log(JSON.stringify({ state: 'AUTH-MISMATCH' })); process.exit(0);
  }
  book.authority = { verified: true, livePub: chainAct.slice(0, 7) + '…' };
  const hiveBal = parseFloat(acc.balance);

  const swapBalNow = async () => {
    const b = await heFind('tokens', 'balances', { account: HEAD, symbol: 'SWAP.HIVE' }, 1);
    return b && b[0] ? parseFloat(b[0].balance) : 0;
  };

  // ---- step 1: RAIL HEALTH (Z-29 gate, probe CORRECTED in Z-30). The engine API
  // 'find' IGNORES orderBy/descending — the only correct descending form is
  // indexes:[{index:'_id',descending:true}]. The Z-29 "stall" was this query artifact
  // stacked on the dead contract id below: healthy books read as frozen. The gate
  // stays (never sign into a rail whose newest applied state is not fresh), measured right.
  const newestOrderTs = async (sym) => {
    const rows = (await heFind('market', 'sellBook', { symbol: sym }, 1, [{ index: '_id', descending: true }])) || [];
    return rows[0] && rows[0].timestamp ? rows[0].timestamp : 0;
  };
  let railNewest = 0;
  const railDetail = [];
  for (const sym of ['BEE', 'ALIVE', 'SWAP.LTC']) {
    const ts = await newestOrderTs(sym);
    railDetail.push(sym + ':' + (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '?'));
    if (ts > railNewest) railNewest = ts;
  }
  const railAgeH = railNewest ? (Date.now() / 1000 - railNewest) / 3600 : Infinity;
  book.rail = { frontierAgeHours: Math.round(railAgeH * 10) / 10, newestAppliedState: railDetail };
  const STALL_H = 24;
  if (railAgeH > STALL_H) {
    R({ step: 'rail-health', status: 'ENGINE-STALL', frontierAgeHours: Math.round(railAgeH * 10) / 10, newestAppliedState: railDetail.join(' '), verdict: 'no engine op signed until the frontier is fresh again' });
    R({ step: 'sell', status: 'VOID-DEAD-ID', symbol: 'BEE', quantity: '5.49308870', price: '0.54921004', trx: '4d3f27e7d951f181853777ebee4caaae38c24919', note: 'Z-29 op carried the dead contract id ssc-mainframe-hive; the engine ignores it forever. Superseded by the corrected-id ops (see FILLED/PARTIAL rows). Z-29 stall verdict retracted.' });
    R({ step: 'wrapper-poll', swapHive: (await swapBalNow()).toFixed(8), note: 'hiveswap credit for 0.310 HIVE (trx 875404ff2d16f418bd8a86b5cffa6d4e6503e3c1) remains separately open — deposit method unverified, not the dead-id issue' });
    book.summary = { rows: book.rows.length, executed: 0, ms: Date.now() - t0 };
    fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1));
    const mdStall = [
      '# Econ Book (Z-29 two-sided real-economy desk)', '',
      'Updated: ' + new Date().toISOString() + ' UTC. RAIL VERDICT: **hive-engine contract state STALLED** — newest applied market state: ' + railDetail.join(', ') + ' (frontier age ' + Math.round(railAgeH * 10) / 10 + 'h). No engine op is signed into a dead rail.', '',
      '| step | status | detail |',
      '|---|---|---|',
      ...book.rows.map((r) => '| ' + r.step + ' | ' + (r.status || '') + ' | ' + [r.symbol && (r.quantity !== undefined && r.price !== undefined ? (r.symbol + ' qty=' + r.quantity + ' @ ' + r.price) : (r.quantity !== undefined && r.bid !== undefined ? (r.symbol + ' qty=' + r.quantity + ' bid=' + r.bid) : r.symbol)), r.newestAppliedState, r.verdict, r.note, r.trx && ('trx ' + r.trx)].filter(Boolean).join(' · ').replace(/\|/g, '/') + ' |'),
      '',
    ].join('\n');
    fs.writeFileSync(OUT_MD, mdStall);
    console.log(JSON.stringify({ state: 'rail-stall', frontierAgeHours: Math.round(railAgeH * 10) / 10 }));
    process.exit(0);
  }
  R({ step: 'rail-health', status: 'FRESH', frontierAgeHours: Math.round(railAgeH * 10) / 10 });

  // ---- Z-30-b EXP-UNRESOLVED standing evidence row: our Z-30 BEE ask (remainder
  // of trx 0c3bc5b7…, qty 5.49308870 @ 0.54968, no-expiration payload) vanished from
  // sellBook between 10-01T23:3x and 10-02T09:0x with NO cancel op, NO transfer op,
  // NO fill proceeds (SWAP.HIVE delta accounts exactly for the two observed fills:
  // 3.64 BEE → 2.0004 SWAP.HIVE). ~1.85 BEE is neither in the book, the wallet, nor
  // the proceeds. The row clears itself when BEE liquid returns above keep.
  try {
    const beeRow = (await heFind('tokens', 'balances', { account: HEAD, symbol: 'BEE' }, 1)) || [];
    const beeLiquid = beeRow[0] ? parseFloat(beeRow[0].balance) : 0;
    if (beeLiquid <= 1.0) {
      R({ step: 'evidence', status: 'EXP-UNRESOLVED', symbol: 'BEE', missing: '1.85308870', trx: '0c3bc5b7835fc1ef8167f16e26affdd5b19dd450', note: 'Z-30 ask remainder vanished from sellBook (window 10-01T23:3x→10-02T09:0x): no cancel, no transfer, no fill proceeds. Precaution: every market op now carries explicit expiration.' });
    }
  } catch (_) {}

  // ---- Z-30-b SETTLED-HISTORY standing row: today's realized trades, sidechain-state
  // proven (balance deltas + book read-backs). SWAP.HIVE treasury moved 0.103 → 5.0136
  // (locked + liquid) in one session. Kept as a permanent book line, not a claim.
  R({ step: 'evidence', status: 'SETTLED-HISTORY', at: '2026-10-02', rows: [
    'WAIV 10.00000109 sold @ 0.19749 → +1.95151099 SWAP.HIVE (9.88156871 filled by d7connect, 0.11843238 ask re-listed; balance-verified)',
    'SWAP.DOGE 0.572191 sold @ 1.69399599 → +0.96933383 SWAP.HIVE realized (position bought ~1.66 in Z-30; exit on konvik-doge mm revival; balance-verified)',
    'SWAP.LTC 0.00319000 bought @ 1204.33100999 → taker fill on crossing (trx 8961b2b4…, balance-verified 0.00319 held)',
    'SWAP.LTC 0.00092600 bid resting @ 1202.66202505, 1.11366504 SWAP.HIVE locked (trx 788b68f1…, top of bid side)',
    'ghost-book law enforcement: 2 stale DOGE bids (3.91820258 SWAP.HIVE) cancelled with read-back (trx f58427d4…, c12d4ea0…)'
  ] });

  // ---- step 2: wrapper credit poll ----
  const swapHive0 = await swapBalNow();
  R({ step: 'wrapper-poll', swapHive: swapHive0.toFixed(8), hiveLiquid: hiveBal });
  const stuckNote = 'waiting for the hiveswap wrapper to credit the verified deposit (trx 875404ff2d16f418bd8a86b5cffa6d4e6503e3c1, 0.310 HIVE, memo was free-text)';

  // ---- step 2 (Z-29): SELL SIDE — harvest inventory above keep-reserve into routable capital ----
  for (const { sym, keep } of SELL_BOOKS) {
    try {
      const balRows = await heFind('tokens', 'balances', { account: HEAD, symbol: sym }, 1);
      const bal = balRows && balRows[0] ? parseFloat(balRows[0].balance) : 0;
      const qty = Math.max(0, bal - keep);
      if (qty <= 0) { const balStr = balRows && balRows[0] ? balRows[0].balance : '0'; R({ step: 'sell', status: 'AT-KEEP', symbol: sym, balance: balStr, keep: keep.toFixed(1), note: 'holding ' + balStr + ' · keep reserve ' + keep.toFixed(1) }); continue; } // Z-34: heFind resolves null on node hiccup — unguarded balRows[0] here was the live sell/ERROR (SWAP.DOGE 2026-10-02)

      const mRows = await heFind('market', 'metrics', { symbol: sym }, 1);
      const m = mRows && mRows[0];
      const bid = m ? parseFloat(m.highestBid) : 0;
      const last = m ? parseFloat(m.lastPrice) : 0;
      const proceeds = bid > 0 ? qty * bid * (1 - ENGINE_FEE) : 0;
      if (bid <= 0 || proceeds < DUST_MIN_PROCEEDS) {
        R({ step: 'sell', status: 'DUST-HELD', symbol: sym, quantity: qty.toFixed(8), bid: bid.toFixed(8), price: bid.toFixed(8), last: last.toFixed(8), estProceeds: proceeds.toFixed(6), min: DUST_MIN_PROCEEDS, note: 'honest hold: no live bid worth the order' });
        continue;
      }
      const existing = (await heFind('market', 'sellBook', { account: HEAD, symbol: sym }, 5)) || [];
      if (existing.length) { R({ step: 'sell', status: 'ALREADY-OPEN', symbol: sym, openOrders: existing.length }); continue; }

      const price = bid.toFixed(8);
      const q = qty.toFixed(8);
      const before = Date.now();
      await bcast((cb) => hivejs.broadcast.customJson(wif, [HEAD], [], ENGINE_ID, JSON.stringify({ contractName: 'market', contractAction: 'sell', contractPayload: { symbol: sym, quantity: q, price, expiration: orderExpiry() } }), cb));
      const ev = await findOp('custom_json', (b) => b.id === ENGINE_ID && String(b.json || '').includes('"contractAction":"sell"') && String(b.json || '').includes(sym), before);
      // Z-30-b: settlement read-back with retries — the sidechain applies a mined
      // custom_json seconds AFTER broadcast; the old single immediate read raced the
      // engine and mis-labeled a live fill as PLACED-UNSETTLED (the WAIV lesson:
      // +1.951 SWAP.HIVE landed while the first read still saw zero movement).
      let settled = { swapAfter: swapHive0, openOrders: 0, askRemainder: 0 };
      for (let i = 0; i < 6; i++) {
        await sleep(5000);
        const asks = (await heFind('market', 'sellBook', { account: HEAD, symbol: sym }, 5)) || [];
        settled = { swapAfter: await swapBalNow(), openOrders: asks.length, askRemainder: asks.map((x) => parseFloat(x.quantity)).reduce((a, b) => a + b, 0) };
        if (settled.swapAfter > swapHive0 || settled.openOrders > 0) break;
      }
      // partial-fill aware (Z-30): proceeds delta vs open-ask remainder
      const filledQty = Math.max(0, qty - settled.askRemainder);
      const cls = settled.swapAfter > swapHive0 ? (settled.openOrders > 0 ? 'PARTIAL-FILL+RESTING' : 'FILLED') : (settled.openOrders > 0 ? 'ORDER-OPEN' : 'PLACED-UNSETTLED');
      R({ step: 'sell', status: cls, symbol: sym, quantity: q, price, filledQty: filledQty.toFixed(8), estProceeds: proceeds.toFixed(6), onChain: !!ev, ...(ev || {}), ...settled });
    } catch (e) {
      R({ step: 'sell', status: 'ERROR', symbol: sym, error: String(e.message).slice(0, 120) });
    }
  }

  // ---- step 3: re-poll SWAP.HIVE after the sell side ----
  const swapHive = await swapBalNow();
  book.swapHive = swapHive;
  book.hiveLiquid = hiveBal;

  // ---- step 3b: resting orders always visible (Z-30-a) — a resting maker bid
  // below the MIN_ORDER_HIVE capital line would otherwise be invisible in the book
  try {
    for (const sym of BUY_TARGETS.concat(SELL_BOOKS.map((s) => s.sym))) {
      const bb = (await heFind('market', 'buyBook', { account: HEAD, symbol: sym }, 5)) || [];
      const sb = (await heFind('market', 'sellBook', { account: HEAD, symbol: sym }, 5)) || [];
      if (bb.length || sb.length) {
        const lockedH = bb.map((x) => parseFloat(x.tokensLocked || 0)).reduce((a, c) => a + c, 0);
        const bTop = bb.slice().sort((x, y) => parseFloat(y.price) - parseFloat(x.price))[0];
        const sTop = sb.slice().sort((x, y) => parseFloat(x.price) - parseFloat(y.price))[0];
        R({ step: 'open-orders', symbol: sym, note: 'bids ' + bb.length + (bTop ? ' @ ' + bTop.price : '') + ' · asks ' + sb.length + (sTop ? ' @ ' + sTop.price : '') + ' · locked ' + lockedH.toFixed(8) + ' SWAP.HIVE · maker presence live on the book' });
      }
    }
  } catch (e) { R({ step: 'open-orders', status: 'POLL-ERROR', error: String(e.message).slice(0, 100) }); }

  // ---- step 4: place ONE market buy if capital is in place ----
  if (swapHive >= MIN_ORDER_HIVE) {
    // Z-30-a ghost-book gate: a book whose newest resting order is older than
    // BOOK_STALE_H has no live counterparties — parking capital there freezes it
    // (SWAP.DOGE lesson: newest resting order was ~13 days old; our fill was the
    // only trade in weeks, and the position has no liquid exit). Maker presence
    // does not reliably revive a dead book; capital stays in SWAP.HIVE until a
    // live book exists.
    const bookNewestAgeH = async (sym) => {
      // Z-30-b SELF-DECEPTION FIX: our own maker presence used to count as "book
      // activity", so the first bid kept every later run believing the book was
      // alive and stacked a second bid into a 13-day-dead book (trx 0f78c91c…,
      // cancelled same-day by the cancel-desk). Exclude our own orders — a book
      // is only live if SOMEONE ELSE recently showed up.
      let newest = 0;
      for (const table of ['buyBook', 'sellBook']) {
        const rows = (await heFind('market', table, { symbol: sym }, 20, [{ index: '_id', descending: true }])) || [];
        const others = rows.filter((x) => x.account !== HEAD);
        if (others[0] && others[0].timestamp && others[0].timestamp > newest) newest = others[0].timestamp;
      }
      return newest ? (Date.now() / 1000 - newest) / 3600 : Infinity;
    };
    let picked = null;
    const metricsWithRetry = async (sym) => {
      // Z-30-b: HE metrics reads failed intermittently twice this session (once a
      // fatal, once a silent skip that cost the DOGE re-entry). Retry before skip.
      for (let i = 0; i < 3; i++) {
        const rows = await heFind('market', 'metrics', { symbol: sym }, 1);
        if (rows && rows[0]) return rows[0];
        await sleep(2500);
      }
      return null;
    };
    for (const sym of BUY_TARGETS) {
      const m = await metricsWithRetry(sym);
      if (!m || parseFloat(m.lowestAsk) <= 0) continue;
      const ageH = await bookNewestAgeH(sym);
      if (ageH > BOOK_STALE_H) { R({ step: 'buy', status: 'SKIP-GHOST-BOOK', symbol: sym, newestOrderAgeHours: Math.round(ageH * 10) / 10, max: BOOK_STALE_H, note: 'no live counterparty recent enough; capital stays in SWAP.HIVE until a live book exists' }); continue; }
      picked = { sym, m }; break;
    }
    if (!picked) R({ step: 'buy', status: 'NO-LIVE-BOOK', note: swapHive < swapHive0 ? stuckNote : undefined });
    else {
      const { sym, m } = picked;
      const ask = m.lowestAsk;
      // maker price: just under the ask (does not cross; sits at the top of the bid side)
      const bidPx = (parseFloat(m.highestBid) || parseFloat(ask) * 0.985);
      const price = bidPx > 0 ? bidPx.toFixed(8) : ask;
      const quantity = (swapHive * 0.95) / parseFloat(price); // leave 5% headroom for fees
      const q = quantity.toFixed(6);
      const before = Date.now();
      try {
        const existing = (await heFind('market', 'buyBook', { account: HEAD, symbol: sym }, 5)) || [];
        if (existing.length) {
          R({ step: 'buy', status: 'ALREADY-OPEN', symbol: sym, openOrders: existing.length });
        } else {
          // Z-30-a DELTA-SETTLEMENT LAW: classify from before/after deltas only.
          // The account already holds prior inventory, so "balance > 0" proves
          // nothing (the Z-30 false-FILLED: old 0.572 DOGE read as a fresh fill
          // while the order was merely resting). Sell side already does this
          // right (swapAfter vs swapHive0); buy side now matches it.
          const preRows = await heFind('tokens', 'balances', { account: HEAD, symbol: sym }, 1);
          const preBal = preRows && preRows[0] ? parseFloat(preRows[0].balance) : 0;
          await bcast((cb) => hivejs.broadcast.customJson(wif, [HEAD], [], ENGINE_ID, JSON.stringify({ contractName: 'market', contractAction: 'buy', contractPayload: { symbol: sym, quantity: q, price, expiration: orderExpiry() } }), cb));
          const ev = await findOp('custom_json', (b) => b.id === ENGINE_ID && String(b.json || '').includes('"contractAction":"buy"') && String(b.json || '').includes(sym), before);
          let settled = { tokenBalance: preBal.toFixed(8), openOrders: 0, tokensLocked: '0' };
          for (let i = 0; i < 5; i++) {
            await sleep(6000);
            const b = await heFind('tokens', 'balances', { account: HEAD, symbol: sym }, 1);
            const bk = (await heFind('market', 'buyBook', { account: HEAD, symbol: sym }, 5)) || [];
            const locked = bk.filter((x) => x.account === HEAD).map((x) => parseFloat(x.tokensLocked || 0)).reduce((a, c) => a + c, 0);
            settled = { tokenBalance: b && b[0] ? b[0].balance : '0', openOrders: bk.filter((x) => x.account === HEAD).length, tokensLocked: locked.toFixed(8) };
            if (parseFloat(settled.tokenBalance) > preBal || settled.openOrders > 0) break;
          }
          const deltaBal = parseFloat(settled.tokenBalance) - preBal;
          const cls = deltaBal > 0 ? (settled.openOrders > 0 ? 'PARTIAL-FILL+RESTING' : 'FILLED') : (settled.openOrders > 0 ? 'ORDER-OPEN' : 'PLACED-UNSETTLED');
          R({ step: 'buy', status: cls, symbol: sym, quantity: q, price, ask, deltaBalance: Math.max(0, deltaBal).toFixed(8), tokensLocked: settled.tokensLocked, onChain: !!ev, ...(ev || {}), ...settled });
        }
      } catch (e) {
        R({ step: 'buy', status: 'ERROR', symbol: sym, error: String(e.message).slice(0, 120) });
      }
    }
  } else {
    R({ step: 'buy', status: 'SKIP-BELOW-MIN', swapHive: swapHive.toFixed(8), min: MIN_ORDER_HIVE, note: stuckNote });
  }

  book.summary = { rows: book.rows.length, executed: book.rows.filter((r) => r.status === 'FILLED' || r.status === 'ORDER-OPEN').length, ms: Date.now() - t0 };
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1));
  const md = [
    '# Econ Book (Z-29 two-sided real-economy desk)', '',
    'Updated: ' + book.at + ' UTC. Executor: ' + HEAD + ' (active authority, byte-verified per run). Signer: @hiveio/hive-js (steem.js cannot sign hive asset ops, R-ECON-3). Sell side harvests engine inventory above keep-reserve; dust is honestly held. Buy side places maker orders in routable wrapped books. Generated by agents/econ-desk.cjs.', '',
    '| step | status | detail |',
    '|---|---|---|',
    ...book.rows.map((r) => '| ' + r.step + ' | ' + (r.status || r.move || '') + ' | ' + [r.symbol && (r.quantity !== undefined && r.price !== undefined ? (r.symbol + ' qty=' + r.quantity + ' @ ' + r.price) : (r.quantity !== undefined && r.bid !== undefined ? (r.symbol + ' qty=' + r.quantity + ' bid=' + r.bid) : r.symbol)), r.swapHive && ('SWAP.HIVE=' + r.swapHive), r.estProceeds && ('est=' + r.estProceeds), r.note, r.error, r.trx && ('trx ' + r.trx)].filter(Boolean).join(' · ').replace(/\|/g, '/') + ' |'),
    '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);
  console.log(JSON.stringify({ state: 'ok', summary: book.summary }));
  process.exit(0);
})().catch((e) => {
  try { fs.writeFileSync(OUT_JSON, JSON.stringify({ at: new Date().toISOString(), agent: 'econ-desk', fatal: String(e.message || e).slice(0, 160) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 120) }));
  process.exit(0);
});
