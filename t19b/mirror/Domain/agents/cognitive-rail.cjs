'use strict';
/**
 * cognitive-rail.cjs — Z-39 COGNITIVE RAIL DESK
 * (born from the tashfeenahmed/freellmapi study, operator order: "handle
 * everything open + review what we and the other agents did + examine this
 * repo and how it can help us optimize").
 *
 * What freellmapi IS: a self-hosted OpenAI-compatible gateway pooling ~34
 * free LLM tiers behind one /v1 — provider catalog as data, a router that
 * scores reliability/speed/capability/headroom (Thompson-sampling bandit),
 * a persistent rate-limit ledger with cooldowns and UTC-midnight resets,
 * keys encrypted at rest, and an honest Limitations section ("intelligence
 * degrades as the day progresses", "no SLA by definition").
 *
 * What the fleet ADOPTS (mechanism, not dependencies):
 *   1. PROVIDER-CATALOG-AS-DATA  — every third-party inference rail is a row
 *      in agents/inference-providers.csv with a cited ToS verdict. No row,
 *      no rail. Cohere (their review: ToS §14 forbids personal use) is
 *      status NEVER — the catalog itself refuses to enable it.
 *   2. KEYLESS-ONLY PROBES — this desk touches rails ONLY via anonymous
 *      GET /v1/models (AI Horde's documented sentinel `0000000000`, OVH's
 *      documented 2-req/min anonymous mode, pollinations' keyless catalog).
 *      Keyed rails are tier C: the operator gates keys, in perpetuity.
 *   3. DATA-CLASS GATE — fleet keys, WIFs, books and private state are
 *      NEVER transmitted to any third-party rail. Public broadcast text
 *      only, and any LLM output from an untrusted rail is ADVISORY-ONLY:
 *      it can never substitute verify-then-sign (the chain speaks last).
 *   4. HONEST DEGRADATION — their Limitations lesson, adopted verbatim in
 *      spirit: a free rail degrades under load; probes book REACHABLE /
 *      AUTH-WALL / DEGRADED / UNREACHABLE, never a hopeful green.
 *
 * Modes:
 *   catalog [--file <csv>] → validate the registry (quote-aware parser per
 *                            the Z-37 lesson), verdict JSON + ledger stamp
 *   probe   [--only <p>]   → keyless GET /models against LIVE rows,
 *                            classify, stamp agents/rail-ledger.json
 *   policy                 → print the data-class + advisory-only law
 *
 * Fail-soft: exit 0 always; verdicts are booked honestly. Keyless. No fleet
 * data leaves the machine. Exports are require-main gated (requiring this
 * file never runs the desk) so the judge and evals can white-box it.
 */
const fs = require('fs');
const path = require('path');

const AG = __dirname;
const CATALOG_PATH = path.join(AG, 'inference-providers.csv');
const LEDGER_PATH = path.join(AG, 'rail-ledger.json');
const HORIZON = 'freellmapi server v0.2.1 (tashfeenahmed/freellmapi, deep-read 2026-10-02)';
const AIHORDE_SENTINEL = '0000000000'; // their documented anonymous key (providers/aihorde.ts)

const STATUSES = ['LIVE', 'CATALOG-ONLY', 'DORMANT', 'NEVER'];
const TOS = ['OK', 'CAUTION', 'AMBIGUOUS', 'FORBIDDEN'];

/** Quote-aware CSV row parser (Z-37 lesson: naive split misreads quoted commas). */
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCatalog(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const header = parseCsvLine(lines[0]);
  const EXPECT = ['provider', 'endpoint', 'auth', 'tos', 'tos_source', 'fleet_tier', 'data_class', 'status'];
  if (header.join('|') !== EXPECT.join('|')) return { header, rows: [], error: `bad header: ${header.join(',')}` };
  const rows = lines.slice(1).map((l) => {
    const c = parseCsvLine(l);
    return { provider: c[0], endpoint: c[1], auth: c[2], tos: c[3], tos_source: c[4], fleet_tier: c[5], data_class: c[6], status: c[7], _line: l };
  });
  return { header, rows, error: null };
}

