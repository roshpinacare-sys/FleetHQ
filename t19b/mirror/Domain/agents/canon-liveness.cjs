'use strict';
/**
 * canon-liveness.cjs — Z-42 CANON REACHABILITY DESK (the one-bloc nerves, CR-0005).
 *
 * Birth: the 2026-10-02T23:44Z venture-desk run booked "measured ledger
 * unreachable this run" — and the operator ordered convergence ("one organized
 * bloc"). Root cause PROVEN this wave: venture-desk's only fallback leg was an
 * ANONYMOUS raw.githubusercontent fetch, but the Defi canon repo is PRIVATE
 * (Console public → anonymous 200; Defi/steem → anonymous 403; anonymous raw →
 * 404 on every branch). A fallback that can never succeed is not a fallback —
 * it is a dead leg wired where a nerve should be.
 *
 * What this desk does (keyless in the secret sense, fail-soft, exit 0 always):
 *   LEG-1  sibling content      — DEFU_DIR / ../Defi checkout actually serves
 *                                 fleet/KPI.json + the doctrine marker. The only
 *                                 leg that SERVES content to desks.
 *   LEG-2  authenticated rail   — git ls-remote on each fleet repo's origin
 *                                 (embedded remote creds, NEVER printed): proves
 *                                 the canon rail is alive even when content is
 *                                 not adjacent (throwaway/verification trees).
 *   LEG-3  anonymous raw probe  — the dead fallback, kept as a standing probe:
 *                                 404 is the EXPECTED verdict for a private
 *                                 canon; a 200 would mean the canon went public
 *                                 (a fact change worth booking, never silently).
 *
 * Verdict (pure, exported for white-box evals):
 *   CONTENT-SERVED  — L1 serves the canon (desks read with proven legs)
 *   RAIL-REACHABLE  — content not adjacent, but the rail answers (honest nulls
 *                     stay null, and the null is EXPLAINED)
 *   CANON-DARK      — zero legs: every cross-repo desk is an island (judge RED)
 *
 * Receipts: agents/canon-liveness.json + canon-liveness.md (BOOKS-STAMP law).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AG = __dirname;
const ROOT = path.resolve(AG, '..');
const DEFU_DIR = process.env.DEFU_DIR || path.resolve(ROOT, '..', 'Defi');
const FLEET_DIR = path.resolve(ROOT, '..');
const REPOS = ['Defi', 'Domain', 'steem'];

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
const readJson = (p) => { try { return JSON.parse(read(p) || 'null'); } catch (_) { return null; } };

// Z-42 pure verdict (white-box eval E15): legs → verdict, no hopeful greens.
function verdictFromLegs(l1, l2) {
  if (l1 && l1.content === true) return 'CONTENT-SERVED';
  if (l2 && l2.reachable === true) return 'RAIL-REACHABLE';
  return 'CANON-DARK';
}

function leg1SiblingContent() {
  const kpi = readJson(path.join(DEFU_DIR, 'fleet', 'KPI.json'));
  const doctrine = read(path.join(DEFU_DIR, 'fleet', 'DOCTRINE-economics.md'));
  const content = !!(kpi && kpi.updatedAt);
  return {
    id: 'L1', name: 'sibling/CI checkout serves canon content', content,
    verdict: content ? 'SERVING' : 'ABSENT',
    detail: content
      ? `${DEFU_DIR} · KPI updatedAt ${kpi.updatedAt} · doctrine marker ${doctrine && doctrine.includes('TWO-SIDED LEDGER LAW') ? 'present' : 'MISSING'}`
      : `no readable KPI.json at ${DEFU_DIR} (DEFU_DIR=${process.env.DEFU_DIR || 'unset → ../Defi'})`
  };
}

function leg2AuthenticatedRail() {
  const perRepo = [];
  for (const r of REPOS) {
    const local = path.join(FLEET_DIR, r, '.git');
    const cwd = fs.existsSync(local) ? path.join(FLEET_DIR, r) : null;
    let reachable = false, head = null;
    try {
      const opts = { timeout: 20000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
      if (!cwd) opts.env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }; // never hang on a prompt
      const out = execFileSync('git', ['ls-remote', cwd ? 'origin' : `https://github.com/roshpinacare-sys/${r}.git`, 'HEAD'], opts).toString();
      head = (out.split(/\s+/)[0] || '').slice(0, 12) || null;
      reachable = !!head;
    } catch (_) { reachable = false; }
    perRepo.push({ repo: r, reachable, head, mode: cwd ? 'local-clone(origin)' : 'anonymous-https(no-prompt)' });
  }
  const canonReachable = perRepo.some((x) => x.repo === 'Defi' && x.reachable);
  return {
    id: 'L2', name: 'authenticated git rail (embedded remote creds, never printed)',
    reachable: canonReachable,
    verdict: canonReachable ? 'RAIL-UP' : 'RAIL-DOWN',
    detail: perRepo.map((x) => `${x.repo}${x.reachable ? `@${x.head}` : '=unreachable'}(${x.mode})`).join(' ')
  };
}

function leg3AnonymousRaw() {
  return new Promise((resolve) => {
    try {
      const https = require('https');
      const req = https.request({ hostname: 'raw.githubusercontent.com', path: '/roshpinacare-sys/Defi/main/fleet/KPI.json', method: 'GET', family: 4, timeout: 10000, headers: { 'User-Agent': 'canon-liveness/1.0' } }, (res) => {
        res.resume();
        resolve({
          id: 'L3', name: 'anonymous raw probe (the proven-dead fallback, kept as a standing fact-check)',
          status: res.statusCode,
          verdict: res.statusCode === 200 ? 'PUBLIC-FACT-CHANGE' : 'DEAD-AS-EXPECTED-PRIVATE',
          detail: `anonymous GET fleet/KPI.json → HTTP ${res.statusCode} (private canon: 404 expected; 200 would mean the canon went public — book it, never assume it)`
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => resolve({ id: 'L3', name: 'anonymous raw probe', status: 0, verdict: 'PROBE-ERROR', detail: String(e.message || e).slice(0, 80) }));
      req.end();
    } catch (e) { resolve({ id: 'L3', name: 'anonymous raw probe', status: 0, verdict: 'PROBE-ERROR', detail: String(e.message || e).slice(0, 80) }); }
  });
}

module.exports = { verdictFromLegs, REPOS };

if (require.main === module) (async () => {
  const at = new Date().toISOString();
  const l1 = leg1SiblingContent();
  const l2 = leg2AuthenticatedRail();
  const l3 = await leg3AnonymousRaw();
  const verdict = verdictFromLegs(l1, l2);
  const legs = [l1, l2, l3];

  const out = {
    ok: true, at, agent: 'canon-liveness v1.0.0 (Z-42, CR-0005 — one-bloc nerves)',
    origin: 'the 2026-10-02T23:44Z honest null was root-caused to a structurally dead fallback leg (anonymous raw on a PRIVATE canon repo → 404 forever); reachability is now a booked fact with named legs, not an environment surprise',
    verdict, legs,
    deskGuidance: verdict === 'CONTENT-SERVED'
      ? 'desks read the canon from the sibling checkout — proven legs, book normally'
      : verdict === 'RAIL-REACHABLE'
        ? 'content not adjacent: desks book honest nulls (never estimated) and name this verdict as the reason'
        : 'CANON-DARK: every cross-repo desk is an island — fix the legs before trusting any cross-repo number',
    doctrineMarker: { law: 'CANON-REACHABILITY LAW + ONE-CANON LAW (Defi/fleet/DOCTRINE-economics.md v1.7)' }
  };
  try { fs.writeFileSync(path.join(AG, 'canon-liveness.json'), JSON.stringify(out, null, 1) + '\n'); } catch (_) {}

  const md = [];
  md.push('# Canon Liveness — the one-bloc nerves (fresh-process desk, Z-42)');
  md.push('');
  md.push(`_canon-liveness v1.0.0 · ${at} · CR-0005_`);
  md.push('');
  md.push(`**verdict: ${verdict}** — ${out.deskGuidance}`);
  md.push('');
  md.push('| Leg | Probe | Verdict | Detail |');
  md.push('|---|---|---|---|');
  for (const l of legs) md.push(`| ${l.id} | ${l.name} | ${l.verdict} | ${l.detail} |`);
  md.push('');
  md.push('_Root cause on record: the 23:44Z "ledger unreachable" honest null came from a tokenless raw fallback against a PRIVATE canon — dead by construction. One canon, named legs, zero hopeful greens._');
  try { fs.writeFileSync(path.join(AG, 'canon-liveness.md'), md.join('\n') + '\n'); } catch (_) {}

  console.log(`canon-liveness: ${verdict} · ${legs.map((l) => `${l.id}=${l.verdict}`).join(' ')}`);
  process.exit(0); // fail-soft: the nerves never break a run
})();
