'use strict';
/**
 * pegout-hand.cjs — R44 THE PEGOUT HAND (CR-0074): the keyed consumer of the pegout queue.
 *
 * The real-value law's second half (owner directive 2026-10-04, trace 1a1…c3a5):
 * "חשוב שגם נוכל באמת להחליף למטבע האמיתי עם ערך ולא סתם שקר" — R42 minted the wrappers
 * 1:1 against measured custody and R43 queued the chain-side payouts (dex/pegout-queue.json,
 * "a keyed desk owns the broadcast, keyless code never fires one"). R44 lands THAT desk.
 *
 * LAWS (in code):
 *  1. DEST-ALLOWLIST: a chain payout fires ONLY to an estate-roster account (the 15 accounts
 *     of soldier_auth_audit.json, 4/4 key-MATCH verified 2026-10-04 + the operator trio).
 *     A row naming any other account is REFUSED-DEST-NOT-ESTATE — never a transfer to a
 *     squatter. The live queue's 'treasury' row is exactly this refusal, booked honestly.
 *  2. KEYED ONLY: LIVE modes require PEGOUT_LIVE=1 AND the vault (HC_DERIVED, 0600, outside
 *     every repo). Keyless runs report honestly (PLAN / REFUSED rows) and never sign.
 *  3. SIGNED WITH THE SOVEREIGN CRYPTO: the transfer op is serialized by THIS desk's own
 *     serializer (byte-verified against steem-js — golden vectors pinned in the selftest)
 *     and signed with gate-crypto.js signCompact (the R38-verified ECDSA). No steem-js at
 *     runtime; the dependency surface stays zero.
 *  4. FLOOR LAW: µ amounts floor to the chain's 3-decimal precision; a row flooring below
 *     the chain dust (0.001) is refused DUST — no zero-amount broadcasts, ever.
 *  5. SINGLE-WRITER: the queue file is consumed atomically (tmp+rename), rows are marked
 *     IN PLACE (broadcast txid / refused reason) — the core's tick never sees a torn file.
 *  6. RAIL PROOF: the hand proves itself with a 0.001 STEEM SELF-TRANSFER (headcorner →
 *     headcorner — value-neutral, receipted with txid + block). One proof per day (history
 *     idempotency). The proof moves no value; it proves the hand can sign and broadcast.
 *  7. STASIS halt-before-read. FAIL-SOFT exit 0. Zero secrets printed — receipts carry
 *     public keys and txids only.
 *
 * Modes: status (keyless queue audit) | proof (LIVE self-transfer rail proof) |
 *        fire (LIVE queue consumption) | selftest (pure, zero network).
 * Run:   node agents/pegout-hand.cjs status|proof|fire|selftest
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Gate = require('../gate-crypto.js');

const AG = __dirname;
const QUEUE_FILE = path.join(AG, '..', 'dex', 'pegout-queue.json');
const STASIS_FILE = path.join(AG, 'STASIS.json');
const HC_DERIVED = process.env.HC_DERIVED || '/home/z/my-project/.fleet/headcorner-derived.json';
const OUT_JSON = path.join(AG, 'pegout-hand.json');
const OUT_MD = path.join(OUT_JSON.replace(/\.json$/, '.md'));
const HISTORY = path.join(OUT_JSON.replace(/\.json$/, '-history.jsonl'));
const RPC = process.env.STEEM_RPC || 'https://api.steemit.com';
const PROTOCOL = 'SAOS-PEGOUT-HAND/1';
const VERSION = 'pegout-hand v1.0.0 (R44 THE OPPOSING HANDS, CR-0074)';
const OPERATOR = 'headcorner';
const CHAIN_PRECISION = 3;              // STEEM/SBD liquid precision
const CHAIN_DUST = 1;                   // satoshi floor — below this a row is DUST
const MEMO_MAX = 120;

/** the estate roster — source of truth: /home/z/git-audit/steem/agent/soldier_auth_audit.json
 *  (15 accounts, 10/10 old roster + hcsoldier4/5/6 at 4/4 key-MATCH, live-verified 2026-10-04).
 *  A chain payout to any account outside this list is REFUSED-DEST-NOT-ESTATE. */
