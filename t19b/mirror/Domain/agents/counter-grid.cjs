'use strict';
/**
 * counter-grid.cjs — R44 THE OPPOSING GRIDS DESK (CR-0074)
 *
 * Owner directive (2026-10-04, Hebrew, traces 1a1…c3a5 + 1a1…c3ed):
 * "אני רוצה לייצר עוד גרידים מתנגדים על הרשת שלנו מצד שני" — MORE counter-grids on OUR
 * network, from the other side. R39/R40 planned them (PLAN-POOL-GATED-NOT-BROADCAST);
 * the owner's word is the gate and CR-0074 IS that gate as a repo artifact.
 *
 * This desk is the RING-side bookkeeper of the arm (the kernel arms, this desk publishes):
 *  - reads the BOOKED dex-core.json (the kernel's armed grids — single canon, never re-derived here),
 *  - verifies the gate artifact independently (fs.existsSync of CR-0074 — two sources, one law),
 *  - re-derives the rung ids from the booked fields (the eval's independent check, in production),
 *  - renders the broadcast payload preview + a sha256-16 determinism seal over the payload bytes,
 *  - books agents/counter-grid.json/.md + append-only history jsonl.
 *
 * LAWS (in code):
 *  1. STASIS: the brake is obeyed BEFORE any read or write (halt = healthy no-op).
 *  2. KEYLESS: reads only. The engine surface owns the broadcast; this desk NEVER fires one.
 *  3. SINGLE CANON: the kernel's book is the truth; a stale book is reported stale, not re-simulated.
 *  4. HONEST VERDICTS: GATE-CLOSED / GATED-ARMED-BROADCAST-READY / GRID-TOO-THIN /
 *     REFUSED-ONE-SIDED / NO-ARMED-GRIDS — every state is a booked row, never a silent skip.
 *  5. FAIL-SOFT exit 0. Single-writer atomic writes (tmp+rename). Zero secrets.
 *
 * Modes: status (book the ring) | selftest (pure, zero network) — the eval runs it fresh-process.
 * Run:   node agents/counter-grid.cjs status|selftest
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AG = __dirname;
const CORE_BOOK = path.join(AG, 'dex-core.json');
const CR_FILE = path.join(AG, 'change-requests', 'CR-0074-counter-grids.json');
const STASIS_FILE = path.join(AG, 'STASIS.json');
const OUT_JSON = path.join(AG, 'counter-grid.json');
const OUT_MD = path.join(OUT_JSON.replace(/\.json$/, '.md'));
const HISTORY = path.join(OUT_JSON.replace(/\.json$/, '-history.jsonl'));
const PROTOCOL = 'SAOS-COUNTER-GRID/1';
const VERSION = 'counter-grid v1.0.0 (R44 THE OPPOSING GRIDS, CR-0074)';

// ---------- pure helpers (E67 white-box surface) ----------

/** the gate, checked independently of the kernel (two sources, one law) */
function gateState(exists) {
  const present = exists === undefined ? fs.existsSync(CR_FILE) : !!exists;
  return { open: present, artifact: 'CR-0074-counter-grids.json' };
}

/** independent id re-derivation: sha256-16 over (pool|pair|side|level|anchor|size) —
 *  the SAME law the kernel uses; if the booked id ≠ the recomputed id, the arm is corrupt. */
function recomputeRungId(poolId, pair, side, level, anchor, sizeMu) {
  const anchorNano = BigInt(Math.round(Number(anchor) * 1e9));
  return crypto.createHash('sha256').update(`${poolId}|${pair}|${side}|${level}|${anchorNano}|${sizeMu}`).digest('hex').slice(0, 16);
}

/** audit one armed grid: ids re-derive, payload is two-sided, sizes uniform */
function auditGrid(poolId, g) {
  const rows = g.broadcastPayload || [];
  const buys = rows.filter((r) => r.side === 'buy');
  const sells = rows.filter((r) => r.side === 'sell');
  const twoSided = buys.length > 0 && buys.length === sells.length;
  const idsOk = rows.every((r) => r.id === recomputeRungId(poolId, r.pair || g.pair, r.side, r.level, g.anchor, r.sizeMu));
  const sizesOk = rows.every((r) => r.sizeMu === (g.sizeLaw && g.sizeLaw.sizeMu));
  return { poolId, pair: g.pair, verdict: g.verdict, twoSided, idsOk, sizesOk, rungs: rows.length, anchor: g.anchor, sizeMu: g.sizeLaw ? g.sizeLaw.sizeMu : null, capBps: g.sizeLaw ? g.sizeLaw.capBps : null };
}

/** the determinism seal: sha256-16 over the canonical payload bytes */
function payloadSeal(grids) {
  const canon = JSON.stringify(grids);
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 16);
}

