#!/usr/bin/env node
/**
 * coord-bus.cjs — THE COORDINATION BUS READER (fleet Rung 19, CR-0048)
 * Booked by agents/sovereign-convergence.md §4.3: "(keyless, next rung) custom_json
 * coordination bus". Measured live 2026-10-04: the bus ALREADY CARRIES TRAFFIC —
 * `saos.weave.core.v1` (weave checkpoints: root hash + commit) and `saos.snapshot.v1`
 * (platform state digests) broadcast by headcorner every ~15-30 min — and the estate
 * measured it NOWHERE. This desk acquires the READER: the fleet's coordination state
 * becomes a first-class book, readable by every lane and every CI run with zero keys.
 *
 * LAWS (in code):
 *  1. KEYLESS: read-only condenser calls; no secrets, nothing signed. The bus carries
 *     the fleet's PUBLIC coordination state by design — that is what makes it the bus.
 *  2. OFFICIAL SOURCES ONLY + SPLIT-BRAIN GUARD (drip-canon law): api.steemit.com
 *     (primary) + api.justyy.com (cross). The normalized message fingerprints of the
 *     two views must MATCH; disagreement → SPLIT-BRAIN, NOTHING is written (a bus that
 *     lies by node is worse than no bus view at all).
 *  3. THE LIMIT-100 LAW (measured live 2026-10-04, error -32801): condenser_api.
 *     get_account_history upper limit is 100, and the account_history_api
 *     operation_filter is a GHOST (measured live: string and numeric filters both
 *     return unfiltered results on BOTH official nodes) — filtering is CLIENT-side.
 *     The reader pages BACKWARD from -1 until the previous book's WATERMARK (the
 *     lowest known namespace head) is re-reached, capped at MAX_PAGES — continuous
 *     coverage of a hot account (the grid's limit-order churn pushes old ops out of
 *     a fixed window; the watermark walk does not miss what it already read).
 *  4. THE HEAD-VECTOR FINGERPRINT: the bus STATE is the per-namespace head
 *     ({id: lastSeq, lastAt}) — NOT the message window. The window slides as new ops
 *     arrive (honest bounds in scan.minSeq/maxSeq), so fingerprinting the window would
 *     book noise commits on a silent bus; fingerprinting the HEADS books only real
 *     traffic. A node lying about the head content fails the split-brain guard.
 *  5. NAMESPACE WHITELIST: only /^saos\./ custom_json ids are bus traffic. Known
 *     namespaces (saos.weave.core.v1, saos.snapshot.v1) are flagged known:true; a NEW
 *     saos.* id is kept, counted, and flagged known:false — never silently dropped,
 *     never silently trusted (whitelist-only research law). Non-saos.* custom_json ops
 *     (follow/vote plugin chatter) are foreign noise, counted and ignored.
 *  6. EVENT-LEDGER / NO-NOISE: the book is written ONLY when the head-vector
 *     fingerprint changed. Re-runs are idempotent (dedupe on (id, seq)); an unchanged
 *     bus books a clean exit, never a noise commit — composing with the house law.
 *  7. FATE-DEFENSE law #1 — stasisHalt() (borrowed from the census desk by require,
 *     second-mover law: nothing copied) BEFORE any read: an ACTIVE breaker halts the
 *     desk in code with ZERO network and ZERO writes.
 *  8. FAIL-SOFT EXIT 0, FAIL-LOUD RECEIPT; single writer — this desk writes ONLY
 *     agents/coord-bus.json (atomic tmp+rename). COORD_BUS_SKIP=1 is the eval
 *     off-switch: does nothing, writes nothing, touches no network.
 *
 * Env:
 *   COORD_BUS_JSON        output path (default agents/coord-bus.json)
 *   COORD_BUS_ACCOUNT     default MARKET_EXEC_HEAD || 'headcorner' (the fleet head)
 *   COORD_BUS_MAX_PAGES   backward page cap (default 10 → ≤ ~1000 ops; the cron sets 40 — the head account churns ~28 ops/min of limit-order traffic, so a 30-min tick needs ~850 ops of reach; the watermark walk normally stops in 1-2 pages, the cap only binds after long silence)
 *   COORD_BUS_PRIMARY     primary node (default https://api.steemit.com)
 *   COORD_BUS_CROSS       cross node   (default https://api.justyy.com)
 *   COORD_BUS_SKIP=1      eval off-switch
 *   COORD_BUS_FIXTURE     test seam (house idiom: SKIP_FETCH/DRIP_CANON_SKIP family): a
 *                         JSON file { primary: <canned get_account_history result>,
 *                         cross: <...> } served INSTEAD of the network — the whole desk
 *                         flow (page-walk, normalize, split-brain, verdicts, atomic
 *                         write) runs identically with only the transport canned.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { stasisHalt } = require('./fleet-census.cjs');

const ROOT = path.resolve(__dirname, '..');
const AG = path.join(ROOT, 'agents');
const OUT_JSON = process.env.COORD_BUS_JSON || path.join(AG, 'coord-bus.json');
const ACCOUNT = process.env.COORD_BUS_ACCOUNT || process.env.MARKET_EXEC_HEAD || 'headcorner';
const NODE_PRIMARY = process.env.COORD_BUS_PRIMARY || 'https://api.steemit.com';
const NODE_CROSS = process.env.COORD_BUS_CROSS || 'https://api.justyy.com';
const MAX_PAGES = Math.max(1, Math.min(60, parseInt(process.env.COORD_BUS_MAX_PAGES || '10', 10) || 10));
const LIMIT = 100; // THE LIMIT-100 LAW: the node refuses more (-32801)
const KNOWN_IDS = ['saos.weave.core.v1', 'saos.snapshot.v1'];
const NS_RE = /^saos\./;

// ── pure core (exported for E37) ─────────────────────────────────────────────

/** classify a custom_json id: bus traffic only for the saos.* namespace. */
function classifyId(id) {
  if (!NS_RE.test(String(id || ''))) return { traffic: false, known: false };
  return { traffic: true, known: KNOWN_IDS.includes(id) };
}