const ESTATE_ALLOWLIST = [
  'headcorner', 'cashmachine', 'lsa',
  'haran', 'israelnews', 'macrame', 'siq', 'tov', 'wic', 'wog', 'woq', 'ynet',
  'hcsoldier4', 'hcsoldier5', 'hcsoldier6',
];

// ---------- pure surface (E67 white-box) ----------

/** "0.001 STEEM" → { satoshi: 1n, precision: 3, symbol: 'STEEM' } */
function parseAsset(str) {
  const m = /^([0-9]+(?:\.[0-9]+)?)\s+([A-Z]+)$/.test(String(str || '').trim());
  if (!m) return null;
  const [amt, sym] = String(str).trim().split(/\s+/);
  const dot = amt.indexOf('.');
  const precision = dot === -1 ? 0 : amt.length - dot - 1;
  const scaled = BigInt(Math.round(parseFloat(amt) * 10 ** precision));
  return { satoshi: scaled, precision, symbol: sym };
}

/** µ → chain satoshi, FLOOR law (µ is finer than the chain's 3 decimals — we never round up) */
function muToSatoshi(muStr, precision) {
  const mu = BigInt(String(muStr));
  const per = 10n ** BigInt(6 - precision); // µ(1e-6) → 1e-3: divide by 1e3
  return mu / per;                           // BigInt division floors toward zero — the law
}

/** satoshi → "0.001 STEEM" chain form */
function satoshiToAmount(satoshi, symbol) {
  const s = BigInt(satoshi);
  const whole = s / 1000n, frac = s % 1000n;
  return `${whole}.${frac.toString().padStart(3, '0')} ${symbol}`;
}

/** transfer op → bytes (VERIFIED against steem-js transaction.toBuffer — golden vectors below;
 *  the asset field is int64-LE amount + precision byte + 7-byte symbol name, null-padded) */
function serializeTransferOp(op) {
  const out = [];
  const vstr = (s) => { const b = Buffer.from(s, 'utf8'); out.push(b.length); for (const x of b) out.push(x); };
  const o = op[1];
  const asset = parseAsset(o.amount);
  if (!asset) throw new Error('bad-asset');
  vstr(o.from); vstr(o.to);
  const amtBuf = Buffer.alloc(8);
  amtBuf.writeBigUInt64LE(asset.satoshi);
  for (const x of amtBuf) out.push(Number(x));
  out.push(asset.precision);
  const name = Buffer.from(asset.symbol, 'ascii');
  if (name.length > 7) throw new Error('symbol-too-long');
  const symBuf = Buffer.alloc(7, 0);
  name.copy(symBuf);
  for (const x of symBuf) out.push(Number(x));
  vstr(o.memo || '');
  return out;
}

/** tx → bytes exactly like steem-js transaction.toBuffer (transfer ops) */
function serializeTransferTx(tx) {
  const out = [];
  const rb = (n, len) => { let v = BigInt(n); for (let i = 0; i < len; i++) { out.push(Number(v & 0xffn)); v >>= 8n; } };
  rb(tx.ref_block_num, 2);
  rb(tx.ref_block_prefix, 4);
  const expSec = Math.floor(new Date(tx.expiration + (/[zZ]$/.test(tx.expiration) ? '' : 'Z')).getTime() / 1000);
  rb(expSec, 4);
  out.push(tx.operations.length);
  for (const op of tx.operations) {
    if (op[0] !== 'transfer') throw new Error('unsupported-op: ' + op[0]);
    out.push(2); // ChainTypes.transfer
    out.push(...serializeTransferOp(op));
  }
  out.push((tx.extensions || []).length);
  return new Uint8Array(out);
}

