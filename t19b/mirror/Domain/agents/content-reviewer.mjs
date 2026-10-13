#!/usr/bin/env node
/**
 * content-reviewer.mjs — duplication + staleness watchdog on public content (r144-i2)
 *
 * What it does (read-only on the chain, one report file in this repo):
 *   1. Pulls the last 24h public comments AND posts of the community accounts
 *      (roster below, same accounts as agents/personas.json + self-audience.cjs)
 *      via the public Steem API (bridge.get_account_posts).
 *   2. Runs the same cross-account duplication logic as the home curation daemon's
 *      dedupe layer (mini-services/curation/dedupe.ts): normalized token-overlap
 *      (content-Jaccard, markdown-stripped, stopwords removed), near-duplicate
 *      threshold 0.6.
 *   3. Measures staleness: which accounts published nothing (post or comment) in
 *      the last 24h.
 *   4. Writes content-review/report-YYYY-MM-DD.json in this repo.
 *
 * The calling workflow commits the report and, if duplication > 30%, opens an
 * issue titled "content-review: duplication X%".
 *
 * Doctrine: public read-only measurement, zero keys, zero secrets, honest numbers.
 * Language measured 2026-10-01: the community accounts publish in English (Z-25);
 * the similarity logic is language-agnostic regardless.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RPC = 'https://api.steemit.com';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'content-review');

// Community accounts roster — measured from the live publishing machinery of this
// repo (the social engine's rotation + head account) and agents/personas.json.
const ACCOUNTS = ['cashmachine', 'haran', 'israelnews', 'lsa', 'macrame', 'siq', 'tov', 'wic', 'wog', 'woq', 'headcorner'];

const WINDOW_H = 24;
const NEAR_DUP_THRESHOLD = 0.6;   // same threshold as the home dedupe layer
const ISSUE_GATE_PCT = 30;        // duplication above this opens an issue

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

const STOP = new Set(('the a an and or but if then than that this these those of to in on for with as at by from is are was were be been being it its it\'s their his her our your my not no so such which who whom what when where why how all any both each few more most other some only own same too very can will just should now do does did done has have had having i we you he she they them us also there here about into over under again once').split(' '));
const stripMd = (s) => String(s).replace(/https?:\/\/\S+/g, ' ').replace(/[*_#>`~|[\]()]/g, ' ');
const tokens = (s) => stripMd(s).toLowerCase().replace(/[^a-z0-9\u0590-\u05FF]+/g, ' ').split(/\s+/).filter(w => w.length >= 3);
const contentTokens = (s) => tokens(s).filter(w => !STOP.has(w));
const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
};
const containment = (a, b) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const mn = Math.min(A.size, B.size);
  return mn ? inter / mn : 0;
};

(async () => {
  const at = new Date().toISOString();
  const day = at.slice(0, 10);
  const since = Date.now() - WINDOW_H * 3600_000;
  const errors = [];

  // 1) pull last comments + posts per account
  const items = []; // {kind, author, permlink, created, body}
  for (const acc of ACCOUNTS) {
    for (const sort of ['comments', 'posts']) {
      try {
        const res = await rpc('bridge.get_account_posts', { sort, account: acc, limit: 10 });
        for (const p of res || []) {
          const created = String(p.created || '');
          if (!created || Date.parse(created + (created.endsWith('Z') ? '' : 'Z')) < since) continue;
          items.push({ kind: sort === 'posts' ? 'post' : 'comment', author: p.author || acc, permlink: p.permlink, created, body: String(p.body || ''), title: String(p.title || '') });
        }
      } catch (e) {
        errors.push({ account: acc, sort, error: String(e.message || e).slice(0, 120) });
      }
    }
  }
  const posts24 = items.filter(i => i.kind === 'post');
  const comments24 = items.filter(i => i.kind === 'comment');

  // 2) cross-account duplication on the 24h window (same math as the home dedupe layer)
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.author === b.author) continue; // cross-account is the risk
      const ta = contentTokens(a.body), tb = contentTokens(b.body);
      const sim = jaccard(ta, tb);
      if (sim >= 0.35 || containment(ta, tb) >= 0.5) {
        pairs.push({
          a: { author: a.author, permlink: a.permlink, kind: a.kind },
          b: { author: b.author, permlink: b.permlink, kind: b.kind },
          sim: Number(sim.toFixed(3)),
          containment: Number(containment(ta, tb).toFixed(3)),
          nearDuplicate: sim >= NEAR_DUP_THRESHOLD,
          snippetA: a.body.replace(/\s+/g, ' ').slice(0, 120),
          snippetB: b.body.replace(/\s+/g, ' ').slice(0, 120),
        });
      }
    }
  }
  const nearDups = pairs.filter(p => p.nearDuplicate);
  const comparable = items.length * (items.length - 1) / 2;
  const crossComparable = (() => { let c = 0; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (items[i].author !== items[j].author) c++; return c; })();
  const pairDuplicationPct = crossComparable ? Number((100 * nearDups.length / crossComparable).toFixed(1)) : 0;
  const touched = new Set();
  for (const p of nearDups) { touched.add(p.a.author + '/' + p.a.permlink); touched.add(p.b.author + '/' + p.b.permlink); }
  const commentLevelPct = items.length ? Number((100 * touched.size / items.length).toFixed(1)) : 0;

  // 3) staleness — which accounts published nothing in the window
  const staleness = ACCOUNTS.map(acc => {
    const p = posts24.filter(x => x.author === acc).length;
    const c = comments24.filter(x => x.author === acc).length;
    const lastAny = items.filter(x => x.author === acc).map(x => x.created).sort().pop() || null;
    return { account: acc, posts24h: p, comments24h: c, lastPublicItemAt: lastAny, silent24h: p === 0 && c === 0 };
  });
  const silent = staleness.filter(s => s.silent24h).map(s => s.account);

  // 4) report
  const report = {
    tool: 'content-reviewer.mjs',
    runAt: at,
    day,
    windowHours: WINDOW_H,
    accounts: ACCOUNTS,
    measured: { posts24h: posts24.length, comments24h: comments24.length, errors },
    duplication: {
      threshold: NEAR_DUP_THRESHOLD,
      similarity: 'content-Jaccard (normalized tokens, markdown-stripped, stopwords removed)',
      comparablePairs: comparable,
      crossAccountPairs: crossComparable,
      nearDuplicatePairs: nearDups.length,
      pairDuplicationPct,
      commentLevelDuplicationPct: commentLevelPct,
      issueGatePct: ISSUE_GATE_PCT,
      gateTripped: pairDuplicationPct > ISSUE_GATE_PCT,
    },
    nearDuplicatePairs: nearDups,
    reportablePairsBelowThreshold: pairs.filter(p => !p.nearDuplicate).sort((x, y) => y.sim - x.sim).slice(0, 10),
    staleness: { silentAccounts24h: silent, silentCount: silent.length, perAccount: staleness },
    verdict: {
      duplication: `${pairDuplicationPct}% of cross-account pairs in the 24h window are near-duplicates (>=${NEAR_DUP_THRESHOLD}); ${commentLevelPct}% of items touched`,
      staleness: silent.length === 0 ? 'all accounts publicly active in the window' : `silent 24h: ${silent.join(', ')}`,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `report-${day}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify({ out: path.relative(ROOT, out), items: items.length, pairDuplicationPct, commentLevelPct, nearDuplicatePairs: nearDups.length, silent24h: silent, gateTripped: report.duplication.gateTripped, errors: errors.length }, null, 1));
})().catch((e) => { console.error('content-reviewer failed honestly:', String(e.message || e).slice(0, 200)); process.exit(1); });
