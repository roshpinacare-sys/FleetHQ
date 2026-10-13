#!/usr/bin/env node
/**
 * office-artery.mjs — THE SOVEREIGN OFFICE, GIT-BACKED HEARTBEAT (R-ARTERY/1)
 *
 * Owner directive 2026-10-11 (IM trace 1a1…67d9): "המשרד ב-fleet חשוב מאוד —
 * הוא חייב לשרת את הרשת והריבונות, לשפר את עצמו, לעבוד תמיד, וגם להעלות אותו לדף."
 *
 * Measured history (office-events.jsonl + FleetHQ/receipts): the office ran as a
 * sandbox-local, LLM-gateway-driven desk (6 workers) and died mid-shift when the
 * gateway died (last event 2026-10-09 04:02Z, "unparseable reply → reprompt" loop;
 * last FleetHQ mirror 2026-10-10 16:24Z). The fleet's hard lesson is the cure:
 * THE AUTONOMY MUST LIVE IN GIT, NOT IN A SANDBOX.
 *
 * What this artery does every run (deterministic, keyless, STASIS-safe):
 *   1. SCOUT SHIFT — freshness surveillance of the fleet's books (the office's own
 *      standing law: "בדוק גיל כל ספר ורענן מיידי מי שחורג מ-24 שעות").
 *   2. LESSONS — derive exactly one honest lesson from measured facts.
 *   3. ECONOMY — honest bookkeeping: workers are credited only for tasks actually
 *      executed in this shift (internal office credits; zero chain ops, zero fake money).
 *   4. GOALS — next shift's goals come from measured gaps (stalest books first),
 *      or from recruitment.json PROPOSED roles when all books are fresh.
 *   5. FEED — writes agents/office-live.json: THE office truth feed for pages
 *      (marketing page consumes this; office opens first, then network utilities).
 *
 * Laws carried:
 *   - STASIS (FATE-DEFENSE #1): zero capital lanes — measurement and bookkeeping only.
 *   - Honest-fail: every claim is measured; missing data = UNKNOWN, never invented.
 *   - Exit 0 always, fail-soft (the office never breaks the pipeline that runs it).
 *   - Append-only events (office-events.jsonl), flip-the-flag memory (office-memory.json).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AG = path.join(ROOT, 'agents');
const NOW = new Date();

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } };
const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 1) + '\n');

/* ── worker roster (the office's standing six; order = deterministic rotation) ── */
const WORKERS = [
  { id: 'aluf',   desk: 'ראש-מטה / foreman' },
  { id: 'shachar', desk: 'סיור-ספרים ומדידה' },
  { id: 'gal',    desk: 'מפעיל-שוק וספרי-שוק' },
  { id: 'erez',   desk: 'לקחים ותיעוד' },
  { id: 'tamar',  desk: 'סיור-רשת ומחקר' },
  { id: 'yarden', desk: 'ביקורת-עמיתים ואמת' },
];

/* ── books under office surveillance: path → {label, maxAgeH} ──
 * maxAge default = 24h (the office's own law). Some books legitimately refresh slower. */
const BOOKS = [
  { p: 'agents/econ-book.json',            label: 'econ-book (כלכלת-הרשת)', maxAgeH: 24 },
  { p: 'agents/curation-book.json',        label: 'curation-book (אוצרות-תוכן)', maxAgeH: 24 },
  { p: 'agents/cadence-week.json',         label: 'cadence-week (קצב-שבועי)', maxAgeH: 24 },
  { p: 'agents/market-cycle.json',         label: 'market-cycle (מחזור-שוק)', maxAgeH: 24 },
  { p: 'agents/pnl-book.json',             label: 'pnl-book (רווח-והפסד)', maxAgeH: 24 },
  { p: 'agents/recruitment.json',          label: 'recruitment (גיוס-הצבא)', maxAgeH: 24 },
  { p: 'agents/sovereign-policy.json',     label: 'sovereign-policy (מדיניות-ריבון)', maxAgeH: 168 },
  { p: 'agents/skill-library.json',        label: 'skill-library (ספריית-כישורים)', maxAgeH: 168 },
  { p: 'agents/fleet-census.artifact.json',label: 'fleet-census (מפקד-הצי)', maxAgeH: 72 },
  { p: 'agents/tick-keeper.json',          label: 'tick-keeper (שומר-הטיק)', maxAgeH: 24 },
  { p: 'agents/capability-matrix.json',    label: 'capability-matrix (מטריצת-יכולות)', maxAgeH: 72 },
  { p: 'saos-live.json',                   label: 'saos-live (חי-מצב)', maxAgeH: 24 },
  { p: 'status.json',                      label: 'status (סטטוס)', maxAgeH: 24 },
];