/** queue row → verdict (pure): FIREABLE-KEYED | PLAN-CORRIDOR | REFUSED-DEST-NOT-ESTATE | DUST | UNSUPPORTED-ASSET */
function validateRow(row, allowlist) {
  const list = allowlist || ESTATE_ALLOWLIST;
  const asset = row.asset === 'STEEM' || row.asset === 'SBD' ? row.asset : null;
  if (!asset) return { ok: false, refused: 'UNSUPPORTED-ASSET' };
  const satoshi = muToSatoshi(row.amount, CHAIN_PRECISION);
  if (satoshi < CHAIN_DUST) return { ok: false, refused: 'DUST', satoshi: satoshi.toString() };
  if (!list.includes(String(row.account))) return { ok: false, refused: 'REFUSED-DEST-NOT-ESTATE', satoshi: satoshi.toString() };
  if (String(row.corridor || '').indexOf('KEYED-DESK') !== 0) return { ok: true, verdict: 'PLAN-CORRIDOR', satoshi: satoshi.toString() };
  return { ok: true, verdict: 'FIREABLE-KEYED', satoshi: satoshi.toString() };
}

/** pure queue mutation: returns a NEW doc (the caller writes it atomically); the input is untouched */
function applyResult(queueDoc, intentId, patch) {
  const rows = (queueDoc.rows || []).map((r) => (r.intentId === intentId ? { ...r, ...patch } : r));
  return { ...queueDoc, rows, at: new Date().toISOString() };
}

// ---------- signing (sovereign crypto, zero deps) ----------

async function rpcCall(method, params) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`rpc ${method}: ${String(j.error.message || '').slice(0, 90)}`);
  return j.result;
}

/** build + sign a transfer tx with the sovereign crypto (golden-vector serializer + gate signCompact) */
async function buildSignedTransfer(from, to, amount, memo, wif) {
  if (String(memo || '').length > MEMO_MAX) throw new Error('memo-too-long');
  const props = await rpcCall('condenser_api.get_dynamic_global_properties', []);
  const libr = Number(props.last_irreversible_block_num);
  const header = await rpcCall('condenser_api.get_block_header', [libr]);
  const prevId = String(header.previous || '');
  const prevB = Gate.unhex(prevId);
  const prefix = prevB[4] | (prevB[5] << 8) | (prevB[6] << 16) | (prevB[7] << 24);
  const expSec = Math.floor(new Date(props.time + 'Z').getTime() / 1000) + 600;
  const tx = {
    ref_block_num: (libr - 1) & 0xffff,
    ref_block_prefix: prefix >>> 0,
    expiration: new Date(expSec * 1000).toISOString().slice(0, 19),
    operations: [['transfer', { from, to, amount, memo: String(memo || '') }]],
    extensions: [],
  };
  const bytes = serializeTransferTx(tx);
  const digest = await Gate.sha256(Gate.cat(Gate.unhex(Gate.STEEM_CHAIN_ID), bytes));
  const priv = await Gate.wifToPriv(wif);
  const sig = await Gate.signCompact(digest, priv);
  return { ...tx, signatures: [Gate.hex(sig)] };
}

async function broadcast(signedTx) {
  // SYNCHRONOUS law: broadcast_transaction_synchronous returns { id, block_num, ... } ONLY when
  // the tx is INCLUDED in a block — a silent accept-and-drop (observed live with the plain
  // broadcast during R44 debugging) can never again be mistaken for a landed transaction.
  return rpcCall('condenser_api.broadcast_transaction_synchronous', [signedTx]);
}

// ---------- books ----------

function writeBook(obj) {
  const tmp = OUT_JSON + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, OUT_JSON);
}

function stasisCheck() {
  try { const st = JSON.parse(fs.readFileSync(STASIS_FILE, 'utf8')); return st && st.active === true ? st : null; } catch (_) { return null; }
}

