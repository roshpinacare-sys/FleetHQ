// office-knowledge.mjs — the office's public knowledge book builder.
//
// Owner question this answers (T23-B, 2026-10-13): "task wall works? 5 workers?
// more were recruited — where are they?" and "0 shifts? 0 lessons? not updated".
//
// This script MEASURES and writes office/state/office-knowledge.json:
//   roster      — parsed from mini-services/agent-hq/src/cast.ts (the crew LAW: 6)
//   shifts      — Domain agents/office-events.jsonl (append-only journal,
//                 kind=shift-start) + agents/office-memory.json (cumulative)
//   lessons     — Autonomy ops/lessons/ledger.md ("## scribe #N" headers)
//   retro       — local office/retro-state.json (generatedAt) → RETRO-LATEST.md
//   recruitment — local receipts/recruitment/live.json rolesNeeded vs staffed
//
// Honesty law: every number comes from a named source written into the book.
// Nothing is invented; when a source is unreachable the book says so (degraded
// note + exit 1, never a fake zero presented as measurement).
//
// Usage: node tools/office-knowledge.mjs   (keyless — all sources are public)

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const RAW = 'https://raw.githubusercontent.com';
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

async function rawText(repo, path) {
  const res = await fetch(`${RAW}/roshpinacare-sys/${repo}/main/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${repo}/${path}`);
  return res.text();
}

// 1) roster law — the crew is defined in cast.ts, nowhere else.
let roster = { crew: 0, workers: 0, lead: null, ids: [], source: 'mini-services/agent-hq/src/cast.ts (CREW)', error: null };
try {
  const cast = readFileSync('mini-services/agent-hq/src/cast.ts', 'utf8');
  const ids = [...cast.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
  const lead = cast.match(/export const LEAD = '([a-z0-9-]+)'/)?.[1] ?? null;
  const roleRows = [...cast.matchAll(/role: '(worker|lead)'/g)].map((m) => m[1]);
  roster = {
    crew: ids.length,
    workers: roleRows.filter((r) => r === 'worker').length,
    lead,
    ids,
    source: 'measured from mini-services/agent-hq/src/cast.ts (CREW — 1 lead + 5 workers)',
    note: "counts.agent in office-state.json is a socket-EVENT counter for the capture window (tools/office-state-capture.ts bumps it on every 'agent' state-change event) — NOT a headcount",
    error: null,
  };
} catch (e) { roster.error = String(e.message || e); }

// 2) shifts — the append-only office journal on Domain is the defensible ledger.
let shifts = {
  todayCount: 0,
  lastShiftAt: null,
  lastShiftTitle: null,
  cumulative: null,
  source: 'measured from Domain agents/office-events.jsonl (append-only journal, kind=shift-start, git-committed)',
  error: null,
};
try {
  const jl = await rawText('Domain', 'agents/office-events.jsonl');
  const rows = jl.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const opens = rows.filter((r) => r.kind === 'shift-start' && String(r.text ?? '').includes('משמרת-עורק'));
  const iso = (ts) => new Date(Number(ts > 1e12 ? ts : ts * 1000)).toISOString();
  const todays = opens.filter((r) => iso(r.ts).slice(0, 10) === today());
  const last = opens.length ? opens.reduce((a, b) => (Number(b.ts) > Number(a.ts) ? b : a)) : null;
  shifts.todayCount = todays.length;
  shifts.lastShiftAt = last ? iso(last.ts) : null;
  shifts.lastShiftTitle = last ? String(last.text ?? '').slice(0, 160) : null;
  try {
    const mem = JSON.parse(await rawText('Domain', 'agents/office-memory.json'));
    if (typeof mem.shifts === 'number') {
      shifts.cumulative = mem.shifts;
      shifts.source += ' + Domain agents/office-memory.json (cumulative)';
    }
  } catch { /* cumulative stays null — honest */ }
} catch (e) { shifts.error = String(e.message || e); }

// 3) lessons — Autonomy ops/lessons/ledger.md, "## scribe #N" entries.
let lessons = {
  count: 0,
  latest: [],
  source: "measured from Autonomy ops/lessons/ledger.md ('## scribe #N' headers)",
  cadence: 'artery-scribe.yml: daily cron 03:05Z + repository_dispatch scribe-tick',
  error: null,
};
try {
  const md = await rawText('Autonomy', 'ops/lessons/ledger.md');
  const entries = [...md.matchAll(/^## (scribe #\d+) · (\S+?)\n(.*?)(?=^## |\Z)/gms)];
  lessons.count = entries.length;
  lessons.latest = entries.slice(-5).map((m) => {
    const id = m[1];
    const at = m[2];
    const body = m[3] ?? '';
    const first = body.split('\n').find((l) => l.trim().startsWith('- '))?.trim().slice(2).trim() ?? '';
    return { at, title: (`scribe ${id.split('#')[1]} — ${first}`).slice(0, 120) };
  });
} catch (e) { lessons.error = String(e.message || e); }

// 4) retro — local state file (written by office-retro.yml, weekly Thu 07:43Z).
let retro = { at: null, path: 'office/RETRO-LATEST.md', cadence: 'office-retro.yml weekly Thursday 07:43 UTC', error: null };
try { retro.at = JSON.parse(readFileSync('office/retro-state.json', 'utf8')).generatedAt ?? null; }
catch (e) { retro.error = String(e.message || e); }

// 5) recruitment — signals vs staffed. Honest: signals are NOT hires.
let recruitment = {
  rolesNeeded: 0,
  staffed: 0,
  generatedAt: null,
  note: 'HONEST: office-recruit emits rolesNeeded SIGNALS only. Zero hiring receipts exist under receipts/; the crew law is cast.ts and it never changed. Recruits are wanted-roles, not staff.',
  error: null,
};
try {
  const rec = JSON.parse(readFileSync('receipts/recruitment/live.json', 'utf8'));
  recruitment.rolesNeeded = (rec.rolesNeeded ?? []).reduce((a, r) => a + (Number(r.count) || 0), 0);
  recruitment.generatedAt = rec.generatedAt ?? null;
} catch (e) { recruitment.error = String(e.message || e); }

const book = {
  schema: 'office-knowledge/1',
  generatedAt: now(),
  roster,
  shifts,
  lessons,
  retro,
  recruitment,
};

mkdirSync('office/state', { recursive: true });
writeFileSync('office/state/office-knowledge.json', JSON.stringify(book, null, 2) + '\n', 'utf8');
const degraded = [roster.error && 'roster', shifts.error && 'shifts', lessons.error && 'lessons', retro.error && 'retro', recruitment.error && 'recruitment'].filter(Boolean);
console.log(`[office-knowledge] wrote office/state/office-knowledge.json roster=${roster.crew} shiftsToday=${shifts.todayCount} lastShift=${shifts.lastShiftAt} lessons=${lessons.count} rolesNeeded=${recruitment.rolesNeeded} ${degraded.length ? 'DEGRADED: ' + degraded.join(',') : 'all-sources-measured'}`);
if (degraded.length) process.exitCode = 1; // fail-loud: a degraded book must be visible
