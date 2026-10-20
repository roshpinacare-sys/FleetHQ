#!/usr/bin/env node
/**
 * twin-audit.mjs — TWIN / DOMAIN-DIFFERENTIATION AUDIT (r147-c). Keyless, read-only
 * against the live sites, fail-loud only on its own IO.
 *
 * Why this exists (the operator's standing complaint, measured 2026-10-02):
 * Console and Domain served IDENTICAL text on 12 page pairs (5-gram text Jaccard
 * 1.0) plus 3 pairs >= 0.95, and two intra-Domain pairs sat at 0.981 / 0.9575.
 * r147-c differentiated the two worst pairs (see agents/twin-registry.json). This
 * audit keeps that differentiation from rotting: every day it re-measures the live
 * pages, checks each registered pair's distinct-capability evidence, and flags any
 * UNKNOWN pair that drifted into near-duplication (>= 0.95) with no registered
 * distinct function. Reports land in twin-audit/ as public receipts.
 *
 * Methods:
 *   · text = HTML with script/style/comments stripped, whitespace-normalized
 *   · similarity = Jaccard over 5-token shingles (same family as the content
 *     dedupe gate, tuned for whole pages)
 *   · capability evidence = real fetches: the book URL answers with the declared
 *     format, the marked page references its book, the sibling page does not.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const requireCjs = createRequire(import.meta.url);
const { evidenceMarkers } = requireCjs('./twin-marker-law.cjs'); // R22 — the marker-side law, pure + E42-shared

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'twin-audit');
const NEAR_DUP = 0.95;
const BASE = {
  Console: 'https://roshpinacare-sys.github.io/Console/',
  Domain: 'https://roshpinacare-sys.github.io/Domain/',
};
const CROSS_PAGES = ['index.html', 'defi.html', 'deposits.html', 'money.html', 'versus.html', 'sovereign.html', 'readiness.html', 'gate.html', 'truth.html', 'wallet.html', 'acid.html', 'net.html', 'reports.html', 'roast.html', '404.html', 'about/index.html', 'receipts/index.html'];
const INTRA_PAIRS = [
  ['about/index.html', 'market/index-en.html'],
  ['market/onepager-en.html', 'onepager/index.html'],
  ['pitch/index.html', 'pitch/en.html'],
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fetchOnce(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'twin-audit/1.0 (r147-c)' }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) return { status: r.status, body: null };
    return { status: 200, body: await r.text() };
  } catch (e) {
    return { status: -1, body: null, msg: String(e.message || e).slice(0, 80) };
  }
}
async function fetchText(url, attempts = 3) {
  let last = { status: -1, body: null, msg: 'untried' };
  for (let i = 0; i < attempts; i++) {
    last = await fetchOnce(url);
    if (last.status === 200) return last;
    if (last.status === 429 || last.status === -1) await sleep(2500 * (i + 1)); // rate/timeout backoff
    else break; // a clean 404 stays a 404
  }
  return last;
}
function stripHtml(html) {
  let h = String(html);
  h = h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  return h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function shingles(txt, k = 5) {
  const t = txt.toLowerCase().split(' ');
  const out = new Set();
  for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k).join(' '));
  return out;
}
function jaccard(a, b) {
  const sa = shingles(a), sb = shingles(b);
  if (!sa.size && !sb.size) return 1;
  return (sa.size && sb.size) ? (sa.size + sb.size - 2 * [...sa].filter(x => sb.has(x)).size) / (sa.size + sb.size - [...sa].filter(x => sb.has(x)).size) : 0;
}

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'twin-registry.json'), 'utf8'));
const isDomain = (s) => String(s || '').startsWith('Domain:');
const pageOf = (s) => String(s || '').replace(/^(Console|Domain):\//, '');

const at = new Date().toISOString();
const day = at.slice(0, 10);
const errors = [];

// 1) cross-repo twin pages, live
const pages = {};
for (const page of CROSS_PAGES) {
  const D = await fetchText(BASE.Domain + page); await sleep(350);
  const C = await fetchText(BASE.Console + page); await sleep(350);
  const entry = { domainStatus: D.status, consoleStatus: C.status };
  if (D.body && C.body) {
    const tD = stripHtml(D.body), tC = stripHtml(C.body);
    entry.textLen = { Domain: tD.length, Console: tC.length };
    entry.jaccard5 = Number(jaccard(tD, tC).toFixed(4));
  }
  pages[page] = entry;
}

// 2) intra-Domain candidate pairs, live
const intra = [];
for (const [a, b] of INTRA_PAIRS) {
  const A = await fetchText(BASE.Domain + a); await sleep(350);
  const B = await fetchText(BASE.Domain + b); await sleep(350);
  const e = { a, b, domainStatus: { a: A.status, b: B.status } };
  if (A.body && B.body) e.jaccard5 = Number(jaccard(stripHtml(A.body), stripHtml(B.body)).toFixed(4));
  intra.push(e);
}

// 3) registered pairs — capability evidence, measured live
const registeredChecks = [];
for (const p of registry.pairs) {
  const check = { id: p.id, registered: true, differentiated: !!p.differentiated, status: p.status || (p.differentiated ? 'DIFFERENTIATED' : 'PENDING') };
  const ev = p.evidence || {};
  if (p.differentiated) {
    let ok = true;
    if (ev.bookUrl) {
      const book = await fetchText(BASE.Domain + ev.bookUrl); await sleep(350);
      check.book = { url: ev.bookUrl, status: book.status };
      if (book.status === 200 && ev.bookFormat) {
        try { check.book.formatOk = JSON.parse(book.body).format === ev.bookFormat; } catch (_) { check.book.formatOk = false; }
      }
      if (book.status !== 200 || check.book.formatOk === false) ok = false;
    }
    if (Array.isArray(ev.books)) {
      check.books = {};
      for (const b of ev.books) {
        const r = await fetchText(BASE.Domain + b); await sleep(350);
        check.books[b] = r.status;
        if (r.status !== 200) ok = false;
      }
    }
    const aSide = isDomain(p.a) ? 'Domain' : 'Console';
    const bSide = isDomain(p.b) ? 'Domain' : 'Console';
    const pageA = await fetchText(BASE[aSide] + pageOf(p.a)); await sleep(350);
    const pageB = await fetchText(BASE[bSide] + pageOf(p.b)); await sleep(350);
    const mk = evidenceMarkers(ev, { aIsDomain: aSide === 'Domain', bIsDomain: bSide === 'Domain' });
    if (pageA.body && mk.a) check.markerOnA = pageA.body.includes(mk.a);
    if (pageB.body && mk.b) check.markerOnB = pageB.body.includes(mk.b);
    if (mk.a && check.markerOnA === false) ok = false;
    if (mk.b && check.markerOnB === false) ok = false;
    if (ev.absenceOnA && pageA.body) { check.absenceOnA = !pageA.body.includes(ev.absenceOnA); if (!check.absenceOnA) ok = false; }
    if (ev.absenceCross && pageA.body && pageB.body) {
      const crossB = ev.bMarker || mk.b, crossA = ev.aMarker || mk.a;
      check.absenceCross = !(crossB && pageA.body.includes(crossB)) && !(crossA && pageB.body.includes(crossA));
      if (!check.absenceCross) ok = false;
    }
    if (pageA.status !== 200 || pageB.status !== 200) { ok = false; check.fetchNote = 'page fetch failed - evidence not judgeable this run'; }
    check.evidenceOk = ok;
  }
  registeredChecks.push(check);
}

// 4) unknown near-dup detection: any cross pair >= NEAR_DUP that is NOT the registered
//    pair's two sides (registered pairs are judged by their own checks above)
const registeredSides = new Set();
for (const p of registry.pairs) { registeredSides.add(pageOf(p.a)); registeredSides.add(pageOf(p.b)); }
const unknownNearDups = [];
for (const [page, e] of Object.entries(pages)) {
  if (typeof e.jaccard5 === 'number' && e.jaccard5 >= NEAR_DUP && !registeredSides.has(page)) unknownNearDups.push({ page, jaccard5: e.jaccard5 });
}
for (const e of intra) {
  const aKnown = registeredSides.has(e.a), bKnown = registeredSides.has(e.b);
  if (typeof e.jaccard5 === 'number' && e.jaccard5 >= NEAR_DUP && !(aKnown && bKnown)) unknownNearDups.push({ page: `${e.a} ~ ${e.b}`, jaccard5: e.jaccard5 });
}

const crossPairs = Object.entries(pages).filter(([, e]) => typeof e.jaccard5 === 'number');
const crossNearDupCount = crossPairs.filter(([, e]) => e.jaccard5 >= NEAR_DUP).length;
const meanJ = crossPairs.length ? crossPairs.reduce((s, [, e]) => s + e.jaccard5, 0) / crossPairs.length : null;

const report = {
  tool: 'twin-audit.mjs',
  runAt: at,
  day,
  method: { textSimilarity: 'Jaccard over 5-token shingles of stripped live HTML', nearDupThreshold: NEAR_DUP, sources: BASE },
  measured: {
    crossPairsMeasured: crossPairs.length,
    crossNearDupPairs: crossNearDupCount,
    crossMeanJaccard: meanJ === null ? null : Number(meanJ.toFixed(4)),
    intraPairsMeasured: intra.length,
    unknownNearDupPairs: unknownNearDups.length,
    errors: errors.length,
  },
  crossPages: pages,
  intraPairs: intra,
  registeredChecks,
  unknownNearDups,
  gate: {
    rule: 'issue fires when an UNKNOWN pair measures >= 0.95 with no registered distinct function, or a DIFFERENTIATED pair loses its capability evidence',
    lostEvidence: registeredChecks.filter(c => c.differentiated && c.evidenceOk === false).map(c => c.id),
    fire: unknownNearDups.length > 0 || registeredChecks.some(c => c.differentiated && c.evidenceOk === false),
  },
  verdict: crossNearDupCount
    ? `${crossNearDupCount}/${crossPairs.length} live cross-repo page pairs remain at Jaccard >= ${NEAR_DUP} (registered/pending ones tracked in agents/twin-registry.json)`
    : `no live cross-repo page pair measures >= ${NEAR_DUP}`,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, `report-${day}.json`), JSON.stringify(report, null, 1) + '\n');
fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify({ at, day, gateFired: report.gate.fire, unknownNearDupPairs: unknownNearDups.length, crossNearDupPairs: crossNearDupCount, measured: report.measured }, null, 1) + '\n');
// shell gate reads this marker (node exits 0 either way — the shell decides)
fs.writeFileSync('/tmp/twin-issue.json', JSON.stringify({ fire: report.gate.fire, unknownNearDups, lostEvidence: report.gate.lostEvidence, day }, null, 1));
console.log(JSON.stringify({ crossPairsMeasured: report.measured.crossPairsMeasured, crossNearDupPairs: crossNearDupCount, crossMeanJaccard: report.measured.crossMeanJaccard, unknownNearDupPairs: unknownNearDups.length, registeredChecks: registeredChecks.map(c => ({ id: c.id, evidenceOk: c.evidenceOk === undefined ? 'n/a' : c.evidenceOk, status: c.status })), gateFired: report.gate.fire }, null, 1));
