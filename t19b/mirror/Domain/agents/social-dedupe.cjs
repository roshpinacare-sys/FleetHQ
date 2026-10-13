'use strict';
/**
 * social-dedupe.cjs — cross-account dedupe + voice profiles for the REAL posting path (r145-c).
 *
 * Faithful CommonJS port of mini-services/curation/dedupe.ts (r144-i2) so the Domain
 * cloud engine (fleet-social.cjs) consults the SAME gate the home daemon runs:
 *   1. 11 per-account voice profiles (tone/structure/opener-pool/closer-pool),
 *      deterministic (dayIdx+slot) rotation — no sentence shared between accounts.
 *   2. Pre-cast memory: last comments of ALL our accounts from the live chain
 *      (bridge.get_account_posts {sort:"comments"} — the proven path), normalized
 *      content-Jaccard (threshold 0.6) — near-duplicate ⇒ SKIP, logged, never signed.
 *   3. Comment builder: every account quotes the target's real fragment through its
 *      OWN quote-line pattern (kills the measured 19.2% shared-template fingerprint
 *      of fleet-social v2: "stopped me" / "your piece" / "specifically the part with").
 *
 * Selftest: node agents/social-dedupe.cjs --selftest
 * Doctrine: keyless module · fail-soft memory · zero secrets · every verdict carries numbers.
 */
const fs = require('fs');
const path = require('path');

const NEAR_DUP_THRESHOLD = 0.6;
// T3 hard gate (master plan 2026-10-11): POSTS get their own, tighter bar — the audit
// measured byte-identical post pairs (sim=1.0) crossing the old advisory layer. 0.85 is
// the plan's number: at/above it the post NEVER signs, no matter which desk built it.
const POST_DUP_THRESHOLD = 0.85;
// T3 thread-lock: two fleet voices inside one thread within the window is the measured
// coordination fingerprint — the second voice defers (one account per thread per hour).
const THREAD_LOCK_WINDOW_MIN = 60;
const MEMORY_WINDOW = 50;
const MEMORY_CACHE = path.join(__dirname, 'social-memory-cache.json');
const MEMORY_REFRESH_MS = 90 * 60 * 1000;

const FLEET_ACCOUNTS = ['cashmachine', 'haran', 'israelnews', 'lsa', 'macrame', 'siq', 'tov', 'wic', 'wog', 'woq', 'headcorner'];

// ── 1) voice profiles — identical table to the home daemon (curation/dedupe.ts) ──
const VOICE_PROFILES = [
  { account: 'cashmachine', tone: 'ledger-dry', structure: 'number first, then the lesson', openers: ['The ledger line reads:', 'Ran the numbers again:'], closers: ['The arithmetic holds either way.', 'Small positions, honest math.'] },
  { account: 'israelnews', tone: 'plain-report', structure: 'what happened, what is verified', openers: ['Checked the story:', 'Two sources later:'], closers: ['Still waiting on the second source.', 'Facts first, the rest follows.'] },
  { account: 'haran', tone: 'patient-narrative', structure: 'old road, modern lesson', openers: ['Old roads repeat themselves:', 'A map from long ago:'], closers: ['Routes change, trade does not.', 'The map keeps teaching.'] },
  { account: 'macrame', tone: 'maker-practical', structure: 'cost in cents, then the craft', openers: ['Counted the materials first:', 'Worked this with my hands:'], closers: ['Cents add up the same way knots do.', 'Measure twice, cut once.'] },
  { account: 'wic', tone: 'quiet-hours', structure: 'early-morning observation', openers: ['Before the day gets loud:', 'From the quiet hours:'], closers: ['The morning kept its promise.', 'Routines outlast motivation.'] },
  { account: 'wog', tone: 'text-minded', structure: 'quote, then what the words carried', openers: ['The old words say:', 'Read it again today:'], closers: ['Old words, new weather.', 'Translation is interpretation.'] },
  { account: 'woq', tone: 'question-first', structure: 'a question, then a test for the reader', openers: ['A question worth holding:', 'Instead of an answer:'], closers: ['Try it and report back.', 'What would you test first?'] },
  { account: 'siq', tone: 'field-note', structure: 'short, unadorned observation', openers: ['Field note:', 'Small thing noticed:'], closers: ['Noted without decoration.', 'That was the whole thing.'] },
  { account: 'lsa', tone: 'editor-precise', structure: 'one precise sentence, then one more', openers: ['One sentence at a time:', 'From the archive shelf:'], closers: ['Fewer words, same weight.', 'The sentence survives editing.'] },
  { account: 'tov', tone: 'constructive-roundup', structure: 'what worked, then why', openers: ['Things that worked this week:', 'One thing that held:'], closers: ['No cheerleading, just receipts.', 'It worked; the numbers agree.'] },
  { account: 'headcorner', tone: 'operations-receipt', structure: 'cadence, fuel, logistics', openers: ['Operations log:', 'Cadence check:'], closers: ['The beat continues.', 'Fuel measured, course held.'] },
];

