#!/usr/bin/env node
/* CADENCE-WEEK (CR-0053, fleet Rung 25 — THE CADENCE-WEEK READ) — the first
 * distributional read of the fleet's own time series.
 *
 * Booking (R17, kept alive through R23/R24): "first cadence-week distribution read once
 * B2 clears (market-grid history ~5 rows + census artifact series starting)". This rung
 * clears B2 for real: agents/market-grid-history.jsonl holds 7 rows and the census
 * artifact series is ticking daily. Until now the fleet COLLECTED series (edge 30-min,
 * market-grid ~30-min, census daily, delta on transition) but never READ them back as
 * distributions — a ledger that is only ever appended to is a diary, not an instrument.
 *
 * What is computed (offline / keyless / deterministic / fail-soft):
 *  1. MARKET-GRID SERIES — rows, verdict counts, coverage window, inter-row gap stats
 *     (min/median/max minutes), per-market spread distributions (n/min/max/last/mean),
 *     feasible-route frequency (distinct routes + hits), tapeCrossed total.
 *  2. DELTA SERIES — rows, FIRST-DELTA vs DRIFT verdict counts, sovereignty change paths,
 *     blocker transitions (the drift record summarized as numbers, not prose).
 *  3. CENSUS ARTIFACT CROSS-CHECK — the artifact quotes historyRows / estateCommits /
 *     presentLanes / wiring; the desk reports artifactLag = actual history rows minus the
 *     artifact's quoted count (an honesty number: how far the latest snapshot lags the
 *     append-only ledger it summarizes).
 *  4. VERDICT GATE — CADENCE-WEEK-LIVE only when market-grid rows >= 5 AND delta rows
 *     >= 1 (the booked B2 condition, encoded as data). Below that: INSUFFICIENT-SERIES
 *     and NOTHING IS WRITTEN (the no-noise law: a desk that cannot reach its own bar
 *     stays silent rather than publishing a thin book).
 *
 * Laws carried (all pre-existing, re-honored here):
 *  · STASIS halt-before-read (stasisHalt borrowed from the census desk by require —
 *    second-mover law: the brake is THE SAME brake).
 *  · CADENCE_WEEK_SKIP off-switch (house seam).
 *  · Single-writer atomic books: agents/cadence-week.json (+ .md — AT-FREE, HEBREW owner
 *    surface per the owner-language law; repo/CI artifacts stay English).
 *  · Fail-soft: unreadable or corrupt inputs degrade to null sections / skipped rows
 *    (counted), exit 0 always.
 *  · Determinism: markets and routes sorted, numbers rounded (4 decimals), the stable
 *    payload (book minus `at`) is byte-identical for the same tree (E45-guarded).
 */

const fs = require('fs');
const path = require('path');
const { stasisHalt } = require('./fleet-census.cjs');

const ROOT = path.resolve(__dirname, '..');
// eval seam (house pattern): CADENCE_WEEK_DIR redirects inputs AND books so a fresh-process
// fixture never touches the real tree. Unset = the real agents/ surface, unchanged.
const DIR = process.env.CADENCE_WEEK_DIR ? path.resolve(process.env.CADENCE_WEEK_DIR) : path.join(ROOT, 'agents');
const MG_FILE = path.join(DIR, 'market-grid-history.jsonl');
const DELTA_FILE = path.join(DIR, 'fleet-delta.jsonl');
const ARTIFACT_FILE = path.join(DIR, 'fleet-census.artifact.json');
const BOOK_JSON = path.join(DIR, 'cadence-week.json');
const BOOK_MD = path.join(DIR, 'cadence-week.md');

const OWNER_LANGUAGE = 'he';
const OWNER_LANGUAGE_RULE = 'owner-facing replies: עברית (Hebrew) — the owner reads Hebrew; repo/CI artifacts stay English';

// the booked B2 bar, encoded as data (a bar not encoded is not a bar)
const BAR = { marketGridRowsMin: 5, deltaRowsMin: 1 };