/**
 * THE LIMIT-100 LAW page-walk: from=-1 first, then start = minSeq-1 (inclusive end).
 * Returns the list of [start, limit] pairs the reader will issue for maxPages pages.
 */
function pagePlan(maxPages, limit) {
  const plan = [];
  for (let i = 0; i < maxPages; i++) plan.push([i === 0 ? -1 : null, limit]);
  return plan;
}

/** next walk start given the minimum seq seen so far (null = stop at genesis). */
function nextStart(minSeq) {
  if (!Number.isFinite(minSeq) || minSeq <= 1) return null;
  return minSeq - 1;
}

/**
 * normalizeRows: raw condenser history rows → sorted, deduped bus messages.
 * Dedupe on (id, seq) — re-runs and overlapping pages are idempotent.
 * Rows are {seq, block, at, id, from, known, payload} with payload parsed when
 * possible, else {raw} (honest truncation, never a crash).
 */
function normalizeRows(rows) {
  const byKey = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || typeof r !== 'object') continue;
    const key = r.id + '@' + r.seq;
    const prev = byKey.get(key);
    if (prev) { if ((prev.block || 0) < (r.block || 0)) byKey.set(key, r); continue; }
    byKey.set(key, r);
  }
  return Array.from(byKey.values()).sort((a, b) => (a.seq - b.seq) || String(a.id).localeCompare(String(b.id)));
}

/** parse a custom_json json string → payload (honest {raw} on parse failure). */
function parsePayload(jsonStr) {
  try { return JSON.parse(jsonStr); } catch (_) {
    return { raw: String(jsonStr || '').slice(0, 180) };
  }
}

/**
 * THE FLOOR CHAIN: the next walk's watermark = the lowest seq the previous book
 * actually SAW — min over its namespace heads AND its scan floor. Chaining the floor
 * guarantees no GAP between consecutive books' windows: a namespace that dropped out
 * of a truncated window self-heals the moment it broadcasts again (its next message
 * is above the floor), and the walk never re-scans below the previous floor.
 */
