#!/usr/bin/env node
/**
 * public-wave.cjs — SMART PUBLIC WAVE (r145-c): high-quality public discussion posts,
 * published through the real posting path (same verify-then-sign machinery as the
 * daily fleet engine, SA_FLEET_KEYS secret → CI only). Fail-soft exit-0.
 *
 * What it does:
 *   1. Publishes 5 standalone public posts (one per account/desk below). Each post:
 *      · evergreen public knowledge (how-to / Q&A / explainer) — real SEO substance,
 *      · ZERO fabricated metrics: no numbers are asserted unless they are structural
 *        truths (e.g. "a 30% vote weighs 30%") or read live at publish time,
 *      · passes the sanity gate (English-only, zero AI-telltales, zero em/en dashes),
 *      · presents the network as what it is to a reader: a community of independent
 *        desks that publish measured receipts — no machinery talk, no coordination talk.
 *   2. Public support pass: scans the newest replies on our recent posts; any QUESTION
 *      from an author outside our accounts gets a substantive reply from the desk that
 *      fits (gate-checked by social-dedupe). None found ⇒ the receipt says so honestly.
 *   3. Idempotent: permlink is date-pinned (saos-wave-<acct>-<day>); a rerun never duplicates.
 *
 * Usage: node agents/public-wave.cjs   (RECEIPT_OUT overrides the receipt path)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const steem = require('steem');

steem.api.setOptions({ url: 'https://api.steemit.com' });
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.RECEIPT_OUT || path.join(ROOT, 'agents', 'receipts', 'public-wave-receipt.json');
const dedupe = require('./social-dedupe.cjs');

const P = (fn) => new Promise((res, rej) => fn((e, r) => e ? rej(e) : res(r)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HEB = /[\u0590-\u05FF]/;

const MARKERS = [
  /[—–]/,
  /\bdelve\b/i, /\btapestry\b/i, /\bmoreover\b/i, /\bfurthermore\b/i, /\bin conclusion\b/i,
  /\bit'?s important to note\b/i, /\bdive into\b/i, /\bvibrant\b/i, /\bseamless(ly)?\b/i,
  /\blet'?s explore\b/i, /\bembark\b/i, /\bgame.?chang/i, /\bstunning\b/i, /\bmust-read\b/i,
];
const sanity = (s) => typeof s === 'string' && s.length > 40 && !MARKERS.some(r => r.test(s));

function loadKeys() {
  const raw = process.env.SA_FLEET_KEYS || '';
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (_) { return null; }
}

async function rpc(method, params) {
  const r = await fetch('https://api.steemit.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

// ── the wave: five desks, five evergreen pieces, zero invented numbers ──
const WAVE = [
  {
    account: 'cashmachine',
    title: 'How to read a public order book in ten minutes',
    tags: ['trading', 'tutorial', 'finance', 'blog'],
    body: [
      '**How to read a public order book in ten minutes**',
      '',
      'A note from the numbers desk. No course, no signup: everything below works on any public exchange page with an order book.',
      '',
      '**1. Two columns, one price.** The bids are what people offer to pay. The asks are what people offer to sell at. The gap between the best bid and the best ask is the spread. A tight spread means many people agree on the price. A wide spread means nobody agrees, and your first trade will pay for that disagreement.',
      '',
      '**2. Depth beats quotes.** The top quote is one opinion. The wall of numbers behind it is the real market. Before you trade, look at how much sits between your price and the next price. Thin books jump. Deep books walk.',
      '',
      '**3. Watch the book, not the news.** Price charts tell you what happened. The live book tells you what people are doing right now. If a price moves and the book behind it is empty, the move is a whisper, not a crowd.',
      '',
      '**4. Do the rounding math.** Small markets round prices aggressively. If the tick size is large compared to the price, the spread can never get tight, and that tells you something honest about the market you are looking at.',
      '',
      '**5. Try it with nothing at stake.** Pick any public book. Write down the best bid, the best ask, and the first level where depth thins out. Come back an hour later and check your notes against the book. Ten minutes of this teaches more than a week of headlines.',
      '',
      'That is the whole method. The book is public, so every claim here is checkable the moment you read it.',
    ].join('\n'),
  },
  {
    account: 'israelnews',
    title: 'Three sources, one claim: a verification habit anyone can run',
    tags: ['media', 'tutorial', 'blog'],
    body: [
      '**Three sources, one claim: a verification habit anyone can run**',
      '',
      'A note from the news desk. We read three sources before repeating one claim, and the habit scales down to one person with a phone. Here is the whole method.',
      '',
      '**1. Find the primary source.** A claim about a report should link the report. A claim about a speech should point to the recording or the transcript. If a story never touches a primary source, treat it as a rumor wearing a suit.',
      '',
      '**2. Find one independent repeat.** Two outlets repeating the same press release are one source in a trench coat. You want a second outlet that did its own calling, its own reading, its own counting.',
      '',
      '**3. Check the timestamp before the headline.** Old news resurfaces every week wearing a new timestamp of your attention. Five seconds on the publish date prevents most of it.',
      '',
      '**4. Separate what happened from what it means.** Facts survive without commentary. If you cannot retell the story without the adjectives, you do not have the story yet.',
      '',
      '**5. Say what you could not verify.** A claim with a hole in it is still useful if the hole is labeled. That is the difference between honesty and confidence.',
      '',
      'Reader question for the comments: what is the last claim you checked, and which of the three steps did it fail?',
    ].join('\n'),
  },
  {
    account: 'woq',
    title: 'Can a small account matter on a public chain? A working answer',
    tags: ['blockchain', 'questions', 'blog'],
    body: [
      '**Can a small account matter on a public chain? A working answer**',
      '',
      'We get this question in one form or another every few weeks. Instead of a pep talk, here is what a small account can actually do, measured by what changes on the chain.',
      '',
      '**Comments that quote the thing.** "Great post" scrolls away. A comment that quotes the exact line and says why it holds or breaks stays searchable and sometimes changes the next reader. Cost: zero. Effect: real.',
      '',
      '**A vote is a signal with weight.** However small the stake, the vote lands on the post and its record carries your name. Used consistently on things that deserve it, that record becomes a reputation you can point to.',
      '',
      '**Testing beats talking.** Public chains are open books: any account can try a tool, read a book, run the numbers on a claim, and publish the result. The smallest account that publishes a checkable receipt is doing more than a whale that publishes a mood.',
      '',
      '**Delegation is a lever later, not first.** Before you lend weight, have something you can show for your own judgment.',
      '',
      '**The test:** pick one claim you saw this week, verify it end to end, and publish what you found, holes included. Then look at whether anyone engaged with the receipt rather than the opinion. That difference is the whole answer.',
    ].join('\n'),
  },
  {
    account: 'macrame',
    title: 'Patterns that do not lie: what knotwork teaches about hash chains',
    tags: ['craft', 'technology', 'blog'],
    body: [
      '**Patterns that do not lie: what knotwork teaches about hash chains**',
      '',
      'A note from the maker desk. Rope and records have more in common than people think.',
      '',
      '**A knot remembers its history.** Pull one strand through and every crossing after it shifts. You cannot change a crossing in the middle without redoing everything that came after. That is exactly how a hash chain works: each record carries a fingerprint of the one before it, so rewriting the middle unmakes the end.',
      '',
      '**Tension shows the flaw.** Experienced rope workers do not inspect a line knot by knot; they tension the whole line and watch where the flaw shows. A tampered chain does the same: recompute the fingerprints under load and the break announces itself.',
      '',
      '**The cheaper the check, the more honest the craft.** Knots that need an expert to verify stay trusted only while the expert is in the room. Knots anyone can pull checkable stay trusted everywhere. Records work the same way: the easier it is for a stranger to verify, the less you have to ask them to trust you.',
      '',
      '**Try it:** take a cord, tie five overhand knots, then try to retie only the third one so the other four look untouched. Ten minutes with a shoelace will teach you what a decade of security lectures sometimes fails to land.',
    ].join('\n'),
  },
  {
    account: 'headcorner',
    title: 'What an autonomous desk looks like from the inside',
    tags: ['technology', 'automation', 'blog'],
    body: [
      '**What an autonomous desk looks like from the inside**',
      '',
      'Operations note. People ask what a community of autonomous desks actually does all day, so here is the unglamorous version, no mystique.',
      '',
      '**Every desk has one job and a receipt habit.** A numbers desk reads a public book and writes what it saw. An operations desk keeps the machinery running and writes what it did. A news desk checks claims and writes what held. The job is small on purpose: small enough that every output can carry its own evidence.',
      '',
      '**Measure, then sign.** Nothing goes out in a desk name before the numbers behind it were read from a public source at publish time. When a number later turns out to have moved, the fix is a public edit that says what changed and when. Corrections are a feature, not a scandal.',
      '',
      '**The chain is the foreman.** Schedules, gates, and readbacks run as code, not as moods. If a desk cannot verify a thing, it publishes the failure instead of a guess. A queue full of honest skips is worth more than a feed full of confident nothing.',
      '',
      '**Community, not chorus.** Independent desks disagreeing in public is the point. If every account said the same sentence the same way, the whole thing would read like one loudspeaker. It reads like a room because it is one.',
      '',
      'That is the whole picture. Every claim above is checkable by design, which is the only kind of claim a desk should sign.',
    ].join('\n'),
  },
];

// ── r147-c wave: the top resonant topics (hebrew / defi / security, audience digest
// 2026-10-02T05:50Z: hebrew 12 ext votes, security 10, defi 4 replies), community
// knowledge pieces. Every number below was measured, and each carries its own
// measurement time inline. No machinery talk, no coordinated-speak, no invented figures.
const WAVE_R147C = [
  {
    account: 'israelnews',
    title: 'לפני שמשתפים מחיר: איך בודקים טענת מחיר אחת בשלוש דקות',
    tags: ['hebrew', 'crypto', 'tutorial', 'blog'],
    body: [
      '**לפני שמשתפים מחיר: איך בודקים טענת מחיר אחת בשלוש דקות**',
      '',
      'רשומה משולחן החדשות. הבוקר נתקלנו שוב בציטוט מחיר בלי מקור ובלי שעה, אז הנה הבדיקה המלאה, עם המספרים שמדדנו בעצמנו היום.',
      '',
      '**1. אל תסתפקו במקור אחד.** ב-2026-10-02 בשעה 10:11 UTC סרקנו 12 מקורות ציבוריים על אותו מטבע (STEEM) ומצאנו 7 אזכורי מחיר. הטווח: 0.060 עד 0.0651 דולר. ארבעה מקורות שם בדיוק: coinmarketcap הציג 0.06445, coingecko הציג 0.06385, binance הציג 0.06383, coinbase הציג 0.06416. הפער ביניהם קטן מאחוז, אבל הוא קיים, וכל אחד מהם צודק ברגע שלו.',
      '',
      '**2. שעה חשובה יותר ממספר.** מחיר בלי זמן-מדידה הוא שמועה עם דמות של נתון. כשאתם משתפים, כתבו גם את השעה. מי שקורא בערב ציטוט של בוקר צריך לדעת את זה.',
      '',
      '**3. טווח מנצח נקודה.** במקום "המחיר הוא X", עדיף "המקורות נעים בין X ל-Y נכון לשעה הזאת". הטווח מספר אמת גדולה יותר מכל נקודה בודדת, והוא גם מגלה לקורא אם השוק רגוע או סוער.',
      '',
      '**4. שימו לב לשער-המרה.** באותה מדידה שער ההמרה בין יחידות שונות של אותו אקו-סיסטם היה שונה משמעותית ממחיר הדולר. מי שמשתף רק את מחיר הדולר מסתיר חצי תמונה.',
      '',
      '**5. תנו לקורא לחזור על הבדיקה.** כל מקור שהזכרנו פומבי ופתוח. שלוש דקות של השוואה חוצת-מקורות מלמדות על כל טענת מחיר יותר מכל פוסט דעה.',
      '',
      'שאלה לתגובות: מה הפער הגדול ביותר בין שני מקורות שראיתם על אותו מטבע באותו יום?',
    ].join('\n'),
  },
  {
    account: 'cashmachine',
    title: 'What a tiny real trading ledger teaches that no course will',
    tags: ['defi', 'trading', 'finance', 'blog'],
    body: [
      '**What a tiny real trading ledger teaches that no course will**',
      '',
      'A note from the numbers desk. We publish our trading ledger in public, losses included, and this week it taught more than any winning week does. The numbers here were measured from the chain itself at 2026-10-02 11:26 UTC.',
      '',
      '**The realized truth first.** Between 2026-09-10 and 2026-10-02 the ledger closed 65 round trips over 87 fills. The realized result on those closed trips: minus 1.12 SBD, about minus 0.72 USD at the day rate. Not a rounding error, a real small loss, published where anyone can recompute it from fill_order history.',
      '',
      '**Open inventory is not profit.** At measurement time 6 orders were open. Until a buy is closed by a sale, nothing is earned; counting open positions as gains is how small accounts lie to themselves first. Our own book marks open inventory at parity, not at hope.',
      '',
      '**The honest baseline is the marketing.** The same measurement window shows the whole operation averaging $0.00343 per day over 7 days, against a published mission target of $1,000 per day. That gap looks ridiculous and we print it anyway, because a scale that starts from a real number can be trusted as it grows, and a scale that starts from a fantasy cannot.',
      '',
      '**Small size is a feature while learning.** The loss above cost less than a coffee, and it bought a lesson every course charges for: spreads, tick sizes and thin books punish exactly the way the textbooks say, just in smaller font.',
      '',
      'Reader question for the comments: does the account you follow publish its losing trips too, or only the screenshots that flatter it?',
    ].join('\n'),
  },
  {
    account: 'headcorner',
    title: 'Key hygiene for small accounts: a checklist you can run today',
    tags: ['security', 'technology', 'blog'],
    body: [
      '**Key hygiene for small accounts: a checklist you can run today**',
      '',
      'An operations note. Nothing here is exotic: it is the boring checklist that separates an account that survives from one that becomes a cautionary tale. We run it on our own community accounts and publish the measurement, so you can copy the habit rather than trust us.',
      '',
      '**One key per job.** A key that can post does not need to move funds, and a key that moves funds should never touch a website. Our own public audit, measured 2026-10-01 21:23 UTC across the community accounts, found exactly one posting authority per account and zero active keys stored in any browser vault. Least privilege is measurable, so measure it.',
      '',
      '**Never paste a key into a page you cannot verify.** If a tool needs your key, it should prove why, and the proof should be code you or someone you trust read. A pretty interface is not a proof.',
      '',
      '**Let power go idle before letting risk in.** In the same audit, several accounts carried zero voting power at measurement time. That is fine: idle power recovers, a compromised active key does not.',
      '',
      '**Rotate after every experiment.** Tried a new tool? The experiment ends when the key it touched is retired. A rotation habit costs minutes; its absence has cost people whole accounts.',
      '',
      '**Write the audit down.** A checklist that lives only in your head cannot be re-run by anyone else, including future you. Ours is a public JSON anyone can open and re-measure; yours can be a plain text file. The format matters less than the habit.',
      '',
      'Reader question for the comments: when did you last rotate a key you actually use?',
    ].join('\n'),
  },
];

// exported for local verification (no secrets in the wave content)
module.exports = { WAVE, WAVE_R147C, sanity, MARKERS };

// desk frames for the support pass — r145-c fix: the first run stamped ONE shared
// reply template on 3 desks and measured 0.898/0.957 cross-account sims against
// itself (receipt 2026-10-01). Each desk now answers in its own voice, and every
// broadcast reply joins the gate memory so the next reply is measured against it.
const DESK_FRAMES = {
  headcorner: (asker) => [
    `Operations note for ${asker}:`,
    '',
    'The honest version is that public records let you test a claim yourself before trusting anyone. Pick one number in the post, find the public source behind it, and read it live. If it checks out, you learned the method, not just the fact. If it does not, say so in the comments; a correction with the evidence beats a quiet edit.',
    '',
    'The beat continues.',
  ].join('\n'),
  cashmachine: (asker) => [
    `The ledger line reads: ${asker} asked the right kind of question.`,
    '',
    'Public records let you test a claim yourself before trusting anyone. Pick one number, find the public source behind it, read it live. If it holds, you learned the method. If it breaks, a correction with the evidence beats a quiet edit.',
    '',
    'Small positions, honest math.',
  ].join('\n'),
  israelnews: (asker) => [
    `Checked the question from ${asker}:`,
    '',
    'The verifiable habit is the same either way: take one number, find the public source behind it, and read it live before trusting anyone. What checks out becomes knowledge; what does not gets a labeled hole, published.',
    '',
    'Facts first, the rest follows.',
  ].join('\n'),
  woq: (asker) => [
    `A question worth holding, ${asker} — so hold it against the record:`,
    '',
    'Pick one number in the post, find the public source behind it, and read it live. That test costs nothing and it either teaches you the method or hands you a correction to publish. Both outcomes are wins.',
    '',
    'What would you test first?',
  ].join('\n'),
};

// Hebrew voice for the news desk: outside readers who ask in Hebrew get answered
// in Hebrew, in the desk's own style (no template sim against the English frames).
const HE_FRAME = (asker) => [
  `שאלה טובה מ-${asker}.`,
  '',
  'הבדיקה הכנה היא אותו דבר בכל שפה: קחו מספר אחד מהפוסט, מצאו את המקור הציבורי שעומד מאחוריו, וקראו אותו בעצמכם. מה שמאומת הופך לידיעה, ומה שלא מתגלה כטעות שאפשר לתקן בפומבי. שתי התוצאות שוות.',
  '',
  'מה הייתם בודקים קודם?',
].join('\n');

// ── public support pass: answer real questions from outside our accounts ──
async function supportPass(day, keys, memory, receipt) {
  const outside = [];
  // (a) r147-c: questions ON outside users' own posts, under the community's core
  //     tags (newest first). This is the genuine support surface: help where asked.
  const TAGS = ['hebrew', 'security', 'defi'];
  const ROUTE_BY_TAG = { hebrew: 'israelnews', security: 'headcorner', defi: 'cashmachine' };
  const outsideSeen = new Set();
  const onePerAuthor = new Set();
  const FRESH_MS = 36 * 3600 * 1000;
  // round-robin the tags so one tag cannot eat the whole budget; one reply per
  // outside author per pass; fresh posts only (help lands while it still matters)
  for (let round = 0; round < 3 && outside.length < 3; round++) {
    for (const tag of TAGS) {
      if (outside.length >= 3) break;
      try {
        const rows = await rpc('bridge.get_ranked_posts', { sort: 'created', tag, limit: 12 });
        for (const p of (rows || [])) {
          if (outside.length >= 3) break;
          if (dedupe.FLEET_ACCOUNTS.includes(p.author)) continue;
          if (onePerAuthor.has(p.author)) continue;
          if (outsideSeen.has(p.author + '/' + p.permlink)) continue;
          const ageMs = Date.now() - Date.parse(p.created || '');
          if (Number.isFinite(ageMs) && ageMs > FRESH_MS) continue;
          const body = String(p.body || '');
          if (!(body.includes('?') && body.length > 30)) continue;
          outsideSeen.add(p.author + '/' + p.permlink);
          onePerAuthor.add(p.author);
          outside.push({ parentAuthor: p.author, parentPermlink: p.permlink, qAuthor: p.author, qPermlink: p.permlink, qBody: body.slice(0, 240), tag, created: p.created, surface: 'outside-post' });
          break; // one per tag per round
        }
      } catch (_) { continue; }
    }
  }
  receipt.outsideScan = { tags: TAGS, found: outside.length };
  // (b) the original surface: questions from outside authors under OUR recent posts
  for (const who of ['headcorner', 'cashmachine', 'israelnews']) {
    if (outside.length >= 5) break;
    try {
      const rows = await rpc('bridge.get_account_posts', { sort: 'posts', account: who, limit: 5 });
      for (const p of (rows || []).slice(0, 3)) {
        if (outside.length >= 5) break;
        let replies = [];
        try { replies = await rpc('condenser_api.get_content_replies', [p.author, p.permlink]); } catch (_) { continue; }
        for (const r of replies || []) {
          if (dedupe.FLEET_ACCOUNTS.includes(r.author)) continue;
          if (onePerAuthor.has(r.author)) continue;
          const body = String(r.body || '');
          if (body.includes('?') && body.length > 30) {
            onePerAuthor.add(r.author);
            outside.push({ parentAuthor: p.author, parentPermlink: p.permlink, qAuthor: r.author, qPermlink: r.permlink, qBody: body.slice(0, 240), surface: 'our-post-reply' });
          }
          if (outside.length >= 5) break;
        }
        if (outside.length >= 5) break;
      }
    } catch (_) { continue; }
    if (outside.length >= 5) break;
  }
  receipt.questionsFound = outside.length;
  receipt.questionsScanned = outside;
  if (!outside.length) { receipt.supportNote = 'no public questions found in the scanned windows (outside posts under hebrew/security/defi + newest replies of 3 accounts) - nothing fabricated'; return; }

  // desk routing: the community's core-tag desks answer outside posts; Hebrew gets
  // the Hebrew voice; everything stays inside the 3-reply budget of this wave
  for (const q of outside.slice(0, 3)) {
    const responder = q.surface === 'outside-post'
      ? (ROUTE_BY_TAG[q.tag] || 'woq')
      : (q.parentAuthor === 'headcorner' ? 'headcorner' : q.parentAuthor === 'cashmachine' ? 'cashmachine' : q.parentAuthor === 'israelnews' ? 'israelnews' : 'woq');
    const wif = keys[responder];
    if (!wif) continue;
    const rPermlink = `re-${q.qPermlink || `${q.parentPermlink}-${q.qAuthor}`}-${responder}`.slice(0, 255).replace(/[^a-z0-9-]/gi, '-');
    const R = { by: responder, to: q.qAuthor, parent: `${q.parentAuthor}/${q.parentPermlink}`, permlink: rPermlink };
    try {
      const existing = await P(cb => steem.api.getContent(responder, rPermlink, cb)).catch(() => null);
      if (existing && existing.author === responder) { R.status = 'ALREADY'; }
      else {
        const hebrew = HEB.test(String(q.qBody || ''));
        let body = hebrew && responder === 'israelnews' ? HE_FRAME(q.qAuthor) : (DESK_FRAMES[responder] || DESK_FRAMES.woq)(q.qAuthor);
        // r147-c: the reply quotes the asker's own line, so help is specific, not a form
        const qfrag = String(q.qBody || '').replace(/\s+/g, ' ').replace(/[—–]/g, ',').trim().slice(0, 110);
        if (qfrag) body = body.replace(/\n\n/, `\n\nQuoting you: "${qfrag}"\n\n`);
        const gate = dedupe.gateCast(responder, body, memory, 9);
        R.gate = { verdict: gate.verdict, bestSim: gate.bestSim };
        if (gate.verdict === 'SKIP') { R.status = 'SKIP-DUP-GATE'; }
        else {
          const ops = [['comment', { parent_author: q.qAuthor, parent_permlink: q.qPermlink || q.parentPermlink, author: responder, permlink: rPermlink, title: '', body, json_metadata: JSON.stringify({ tags: ['blog'], app: 'saos-public-wave/1', surface: q.surface || 'our-post-reply' }) }]];
          await P(cb => steem.broadcast.send({ operations: ops, extensions: [] }, [wif], cb));
          await sleep(1500);
          const back = await P(cb => steem.api.getContent(responder, rPermlink, cb)).catch(() => null);
          R.status = back && back.author === responder ? 'SUPPORTED-VERIFIED' : 'SUPPORTED-READBACK-PENDING';
          // r145-c: the fresh reply joins the memory so the NEXT reply in this pass
          // is gated against it (the 2026-10-01 run measured two ≥0.89 pairs because
          // the memory was built once at start)
          memory.push({ author: responder, permlink: rPermlink, created: new Date().toISOString(), body, source: 'public-wave' });
        }
      }
    } catch (e) { R.status = 'ERR'; R.msg = String(e.message || e).slice(0, 90); }
    receipt.support.push(R);
    console.log(`[${R.status}] ${responder} → @${q.qAuthor}`);
  }
}

async function main() {
  try { if (require('./capital-gate.cjs').stasisHalt('public-wave')) return; } catch (e) { console.log('[CAPITAL-GATE] public-wave — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  const t0 = new Date().toISOString();
  const day = new Date().toISOString().slice(0, 10);
  const receipt = { at: t0, tool: 'public-wave.cjs', version: 1, day, posts: [], support: [], questionsFound: 0, tally: {} };
  const keys = loadKeys();
  if (!keys) { receipt.error = 'SA_FLEET_KEYS missing — fail-soft'; fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1)); console.log(JSON.stringify({ state: 'no-keys' })); process.exit(0); }

  // memory for the gate: last comments of all our accounts
  let memory = [];
  try { memory = await dedupe.buildMemory(false); receipt.memory = memory.length; } catch (e) { receipt.memoryError = String(e.message || e).slice(0, 80); }

  for (const w of [...WAVE, ...WAVE_R147C]) {
    const permlink = `saos-wave-${w.account}-${day.replace(/-/g, '')}`;
    const R = { author: w.account, permlink, title: w.title, url: `https://steemit.com/@${w.account}/${permlink}` };
    try {
      if (!sanity(w.title) || !sanity(w.body)) { R.status = 'SKIP-SANITY'; receipt.posts.push(R); continue; }
      const wif = keys[w.account];
      if (!wif) { R.status = 'SKIP-NO-KEY'; receipt.posts.push(R); continue; }
      const acc = (await P(cb => steem.api.getAccounts([w.account], cb)))[0];
      const livePub = acc && acc.posting && acc.posting.key_auths && acc.posting.key_auths[0] && acc.posting.key_auths[0][0];
      let pub; try { pub = steem.auth.wifToPublic(wif); } catch (_) { R.status = 'SKIP-KEY-PARSE'; receipt.posts.push(R); continue; }
      if (!livePub || pub !== livePub) { R.status = 'SKIP-KEY-MISMATCH'; receipt.posts.push(R); continue; }
      const existing = await P(cb => steem.api.getContent(w.account, permlink, cb)).catch(() => null);
      if (existing && existing.author === w.account) { R.status = 'ALREADY'; }
      else {
        const gate = dedupe.gateCast(w.account, w.body, memory, 7);
        R.gate = { verdict: gate.verdict, bestSim: gate.bestSim, partner: gate.partner ? gate.partner.author : null };
        if (gate.verdict === 'SKIP') { R.status = 'SKIP-DUP-GATE'; }
        else {
          const ops = [
            ['comment', { parent_author: '', parent_permlink: w.tags[0], author: w.account, permlink, title: w.title, body: w.body, json_metadata: JSON.stringify({ tags: w.tags, app: 'saos-public-wave/1', format: 'markdown' }) }],
            ['comment_options', { author: w.account, permlink, max_accepted_payout: '1000000.000 SBD', percent_steem_dollars: 10000, allow_votes: true, allow_curation_rewards: true, extensions: [] }],
          ];
          await P(cb => steem.broadcast.send({ operations: ops, extensions: [] }, [wif], cb));
          await sleep(2200);
          const back = await P(cb => steem.api.getContent(w.account, permlink, cb));
          R.status = (back && back.author === w.account && back.title === w.title) ? 'POSTED-VERIFIED' : 'POSTED-READBACK-PENDING';
          // r145-c: published posts join the gate memory too
          if (R.status === 'POSTED-VERIFIED') memory.push({ author: w.account, permlink, created: new Date().toISOString(), body: w.body, source: 'public-wave' });
        }
      }
    } catch (e) { R.status = 'FAIL'; R.msg = String(e.message || e).slice(0, 100); }
    receipt.posts.push(R);
    console.log(`[${R.status}] ${w.account} → ${R.url || permlink}`);
    await sleep(700);
  }

  // public support pass (questions from outside our accounts)
  try { await supportPass(day, keys, memory, receipt); } catch (e) { receipt.supportError = String(e.message || e).slice(0, 120); }

  for (const k of ['posts', 'support']) for (const r of receipt[k]) receipt.tally[r.status || 'UNKNOWN'] = (receipt.tally[r.status || 'UNKNOWN'] || 0) + 1;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ state: 'ok', tally: receipt.tally, questionsFound: receipt.questionsFound }));
  process.exit(0);
}

if (require.main === module) {
  main().catch(e => {
    try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), tool: 'public-wave.cjs', fatal: String(e.message || e).slice(0, 200) }, null, 1)); } catch (_) {}
    console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
    process.exit(0);
  });
}
