#!/usr/bin/env node
/* SCHEDULER-COLLECT (CR-0056, fleet Rung 27 — THE METRONOME AUDIT, collector side) —
 * the raw scheduled-run census that feeds agents/scheduler-audit.cjs.
 *
 * WHY THIS FILE EXISTS: the fleet discovered (R27 audit, booked in the rung) that
 * GitHub's scheduler stopped registering/firing scheduled events on this repo —
 * every workflow whose schedule was added after 2026-10-03T18:36Z has ZERO scheduled
 * runs ever (fill-ledger-cron, market-grid-cron, fleet-census-cron, sovereign-tick-cron,
 * earn-audit-cron, tick-keeper — all alive only via keeper-arc hand-dispatches), and
 * even the old 30-min grid-trigger-twin schedule stopped at 18:36:46Z. The fleet's
 * answer is to MEASURE its own time instead of trusting the platform: this collector
 * gathers the raw evidence (per scheduled workflow: cron expressions + the timestamps
 * of its actual scheduled runs), and the pure desk (scheduler-audit.cjs) turns it into
 * a deterministic book with per-workflow verdicts, the repo-wide scheduler boundary,
 * and the bounded heal list.
 *
 * LAWS:
 *  · KEYLESS — runs on the built-in GITHUB_TOKEN (env GH_TOKEN). No owner-secret material.
 *  · fail-soft per workflow — an API error books scheduledRuns:null with the error note;
 *    the desk treats null as UNMEASURED and NEVER invents starvation from an error.
 *  · bounded — per_page=100, one runs-call per scheduled workflow, sequential, exit 0.
 *  · no secrets printed; the token is read from env only.
 *
 * Seam: SCHEDULER_COLLECT_SKIP=1 no-ops. Output: agents/scheduler-raw.json
 * (format SAOS-SCHEDULER-RAW/1, sorted by file, windowFrom = now-24h, windowTo = now).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');
const OUT = path.join(ROOT, 'agents', 'scheduler-raw.json');
const REPO = process.env.GITHUB_REPOSITORY || 'roshpinacare-sys/Domain';
const WINDOW_HOURS = 24;
const CRON_RE = /cron:\s*['"]([^'"]+)['"]/g;

function getJson(token, apiPath) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers: {
        Authorization: 'token ' + token,
        'User-Agent': 'saos-scheduler-collect',
        Accept: 'application/vnd.github+json',
      },
      timeout: 20000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve({ err: 'HTTP ' + res.statusCode }); return; }
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ err: 'unparseable' }); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ err: String(e.message || e).slice(0, 90) }));
    req.end();
  });
}

function cronsOf(text) {
  const out = [];
  let m;
  CRON_RE.lastIndex = 0;
  while ((m = CRON_RE.exec(text))) {
    const expr = String(m[1] || '').trim();
    if (expr) out.push(expr);
  }
  return out;
}

async function main() {
  if (process.env.SCHEDULER_COLLECT_SKIP === '1') { console.log('SCHEDULER-COLLECT SKIP (SCHEDULER_COLLECT_SKIP=1)'); return; }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  let files = [];
  try { files = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)).sort(); } catch (_) { files = []; }
  const scheduled = [];
  for (const f of files) {
    let text = '';
    try { text = fs.readFileSync(path.join(WF_DIR, f), 'utf8'); } catch (_) { continue; }
    const crons = cronsOf(text);
    if (crons.length > 0) scheduled.push({ file: f, crons });
  }
  const now = Date.now();
  const windowFrom = new Date(now - WINDOW_HOURS * 3600_000).toISOString();
  const windowTo = new Date(now).toISOString();
  const rows = [];
  for (const { file, crons } of scheduled) {
    const r = await getJson(token, `/repos/${REPO}/actions/workflows/${file}/runs?per_page=100&event=schedule`);
    if (r.err) {
      rows.push({ file, crons, scheduledRuns: null, error: r.err });
      console.log(`SCHEDULER-COLLECT ${file}: UNMEASURED (${r.err})`);
      continue;
    }
    const ts = (r.workflow_runs || []).map((x) => x && x.created_at).filter((t) => typeof t === 'string').sort();
    rows.push({ file, crons, scheduledRuns: ts });
    console.log(`SCHEDULER-COLLECT ${file}: ${ts.length} scheduled runs${ts.length ? ' · last ' + ts[ts.length - 1] : ' EVER'}`);
  }
  const raw = {
    format: 'SAOS-SCHEDULER-RAW/1',
    agent: 'scheduler-collect',
    repo: REPO,
    windowFrom,
    windowTo,
    workflows: rows,
  };
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(raw, null, 1) + '\n');
  fs.renameSync(tmp, OUT);
  console.log(`SCHEDULER-COLLECT raw booked: ${rows.length} scheduled workflows · window ${windowFrom} → ${windowTo}`);
}

try { main().catch((e) => { console.log('SCHEDULER-COLLECT ERROR (fail-soft): ' + String(e.message || e).slice(0, 120)); process.exitCode = 0; }); } catch (e) { console.log('SCHEDULER-COLLECT ERROR (fail-soft): ' + String(e.message || e).slice(0, 120)); process.exitCode = 0; }
module.exports = { cronsOf };
