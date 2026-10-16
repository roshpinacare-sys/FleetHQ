'use strict';
/**
 * fleet-delta.cjs — THE CENSUS-DELTA READER (R16, CR-0042) — diffs two fleet-census
 * stable payloads into a structured sovereignty/blocker drift record.
 *
 * COMPOSITION (no duplication, the second-mover law honored — reuses the census desk):
 *   fleet-census.cjs measures the map (16 lanes x capability/sovereignty/blockers/wiring);
 *   this desk reads map-vs-map and answers the question the map alone cannot:
 *   WHAT MOVED since the last honest refresh — lanes, capabilities, keyless counts,
 *   blocker transitions (e.g. B1 OPEN->RESOLVED), wiring status, edge-series growth.
 *
 * THE THIRD MEASUREMENT SURFACE (R15 booking "census-delta reader"):
 *   edge series   (30-min, market-grid cron)  — the market pulse
 *   estate map    (daily,  fleet-census cron) — the capability/sovereignty snapshot
 *   estate DRIFT  (this desk, same daily cron)— the transition record between snapshots
 *
 * EVENT-LEDGER LAW: a drift row is appended ONLY on a real transition —
 *   · FIRST-DELTA  (no previous book — the baseline is established)  -> append
 *   · DRIFT        (normalized stable payloads differ)               -> append
 *   · NO-DRIFT     (determinism law held: only `at` moved)           -> NO row, NO commit
 *     (this is what makes the census cron's deterministic-publish law and this desk one
 *      instrument: on a byte-frozen estate neither the map nor the delta books anything)
 *   · SKIP-INVALID-TO (the current book is absent/error/STASIS-HALT) -> NO row
 *     (the map desk owns that signal; delta never invents a transition from a broken book)
 *
 * Blocker diff law: transitions are keyed on (id, status) — the live `evidence` payload is
 * re-measured commentary (cadence rows grow every tick) and is deliberately excluded, or
 * honest growth would masquerade as drift. A blocker's STATUS is the event.
 *
 * Doctrine: offline · keyless · deterministic (same input pair -> byte-identical record
 * minus `at`) · fail-soft exit 0 always · STASIS first (zero reads, zero writes on halt) ·
 * zero secret material (metadata only).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AG = path.join(ROOT, 'agents');
const DEFAULT_OUT = path.join(AG, 'fleet-delta.jsonl');
const CENSUS_BOOK = 'agents/fleet-census.json';

// reuse, don't reinvent (second-mover law): the brake + the census module identity
const census = require('./fleet-census.cjs');
const stasisHalt = census.stasisHalt;

// ---------- pure helpers (E33 white-box surface) ----------

/**
 * normalize(book) -> stable payload or null.
 * Strips the runtime fields (`at` stamp, ok, verdict, stasis, error) and validates the
 * census identity: a book is comparable iff it carries the census protocol AND a real
 * inventory section (error books / STASIS-HALT books are NOT maps — never diffed).
 */
function normalize(book) {
  if (!book || typeof book !== 'object') return null;
  if (book.protocol !== 'SAOS-FLEET-CENSUS/1') return null;
  if (book.ok === false || book.verdict) return null;
  if (!book.inventory || !Array.isArray(book.inventory.lanes)) return null;
  const { at, ok, verdict, stasis, error, ...stable } = book; // eslint-disable-line no-unused-vars
  return stable;
}

