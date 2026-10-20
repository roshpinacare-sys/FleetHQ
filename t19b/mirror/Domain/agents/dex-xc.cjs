'use strict';
/**
 * dex-xc.cjs — R43 THE INTENT GATES (CR-0073 / feat-068 / E66, suite v1.51.0 → v1.52.0)
 *
 * Owner directive (2026-10-04, Hebrew, trace 1a1…c3a5): "אני גם רוצה לפתוח את הדקס
 * לעוד רשתות חכמות לכולן ושיהיה לנו ראוטרים שנוכל לקבל ולהחליף גם כבר סכומים גדולים על כל
 * רשת... באמת להחליף למטבע האמיתי עם ערך ולא סתם שקר... שהכל ירוץ וודאי עם בדיקות".
 *
 * The DEX stack: R39 ROUTER (venue graph + honest verdicts) → R40 CORE (atomic settlement +
 * real-value vault) → R41 MESH (the fleet as demand) → R42 VAULT (multi-network custody +
 * redeem corridors). R43 builds the CROSS-CHAIN INTENT layer — ERC-7683 vocabulary (open →
 * resolve → evaluate → fill → settle/timeout/refund) over ONE deterministic ledger:
 *
 *  - DOOR LAW: every network gets a DOOR with a measured FINALITY clock and an honest band
 *    (sources booked in CR-0073): STEEM/SBD = KEYED-DESK (our custody, live corridor),
 *    HIVE/HBD/BLURT = PLAN-PEGOUT-KEYED-OPERATOR (corridor named, keys gated — R42 law),
 *    EVM/TRON/SOL = PLAN-KEYED-DOOR (priced, never settled, until keys verify). A door's
 *    name is its opening law: the registry never pretends.
 *  - ESCROW LAW (the ERC-7683 open): an intent escrows its input BEFORE any fill — claims
 *    move owner → xc-escrow (conservation-clean, zero-sum, asserted every op). No escrow,
 *    no intent. Idempotency by escrow drain: a replayed fill/refund finds the escrow empty.
 *  - QUOTE LAW: the intent's floor derives from OUR OWN pools (routeBest, BigInt exact)
 *    with the mesh's −0.5% guard. An intent without a priced route is refused NO-ROUTE —
 *    we never hold escrow against nothing.
 *  - FILL LAW (the traffic flywheel): the DEFAULT solver is our own pool graph — every
 *    intent pays fees to OUR network (the owner's "רוב התעבורה תקרה על הרשת שלנו").
 *    P2P fillers (the mesh roster) may outbid the pool: best deliver wins, ties go to the
 *    pool (deterministic). Escrow-first makes P2P safe: the filler delivers against HELD
 *    escrow, the escrow drains to the filler atomically.
 *  - CHAIN-DEST LAW (the real-value law, cross-chain): the route lands on the vault wrapper
 *    (WSTEEM/WSBD/WHIVE/WHBD/WBLURT), the R42 REDEEM law burns it 1:1 and queues the chain
 *    payout to dex/pegout-queue.json with the CORRIDOR NAMED — keyless code never broadcasts.
 *  - BOND LAW (large sums, THORChain-adapted 2:1): the vault's OUTSTANDING corridor exposure
 *    may never exceed 2× its custody of the payout asset — exposure is booked at fill,
 *    cleared at confirm. Exceeded ⇒ BOND-LAW-EXCEEDED, byte-unchanged.
 *  - CLOCK LAW (the HTLC 2:1 timelock, decred-atomicswap convention compressed to our
 *    finalities): the filler's fill window is FILL_TIMEOUT_S; the owner's refund unlocks at
 *    REFUND_UNLOCK_S = 2 × FILL_TIMEOUT_S — the destination claim window always closes a
 *    full window BEFORE the origin refund unlocks (the interlocking is crucial). Refunds are
 *    WHOLE — the timelock is the law, no dust loss. LEDGER-dest fills confirm ATOMICALLY
 *    (same ledger); CHAIN-dest fills confirm when the door's finality clock passes.
 *  - SIZE-SCALED CONFIRMATION LAW (Chainflip/THORChain family): every door carries a HARD
 *    finality constant (EVM 780s = Ethereum 2-epoch governing; TRON 60s solidified; SOL 13s
 *    = 32 slots; STEEM/HIVE 60s = 2/3-witness round; BLURT 63s = full 21-witness round) —
 *    the confirm clock reads the DOOR, never a guess.
 *  - SPLIT-FILL LAW: one intent ≤ 5% of first-hop depth (the mesh cap inherited) — larger
 *    sums are refused SIZE-CAP-SPLIT-REQUIRED: split into child intents (the honest way to
 *    move big size through thin books — "$1M handled the same as a million $1s").
 *  - STASIS: halt-before-read (FATE-DEFENSE law 3). Fail-soft exit 0 always.
 *  - JUDGE SEPARATION (the mesh pattern): dex-xc DRAFTS ops + owns the doors/clocks/state;
 *    dex-core APPLIES them atomically on the single balance universe (fresh process). The
 *    core stays dumb and safe; the doors never touch balances directly.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const dc = require('./dex-core.cjs'); // the engine — required, never re-implemented

const AG = __dirname;
const CORE_BOOK = path.join(AG, 'dex-core.json');
const CORE_HISTORY = path.join(AG, 'dex-core-history.jsonl');
const STASIS_FILE = path.join(AG, 'STASIS.json');
const BOOK_FILE = path.join(AG, '..', 'dex', 'xc-intents.json');
const OPS_QUEUE = path.join(AG, '..', 'dex', 'xc-ops.json');
const REQUESTS_FILE = path.join(AG, '..', 'dex', 'xc-requests.json');
const OUT_JSON = path.join(AG, 'dex-xc.json');
const OUT_MD = path.join(AG, 'dex-xc.md');
const OUT_HISTORY = path.join(AG, 'dex-xc-history.jsonl');

const PROTOCOL = 'SAOS-DEX-XC/1';
const VERSION = 'dex-xc v1.0.0 (R43 INTENT GATES, CR-0073)';

// ── measured constants (research rung R43-a — sources in CR-0073) ──────────
/** DOOR REGISTRY: per-chain band + HARD finality clock. The band names the unlock,
 *  the finality gates the confirm. Sources: EVM 780s = Ethereum PoS 2-epoch finality
 *  (ethereum.org; Circle ops 15-19min — the conservative L1 governs large sums, L2 rails
 *  settle via L1 canonical bridges); TRON 60s = solidified at 19 distinct SRs
 *  (developers.tron.network); SOL 13s = 32 slots × 400ms (Circle ops); STEEM/HIVE 60s =
 *  2/3-witness BFT-DPoS round over 3s blocks (whitepaper primary; hard threshold
 *  canonical-knowledge); BLURT 63s = full 21-witness round (blurtwallet FAQ). */