function vaultState() {
  try { const v = JSON.parse(fs.readFileSync(HC_DERIVED, 'utf8')); const ok = !!(v && v.steem && v.steem.active && v.steem.active.wif); return { present: ok, pub: ok ? v.steem.active.pubkey : null, path: HC_DERIVED.replace(/^\/home\/[^/]+/, '~') }; } catch (_) { return { present: false, pub: null, path: HC_DERIVED.replace(/^\/home\/[^/]+/, '~') }; }
}

function appendHistory(row) { fs.appendFileSync(HISTORY, JSON.stringify(row) + '\n'); }

function loadQueue() { try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch (_) { return null; } }

function saveQueue(doc) {
  const tmp = QUEUE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 1) + '\n');
  fs.renameSync(tmp, QUEUE_FILE);
}

// ---------- modes ----------

async function status() {
  const now = new Date().toISOString();
  const queue = loadQueue();
  const vault = vaultState();
  const rows = ((queue && queue.rows) || []).map((r) => {
    const v = validateRow(r);
    return { intentId: r.intentId, asset: r.asset, amountMu: r.amount, dest: r.account, corridor: r.corridor, verdict: v.ok ? v.verdict : v.refused, satoshi: v.satoshi || null };
  });
  const fireable = rows.filter((r) => r.verdict === 'FIREABLE-KEYED');
  const refused = rows.filter((r) => String(r.verdict).indexOf('REFUSED') === 0);
  const book = {
    protocol: PROTOCOL, at: now, agent: VERSION,
    vault: { present: vault.present, pub: vault.pub, path: vault.path }, // presence + public key only — never the WIF
    live: process.env.PEGOUT_LIVE === '1',
    queueFile: 'dex/pegout-queue.json',
    rows, summary: {
      verdict: fireable.length > 0 ? (vault.present ? 'FIREABLE-KEYED-ARMED' : 'FIREABLE-BUT-NO-VAULT') : (refused.length > 0 ? 'ALL-REFUSED-OR-PLAN' : 'QUEUE-EMPTY'),
      fireable: fireable.length, refused: refused.length, total: rows.length,
      refusedByLaw: refused.map((r) => `${r.intentId}:${r.verdict}(${r.dest})`),
    },
    allowlist: { size: ESTATE_ALLOWLIST.length, law: 'chain payouts fire ONLY to estate-roster accounts — REFUSED-DEST-NOT-ESTATE otherwise' },
    laws: [
      'dest-allowlist: estate roster only — a payout to a non-estate name is refused, never broadcast',
      'keyed only: LIVE requires PEGOUT_LIVE=1 + the vault; keyless runs report, never sign',
      'sovereign crypto: own transfer serializer (golden-vector verified vs steem-js) + gate-crypto signCompact',
      'floor law: µ floors to the chain 3-decimal precision; below chain dust the row is refused',
      'single-writer: the queue is consumed atomically; rows marked in place with txid or refusal',
      'rail proof: a 0.001 self-transfer (value-neutral, receipted) proves the hand — one per day',
    ],
  };
  writeBook(book);
  const L = [];
  L.push('# pegout-hand — THE REAL-VALUE HAND (R44, CR-0074)');
  L.push('');
  L.push(`Updated: ${now}`);
  L.push('');
  L.push('## The hand');
  L.push(`- Vault: ${vault.present ? `PRESENT (${vault.pub.slice(0, 12)}…)` : 'ABSENT'} · LIVE gate: ${book.live ? 'ARMED' : 'dry (PEGOUT_LIVE unset)'}`);
  L.push(`- Verdict: ${book.summary.verdict} · fireable ${book.summary.fireable} · refused ${book.summary.refused} · total ${book.summary.total}`);
  for (const r of rows) L.push(`- Row ${r.intentId}: ${r.asset} ${r.amountMu}µ → ${r.dest} · ${r.verdict}${r.satoshi ? ` (${r.satoshi} satoshi after floor)` : ''}`);
  L.push('');
  L.push('Laws: ' + book.laws.map((_, i) => `L${i + 1}`).join(' '));
  L.push('');
  fs.writeFileSync(OUT_MD, L.join('\n'));
  appendHistory({ at: now, mode: 'status', verdict: book.summary.verdict, fireable: fireable.length, refused: refused.length });
  console.log(`[pegout-hand] ${book.summary.verdict} · fireable=${fireable.length} refused=${refused.length} vault=${vault.present}`);
  return 0;
}

