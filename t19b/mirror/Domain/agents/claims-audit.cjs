#!/usr/bin/env node
/* CLAIMS-AUDIT (CR-0049, fleet Rung 21 — THE ROAST RUNG) — the anti-claims instrument.
 *
 * Owner directive 2026-10-03 ("אתה כותב בסינית אני לא מבין ... תעשה לעצמך roast חריף
 * ותיקונים על הכל בדוק את כל הטענות שלך ... ייעל תקן וודא שפר הכל"): every claim the
 * fleet writes about itself must be MECHANICALLY CHECKED against the tree — the same
 * anti-claims law the operator demanded for chain income (CR-0046: "אל תסמוך על הטענות
 * שלך") now audits the LEDGER ITSELF. Claims without a file are not claims.
 *
 * THE OWNER-LANGUAGE LAW (roles-as-data: a rule not encoded is not a rule):
 *   owner-facing chat replies are HEBREW (עברית) — the owner reads Hebrew;
 *   repo/CI artifacts stay English for the agents and the machines.
 *   Encoded here as data (OWNER_LANGUAGE) and printed on EVERY run.
 *
 * What is audited (offline / keyless / deterministic / fail-soft):
 *  1. EVIDENCE-EXISTENCE LAW — every path-shaped token in feature_list.json evidence
 *     (array, string, or object shapes) must resolve to a real file on the tree.
 *     Resolution order: as-given -> agents/ -> .github/workflows/ -> unique basename
 *     match (deterministic sorted index). MISSING = offender. Documented exceptions
 *     (KNOWN_EXCEPTIONS allowlist, reason-stamped) book WARN, never fake failures.
 *  2. CR-LEDGER LAW — every feat.cr must have >=1 agents/change-requests/CR-XXXX-*.json
 *     (0 files = offender), AND the change-requests directory itself is scanned for
 *     duplicate slot numbers independent of citations (>1 file = DUPLICATE-SLOT WARN;
 *     the immutability law keeps history as written; known: CR-0008, documented CR-0049).
 *  3. SUITE-INVARIANT LAW — run-evals.cjs source version & evalr count vs the committed
 *     eval-results.json: MATCH / LAGGING-BOOK (the book lags an in-flight version bump —
 *     WARN, self-heals at lane-books) / MISMATCH (equal versions, different counts —
 *     offender). SKIP when either side unreadable (honest no-claim).
 *  4. STASIS halt-before-read (stasisHalt borrowed from the census desk by require —
 *     second-mover law: nothing is re-implemented, the brake is THE SAME brake).
 *     CLAIMS_AUDIT_SKIP off-switch (house seam). Fail-soft exit 0 always.
 *
 * Book: agents/claims-audit.json (+ .md — the md is AT-FREE so it can never cause a
 * publish diff on its own). The json's moving `at` is stripped by the census-cron
 * publish comparator (CR-0049), so a clean fleet books NO noise commit — the no-noise
 * law composes with the CR-0041 cadence. Stable payload (book minus `at`) is
 * byte-deterministic (census-style, E40-guarded).
 */

const fs = require('fs');
const path = require('path');
const { stasisHalt } = require('./fleet-census.cjs');

const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, 'feature_list.json');
const CR_DIR = path.join(ROOT, 'agents', 'change-requests');
const EVALS_SRC = path.join(ROOT, 'agents', 'evals', 'run-evals.cjs');
const EVAL_RESULTS = path.join(ROOT, 'agents', 'evals', 'eval-results.json');
const BOOK_JSON = path.join(ROOT, 'agents', 'claims-audit.json');
const BOOK_MD = path.join(ROOT, 'agents', 'claims-audit.md');

const OWNER_LANGUAGE = 'he';
const OWNER_LANGUAGE_RULE = 'owner-facing replies: עברית (Hebrew) — the owner reads Hebrew; repo/CI artifacts stay English';

/** documented claim exceptions — WARN with a reason, never a fake MISSING offender.
 *  Each entry is a DECISION with its reason on the tree (the anti-claims law is not
 *  softened silently: an exception without a written reason does not exist). */