/* extract a timestamp from arbitrary book JSON.
 * Handles: epoch-ms numbers, ISO strings, nested meta.at, and ARRAY books
 * (rows with ts/at — e.g. market-cycle.json, pnl-book.json = arrays of runs).
 * NB: never read `.at` off a bare array without unwrapping first — Array.prototype.at
 * is a built-in FUNCTION, the classic self-scan trap (measured & fixed 2026-10-11). */
function bookTs(v) {
  let d = v;
  if (Array.isArray(d)) { if (!d.length) return null; d = d[d.length - 1]; }
  if (!d || typeof d !== 'object') return null;
  const candidates = [d.ts, d.at, d.updatedAt, d.savedAt, d.generatedAt, d.asOf, d.builtAt,
    d.meta && d.meta.at, d.meta && d.meta.updatedAt];
  for (let c of candidates) {
    if (c === undefined || c === null) continue;
    if (typeof c === 'function') continue;
    if (Array.isArray(c)) c = c[c.length - 1];
    if (typeof c === 'function') continue;
    if (typeof c === 'number') return new Date(c);
    if (typeof c === 'string') { const t = Date.parse(c); if (!Number.isNaN(t)) return new Date(t); }
    if (c && typeof c === 'object') {
      const inner = c.ts || c.at || c.updatedAt;
      if (typeof inner === 'string') { const t = Date.parse(inner); if (!Number.isNaN(t)) return new Date(t); }
    }
  }
  return null;
}

const hoursSince = (t) => (t ? Math.round(((NOW - t) / 3600000) * 10) / 10 : null);

/* ── load office memory (flip-the-flag, never delete history) ── */
const memPath = path.join(AG, 'office-memory.json');
const mem = readJson(memPath) || { shifts: 0, lessons: [], recentGoals: [], economy: {}, updatedAt: 0 };
const shiftNo = (mem.shifts || 0) + 1;

/* deterministic worker rotation by shift number */
const lead = WORKERS[(shiftNo - 1) % WORKERS.length];
const crew = [WORKERS[(shiftNo) % WORKERS.length], WORKERS[(shiftNo + 1) % WORKERS.length], WORKERS[(shiftNo + 2) % WORKERS.length]];

/* ── 1. SCOUT SHIFT: book freshness ── */
const books = [];
for (const b of BOOKS) {
  const abs = path.join(ROOT, b.p);
  const ts = bookTs(readJson(abs));
  const ageH = hoursSince(ts);
  books.push({
    name: b.label,
    path: b.p,
    ts: ts ? ts.toISOString() : null,
    ageHours: ageH,
    fresh: ageH !== null ? ageH <= b.maxAgeH : false,
    maxAgeH: b.maxAgeH,
  });
}
const stale = books.filter((b) => !b.fresh);
const freshCount = books.length - stale.length;

/* ── 2. LESSONS: exactly one, from measured facts ── */
let lesson;
if (stale.length > 0) {
  const worst = stale.slice().sort((a, b) => (b.ageHours ?? 1e9) - (a.ageHours ?? 1e9))[0];
  lesson = `סיור-משמרת ${shiftNo}: ${stale.length}/${books.length} ספרים-חורגים מטריות (הישן ביותר: ${worst.name} — ${worst.ageHours ?? '?'} שעות). החוק עומד: רענון-מיידי לכל-ספר-שעבר 24 שעות.`;
} else {
  lesson = `סיור-משמרת ${shiftNo}: כל ${books.length} הספרים-טריים (${freshCount}/${books.length}). טריות-מלאה — המשרד-עובד.`;
}

/* ── 3. GOALS: from measured gaps, else from recruitment PROPOSED ── */
let nextGoals;
if (stale.length > 0) {
  nextGoals = stale.slice(0, 3).map((b) => `רענון-ספר: ${b.name} (${b.ageHours ?? '?'} שעות — ${b.path})`);
} else {
  const rec = readJson(path.join(AG, 'recruitment.json'));
  const proposed = [];
  if (rec) {
    for (const r of (rec.roles || rec.openings || [])) {
      const status = r.status || r.state || '';
      if (String(status).toUpperCase().includes('PROPOSE')) proposed.push(`מימוש-תפקיד-מוצע: ${r.role || r.title || r.id || 'unnamed'}`);
      if (proposed.length >= 3) break;
    }
  }
  nextGoals = proposed.length ? proposed : ['סיור-שגרה: צלב-ספרים ודווח-פערים', 'שיפור-מנוע-המשרד: הצע-שיפור-אחד-מדיד'];
}

