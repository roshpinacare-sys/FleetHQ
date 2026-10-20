// sovereign/stack/runtime/run-scores.mjs — Layer 3 of the Ultimate Sovereign Stack.
// The aeon `skill-health` organ, estate-authored: reads network/STATE.json (the
// selfscan's committed book — zero extra API load for the bulk), scores every
// workflow, and for CRITICAL ones re-fetches a bounded 20-run window from the
// Actions API to compute a real success-rate + flakiness score.
// Writes: runtime/scores.json + runtime/RUNSCORES.md + runtime/skills.json (the
// aeon-style skill registry of the whole fleet).
// Law: measurement duty -> exit 0 always. RED lives in the book.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const HOME = process.cwd();
const DIR = `${HOME}/sovereign/stack/runtime`;
const OWNER = 'roshpinacare-sys';
const TOKEN = process.env.GITHUB_TOKEN || process.env.SOVEREIGN_PAT;
const REPOS = ['FleetHQ', 'Domain', 'Console', 'saos-runtime', 'Autonomy', 'sovereign-lighthouse'];
const RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local';
const stamp = new Date().toISOString();

function gh(path) {
  return fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sovereign-run-scores' }
  }).then(async r => { if (!r.ok) throw new Error(`${path} -> ${r.status}`); return r.json(); });
}

// ---- load the selfscan book
if (!existsSync(`${HOME}/network/STATE.json`)) {
  console.log('no network/STATE.json yet (selfscan has not flown) — honest empty run');
  writeFileSync(`${DIR}/scores.json`, JSON.stringify({ protocol: 'SAOS-RUN-SCORES/1', generatedAt: stamp, runUrl: RUN_URL, note: 'no STATE book yet', workflows: [] }, null, 2) + '\n');
  process.exit(0);
}
const state = JSON.parse(readFileSync(`${HOME}/network/STATE.json`, 'utf8'));
const wfMap = state.workflows || {};
const now = Date.now();

// ---- classify from the book
const rows = [];
for (const [key, meta] of Object.entries(wfMap)) {
  const [repo, name] = key.split('|');
  const lastRun = meta.lastRun ? Date.parse(meta.lastRun) : null;
  const ageMin = lastRun ? Math.round((now - lastRun) / 60000) : null;
  const concl = meta.lastConcl || '—';
  let cls = 'unknown';
  if (meta.state === 'disabled_manually') cls = 'disabled';
  else if (concl && !['—', 'success', 'skipped'].includes(concl)) cls = 'critical';
  else if (concl === 'success') cls = ageMin != null && ageMin > 2880 ? 'watch' : 'healthy';
  rows.push({ repo, name, cls, lastConcl: concl, lastRun: meta.lastRun || null, ageMin, state: meta.state || 'active' });
}

// ---- deepen CRITICAL ones with a bounded real window (max 12 repos-worth of fetches)
let fetches = 0;
const FETCH_BUDGET = 12;
for (const r of rows.filter(r => r.cls === 'critical')) {
  if (fetches >= FETCH_BUDGET || !TOKEN) { r.window = 'budget-or-token-exhausted'; continue; }
  try {
    fetches++;
    const runs = await gh(`/repos/${OWNER}/${r.repo}/actions/workflows?per_page=100`).then(d => (d.workflows || []).find(w => w.name === r.name)).then(wf => wf ? gh(`/repos/${OWNER}/${r.repo}/actions/workflows/${wf.id}/runs?per_page=20`) : null);
    if (!runs) { r.window = 'workflow-id-unresolved'; continue; }
    const arr = runs.workflow_runs || [];
    const ok = arr.filter(x => x.conclusion === 'success').length;
    const rate = arr.length ? ok / arr.length : null;
    r.window = { runs: arr.length, successRate: rate, flakiness: arr.length ? Number((1 - rate).toFixed(3)) : null };
    r.cls = rate != null && rate < 0.5 ? 'critical' : (rate != null && rate < 0.9 ? 'flaky' : 'watch');
  } catch (e) { r.window = `fetch-failed: ${e.message}`; }
}

// ---- scores book
const counts = rows.reduce((m, r) => { m[r.cls] = (m[r.cls] || 0) + 1; return m; }, {});
const scores = { protocol: 'SAOS-RUN-SCORES/1', generatedAt: stamp, runUrl: RUN_URL, stateBookAgeMin: Math.round((now - Date.parse(state.generatedAt)) / 60000), counts, apiFetches: fetches, workflows: rows };
try { writeFileSync(`${DIR}/scores.json`, JSON.stringify(scores, null, 2) + '\n'); } catch (e) { console.error('write scores failed (defer-not-fail):', e.message); }

// ---- skills.json (the aeon-style fleet registry: every workflow is a skill entry)
const skills = rows.map(r => ({
  name: r.name, repo: r.repo, schedule: 'cron-managed', mode: /pulse|worldbeat|window|publish|ledger|beat|scan|patrol|triage|decider|harness|identity|policy/i.test(r.name) ? 'write' : 'read-only',
  health: r.cls, lastConcl: r.lastConcl, lastRun: r.lastRun
}));
try { writeFileSync(`${DIR}/skills.json`, JSON.stringify({ protocol: 'SAOS-SKILLS/1 (aeon aeon.yml equivalent)', generatedAt: stamp, strategy: 'sovereign/stack/runtime/STRATEGY.md', skills }, null, 2) + '\n'); } catch {}

// ---- RUNSCORES.md (the harness dashboard section)
const lines = [];
lines.push('# RUNSCORES — the harness scoring book');
lines.push('');
lines.push(`- generatedAt: \`${stamp}\``);
lines.push(`- STATE book age: ${scores.stateBookAgeMin}min · api fetches: ${fetches}`);
lines.push(`- counts: ${JSON.stringify(counts)}`);
lines.push('');
lines.push('| repo | workflow | class | lastConcl | lastRun |');
lines.push('|---|---|---|---|---|');
for (const r of rows.sort((a, b) => a.cls.localeCompare(b.cls)).slice(0, 200)) {
  lines.push(`| ${r.repo} | ${r.name} | ${r.cls} | ${r.lastConcl} | ${r.lastRun || '—'} |`);
}
lines.push('');
try { writeFileSync(`${DIR}/RUNSCORES.md`, lines.join('\n')); } catch {}

console.log(`run-scores: ${JSON.stringify(counts)} (fetches=${fetches})`);
process.exit(0);
