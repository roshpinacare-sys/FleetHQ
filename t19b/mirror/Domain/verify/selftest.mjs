#!/usr/bin/env node
/* ═══════════ selftest.mjs — zero-dep selftest for Domain/verify/index.html (zai-12c) ═══════════
   Runs the page's ACTUAL pure core (extracted from the <script> block) against fixtures.
   Offline by design: no network, no DOM. Every vector must come back green.
   Run: node selftest.mjs → prints N/N PASS and exits 0; any failure exits 1. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf8');

/* ── extract the page's real script (the same code the browser runs) ── */
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found in index.html'); process.exit(1); }
const code = m[1];

/* window stub (Node) — the script's UI wiring is guarded by typeof document checks */
let VP = null;
try {
  const factory = new Function('window', code + '\n;return (window && window.VP) ? window.VP : null;');
  VP = factory({});
} catch (e) {
  console.error('FAIL: page script threw under stub:', e.message);
  process.exit(1);
}
if (!VP) { console.error('FAIL: window.VP not exported'); process.exit(1); }

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; console.log('  FAIL  ' + name + ' — ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

console.log('VERIFY-PRODUCT SELFTEST — fixtures against the page\'s real core\n');

/* 1-2 · esc(): XSS vectors must come out fully escaped */
check('esc() escapes <img src=x onerror=alert(1)> (no raw <img, escaped lt/gt/quotes)',
  () => {
    const out = VP.esc('<img src=x onerror=alert(1)>');
    assert(out === '&lt;img src=x onerror=alert(1)&gt;', 'got: ' + out);
    assert(!/[<>]/.test(out), 'raw angle bracket survived');
  });
check('esc() escapes script/quote injection " ><script> and attribute-breaker \' "',
  () => {
    const v = '"><script>alert("x")</script><a href=\'j\'>';
    const out = VP.esc(v);
    assert(!/[<>]/.test(out), 'raw angle bracket survived');
    assert(!/"/.test(out) && !/'/.test(out), 'raw quote survived');
    assert(out.includes('&lt;script&gt;'), 'script tag not escaped');
  });
check('esc() leaves plain text intact and returns string for null/undefined',
  () => {
    assert(VP.esc('headcorner/saos-week-20261011') === 'headcorner/saos-week-20261011', 'plain text mangled');
    assert(VP.esc(null) === '' && VP.esc(undefined) === '', 'null/undefined not empty-string');
    assert(VP.esc('a&b') === 'a&amp;b', 'ampersand not escaped');
  });

/* 3-4 · hash normalization: sha256 full → hash16; 16hex as-is; garbage rejected */
check('normalizeHash: full 64-hex sha256 → first-16 hash16 (lowercase)',
  () => {
    const full = '68C891D39DCE9928' + 'abcdef0123456789'.repeat(3);
    const r = VP.normalizeHash(full);
    assert(r.ok && r.hash16 === '68c891d39dce9928' && r.full === true, 'got ' + JSON.stringify(r));
  });
check('normalizeHash: 16-hex ok · whitespace+sha256: prefix tolerated · garbage/40-hex rejected',
  () => {
    const r1 = VP.normalizeHash(' a060933235738c89 ');
    assert(r1.ok && r1.hash16 === 'a060933235738c89', '16hex failed');
    const r2 = VP.normalizeHash('sha256:fdbbcdf2278d8858');
    assert(r2.ok && r2.hash16 === 'fdbbcdf2278d8858', 'sha256:-prefixed 16hex not normalized');
    const r3 = VP.normalizeHash('hello world');
    assert(!r3.ok, 'garbage accepted');
    const r4 = VP.normalizeHash('1234567890123456789012345678901234567890');
    assert(!r4.ok, '40-hex accepted but unsupported');
  });

/* 5 · WIF/private-material guard: refuse shapes, allow public shapes — and never echo */
check('isPrivateMaterial: WIF 5H…/K…/L… and BIP38 6P… refused · STM pubkey and text allowed',
  () => {
    assert(VP.isPrivateMaterial('5H' + 'z'.repeat(49)) === true, '5H WIF not detected');
    assert(VP.isPrivateMaterial('K' + 'z'.repeat(51)) === true, 'K WIF not detected');
    assert(VP.isPrivateMaterial('L' + 'y'.repeat(51)) === true, 'L WIF not detected');
    assert(VP.isPrivateMaterial('6P' + 'z'.repeat(48)) === true, 'BIP38 not detected');
    assert(VP.isPrivateMaterial('STM5jRfQH9DAF2474UQF1GVarShJZhpSPEYZFiZVr8MHV8cNSXDQf') === false, 'public STM key wrongly refused');
    assert(VP.isPrivateMaterial('headcorner') === false, 'plain name wrongly refused');
    assert(VP.isPrivateMaterial('68c891d39dce9928') === false, 'hash16 wrongly refused');
  });

/* 6-7 · hash-verdict classifier against mock key-proof artifacts (verdict passthrough, honest NO-MATCH) */
const MOCK_ARTIFACT = {
  protocol: 'saos/key-proof/1',
  generatedAt: '2026-10-11T21:06:00.499Z', finishedAt: '2026-10-11T21:06:46.314Z',
  summary: { DEAD: 9, 'ALIVE-ALERT': 0, UNKNOWN: 0, 'UNKNOWN-NOT-CHAIN-TESTABLE': 3 },
  verdicts: [
    { hash16: '68c891d39dce9928', kind: 'pubkey', verdict: 'DEAD',
      derivedPubkey: 'STM8mSbBz8zsMfBow2xa1yfTuNhdp6KZf3v7kAs1BSQAB1AMQM1Fw',
      where: [{ repo: 'saos-jummper', path: 'docs/KEY-INCIDENT.md' }] },
    { hash16: 'dadf2d6c8cfdc1aa', kind: 'passphrase', verdict: 'UNKNOWN-NOT-CHAIN-TESTABLE',
      where: [{ repo: 'roshpina', path: 'agent/vault/recovery-meta-2026-09-12.json' }] },
    { hash16: 'aa0aa0aa0aa0aa0a', kind: 'pubkey', verdict: 'ALIVE-ALERT',
      derivedPubkey: 'STM111111111111111111111111111111111111111111111111', where: [] }
  ]
};
check('classifyHash: DEAD → verdict+derivedPubkey+kind+checkedAt+where from the artifact',
  () => {
    const c = VP.classifyHash('68C891D39DCE9928', MOCK_ARTIFACT);
    assert(c.verdict === 'DEAD', 'verdict ' + c.verdict);
    assert(c.pubkey === 'STM8mSbBz8zsMfBow2xa1yfTuNhdp6KZf3v7kAs1BSQAB1AMQM1Fw', 'pubkey');
    assert(c.kind === 'pubkey', 'kind');
    assert(c.checkedAt === '2026-10-11T21:06:46.314Z', 'checkedAt');
    assert(c.whereCount === 1 && /KEY-INCIDENT\.md$/.test(c.whereFirst), 'where');
  });
check('classifyHash: UNKNOWN-NOT-CHAIN-TESTABLE passthrough · ALIVE-ALERT alert · NO-MATCH honest (incl. null artifact)',
  () => {
    assert(VP.classifyHash('dadf2d6c8cfdc1aa', MOCK_ARTIFACT).verdict === 'UNKNOWN-NOT-CHAIN-TESTABLE', 'UNKNOWN verdict');
    assert(VP.classifyHash('aa0aa0aa0aa0aa0a', MOCK_ARTIFACT).verdict === 'ALIVE-ALERT', 'ALIVE verdict');
    const nm = VP.classifyHash('0123456789abcdef', MOCK_ARTIFACT);
    assert(nm.verdict === 'NO-MATCH' && !nm.pubkey, 'NO-MATCH should carry no pubkey');
    assert(VP.classifyHash('0123456789abcdef', null).verdict === 'NO-MATCH', 'null artifact crash');
  });

/* 8-9 · post-input parser: 3 accepted formats + rejections */
check('parsePostInput: full URL (steemit/other domain, query-string) → author+permlink',
  () => {
    const r = VP.parsePostInput('https://steemit.com/@headcorner/saos-week-20261011?utm=x');
    assert(r.ok && r.author === 'headcorner' && r.permlink === 'saos-week-20261011', 'got ' + JSON.stringify(r));
    const r2 = VP.parsePostInput('https://steemit.com/hive-1/@headcorner/saos-week-20261011');
    assert(r2.ok && r2.author === 'headcorner' && r2.permlink === 'saos-week-20261011', 'tagged URL failed');
  });
check('parsePostInput: author/permlink and @author/permlink → same result · garbage → honest fail',
  () => {
    const r1 = VP.parsePostInput('headcorner/saos-week-20261011');
    const r2 = VP.parsePostInput('@headcorner/saos-week-20261011');
    assert(r1.ok && r2.ok && r1.author === 'headcorner' && r2.permlink === 'saos-week-20261011', 'bare/@ formats');
    assert(!VP.parsePostInput('').ok, 'empty accepted');
    assert(!VP.parsePostInput('headcorner').ok, 'bare author accepted (belongs to account mode)');
    assert(!VP.parsePostInput('https://steemit.com/@headcorner/').ok, 'missing permlink accepted');
  });

/* 10 · machine-disclosure marker detection: positive (real campaign markers) / negative */
check('hasMachineDisclosure: positive on campaign disclosure (body tail) · negative on plain post · empty-safe',
  () => {
    const pos = VP.hasMachineDisclosure({ body: 'Seven days of receipts…\n\n**מסגרת-כנות:** פוסט זה נכתב ומשודר על-ידי סוכן אוטונומי עם מפתח-**posting בלבד**.\n\n— SAOS · machine-authored, posting-only', json_metadata: '{"tags":["saos"]}' });
    assert(pos.yes === true, 'markers not found: ' + JSON.stringify(pos.markers));
    assert(pos.markers.includes('machine-authored') && pos.markers.includes('מסגרת-כנות'), 'expected markers listed');
    const neg = VP.hasMachineDisclosure({ body: 'Delicious recipe for cookies. 200C, 12 minutes.', json_metadata: '{"tags":["food"]}' });
    assert(neg.yes === false, 'false positive on plain post');
    const none = VP.hasMachineDisclosure(null);
    assert(none.yes === false && Array.isArray(none.markers), 'null post crash');
  });

/* 11 · staleness stamp: "נבדק:" format law — YYYY-MM-DD HH:MM UTC, null on junk */
check('utcStamp: matches ^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} UTC$ · null on garbage (never a fake stamp)',
  () => {
    const s = VP.utcStamp(new Date(Date.UTC(2026, 9, 11, 21, 6, 46)));
    assert(/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$/.test(s), 'got: ' + s);
    assert(s === '2026-10-11 21:06 UTC', 'UTC math wrong: ' + s);
    assert(VP.utcStamp('not-a-date') === null, 'garbage produced a stamp');
    assert(VP.utcStamp(null) !== null, 'default-now stamp missing');
  });

/* 12 · vests math: SP = vests × (tvfs/tvs) with chain-shaped strings */
check('vestsPerSp + vestStrToSp: chain-shaped strings → effective SP math exact',
  () => {
    const vps = VP.vestsPerSp({ total_vesting_fund_steem: '200000000.000 STEEM', total_vesting_shares: '400000000.000000 VESTS' });
    assert(vps === 0.5, 'vps ' + vps);
    const sp = VP.vestStrToSp('1000000.000000 VESTS', vps);
    assert(sp === 500000, 'sp ' + sp);
    assert(VP.vestStrToSp('1000000.000000 VESTS', null) === null, 'null vps crash');
    assert(VP.vestsPerSp({ total_vesting_fund_steem: 'x STEEM', total_vesting_shares: 'y VESTS' }) === null, 'junk strings crash');
  });

console.log('\nRESULT: ' + pass + '/' + (pass + fail) + ' PASS, ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
console.log('ALL GREEN — the verify-page core is honest: escaped, classified, stamped, and private-material-refusing.');
