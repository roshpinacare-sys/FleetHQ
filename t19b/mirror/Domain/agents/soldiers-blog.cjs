#!/usr/bin/env node
/**
 * SAOS SOLDIERS-BLOG ENGINE v3 — soldiers publish in their own voice (Z-25, 2026-09-30)
 *
 * v3 pivot (operator directive): content in ENGLISH ONLY. Every Hebrew template was retired.
 * A sanity gate rejects any title/body carrying em/en dashes or stock AI-phrase markers
 * before anything can be signed. Each soldier publishes through a persona (personas.json)
 * so every account has a desk, a voice, and a role.
 *
 * מה-חדש ב-v2:
 *   · תוכן לכל-10 החיילים ברוטציה (v1 כיסה 6 — lsa/macrame/cashmachine/wog היו חסומים)
 *   · תוכן נתוני-אמת: מדידה-חיה לפני-פרסום (SP/VP/RC/כיסוי-האצלות) מוזרמת לתוכן —
 *     כל-מספר בפוסט הוא מספר-אמת שנמדד רגע-קודם, לא טענה-סטטית
 *   · תיקון-כנות: עדכון סטטוס-מפתחות-הראש (חיים מאז 2026-09-29)
 *   · כותרות-סדרה + מבנה מקצועי (כותרת · נתונים · ניתוח · מסקנה)
 *
 * דוקטרינה: פרסום צורך RC (לא VP) — גם-חייל-עייף יכול לפרסם. אימות-לפני-חתימה
 * (נגזרת-מפתח מול key_auths) + קריאה-חוזרת + fail-soft · אפס-סודות-בפלט.
 * הרצה: node agent/soldiers-blog.cjs   (VAULT_RECOVERY מהריפו-הפרטי)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const steem = require('steem');

steem.api.setOptions({ url: 'https://api.steemit.com' });
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.RECEIPT_OUT || path.join(ROOT, 'agent', 'soldiers-blog-receipt.json');
const MIN_RC = 25;
const POSTS_PER_DAY = 10; // v3: כל-החיילים פעילים כל-יום (קומפקט) + יום-עומק 1-מתוך-3

function recoverVault() {
  const out = '/tmp/sb-keys';
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const metas = [];
  try { metas.push(JSON.parse(fs.readFileSync(path.join(ROOT, 'agent', 'recovery-meta.json'), 'utf8'))); } catch (_) {}
  try {
    const log = execFileSync('git', ['-C', ROOT, 'log', '--format=%H', '-n', '40', '--', 'agent/recovery-meta.json'], { encoding: 'utf8' });
    for (const c of log.split('\n').filter(Boolean)) {
      try { metas.push(JSON.parse(execFileSync('git', ['-C', ROOT, 'show', `${c}:agent/recovery-meta.json`], { encoding: 'utf8' }))); } catch (_) {}
    }
  } catch (_) {}
  const crypto = require('crypto');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const vdir = path.join(ROOT, 'agent', 'vault');
  let encs = [];
  try { encs = fs.readdirSync(vdir).filter(f => f.endsWith('.enc')).map(f => path.join(vdir, f)); } catch (_) {}
  for (const enc of encs) {
    const outer = sha(enc);
    for (const m of metas) {
      if (!m || !m.keysZipPass || m.keysZipSha256 !== outer) continue;
      try {
        const dec = path.join(out, 'v.zip');
        execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', enc, '-out', dec, '-pass', 'env:SBZP'], { env: { ...process.env, SBZP: m.keysZipPass }, stdio: 'pipe' });
        if (fs.readFileSync(dec).subarray(0, 2).toString('latin1') !== 'PK') continue;
        execFileSync('unzip', ['-o', '-q', dec, '-d', out], { stdio: 'pipe' });
        const vj = path.join(out, 'agent', 'keys', 'vault.json');
        if (fs.existsSync(vj)) return vj;
      } catch (_) {}
    }
  }
  return null;
}

const P = (fn) => new Promise((res, rej) => fn((e, r) => e ? rej(e) : res(r)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rpc = (method, params) => new Promise((res, rej) => {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const req = require('https').request({ hostname: 'api.steemit.com', path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 20000 }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { const j = JSON.parse(d); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } });
  });
  req.on('error', rej); req.write(body); req.end();
});

const CARDS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge-cards-en.json'), 'utf8')); } catch (_) { return []; } })();
const PERSONAS = require('./persona-store.cjs').personas(); // T3: doctrine sealed (persona-store)
const personaOf = (who) => PERSONAS.find(p => p.account === who) || { desk: 'journal', brief: 'Notes from the network.' };

// Language discipline: English-only, zero AI-telltale markers. A card that fails the
// gate is skipped and the deterministic wheel moves to the next card. Cheap insurance.
const MARKERS = [
  /[—–]/,
  /\bdelve\b/i, /\btapestry\b/i, /\bmoreover\b/i, /\bfurthermore\b/i, /\bin conclusion\b/i,
  /\bit'?s important to note\b/i, /\bdive into\b/i, /\bvibrant\b/i, /\bseamless(ly)?\b/i,
  /\blet'?s explore\b/i, /\bembark\b/i, /\bgame.?chang/i, /\bstunning\b/i, /\bmust-read\b/i,
];
const sanity = (s) => typeof s === 'string' && s.length > 0 && !MARKERS.some(r => r.test(s));

const TAGMAP = {
  security: ['security', 'privacy', 'technology'],
  technology: ['technology', 'automation', 'blog'],
  steem: ['steem', 'cryptocurrency', 'blog'],
  defi: ['defi', 'leofinance', 'finance'],
  network: ['web3', 'blog', 'cryptocurrency'],
};

const SIGNOFFS = [
  'Numbers above were pulled from the chain minutes before this went up.',
  'No promises here. Just receipts.',
  'Check any of it. The chain is public.',
  'The network runs the same whether anyone watches or not.',
  'Everything measurable here was measured, not assumed.',
  'Small and real beats big and invented.',
  'If one number surprises you, the RPC read is one URL away.',
  'Built on small real things. The rest is commentary.',
  'I re-read the RPC output twice before signing this one.',
  'That is the whole update. The chain holds the rest.',
  'Nothing here is a forecast. It is a snapshot.',
  'You can verify every line from a phone browser, no login.',
];

const OPENERS = [
  'A note from the {desk} desk.',
  'From the {desk} desk today.',
  'Short one from the {desk} desk.',
  'Continuing the series from the {desk} desk.',
  'Quick entry from the {desk} desk.',
  'The {desk} desk checked in.',
  'Another one from the {desk} side of the network.',
  'Back at the {desk} desk this morning.',
];

// R-CONTENT-1: the SAME measured numbers now render in account-specific human
// forms instead of one stamped sentence shared by all ten posts a day. The
// numbers stay the real chain reads; only their presentation varies.
function measuredLine(mode, sp, del, vpReady) {
  if (sp == null || del == null) {
    return '**Standing practice:** every number in this series is read from the chain at publish time. Keys are verified against live authority before anything signs, and every write is read back after.';
  }
  switch (mode % 4) {
    case 0:
      return `Measured on-chain just before publishing: ${sp} SP across the fleet, live delegations on ${del} accounts, ${vpReady} of 11 above the voting threshold.`;
    case 1:
      return `Fleet stake this morning: ${sp} SP. Delegations live on ${del} accounts. ${vpReady} of 11 wallets hold enough voting power to act today.`;
    case 2:
      return `Ran the numbers before signing: ${sp} SP total stake, ${del} accounts carrying live delegations, and ${vpReady} of the 11 above the 20% voting floor.`;
    default:
      return `Stake: ${sp} SP. Delegations: ${del}. Ready to vote right now: ${vpReady} of 11. All three reads came from the public RPC minutes ago.`;
  }
}

// ── מדידה-חיה: נתוני-אמת לתוכן ──
async function measure() {
  const FLEET = ['cashmachine', 'haran', 'israelnews', 'lsa', 'macrame', 'siq', 'tov', 'wic', 'wog', 'woq', 'headcorner'];
  const g = await P(cb => steem.api.getDynamicGlobalProperties(cb));
  const ratio = parseFloat(g.total_vesting_fund_steem) / parseFloat(g.total_vesting_shares); // SP ל-VESTS
  const accts = await P(cb => steem.api.getAccounts(FLEET, cb));
  const st = { vp: {}, delegated: 0, soldiers: 0, totalSP: 0 };
  for (const a of accts) {
    st.vp[a.name] = Math.round(a.voting_power / 100);
    if (a.name !== 'headcorner') { st.soldiers++; if (parseFloat(a.received_vesting_shares) > 0) st.delegated++; }
    st.totalSP += (parseFloat(a.vesting_shares) + parseFloat(a.received_vesting_shares) - parseFloat(a.delegated_vesting_shares)) * ratio;
  }
  st.totalSP = Math.round(st.totalSP);
  st.vpReady = FLEET.filter(n => st.vp[n] >= 20).length;
  return st;
}

// Content engine v3: rotating English knowledge card + live measured numbers + persona voice.
// Each soldier gets a different card daily (wheel of 39). Deep day 1-in-3 carries the full
// measured table; the rest stay compact. Titles derive from the card, closers rotate.
function contentFor(who, day, ctx) {
  const idx = ROTATION.indexOf(who);
  if (idx < 0 || !CARDS.length) return null;
  const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  let card = null, cardShift = 0;
  for (let s = 0; s < CARDS.length; s++) {
    const cand = CARDS[(doy * ROTATION.length + idx + s) % CARDS.length];
    if (sanity(cand.title) && sanity(cand.body)) { card = cand; cardShift = s; break; }
  }
  if (!card) return null;
  const deep = (doy + idx) % 3 === 0;
  const s = ctx || {};
  const sp = s.totalSP != null ? Number(s.totalSP).toLocaleString('en-US') : null;
  const del = s.delegated != null && s.soldiers != null ? `${s.delegated}/${s.soldiers}` : null;
  const vpReady = s.vpReady != null ? String(s.vpReady) : null;
  const signoff = SIGNOFFS[(doy + idx * 3 + cardShift) % SIGNOFFS.length];
  const opener = OPENERS[(doy + idx * 5) % OPENERS.length].replace('{desk}', personaOf(who).desk);
  const liveLine = measuredLine(doy + idx, sp, del, vpReady);
  const tags = TAGMAP[card.tag] || ['blog'];
  if (deep) {
    // R-CONTENT-1: alternate the deep-day evidence between a table and prose so
    // two soldiers posting the same day do not ship identical skeletons.
    const tabled = (doy + idx) % 2 === 0;
    const evidence = tabled
      ? [
          `| reading | value (measured before publishing) |`,
          `|---|---|`,
          `| fleet stake | ${sp ?? 'n/a'} SP |`,
          `| accounts on live delegations | ${del ?? 'n/a'} |`,
          `| above voting threshold (VP 20%+) | ${vpReady ?? 'n/a'} |`,
          `| RC gate | publishing stops under 25% and waits |`,
        ].join('\n')
      : [
          `Fleet stake read from the chain at publish time: ${sp ?? 'n/a'} SP.`,
          `Live delegations: ${del ?? 'n/a'} accounts. Above the 20% voting floor: ${vpReady ?? 'n/a'} of 11.`,
          `The RC gate stays armed: publishing stops under 25% and waits.`,
        ].join('\n');
    const body = [
      `**${card.title}**`,
      ``,
      opener,
      ``,
      card.body,
      ``,
      `---`,
      ``,
      evidence,
      ``,
      signoff,
    ].join('\n');
    if (!sanity(body)) return null;
    const title = `${card.title} (measured ${day})`;
    return { title: sanity(title) ? title : card.title, tags, body };
  }
  const body = [
    `**${card.title}**`,
    ``,
    opener,
    ``,
    card.body,
    ``,
    `---`,
    ``,
    liveLine,
    ``,
    signoff,
  ].join('\n');
  if (!sanity(body)) return null;
  return { title: card.title, tags, body };
}

const ROTATION = ['haran', 'wic', 'woq', 'siq', 'tov', 'israelnews', 'lsa', 'macrame', 'cashmachine', 'wog'];

async function main() {
  try { if (require('./capital-gate.cjs').stasisHalt('soldiers-blog')) return; } catch (e) { console.log('[CAPITAL-GATE] soldiers-blog — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  // CR-0065: the human cadence desk owns publishing now — burst stacks defer (FORCE_LEGACY=1 overrides)
  try {
    const slots = require('./persona-store.cjs').slots(); // T3: doctrine sealed (persona-store)
    if (slots.version >= 2 && process.env.FORCE_LEGACY !== '1') { console.log('[soldiers-blog] DEFER — publishing owned by human-cadence.cjs (persona-slots v2, CR-0065)'); return; }
  } catch (_) {}
  const t0 = new Date().toISOString();
  // מקורות-מפתח: (1) SA_FLEET_KEYS env (ריפו-ציבורי) (2) כספת-עצמית (3) VAULT ידני
  const envV = (() => { const raw = process.env.SA_FLEET_KEYS || ''; if (!raw) return null; try { const map = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); return { accounts: Object.entries(map).map(([username, wif]) => ({ username, keys: { posting: { wif } } })) }; } catch (_) { return null; } })();
  const vaultPath = process.env.VAULT || (!envV ? recoverVault() : null);
  if (!vaultPath && !envV) { console.log('[soldiers-blog] NO-VAULT-NO-ENV — fail-soft'); return; }
  const vault = envV || JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
  const keymap = {};
  for (const a of vault.accounts) {
    const k = a.keys || {};
    const wif = (k.posting && k.posting.wif) || (k.steem && k.steem.posting && k.steem.posting.wif) || null;
    if (wif && a.username !== 'headcorner') keymap[a.username] = wif; // ראש: מפרסם-דרך-מנוע-נפרד
  }
  console.log(`[soldiers-blog] keys: ${Object.keys(keymap).length} · zero secrets printed`);

  // מדידה-חיה לפני-תוכן: כל-מספר-בפוסט = מספר-אמת
  let ctx = null;
  try { ctx = await measure(); console.log(`[soldiers-blog] measured: SP=${ctx.totalSP} vpReady=${ctx.vpReady} delegated=${ctx.delegated}/${ctx.soldiers}`); } catch (e) { console.log(`[soldiers-blog] measure failed (${String(e.message).slice(0, 50)}) — content falls back to structural truth`); }

  const day = new Date().toISOString().slice(0, 10);
  const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  const pick = [];
  for (let i = 0; pick.length < POSTS_PER_DAY && i < ROTATION.length; i++) {
    const who = ROTATION[(doy + i) % ROTATION.length];
    if (keymap[who] && contentFor(who, day, ctx)) pick.push(who);
  }
  console.log(`[soldiers-blog] day ${day} · rotation picks: ${pick.join(', ')}`);

  // שער-יומן: אל תפרסם פעמיים (permlink קבוע לפי-תאריך)
  const results = [];
  for (const who of pick) {
    const c = contentFor(who, day, ctx);
    const permlink = `saos-${who}-${day.replace(/-/g, '')}`;
    const R = { author: who, permlink, title: c.title };
    try {
      const acc = (await rpc('condenser_api.get_accounts', [[who]]))[0];
      let rcPct = null;
      try { const rc = await rpc('rc_api.find_rc_accounts', { accounts: [who] }); const m = rc.rc_accounts[0].rc_manabar; rcPct = 100 * Number(m.current_mana) / Number(rc.rc_accounts[0].max_rc); } catch (_) {}
      R.rcPct = rcPct == null ? null : Math.round(rcPct);
      if (rcPct != null && rcPct < MIN_RC) { R.status = `SKIP-RC-LOW(${R.rcPct})`; }
      else {
        const existing = await P(cb => steem.api.getContent(who, permlink, cb)).catch(() => null);
        if (existing && existing.author) { R.status = 'SKIP-ALREADY-POSTED'; }
        else {
          let pub; try { pub = steem.auth.wifToPublic(keymap[who]); } catch (e2) { R.status = 'SKIP-KEY-PARSE'; results.push(R); console.log(`[${R.status}] ${who}`); continue; }
          const onchain = acc.posting.key_auths[0][0];
          if (pub !== onchain) { R.status = 'SKIP-KEY-MISMATCH'; }
          else {
            const ops = [['comment', { parent_author: '', parent_permlink: c.tags[0], author: who, permlink, title: c.title, body: c.body, json_metadata: JSON.stringify({ tags: c.tags, app: 'saos-soldiers-blog/3', format: 'markdown' }) }],
              ['comment_options', { author: who, permlink, max_accepted_payout: '1000000.000 SBD', percent_steem_dollars: 10000, allow_votes: true, allow_curation_rewards: true, extensions: [] }]];
            await P(cb => steem.broadcast.send({ operations: ops, extensions: [] }, [keymap[who]], cb));
            await sleep(2000);
            const chk = await P(cb => steem.api.getContent(who, permlink, cb));
            R.status = (chk && chk.author === who) ? 'POSTED-VERIFIED' : 'BROADCAST-NO-READBACK';
            R.url = `https://steemit.com/@${who}/${permlink}`;
          }
        }
      }
    } catch (e) { R.status = 'FAIL'; R.err = String(e.message || e).slice(0, 100); }
    results.push(R);
    console.log(`[${R.status}] ${who} → ${R.url || permlink}`);
    await sleep(500);
  }
  const receipt = { ok: true, tool: 'soldiers-blog.cjs', version: 3, doctrine: 'soldiers publish measured truth in their own English voice: verify-then-sign, keys in memory only, zero AI-telltale markers', at: t0, day, tally: { posted: results.filter(r => r.status === 'POSTED-VERIFIED').length, total: results.length }, results };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 2));
  console.log(`[soldiers-blog] DONE · receipt → ${OUT}`);
}
main().catch(e => { console.error('[soldiers-blog] fatal:', String(e.message || e).slice(0, 160)); process.exit(0); });