const KNOWN_EXCEPTIONS = {
  'agents/sovereign-pending.json': 'runtime surface: the Tier-E mailbox is created by sovereign.cjs on first parking; cited in feat-039 as the designed surface (CR-0049)',
  'traj-gwt2.json': 'ephemeral drill artifact: worktree-wave trajectory file written at runtime and never committed by design (feat-021; CR-0049)',
  'traj-gwt1.json': 'ephemeral drill artifact: worktree-wave trajectory file written at runtime and never committed by design (feat-021; CR-0049)',
  'fills.jsonl': 'ledger shorthand: the token means agents/fill-ledger-fills.jsonl, which exists — the shorthand itself is not a path (feat-036; CR-0049)'
};

// ext alternation longest-first + trailing boundary lookahead: "file.json" must never
// truncate to "file.js" (an in-session desk defect the roast rung caught on itself).
const PATH_RE = /^([A-Za-z0-9][A-Za-z0-9_\-./]*\.(?:jsonl|json|yaml|yml|tsx|cjs|mjs|csv|md|py|sh|js|ts|txt))(?![A-Za-z0-9_\-./])/;
const SPLIT_RE = /\s*·\s*|\s*,\s*|\s*\+\s*/;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

// ---------- pure helpers (E40 white-box surface) ----------

/** deterministic basename -> [relpath] index over agents/, .github/ and root files. */
function buildFileIndex() {
  const idx = new Map();
  const push = (rel) => {
    const base = path.basename(rel);
    if (!idx.has(base)) idx.set(base, []);
    idx.get(base).push(rel);
  };
  const walk = (dir, rel, depth) => {
    if (depth > 8) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r, depth + 1);
      else if (e.isFile()) push(r);
    }
  };
  walk(path.join(ROOT, 'agents'), 'agents', 0);
  walk(path.join(ROOT, '.github'), '.github', 0);
  let rootEntries = [];
  try { rootEntries = fs.readdirSync(ROOT, { withFileTypes: true }); } catch (_) {}
  rootEntries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of rootEntries) if (e.isFile()) push(e.name);
  for (const arr of idx.values()) arr.sort();
  return idx;
}

/** THE RESOLUTION LAW: as-given -> agents/ -> .github/workflows/ -> unique basename. */
function resolveEvidencePath(rel, idx) {
  if (!rel || typeof rel !== 'string') return null;
  if (fs.existsSync(path.join(ROOT, rel))) return rel;
  const a = 'agents/' + rel;
  if (fs.existsSync(path.join(ROOT, a))) return a;
  const w = '.github/workflows/' + rel;
  if (fs.existsSync(path.join(ROOT, w))) return w;
  const hits = (idx && idx.get(path.basename(rel))) || [];
  return hits[0] || null;
}

/** collect path-shaped tokens from any evidence shape the ledger uses. */
function collectEvidencePaths(ev) {
  const out = [];
  const scan = (s) => {
    if (typeof s !== 'string') return;
    for (const part of s.split(SPLIT_RE)) {
      const m = PATH_RE.exec(part.trim());
      if (m) out.push({ rel: m[1] });
    }
  };
  if (Array.isArray(ev)) for (const x of ev) scan(x);
  else if (typeof ev === 'string') scan(ev);
  else if (ev && typeof ev === 'object') for (const k of Object.keys(ev)) scan(ev[k]);
  return out;
}

/** pure suite-invariant machine. */
function suiteInvariant(srcVer, resVer, srcCount, resCount) {
  if (!srcVer || !resVer || srcCount == null || resCount == null) return 'SKIP';
  if (srcVer === resVer) return srcCount === resCount ? 'MATCH' : 'MISMATCH';
  return 'LAGGING-BOOK';
}

// ---------- the audit ----------

