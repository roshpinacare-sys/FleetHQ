'use strict';
/**
 * measure-learn.cjs — THE LEARNING LOOP (Z-24, 2026-09-30).
 *
 * רשת שלא מודדת תגובת-חוץ היא מכונת-רעש. הסוכן הזה (נטול-מפתחות):
 *   1. סורק את פוסטי-הצי מ-7 הימים האחרונים (permlink saos-<who>-<date>).
 *   2. לכל פוסט — מפריד קולות-פנים (חברי-צי/בוטים-ידועים) מקולות-חוץ אמיתיים,
 *      ורושם rshares-חוץ — האות-הכלכלי-האמיתי.
 *   3. מתאים כל פוסט לכרטיס-הידע-שלו לפי הכותרת (compact = כותרת-הכרטיס,
 *      deep = כותרת-הכרטיס + ' · דוח מדוד') ומצבר-מעורבות-חוץ לפי כרטיס.
 *   4. כותב: agents/learning-ledger.json (מצב-חי לכל פוסט, דגימות מוגבלות)
 *      + agents/learning-summary.json (מצבר לכרטיס — מזין-עדיפויות עתידיות).
 *
 * אמת-מעל-הכל: המספרים נקראים מהשרשרת; כלום לא מומצא; fail-soft exit-0.
 */
const steem = require('steem');
const fs = require('fs');
const path = require('path');

steem.api.setOptions({ url: 'https://api.steemit.com' });
const ROOT = path.resolve(__dirname, '..');
const OUT_LEDGER = path.join(ROOT, 'agents', 'learning-ledger.json');
const OUT_SUMMARY = path.join(ROOT, 'agents', 'learning-summary.json');
// Z-25: the same perminks exist on hive + blurt (tri-bridge). Their external engagement
// counts too, so the loop reads all three chains per post.
const HIVE_NODE = 'https://api.hive.blog';
const BLURT_NODE = 'https://rpc.beblurt.com';
const https = require('https');
function rpcNode(node, method, params, timeout = 15000) {
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  return new Promise((resolve, reject) => {
    const u = new URL(node);
    const req = https.request({ hostname: u.hostname, path: u.pathname || '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { const j = JSON.parse(d); j.error ? reject(new Error(j.error.message)) : resolve(j.result); } catch (_) { reject(new Error('bad-rpc')); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject); req.write(payload); req.end();
  });
}
async function crossStat(node, who, permlink) {
  try {
    const r = await rpcNode(node, 'condenser_api.get_content', [who, permlink]);
    if (!r || !r.author) return null;
    return { votes: (r.active_votes || []).length, replies: r.children || 0 };
  } catch (_) { return null; }
}
const ROTATION = ['haran', 'wic', 'woq', 'siq', 'tov', 'israelnews', 'lsa', 'macrame', 'cashmachine', 'wog'];
const FLEET_ALL = new Set([...ROTATION, 'headcorner']);
const NON_SIGNAL = new Set(['steem.history', 'trailbot', 'appreciator', 'postpromoter', 'upme', 'buildawhale', 'upmewhale', 'rocky1', 'boomerang', 'dlike', 'krwhale', 'steem-echo', 'smartsteem', 'tipu', 'cardboard']);
const CARDS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge-cards-en.json'), 'utf8')); } catch (_) { return []; } })();
const P = (fn) => new Promise((res, rej) => fn((e, r) => e ? rej(e) : res(r)));

function cardIdFromTitle(title) {
  if (!title) return null;
  const t = title.replace(/\s*·\s*דוח מדוד.*$/, '').replace(/\s*\(measured \d{4}-\d{2}-\d{2}\)\s*$/, '').trim();
  const c = CARDS.find(c => c.title === t);
  return c ? c.id : null;
}

(async () => {
  const now = new Date().toISOString();
  const ledger = (() => { try { return JSON.parse(fs.readFileSync(OUT_LEDGER, 'utf8')); } catch (_) { return {}; } })();
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10).replace(/-/g, ''); days.push(d); }
  let scanned = 0;
  for (const who of ROTATION) {
    for (const d of days) {
      const permlink = `saos-${who}-${d}`;
      let c = null;
      try { c = await P(cb => steem.api.getContent(who, permlink, cb)); } catch (_) { continue; }
      if (!c || c.author !== who || !c.body) continue;
      scanned++;
      const votes = c.active_votes || [];
      const external = votes.filter(v => !FLEET_ALL.has(v.voter));
      const externalReal = external.filter(v => !NON_SIGNAL.has(v.voter) && Math.abs(parseInt(v.rshares || '0', 10)) > 0);
      const extRsh = externalReal.reduce((s, v) => s + parseInt(v.rshares || '0', 10), 0);
      const rec = ledger[permlink] || { author: who, day: d, title: c.title, cardId: cardIdFromTitle(c.title), samples: [] };
      rec.title = c.title;
      rec.cardId = rec.cardId || cardIdFromTitle(c.title);
      rec.lastAt = now;
      rec.lastVotes = votes.length;
      rec.lastExternal = externalReal.length;
      rec.lastExternalVoters = externalReal.map(v => v.voter).slice(0, 20);
      rec.lastExternalRshares = extRsh;
      rec.samples = (rec.samples || []).filter(s => s.at.slice(0, 10) !== now.slice(0, 10));
      rec.samples.push({ at: now, votes: votes.length, external: externalReal.length, extRshares: extRsh, payout: c.pending_payout_value || null });
      rec.samples = rec.samples.slice(-14);
      rec.cross = rec.cross || {};
      for (const [name, node] of [['hive', HIVE_NODE], ['blurt', BLURT_NODE]]) {
        const st = await crossStat(node, who, permlink);
        if (st) rec.cross[name] = st;
        await new Promise(r => setTimeout(r, 120));
      }
      ledger[permlink] = rec;
      await new Promise(r => setTimeout(r, 120));
    }
  }
  // מצבר-לכרטיס (רק-הדגימה-האחרונה-לכל-פוסט כדי-לא-להכפיל)
  const byCard = {};
  for (const [pl, r] of Object.entries(ledger)) {
    const cid = r.cardId || 'unknown';
    const b = byCard[cid] || (byCard[cid] = { posts: 0, lastExternalVotes: 0, lastExternalRshares: 0, postsWithExternal: 0 });
    b.posts++;
    b.lastExternalVotes += r.lastExternal || 0;
    b.lastExternalRshares += r.lastExternalRshares || 0;
    if ((r.lastExternal || 0) > 0) b.postsWithExternal++;
  }
  const summary = { at: now, note: 'external engagement per knowledge-card (last-sample per post) — feeds future content priorities', byCard };
  // Task 19 (harness-audit check 21): every live book stamps itself — freshness is auditable
  ledger.at = now;
  ledger.updated = now;
  fs.mkdirSync(path.dirname(OUT_LEDGER), { recursive: true });
  fs.writeFileSync(OUT_LEDGER, JSON.stringify(ledger, null, 1));
  fs.writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ state: 'ok', posts: scanned, cards: Object.keys(byCard).length }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) })); process.exit(0); });
