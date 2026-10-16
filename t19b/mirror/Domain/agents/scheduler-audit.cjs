#!/usr/bin/env node
/* SCHEDULER-AUDIT (CR-0056, fleet Rung 27 — THE METRONOME AUDIT, pure desk) —
 * the fleet measures its own TIME: are the scheduled cadences actually firing?
 *
 * FINDING BOOKED (R27 opening audit): GitHub's scheduler stopped firing scheduled
 * events on this repo — every schedule added after 2026-10-03T18:36Z has ZERO scheduled
 * runs ever, and the old 30-min grid-trigger-twin schedule stopped at 18:36:46Z.
 * Until now this starvation was invisible to the estate books (discovered by hand via
 * the Actions API); a cadence the fleet cannot see is a cadence that can rot silently.
 * This desk turns the raw run census (agents/scheduler-raw.json, collected keyless by
 * scheduler-collect.cjs on the built-in GITHUB_TOKEN) into a deterministic book:
 * per-workflow expected-vs-observed slots, PULSE/DEGRADED/STARVED verdicts, the
 * repo-wide scheduler boundary (the last moment any scheduled run was observed), and
 * the bounded HEAL list — STARVED ∧ KEYLESS workflows only (the R26 keyless wave
 * composes: the self-healing fleet is the keyless fleet; secret-carrying legs stay
 * owner/keeper territory).
 *
 * VERDICT MACHINE (edge-exact, E48-guarded), per scheduled workflow:
 *   UNMEASURED — expected slots 0 (window too short for the cadence) or runs null (API error)
 *   STARVED    — observed 0 while expected > 0
 *   DEGRADED   — missed >= 3 with some observed
 *   PULSE      — missed <= 2
 * overall: any STARVED → SCHEDULER-STARVED; else any DEGRADED → SCHEDULER-DEGRADED;
 * else rows>0 → SCHEDULER-PULSE; else SCHEDULER-EMPTY.
 *
 * Laws carried (all pre-existing, re-honored here):
 *  · STASIS halt-before-read (stasisHalt borrowed from the census desk by require —
 *    second-mover law: the brake is THE SAME brake).
 *  · SCHEDULER_AUDIT_SKIP off-switch + SCHEDULER_AUDIT_DIR seam (house pattern: inputs
 *    AND books redirect, a fresh-process fixture never touches the real tree).
 *  · Single-writer atomic books: agents/scheduler-audit.json (+ .md — AT-FREE, HEBREW
 *    owner surface per the owner-language law; repo/CI artifacts stay English).
 *  · Fail-soft: corrupt raw degrades to SCHEDULER-EMPTY with a counted note, exit 0.
 *  · Determinism: the window comes from the INPUT (never Date.now()); rows sorted by
 *    file; the stable payload (book minus `at`) is byte-identical for the same input.
 */

