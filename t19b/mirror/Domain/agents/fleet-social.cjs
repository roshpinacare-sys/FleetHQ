#!/usr/bin/env node
/**
 * fleet-social.cjs — MUTUAL SUPPORT ENGINE (Z-24 steem base · Z-25 English pivot · r145-c v3).
 *
 * r145-c (content-truth wave): the engine now consults the cross-account dedupe layer
 * (agents/social-dedupe.cjs — CommonJS port of the home daemon's curation/dedupe.ts):
 *   · every comment body is built through the speaker's OWN voice profile and quote-line
 *     (11 distinct profiles — the shared v2 template measured 19.2% fingerprint match,
 *     two near-dup pairs at 4.1% pair-level; those are the numbers this kills);
 *   · before ANY broadcast the body crosses gateCast(): content-Jaccard vs the last
 *     comments of ALL our accounts from the live chain (threshold 0.6) — near-dup ⇒ SKIP,
 *     logged in the receipt, never signed;
 *   · support votes, follow graph and reblogs flow exactly as before (untouched).
 *
 * Z-25 changes: comments in ENGLISH ONLY, quoting a cleaned real fragment from the
 * target post (numbers survive any language). Added support votes: every commenting
 * soldier also votes the post it commented on (30% weight, VP-gated, idempotent).
 * Zero AI-telltale markers in anything signed.
 *
 * Three layers:
 *   1. Substantive comments: each soldier comments on one sibling post of the day,
 *      quoting something real from the post (a number or bold line) plus one related
 *      insight from a knowledge card. Zero "great post!".
 *   2. Support votes: comment plus a modest vote, the way a human reader behaves.
 *   3. Follow graph: each soldier follows every fleet member (custom_json follow,
 *      free, idempotent against get_following) and reblogs one sibling deep post.
 *
 * דוקטרינה: verify-then-sign · קריאה-חוזרת לכל תגובה · fail-soft exit-0 · קבלות נטולות-סודות
 * · הגבלות קצב (תגובה 1/חייל/יום, reblog 1/חייל/יום, מעקבים מוגבלים לריצה).
 */
const steem = require('steem');
const fs = require('fs');
const path = require('path');
const dedupe = require('./social-dedupe.cjs');

steem.api.setOptions({ url: 'https://api.steemit.com' });
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.RECEIPT_OUT || path.join(ROOT, 'agents', 'receipts', 'fleet-social-receipt.json');
const ROTATION = ['haran', 'wic', 'woq', 'siq', 'tov', 'israelnews', 'lsa', 'macrame', 'cashmachine', 'wog'];
const HEAD = 'headcorner';
const FLEET_ALL = [...ROTATION, HEAD];
const MAX_FOLLOWS_PER_RUN = 60;
const CARDS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge-cards-en.json'), 'utf8')); } catch (_) { return []; } })();
const VOTE_WEIGHT = 3000;   // 30%, support vote alongside the comment
const VP_GATE = 20;         // skip voting under 20% battery
const HEB = /[\u0590-\u05FF]/;
const clean = (s) => String(s).replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim();