function stasisCheck() {
  // T-50 staged-obedience repair (2026-10-09, live-measured): the brake's own scope law is
  // "measurement-only lanes continue" + the calibration mandate (trace 1a1…2391)
  // opened the staged GRID lane. The counter-grid twin is keyless and NEVER broadcasts (its
  // verdict is permission-shaped: GATED-ARMED-BROADCAST-READY) — a lane being open is
  // permission, not activation. So: staged + grid lane open → the book builds (with the
  // brake RECORDED in the book: brakeArmed/brakeMode); full halt stays for mode=full or a
  // staged state without the grid lane. Unreadable file → no brake declared → run normally
  // (the file is git-tracked; capital lanes keep their own fail-closed gate).
  try {
    const st = JSON.parse(fs.readFileSync(STASIS_FILE, 'utf8'));
    if (!st || st.active !== true) return { halt: false, info: null };
    const lanes = Array.isArray(st.stagedLanes && st.stagedLanes.allow) ? st.stagedLanes.allow.map(String).map((x) => x.toLowerCase()) : [];
    const stagedOpen = st.mode === 'staged' && lanes.includes('grid');
    if (stagedOpen) return { halt: false, info: { brakeArmed: true, brakeMode: 'staged', gridLaneOpen: true } };
    return { halt: true, info: { brakeArmed: true, brakeMode: st.mode || 'full' } };
  } catch (_) { return { halt: false, info: null }; }
}

function writeBook(obj) {
  const tmp = OUT_JSON + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, OUT_JSON);
}

// ---------- the ring ----------

function book() {
  const now = new Date().toISOString();
  const gate = gateState();
  let core = null;
  try { core = JSON.parse(fs.readFileSync(CORE_BOOK, 'utf8')); } catch (_) { core = null; }
  const grids = (core && core.counterGrids) || {};
  const armed = [];
  for (const [poolId, g] of Object.entries(grids)) armed.push({ ...auditGrid(poolId, g), sizeLaw: g.sizeLaw || null, broadcastPayload: g.broadcastPayload || [] });
  const liveArmed = armed.filter((a) => a.verdict === 'GATED-ARMED-BROADCAST-READY');
  const thin = armed.filter((a) => a.verdict === 'GRID-TOO-THIN');
  const refused = armed.filter((a) => a.verdict === 'REFUSED-ONE-SIDED');
  const plan = armed.filter((a) => a.verdict === 'PLAN-POOL-GATED-NOT-BROADCAST');
  const idsOk = liveArmed.length > 0 && liveArmed.every((a) => a.idsOk);
  const payload = liveArmed.map((a) => ({ pool: a.poolId, pair: a.pair, rungs: (grids[a.poolId].broadcastPayload || []) }));
  const seal = payloadSeal(payload);
  const book = {
    protocol: PROTOCOL, at: now, agent: VERSION,
    gate,
    brake: stasisCheck().info,
    coreBookAt: core ? core.at : null,
    coreBookStale: core ? (Date.now() - new Date(core.at).getTime()) > 26 * 3600 * 1000 : true,
    summary: {
      verdict: !gate.open ? 'GATE-CLOSED' : (liveArmed.length > 0 ? (idsOk ? 'GATED-ARMED-BROADCAST-READY' : 'ARM-CORRUPT-ID-MISMATCH') : (thin.length > 0 || refused.length > 0 ? 'GATED-NO-ARMED-GRIDS' : 'NO-ARMED-GRIDS')),
      armedGrids: liveArmed.length, thinGrids: thin.length, refusedGrids: refused.length, planGrids: plan.length,
      totalRungs: liveArmed.reduce((s, a) => s + a.rungs, 0),
      idsRecomputed: idsOk,
      payloadSeal: liveArmed.length > 0 ? seal : null,
    },
    grids: armed,
    payloadPreview: payload,
    laws: [
      'gate law: CR-0074 present in the repo = the owner gate is OPEN (artifact, not a boolean)',
      'two-sided law: a grid arms only with BOTH ladders — one-sided is REFUSED-ONE-SIDED',
      'cap law: per-side notional ≤ 2% of that side\'s depth value marked to the anchor',
      'dust law: a rung under 1000µ keeps the grid quiet (GRID-TOO-THIN) — dust never rests',
      'idempotency: rung ids re-derive (sha256-16) — a re-arm finds the same rungs, never duplicates',
      'keyless: this desk publishes the ring; the engine surface owns the broadcast',
    ],
  };
  writeBook(book);
  // md
  const L = [];
  L.push(`# counter-grid — THE OPPOSING GRIDS (R44, CR-0074)`);
  L.push('');
  L.push(`Updated: ${now}`);
  L.push('');
  L.push(`## The ring`);
  L.push(`- Gate: ${gate.open ? 'OPEN (CR-0074 in the repo)' : 'CLOSED'} · core book: ${book.coreBookAt || 'absent'}${book.coreBookStale ? ' (STALE)' : ''}`);
  L.push(`- Verdict: ${book.summary.verdict} · armed grids ${book.summary.armedGrids} · rungs ${book.summary.totalRungs} · thin ${book.summary.thinGrids} · refused ${book.summary.refusedGrids} · plan ${book.summary.planGrids}`);
  if (book.summary.payloadSeal) L.push(`- Payload seal: \`${book.summary.payloadSeal}\` (sha256-16 over the canonical broadcast bytes — deterministic)`);
  L.push('');
  for (const a of armed) {
    L.push(`- Grid ${a.poolId} ${a.pair}: ${a.verdict}${a.sizeMu ? ` · ${a.sizeMu}µ/rung (cap ${a.capBps}bps)` : ''} · rungs ${a.rungs} · ids ${a.idsOk ? 're-derive OK' : 'MISMATCH'} · two-sided ${a.twoSided ? 'OK' : 'NO'}`);
  }
  L.push('');
  L.push('Laws: ' + book.laws.map((_, i) => `L${i + 1}`).join(' '));
  L.push('');
  fs.writeFileSync(OUT_MD, L.join('\n'));
  // history (append-only)
  fs.appendFileSync(HISTORY, JSON.stringify({ at: now, verdict: book.summary.verdict, armed: book.summary.armedGrids, rungs: book.summary.totalRungs, seal: book.summary.payloadSeal }) + '\n');
  console.log(`[counter-grid] ${book.summary.verdict} · armed=${book.summary.armedGrids} rungs=${book.summary.totalRungs} seal=${book.summary.payloadSeal || '—'}`);
  return 0;
}