const fs = require('fs');
const path = require('path');
const { stasisHalt } = require('./fleet-census.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIR = process.env.SCHEDULER_AUDIT_DIR ? path.resolve(process.env.SCHEDULER_AUDIT_DIR) : path.join(ROOT, 'agents');
// eval seam (house pattern): the workflows dir also redirects so a fixture can exercise
// the keyless-heal composition law without touching the real .github/workflows tree.
const WF_DIR = process.env.SCHEDULER_WF_DIR ? path.resolve(process.env.SCHEDULER_WF_DIR) : path.join(ROOT, '.github', 'workflows');
const RAW_FILE = path.join(DIR, 'scheduler-raw.json');
const BOOK_JSON = path.join(DIR, 'scheduler-audit.json');
const BOOK_MD = path.join(DIR, 'scheduler-audit.md');

const OWNER_LANGUAGE = 'he';
const OWNER_LANGUAGE_RULE = 'owner-facing replies: עברית (Hebrew) — the owner reads Hebrew; repo/CI artifacts stay English';

// the heal bar, encoded as data: keyless only, never the host, never the healer, cap 3
const HEAL = { cap: 3, excludeFiles: ['fleet-census-cron.yml', 'tick-keeper.yml'] };
// GitHub delays scheduled runs up to ~30 min under load; 40 min grace before a slot counts as missed
const GRACE_MS = 40 * 60_000;

// ---------- pure helpers (E48 white-box surface) ----------

/** '23,53 * * * *' -> { minutes:[23,53], hours:[0..23] } | null. Only the m,h-family
 *  the fleet actually uses (fields 3-5 must be '*'); anything else = unparseable (null),
 *  honestly excluded from slot math and counted. */
function parseCron(expr) {
  const f = String(expr || '').trim().split(/\s+/);
  if (f.length !== 5) return null;
  if (f[2] !== '*' || f[3] !== '*' || f[4] !== '*') return null;
  let minutes;
  if (f[0] === '*') minutes = [];
  else {
    minutes = [];
    for (const p of f[0].split(',')) {
      const n = Number(p);
      if (!Number.isInteger(n) || n < 0 || n > 59) return null;
      minutes.push(n);
    }
    minutes.sort((a, b) => a - b);
    if (minutes.length === 0) return null;
  }
  let hours;
  if (f[1] === '*') hours = 'all';
  else if (/^\*\/(\d+)$/.test(f[1])) {
    const step = Number(f[1].slice(2));
    if (!Number.isInteger(step) || step < 1 || step > 24) return null;
    hours = [];
    for (let h = 0; h < 24; h += step) hours.push(h);
  } else {
    hours = [];
    for (const p of f[1].split(',')) {
      const n = Number(p);
      if (!Number.isInteger(n) || n < 0 || n > 23) return null;
      hours.push(n);
    }
    hours.sort((a, b) => a - b);
    if (hours.length === 0) return null;
  }
  return { minutes, hours };
}

/** count of cron slots in [fromMs, toMs) (UTC, minute resolution). -1 when unparseable. */
function slotsIn(expr, fromMs, toMs) {
  const c = parseCron(expr);
  if (!c) return -1;
  if (c.minutes.length === 0) {
    // '*' minutes means every minute — count minute-by-minute
    let n = 0;
    for (let t = Math.ceil(fromMs / 60_000) * 60_000; t < toMs; t += 60_000) {
      const d = new Date(t);
      if (c.hours === 'all' || c.hours.includes(d.getUTCHours())) n += 1;
    }
    return n;
  }
  let n = 0;
  for (let t = Math.ceil(fromMs / 60_000) * 60_000; t < toMs; t += 60_000) {
    const d = new Date(t);
    if (c.hours !== 'all' && !c.hours.includes(d.getUTCHours())) continue;
    if (c.minutes.includes(d.getUTCMinutes())) n += 1;
  }
  return n;
}

/** the verdict machine (edge-exact). runs: array of ISO stamps | null (API error). */
function verdictFor(expected, runs) {
  if (!Array.isArray(runs)) return 'UNMEASURED';
  const observed = runs.length;
  if (expected <= 0) return 'UNMEASURED';
  if (observed === 0) return 'STARVED';
  const missed = Math.max(0, expected - observed);
  if (missed >= 3) return 'DEGRADED';
  return 'PULSE';
}

/** compose the book from the raw census (pure; deterministic for the same input). */
function composeBook(raw, opts) {
  const opts2 = opts || {};
  const wfs = raw && Array.isArray(raw.workflows) ? raw.workflows : null;
  if (!raw || !raw.windowFrom || !raw.windowTo || !wfs) {
    return { format: 'SAOS-SCHEDULER-AUDIT/1', agent: 'scheduler-audit', verdict: 'SCHEDULER-EMPTY', ownerLanguage: OWNER_LANGUAGE, ownerLanguageRule: OWNER_LANGUAGE_RULE, sections: { pulse: { rows: [] }, boundary: { schedulerLastSeenAt: null, starvedNames: [], degradedNames: [], unmeasuredNames: [] }, heal: { candidates: [], cap: HEAL.cap, law: 'STARVED ∧ keyless ∧ not-host ∧ not-keeper' }, window: null, note: 'raw census unreadable — measured nothing, invented nothing' } };
  }
  const fromMs = Date.parse(raw.windowFrom);
  const toMs = Date.parse(raw.windowTo);
  const auditTo = (Number.isFinite(toMs) ? toMs : 0) - GRACE_MS;
  const rows = [];
  for (const wf of wfs) {
    const file = String(wf && wf.file || '');
    if (!file) continue;
    const crons = Array.isArray(wf.crons) ? wf.crons : [];
    let expected = 0;
    let unparseable = 0;
    for (const c of crons) {
      const s = slotsIn(c, fromMs, auditTo);
      if (s < 0) unparseable += 1;
      else expected += s;
    }
    const runs = Array.isArray(wf.scheduledRuns) ? wf.scheduledRuns : null;
    const inWindow = runs ? runs.filter((t) => { const ms = Date.parse(t); return Number.isFinite(ms) && ms >= fromMs && ms < toMs; }).sort() : null;
    const last = runs && runs.length ? runs[runs.length - 1] : null;
    rows.push({
      file,
      crons,
      expectedSlots: expected,
      observed: inWindow ? inWindow.length : null,
      lastScheduledAt: last,
      unparseableCrons: unparseable,
      verdict: runs === null ? 'UNMEASURED' : verdictFor(expected, inWindow),
    });
  }
  rows.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  let lastSeen = null;
  for (const r of rows) {
    if (!r.lastScheduledAt) continue;
    const ms = Date.parse(r.lastScheduledAt);
    if (Number.isFinite(ms) && (lastSeen === null || ms > Date.parse(lastSeen))) lastSeen = r.lastScheduledAt;
  }
  const starvedNames = rows.filter((r) => r.verdict === 'STARVED').map((r) => r.file);
  const degradedNames = rows.filter((r) => r.verdict === 'DEGRADED').map((r) => r.file);
  const unmeasuredNames = rows.filter((r) => r.verdict === 'UNMEASURED').map((r) => r.file);
  const verdict = starvedNames.length > 0 ? 'SCHEDULER-STARVED' : degradedNames.length > 0 ? 'SCHEDULER-DEGRADED' : rows.length > 0 ? 'SCHEDULER-PULSE' : 'SCHEDULER-EMPTY';
  // the heal list: STARVED ∧ keyless (the owner-secret regex of the census, over the file itself)
  const candidates = [];
  for (const r of rows) {
    if (r.verdict !== 'STARVED') continue;
    if (HEAL.excludeFiles.includes(r.file)) continue;
    const p = path.join(WF_DIR, r.file);
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch (_) { text = ''; }
    if (/secrets\.(?!GITHUB_TOKEN)[A-Z_]+/.test(text)) continue; // keyless law: the self-healing fleet is the keyless fleet
    candidates.push(r.file);
    if (candidates.length >= HEAL.cap) break;
  }
  return {
    format: 'SAOS-SCHEDULER-AUDIT/1',
    agent: 'scheduler-audit',
    verdict,
    ownerLanguage: OWNER_LANGUAGE,
    ownerLanguageRule: OWNER_LANGUAGE_RULE,
    sections: {
      pulse: { rows },
      boundary: { schedulerLastSeenAt: lastSeen, starvedNames, degradedNames, unmeasuredNames },
      heal: { candidates, cap: HEAL.cap, law: 'STARVED ∧ keyless ∧ not-host ∧ not-keeper' },
      window: { from: raw.windowFrom, to: raw.windowTo, graceMinutes: GRACE_MS / 60_000 },
    },
  };
}

/** the HEBREW owner surface (AT-FREE so it can never cause a publish diff on its own). */
function renderMd(book) {
  const s = book.sections;
  const V = { 'SCHEDULER-PULSE': 'פועם — כל הפעימות המתוזמנות נמדדו חיות', 'SCHEDULER-DEGRADED': 'פגוע — יש פעימות שמדלגות סלוטים', 'SCHEDULER-STARVED': 'מורעב — יש פעימות שהמתזמן לא הצית כלל', 'SCHEDULER-EMPTY': 'ריק — לא נמדד כלול, לא הומצא כלול' };
  const L = [];
  L.push('# ביקורת המתזמן — האם הפעימות באמת פועמות (CR-0056)');
  L.push('');
  L.push(`**מסקנה: ${V[book.verdict] || book.verdict}**`);
  L.push('');
  if (s.window) L.push(`- חלון המדידה: ${s.window.from} → ${s.window.to} (חסד ${s.window.graceMinutes} דק׳ לעיכובי GitHub)`);
  L.push(`- גבול החיים המתוזמנים של GitHub בריפו: ${s.boundary.schedulerLastSeenAt || 'לא נצפתה שום ריצה מתוזמנת'} — כל מה שאחריו הצי מקיים בעצמו`);
  for (const r of s.pulse.rows) {
    const v = { PULSE: 'פועמת', DEGRADED: 'פגועה', STARVED: 'מורעבת', UNMEASURED: 'לא-נמדדה' }[r.verdict] || r.verdict;
    L.push(`  - ${r.file} — ${v}: צפוי ${r.expectedSlots} / נצפה ${r.observed === null ? '—' : r.observed}, ריצה מתוזמנת אחרונה ${r.lastScheduledAt || 'אף-פעם'}${r.unparseableCrons ? ` (${r.unparseableCrons} cron לא-ניתן לניתוח — נשלל בכנות)` : ''}`);
  }
  if (s.heal.candidates.length > 0) L.push(`- מועמדות-ריפוי (dispatch מגובל ≤${s.heal.cap}, חסרי-מפתח בלבד): ${s.heal.candidates.join(', ')}`);
  L.push(`- חוק: ${s.heal.law}`);
  L.push('');
  L.push(`_${OWNER_LANGUAGE_RULE}_`);
  return L.join('\n');
}

// ---------- main (fail-soft, single-writer, honest-empty) ----------

function main() {
  if (process.env.SCHEDULER_AUDIT_SKIP === '1') { console.log('SCHEDULER-AUDIT SKIP (SCHEDULER_AUDIT_SKIP=1)'); return; }
  const halt = stasisHalt();
  if (halt.active) {
    console.log('SCHEDULER-AUDIT STASIS-HALT · the breaker is active — nothing read, nothing written');
    return;
  }
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8')); } catch (_) { raw = null; }
  const book = composeBook(raw);
  const stamped = { ...book, at: new Date().toISOString() };
  const tmpJ = BOOK_JSON + '.tmp';
  fs.writeFileSync(tmpJ, JSON.stringify(stamped, null, 1) + '\n');
  fs.renameSync(tmpJ, BOOK_JSON);
  const tmpM = BOOK_MD + '.tmp';
  fs.writeFileSync(tmpM, renderMd(book) + '\n');
  fs.renameSync(tmpM, BOOK_MD);
  const s = book.sections;
  console.log(`SCHEDULER-AUDIT verdict=${book.verdict} · rows=${s.pulse.rows.length} · starved=${s.boundary.starvedNames.length} · degraded=${s.boundary.degradedNames.length} · boundary=${s.boundary.schedulerLastSeenAt || 'none'} · heal=${s.heal.candidates.length} (${OWNER_LANGUAGE_RULE})`);
}

try { main(); } catch (e) { console.log('SCHEDULER-AUDIT ERROR (fail-soft): ' + String(e.message).slice(0, 120)); process.exitCode = 0; }
module.exports = { parseCron, slotsIn, verdictFor, composeBook, renderMd, HEAL, GRACE_MS };
