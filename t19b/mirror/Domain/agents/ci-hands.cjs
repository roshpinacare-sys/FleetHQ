'use strict';
/**
 * ci-hands.cjs — Task 26 SOVEREIGN CI HANDS (owner directive: "לתת לאוטונומיה
 * הריבונית עוד יכולות ועוד כוח" — study adoption: trycua/cua).
 *
 * What cua taught and what we adopt (mapped honestly to the estate's laws):
 *   - cua's thesis is "give AI agents computers they can use". OUR computer is the
 *     estate itself: git + CI machines + chain rails. The hands below give the fleet
 *     a real ACTUATOR on that computer: it can SEE every lane's health, CLASSIFY
 *     every red, and PROPOSE repairs — the Task 25 method, mechanized into a desk.
 *   - cua's "Computer-Use 2.0" (one task moves across code, APIs, and GUI): we adopt
 *     the code + API layers NOW (this desk is pure API); the GUI layer is a future
 *     rung — tier C, operator-unlocked, booked honestly in CUA-ADOPTION.md.
 *   - cua-bench's contract (result.json + trajectory.json + summary pass-rate):
 *     adopted verbatim — every run books its trajectory, result, and a pass-rate;
 *     a claim without a trajectory is not a value (ANTI-GOODHART).
 *   - cua's Keyvault (keys reach a machine only after approval) = our tier law:
 *     token is env-only, never printed, stderr redacted; keyless floor first.
 *
 * Contract:
 *   - repos: agents/one-bloc-roles.csv (16 rows — ONE source of repos, no re-derivation)
 *   - token: ONE_BLOC_TOKEN || GITHUB_TOKEN || ZIP_PAT (env-only, never printed)
 *   - keyless-first: without a token the public repos (Domain, Console) stay measurable;
 *     the rest are booked UNREACHABLE — never invented reach (KEYLESS-FIRST law)
 *   - classification (pure, eval-pinned E17):
 *       STARTUP-FAILURE — run failed with ZERO jobs (the recruit.yml parse-dead class)
 *       JOB-STARTUP     — job failed <30s with empty steps (transient platform class)
 *       STEP-FAILURE    — a real step failed (actionable)
 *   - lane verdicts: ACTIVE-RED (latest run failed) / RECURRING (>=3 in window) /
 *       SELF-HEALED (failures then latest-2 green) / GREEN / UNREACHABLE
 *   - STASIS: read and booked; these hands are READ-ONLY by construction — safe
 *     under the brake, and the brake state travels with every receipt
 *   - CR discipline: findings are booked as PROPOSALS in this book; opening judged
 *     CRs stays the operator's move (tier law — no auto-self-modification)
 *   - fail-soft: exit 0 always; every failure mode booked, never thrown
 */
const fs = require('fs');
const path = require('path');

const AG = __dirname;
const ROOT = path.resolve(AG, '..');
const OUT_JSON = path.join(AG, 'ci-hands.json');
const OUT_MD = path.join(AG, 'ci-hands.md');
const ROLES_CSV = path.join(AG, 'one-bloc-roles.csv');
const API = 'https://api.github.com';

// ---- pure classifiers (white-box eval surface, E17) ----
function classifyRun(conclusion, event, jobsTotal, stepsLen, durationSec) {
  if (conclusion !== 'failure') return 'NOT-FAILURE';
  if (jobsTotal === 0) return 'STARTUP-FAILURE';          // workflow never parsed/started
  if (stepsLen === 0 && durationSec != null && durationSec < 30) return 'JOB-STARTUP'; // platform transient
  return 'STEP-FAILURE';                                   // a real step failed
}
// laneVerdict: latest by created_at (the runs array is desc — first-seen in a lane wins);
// transient-aware: a green lane whose failures are all startup/platform classes is HISTORY,
// not a recurring defect (the 9/30 incident day must not haunt healthy lanes forever).
function laneVerdict(latestConclusion, failureCount, probedClasses) {
  const classes = probedClasses || [];
  const allTransient = classes.length > 0 && classes.every((c) => c === 'STARTUP-FAILURE' || c === 'JOB-STARTUP');
  if (latestConclusion === 'failure') return (failureCount >= 3 ? 'ACTIVE-RED+RECURRING' : 'ACTIVE-RED');
  if (failureCount >= 3 && allTransient) return 'HISTORY-TRANSIENT';
  if (failureCount >= 3) return 'RECURRING';
  if (failureCount > 0) return 'SELF-HEALED';
  return 'GREEN';
}

function ghFetch(url, token) {
  const headers = { 'User-Agent': 'saos-ci-hands', 'Accept': 'application/vnd.github+json' };
  if (token) headers.Authorization = `token ${token}`;
  return fetch(url, { headers, signal: AbortSignal.timeout(20000) });
}

