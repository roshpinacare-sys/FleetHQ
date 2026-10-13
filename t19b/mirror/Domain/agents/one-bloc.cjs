'use strict';
/**
 * one-bloc.cjs — Task 23 CONVERGENCE: the ONE-BLOC desk ("מקשה אחת").
 *
 * Origin: the owner's directive (Hebrew) — "בחן את כל הגיט בוא נתחיל להתלכד
 * ולעבוד כמקשה אחת מסודרת" (examine all the git; converge and work as one
 * organized bloc). The fleet already answered this in prose — BLOC-STATE
 * (platform, hand map), SOVEREIGN-INDEX (Zip, machine map of one machine),
 * FATE-DEFENSE (Domain, failure-mode canon). Prose maps drift; agents kept
 * re-deriving the same picture from scratch (the owner's dedup complaint).
 *
 * This desk is the CONVERGENCE FIX: ONE mechanical measurement of the whole
 * bloc, keyless (KEYLESS-PROBE law, Z-39 — the repos are public, zero
 * credentials, nothing to leak), producing THE ONE-BLOC BOOK:
 *
 *   1. reads agents/one-bloc-roles.csv — the 16-repo role table BOUND from
 *      BLOC-STATE §1 (the hand map is superseded by this machine map:
 *      tool is the source of truth, the CSV is its data);
 *   2. measures every repo's origin/main via `git ls-remote` (15s timeout,
 *      fail-soft per repo — UNKNOWN is booked, never invented).
 *      MEASURED TRUTH (first live run): Domain + Console are public (keyless
 *      works); the other 14 answer auth-required — so the desk is
 *      KEYLESS-FIRST (Z-39 law): keyless attempt → token retry ONLY from env
 *      (ONE_BLOC_TOKEN || GITHUB_TOKEN || ZIP_PAT, never printed, stderr
 *      redacted) → else honest 'AUTH-WALL'. No hopeful green.
 *   3. when a local sibling clone exists (sandbox), verifies local HEAD ==
 *      origin HEAD (the convergence sync check); in CI it books N/A;
 *   4. verifies the sibling truth-maps it binds (BLOC-STATE / SOVEREIGN-INDEX)
 *      when siblings exist — declared-honest otherwise;
 *   5. checks the three laws are armed: STASIS parseable with boolean active,
 *      FWI book present, FATE-DEFENSE canon at the root;
 *   6. writes agents/one-bloc.json + agents/one-bloc.md, verdict:
 *      ONE-BLOC (16/16 reached) · PARTIAL (>=12) · DEGRADED (<12).
 *
 * Fail-soft: exit 0 always (judge-node discipline, same as harness-audit).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AG = __dirname;
const ROOT = path.resolve(AG, '..');
const OUT_JSON = path.join(AG, 'one-bloc.json');
const OUT_MD = path.join(AG, 'one-bloc.md');
const ORG = 'roshpinacare-sys';

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
const agoH = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 3600000 : null);

function parseCSV(text) {
  // quote-aware (same shape as harness-audit's parser — role strings may grow commas)
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const hdr = rows.shift() || [];
  return { hdr, data: rows.filter((r) => r.length >= 2 && r[0].trim()) };
}

const TOKEN = process.env.ONE_BLOC_TOKEN || process.env.GITHUB_TOKEN || process.env.ZIP_PAT || '';

function lsRemoteHead(repo, token) {
  // returns { sha } | { auth: true } | null. stderr is NEVER returned (may embed the URL+token).
  const url = token
    ? `https://x-access-token:${token}@github.com/${ORG}/${repo}.git`
    : `https://github.com/${ORG}/${repo}.git`;
  try {
    const out = execFileSync('git', ['ls-remote', url, 'main'], { timeout: 15000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const sha = (out.trim().split('\t')[0] || '').trim();
    return sha ? { sha } : null;
  } catch (e) {
    const err = String((e && e.stderr) || '') + String((e && e.stdout) || '');
    if (/could not read Username|Authentication|403|401/i.test(err)) return { auth: true };
    return null;
  }
}

function measure(repo) {
  const keyless = lsRemoteHead(repo, '');
  if (keyless && keyless.sha) return { ...keyless, via: 'keyless' };
  if (TOKEN) {
    const withToken = lsRemoteHead(repo, TOKEN);
    if (withToken && withToken.sha) return { ...withToken, via: 'token' };
    if (withToken && withToken.auth) return { auth: true, via: 'token' };
  }
  if (keyless && keyless.auth) return { auth: true, via: 'keyless' };
  return { via: 'keyless' };
}

function localHead(repo) {
  const sibling = path.join(ROOT, '..', repo, '.git');
  if (!fs.existsSync(sibling)) return null; // not checked out here (CI) — honest N/A, not failure
  try {
    return execFileSync('git', ['-C', path.dirname(sibling), 'rev-parse', 'HEAD'], { timeout: 10000, encoding: 'utf8' }).trim() || null;
  } catch (_) { return undefined; } // exists but broken — measured, distinct from N/A
}

try {
  const at = new Date().toISOString();
  const { hdr, data } = parseCSV(read(path.join(AG, 'one-bloc-roles.csv')) || '');
  const repos = data.map((r) => ({ repo: r[0].trim(), role_he: (r[1] || '').trim(), role_en: (r[2] || '').trim(), bound_map: (r[3] || 'BLOC-STATE').trim() }));

  const rows = [];
  const via = { keyless: 0, token: 0 };
  for (const r of repos) {
    const m = measure(r.repo);
    if (m.via === 'keyless' && m.sha) via.keyless++;
    else if (m.via === 'token' && m.sha) via.token++;
    const origin = m.sha || null;
    const local = localHead(r.repo);
    rows.push({
      repo: r.repo, role_he: r.role_he, role_en: r.role_en, bound_map: r.bound_map,
      originSha: origin ? origin.slice(0, 12) : null,
      status: origin ? 'REACHED' : (m.auth ? 'AUTH-WALL' : 'UNKNOWN'),
      via: origin ? m.via : null,
      localSync: local === null ? 'N/A' : (local === undefined ? 'BROKEN' : (!origin ? 'UNKNOWN-ORIGIN' : (local.slice(0, 12) === origin.slice(0, 12) ? 'SYNCED' : 'BEHIND'))),
    });
  }

  // ---- the three laws, armed?
  const stasisRaw = read(path.join(AG, 'STASIS.json'));
  let stasis = { armed: false, parseable: false };
  try { const s = JSON.parse(stasisRaw); stasis = { armed: s.active === false, parseable: true }; } catch (_) {}
  const fwiRaw = read(path.join(AG, 'fleet-indicators.json'));
  let fwi = { present: !!fwiRaw, ageH: null, verdict: null };
  try { const f = JSON.parse(fwiRaw); fwi.ageH = f.at ? Math.round(agoH(f.at) * 10) / 10 : null; fwi.verdict = f.verdict || null; } catch (_) {}
  const fateDefense = { present: !!read(path.join(ROOT, 'FATE-DEFENSE.md')) };

  // ---- sibling truth-maps this book binds (dedup: one map, three former copies)
  const maps = [
    { name: 'FATE-DEFENSE', repo: 'Domain', path: 'FATE-DEFENSE.md' },
    { name: 'BLOC-STATE', repo: 'saos-sovereign-platform', path: 'docs/BLOC-STATE-2026-10-02.md' },
    { name: 'SOVEREIGN-INDEX', repo: 'Zip', path: 'SOVEREIGN-INDEX.md' },
  ].map((m) => {
    if (m.repo === 'Domain') return { ...m, existence: fs.existsSync(path.join(ROOT, m.path)) ? 'VERIFIED' : 'MISSING' };
    const sib = path.join(ROOT, '..', m.repo, m.path);
    return { ...m, existence: fs.existsSync(path.join(ROOT, '..', m.repo)) ? (fs.existsSync(sib) ? 'VERIFIED' : 'MISSING') : 'DECLARED (sibling not checked out)' };
  });

  const reached = rows.filter((r) => r.status === 'REACHED').length;
  const synced = rows.filter((r) => r.localSync === 'SYNCED').length;
  const checkedLocally = rows.filter((r) => r.localSync !== 'N/A').length;
  const counts = { repos: rows.length, reached, unknown: rows.filter((r) => r.status === 'UNKNOWN').length, authWall: rows.filter((r) => r.status === 'AUTH-WALL').length, keylessReach: via.keyless, tokenReach: via.token, synced, checkedLocally };
  const verdict = reached === rows.length && rows.length === 16 ? 'ONE-BLOC' : (reached >= 12 ? 'PARTIAL' : 'DEGRADED');

  const book = {
    protocol: 'SAOS-ONE-BLOC/1', at,
    agent: 'one-bloc v1.0.1 (Task 23 convergence — owner directive "מקשה אחת"; binds BLOC-STATE + SOVEREIGN-INDEX + FATE-DEFENSE into one machine map; keyless-first + env-token fallback, stderr redacted)',
    authMode: TOKEN ? 'keyless-first + env-token fallback (token redacted)' : 'keyless-only',
    verdict, counts, laws: { stasisBreaker: stasis, fwiBook: fwi, fateDefenseCanon: fateDefense }, boundMaps: maps, repos: rows,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1) + '\n');

  const lines = [];
  lines.push('# ONE-BLOC BOOK — מפת-הגוש-האחת (מכונה, לא פרוזה)');
  lines.push('');
  lines.push(`_${book.agent}_`);
  lines.push('');
  lines.push(`Measured: **${at}** · Verdict: **${verdict}** · REACHED ${reached}/${rows.length} (keyless ${via.keyless} + token ${via.token}) · AUTH-WALL ${counts.authWall} · UNKNOWN ${counts.unknown} · local-sync ${synced}/${checkedLocally || '—'}`);
  lines.push('');
  lines.push('| ריפו | תפקיד | origin/main | מצב | דרך | סנכרון-מקומי |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.repo} | ${r.role_he} | \`${r.originSha || '—'}\` | ${r.status} | ${r.via || '—'} | ${r.localSync} |`);
  lines.push('');
  lines.push(`Laws armed: STASIS breaker ${stasis.parseable ? (stasis.armed ? '✔ parseable, engine free (active=false)' : 'parseable, BRAKE ON (active=true)') : '✘ unparseable'} · FWI book ${fwi.present ? `present, age ${fwi.ageH}h, verdict ${fwi.verdict}` : '✘ missing'} · FATE-DEFENSE canon ${fateDefense.present ? 'present' : '✘ missing'}`);
  lines.push('');
  lines.push('Bound maps (dedup — one truth, no more re-derivation):');
  for (const m of maps) lines.push(`- ${m.name} → ${m.repo}#${m.path} · ${m.existence}`);
  lines.push('');
  lines.push('> KEYLESS-FIRST law (Z-39, measured live): Domain+Console answer keyless (public); the rest are private and answer AUTH-WALL — retried once with the env token when present (never printed, stderr redacted), else booked honestly. UNKNOWN/AUTH-WALL is booked as such, never invented. This table supersedes the hand-written role tables in the bound maps; regenerate with `node agents/one-bloc.cjs`, never edit by hand.');
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');

  console.log('ONE-BLOC ' + JSON.stringify({ verdict, counts, at }));
} catch (e) {
  console.log('[one-bloc] write failed (fail-soft): ' + e.message);
}
process.exit(0);
