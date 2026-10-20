#!/usr/bin/env node
/**
 * TWIN-ISSUE-GATE (R22, CR-0051) — the twin-audit alarm, rebuilt as a Node desk.
 *
 * WHY THIS FILE EXISTS: the old gate was inline bash with embedded node -e JS. The JS
 * used BACKTICKS inside a double-quoted bash string — bash executed them as command
 * substitution and the step died with `syntax error near unexpected token 'done'`.
 * Result: the watchdog DETECTED a real regression (money-console-domain lost evidence)
 * on its first scheduled run and could never tell anyone — alarm silenced since day one.
 * Lesson booked: an alarm built of quoting tricks is not an alarm, it is a liability.
 *
 * LAWS:
 *  · reads the marker file (path from TWIN_ISSUE_MARKER, default /tmp/twin-issue.json)
 *  · marker missing            → "no gate marker", exit 0 (clean run)
 *  · marker unparseable        → FAIL LOUD (exit 1) — a corrupt alarm is a defect
 *  · fire=false                → print the clean counts, exit 0
 *  · fire=true                 → build the body (buildIssueBody, exported for E42) and
 *                                POST one issue; GH_TOKEN first, ZIP_PAT fallback;
 *                                HTTP 201 → "issue opened", exit 0
 *  · both tokens fail          → honest recorded line, exit 0 (the committed report is
 *                                the receipt; the next scheduled run retries the alarm)
 *  · zero secret material is ever printed; tokens are read from env only
 */
const fs = require('fs');
const https = require('https');

const MARKER = process.env.TWIN_ISSUE_MARKER || '/tmp/twin-issue.json';

/** pure: marker → { fire, title, body } | null (no-fire) — exported for E42 */
function buildIssueBody(marker) {
  if (!marker || typeof marker !== 'object') throw new Error('marker-not-an-object');
  const unknown = Array.isArray(marker.unknownNearDups) ? marker.unknownNearDups : [];
  const lost = Array.isArray(marker.lostEvidence) ? marker.lostEvidence : [];
  if (!marker.fire) return null;
  const lines = [];
  for (const u of unknown) {
    const page = u && u.page ? String(u.page) : 'unknown-page';
    const j = u && u.jaccard5 !== undefined ? String(u.jaccard5) : '?';
    lines.push('- UNKNOWN near-dup pair: "' + page + '" at Jaccard ' + j);
  }
  for (const l of lost) lines.push('- DIFFERENTIATED pair lost its capability evidence: "' + String(l) + '"');
  const body = 'twin-audit ' + new Date().toISOString().slice(0, 10) + '\n\n' +
    (lines.length ? lines.join('\n') : '- gate fired with no rows (defect in the audit writer)') +
    '\n\nRegistry: agents/twin-registry.json. Fix = give each side one distinct real function, then register it.\n' +
    '\n_' + unknown.length + ' unknown near-dups, ' + lost.length + ' lost-evidence rows._';
  return {
    fire: true,
    title: 'twin-audit: near-duplication detected ' + new Date().toISOString().slice(0, 10),
    body,
  };
}

function postIssue(token, repo, title, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ title, body });
    const req = https.request({
      hostname: 'api.github.com', path: '/repos/' + repo + '/issues', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
        Authorization: 'token ' + token, 'User-Agent': 'saos-twin-issue-gate', Accept: 'application/vnd.github+json',
      },
      timeout: 20000,
    }, (res) => { res.resume(); resolve({ status: res.statusCode }); });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: String(e.message || e).slice(0, 90) }));
    req.write(payload); req.end();
  });
}

async function main() {
  if (!fs.existsSync(MARKER)) { console.log('no gate marker'); return 0; }
  let marker;
  try { marker = JSON.parse(fs.readFileSync(MARKER, 'utf8')); }
  catch (e) { console.error('GATE-DEFECT: marker unparseable (' + String(e.message).slice(0, 90) + ') — failing loud, an unreadable alarm is a defect'); return 1; }
  const built = buildIssueBody(marker);
  if (!built) {
    const u = (marker.unknownNearDups || []).length, l = (marker.lostEvidence || []).length;
    console.log('gate clean - no issue (' + u + ' unknown near-dups, lostEvidence ' + l + ')');
    return 0;
  }
  const repo = process.env.GITHUB_REPOSITORY || 'roshpinacare-sys/Domain';
  for (const token of [process.env.GH_TOKEN, process.env.ZIP_PAT]) {
    if (!token) continue;
    const r = await postIssue(token, repo, built.title, built.body);
    if (r.status === 201) { console.log('issue opened'); return 0; }
    console.log('issue attempt failed (HTTP ' + r.status + (r.error ? ' ' + r.error : '') + ')');
  }
  console.log('could not open the issue with either token - recorded honestly here; the committed report is the receipt');
  return 0;
}

if (require.main === module) main().then((c) => process.exit(c)).catch((e) => { console.error('gate crashed:', String(e.message || e).slice(0, 120)); process.exit(1); });
module.exports = { buildIssueBody };