async function sweep(repo, token, window, trajectory) {
  const row = { repo, status: 'UNREACHABLE', sampled: 0, failures: [], lanes: {} };
  let t0 = Date.now();
  let res;
  try { res = await ghFetch(`${API}/repos/roshpinacare-sys/${repo}/actions/runs?per_page=${window}`, token); }
  catch (e) { row.error = String(e.message || e).slice(0, 80); trajectory.push({ ts: new Date().toISOString(), action: 'list-runs', target: repo, outcome: 'error', ms: Date.now() - t0 }); return row; }
  trajectory.push({ ts: new Date().toISOString(), action: 'list-runs', target: repo, outcome: res.status, ms: Date.now() - t0 });
  if (res.status === 404 || res.status === 403 || res.status === 401) { row.reason = `HTTP ${res.status}`; return row; }
  if (!res.ok) { row.reason = `HTTP ${res.status}`; return row; }
  let data;
  try { data = await res.json(); } catch (e) { row.error = 'bad-json'; return row; }
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  row.status = 'REACHED'; row.sampled = runs.length;
  const failures = runs.filter((r) => r.conclusion === 'failure');
  // lanes keyed by workflow PATH — startup-failure runs carry the path as their display
  // name, so name-keying splits one workflow into a healthy lane and a ghost lane
  // (Task 26 self-catch, fixed before landing). Array is created_at DESC: first-seen
  // per lane = the lane's true latest.
  const byLane = {};
  for (const r of runs) {
    const key = r.path || r.name || '?';
    if (!byLane[key]) byLane[key] = { display: (r.name || r.path || '?'), latest: r.conclusion, latestAt: r.created_at, failureCount: 0, classes: {} };
    if (r.conclusion === 'failure') byLane[key].failureCount++;
  }
  // classify up to 6 most recent failures (budget: one jobs call each)
  let probed = 0;
  for (const f of failures.slice(0, 6)) {
    const key = f.path || f.name || '?';
    t0 = Date.now();
    let jobsTotal = null, stepsLen = null, durationSec = null;
    try {
      const jr = await ghFetch(`${API}/repos/roshpinacare-sys/${repo}/actions/runs/${f.id}/jobs`, token);
      trajectory.push({ ts: new Date().toISOString(), action: 'probe-jobs', target: `${repo}/${f.id}`, outcome: jr.status, ms: Date.now() - t0 });
      if (jr.ok) {
        const jd = await jr.json();
        jobsTotal = jd.total_count != null ? jd.total_count : (Array.isArray(jd.jobs) ? jd.jobs.length : null);
        const job0 = Array.isArray(jd.jobs) && jd.jobs[0];
        if (job0) {
          stepsLen = Array.isArray(job0.steps) ? job0.steps.length : null;
          if (job0.started_at && job0.completed_at) durationSec = Math.round((Date.parse(job0.completed_at) - Date.parse(job0.started_at)) / 1000);
        }
      }
    } catch (_) { trajectory.push({ ts: new Date().toISOString(), action: 'probe-jobs', target: `${repo}/${f.id}`, outcome: 'error', ms: Date.now() - t0 }); }
    const cls = classifyRun(f.conclusion, f.event, jobsTotal, stepsLen, durationSec);
    if (byLane[key]) byLane[key].classes[f.id] = cls;
    row.failures.push({ id: f.id, lane: key, event: f.event, at: f.created_at, class: cls });
    probed++;
    if (probed >= 6) break;
  }
  // lane verdicts + estate-relevant rollup
  const lanes = {};
  for (const [key, v] of Object.entries(byLane)) {
    const classes = Object.values(v.classes);
    const verdict = laneVerdict(v.latest, v.failureCount, classes);
    lanes[key] = { display: v.display, latest: v.latest, latestAt: v.latestAt, failures: v.failureCount, verdict, classes: v.classes };
  }
  row.lanes = lanes;
  return row;
}