function auditLedger() {
  const fl = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const feats = Array.isArray(fl) ? fl : (Array.isArray(fl.features) ? fl.features : Object.values(fl.features || fl));
  const idx = buildFileIndex();
  const offenders = [];
  const warns = [];
  let evidenceChecked = 0;
  let evidenceResolved = 0;
  let featsWithCr = 0;
  const crMap = new Map();
  for (const f of feats) {
    const seen = new Set();
    for (const t of collectEvidencePaths(f && f.evidence)) {
      if (seen.has(t.rel)) continue;
      seen.add(t.rel);
      evidenceChecked++;
      if (resolveEvidencePath(t.rel, idx)) { evidenceResolved++; continue; }
      if (KNOWN_EXCEPTIONS[t.rel]) warns.push({ kind: 'ALLOWED-CLAIM', feat: f.id, claimed: t.rel, reason: KNOWN_EXCEPTIONS[t.rel] });
      else offenders.push({ kind: 'MISSING-EVIDENCE', feat: f.id, claimed: t.rel });
    }
    const m = f && f.cr ? String(f.cr).match(/^CR-\d+$/) : null;
    if (m) { featsWithCr++; if (!crMap.has(m[0])) crMap.set(m[0], 0); }
  }
  const crFiles = fs.existsSync(CR_DIR) ? fs.readdirSync(CR_DIR).sort() : [];
  for (const cr of [...crMap.keys()].sort()) {
    const files = crFiles.filter((x) => x.startsWith(cr + '-'));
    if (!files.length) offenders.push({ kind: 'MISSING-CR-FILE', cr, note: 'feature_list cites ' + cr + ' but no change-requests file exists' });
  }
  // independent slot-hygiene scan: duplicate CR numbers on disk, cited or not
  const byNum = new Map();
  for (const x of crFiles) { const m = x.match(/^(CR-\d+)-/); if (m) { if (!byNum.has(m[1])) byNum.set(m[1], []); byNum.get(m[1]).push(x); } }
  for (const num of [...byNum.keys()].sort()) {
    const files = byNum.get(num);
    if (files.length > 1) warns.push({ kind: 'DUPLICATE-SLOT', cr: num, files, note: 'historical slot reuse kept by the immutability law (documented in CR-0049)' });
  }
  const src = fs.existsSync(EVALS_SRC) ? fs.readFileSync(EVALS_SRC, 'utf8') : '';
  const srcVer = (src.match(/run-evals v(\d+\.\d+\.\d+)/) || [])[1] || null;
  // distinct eval IDs — sub-letter ids count too (E40a/E40b on the merged tree; the raw
  // evalr( count also matches every catch-block re-raise: 39 evals counted as 78).
  const srcCount = new Set(src.match(/evalr\('(E\d+(?:-ext|[ab])?)'/g) || []).size;
  let resVer = null;
  let resCount = null;
  try {
    const res = JSON.parse(fs.readFileSync(EVAL_RESULTS, 'utf8'));
    resVer = (String(res.agent || '').match(/run-evals v(\d+\.\d+\.\d+)/) || [])[1] || null;
    resCount = Array.isArray(res.evals) ? res.evals.length : null;
  } catch (_) {}
  const suite = {
    srcVersion: srcVer ? 'v' + srcVer : null,
    resVersion: resVer ? 'v' + resVer : null,
    srcEvals: srcCount,
    resEvals: resCount,
    verdict: suiteInvariant(srcVer, resVer, srcCount, resCount)
  };
  if (suite.verdict === 'MISMATCH') offenders.push({ kind: 'SUITE-MISMATCH', note: 'run-evals source and eval-results.json disagree at equal versions: src=' + srcCount + ' res=' + resCount });
  if (suite.verdict === 'LAGGING-BOOK') warns.push({ kind: 'SUITE-LAGGING-BOOK', note: 'the results book lags an in-flight source bump (' + suite.srcVersion + ' vs ' + suite.resVersion + ') — self-heals at lane-books' });
  const key = (o) => String(o.kind) + '|' + String(o.feat || '') + '|' + String(o.cr || '') + '|' + String(o.claimed || '');
  offenders.sort((a, b) => key(a).localeCompare(key(b)));
  warns.sort((a, b) => key(a).localeCompare(key(b)));
  return { feats: feats.length, featsWithCr, evidenceChecked, evidenceResolved, offenders, warns, suite };
}

/** the stable payload — byte-identical for the same tree (determinism law). */
function claimsStable() {
  const a = auditLedger();
  const verdict = a.offenders.length ? 'OFFENDERS' : (a.warns.length ? 'WARN' : 'CLEAN');
  return {
    ok: true,
    agent: 'claims-audit v1.0.0 (R21, CR-0049 — the anti-claims instrument)',
    verdict,
    ownerLanguage: OWNER_LANGUAGE,
    ownerLanguageRule: OWNER_LANGUAGE_RULE,
    counts: { feats: a.feats, featsWithCr: a.featsWithCr, evidenceChecked: a.evidenceChecked, evidenceResolved: a.evidenceResolved, offenders: a.offenders.length, warns: a.warns.length },
    offenders: a.offenders,
    warns: a.warns,
    suite: a.suite
  };
}

// ---------- single-writer atomic book ----------

function writeBook(extra) {
  const stable = claimsStable();
  const book = Object.assign({ at: new Date().toISOString() }, stable, extra || {});
  const tmpJ = BOOK_JSON + '.tmp';
  fs.writeFileSync(tmpJ, JSON.stringify(book, null, 1) + '\n');
  fs.renameSync(tmpJ, BOOK_JSON);
  const md = ['# Claims Audit — the anti-claims instrument (CR-0049, R21)', '', '**' + book.verdict + '** · feats ' + book.counts.feats + ' · evidence resolved ' + book.counts.evidenceResolved + '/' + book.counts.evidenceChecked + ' · offenders ' + book.counts.offenders + ' · warns ' + book.counts.warns + ' · suite ' + book.suite.verdict, '', '_Owner-language law: ' + book.ownerLanguageRule + '_', ''];
  if (book.offenders.length) { md.push('## Offenders (claims without a file)'); for (const o of book.offenders) md.push('- ' + o.kind + ' — ' + JSON.stringify(o)); md.push(''); }
  else md.push('## Offenders', '- none — every claim resolves on the tree', '');
  if (book.warns.length) { md.push('## Warns (documented, honest)'); for (const w of book.warns) md.push('- ' + w.kind + (w.cr ? ' ' + w.cr : '') + ' — ' + (w.reason || w.note || JSON.stringify(w))); md.push(''); }
  const tmpM = BOOK_MD + '.tmp';
  fs.writeFileSync(tmpM, md.join('\n') + '\n');
  fs.renameSync(tmpM, BOOK_MD);
  return book;
}

function main() {
  if (process.env.CLAIMS_AUDIT_SKIP === '1') { console.log('CLAIMS-AUDIT SKIP (CLAIMS_AUDIT_SKIP=1)'); return; }
  const halt = stasisHalt();
  if (halt.active) {
    const book = Object.assign({ at: new Date().toISOString(), ok: true, agent: 'claims-audit v1.0.0 (R21, CR-0049 — the anti-claims instrument)', verdict: 'STASIS-HALT', stasis: halt, ownerLanguage: OWNER_LANGUAGE, ownerLanguageRule: OWNER_LANGUAGE_RULE }, {});
    const tmpJ = BOOK_JSON + '.tmp';
    fs.writeFileSync(tmpJ, JSON.stringify(book, null, 1) + '\n');
    fs.renameSync(tmpJ, BOOK_JSON);
    console.log('CLAIMS-AUDIT STASIS-HALT · the breaker is active — nothing audited, nothing written beyond the receipt');
    return;
  }
  try {
    const book = writeBook();
    console.log('CLAIMS-AUDIT verdict=' + book.verdict + ' · feats=' + book.counts.feats + ' evidence=' + book.counts.evidenceResolved + '/' + book.counts.evidenceChecked + ' offenders=' + book.counts.offenders + ' warns=' + book.counts.warns + ' suite=' + book.suite.verdict + ' (' + OWNER_LANGUAGE_RULE + ')');
  } catch (e) {
    try {
      const book = { at: new Date().toISOString(), ok: false, agent: 'claims-audit v1.0.0 (R21, CR-0049 — the anti-claims instrument)', verdict: 'ERROR', error: String(e.message).slice(0, 200), ownerLanguage: OWNER_LANGUAGE, ownerLanguageRule: OWNER_LANGUAGE_RULE };
      const tmpJ = BOOK_JSON + '.tmp';
      fs.writeFileSync(tmpJ, JSON.stringify(book, null, 1) + '\n');
      fs.renameSync(tmpJ, BOOK_JSON);
    } catch (_) {}
    console.log('CLAIMS-AUDIT ERROR (fail-soft): ' + String(e.message).slice(0, 120));
  }
}

if (require.main === module) main();

module.exports = { OWNER_LANGUAGE, OWNER_LANGUAGE_RULE, KNOWN_EXCEPTIONS, PATH_RE, buildFileIndex, resolveEvidencePath, collectEvidencePaths, suiteInvariant, auditLedger, claimsStable };