function classifyProbe(status, body, err) {
  if (err) return { verdict: 'UNREACHABLE', detail: String(err.message || err).slice(0, 120), models: 0 };
  if (status === 200) {
    let models = 0;
    try { const j = JSON.parse(body); models = Array.isArray(j.data) ? j.data.length : 0; } catch (_) { /* body not JSON */ }
    return { verdict: 'REACHABLE', detail: 'GET /models 200', models };
  }
  if (status === 401 || status === 403) return { verdict: 'AUTH-WALL', detail: `GET /models ${status}`, models: 0 };
  return { verdict: 'DEGRADED', detail: `GET /models ${status}`, models: 0 };
}

function validateCatalog(file) {
  const { rows, error } = parseCatalog(file || CATALOG_PATH);
  if (error) return { ok: false, reason: error, counts: {} };
  const problems = [];
  const counts = { total: rows.length, live: 0, catalogOnly: 0, dormant: 0, never: 0, neverLive: 0, keyedNotTierC: 0, liveWithoutHttps: 0, dupes: 0 };
  const seen = new Set();
  for (const r of rows) {
    if (!r.provider || !STATUSES.includes(r.status)) problems.push(`row '${r.provider}': bad status '${r.status}'`);
    if (r.provider && seen.has(r.provider)) { counts.dupes++; problems.push(`duplicate provider '${r.provider}'`); }
    if (r.provider) seen.add(r.provider);
    if (!TOS.includes(r.tos)) problems.push(`row '${r.provider}': bad tos '${r.tos}'`);
    if (r.status === 'NEVER' && r.tos !== 'FORBIDDEN') problems.push(`row '${r.provider}': NEVER requires tos FORBIDDEN`);
    if (r.status === 'LIVE') counts.live++;
    if (r.status === 'CATALOG-ONLY') counts.catalogOnly++;
    if (r.status === 'DORMANT') counts.dormant++;
    if (r.status === 'NEVER') counts.never++;
    if (r.status !== 'NEVER' && r.tos === 'FORBIDDEN') { counts.neverLive++; problems.push(`row '${r.provider}': FORBIDDEN tos must be status NEVER`); }
    if (r.auth === 'keyed' && !['C', 'NEVER'].includes(r.fleet_tier)) { counts.keyedNotTierC++; problems.push(`row '${r.provider}': keyed rail must be tier C (operator gate)`); }
    if ((r.status === 'LIVE' || r.status === 'CATALOG-ONLY')) {
      if (r.auth === 'keyed') { counts.keyedNotTierC++; problems.push(`row '${r.provider}': LIVE/CATALOG rail cannot be keyed`); }
      if (!String(r.endpoint || '').startsWith('https://')) { counts.liveWithoutHttps++; problems.push(`row '${r.provider}': LIVE rail needs https endpoint`); }
    }
  }
  return { ok: problems.length === 0, reason: problems.length ? problems.join(' · ') : 'catalog clean', counts, rows };
}

function stampLedger(entry) {
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch (_) { ledger = { runs: [] }; }
  if (!Array.isArray(ledger.runs)) ledger.runs = [];
  ledger.runs.push(entry);
  if (ledger.runs.length > 200) ledger.runs = ledger.runs.slice(-100);
  ledger.at = entry.at;
  ledger.horizon = HORIZON;
  ledger.law = 'COGNITIVE-RAIL LAW (doctrine v1.5): registry-gated, ToS-gated, keyless-probe-only, public-data-only, advisory-only output';
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 1) + '\n');
}