// per-account quote-line patterns — the fix for the measured shared-template fingerprint:
// v2 stamped "Your piece \"…\" stopped me, specifically the part with X" on every comment.
// Here the SAME real fragment is phrased by the speaker's own hand; zero phrasing shared.
const QUOTE_LINES = {
  cashmachine: (t, f) => `From "${t}": ${f}. The number is the honest part.`,
  israelnews: (t, f) => `Reading "${t}", the verifiable bit is ${f}.`,
  haran: (t, f) => `Your piece "${t}" reads like a marker on an old road, and ${f} is where it points.`,
  macrame: (t, f) => `The part of "${t}" I keep coming back to is ${f}.`,
  wic: (t, f) => `Quiet observation on "${t}": ${f}.`,
  wog: (t, f) => `A line worth rereading from "${t}": ${f}.`,
  woq: (t, f) => `"${t}" leaves a question open, right where ${f} sits.`,
  siq: (t, f) => `Noted from "${t}": ${f}.`,
  lsa: (t, f) => `One line from "${t}" earns its place: ${f}.`,
  tov: (t, f) => `What held in "${t}": ${f}.`,
  headcorner: (t, f) => `Operations note on "${t}": the measurable line is ${f}.`,
};

function dayIdx() { return Math.floor(Date.now() / 86400000); }

function voiceProfileFor(account, slot) {
  const p = VOICE_PROFILES.find(v => v.account === account);
  if (!p) return null;
  const d = dayIdx();
  const pick = (arr) => (arr.length ? arr[(d + (slot || 0)) % arr.length] : '');
  return { account: p.account, tone: p.tone, structure: p.structure, opener: pick(p.openers), closer: pick(p.closers) };
}

// ── 2) normalized token overlap — same math as the audit + home gate ──
const STOP = new Set(('the a an and or but if then than that this these those of to in on for with as at by from is are was were be been being it its it\'s their his her our your my not no so such which who whom what when where why how all any both each few more most other some only own same too very can will just should now do does did done has have had having i we you he she they them us also there here about into over under again once').split(' '));
const stripMd = (s) => String(s).replace(/https?:\/\/\S+/g, ' ').replace(/[*_#>`~|[\]()]/g, ' ');
function contentTokens(text) {
  return stripMd(text).toLowerCase().replace(/[^a-z0-9\u0590-\u05FF]+/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));
}
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
}
function containment(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const mn = Math.min(A.size, B.size);
  return mn ? inter / mn : 0;
}

