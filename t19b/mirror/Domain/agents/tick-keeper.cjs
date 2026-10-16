'use strict';
/**
 * tick-keeper.cjs — THE SELF-HEALING PULSE (Z-70, CR-0048).
 *
 * MEASURED TRUTH (2026-10-03, keyless GitHub API): GitHub's scheduler STARVES this
 * repo — sovereign-tick-cron (:12/:42) and earn-audit-cron (:07/:37) registered ZERO
 * schedule events since arming (3 runs, all workflow_dispatch), while scheduled runs
 * that DO fire arrive ~hours late (treasury-route 16:20 slot ran 20:09; economy-engine
 * 20:17 slot ran 20:06). A cadence that cannot be trusted is not a cadence. Dispatches,
 * by contrast, start in ~15-30s (measured: dispatch 21:15:04Z → decision 21:15:22Z).
 *
 * THE LAW: the keeper measures the reflex arc's OWN receipts (decisions jsonl, earn
 * audit, fill ledger — pushed to main by the desks themselves) and RE-FIRES any desk
 * whose book went stale, via workflow_dispatch with a PAT (PAT events DO trigger
 * workflows — the GITHUB_TOKEN recursion block does not apply).
 *
 *   read arc receipts → keeperDecide (pure) → dispatch stale desks (cooldown, STASIS
 *   obeyed) → book agents/tick-keeper.json + .md → publish [skip ci].
 *
 * LAWS: STASIS first (FATE-DEFENSE #1 — the healer obeys the breaker too) ·
 * cooldown per desk (agents/tick-keeper.json is the only memory) · token env-only,
 * never printed · single writer (this desk writes ONLY its two book files) ·
 * fail-soft exit 0 with fail-loud book · require.main guard (Z-49).
 *
 * Env: TICK_KEEPER_JSON (out), KEEPER_GH_TOKEN || GITHUB_TOKEN (dispatch), REPO
 *      (owner/name, default roshpinacare-sys/Domain), TICK_KEEPER_SKIP=1 (eval off-switch)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.TICK_KEEPER_JSON || path.join(ROOT, 'agents', 'tick-keeper.json');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');
const STASIS_JSON = process.env.STASIS_JSON || path.join(ROOT, 'agents', 'STASIS.json');
const REPO = process.env.KEEPER_REPO || 'roshpinacare-sys/Domain';

// the reflex arc: desk → (watched receipt, staleness law)
// R22 (CR-0051) THE RESURRECTION ARC: measured Z-71 (GitHub API 2026-10-03) — 4 workflows
// with cron entries have ZERO scheduled events ever (sovereign-tick, earn-audit, census,
// market-grid) — the scheduler registers them and starves them; plus twin-audit (false-alarm
// bug R22-fixed) and self-audience (push-race bug R22-fixed) failed their last runs. The
// keeper now watches EVERY desk that matters, with per-desk staleness AND per-desk
// cooldown (a daily desk is retried every 4h, not stormed every 20m).
const ARC = {
  'sovereign-tick-cron': { receipt: 'agents/sovereign-decisions.jsonl', max_gap_min: 20 }, // 30-min cadence → stale at 20
  'earn-audit-cron':     { receipt: 'agents/earn-audit.json',              max_gap_min: 45 },
  'fill-ledger-cron':    { receipt: 'agents/fill-ledger.json',             max_gap_min: 45 }, // never scheduled by GitHub (0 runs Z-71) — the keeper is its heartbeat until the scheduler heals
  'market-grid-cron.yml':    { receipt: 'agents/market-grid.json',                  max_gap_min: 45,   cooldown_min: 60  },
  'fleet-census-cron.yml':   { receipt: 'agents/fleet-census.json',                 max_gap_min: 1560, cooldown_min: 240 }, // daily 02:14
  'twin-audit.yml':          { receipt: 'twin-audit/latest.json',                   max_gap_min: 1560, cooldown_min: 240 }, // daily 06:19
  'self-audience.yml':       { receipt: 'agents/receipts/self-audience-receipt.json', max_gap_min: 1560, cooldown_min: 240 }, // daily
  'public-pulse.yml':        { receipt: 'agents/pulse-book.json',                   max_gap_min: 1560, cooldown_min: 240 }, // daily
  'audience-analyst.yml':    { receipt: 'audience/latest.json',                     max_gap_min: 1560, cooldown_min: 240 }, // daily 05:31
};
for (const k of Object.keys(ARC)) if (!ARC[k]) delete ARC[k]; // the resurrection arc must never carry ghost rows
const COOLDOWN_MIN = 20; // per-desk re-dispatch floor — a broken desk is retried, not stormned

// ── pure core (exported for E39) ─────────────────────────────────────────────
// arc: { desk: last_ts|null } · cooldownBook: { desk: last_dispatch_ts|null }
function keeperDecide({ now, arc = {}, cooldownBook = {}, maxGaps = {}, cooldownMin = COOLDOWN_MIN }) {
  const t = Date.parse(now);
  const decided = [], skipped = [];
  // R22 purity law: judge the PASSED arc — main() passes the full Object.keys(ARC) arc
  // (null values = no receipt yet), and a narrower arc gets a narrower judgment (E40b's
  // synthetic 3-desk cases stay exact). AN EMPTY arc means "no receipts at all anywhere"
  // — the never-born fleet view: the whole registry is judged with null timestamps.
  const desks = Object.keys(arc).length ? Object.keys(arc) : Object.keys(ARC);
  for (const desk of desks) {
    const a = ARC[desk] || {};
    const lastTs = arc[desk] || null;
    const maxGap = maxGaps[desk] != null ? maxGaps[desk] : a.max_gap_min;
    const cd = cooldownBook[desk] ? Date.parse(cooldownBook[desk]) : 0;
    const cdMin = a.cooldown_min || cooldownMin; // R22: per-desk cooldown — daily desks are retried every 4h, not stormed
    if (cd && (t - cd) / 6e4 < cdMin) { skipped.push({ desk, reason: `cooldown: dispatched ${Math.floor((t - cd) / 6e4)}m ago < ${cdMin}m` }); continue; }
    if (!lastTs) { decided.push({ desk, stale_min: null, reason: 'no-receipt-yet' }); continue; }
    const stale = (t - Date.parse(lastTs)) / 6e4;
    if (stale > maxGap) decided.push({ desk, stale_min: +stale.toFixed(1), reason: `book stale ${stale.toFixed(1)}m > ${maxGap}m` });
    else skipped.push({ desk, reason: `fresh ${stale.toFixed(1)}m <= ${maxGap}m` });
  }
  return { decided, skipped };
}

function readStasis() {
  try { return JSON.parse(fs.readFileSync(STASIS_JSON, 'utf8')).active === true; } catch (_) { return false; }
}

function lastLineTs(p) { // jsonl → last parseable .ts ; json book → .at | last array row .ts
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (p.endsWith('.jsonl')) {
      const lines = raw.split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) { try { const j = JSON.parse(lines[i]); if (j.ts) return j.ts; } catch (_) {} }
      return null;
    }
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.length && j[j.length - 1].ts ? j[j.length - 1].ts : null;
    return j.at || null;
  } catch (_) { return null; }
}

// Z-73 CR-0056 THE SUFFIX LAW (measured, keeper run 37165106733): GitHub's dispatch
// endpoint accepts the workflow FILE NAME only — desks registered before the .yml
// naming convention (sovereign-tick-cron, fill-ledger-cron) 404'd while suffixed
// desks (market-grid-cron.yml, audience-analyst.yml) 204'd in the SAME run with the
// SAME token. The registry keys stay as-is (they are the arc-book keys, pinned by
// E40b/E44 fixtures) — the dispatch layer normalizes via this exported pure helper.
function workflowFileOf(desk) {
  if (!desk) return desk; // fail-soft: a falsy desk is returned as-is, never fabricated into a name
  return String(desk).endsWith('.yml') ? String(desk) : String(desk) + '.yml';
}

function dispatch(desk, token) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ ref: 'main' });
    const wf = workflowFileOf(desk); // Z-73 CR-0056 THE SUFFIX LAW (measured, keeper run 37165106733) — see the exported helper
    const req = https.request({
      hostname: 'api.github.com', path: `/repos/${REPO}/actions/workflows/${wf}/dispatches`, method: 'POST',
      // Z-71: fine-grained PATs reject the legacy token-prefix on dispatch endpoints
      // (measured: Bearer 204 manual vs token-prefix 404 from the keeper, run 37157983852)
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: `Bearer ${token}`, 'User-Agent': 'saos-tick-keeper', Accept: 'application/vnd.github+json' },
      timeout: 20000,
    }, (res) => { res.resume(); resolve({ status: res.statusCode }); });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: String(e.message).slice(0, 90) }));
    req.write(payload); req.end();
  });
}

async function main() {
  if (String(process.env.TICK_KEEPER_SKIP || '') === '1') { console.log('[tick-keeper] SKIP: eval-context off-switch, zero writes'); return; }
  const t0 = Date.now();
  const now = new Date().toISOString();
  const book = { protocol: 'SAOS-TICK-KEEPER/1', at: now, repo: REPO, stasis: null, arc: {}, decided: null, dispatched: [], skipped: null, errors: [], duration_ms: null };

  // 1. STASIS FIRST — the healer obeys the breaker (FATE-DEFENSE law #1)
  book.stasis = readStasis();

  // 2. measure the arc from the repo's own receipts
  const arc = {}, maxGaps = {};
  for (const desk of Object.keys(ARC)) { arc[desk] = lastLineTs(path.join(ROOT, ARC[desk].receipt)); maxGaps[desk] = ARC[desk].max_gap_min; book.arc[desk] = { receipt: ARC[desk].receipt, last_ts: arc[desk], max_gap_min: ARC[desk].max_gap_min }; }

  // 3. cooldown memory (this desk's only state)
  let cooldownBook = {};
  try { cooldownBook = (JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')).cooldown_book) || {}; } catch (_) {}

  if (book.stasis) {
    book.skipped = Object.keys(ARC).map((desk) => ({ desk, reason: 'STASIS-HALT: breaker active — healthy no-op, nothing fired' }));
  } else {
    const d = keeperDecide({ now, arc, cooldownBook, maxGaps });
    book.decided = d.decided; book.skipped = d.skipped;
    const token = process.env.KEEPER_GH_TOKEN || process.env.GITHUB_TOKEN || '';
    if (!token && d.decided.length) book.errors.push('no token in env — stale desks NOT re-fired (fail-loud book)');
    for (const item of d.decided) {
      if (!token) break;
      const r = await dispatch(item.desk, token);
      book.dispatched.push({ desk: item.desk, http_status: r.status, ok: r.status === 204, error: r.error || null });
      cooldownBook[item.desk] = now; // cooldown applies even on a failed call — no storms
    }
  }

  book.cooldown_book = cooldownBook;
  book.duration_ms = Date.now() - t0;
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1) + '\n');
  const fired = (book.dispatched || []).map((x) => `${x.desk}=${x.ok ? 'DISPATCHED' : 'status ' + x.http_status}`).join(', ') || 'none';
  const md = [`# Tick keeper · ${book.at}`, '',
    `STASIS: ${book.stasis} · fired: ${fired}`, '',
    '| desk | last receipt | law | verdict |', '|---|---|---|---|'];
  for (const s of (book.skipped || [])) md.push(`| ${s.desk} | ${(book.arc[s.desk] || {}).last_ts || '—'} | ${(book.arc[s.desk] || {}).max_gap_min}m | ${s.reason} |`);
  for (const x of (book.decided || [])) md.push(`| ${x.desk} | ${(book.arc[x.desk] || {}).last_ts || '—'} | ${(book.arc[x.desk] || {}).max_gap_min}m | RE-FIRED (${x.reason}) |`);
  if (book.errors.length) md.push('', `**errors:** ${book.errors.join(' | ')}`);
  md.push('', `_the healer obeys the breaker: STASIS halts before any dispatch; cooldown ${COOLDOWN_MIN}m per desk; the arc's own receipts (pushed by the desks) are the only truth measured_`);
  fs.writeFileSync(OUT_MD, md.join('\n') + '\n');
  console.log(`[tick-keeper] stasis=${book.stasis} fired=[${fired}] skipped=${(book.skipped || []).length} errors=${book.errors.length} in ${book.duration_ms}ms`);
}

module.exports = { workflowFileOf, dispatch, keeperDecide, ARC, COOLDOWN_MIN, OUT_JSON };