// ---------- pure helpers (E45 white-box surface) ----------

const r4 = (x) => (typeof x === 'number' && isFinite(x)) ? Math.round(x * 10000) / 10000 : null;

/** parse a jsonl stream fail-soft: valid rows survive, corrupt lines are counted. */
function parseJsonl(text) {
  const rows = [];
  let corrupt = 0;
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch (_) { corrupt++; }
  }
  return { rows, corrupt };
}

/** chronologically sorted valid-at rows; invalid dates drop out (counted by caller via length). */
function byAt(rows) {
  return (rows || [])
    .filter((r) => r && typeof r.at === 'string' && !isNaN(Date.parse(r.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** inter-row gap statistics in minutes over sorted rows (>=2 rows else null). */
function gapMinutes(sorted) {
  if (!sorted || sorted.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = (Date.parse(sorted[i].at) - Date.parse(sorted[i - 1].at)) / 60000;
    if (isFinite(d) && d >= 0) gaps.push(Math.round(d * 10) / 10);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const med = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
  return { n: gaps.length, minGapMin: gaps[0], medianGapMin: Math.round(med * 10) / 10, maxGapMin: gaps[gaps.length - 1] };
}

/** per-market spread distribution: exact n/min/max/last/mean, sorted by market name. */
function spreadDistributions(sorted) {
  const acc = new Map();
  for (const r of sorted || []) {
    for (const s of (r && r.spreads) || []) {
      if (!s || typeof s.market !== 'string' || !isFinite(s.spreadPct)) continue;
      if (!acc.has(s.market)) acc.set(s.market, { n: 0, min: Infinity, max: -Infinity, last: null, sum: 0 });
      const a = acc.get(s.market);
      a.n++; a.sum += s.spreadPct;
      if (s.spreadPct < a.min) a.min = s.spreadPct;
      if (s.spreadPct > a.max) a.max = s.spreadPct;
      a.last = s.spreadPct;
    }
  }
  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([market, a]) => ({ market, n: a.n, min: r4(a.min), max: r4(a.max), last: r4(a.last), mean: r4(a.sum / a.n) }));
}

/** feasible-route frequency: "NAME:pct%" -> { route, n, lastPct }, sorted by route name. */
function feasibleRoutes(sorted) {
  const acc = new Map();
  for (const r of sorted || []) {
    for (const f of (r && r.heFeasible) || []) {
      if (typeof f !== 'string') continue;
      const m = f.match(/^([^:]+):(-?[\d.]+)%$/);
      const route = m ? m[1] : f;
      const pct = m && isFinite(parseFloat(m[2])) ? parseFloat(m[2]) : null;
      if (!acc.has(route)) acc.set(route, { route, n: 0, lastPct: null });
      const a = acc.get(route);
      a.n++; if (pct != null) a.lastPct = r4(pct);
    }
  }
  return [...acc.values()].sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
}

/** verdict tally over rows: { verdict: count }, sorted keys. */
function verdictCounts(rows) {
  const acc = {};
  for (const r of rows || []) { const v = r && r.verdict ? String(r.verdict) : 'UNVERDICTED'; acc[v] = (acc[v] || 0) + 1; }
  const out = {}; for (const k of Object.keys(acc).sort()) out[k] = acc[k];
  return out;
}

/** the delta series summarized: rows, verdict split, sovereignty paths, blocker transitions. */
function deltaSummary(sorted) {
  if (!sorted || !sorted.length) return { rows: 0 };
  const out = { rows: sorted.length, verdicts: verdictCounts(sorted), sovereigntyChangePaths: 0, blockerTransitions: 0 };
  for (const r of sorted) {
    const sc = (r && r.sovereignty && Array.isArray(r.sovereignty.changed)) ? r.sovereignty.changed : [];
    out.sovereigntyChangePaths += sc.length;
    const b = (r && r.blockers) || {};
    const bt = (Array.isArray(b.added) ? b.added.length : 0) + (Array.isArray(b.missing) ? b.missing.length : 0) + (Array.isArray(b.statusChanges) ? b.statusChanges.length : 0);
    out.blockerTransitions += bt;
  }
  const last = sorted[sorted.length - 1];
  const ec = last && last.lanes && last.lanes.estateCommits;
  if (ec && typeof ec === 'object') { out.estateCommitsLast = { from: ec.from ?? null, to: ec.to ?? null }; }
  return out;
}

/** the verdict gate — the booked B2 condition as a pure function. */
function computeVerdict(mgN, deltaN) {
  if (mgN >= BAR.marketGridRowsMin && deltaN >= BAR.deltaRowsMin) return 'CADENCE-WEEK-LIVE';
  return 'INSUFFICIENT-SERIES';
}

/** the artifact cross-check: what the latest census snapshot quotes vs the ledger truth. */
function artifactLag(artifact, actualMgRows) {
  if (!artifact || typeof artifact !== 'object') return null;
  const es = artifact.edgeSeries || {};
  const inv = artifact.inventory || {};
  const quoted = typeof es.historyRows === 'number' ? es.historyRows : null;
  return {
    historyRowsQuoted: quoted,
    historyRowsActual: actualMgRows,
    artifactLagRows: quoted == null ? null : actualMgRows - quoted,
    presentLanes: inv.presentLanes ?? null,
    totalLanes: inv.totalLanes ?? null,
    estateCommits: inv.estateCommits ?? null,
    wiring: artifact.wiring && artifact.wiring.wired != null ? artifact.wiring.wired : (artifact.wiring ?? null)
  };
}

/** the stable book (minus any `at`) — byte-deterministic for the same tree. */
function composeBook(inputs) {
  const mgSorted = byAt(inputs.mg.rows);
  const dSorted = byAt(inputs.delta.rows);
  const mgN = mgSorted.length;
  const dN = dSorted.length;
  const verdict = computeVerdict(mgN, dN);
  const sections = {
    marketGrid: {
      rows: mgN, corruptLines: inputs.mg.corrupt, verdicts: verdictCounts(mgSorted),
      window: mgN ? { firstAt: mgSorted[0].at, lastAt: mgSorted[mgSorted.length - 1].at,
        coverageHours: r4((Date.parse(mgSorted[mgSorted.length - 1].at) - Date.parse(mgSorted[0].at)) / 3600000) } : null,
      gaps: gapMinutes(mgSorted), spreads: spreadDistributions(mgSorted), routes: feasibleRoutes(mgSorted),
      tapeCrossedTotal: (mgSorted || []).reduce((t, r) => t + (r && r.spreads || []).reduce((u, s) => u + (isFinite(s && s.tapeCrossed) ? s.tapeCrossed : 0), 0), 0)
    },
    delta: deltaSummary(dSorted),
    artifact: artifactLag(inputs.artifact, mgN),
    bar: BAR
  };
  return { format: 'SAOS-CADENCE-WEEK/1', agent: 'cadence-week', verdict, ownerLanguage: OWNER_LANGUAGE, ownerLanguageRule: OWNER_LANGUAGE_RULE, sections };
}

/** the HEBREW owner surface (AT-FREE so it can never cause a publish diff on its own). */
function renderMd(book) {
  const s = book.sections;
  const L = [];
  L.push('# קריאת הקצב — הניתוח ההתפלגותי הראשון של הצי (CR-0053)');
  L.push('');
  L.push(`**מסקנה: ${book.verdict === 'CADENCE-WEEK-LIVE' ? 'חיה — תנאי B2 עבר והסדרות נקראו חזרה' : 'אין מספיק סדרות — הדסק כתב כלום (חוק הרעש-אפס)'}**`);
  L.push('');
  L.push(`- שוק-גריד: ${s.marketGrid.rows} שורות${s.marketGrid.corruptLines ? ` (${s.marketGrid.corruptLines} שורות פגומות נדגמו ונזרקו בכנות)` : ''}, חלון כיסוי ${s.marketGrid.window ? s.marketGrid.window.coverageHours + ' שעות' : '—'}, פערים: ${s.marketGrid.gaps ? `min ${s.marketGrid.gaps.minGapMin} / חציון ${s.marketGrid.gaps.medianGapMin} / max ${s.marketGrid.gaps.maxGapMin} דקות` : '—'}`);
  for (const sp of s.marketGrid.spreads) L.push(`  - ${sp.market}: n=${sp.n}, min ${sp.min}% → max ${sp.max}%, אחרון ${sp.last}%, ממוצע ${sp.mean}%`);
  for (const rt of s.marketGrid.routes) L.push(`  - מסלול בר-ביצוע ${rt.route}: ${rt.n} פעמים, אחרון ${rt.lastPct}%`);
  L.push(`- דלתא: ${s.delta.rows} שורות (${Object.entries(s.delta.verdicts || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}), שינויי ריבונות ${s.delta.sovereigntyChangePaths}, מעברי חוסמים ${s.delta.blockerTransitions}`);
  if (s.artifact) L.push(`- חיבור ל-artifact: ה-census ציטט ${s.artifact.historyRowsQuoted} שורות היסטוריה מול ${s.artifact.historyRowsActual} בפועל (פער ${s.artifact.artifactLagRows}), ${s.artifact.presentLanes}/${s.artifact.totalLanes} מסלולים, estateCommits ${s.artifact.estateCommits}`);
  L.push(`- סף B2 (מקודד): marketGrid>=${s.bar.marketGridRowsMin} ∧ delta>=${s.bar.deltaRowsMin}`);
  L.push('');
  L.push(`_${OWNER_LANGUAGE_RULE}_`);
  return L.join('\n');
}

// ---------- main (fail-soft, single-writer, no-noise) ----------

function main() {
  if (process.env.CADENCE_WEEK_SKIP === '1') { console.log('CADENCE-WEEK SKIP (CADENCE_WEEK_SKIP=1)'); return; }
  const halt = stasisHalt();
  if (halt.active) {
    console.log('CADENCE-WEEK STASIS-HALT · the breaker is active — nothing read, nothing written');
    return;
  }
  const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
  const readJson = (p) => { try { return JSON.parse(readText(p)); } catch (_) { return null; } };
  const inputs = {
    mg: parseJsonl(readText(MG_FILE) || ''),
    delta: parseJsonl(readText(DELTA_FILE) || ''),
    artifact: readJson(ARTIFACT_FILE)
  };
  const book = composeBook(inputs);
  if (book.verdict !== 'CADENCE-WEEK-LIVE') {
    console.log(`CADENCE-WEEK verdict=${book.verdict} · marketGrid=${book.sections.marketGrid.rows} delta=${book.sections.delta.rows} · below the encoded bar — nothing written (no-noise law)`);
    return;
  }
  const stamped = { ...book, at: new Date().toISOString() };
  const tmpJ = BOOK_JSON + '.tmp';
  fs.writeFileSync(tmpJ, JSON.stringify(stamped, null, 1) + '\n');
  fs.renameSync(tmpJ, BOOK_JSON);
  const tmpM = BOOK_MD + '.tmp';
  fs.writeFileSync(tmpM, renderMd(book) + '\n');
  fs.renameSync(tmpM, BOOK_MD);
  const s = book.sections;
  console.log(`CADENCE-WEEK verdict=${book.verdict} · marketGrid=${s.marketGrid.rows} rows/${s.marketGrid.spreads.length} markets · delta=${s.delta.rows} rows · artifactLag=${s.artifact ? s.artifact.artifactLagRows : 'null'} (${OWNER_LANGUAGE_RULE})`);
}

try { main(); } catch (e) { console.log('CADENCE-WEEK ERROR (fail-soft): ' + String(e.message).slice(0, 120)); process.exitCode = 0; }
module.exports = { parseJsonl, byAt, gapMinutes, spreadDistributions, feasibleRoutes, verdictCounts, deltaSummary, computeVerdict, artifactLag, composeBook, renderMd, BAR };