// ── 3) pre-cast memory — live chain, 5 latest comments per account, fail-soft ──
async function fetchRpc(method, params) {
  const r = await fetch('https://api.steemit.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function buildMemory(force) {
  let cache = null;
  try {
    cache = JSON.parse(fs.readFileSync(MEMORY_CACHE, 'utf8'));
    if (cache && cache.at && !force && Date.now() - Date.parse(cache.at) < MEMORY_REFRESH_MS && Array.isArray(cache.entries)) return cache.entries;
  } catch (_) { /* first run */ }
  const entries = [];
  for (const acc of FLEET_ACCOUNTS) {
    try {
      const rows = await fetchRpc('bridge.get_account_posts', { sort: 'comments', account: acc, limit: 5 });
      for (const p of rows || []) {
        entries.push({ author: String(p.author || acc), permlink: String(p.permlink || ''), created: String(p.created || ''), body: String(p.body || ''), source: 'steem-live' });
      }
    } catch (_) { /* fail-soft: disk cache stays the truth until next refresh */ }
  }
  const trimmed = entries.slice(0, MEMORY_WINDOW);
  try { fs.writeFileSync(MEMORY_CACHE, JSON.stringify({ at: new Date().toISOString(), entries: trimmed }, null, 1)); } catch (_) {}
  return trimmed;
}

// ── 4) the gate — the single crossing point before any comment broadcast ──
function gateCast(account, text, memory, slot) {
  const prof = voiceProfileFor(account, slot);
  if (!prof) return { verdict: 'SKIP', reason: 'no-voice-profile', bestSim: 0, partner: null, profile: null };
  const mine = contentTokens(text);
  let bestSim = 0, partner = null;
  for (const e of memory || []) {
    if (e.author === account) continue; // cross-account only
    const sim = jaccard(mine, contentTokens(e.body));
    if (sim > bestSim) { bestSim = sim; partner = { author: e.author, permlink: e.permlink }; }
  }
  if (bestSim >= NEAR_DUP_THRESHOLD) {
    return { verdict: 'SKIP', reason: `near-duplicate ${bestSim.toFixed(3)} >= ${NEAR_DUP_THRESHOLD} vs @${partner ? partner.author : '?'}`, bestSim: Number(bestSim.toFixed(3)), partner, profile: { tone: prof.tone, opener: prof.opener, closer: prof.closer } };
  }
  return { verdict: 'PASS', reason: `max cross-account sim ${bestSim.toFixed(3)} < ${NEAR_DUP_THRESHOLD}`, bestSim: Number(bestSim.toFixed(3)), partner, profile: { tone: prof.tone, opener: prof.opener, closer: prof.closer } };
}

// ── 4b) T3 POST gate — the hard crossing point before any blog broadcast ──
// Pure (no IO, no network): the caller feeds the fleet's recent post bodies (live chain
// in the engine). FAIL-CLOSED: a missing recent list blocks, it never waves through.
function gatePost(body, recentPosts) {
  if (!Array.isArray(recentPosts)) {
    return { ok: false, why: 'recent-unavailable-fail-closed', bestSim: null, partner: null };
  }
  const mine = contentTokens(String(body || ''));
  let bestSim = 0, partner = null;
  for (const p of recentPosts) {
    if (!p || !p.body || typeof p.body !== 'string') continue;
    const sim = jaccard(mine, contentTokens(p.body)); // normalized token overlap (stopword-stripped)
    if (sim > bestSim) { bestSim = sim; partner = p.author || null; }
  }
  if (bestSim >= POST_DUP_THRESHOLD) {
    return { ok: false, why: `near-duplicate-post ${bestSim.toFixed(3)} >= ${POST_DUP_THRESHOLD}`, bestSim: Number(bestSim.toFixed(3)), partner };
  }
  return { ok: true, why: `max fleet-post sim ${bestSim.toFixed(3)} < ${POST_DUP_THRESHOLD}`, bestSim: Number(bestSim.toFixed(3)), partner };
}

// ── 4c) T3 THREAD LOCK — one fleet voice per thread per hour ──
// Pure: caller passes get_content_replies(author, permlink) rows. Another fleet
// account inside the window => the candidate DEFERS (that's the measured fingerprint
// killer). Own replies and non-fleet repliers never lock. Fail-closed on bad input.
function threadLockVerdict(replies, opts = {}) {
  const author = opts.author;
  const windowMin = Number.isFinite(opts.windowMin) ? opts.windowMin : THREAD_LOCK_WINDOW_MIN;
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  if (!Array.isArray(replies)) return { ok: false, why: 'replies-unavailable-fail-closed', by: null };
  for (const r of replies) {
    if (!r || !r.author || r.author === author) continue;
    if (!FLEET_ACCOUNTS.includes(r.author)) continue; // external humans never lock
    const raw = String(r.created || '');
    const ts = Date.parse(raw.includes('T') ? (raw.endsWith('Z') ? raw : raw + 'Z') : raw.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(ts)) continue;
    const ageMin = (nowMs - ts) / 60000;
    if (ageMin >= 0 && ageMin <= windowMin) {
      return { ok: false, why: `thread-locked ${ageMin.toFixed(1)}min <= ${windowMin}min`, by: r.author, ageMin: Number(ageMin.toFixed(1)), windowMin };
    }
  }
  return { ok: true, why: 'no-fleet-voice-in-window', by: null, windowMin };
}

// ── 5) comment builder — the target's real fragment in the speaker's own hand ──
function buildComment({ account, slot, targetTitle, fragment, insight }) {
  const prof = voiceProfileFor(account, slot);
  if (!prof) return null;
  const q = (QUOTE_LINES[account] || ((t, f) => `From "${t}": ${f}.`))(targetTitle, fragment);
  const parts = [q];
  if (insight) parts.push(insight);
  parts.push(prof.closer);
  return parts.filter(Boolean).join('\n\n');
}

// ── 6) selftest ──
async function selftest() {
  const out = { name: 'social-dedupe selftest', pass: 0, fail: 0, results: [] };
  const t = (name, ok, detail) => { out[ok ? 'pass' : 'fail']++; out.results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

  // 1: near-dup skipped
  const mem = [
    { author: 'tov', permlink: 're-x-tov', created: '2026-10-01T00:00:00', body: 'What held in "Grid notes": 4,616 SP. No cheerleading, just receipts.', source: 'test' },
    { author: 'wog', permlink: 're-y-wog', created: '2026-10-01T01:00:00', body: 'A line worth rereading from "Other notes": 1,234 SP. Old words, new weather.', source: 'test' },
  ];
  const dupBody = 'What held in "Grid notes": 4,616 SP. No cheerleading, just receipts.';
  const g1 = gateCast('lsa', dupBody, mem, 0);
  t('near-dup SKIP', g1.verdict === 'SKIP' && g1.bestSim >= NEAR_DUP_THRESHOLD, `bestSim=${g1.bestSim}`);

  // 2: distinct passes
  const g2 = gateCast('lsa', 'One sentence at a time:\nA wholly different observation about archive shelving and metadata.', mem, 1);
  t('distinct PASS', g2.verdict === 'PASS', `bestSim=${g2.bestSim}`);

  // 3: same-account exemption
  const g3 = gateCast('tov', dupBody, mem, 0);
  t('same-account exempt', g3.verdict === 'PASS', `bestSim=${g3.bestSim}`);

  // 4: no profile ⇒ SKIP
  const g4 = gateCast('stranger', dupBody, mem, 0);
  t('no-profile SKIP', g4.verdict === 'SKIP' && g4.reason === 'no-voice-profile');

  // 5: 11 distinct profiles (tone|structure unique)
  const sigs = new Set(VOICE_PROFILES.map(p => `${p.tone}|${p.structure}`));
  t('11 distinct profiles', VOICE_PROFILES.length === 11 && sigs.size === 11, `sigs=${sigs.size}`);

  // 6: quote-lines pairwise distinct phrasing (no shared template fingerprint)
  const frags = [...new Set(Object.values(QUOTE_LINES).map(fn => fn('T', '42 SP')))];
  t('11 distinct quote-lines', frags.length === 11);

  // 7: builder uses profile + fragment, no banned fingerprints
  const body = buildComment({ account: 'siq', slot: 2, targetTitle: 'Day notes', fragment: '4,616 SP', insight: 'Small things hold.' });
  t('builder composes', !!body && body.includes('4,616 SP') && body.includes('Noted from'), body ? body.slice(0, 60) : 'null');
  t('no v2 fingerprint', !/stopped me|specifically the part with|your piece/i.test(body || ''));

  // 8: deterministic rotation
  const a = voiceProfileFor('wic', 3), b = voiceProfileFor('wic', 3);
  t('rotation deterministic', a.opener === b.opener && a.closer === b.closer);

  // 9 (T3): POST gate — near-duplicate post is refused, fresh post passes
  const recent = [
    { author: 'haran', body: 'Old roads repeat themselves: the silk route cities grew exactly where water and toll met. The arithmetic of caravans still explains logistics parks.' },
    { author: 'cashmachine', body: 'Ran the numbers again: a 4% fill rate at 1.3% spread is positive only if the round trip clears both fees. The ledger decides, not the mood.' },
  ];
  const dupBlock = gatePost(recent[0].body, recent);
  t('post-gate blocks near-dup', dupBlock.ok === false && dupBlock.bestSim >= POST_DUP_THRESHOLD, JSON.stringify(dupBlock));
  const dupPass = gatePost('Quiet hours: the kettle, the page, and the first light. Nothing loud happened and that was the point of it.', recent);
  t('post-gate passes fresh post', dupPass.ok === true && dupPass.bestSim < POST_DUP_THRESHOLD, JSON.stringify(dupPass));
  const dupClosed = gatePost('anything at all', null);
  t('post-gate fail-closed on missing recent', dupClosed.ok === false && dupClosed.why === 'recent-unavailable-fail-closed');

  // 10 (T3): thread lock — a fleet voice inside the window locks, an external voice does not
  const now = Date.now();
  const locked = threadLockVerdict([
    { author: 'haran', created: new Date(now - 12 * 60000).toISOString().replace('T', ' ').slice(0, 19) },
    { author: 'stranger1', created: new Date(now - 5 * 60000).toISOString().replace('T', ' ').slice(0, 19) },
  ], { author: 'wic', nowMs: now });
  t('thread-lock blocks recent fleet voice', locked.ok === false && locked.by === 'haran', JSON.stringify(locked));
  const open = threadLockVerdict([
    { author: 'haran', created: new Date(now - 3 * 3600000).toISOString().replace('T', ' ').slice(0, 19) },
    { author: 'stranger1', created: new Date(now - 5 * 60000).toISOString().replace('T', ' ').slice(0, 19) },
  ], { author: 'wic', nowMs: now });
  t('thread-lock passes stale/external only', open.ok === true, JSON.stringify(open));
  const closed = threadLockVerdict(null, { author: 'wic' });
  t('thread-lock fail-closed on bad replies', closed.ok === false && closed.why === 'replies-unavailable-fail-closed');

  for (const r of out.results) console.log(r);
  console.log(JSON.stringify({ pass: out.pass, fail: out.fail }));
  return out.fail === 0;
}

if (require.main === module && process.argv.includes('--selftest')) {
  selftest().then(ok => process.exit(ok ? 0 : 1)).catch(e => { console.error('selftest error', e); process.exit(1); });
}

module.exports = {
  NEAR_DUP_THRESHOLD, POST_DUP_THRESHOLD, THREAD_LOCK_WINDOW_MIN, MEMORY_WINDOW, FLEET_ACCOUNTS, VOICE_PROFILES, QUOTE_LINES,
  voiceProfileFor, contentTokens, jaccard, containment, buildMemory, gateCast, gatePost, threadLockVerdict, buildComment, selftest,
};