function floorWatermark(prev) {
  if (!prev || typeof prev !== 'object') return null;
  const seqs = [];
  if (prev.heads && typeof prev.heads === 'object') {
    for (const h of Object.values(prev.heads)) if (h && Number.isFinite(h.lastSeq)) seqs.push(h.lastSeq);
  }
  if (prev.scan && Number.isFinite(prev.scan.minSeq)) seqs.push(prev.scan.minSeq);
  return seqs.length ? Math.min(...seqs) : null;
}

/** 16-hex fingerprint of the bus STATE: the per-namespace head vector (window-stable). */
function busFingerprint(msgs) {
  return crypto.createHash('sha256').update(JSON.stringify(namespaceHeads(msgs))).digest('hex').slice(0, 16);
}

/**
 * THE HEAD VECTOR: per-namespace {lastSeq, lastAt, headDigest}, ids sorted — the bus
 * state. The message window slides as the account's op stream grows (limit-order
 * churn); the heads only move when the BUS ITSELF moves. headDigest = sha16 of the
 * head message — two honest nodes agree; a node lying about the head CONTENT (same
 * seq, different block/payload) fails the split-brain guard even at the same seq.
 */
function namespaceHeads(msgs) {
  const norm = normalizeRows(msgs);
  const heads = {};
  for (const m of norm) {
    const cur = heads[m.id];
    if (!cur || m.seq >= cur.seq) heads[m.id] = m;
  }
  const out = {};
  for (const k of Object.keys(heads).sort()) {
    const m = heads[k];
    out[k] = { lastSeq: m.seq, lastAt: m.at, headDigest: crypto.createHash('sha256').update(JSON.stringify(m)).digest('hex').slice(0, 16) };
  }
  return out;
}

/**
 * SPLIT-BRAIN guard: two node views agree iff their normalized fingerprints match.
 * Two empty views agree (an empty bus is still a measurement). Differing views refuse.
 */
function splitBrain(primaryMsgs, crossMsgs) {
  return busFingerprint(primaryMsgs) !== busFingerprint(crossMsgs);
}

/** namespace rollup over messages: counts, known flags, last-seen. */
function namespaceRollup(msgs) {
  const ns = {};
  for (const m of msgs) {
    const e = ns[m.id] || (ns[m.id] = { count: 0, known: !!m.known, lastAt: null, lastSeq: 0 });
    e.count++;
    if (m.seq >= e.lastSeq) { e.lastSeq = m.seq; e.lastAt = m.at; }
  }
  return ns;
}

/** stable payload — byte-identical for the same (chain view, watermark) pair. */
function busStable(msgs, scan) {
  const norm = normalizeRows(msgs);
  const heads = namespaceHeads(norm);
  return {
    account: ACCOUNT,
    namespace: 'saos.* (custom_json id prefix)',
    scan,
    messageCount: norm.length,
    messages: norm,
    namespaces: namespaceRollup(norm),
    heads,
    watermark: scan.watermark ?? null,
    fingerprint: busFingerprint(norm),
  };
}

// ── chain io ─────────────────────────────────────────────────────────────────

// transport seam (eval harness only — the LAWS above run identically either way)
let rpcImpl = null;
function setRpcImpl(fn) { rpcImpl = fn; }

function rpc(node, method, params) {
  if (rpcImpl) return Promise.resolve(rpcImpl(node, method, params));
  return new Promise((res, rej) => {
    // node scheme decides the transport: official nodes are https; the eval harness
    // serves canned condensers over local http. Same law either way: read-only POST.
    const mod = String(node).startsWith('http://') ? http : https;
    const r = mod.request(node, { method: 'POST', headers: { 'content-type': 'application/json' } }, (x) => {
      let b = ''; x.on('data', (c) => { b += c; });
      x.on('end', () => {
        try {
          const j = JSON.parse(b);
          if (j && j.error) return rej(new Error(j.error.message || 'rpc-error'));
          res(j.result);
        } catch (e) { rej(e); }
      });
    });
    r.on('error', rej);
    r.setTimeout(15000, () => { r.destroy(new Error('timeout ' + node)); });
    r.end(JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }));
  });
}

/** fetch one node's view: backward page-walk from -1 until the watermark is re-reached
 *  (or MAX_PAGES exhausted), extracting saos.* custom_json ops client-side. */