const DOORS = {
  EVM: { band: 'PLAN-KEYED-DOOR', finalityHardS: 780, asset: null, source: 'ethereum.org PoS 2-epoch 768s + pad; L2 rails settle via L1 — the conservative number governs large sums' },
  TRON: { band: 'PLAN-KEYED-DOOR', finalityHardS: 60, asset: null, source: 'developers.tron.network — solidified at 19 distinct SRs (~57-60s)' },
  SOL: { band: 'PLAN-KEYED-DOOR', finalityHardS: 13, asset: null, source: '32 slots x 400ms = 12.8s (Circle CCTP ops table)' },
  STEEM: { band: 'KEYED-DESK', finalityHardS: 60, asset: 'STEEM', source: '3s blocks (steem whitepaper); hard gate = 2/3-witness round (canonical-knowledge 45-63s, taken 60)' },
  SBD: { band: 'KEYED-DESK', finalityHardS: 60, asset: 'SBD', source: 'same chain clock as STEEM' },
  HIVE: { band: 'PLAN-PEGOUT-KEYED-OPERATOR', finalityHardS: 60, asset: 'HIVE', source: '3s blocks; hive.io one-block "irreversibility" is SOFT finality — large sums gate on the 2/3-witness round (canonical-knowledge)' },
  HBD: { band: 'PLAN-PEGOUT-KEYED-OPERATOR', finalityHardS: 60, asset: 'HBD', source: 'same chain clock as HIVE' },
  BLURT: { band: 'PLAN-PEGOUT-KEYED-OPERATOR', finalityHardS: 63, asset: 'BLURT', source: 'blurtwallet FAQ — 3s blocks, full 21-witness round 63s' },
};
const FILL_TIMEOUT_S = 3600;   // the filler's destination claim window (1h)
const REFUND_UNLOCK_S = 7200;  // the owner's refund unlock = 2 × FILL_TIMEOUT_S (the HTLC 2:1 interlock — decred atomicswap 48h/24h law compressed)
const XC_GUARD_BPS = 50n;      // minOut guard at open: quote −0.5% (the mesh law inherited)
const XC_DUST = dc.MESH_DUST;  // 1000µ — below this an intent is noise
const XC_HISTORY_TAIL = 400;   // core history ops scanned per tick for XC ops

const ub = (s) => { try { return BigInt(String(s)); } catch (_) { return 0n; } };
const mu = (z) => z.toString();
const BPS = dc.BPS, NANO = dc.NANO;

function nowIso() {
  if (process.env.DEX_XC_NOW) { const t = Date.parse(process.env.DEX_XC_NOW); if (isFinite(t)) return new Date(t).toISOString(); }
  return new Date().toISOString();
}
function sha16(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }
function isoPlus(iso, seconds) { return new Date(Date.parse(iso) + seconds * 1000).toISOString(); }
function stasisCheck() {
  try { const s = JSON.parse(fs.readFileSync(STASIS_FILE, 'utf8')); return s && s.active ? s : null; } catch (_) { return null; }
}

// ── pure laws (deterministic, eval-recomputable) ────────────────────────────

/** QUOTE LAW: floor = routeBest over OUR pools, guard −0.5%. null ⇒ no honest route. */
function priceIntent(pools, from, to, amountMu) {
  const amt = ub(amountMu);
  if (!(amt > 0n) || from === to) return null;
  const route = dc.routeBest(pools || [], from, to, amt);
  if (!route) return null;
  const quote = route.out;
  const minOut = quote - (quote * XC_GUARD_BPS / BPS); // BigInt floor — the guard never rounds up
  return { quoteMu: mu(quote), minOutMu: mu(minOut), routeIds: route.ids, guardBps: Number(XC_GUARD_BPS) };
}

/** DOOR LAW: resolve a request into an intent row (or an honest refusal band). */
function planOpen(coreBook, req, now) {
  const refusal = (band) => ({ ok: false, band, intent: null });
  const pools = (coreBook && coreBook.pools) || [];
  const owner = String((req && req.owner) || '');
  const origin = String((req && req.origin) || '');
  const amount = ub(req && req.amountMu);
  const destChain = (req && req.destChain) ? String(req.destChain) : null;
  const destAsset = (req && req.dest) ? String(req.dest) : null;
  if (!owner || !origin) return refusal('BAD-REQUEST');
  if (!(amount >= XC_DUST)) return refusal('DUST');
  const accounts = (coreBook && coreBook.accounts) || {};
  if (!accounts[owner]) return refusal('UNKNOWN-OWNER');
  if (destChain && destAsset) return refusal('BAD-REQUEST (dest XOR destChain)');
  let destKind, wrapper = null, door = null;
  if (destChain) {
    door = DOORS[destChain];
    if (!door) return refusal('UNKNOWN-DOOR');
    wrapper = dc.CHAIN_WRAPPER[destChain] || null;
    if (!wrapper) {
      // the EVM/TRON/SOL family: the door is PRICED (measurement), never settled, until keys verify
      return refusal(`DOOR-GATED-PLAN (${destChain} — ${door.band}; the corridor opens the day verified key material lands, no new code)`);
    }
    destKind = 'CHAIN';
  } else {
    if (!destAsset || (!['STEEM', 'SBD', 'HIVE', 'HBD', 'BLURT', 'SAOS', 'WSTEEM', 'WSBD', 'WHIVE', 'WHBD', 'WBLURT'].includes(destAsset))) return refusal('BAD-DEST');
    destKind = 'LEDGER';
  }
  const price = priceIntent(pools, origin, destKind === 'CHAIN' ? wrapper : destAsset, amount);
  if (!price) return refusal('NO-ROUTE (no priced route on our pools — the escrow law refuses to hold capital against nothing)');
  // SPLIT-FILL LAW: one intent ≤ 5% of first-hop depth — larger sums split into child intents
  let depth = 0n;
  for (const p of pools) {
    if (p.planned || (ub(p.ra) <= 0n && ub(p.rb) <= 0n)) continue;
    if (p.a === origin) depth = depth === 0n ? ub(p.ra) : (ub(p.ra) < depth ? ub(p.ra) : depth);
    if (p.b === origin) depth = depth === 0n ? ub(p.rb) : (ub(p.rb) < depth ? ub(p.rb) : depth);
  }
  const cap = depth * 500n / BPS; // 5% (MESH_FILL_MAX_DEPTH_BPS), restated to keep this module's law self-contained
  if (amount > cap) return refusal(`SIZE-CAP-SPLIT-REQUIRED (${mu(amount)} > 5% of first-hop depth ${mu(depth)} — split into child intents)`);
  const at = String((req && req.at) || now);
  const intentId = sha16(JSON.stringify({ owner, origin, destKind, destAsset, destChain, amountMu: mu(amount), at }));
  const intent = {
    intentId, owner, origin, amountMu: mu(amount), destKind, destAsset, destChain,
    band: destKind === 'CHAIN' ? door.band : 'INTERNAL-BOOK (settlement on our own ledger)',
    doorFinalityS: destKind === 'CHAIN' ? door.finalityHardS : 0,
    quoteMu: price.quoteMu, minOutMu: price.minOutMu, routeIds: price.routeIds, guardBps: price.guardBps,
    state: 'DRAFTED', openedAt: at, fillDeadline: isoPlus(at, FILL_TIMEOUT_S), refundUnlock: isoPlus(at, REFUND_UNLOCK_S),
    filledAt: null, confirmedAt: null, fillMode: null, filler: null, filledOutMu: null, payoutMu: null, corridor: null, refusals: [],
  };
  return { ok: true, band: null, intent };
}

/** FILL COMPETITION (deterministic): the pool is the default solver; a P2P offer wins only
 *  by outbidding it (deliver > pool quote), ties go to the pool. Returns ONE fill op. */