async function main() {
  const at = new Date().toISOString();
  const trajectory = [];
  const token = process.env.ONE_BLOC_TOKEN || process.env.GITHUB_TOKEN || process.env.ZIP_PAT || '';
  const window = 30;
  const stasis = (() => { try { return JSON.parse(fs.readFileSync(path.join(AG, 'STASIS.json'), 'utf8')); } catch (_) { return null; } })();
  // repos from the ONE source (one-bloc-roles.csv), quote-aware (roles contain commas)
  let repos = [];
  try {
    const text = fs.readFileSync(ROLES_CSV, 'utf8');
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    repos = rows.slice(1).filter((r) => r[0]).map((r) => r[0]);
  } catch (_) {}
  const t0 = Date.now();
  const results = [];
  for (const repo of repos) results.push(await sweep(repo, token, window, trajectory));
  const ms = Date.now() - t0;
  const reached = results.filter((r) => r.status === 'REACHED');
  const lanes = reached.flatMap((r) => Object.entries(r.lanes).map(([lane, v]) => ({ repo: r.repo, lane, ...v })));
  const green = lanes.filter((l) => l.verdict === 'GREEN').length;
  const activeRed = lanes.filter((l) => l.verdict.startsWith('ACTIVE-RED')).length;
  const selfHealed = lanes.filter((l) => l.verdict === 'SELF-HEALED').length;
  const historyTransient = lanes.filter((l) => l.verdict === 'HISTORY-TRANSIENT').length;
  const recurring = lanes.filter((l) => l.verdict === 'RECURRING').length;
  const startupFailures = lanes.flatMap((l) => Object.entries(l.classes).filter(([, c]) => c === 'STARTUP-FAILURE').map(([id]) => ({ repo: l.repo, lane: l.lane, id })));
  const passRate = lanes.length ? Math.round((green / lanes.length) * 100) : null;
  const book = {
    ok: true, at, ms,
    agent: 'ci-hands v1.0.0 (Task 26 — trycua/cua adoption: the fleet gets HANDS on its own CI estate; cua-bench contract: trajectory + result + pass-rate; read-only actuator, STASIS-safe, tier law kept)',
    reposDeclared: repos.length, reposReached: reached.length, reposUnreachable: results.length - reached.length,
    window, sampledRuns: reached.reduce((s, r) => s + r.sampled, 0),
    lanes: lanes.length, green, activeRed, selfHealed, historyTransient, recurring, startupFailures: startupFailures.length,
    passRate, stasis: { parseable: !!stasis && typeof stasis.active === 'boolean', active: stasis ? stasis.active : null },
    tokenMode: token ? 'env-token (redacted)' : 'keyless',
    proposals: lanes.filter((l) => l.verdict.startsWith('ACTIVE-RED')).map((l) => `${l.repo}/${l.lane}: ${l.verdict} — diagnose via jobs+logs (Task 25 method), fix, prove by dispatch/push`),
    results, trajectory,
    verdict: reached.length === repos.length && passRate != null ? `CI-HANDS REACHED ${reached.length}/${repos.length} · lanes ${green}/${lanes.length} green (${passRate}%) · ${activeRed} active-red · ${startupFailures.length} startup-failures` : `CI-HANDS keyless floor: ${reached.length}/${repos.length} reached — the rest booked UNREACHABLE (never invented)`
  };
  try { fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1) + '\n'); } catch (_) {}
  const md = ['# CI Hands — the fleet\'s hands on its own CI estate (trycua/cua adoption)', '', `_ci-hands v1.0.0 · ${at} · ${book.tokenMode} · stasis ${book.stasis.parseable ? (book.stasis.active ? 'BRAKE ON' : 'armed/free') : 'unparseable'}_`, '', `**${book.verdict}**`, ''];
  md.push('| repo | lanes | green | active-red | self-healed | history-transient | verdict |');
  md.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (r.status !== 'REACHED') { md.push(`| ${r.repo} | — | — | — | — | — | ${r.status}${r.reason ? ' (' + r.reason + ')' : ''} |`); continue; }
    const lv = Object.values(r.lanes);
    md.push(`| ${r.repo} | ${lv.length} | ${lv.filter((v) => v.verdict === 'GREEN').length} | ${lv.filter((v) => v.verdict.startsWith('ACTIVE-RED')).length} | ${lv.filter((v) => v.verdict === 'SELF-HEALED').length} | ${lv.filter((v) => v.verdict === 'HISTORY-TRANSIENT').length} | measured |`);
  }
  if (book.proposals.length) { md.push('', '**Proposals (booked, not auto-opened — tier law):**'); for (const p of book.proposals) md.push(`- ${p}`); }
  md.push('', '_cua-bench contract adopted: this book IS the summary.json; results + trajectory are in ci-hands.json. GUI layer = future tier-C rung (CUA-ADOPTION.md)._');
  try { fs.writeFileSync(OUT_MD, md.join('\n') + '\n'); } catch (_) {}
  console.log(`ci-hands: reached ${reached.length}/${repos.length} · lanes ${green}/${lanes.length} green · ${activeRed} active-red · ${startupFailures.length} startup-failures · ${book.tokenMode}`);
  process.exit(0);
}

if (require.main === module) main().catch(() => process.exit(0));
module.exports = { classifyRun, laneVerdict };