async function fetchBus(node, account, maxPages, watermark) {
  const messages = [];
  const scan = { pages: 0, scannedOps: 0, customJsonOps: 0, foreignOps: 0, minSeq: null, maxSeq: null, node, watermark: watermark ?? null, watermarkReached: false };
  let start = -1;
  for (let p = 0; p < maxPages; p++) {
    let hist;
    try {
      hist = await rpc(node, 'condenser_api.get_account_history', [account, start, LIMIT]);
    } catch (e) {
      scan.error = String(e.message || e).slice(0, 120);
      break;
    }
    const rows = Array.isArray(hist) ? hist : ((hist && (hist.history || hist.items)) || []);
    scan.pages++;
    if (!rows.length) break;
    let minSeq = Infinity;
    for (const [seq, t] of rows) {
      if (typeof seq === 'number' && seq < minSeq) minSeq = seq;
      scan.scannedOps++;
      if (scan.minSeq === null || seq < scan.minSeq) scan.minSeq = seq;
      if (scan.maxSeq === null || seq > scan.maxSeq) scan.maxSeq = seq;
      if (!t || !t.op || t.op[0] !== 'custom_json') continue;
      const o = t.op[1] || {};
      const cls = classifyId(o.id);
      scan.customJsonOps++;
      if (!cls.traffic) { scan.foreignOps++; continue; }
      messages.push({
        seq, block: t.block || null, at: t.timestamp || null,
        id: String(o.id), from: account, known: cls.known,
        payload: parsePayload(o.json),
      });
    }
    // THE WATERMARK WALK: stop once the previous book's lowest head is re-reached —
    // everything after it was already read on an earlier tick; the cap bounds honesty.
    if (Number.isFinite(watermark) && minSeq <= watermark) { scan.watermarkReached = true; break; }
    const nxt = nextStart(minSeq);
    if (nxt === null) break;
    start = nxt;
  }
  return { messages: normalizeRows(messages), scan };
}

// ── io helpers ───────────────────────────────────────────────────────────────