function chooseFill(coreBook, intent, offers) {
  const pools = (coreBook && coreBook.pools) || [];
  const fresh = priceIntent(pools, intent.origin, intent.destKind === 'CHAIN' ? (dc.CHAIN_WRAPPER[intent.destChain] || '') : intent.destAsset, intent.amountMu);
  const poolQuote = fresh ? ub(fresh.quoteMu) : 0n;
  let best = null;
  for (const o of (offers || []).sort((a, b) => (a.filler || '').localeCompare(b.filler || ''))) {
    if (o.intentId !== intent.intentId) continue;
    if (intent.destKind !== 'LEDGER') continue; // P2P is ledger-dest only (chain payouts ride the vault corridors)
    const deliver = ub(o.deliverMu);
    if (deliver <= poolQuote && !(poolQuote === 0n && deliver >= ub(intent.minOutMu))) continue; // must beat the pool (or cover the floor when the pool can't quote)
    if (!best || deliver > ub(best.deliverMu)) best = o; // deterministic: strictly more wins, ties keep the lexicographically-first filler
  }
  if (best) {
    return { op: { type: 'XC-FILL-P2P', intentId: intent.intentId, owner: intent.owner, origin: intent.origin, destKind: intent.destKind, destAsset: intent.destAsset, destChain: intent.destChain, amountMu: intent.amountMu, minOutMu: intent.minOutMu, filler: best.filler, deliverMu: mu(ub(best.deliverMu)) }, mode: 'P2P', solver: best.filler };
  }
  if (poolQuote > 0n && poolQuote >= ub(intent.minOutMu)) {
    return { op: { type: 'XC-FILL-POOL', intentId: intent.intentId, owner: intent.owner, origin: intent.origin, destKind: intent.destKind, destAsset: intent.destAsset, destChain: intent.destChain, amountMu: intent.amountMu, minOutMu: intent.minOutMu }, mode: 'POOL', solver: 'our-pools' };
  }
  return null; // no honest fill this tick — the clock runs, the refund law protects the owner
}

/** CLOCK LAW: the ops the clock owes this tick (refund at unlock, confirm at finality). */
function clockActions(intents, now) {
  const t = Date.parse(now);
  const ops = [];
  for (const it of (intents || []).slice().sort((a, b) => a.intentId.localeCompare(b.intentId))) {
    if (it.state === 'OPENED' && t >= Date.parse(it.refundUnlock)) {
      ops.push({ type: 'XC-REFUND', intentId: it.intentId, owner: it.owner, origin: it.origin, amountMu: it.amountMu, why: 'refund unlock (2:1 clock) — unfilled past the interlock' });
    } else if (it.state === 'FILLED' && it.destKind === 'CHAIN' && it.filledAt && t >= Date.parse(isoPlus(it.filledAt, it.doorFinalityS || 0))) {
      ops.push({ type: 'XC-CONFIRM', intentId: it.intentId, asset: it.destChain ? (dc.WRAP_UNDERLYING[dc.CHAIN_WRAPPER[it.destChain]] || it.destChain) : it.destAsset, payoutMu: it.payoutMu || it.filledOutMu || '0', why: `finality clock passed (${it.doorFinalityS}s hard — ${DOORS[it.destChain] ? DOORS[it.destChain].source.slice(0, 40) : 'ledger-atomic'})` });
    }
  }
  return ops;
}

/** STATE ADVANCE (event-sourced): apply the core's booked XC ops to the intent states. */
function advanceStates(intents, coreOps) {
  const byId = new Map((intents || []).map((it) => [it.intentId, it]));
  const rows = (intents || []).map((it) => JSON.parse(JSON.stringify(it)));
  const rowsById = new Map(rows.map((it) => [it.intentId, it]));
  const stats = { opened: 0, filled: 0, confirmed: 0, refunded: 0, refused: 0 };
  for (const o of (coreOps || [])) {
    const id = o.intentId;
    if (!id) continue;
    const it = rowsById.get(id);
    if (!it) continue;
    if (o.type === 'XC-ESCROW') { if (it.state === 'DRAFTED') it.state = 'OPENED'; }
    else if (o.type === 'XC-FILL') {
      if (it.state === 'OPENED' || it.state === 'DRAFTED') {
        it.state = 'FILLED'; it.filledAt = o.at; it.fillMode = o.mode || null; it.filler = o.filler || null;
        it.filledOutMu = o.mode === 'P2P' ? o.delivered : (o.mode === 'POOL-CHAIN' ? o.wrapperOut : o.out);
        if (o.mode === 'POOL-CHAIN') { it.payoutMu = o.wrapperOut; it.corridor = (o.pegout && o.pegout.corridor) || null; }
        if (o.mode === 'POOL-LEDGER' || o.mode === 'P2P') { it.state = 'CONFIRMED'; it.confirmedAt = o.at; } // ledger-atomic — confirmed at fill
      }
    } else if (o.type === 'XC-CONFIRM') { if (it.state === 'FILLED') { it.state = 'CONFIRMED'; it.confirmedAt = o.at; } }
    else if (o.type === 'XC-REFUND') { if (it.state === 'OPENED' || it.state === 'DRAFTED') { it.state = 'REFUNDED'; it.confirmedAt = o.at; } }
    else if (o.type === 'XC-REFUSED') { it.refusals.push({ xcOp: o.xcOp, why: o.why }); if (o.xcOp === 'XC-OPEN' && it.state === 'DRAFTED') it.state = 'OPEN-REFUSED'; }
  }
  for (const it of rows) {
    if (it.state === 'OPENED') stats.opened += 1;
    else if (it.state === 'FILLED') stats.filled += 1;
    else if (it.state === 'CONFIRMED') stats.confirmed += 1;
    else if (it.state === 'REFUNDED') stats.refunded += 1;
    else if (it.state === 'OPEN-REFUSED') stats.refused += 1;
  }
  return { intents: rows, stats };
}

/** Read the core's XC ops from the append-only history tail (event sourcing — the book is the fold). */
function coreXcOps(tail) {
  const out = [];
  try {
    const lines = fs.readFileSync(CORE_HISTORY, 'utf8').trim().split('\n');
    for (const line of lines.slice(-Math.max(1, tail || XC_HISTORY_TAIL))) {
      try { const o = JSON.parse(line); if (o && typeof o.type === 'string' && o.type.indexOf('XC-') === 0) out.push(o); } catch (_) {}
    }
  } catch (_) {}
  return out;
}

function attestationHash(book) {
  const canon = JSON.stringify({
    intents: (book.intents || []).map((i) => [i.intentId, i.state, i.filledAt, i.confirmedAt]).sort(),
    stats: book.stats || {},
    doorsLaw: { fillTimeoutS: FILL_TIMEOUT_S, refundUnlockS: REFUND_UNLOCK_S },
  });
  return sha16(canon);
}