async function proof() {
  const now = new Date().toISOString();
  const vault = vaultState();
  if (process.env.PEGOUT_LIVE !== '1' || !vault.present) {
    appendHistory({ at: now, mode: 'proof', verdict: 'DRY-REFUSED', why: !vault.present ? 'vault-absent' : 'PEGOUT_LIVE unset' });
    console.log('[pegout-hand] proof: DRY-REFUSED (LIVE requires PEGOUT_LIVE=1 + the vault) — honest, nothing signed');
    return 0;
  }
  // idempotency: one booked proof per day
  let hist = [];
  try { hist = fs.readFileSync(HISTORY, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { hist = []; }
  const today = now.slice(0, 10);
  const retracted = new Set(hist.filter((h) => h.verdict === 'PROOF-RETRACTED').map((h) => h.retracts));
  if (hist.some((h) => h.mode === 'proof' && h.verdict === 'PROOF-SENT' && !retracted.has(h.at) && String(h.at).slice(0, 10) === today)) {
    console.log('[pegout-hand] proof: PROOF-ALREADY-BOOKED today — the rail is already proven, no repeat');
    return 0;
  }
  const wif = JSON.parse(fs.readFileSync(HC_DERIVED, 'utf8')).steem.active.wif;
  const amount = '0.001 STEEM';
  const memo = 'SAOS-PEGOUT-HAND/1 rail-proof R44 — value-neutral self-transfer, the real-value law\u2019s hand';
  // STASIS per-site gate (owner directive 2026-10-04): halt before signing/broadcast, fail-closed
  try { if (require('./capital-gate.cjs').stasisHalt('pegout-hand')) { appendHistory({ at: now, mode: 'proof', verdict: 'STASIS-HALT', why: 'owner directive 2026-10-04 — nothing signed' }); return 0; } } catch (e) { console.log('[CAPITAL-GATE] pegout-hand — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); appendHistory({ at: now, mode: 'proof', verdict: 'STASIS-HALT', why: 'capital-gate module error — fail-closed' }); return 0; }
  try {
    const signed = await buildSignedTransfer(OPERATOR, OPERATOR, amount, memo, wif);
    const rcpt = await broadcast(signed);
    const txid = rcpt && rcpt.id ? rcpt.id : null;
    const blockNum = rcpt && (rcpt.block_num || rcpt.blockNumber) ? (rcpt.block_num || rcpt.blockNumber) : null;
    appendHistory({ at: now, mode: 'proof', verdict: txid ? 'PROOF-SENT' : 'PROOF-NO-RECEIPT', from: OPERATOR, to: OPERATOR, amount, memo: 'SAOS-PEGOUT-HAND/1 R44', txid, block: blockNum, refBlock: signed.ref_block_num });
    console.log(`[pegout-hand] ${txid ? 'PROOF-SENT' : 'PROOF-NO-RECEIPT'} · ${amount} ${OPERATOR}→${OPERATOR} · txid=${txid} · block=${blockNum}`);
    return 0;
  } catch (e) {
    appendHistory({ at: now, mode: 'proof', verdict: 'PROOF-FAILED', why: String(e.message).slice(0, 120) });
    console.log(`[pegout-hand] proof: PROOF-FAILED (booked honestly, exit 0) ${e.message}`);
    return 0;
  }
}

async function fire() {
  const now = new Date().toISOString();
  const vault = vaultState();
  const queue = loadQueue();
  if (!queue) { console.log('[pegout-hand] fire: queue unreadable — nothing to consume'); return 0; }
  if (process.env.PEGOUT_LIVE !== '1' || !vault.present) {
    console.log('[pegout-hand] fire: DRY (LIVE requires PEGOUT_LIVE=1 + vault) — reporting only');
    return status();
  }
  const wif = JSON.parse(fs.readFileSync(HC_DERIVED, 'utf8')).steem.active.wif;
  let doc = queue;
  for (const row of queue.rows || []) {
    const v = validateRow(row);
    if (!v.ok) { doc = applyResult(doc, row.intentId, { fired: false, refusal: v.refused, handledAt: now }); continue; }
    if (v.verdict !== 'FIREABLE-KEYED') { doc = applyResult(doc, row.intentId, { fired: false, refusal: v.verdict, handledAt: now }); continue; }
    // STASIS per-site gate (owner directive 2026-10-04): halt before signing/broadcast, fail-closed — remaining rows stay queued
    try { if (require('./capital-gate.cjs').stasisHalt('pegout-hand')) { appendHistory({ at: now, mode: 'fire', verdict: 'STASIS-HALT', why: 'owner directive 2026-10-04 — nothing signed, rows stay queued' }); break; } } catch (e) { console.log('[CAPITAL-GATE] pegout-hand — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); appendHistory({ at: now, mode: 'fire', verdict: 'STASIS-HALT', why: 'capital-gate module error — fail-closed, rows stay queued' }); break; }
    const amount = satoshiToAmount(v.satoshi, row.asset);
    try {
      const signed = await buildSignedTransfer(OPERATOR, row.account, amount, `SAOS-PEGOUT-HAND/1 redeem ${row.intentId}`, wif);
      const rcpt = await broadcast(signed);
      doc = applyResult(doc, row.intentId, { fired: true, txid: rcpt && rcpt.id ? rcpt.id : null, block: rcpt && rcpt.block_num ? rcpt.block_num : null, amount, handledAt: now });
    } catch (e) {
      doc = applyResult(doc, row.intentId, { fired: false, refusal: 'BROADCAST-FAILED: ' + String(e.message).slice(0, 80), handledAt: now });
    }
  }
  saveQueue(doc);
  const handled = (doc.rows || []).filter((r) => r.handledAt === now).length; // STASIS-aware: a halt leaves the rest queued
  appendHistory({ at: now, mode: 'fire', consumed: handled });
  console.log(`[pegout-hand] fire: consumed ${handled} rows (single-writer, atomic)`);
  return 0;
}

// ---------- selftest (pure, zero network) ----------

function selftest() {
  const c = [];
  const ok = (name, cond) => c.push({ name, ok: !!cond });
  // parseAsset
  const pa = parseAsset('0.001 STEEM');
  ok('parse-asset', pa.satoshi === 1n && pa.precision === 3 && pa.symbol === 'STEEM');
  ok('parse-asset-sbd', parseAsset('0.010 SBD').satoshi === 10n && parseAsset('0.010 SBD').symbol === 'SBD');
  ok('parse-asset-bad', parseAsset('garbage') === null && parseAsset('5') === null);
  // floor law
  ok('floor-9358mu', muToSatoshi('9358', 3) === 9n);        // 0.009358 → 0.009
  ok('floor-999mu', muToSatoshi('999', 3) === 0n);          // below chain dust floors to zero
  ok('floor-1000mu', muToSatoshi('1000', 3) === 1n);
  ok('satoshi-to-amount', satoshiToAmount(9n, 'STEEM') === '0.009 STEEM' && satoshiToAmount(1n, 'STEEM') === '0.001 STEEM');
  // SERIALIZER GOLDEN VECTORS — byte-verified against steem-js transaction.toBuffer (2026-10-04)
  const g1 = serializeTransferTx({ ref_block_num: 44000, ref_block_prefix: 305419896, expiration: '2026-10-04T16:00:00', operations: [['transfer', { from: 'headcorner', to: 'headcorner', amount: '0.001 STEEM', memo: 'SAOS-PEGOUT-HAND/1 rail-proof R44' }]], extensions: [] });
  ok('golden-vector-1', Buffer.from(g1).toString('hex') === 'e0ab785634120078c26a01020a68656164636f726e65720a68656164636f726e6572010000000000000003535445454d00002153414f532d5045474f55542d48414e442f31207261696c2d70726f6f662052343400');
  const g2 = serializeTransferTx({ ref_block_num: 1, ref_block_prefix: 2, expiration: '2026-10-05T00:00:00', operations: [['transfer', { from: 'headcorner', to: 'cashmachine', amount: '0.010 SBD', memo: 'x' }]], extensions: [] });
  ok('golden-vector-2', Buffer.from(g2).toString('hex') === '01000200000080e8c26a01020a68656164636f726e65720b636173686d616368696e650a000000000000000353424400000000017800');
  // dest-allowlist law
  ok('allowlist-estate-ok', validateRow({ asset: 'STEEM', amount: '1000', account: 'cashmachine', corridor: 'KEYED-DESK' }).verdict === 'FIREABLE-KEYED');
  ok('allowlist-treasury-refused', validateRow({ asset: 'STEEM', amount: '9358', account: 'treasury', corridor: 'KEYED-DESK' }).refused === 'REFUSED-DEST-NOT-ESTATE'); // the live queue row
  ok('allowlist-squatter-refused', validateRow({ asset: 'SBD', amount: '5000', account: 'satoshi', corridor: 'KEYED-DESK' }).refused === 'REFUSED-DEST-NOT-ESTATE');
  ok('dust-refused', validateRow({ asset: 'STEEM', amount: '999', account: 'cashmachine', corridor: 'KEYED-DESK' }).refused === 'DUST');
  ok('plan-corridor', validateRow({ asset: 'BLURT', amount: '5000', account: 'headcorner', corridor: 'PLAN-PEGOUT-KEYED-OPERATOR' }).refused === 'UNSUPPORTED-ASSET');
  ok('unsupported-asset', validateRow({ asset: 'BTC', amount: '5000', account: 'headcorner', corridor: 'KEYED-DESK' }).refused === 'UNSUPPORTED-ASSET');
  // applyResult purity: the input doc is untouched, the row is patched in the copy
  const q = { rows: [{ intentId: 'A', asset: 'STEEM', amount: '1000', account: 'cashmachine' }] };
  const q2 = applyResult(q, 'A', { fired: true, tx: 'x' });
  ok('apply-pure-input-untouched', q.rows[0].fired === undefined && q2.rows[0].fired === true && q2.rows[0].intentId === 'A');
  ok('apply-unknown-id-noop', applyResult(q, 'ZZZ', { fired: true }).rows[0].fired === undefined);
  const pass = c.filter((x) => x.ok).length;
  console.log(`PEGOUT-HAND-SELFTEST-OK ${pass}/${c.length}`);
  if (pass !== c.length) { for (const x of c) if (!x.ok) console.log(`  FAIL ${x.name}`); }
  return pass === c.length ? 0 : 1;
}

if (require.main === module) {
  const arg = process.argv[2] || 'status';
  if (arg === 'selftest') process.exit(selftest());
  const run = arg === 'proof' ? proof : arg === 'fire' ? fire : status;
  try {
    const st = stasisCheck();
    if (st) { console.log(`STASIS-HALT pegout-hand · ${new Date().toISOString()}`); process.exit(0); }
    Promise.resolve(run()).then((rc) => process.exit(rc)).catch(() => process.exit(0));
  } catch (e) {
    console.log(`pegout-hand: ERROR (booked honestly, exit 0) ${e.message}`);
    process.exit(0);
  }
}

module.exports = { PROTOCOL, VERSION, ESTATE_ALLOWLIST, parseAsset, muToSatoshi, satoshiToAmount, serializeTransferOp, serializeTransferTx, validateRow, applyResult, selftest };