const P = (fn) => new Promise((res, rej) => fn((e, r) => e ? rej(e) : res(r)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadKeys() {
  const raw = process.env.SA_FLEET_KEYS || '';
  if (!raw) return null;
  try { const map = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); return map; } catch (_) { return null; }
}

async function getContent(a, p) { try { return await P(cb => steem.api.getContent(a, p, cb)); } catch (_) { return null; } }

// A real fragment from the post: the first number with a unit (ASCII units first, they
// survive across languages), else the first bold line. Dashes are scrubbed so nothing
// signed ever carries an AI-telltale em-dash.
function realFragment(body) {
  if (!body) return null;
  const numEn = body.match(/\d[\d,.]*\s*(?:SP|%|STEEM|SBD|HIVE|BLURT|accounts?)/);
  if (numEn) return clean(numEn[0]);
  const num = body.match(/\d[\d,.]*\s*(?:חייל|האצל|חשבונ)/);
  if (num) return clean(num[0]);
  const bold = body.match(/\*\*([^*]{6,80})\*\*/);
  return bold ? clean(bold[1]) : null;
}

function relatedInsight(commenter, targetAuthor) {
  if (!CARDS.length) return null;
  const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  const ci = ROTATION.indexOf(commenter), ti = ROTATION.indexOf(targetAuthor);
  const card = CARDS[(doy * 7 + (ci + 1) * (ti + 3) + ci) % CARDS.length]; // גזירה-יציבה, לא-אקראית-בין-ריצות
  const first = card.body.split(/[.。]\s/)[0];
  return first && first.length > 40 ? first + '.' : null;
}

async function followState(who) {
  try {
    const r = await P(cb => steem.api.getFollowing(who, null, 'blog', 1000, cb));
    return new Set((r || []).map(x => x.following));
  } catch (_) { return new Set(); }
}

async function alreadyReblogged(who, author, permlink) {
  try {
    const hist = await P(cb => steem.api.getAccountHistory(who, -1, 200, cb));
    return (hist || []).some(([, op]) => {
      try {
        return op.op[0] === 'custom_json' && op.op[1].id === 'follow' &&
          JSON.parse(op.op[1].json)[0] === 'reblog' &&
          JSON.parse(op.op[1].json)[1].author === author &&
          JSON.parse(op.op[1].json)[1].permlink === permlink;
      } catch (_) { return false; }
    });
  } catch (_) { return false; }
}

(async () => {
  try { if (require('./capital-gate.cjs').stasisHalt('fleet-social')) return; } catch (e) { console.log('[CAPITAL-GATE] fleet-social — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  // CR-0065: comments/votes/follows/reblogs owned by the human cadence desk now — burst stacks defer
  try {
    const slots = require('./persona-store.cjs').slots(); // T3: doctrine sealed (persona-store)
    if (slots.version >= 2 && process.env.FORCE_LEGACY !== '1') { console.log(JSON.stringify({ state: 'defer', why: 'social ops owned by human-cadence.cjs (persona-slots v2, CR-0065)' })); process.exit(0); }
  } catch (_) {}
  const t0 = new Date().toISOString();
  const day = new Date().toISOString().slice(0, 10);
  const receipt = { at: t0, tool: 'fleet-social.cjs', version: 3, day, dedupe: { enabled: true, threshold: dedupe.NEAR_DUP_THRESHOLD }, comments: [], votes: [], follows: [], reblogs: [], tally: {} };
  const keys = loadKeys();
  if (!keys) { receipt.error = 'SA_FLEET_KEYS missing — fail-soft'; fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1)); console.log(JSON.stringify({ state: 'no-keys' })); process.exit(0); }

  // 1) איתור פוסטי-היום של הצי (קריאה-בלבד)
  const todays = [];
  for (const who of ROTATION) {
    const permlink = `saos-${who}-${day.replace(/-/g, '')}`;
    const c = await getContent(who, permlink);
    if (c && c.author === who) todays.push({ who, permlink, title: c.title, body: c.body });
  }
  receipt.fleetPostsToday = todays.map(t => t.who);

  // 2) Substantive comments: each soldier on one sibling post. English only, a real
  //    fragment quoted IN THE SPEAKER'S OWN PHRASING (voice profile), one related
  //    insight, one per-account closer. Before anything signs: gateCast() checks the
  //    body against the last comments of all our accounts (cross-account Jaccard
  //    ≥ 0.6 ⇒ SKIP — logged, never broadcast). Comment then a modest support vote
  //    on the same post (VP-gated, idempotent against active_votes).
  const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  let memory = [];
  try { memory = await dedupe.buildMemory(false); receipt.dedupe.memory = memory.length; } catch (e) { receipt.dedupe.memoryError = String(e.message || e).slice(0, 80); }
  for (const src of ROTATION) {
    const wif = keys[src];
    if (!wif) continue;
    const targets = todays.filter(t => t.who !== src);
    if (!targets.length) break;
    const target = targets[(ROTATION.indexOf(src) + 1) % targets.length];
    const cPermlink = `re-${target.permlink}-${src}`.slice(0, 255);
    const R = { by: src, on: target.who, permlink: cPermlink };
    try {
      const existing = await getContent(src, cPermlink);
      if (existing && existing.author === src) { R.status = 'ALREADY'; }
      else {
        const frag = realFragment(target.body);
        const fragEn = frag && !HEB.test(frag) ? frag : null; // a Hebrew quote inside an English comment reads mechanical, drop it
        const ins = relatedInsight(src, target.who);
        const titleBit = target.title && !HEB.test(target.title) ? clean(target.title) : 'today\'s post';
        const body = dedupe.buildComment({ account: src, slot: ROTATION.indexOf(src), targetTitle: titleBit, fragment: fragEn, insight: ins });
        if (!body) { R.status = 'SKIP-NO-VOICE'; }
        else {
          const gate = dedupe.gateCast(src, body, memory, ROTATION.indexOf(src));
          R.gate = { verdict: gate.verdict, bestSim: gate.bestSim, partner: gate.partner ? gate.partner.author : null, reason: gate.reason };
          if (gate.verdict === 'SKIP') { R.status = 'SKIP-DUP-GATE'; }
          else {
            const ops = [['comment', { parent_author: target.who, parent_permlink: target.permlink, author: src, permlink: cPermlink, title: '', body, json_metadata: JSON.stringify({ tags: ['blog'], app: 'saos-fleet-social/3' }) }]];
            await P(cb => steem.broadcast.send({ operations: ops, extensions: [] }, [wif], cb));
            await sleep(1800 + Math.floor(Math.random() * 1200)); // human pacing
            const back = await getContent(src, cPermlink);
            R.status = (back && back.author === src && back.body === body) ? 'COMMENTED-VERIFIED' : 'COMMENTED-READBACK-PENDING';
            // r145-c: a freshly cast comment joins the memory so the NEXT comment in
            // this run is gated against it, not only against the pre-run snapshot
            if (R.status === 'COMMENTED-VERIFIED') memory.push({ author: src, permlink: cPermlink, created: new Date().toISOString(), body, source: 'fleet-social' });
          }
        }
      }
    } catch (e) { R.status = 'ERR'; R.msg = String(e.message || e).slice(0, 90); }
    receipt.comments.push(R);
    console.log(`[${R.status}] ${src} → @${target.who}${R.gate ? ` (sim ${R.gate.bestSim})` : ''}`);

    // support vote on the same post (comment + vote is how a reader behaves)
    if (R.status === 'COMMENTED-VERIFIED' || R.status === 'ALREADY') {
      const V = { by: src, on: target.who, permlink: target.permlink };
      try {
        const post = await getContent(target.who, target.permlink);
        const voted = post && (post.active_votes || []).some(v => v.voter === src);
        if (voted) V.status = 'ALREADY';
        else {
          const acc = (await P(cb => steem.api.getAccounts([src], cb)))[0];
          const vp = Math.round(acc.voting_power / 100);
          if (vp < VP_GATE) V.status = `SKIP-VP-LOW(${vp})`;
          else {
            await P(cb => steem.broadcast.send({ operations: [['vote', { voter: src, author: target.who, permlink: target.permlink, weight: VOTE_WEIGHT }]], extensions: [] }, [wif], cb));
            await sleep(1200);
            const after = await getContent(target.who, target.permlink);
            V.status = after && (after.active_votes || []).some(v => v.voter === src) ? 'VOTED-VERIFIED' : 'VOTED-READBACK-PENDING';
            V.weightPct = VOTE_WEIGHT / 100;
          }
        }
      } catch (e) { V.status = 'ERR'; V.msg = String(e.message || e).slice(0, 90); }
      receipt.votes.push(V);
      console.log(`[${V.status}] ${src} ⭢ @${target.who}`);
    }
  }

  // 3) גרף-מעקב — מיותרים-מסוננים, מוגבל-לריצה
  let followBudget = MAX_FOLLOWS_PER_RUN;
  for (const src of ROTATION) {
    if (followBudget <= 0) break;
    const wif = keys[src];
    if (!wif) continue;
    try {
      const have = await followState(src);
      const missing = FLEET_ALL.filter(t => t !== src && !have.has(t));
      for (const t of missing.slice(0, followBudget)) {
        const json = JSON.stringify(['follow', { follower: src, following: t, what: ['blog'] }]);
        const ops = [['custom_json', { required_auths: [], required_posting_auths: [src], id: 'follow', json }]];
        await P(cb => steem.broadcast.send({ operations: ops, extensions: [] }, [wif], cb));
        receipt.follows.push({ by: src, following: t, status: 'FOLLOW-SENT' });
        followBudget--;
        await sleep(300 + Math.floor(Math.random() * 400));
      }
      if (missing.length) receipt.follows.push({ by: src, pending: Math.max(0, missing.length - (MAX_FOLLOWS_PER_RUN - followBudget)) });
    } catch (e) { receipt.follows.push({ by: src, status: 'ERR', msg: String(e.message || e).slice(0, 90) }); }
  }

  // 4) reblog — כל חייל מעלה פוסט-עומק אחד של אח (אידמפוטנטי)
  for (const src of ROTATION) {
    const wif = keys[src];
    if (!wif) continue;
    try {
      const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
      const target = todays.find(t => t.who !== src && (doy + ROTATION.indexOf(t.who)) % 3 === 0)
        || todays.find(t => t.who !== src);
      if (!target) break;
      const R = { by: src, on: target.who, permlink: target.permlink };
      if (await alreadyReblogged(src, target.who, target.permlink)) R.status = 'ALREADY';
      else {
        const json = JSON.stringify(['reblog', { account: src, author: target.who, permlink: target.permlink }]);
        const ops = [['custom_json', { required_auths: [], required_posting_auths: [src], id: 'follow', json }]];
        await P(cb => steem.broadcast.send({ operations: ops, extensions: [] }, [wif], cb));
        await sleep(1200);
        const confirmed = await alreadyReblogged(src, target.who, target.permlink);
        R.status = confirmed ? 'REBLOGGED-VERIFIED' : 'REBLOGGED-READBACK-PENDING';
      }
      receipt.reblogs.push(R);
    } catch (e) { receipt.reblogs.push({ by: src, status: 'ERR', msg: String(e.message || e).slice(0, 90) }); }
  }

  // 5) Whole-number tally only
  const tally = {};
  for (const k of ['comments', 'votes', 'follows', 'reblogs']) for (const r of receipt[k]) tally[r.status || 'UNKNOWN'] = (tally[r.status || 'UNKNOWN'] || 0) + 1;
  receipt.tally = tally;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ state: 'ok', tally }));
  process.exit(0);
})().catch(e => {
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), tool: 'fleet-social.cjs', fatal: String(e.message || e).slice(0, 200) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
  process.exit(0);
});