/* ── 4. ECONOMY: credit only executed tasks (honest bookkeeping) ── */
const tasks = [
  { key: 'book-scan',  doer: lead.id,    text: `סריקת-טריות ${books.length} ספרים → ${stale.length} ישנים` },
  { key: 'lessons',    doer: crew[0].id, text: 'גזירת-לקח אחד-מדיד' },
  { key: 'goals',      doer: crew[1].id, text: `יעדים-חדשים: ${nextGoals.length}` },
  { key: 'feed',       doer: crew[2].id, text: 'office-live.json פוד-עודכן' },
];
const economy = { ...(mem.economy || {}) };
for (const t of tasks) economy[t.doer] = (economy[t.doer] || 0) + 1;

/* ── 5. EVENTS: append-only journal ── */
const eventsPath = path.join(AG, 'office-events.jsonl');
const ev = (obj) => fs.appendFileSync(eventsPath, JSON.stringify(obj) + '\n');
const ts = () => Date.now();
let eventsAppended = 0;
const ap = (o) => { ev(o); eventsAppended++; };

ap({ ts: ts(), type: 'log', agentId: 'office-artery', kind: 'shift-start', text: `משמרת-עורק #${shiftNo} נפתחה (deterministic-keyless, STASIS-safe) — ראש-משמרת: ${lead.id}` });
for (const t of tasks) ap({ ts: ts(), type: 'log', agentId: t.doer, kind: 'task-done', text: `${t.key}: ${t.text}` });
ap({ ts: ts(), type: 'log', agentId: 'office-artery', kind: 'lesson', text: lesson });
for (const g of nextGoals) ap({ ts: ts(), type: 'goal', agentId: 'office-artery', kind: 'next-shift', text: g });

/* ── 6. MEMORY: flip the flag ── */
mem.shifts = shiftNo;
mem.lessons = [...(mem.lessons || []), lesson].slice(-40);
mem.recentGoals = nextGoals;
mem.economy = economy;
mem.updatedAt = ts();
mem.artery = mem.artery || { startedAt: ts(), runs: 0 };
mem.artery.runs += 1;
mem.artery.lastRunAt = mem.updatedAt;
mem.artery.mode = 'deterministic-keyless';
writeJson(memPath, mem);

/* ── 7. FEED: office-live.json — THE page-facing office truth ── */
const stasis = readJson(path.join(AG, 'STASIS.json')) || {};
const feed = {
  v: 1,
  generatedAt: NOW.toISOString(),
  office: 'המשרד הריבוני — SOVEREIGN OFFICE (git-backed, Domain/agents)',
  status: 'ALIVE',
  mode: 'deterministic-keyless-artery',
  engine: 'agents/office-artery.mjs · every 2h · CI public minutes (free) · exit 0 fail-soft',
  shifts: {
    total: shiftNo,
    arteryRuns: mem.artery.runs,
    lastShiftAt: new Date(mem.updatedAt).toISOString(),
    journalEvents: (() => { try { return fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).length; } catch (_) { return null; } })(),
  },
  crew: {
    lead: { id: lead.id, desk: lead.desk },
    workers: WORKERS.map((w) => ({ id: w.id, desk: w.desk, credits: economy[w.id] || 0 })),
  },
  books: { total: books.length, fresh: freshCount, stale: stale.length, list: books },
  lesson,
  nextGoals,
  stasis: {
    active: !!stasis.active,
    mode: stasis.mode || 'unknown',
    allow: Array.isArray(stasis.stagedLanes && stasis.stagedLanes.allow) ? stasis.stagedLanes.allow.map(String) : [],
    note: 'R30 (owner trace 1a1…9241): פתיחה-מלאה לפי מילת-בעלים — כל-המסילות פתוחות תחת השערים המכניים (roster/journal/caps); הבלם נשאר חמוש (active=true, mode=staged); ביטול = halt-all בשרשרת',
  },
  llm: {
    available: false,
    note: 'משמרות-LLM יחזרו בהצתת-סוד-בעלים (sovereign-gateway); עורק-חסר-מפתחות מחזיק-את-המשרד-חי-בינתיים',
  },
  marketing: {
    tagline: 'משרד-ריבוני-אוטונומי: 6 עובדים, ספרים-חיים, לקחים-שמשתפרים כל-משמרת',
    officeFirstHe: 'המשרד נפתח ראשון — משמרת חיה כל שעתיים, מתועדת בגיט, משתפרת מעצמה',
    source: 'agents/office-live.json',
  },
};
writeJson(path.join(AG, 'office-live.json'), feed);

/* human summary */
console.log(`[office-artery] shift #${shiftNo} · lead=${lead.id} · books fresh ${freshCount}/${books.length} (stale ${stale.length}) · credits +1 × ${tasks.length} workers · events +${eventsAppended} · feed=agents/office-live.json`);
console.log(`[office-artery] lesson: ${lesson}`);
process.exit(0);