function atomicWrite(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, p);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const receipt = (extra) => console.log(JSON.stringify({ agent: 'coord-bus', verdict: extra.verdict, account: ACCOUNT, messages: extra.messages, fingerprint: extra.fingerprint || null, ...extra, at: new Date().toISOString() }));

  if (process.env.COORD_BUS_SKIP === '1') { receipt({ verdict: 'SKIP', messages: 0 }); return; }

  // eval transport seam: a fixture file replaces the network; the desk flow is identical
  if (process.env.COORD_BUS_FIXTURE) {
    try {
      const fx = JSON.parse(fs.readFileSync(process.env.COORD_BUS_FIXTURE, 'utf8'));
      const view = (node) => (String(node) === String(NODE_PRIMARY) ? fx.primary : fx.cross);
      setRpcImpl((node, method, params) => {
        const v = view(node);
        if (v && v.__error) throw new Error(String(v.__error).slice(0, 120)); // canned transport failure
        return v;
      });
    } catch (e) { receipt({ verdict: 'ERROR', messages: 0, error: 'fixture: ' + String(e.message || e).slice(0, 100) }); return; }
  }

  // FATE-DEFENSE law #1: the breaker halts the bus BEFORE any read — zero network, zero writes.
  const halt = stasisHalt();
  if (halt.active) {
    const book = { at: new Date().toISOString(), ok: true, agent: 'coord-bus v1.0.0 (R19, CR-0048)', verdict: 'STASIS-HALT', account: ACCOUNT, stasis: halt };
    atomicWrite(OUT_JSON, book);
    receipt({ verdict: 'STASIS-HALT', messages: 0 });
    return;
  }

  try {
    // THE WATERMARK: the previous book's lowest namespace head — walk backward only
    // until it is re-reached (continuous coverage of a hot account, cap still bounds).
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')); } catch (_) {}
    const watermark = floorWatermark(prev);

    const primary = await fetchBus(NODE_PRIMARY, ACCOUNT, MAX_PAGES, watermark);
    const cross = await fetchBus(NODE_CROSS, ACCOUNT, MAX_PAGES, watermark);

    // HONESTY LAW (found by E37 before production): an UNREACHABLE bus is NOT an empty
    // bus — if both views failed to load, we measured NOTHING and must write NOTHING
    // (an empty-bus book would clobber a good view and fake a fleet-wide silence).
    if (primary.scan.error && cross.scan.error) {
      receipt({ verdict: 'UNREACHABLE', messages: 0, error: primary.scan.error });
      return;
    }

    // TRUNCATION HONESTY: if the cap bound the walk BEFORE re-reaching the previous
    // floor, this view is INCOMPLETE — receipt only, the last complete book stands
    // (publishing a truncated head-vector would book visibility loss as bus change).
    if (watermark !== null && primary.scan.watermarkReached === false) {
      receipt({ verdict: 'BUS-TRUNCATED', messages: primary.messages.length, floor: watermark, minSeq: primary.scan.minSeq });
      return;
    }

    // split-brain guard: the two node views must fingerprint-match or nothing is written
    // (a one-sided view — one node dead, one alive — fails here too, by fingerprint)
    if (splitBrain(primary.messages, cross.messages)) {
      receipt({ verdict: 'SPLIT-BRAIN', messages: primary.messages.length, fingerprint: busFingerprint(primary.messages), cross: busFingerprint(cross.messages) });
      return; // no write — a lying bus view is worse than no view
    }

    const scan = { ...primary.scan, crossNode: NODE_CROSS, crossPages: cross.scan.pages };
    const stable = busStable(primary.messages, scan);

    // no-noise law: write only when the head-vector fingerprint changed
    const verdict = (prev && prev.fingerprint === stable.fingerprint) ? 'BUS-UNCHANGED' : (stable.messageCount === 0 ? 'BUS-EMPTY' : 'BUS-READ');
    if (verdict === 'BUS-UNCHANGED') { receipt({ verdict, messages: stable.messageCount, fingerprint: stable.fingerprint }); return; }

    const book = {
      at: new Date().toISOString(),
      ok: true,
      agent: 'coord-bus v1.0.0 (R19, CR-0048) — the keyless coordination bus reader',
      verdict,
      ...stable,
      receipts: [
        { name: 'bus-fingerprint', value: stable.fingerprint },
        { name: 'split-brain-guard', ok: true, cross: NODE_CROSS },
        { name: 'limit-100-pages', pages: scan.pages },
      ],
      laws: [
        'keyless read-only (no secrets, nothing signed)',
        'split-brain guard: primary+cross HEAD-VECTOR fingerprints must match or nothing is written (head content digested)',
        'limit-100 law: get_account_history pages at <=100 (measured -32801 live); the account_history_api operation_filter is a GHOST (measured live, unfiltered on both nodes) — filtering is client-side',
        'floor-chain watermark: pages stop at the previous book\'s lowest SEEN seq (heads ∪ scan floor) — no gaps between books; a truncated walk (cap bound) writes NOTHING (BUS-TRUNCATED receipt, the last complete book stands)',
        'head-vector fingerprint: the bus STATE is the per-namespace head, not the sliding window — a silent bus books no noise',
        'namespace whitelist: saos.* only; unknown saos.* kept + flagged, foreign ignored',
        'no-noise: the book is written only when the fingerprint changed',
        'stasis halt-before-read: zero network, zero writes under an ACTIVE breaker',
      ],
    };
    atomicWrite(OUT_JSON, book);
    receipt({ verdict, messages: stable.messageCount, fingerprint: stable.fingerprint });
  } catch (e) {
    // fail-soft: an unreachable bus is an honest empty shift — no write, exit 0
    receipt({ verdict: 'ERROR', messages: 0, error: String(e.message || e).slice(0, 120) });
  }
  process.exit(0);
}

if (require.main === module) main().catch(() => process.exit(0));

module.exports = {
  classifyId, pagePlan, nextStart, normalizeRows, parsePayload,
  busFingerprint, splitBrain, namespaceRollup, namespaceHeads, busStable, fetchBus, rpc, setRpcImpl, floorWatermark,
  KNOWN_IDS, LIMIT, ACCOUNT,
};