/** fingerprint of a stable payload — 16-hex sha256 of its canonical JSON (deterministic). */
function fingerprint(stable) {
  if (!stable) return null;
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

/** flatten an object into scalar leaves (arrays compared as JSON strings), dotted paths. */
function flatten(obj, prefix, out) {
  out = out || {};
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out[p] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

function idxBy(list, key) {
  const m = {};
  for (const it of list || []) if (it && typeof it[key] === 'string') m[it[key]] = it;
  return m;
}

/**
 * diffStable(fromRaw, toRaw) -> drift record core (no `at`; deterministic), or null iff
 * either side is not a valid census map (caller books FIRST-DELTA / SKIP-INVALID-TO).
 * Defensively normalizes BOTH inputs first — raw books with `at`/`ok` stamps and
 * pre-normalized payloads give identical results (idempotent, the E33 contract).
 * Registry-based diff: lanes / sovereignty leaves / blocker (id,status) / wiring
 * (id,status) / edge growth / receipt keys — never a generic deep-dump.
 */
function diffStable(fromRaw, toRaw) {
  const fromStable = normalize(fromRaw);
  const toStable = normalize(toRaw);
  if (!fromStable || !toStable) return null;
  const fromFp = fingerprint(fromStable);
  const toFp = fingerprint(toStable);
  // PERSPECTIVE LAW (R16): never diff books measured from different estates (a CI
  // single-lane artifact book vs a full-estate book). A perspective flip is a change of
  // the MEASURING INSTRUMENT, not of the estate — diffing it would book the flip as 49
  // fake transitions (proven live on the first run). Skip honestly, book nothing.
  if (fromStable.estate !== toStable.estate) {
    return {
      protocol: 'SAOS-FLEET-DELTA/1', agent: 'fleet-delta', verdict: 'SKIP-PERSPECTIVE',
      estate: toStable.estate,
      from: { fingerprint: fromFp, estate: fromStable.estate },
      to: { fingerprint: toFp, estate: toStable.estate },
      lanes: { added: [], missing: [], statusChanges: [], capsChanged: [], presentLanes: { from: fromStable.inventory.presentLanes, to: toStable.inventory.presentLanes }, estateCommits: { from: fromStable.inventory.estateCommits, to: toStable.inventory.estateCommits } },
      sovereignty: { changed: [] }, blockers: { added: [], missing: [], transitions: [] },
      wiring: { added: [], missing: [], changes: [] }, edges: {}, receiptsChanged: [],
      summary: { changes: 0, capabilities: { from: fromStable.summary.capabilities, to: toStable.summary.capabilities } },
    };
  }
  const same = JSON.stringify(fromStable) === JSON.stringify(toStable);

  // lanes
  const fl = idxBy(fromStable.inventory.lanes, 'id');
  const tl = idxBy(toStable.inventory.lanes, 'id');
  const added = Object.keys(tl).filter((k) => !(k in fl)).sort();
  const missing = Object.keys(fl).filter((k) => !(k in tl)).sort();
  const statusChanges = [];
  const capsChanged = [];
  for (const k of Object.keys(tl).sort()) {
    if (!(k in fl)) continue;
    if (fl[k].status !== tl[k].status) statusChanges.push({ id: k, from: fl[k].status, to: tl[k].status });
    if (fl[k].capabilityCount !== tl[k].capabilityCount) capsChanged.push({ id: k, from: fl[k].capabilityCount, to: tl[k].capabilityCount });
  }

  // sovereignty — scalar-leaf diffs (arrays compared as serialized strings)
  const fsov = flatten(fromStable.sovereignty);
  const tsov = flatten(toStable.sovereignty);
  const sovChanged = [];
  for (const k of Object.keys(tsov).sort()) {
    if (!(k in fsov)) { sovChanged.push({ path: k, from: null, to: tsov[k] }); continue; }
    if (fsov[k] !== tsov[k]) sovChanged.push({ path: k, from: fsov[k], to: tsov[k] });
  }

  // blockers — (id, status) transitions ONLY (evidence is live commentary, see header)
  const fb = idxBy(fromStable.blockers, 'id');
  const tb = idxBy(toStable.blockers, 'id');
  const blockersAdded = Object.keys(tb).filter((k) => !(k in fb)).sort();
  const blockersMissing = Object.keys(fb).filter((k) => !(k in tb)).sort();
  const blockerTransitions = [];
  for (const k of Object.keys(tb).sort()) {
    if (k in fb && fb[k].status !== tb[k].status) blockerTransitions.push({ id: k, from: fb[k].status, to: tb[k].status });
  }

  // wiring — (id, status) transitions
  const fw = idxBy(fromStable.wiring, 'id');
  const tw = idxBy(toStable.wiring, 'id');
  const wiringAdded = Object.keys(tw).filter((k) => !(k in fw)).sort();
  const wiringMissing = Object.keys(fw).filter((k) => !(k in tw)).sort();
  const wiringChanges = [];
  for (const k of Object.keys(tw).sort()) {
    if (k in fw && fw[k].status !== tw[k].status) wiringChanges.push({ id: k, from: fw[k].status, to: tw[k].status });
  }

  // edges — the honest series growth
  const fe = fromStable.edgeSeries || {};
  const te = toStable.edgeSeries || {};
  const edges = {};
  for (const key of ['historyRows', 'paperRows', 'fillLedgerRows']) {
    if (fe[key] !== te[key]) edges[key] = { from: fe[key] !== undefined ? fe[key] : null, to: te[key] !== undefined ? te[key] : null };
  }

  // receipts — which receipted files moved
  const fr = fromStable.receipts || {};
  const tr = toStable.receipts || {};
  const receiptsChanged = Object.keys(tr).filter((k) => fr[k] !== tr[k]).sort();

  const changes = added.length + missing.length + statusChanges.length + capsChanged.length + sovChanged.length +
    blockersAdded.length + blockersMissing.length + blockerTransitions.length + wiringAdded.length +
    wiringMissing.length + wiringChanges.length + Object.keys(edges).length + receiptsChanged.length;

  return {
    protocol: 'SAOS-FLEET-DELTA/1',
    agent: 'fleet-delta',
    verdict: same ? 'NO-DRIFT' : 'DRIFT',
    estate: toStable.estate,
    from: { fingerprint: fromFp },
    to: { fingerprint: toFp },
    lanes: {
      added, missing, statusChanges, capsChanged,
      presentLanes: { from: fromStable.inventory.presentLanes, to: toStable.inventory.presentLanes },
      estateCommits: { from: fromStable.inventory.estateCommits, to: toStable.inventory.estateCommits },
    },
    sovereignty: { changed: sovChanged },
    blockers: { added: blockersAdded, missing: blockersMissing, transitions: blockerTransitions },
    wiring: { added: wiringAdded, missing: wiringMissing, changes: wiringChanges },
    edges,
    receiptsChanged,
    summary: { changes, capabilities: { from: fromStable.summary.capabilities, to: toStable.summary.capabilities } },
  };
}

/** firstDeltaRecord(toStable) — the baseline book: nothing to compare against yet. */
function firstDeltaRecord(toStable) {
  const tl = toStable.inventory;
  return {
    protocol: 'SAOS-FLEET-DELTA/1',
    agent: 'fleet-delta',
    verdict: 'FIRST-DELTA',
    estate: toStable.estate,
    from: { fingerprint: null },
    to: { fingerprint: fingerprint(toStable) },
    lanes: { added: [], missing: [], statusChanges: [], capsChanged: [], presentLanes: { from: null, to: tl.presentLanes }, estateCommits: { from: null, to: tl.estateCommits } },
    sovereignty: { changed: [] },
    blockers: { added: [], missing: [], transitions: [] },
    wiring: { added: [], missing: [], changes: [] },
    edges: {},
    receiptsChanged: [],
    summary: { changes: 0, capabilities: { from: null, to: toStable.summary.capabilities } },
  };
}

// ---------- io (fail-soft) ----------

function readBookFile(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

/** the previous book: explicit --from file, explicit --from-git (HEAD:<path>), else
 *  git HEAD:agents/fleet-census.json (offline, keyless — git IS the local history). */
function readFromBook(explicit, fromGit) {
  if (explicit) return readBookFile(explicit);
  const rel = fromGit || CENSUS_BOOK;
  try {
    const r = spawnSync('git', ['show', 'HEAD:' + rel], { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
    if (r.status === 0 && r.stdout) return JSON.parse(r.stdout);
  } catch (_) {}
  return null;
}

function appendRow(outPath, row) {
  try { fs.appendFileSync(outPath, JSON.stringify(row) + '\n'); return true; } catch (_) { return false; }
}

// ---------- main (fail-soft exit 0 always) ----------

function main() {
  // FATE-DEFENSE law #1 — the breaker FIRST: zero reads, zero writes on an ACTIVE STASIS.
  const halt = stasisHalt();
  if (halt.active) {
    console.log('STASIS-HALT fleet-delta · breaker active (' + halt.source + ') — no drift is measured under the breaker, no row, no commit.');
    process.exit(0);
  }
  try {
    const args = process.argv.slice(2);
    const argOf = (name, envKey) => {
      const hit = args.find((a) => a === name || a.startsWith(name + '='));
      if (hit) { const eq = hit.indexOf('='); return eq >= 0 ? hit.slice(eq + 1) : args[args.indexOf(hit) + 1]; }
      return process.env[envKey] || null;
    };
    const fromPath = argOf('--from', 'FLEET_DELTA_FROM');
    const fromGit = argOf('--from-git', 'FLEET_DELTA_FROM_GIT');
    const toPath = argOf('--to', 'FLEET_DELTA_TO');
    const outPath = argOf('--out', 'FLEET_DELTA_OUT') || DEFAULT_OUT;

    const fromRaw = readFromBook(fromPath, fromGit);
    const toRaw = toPath ? readBookFile(toPath) : readBookFile(path.join(ROOT, CENSUS_BOOK));
    const to = normalize(toRaw);

    if (!to) { // the map desk owns the broken-map signal; delta books nothing
      console.log('FLEET-DELTA SKIP-INVALID-TO · the current book is absent, an error book, or a STASIS-HALT book — no row (the census owns that signal).');
      process.exit(0);
    }

    const from = normalize(fromRaw);
    let record;
    if (!from) {
      record = firstDeltaRecord(to);
    } else {
      record = diffStable(from, to);
    }
    const at = new Date().toISOString();
    const row = { ...record, at };

    if (record.verdict === 'NO-DRIFT') {
      console.log('FLEET-DELTA NO-DRIFT ' + record.from.fingerprint + '->' + record.to.fingerprint + ' · the determinism law held, no row, no noise commit.');
      process.exit(0);
    }
    if (record.verdict === 'SKIP-PERSPECTIVE') {
      console.log('FLEET-DELTA SKIP-PERSPECTIVE · the books were measured from different estates (' + JSON.stringify(record.from.estate) + ' vs ' + JSON.stringify(record.to.estate) + ') — a perspective flip is a change of instrument, not of estate; no row.');
      process.exit(0);
    }
    const wrote = appendRow(outPath, row);
    const rel = path.relative(ROOT, outPath) || outPath;
    console.log('FLEET-DELTA ' + record.verdict + ' changes=' + record.summary.changes + ' ' + (record.from.fingerprint || 'baseline') + '->' + record.to.fingerprint + ' · row ' + (wrote ? 'booked' : 'WRITE-FAILED') + ' -> ' + rel);
    if (record.verdict === 'DRIFT') {
      for (const t of record.blockers.transitions) console.log('  blocker ' + t.id + ': ' + t.from + ' -> ' + t.to);
      for (const s of record.sovereignty.changed) console.log('  sovereignty ' + s.path + ': ' + String(s.from) + ' -> ' + String(s.to));
      for (const w of record.wiring.changes) console.log('  wiring ' + w.id + ': ' + w.from + ' -> ' + w.to);
    }
  } catch (e) {
    console.log('FLEET-DELTA-ERROR ' + String(e && e.message).slice(0, 160));
  }
  process.exit(0); // fail-soft law
}

if (require.main === module) main();
module.exports = { normalize, diffStable, firstDeltaRecord, fingerprint, flatten, stasisHalt };