// ── books (single-writer, atomic tmp+rename) ────────────────────────────────
function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, file);
}
function loadBook() { try { return JSON.parse(fs.readFileSync(BOOK_FILE, 'utf8')); } catch (_) { return null; } }
function loadCore() { try { return JSON.parse(fs.readFileSync(CORE_BOOK, 'utf8')); } catch (_) { return null; } }
function loadRequests() { try { return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8')); } catch (_) { return null; } }
function appendHistory(rows) {
  if (!rows.length) return;
  fs.appendFileSync(OUT_HISTORY, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

function writeMd(b) {
  try {
    const L = [];
    L.push(`# dex-xc — THE INTENT GATES (R43, CR-0073)`);
    L.push('');
    L.push(`At: ${b.at} · Verdict: **${b.verdict}** · mode: ${b.mode} · batch: ${b.batchId || '—'} · attestation: \`${b.attestation}\``);
    L.push('');
    L.push(`Doors law: fill window ${FILL_TIMEOUT_S}s · refund unlock ${REFUND_UNLOCK_S}s (the 2:1 HTLC interlock) · bond exposure ≤ 2× custody · guard ${Number(XC_GUARD_BPS) / 100}% · dust ${mu(XC_DUST)}µ`);
    L.push('');
    L.push(`| Door | Band | Hard finality | Source |`);
    L.push(`|---|---|---|---|`);
    for (const [k, d] of Object.entries(DOORS)) L.push(`| ${k} | ${d.band} | ${d.finalityHardS}s | ${d.source.slice(0, 80)} |`);
    L.push('');
    const live = (b.intents || []).filter((i) => !['OPEN-REFUSED', 'REFUNDED'].includes(i.state));
    L.push(`Intents: ${(b.intents || []).length} booked · ${b.stats ? `opened ${b.stats.opened} / filled ${b.stats.filled} / confirmed ${b.stats.confirmed} / refunded ${b.stats.refunded} / refused ${b.stats.refused}` : '—'}`);
    L.push('');
    L.push(`| Intent | Owner | Order | Size (µ) | State | Corridor |`);
    L.push(`|---|---|---|---|---|---|`);
    for (const i of (b.intents || []).slice(-24)) {
      const order = i.destKind === 'CHAIN' ? `${i.origin}→${i.destChain}(chain)` : `${i.origin}→${i.destAsset}`;
      L.push(`| ${i.intentId} | ${i.owner} | ${order} | ${i.amountMu} | ${i.state} | ${i.corridor || (i.band || '—').slice(0, 34)} |`);
    }
    if (b.exposure && Object.keys(b.exposure).length) L.push(`\nCorridor exposure (bonded ≤ 2× custody): ${Object.entries(b.exposure).map(([k, v]) => `${k} ${v}µ`).join(' · ')}`);
    L.push('');
    L.push(`Every fill routes through OUR pools (the fees stay home); every chain payout is queued to dex/pegout-queue.json with the corridor named — keyless code never broadcasts; the escrow law + the 2:1 clock + the bond law hold in both directions.`);
    L.push('');
    fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
  } catch (_) {}
}

// ── tick: draft → advance → clock → queue → spawn the core settle ──────────
async function tick() {
  const now = nowIso();
  try {
    const stasis = stasisCheck();
    if (stasis) {
      writeJson(OUT_JSON, { protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'XC-DOORS-HALTED-STASIS', stasisHalted: true, stasisReason: stasis.reason || null, intents: [], stats: {}, doors: DOORS, errors: [] });
      console.log(`STASIS-HALT dex-xc · ${now}`);
      return 0;
    }
    const core = loadCore();
    if (!core || core.protocol !== dc.PROTOCOL || !core.genesisDone || core.conservationOk === false) {
      writeJson(OUT_JSON, { protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'XC-DOORS-WAITING (no healthy core book — the doors wait, nothing is drafted)', stasisHalted: false, intents: [], stats: {}, doors: DOORS, errors: [] });
      console.log('dex-xc: no healthy core book — doors wait');
      return 0;
    }
    let book = loadBook();
    const freshBook = !book || book.protocol !== PROTOCOL;
    if (freshBook) book = { protocol: PROTOCOL, at: now, agent: VERSION, intents: [], stats: { opened: 0, filled: 0, confirmed: 0, refunded: 0, refused: 0 }, processedOps: [], errors: [] };
    book.at = now; book.agent = VERSION; book.stasisHalted = false; book.errors = [];

    // 1) STATE ADVANCE from the core's booked XC ops (event sourcing)
    const ops = coreXcOps(XC_HISTORY_TAIL);
    const adv = advanceStates(book.intents, ops);
    book.intents = adv.intents; book.stats = adv.stats;

    // 2) REQUEST INBOX: plan opens (the door law prices and gates every request honestly)
    const reqs = loadRequests();
    const drafted = [];
    const newIntents = [];
    const planNotes = [];
    if (reqs && Array.isArray(reqs.requests) && reqs.requests.length) {
      const known = new Set(book.intents.map((i) => i.intentId));
      for (const r of reqs.requests) {
        const plan = planOpen(core, r, now);
        if (!plan.ok) { planNotes.push({ owner: (r && r.owner) || '?', band: plan.band }); continue; }
        if (known.has(plan.intent.intentId)) continue; // idempotent: the same request never opens twice
        newIntents.push(plan.intent);
        drafted.push({ type: 'XC-OPEN', intentId: plan.intent.intentId, owner: plan.intent.owner, origin: plan.intent.origin, destKind: plan.intent.destKind, destAsset: plan.intent.destAsset, destChain: plan.intent.destChain, amountMu: plan.intent.amountMu, minOutMu: plan.intent.minOutMu, quoteMu: plan.intent.quoteMu });
      }
      // consume the inbox (single-writer: the requests are now intents or honest plan-notes — replays dedupe by intentId anyway)
      try { writeJson(REQUESTS_FILE, { protocol: 'SAOS-DEX-XC-REQUESTS/1', at: now, requests: [], offers: [], lastProcessedAt: now }); } catch (_) {}
    }
    book.intents = [...book.intents, ...newIntents].slice(-256);

    // 3) SOLVER: every OPENED intent gets ONE honest fill attempt (pool default, P2P outbids)
    const offers = (reqs && Array.isArray(reqs.offers)) ? reqs.offers : [];
    const fillsDrafted = [];
    for (const it of book.intents.slice().sort((a, b) => a.intentId.localeCompare(b.intentId))) {
      if (it.state !== 'OPENED') continue;
      const t = Date.parse(now);
      if (t >= Date.parse(it.fillDeadline)) continue; // the fill window is closed — the refund clock owns it now
      const choice = chooseFill(core, it, offers);
      if (choice) fillsDrafted.push(choice.op);
    }

    // 4) CLOCK ACTIONS (refund at unlock, confirm at finality)
    const clockOps = clockActions(book.intents, now);

    // 5) THE QUEUE (single-writer: we write it, the core consumes+clears it)
    const allOps = [...drafted, ...fillsDrafted, ...clockOps];
    const batchId = allOps.length ? `XC-BATCH-${now.replace(/[-:.TZ]/g, '').slice(0, 14)}` : null;
    if (allOps.length) writeJson(OPS_QUEUE, { protocol: 'SAOS-DEX-XC-OPS/1', at: now, batch: batchId, ops: allOps });

    // 6) BOOK + MD + HISTORY
    book.doors = DOORS;
    book.doorsLaw = { fillTimeoutS: FILL_TIMEOUT_S, refundUnlockS: REFUND_UNLOCK_S, bondExposureRatio: '2:1 (XC_BOND_EXPOSURE_RATIO, enforced by the core)', guardBps: Number(XC_GUARD_BPS), dustMu: mu(XC_DUST) };
    book.core = { seq: core.seq, at: core.at, conservationOk: core.conservationOk, attestation: core.attestation };
    book.verdict = allOps.length ? (drafted.length ? 'XC-DOORS-DRAFTED' : (clockOps.length ? 'XC-CLOCK-ACTIONS' : 'XC-SOLVER-ACTIVE')) : (adv.stats.confirmed || adv.stats.refunded ? 'XC-DOORS-LIVE' : 'XC-DOORS-QUIET');
    book.batchId = batchId;
    book.queueDrafted = { opens: drafted.length, fills: fillsDrafted.length, clock: clockOps.length, planNotes };
    book.exposure = core.xcExposure || {};
    book.attestation = attestationHash(book);
    writeJson(BOOK_FILE, book); // the STATE book (persisted — the next tick folds its intents forward)
    writeJson(OUT_JSON, book); writeMd(book); // the proof book + the human page (same object)
    appendHistory([{ at: now, verdict: book.verdict, batch: batchId, opens: drafted.length, fills: fillsDrafted.length, clock: clockOps.length, planNotes: planNotes.length, intents: book.intents.length, attestation: book.attestation }]);

    // 7) SPAWN the core settle (judge separation — the mesh pattern; the core clears the queue)
    if (allOps.length) {
      const res = spawnSync(process.execPath, [path.join(AG, 'dex-core.cjs'), 'settle-xc'], { encoding: 'utf8', timeout: 120000 });
      const line = ((res.stdout || '').trim().split('\n').filter((l) => l.indexOf('DEX-CORE-XC-SETTLE') === 0 || l.indexOf('STASIS-HALT') === 0)[0]) || '';
      console.log(`DEX-XC-TICK verdict=${book.verdict} batch=${batchId} opens=${drafted.length} fills=${fillsDrafted.length} clock=${clockOps.length} ${line}`);
    } else {
      console.log(`DEX-XC-TICK verdict=${book.verdict} batch=— opens=0 fills=0 clock=0 intents=${book.intents.length}`);
    }
    return 0;
  } catch (e) {
    try {
      writeJson(OUT_JSON, { protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'ERROR (booked honestly, exit 0)', stasisHalted: false, intents: [], stats: {}, doors: DOORS, errors: [String(e.message).slice(0, 300)] });
      writeMd(JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')));
    } catch (_) {}
    console.log(`dex-xc: ERROR (booked honestly, exit 0) ${e.message}`);
    return 0;
  }
}

// ── selftest (fresh process, zero network, deterministic) ───────────────────
function selftest() {
  const c = []; const ok = (name, cond) => c.push({ name, ok: !!cond });
  const mkCore66 = () => ({
    protocol: 'SAOS-DEX-CORE/1', at: '2026-10-04T10:00:00.000Z', genesisDone: true, seq: 7,
    conservationOk: true, attestation: 'x',
    accounts: {
      treasury: { claims: { STEEM: '12829575', SBD: '119670', WSTEEM: '388775', WSBD: '27450' } },
      soldier1: { claims: { SBD: '5000', STEEM: '3000' } },
    },
    pools: [
      { id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: 2, ra: '388775', rb: '388775', feeMeter: '0', planned: false },
      { id: 'P2', pair: 'WSBD/SBD', kind: 'PEG', a: 'WSBD', b: 'SBD', feeBps: 2, ra: '27450', rb: '27450', feeMeter: '0', planned: false },
      { id: 'P3', pair: 'STEEM/SBD', kind: 'VOLATILE', a: 'STEEM', b: 'SBD', feeBps: 25, ra: '1555100', rb: '163980', feeMeter: '0', planned: false },
    ],
    // custody balanced by the conservation law: real assets = claims (treasury + soldier1) + wrappedReserve + pooled real sides
    vault: {
      custody: { STEEM: '15165225', SBD: '343550', HIVE: '0', HBD: '0', BLURT: '0', SAOS: '0' },
      wrappedReserve: { STEEM: '388775', SBD: '27450', HIVE: '0', HBD: '0', BLURT: '0', SAOS: '0' },
      minted: { WSTEEM: '388775', WSBD: '27450', WHIVE: '0', WHBD: '0', WBLURT: '0' },
      reserveRatio: {},
    },
  });
  const NOW = '2026-10-04T12:00:00.000Z';

  // doors: the registry is honest — bands name their unlock, finality constants are the measured ones
  ok('doors-8-networks', Object.keys(DOORS).length === 8);
  ok('doors-keyed-desk', DOORS.STEEM.band === 'KEYED-DESK' && DOORS.SBD.band === 'KEYED-DESK');
  ok('doors-plan-pegout', DOORS.HIVE.band === 'PLAN-PEGOUT-KEYED-OPERATOR' && DOORS.BLURT.band === 'PLAN-PEGOUT-KEYED-OPERATOR');
  ok('doors-plan-keyed', DOORS.EVM.band === 'PLAN-KEYED-DOOR' && DOORS.TRON.band === 'PLAN-KEYED-DOOR' && DOORS.SOL.band === 'PLAN-KEYED-DOOR');
  ok('doors-finality-measured', DOORS.EVM.finalityHardS === 780 && DOORS.TRON.finalityHardS === 60 && DOORS.SOL.finalityHardS === 13 && DOORS.STEEM.finalityHardS === 60 && DOORS.BLURT.finalityHardS === 63);
  // the 2:1 HTLC interlock: the refund unlock is a full fill-window AFTER the fill deadline
  ok('clock-2to1-law', REFUND_UNLOCK_S === 2 * FILL_TIMEOUT_S);
  ok('clock-interlock-order', Date.parse(isoPlus(NOW, FILL_TIMEOUT_S)) < Date.parse(isoPlus(NOW, REFUND_UNLOCK_S)));

  // quote law: minOut = quote −0.5% exactly (BigInt floor); no-route pairs price null
  const core66 = mkCore66();
  const q = priceIntent(core66.pools, 'SBD', 'STEEM', '1000');
  ok('quote-route-exists', !!q && q.routeIds.length >= 1 && ub(q.quoteMu) > 0n);
  ok('quote-guard-exact', ub(q.minOutMu) === ub(q.quoteMu) - (ub(q.quoteMu) * XC_GUARD_BPS / BPS));
  ok('quote-no-route-null', priceIntent(core66.pools, 'BLURT', 'STEEM', '1000') === null);
  ok('quote-determinism', JSON.stringify(priceIntent(core66.pools, 'SBD', 'STEEM', '1000')) === JSON.stringify(priceIntent(core66.pools, 'SBD', 'STEEM', '1000')));

  // door law: CHAIN dest without a wrapper is PRICED-NEVER-SETTLED (EVM/TRON/SOL)
  const evm = planOpen(core66, { at: NOW, owner: 'treasury', origin: 'SBD', destChain: 'EVM', amountMu: '1000' }, NOW);
  ok('door-evm-gated-honest', !evm.ok && evm.band.indexOf('DOOR-GATED-PLAN') === 0 && evm.band.indexOf('EVM') > 0);
  const ghost = planOpen(core66, { at: NOW, owner: 'treasury', origin: 'SBD', destChain: 'AVALANCHE', amountMu: '1000' }, NOW);
  ok('door-unknown-refused', !ghost.ok && ghost.band === 'UNKNOWN-DOOR');
  // chain dest with a wrapper: the intent prices through OUR pools to the wrapper
  const chain = planOpen(core66, { at: NOW, owner: 'treasury', origin: 'SBD', destChain: 'STEEM', amountMu: '1000' }, NOW);
  ok('door-chain-prices-to-wrapper', chain.ok && chain.intent.destKind === 'CHAIN' && chain.intent.routeIds.includes('P3') && chain.intent.routeIds.includes('P1') && chain.intent.band === 'KEYED-DESK');
  // ledger dest fine; determinism: same request → same intentId
  const ledger1 = planOpen(core66, { at: NOW, owner: 'treasury', origin: 'SBD', dest: 'STEEM', amountMu: '1000' }, NOW);
  const ledger2 = planOpen(core66, { at: NOW, owner: 'treasury', origin: 'SBD', dest: 'STEEM', amountMu: '1000' }, NOW);
  ok('door-ledger-prices', ledger1.ok && ledger1.intent.destKind === 'LEDGER');
  ok('intent-id-deterministic', ledger1.intent.intentId === ledger2.intent.intentId && ledger1.intent.intentId.length === 16);
  // split-fill law at plan time
  const big = planOpen(core66, { at: NOW, owner: 'treasury', origin: 'SBD', dest: 'STEEM', amountMu: '20000' }, NOW);
  ok('door-size-cap-honest', !big.ok && big.band.indexOf('SIZE-CAP-SPLIT-REQUIRED') === 0);
  // no escrow against nothing; dust refused; unknown owner refused
  ok('door-no-route-refused', !planOpen(core66, { at: NOW, owner: 'treasury', origin: 'SAOS', dest: 'STEEM', amountMu: '1000' }, NOW).ok);
  ok('door-dust-refused', !planOpen(core66, { at: NOW, owner: 'treasury', origin: 'SBD', dest: 'STEEM', amountMu: '10' }, NOW).ok);
  ok('door-unknown-owner-refused', !planOpen(core66, { at: NOW, owner: 'ghost', origin: 'SBD', dest: 'STEEM', amountMu: '1000' }, NOW).ok);

  // ── the core applies the doors' ops (one balance universe) ──
  const feed = { fresh: true, fair: '105446700' };
  // open: escrow moves claims, conservation holds
  const openQ = { batch: 'E66-OPEN', ops: [{ type: 'XC-OPEN', intentId: ledger1.intent.intentId, owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '1000', minOutMu: ledger1.intent.minOutMu }] };
  const rOpen = dc.settleXcOps(mkCore66(), openQ, feed, NOW);
  ok('open-escrow-moves', rOpen.settledXc.length === 1 && ub(rOpen.st.accounts['xc-escrow-' + ledger1.intent.intentId].claims.SBD) === 1000n && ub(rOpen.st.accounts.treasury.claims.SBD) === 118670n);
  ok('open-conservation', rOpen.consOk);
  // open refusals: dust / no-escrow / unknown-owner / double-open / bad-dest / door-gated
  const rRej = dc.settleXcOps(mkCore66(), { batch: 'E66-REJ', ops: [
    { type: 'XC-OPEN', intentId: 'aa01', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '10' },
    { type: 'XC-OPEN', intentId: 'aa02', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '999999999' },
    { type: 'XC-OPEN', intentId: 'aa03', owner: 'ghost', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '1000' },
    { type: 'XC-OPEN', intentId: 'aa04', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'GOLD', amountMu: '1000' },
    { type: 'XC-OPEN', intentId: 'aa05', owner: 'treasury', origin: 'SBD', destKind: 'CHAIN', destChain: 'EVM', amountMu: '1000' },
    { type: 'XC-OPEN', intentId: 'aa01', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '1000' },
    { type: 'XC-OPEN', intentId: 'aa01', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '1000' },
  ] }, feed, NOW);
  const whys = rRej.rejectsXc.map((x) => x.why);
  ok('open-dust-refused', whys.some((w) => w === 'DUST'));
  ok('open-no-escrow-refused', whys.some((w) => w === 'NO-ESCROW'));
  ok('open-unknown-owner-refused', whys.some((w) => w === 'UNKNOWN-OWNER'));
  ok('open-bad-dest-refused', whys.some((w) => w === 'BAD-DEST'));
  ok('open-door-gated-refused', whys.some((w) => w.indexOf('DOOR-GATED-PLAN') === 0));
  ok('open-double-refused', whys.filter((w) => w === 'DOUBLE-OPEN').length === 1);
  // the queue's ONLY legit open is the 6th op (aa01) — exactly one escrow account born, exactly 1000µ;
  // every other op moved nothing
  ok('rejects-move-precisely-one-open', rRej.consOk
    && Object.keys(rRej.st.accounts).filter((k) => k.indexOf('xc-escrow-') === 0).length === 1
    && ub(rRej.st.accounts['xc-escrow-aa01'].claims.SBD) === 1000n
    && ub(rRej.st.accounts.treasury.claims.SBD) === 118670n);
  // size cap: the core enforces the split-fill law too (defense in depth)
  const rCap = dc.settleXcOps(mkCore66(), { batch: 'E66-CAP', ops: [{ type: 'XC-OPEN', intentId: 'aa06', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '20000' }] }, feed, NOW);
  ok('open-size-cap-refused', rCap.rejectsXc.some((x) => x.why === 'SIZE-CAP-SPLIT-REQUIRED') && rCap.consOk);

  // ── the full chain-dest flow: escrow → route through OUR pools → redeem → corridor ──
  const st1 = rOpen.st;
  const fillQ = { batch: 'E66-FILL', ops: [{ type: 'XC-FILL-POOL', intentId: ledger1.intent.intentId, owner: 'treasury', origin: 'SBD', destKind: 'CHAIN', destChain: 'STEEM', amountMu: '1000', minOutMu: chain.intent.minOutMu }] };
  // note: the ledger1 intent was LEDGER-dest; for the CHAIN flow we open a second intent on the same escrow book
  const chainOpen = { batch: 'E66-OPEN2', ops: [{ type: 'XC-OPEN', intentId: chain.intent.intentId, owner: 'treasury', origin: 'SBD', destKind: 'CHAIN', destChain: 'STEEM', amountMu: '1000', minOutMu: chain.intent.minOutMu }] };
  const rOpen2 = dc.settleXcOps(st1, chainOpen, feed, NOW);
  ok('chain-open-escrows', rOpen2.settledXc.length === 1 && ub(rOpen2.st.accounts['xc-escrow-' + ledger1.intent.intentId].claims.SBD) === 1000n && ub(rOpen2.st.accounts['xc-escrow-' + chain.intent.intentId].claims.SBD) === 1000n); // per-intent escrow accounts (escrow-identity law)
  const rFill = dc.settleXcOps(rOpen2.st, fillQ, feed, NOW);
  const fillOp = rFill.ops.find((o) => o.type === 'XC-FILL' && o.mode === 'POOL-CHAIN');
  ok('chain-fill-through-our-pools', !!fillOp && Array.isArray(fillOp.hops) && fillOp.hops.length >= 1 && fillOp.routeIds.includes('P3') && fillOp.routeIds.includes('P1'));
  ok('chain-fill-redeem-pegout', !!fillOp && !!fillOp.pegout && fillOp.pegout.asset === 'STEEM' && fillOp.pegout.corridor.indexOf('KEYED-DESK') === 0);
  ok('chain-fill-escrow-drained', ub(rFill.st.accounts['xc-escrow-' + ledger1.intent.intentId].claims.SBD) === 0n && ub(rFill.st.accounts['xc-escrow-' + chain.intent.intentId].claims.SBD) === 1000n); // the filled intent's escrow drained; the OTHER intent's escrow untouched (escrow-identity law)
  ok('chain-fill-exposure-booked', ub(rFill.xcExposure.STEEM || '0') === ub(fillOp.wrapperOut));
  ok('chain-fill-conservation', rFill.consOk);
  // replayed fill: the escrow for THIS intent is gone → refused by law (escrow-drain idempotency)
  const rReplay = dc.settleXcOps(rFill.st, fillQ, feed, NOW);
  ok('fill-replay-refused', rReplay.rejectsXc.some((x) => x.why.indexOf('ESCROW-MISMATCH') === 0) && rReplay.consOk);
  // confirm clears the exposure when the finality clock passes
  const rConf = dc.settleXcOps(rFill.st, { batch: 'E66-CONF', ops: [{ type: 'XC-CONFIRM', intentId: chain.intent.intentId, asset: 'STEEM', payoutMu: fillOp.wrapperOut }] }, feed, NOW);
  ok('confirm-clears-exposure', ub(rConf.xcExposure.STEEM || '0') === 0n && rConf.settledXc.some((s) => s.op === 'CONFIRM'));

  // the bond law (2:1): exceed the exposure cap → refused, byte-unchanged (atomicity).
  // The exposure is PRE-BOOKED (as if earlier corridor fills booked it) — conservation untouched.
  const bonded = mkCore66();
  bonded.xcExposure = { STEEM: '30330000' }; // 30330000 + ~9379 > 2 × custody (30330450)
  const bondedOpen = { batch: 'E66-BOND-OPEN', ops: [{ type: 'XC-OPEN', intentId: 'bb01', owner: 'treasury', origin: 'SBD', destKind: 'CHAIN', destChain: 'STEEM', amountMu: '1000', minOutMu: '1' }] };
  const rB = dc.settleXcOps(bonded, bondedOpen, feed, NOW);
  const rBF = dc.settleXcOps(rB.st, { batch: 'E66-BOND-FILL', ops: [{ type: 'XC-FILL-POOL', intentId: 'bb01', owner: 'treasury', origin: 'SBD', destKind: 'CHAIN', destChain: 'STEEM', amountMu: '1000', minOutMu: '1' }] }, feed, NOW);
  ok('bond-law-exceeded-refused', rBF.rejectsXc.some((x) => x.why.indexOf('BOND-LAW-EXCEEDED') === 0));
  ok('bond-refusal-byte-unchanged', rBF.consOk && ub(rBF.st.accounts['xc-escrow-bb01'].claims.SBD) === 1000n && rBF.st.pools.find((p) => p.id === 'P3').rb === '163980');

  // minOut atomicity: a fill below minOut leaves pools+escrow byte-identical
  const pre = rOpen2.st;
  const escKey = 'xc-escrow-' + chain.intent.intentId;
  const preSnap = JSON.stringify({ pools: pre.pools, esc: pre.accounts[escKey], t: pre.accounts.treasury });
  const rMin = dc.settleXcOps(rOpen2.st, { batch: 'E66-MIN', ops: [{ type: 'XC-FILL-POOL', intentId: chain.intent.intentId, owner: 'treasury', origin: 'SBD', destKind: 'CHAIN', destChain: 'STEEM', amountMu: '1000', minOutMu: '999999999999' }] }, feed, NOW);
  const postSnap = JSON.stringify({ pools: rMin.st.pools, esc: rMin.st.accounts[escKey], t: rMin.st.accounts.treasury });
  ok('minout-atomicity-xc', rMin.rejectsXc.some((x) => x.why === 'REFUSED-MINOUT') && preSnap === postSnap);

  // P2P fills: escrow-first; roster only; must beat the pool; ledger-dest only.
  // The filler is a REAL roster name (rosterLaw — the law never depends on invented names).
  const TEST_FILLER = dc.rosterLaw()[1] || 'headcorner';
  const p2pOpen = { batch: 'E66-P2P-OPEN', ops: [{ type: 'XC-OPEN', intentId: 'cc01', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '1000', minOutMu: '1' }] };
  const mkWithFiller = () => {
    const b = mkCore66();
    b.accounts[TEST_FILLER] = { claims: { SBD: '5000', STEEM: '3000' } };
    // custody stays conservation-balanced: the filler's claims are real custody too
    b.vault.custody.SBD = '348550';
    b.vault.custody.STEEM = '15168225';
    return b;
  };
  const rP = dc.settleXcOps(mkWithFiller(), p2pOpen, feed, NOW);
  const rP2P = dc.settleXcOps(rP.st, { batch: 'E66-P2P', ops: [{ type: 'XC-FILL-P2P', intentId: 'cc01', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '1000', minOutMu: '1', filler: TEST_FILLER, deliverMu: '2500' }] }, feed, NOW);
  const p2pOp = rP2P.ops.find((o) => o.type === 'XC-FILL' && o.mode === 'P2P');
  ok('p2p-fill-escrow-first', !!p2pOp && ub(rP2P.st.accounts[TEST_FILLER].claims.SBD) === 6000n && ub(rP2P.st.accounts[TEST_FILLER].claims.STEEM) === 500n && ub(rP2P.st.accounts.treasury.claims.STEEM) === 12829575n + 2500n);
  ok('p2p-conservation', rP2P.consOk);
  const rP2PNonRoster = dc.settleXcOps(rP.st, { batch: 'E66-P2P-BAD', ops: [{ type: 'XC-FILL-P2P', intentId: 'cc01', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '1000', minOutMu: '1', filler: 'ghost-filler', deliverMu: '9500' }] }, feed, NOW);
  ok('p2p-roster-enforced', rP2PNonRoster.rejectsXc.some((x) => x.why === 'ROSTER-UNKNOWN'));
  const rP2PChain = dc.settleXcOps(rP.st, { batch: 'E66-P2P-CHAIN', ops: [{ type: 'XC-FILL-P2P', intentId: 'cc01', owner: 'treasury', origin: 'SBD', destKind: 'CHAIN', destChain: 'STEEM', amountMu: '1000', minOutMu: '1', filler: TEST_FILLER, deliverMu: '9500' }] }, feed, NOW);
  ok('p2p-ledger-only', rP2PChain.rejectsXc.some((x) => x.why === 'P2P-LEDGER-ONLY'));
  const rP2PBelow = dc.settleXcOps(rP.st, { batch: 'E66-P2P-BELOW', ops: [{ type: 'XC-FILL-P2P', intentId: 'cc01', owner: 'treasury', origin: 'SBD', destKind: 'LEDGER', destAsset: 'STEEM', amountMu: '1000', minOutMu: '9999', filler: TEST_FILLER, deliverMu: '2000' }] }, feed, NOW);
  ok('p2p-below-quote-refused', rP2PBelow.rejectsXc.some((x) => x.why === 'P2P-BELOW-QUOTE'));

  // refund: whole, after the unlock; early refund refused by the core's clock-owner (the doors draft it only at unlock — the core asserts escrow, the clock is the doors' law)
  const rRef = dc.settleXcOps(rP.st, { batch: 'E66-REFUND', ops: [{ type: 'XC-REFUND', intentId: 'cc01', owner: 'treasury', origin: 'SBD', amountMu: '1000' }] }, feed, NOW);
  ok('refund-whole', rRef.settledXc.some((s) => s.op === 'REFUND') && ub(rRef.st.accounts.treasury.claims.SBD) === 119670n && ub(rRef.st.accounts['xc-escrow-cc01'].claims.SBD || '0') === 0n);
  ok('refund-conservation', rRef.consOk);
  const rRefReplay = dc.settleXcOps(rRef.st, { batch: 'E66-REFUND2', ops: [{ type: 'XC-REFUND', intentId: 'cc01', owner: 'treasury', origin: 'SBD', amountMu: '1000' }] }, feed, NOW);
  ok('refund-replay-refused', rRefReplay.rejectsXc.some((x) => x.why.indexOf('ESCROW-MISMATCH') === 0));
  // unknown op refused honestly
  const rUnk = dc.settleXcOps(rP.st, { batch: 'E66-UNK', ops: [{ type: 'XC-TAKEOVER', intentId: 'cc01' }] }, feed, NOW);
  ok('unknown-op-refused', rUnk.rejectsXc.some((x) => x.why === 'UNKNOWN-OP'));

  // ── solver + clock laws (pure) ──
  const openIntent = { intentId: 'dd01', owner: 'treasury', origin: 'SBD', amountMu: '1000', destKind: 'LEDGER', destAsset: 'STEEM', destChain: null, band: 'INTERNAL-BOOK', doorFinalityS: 0, quoteMu: '9000', minOutMu: '8955', routeIds: ['P3', 'P1'], state: 'OPENED', openedAt: NOW, fillDeadline: isoPlus(NOW, FILL_TIMEOUT_S), refundUnlock: isoPlus(NOW, REFUND_UNLOCK_S), filledAt: null, confirmedAt: null, fillMode: null, filler: null, filledOutMu: null, payoutMu: null, corridor: null, refusals: [] };
  const offerLose = chooseFill(mkCore66(), openIntent, [{ intentId: 'dd01', filler: 'soldier1', deliverMu: '1' }]);
  ok('solver-pool-default', offerLose && offerLose.mode === 'POOL' && offerLose.solver === 'our-pools');
  const offerWin = chooseFill(mkCore66(), openIntent, [{ intentId: 'dd01', filler: 'soldier1', deliverMu: '99999999' }]);
  ok('solver-p2p-outbids', offerWin && offerWin.mode === 'P2P' && offerWin.solver === 'soldier1');
  const twoOffers = chooseFill(mkCore66(), openIntent, [{ intentId: 'dd01', filler: 'soldier9', deliverMu: '99999999' }, { intentId: 'dd01', filler: 'soldier1', deliverMu: '99999999' }]);
  ok('solver-tie-lexicographic', twoOffers && twoOffers.mode === 'P2P' && twoOffers.solver === 'soldier1');
  ok('solver-no-fill-honest', chooseFill(mkCore66(), { ...openIntent, origin: 'BLURT' }, []) === null);
  // clock: unfilled past refund unlock → refund drafted; filled chain past finality → confirm drafted
  const refOp = clockActions([{ ...openIntent, fillDeadline: isoPlus(NOW, -2 * FILL_TIMEOUT_S), refundUnlock: isoPlus(NOW, -1) }], NOW);
  ok('clock-refund-at-unlock', refOp.length === 1 && refOp[0].type === 'XC-REFUND');
  const early = clockActions([openIntent], NOW);
  ok('clock-early-refund-never', early.length === 0);
  const filledChain = { ...openIntent, destKind: 'CHAIN', destChain: 'STEEM', doorFinalityS: 60, state: 'FILLED', filledAt: NOW, payoutMu: '9400', filledOutMu: '9400' };
  ok('clock-confirm-not-yet', clockActions([filledChain], NOW).length === 0);
  ok('clock-confirm-at-finality', clockActions([filledChain], isoPlus(NOW, 61)).length === 1 && clockActions([filledChain], isoPlus(NOW, 61))[0].type === 'XC-CONFIRM');
  const filledLedger = advanceStates([{ ...openIntent }], [{ type: 'XC-FILL', at: NOW, intentId: 'dd01', mode: 'POOL-LEDGER', out: '9400' }]);
  ok('ledger-dest-confirmed-at-fill', filledLedger.intents[0].state === 'CONFIRMED' && !!filledLedger.intents[0].confirmedAt);
  // state advance: opened → filled(chain) → confirmed; refused opens; idempotent replay
  const chainStates = advanceStates([{ ...openIntent, destKind: 'CHAIN', destChain: 'STEEM', doorFinalityS: 60, state: 'DRAFTED' }], [
    { type: 'XC-ESCROW', at: NOW, intentId: 'dd01' },
    { type: 'XC-FILL', at: NOW, intentId: 'dd01', mode: 'POOL-CHAIN', wrapperOut: '9400', pegout: { corridor: 'KEYED-DESK (steem active in the protected desks — operator-gated broadcast)' } },
    { type: 'XC-CONFIRM', at: isoPlus(NOW, 60), intentId: 'dd01', asset: 'STEEM', payoutMu: '9400' },
  ]);
  ok('advance-full-lifecycle', chainStates.intents[0].state === 'CONFIRMED' && chainStates.intents[0].corridor && chainStates.intents[0].corridor.indexOf('KEYED-DESK') === 0);
  const replay = advanceStates(chainStates.intents, [{ type: 'XC-FILL', at: NOW, intentId: 'dd01', mode: 'POOL-CHAIN', wrapperOut: '9400' }]);
  ok('advance-idempotent', replay.intents[0].state === 'CONFIRMED' && replay.intents[0].confirmedAt === chainStates.intents[0].confirmedAt);
  const refused = advanceStates([{ ...openIntent, state: 'DRAFTED' }], [{ type: 'XC-REFUSED', intentId: 'dd01', xcOp: 'XC-OPEN', why: 'DUST' }]);
  ok('advance-refused-honest', refused.intents[0].state === 'OPEN-REFUSED' && refused.stats.refused === 1);

  // attestation: deterministic + sensitive to state
  const b1 = { intents: chainStates.intents, stats: chainStates.stats };
  ok('attestation-deterministic', attestationHash(b1) === attestationHash(JSON.parse(JSON.stringify(b1))));
  ok('attestation-sensitive', attestationHash(b1) !== attestationHash({ intents: [{ ...chainStates.intents[0], state: 'REFUNDED' }], stats: chainStates.stats }));

  // real-tree: the booked doors book re-derives from the same constants (fixed check count — E66 determinism)
  let bookedDoorsMatch = true, bookedIntentsOk = true, bookedNote = 'no booked book yet (first run)';
  try {
    const booked = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
    if (booked && booked.protocol === PROTOCOL) {
      bookedDoorsMatch = JSON.stringify(booked.doors) === JSON.stringify(DOORS);
      bookedIntentsOk = Array.isArray(booked.intents) && booked.intents.every((i) => i.intentId && typeof i.state === 'string');
      bookedNote = `booked book re-derived: ${booked.intents.length} intents, doors identical`;
    }
  } catch (_) {}
  ok('realtree-doors-match', bookedDoorsMatch);
  ok('realtree-intents-booked', bookedIntentsOk);
  void bookedNote;

  const pass = c.filter((x) => x.ok).length;
  console.log(`DEX-XC-SELFTEST-OK ${pass}/${c.length}`);
  if (pass !== c.length) { for (const x of c) if (!x.ok) console.log(`  FAIL ${x.name}`); }
  return pass === c.length ? 0 : 1;
}

if (require.main === module) {
  const arg = process.argv[2] || '';
  if (arg === 'selftest') process.exit(selftest());
  tick().then((rc) => process.exit(rc)).catch(() => process.exit(0));
}

module.exports = {
  DOORS, FILL_TIMEOUT_S, REFUND_UNLOCK_S, XC_GUARD_BPS, XC_DUST,
  priceIntent, planOpen, chooseFill, clockActions, advanceStates, coreXcOps, attestationHash,
  selftest, PROTOCOL, VERSION,
};