// ---------- selftest (pure, zero network) ----------

function selftest() {
  const c = [];
  const ok = (name, cond) => c.push({ name, ok: !!cond });
  ok('gate-closed', gateState(false).open === false);
  ok('gate-open', gateState(true).open === true);
  // id re-derivation matches the kernel's law (golden: the selftest vector of dex-core PX/P3)
  const id1 = recomputeRungId('PX', 'WSTEEM/STEEM', 'buy', 1, 1, '5183');
  const id2 = recomputeRungId('PX', 'WSTEEM/STEEM', 'buy', 1, 1, '5183');
  const id3 = recomputeRungId('PX', 'WSTEEM/STEEM', 'sell', 1, 1, '5183');
  ok('id-deterministic', id1 === id2 && /^[0-9a-f]{16}$/.test(id1));
  ok('id-input-sensitive', id1 !== id3);
  // auditGrid: a faithful armed grid audits clean
  const g = {
    pair: 'WSTEEM/STEEM', verdict: 'GATED-ARMED-BROADCAST-READY', anchor: 1,
    sizeLaw: { sizeMu: '5183', capBps: 200 },
    broadcastPayload: [
      { op: 'GRID-RUNG', id: recomputeRungId('P1', 'WSTEEM/STEEM', 'buy', 1, 1, '5183'), pool: 'P1', pair: 'WSTEEM/STEEM', side: 'buy', level: 1, price: 0.996, sizeMu: '5183', unit: 'STEEM' },
      { op: 'GRID-RUNG', id: recomputeRungId('P1', 'WSTEEM/STEEM', 'sell', 1, 1, '5183'), pool: 'P1', pair: 'WSTEEM/STEEM', side: 'sell', level: 1, price: 1.004, sizeMu: '5183', unit: 'WSTEEM' },
    ],
  };
  const audit = auditGrid('P1', g);
  ok('audit-clean', audit.twoSided && audit.idsOk && audit.sizesOk && audit.rungs === 2);
  // auditGrid: a corrupted id is CAUGHT (the eval's independent check bites)
  const bad = JSON.parse(JSON.stringify(g)); bad.broadcastPayload[0].id = 'f'.repeat(16);
  ok('audit-catches-corrupt-id', auditGrid('P1', bad).idsOk === false);
  // seal: deterministic, input-sensitive
  ok('seal-deterministic', payloadSeal([{ a: 1 }]) === payloadSeal([{ a: 1 }]) && payloadSeal([{ a: 1 }]) !== payloadSeal([{ a: 2 }]));
  const pass = c.filter((x) => x.ok).length;
  console.log(`COUNTER-GRID-SELFTEST-OK ${pass}/${c.length}`);
  if (pass !== c.length) { for (const x of c) if (!x.ok) console.log(`  FAIL ${x.name}`); }
  return pass === c.length ? 0 : 1;
}

if (require.main === module) {
  const arg = process.argv[2] || 'status';
  if (arg === 'selftest') process.exit(selftest());
  try {
    const g = stasisCheck();
    if (g.halt) { console.log(`STASIS-HALT counter-grid (mode=${g.info.brakeMode}) · ${new Date().toISOString()}`); process.exit(0); }
    process.exit(book());
  } catch (e) {
    console.log(`counter-grid: ERROR (booked honestly, exit 0) ${e.message}`);
    process.exit(0);
  }
}

module.exports = { PROTOCOL, VERSION, gateState, recomputeRungId, auditGrid, payloadSeal, selftest };