async function probe(only) {
  const v = validateCatalog(CATALOG_PATH);
  if (!v.ok) {
    stampLedger({ at: new Date().toISOString(), mode: 'probe', ok: false, reason: v.reason, probe: [], summary: { probed: 0, reachable: 0 } });
    console.log(JSON.stringify({ ok: false, reason: v.reason }, null, 1));
    return;
  }
  const targets = v.rows.filter((r) => r.status === 'LIVE' && (!only || r.provider === only));
  const results = [];
  for (const t of targets) {
    const t0 = Date.now();
    let status = 0, body = null, err = null;
    try {
      const headers = { 'User-Agent': 'roshpinacare-fleet-cognitive-rail (keyless catalog probe; no fleet data)' };
      if (t.provider === 'aihorde') headers['Authorization'] = `Bearer ${AIHORDE_SENTINEL}`;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(t.endpoint + '/models', { headers, signal: ctl.signal });
      clearTimeout(timer);
      status = res.status;
      body = await res.text();
    } catch (e) { err = e; }
    const c = classifyProbe(status, body, err);
    results.push({ provider: t.provider, endpoint: t.endpoint, verdict: c.verdict, detail: c.detail, models: c.models, ms: Date.now() - t0 });
  }
  const reachable = results.filter((r) => r.verdict === 'REACHABLE').length;
  const entry = {
    at: new Date().toISOString(), mode: 'probe', ok: true,
    probe: results, summary: { probed: results.length, reachable },
    note: 'keyless GET /models only; zero fleet data transmitted; rail output is advisory-only (never a verify-then-sign substitute)',
  };
  stampLedger(entry);
  console.log(JSON.stringify(entry, null, 1));
}

function policy() {
  const lines = [
    'COGNITIVE RAIL POLICY (Z-39, from the freellmapi study)',
    '',
    '1. REGISTRY GATE: every third-party inference rail must be a row in agents/inference-providers.csv',
    '   with a cited ToS verdict. No row, no rail. FORBIDDEN verdicts (cohere: ToS §14) are status NEVER —',
    '   the catalog itself refuses to enable them, and check #28 + eval E12 pin this.',
    '2. KEY GATE: keyed rails are tier C — the operator holds keys, in perpetuity. This desk probes rails',
    '   ONLY anonymously (AI Horde sentinel, OVH anon mode, pollinations keyless catalog).',
    '3. DATA-CLASS GATE: never transmitted to any rail — keys, WIFs, books, private state, memos with',
    '   account detail. Permitted payload: public broadcast text only.',
    '4. ADVISORY-ONLY LAW: LLM output from any untrusted/free rail is advisory input for drafting and',
    '   summarizing. It NEVER substitutes verify-then-sign; the chain speaks last. No signing decision,',
    '   order price, or vote weight may be derived from rail output without an independent verifiable read.',
    '5. HONEST DEGRADATION: free rails throttle and degrade (their Limitations: "intelligence degrades as',
    '   the day progresses", "no SLA, by definition"). Probes book REACHABLE/AUTH-WALL/DEGRADED/UNREACHABLE;',
    '   a DORMANT row stays DORMANT until the operator unlocks tier C keys — no simulated liveness.',
  ];
  console.log(lines.join('\n'));
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const mode = args[0] || 'catalog';
    try {
      if (mode === 'catalog') {
        const fi = args.indexOf('--file');
        const v = validateCatalog(fi >= 0 ? args[fi + 1] : CATALOG_PATH);
        if (fi < 0) stampLedger({ at: new Date().toISOString(), mode: 'catalog', ok: v.ok, reason: v.reason, counts: v.counts, probe: [], summary: { probed: 0, reachable: 0 } });
        console.log(JSON.stringify({ ok: v.ok, reason: v.reason, counts: v.counts }, null, 1));
      } else if (mode === 'probe') {
        const oi = args.indexOf('--only');
        await probe(oi >= 0 ? args[oi + 1] : null);
      } else if (mode === 'policy') {
        policy();
      } else {
        console.log(JSON.stringify({ ok: false, reason: `unknown mode '${mode}' (catalog|probe|policy)` }));
      }
    } catch (e) {
      console.log(JSON.stringify({ ok: false, reason: 'rail fail-soft: ' + String(e.message || e).slice(0, 120) }));
    }
    process.exit(0); // fail-soft: never break a run
  })();
} else {
  module.exports = { parseCatalog: (f) => parseCatalog(f), parseCsvLine, validateCatalog, classifyProbe, CATALOG_PATH, LEDGER_PATH };
}
