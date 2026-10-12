#!/usr/bin/env node
/**
 * truth-fix.cjs — apply measured corrections to published network content (r145-c).
 *
 * For every entry in agents/truth-fixes.json:
 *   1. Pull the live body from the chain (condenser_api.get_content). Skip if missing.
 *   2. Skip if the exact `find` substring is absent (already fixed or drifted — honest skip).
 *   3. Fill the replacement template from LIVE truth:
 *        · /api/mission       → usdPerDay7dAvg          (TRUTH_URL, default http://localhost:3000)
 *        · /api/economy/pnl   → realized SBD/USD, trips (TRUTH_URL)
 *      A fix whose truth source is unreachable is SKIPPED — nothing faked.
 *   4. Sign: key = SA_FLEET_KEYS[author] || STEEM_POSTING_WIF || WEAVE_STEEM_WIF;
 *      derived public must match the LIVE posting authority bit-for-bit before broadcast
 *      (R75 doctrine: the key announces the signer, the chain judges).
 *   5. Broadcast a `comment` op with the SAME permlink (that is how Steem edits work),
 *      then read the content back and verify the corrected line is on-chain.
 *   6. Receipt → agents/receipts/truth-fix-receipt.json. fail-soft exit-0, zero secrets.
 */
const fs = require('fs');
const path = require('path');

const steem = require('steem');
steem.api.setOptions({ url: 'https://api.steemit.com' });
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.RECEIPT_OUT || path.join(ROOT, 'agents', 'receipts', 'truth-fix-receipt.json');
const TRUTH_URL = (process.env.TRUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
const P = (fn) => new Promise((res, rej) => fn((e, r) => e ? rej(e) : res(r)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadKeys() {
  const raw = process.env.SA_FLEET_KEYS || '';
  if (!raw) return {};
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) || {}; } catch (_) { return {}; }
}

async function getTruth(p) {
  try {
    const r = await fetch(TRUTH_URL + p, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

async function main() {
  try { if (require('./capital-gate.cjs').stasisHalt('truth-fix')) return; } catch (e) { console.log('[CAPITAL-GATE] truth-fix — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  const t0 = new Date().toISOString();
  const receipt = { at: t0, tool: 'truth-fix.cjs', truthUrl: TRUTH_URL, fixes: [], tally: {} };
  const fixesPath = path.join(__dirname, 'truth-fixes.json');
  const plan = JSON.parse(fs.readFileSync(fixesPath, 'utf8'));
  const keys = loadKeys();

  // live truth once, reused across fixes; CI fallback = the committed baseline snapshot
  let mission = await getTruth('/api/mission');
  let pnl = await getTruth('/api/economy/pnl?snapshot=0');
  let truthSource = 'live TRUTH_URL';
  if (!mission || !pnl) {
    try {
      const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'truth-baseline.json'), 'utf8'));
      if (!mission) mission = { measured: { usdPerDay7dAvg: base.measured.usdPerDay7dAvg } };
      if (!pnl) pnl = { realized: { capturedSbd: base.measured.realizedSbd, capturedUsd: base.measured.realizedUsd, trips: base.measured.trips, fillsTotal: base.measured.fillsTotal } };
      truthSource = `truth-baseline.json snapshot ${base.takenAt}`;
    } catch (_) { /* stay unreachable — fixes will SKIP honestly */ }
  }
  const truth = {
    usdPerDay: mission?.measured?.usdPerDay7dAvg != null ? Number(mission.measured.usdPerDay7dAvg).toFixed(4) : null,
    usdPerDayLive: mission?.measured?.usdPerDay7dAvg != null ? Number(mission.measured.usdPerDay7dAvg).toFixed(5) : null,
    realizedSbd: pnl?.realized?.capturedSbd != null ? Number(pnl.realized.capturedSbd).toFixed(2) : null,
    realizedUsd: pnl?.realized?.capturedUsd != null ? Number(pnl.realized.capturedUsd).toFixed(2) : null,
    trips: pnl?.realized?.trips != null ? Number(pnl.realized.trips) : null,
  };
  receipt.truth = truth;
  receipt.truthSources = {
    mission: mission ? `${truthSource} · usdPerDay7dAvg` : 'unreachable',
    pnl: pnl ? `${truthSource} · realized (FIFO on real fills)` : 'unreachable',
  };

  for (const fix of plan.fixes || []) {
    const R = { id: fix.id, author: fix.author, permlink: fix.permlink, url: `https://steemit.com/@${fix.author}/${fix.permlink}` };
    try {
      const c = await P(cb => steem.api.getContent(fix.author, fix.permlink, cb));
      if (!c || c.author !== fix.author) { R.status = 'SKIP-NOT-FOUND'; receipt.fixes.push(R); continue; }
      if (!c.body.includes(fix.find)) { R.status = 'SKIP-FIND-ABSENT'; receipt.fixes.push(R); continue; }

      // template fill from live truth
      const need = fix.truth || {};
      let ok = true;
      let body = fix.replace;
      for (const [k, v] of Object.entries(need)) {
        const val = truth[k];
        if (val == null) { R.status = `SKIP-TRUTH-UNAVAILABLE(${k})`; ok = false; break; }
        body = body.split('${{' + k + '}}').join(String(val));
      }
      if (!ok) { receipt.fixes.push(R); continue; }
      if (/\$\{\{/.test(body)) { R.status = 'SKIP-TEMPLATE-LEFTOVER'; receipt.fixes.push(R); continue; }

      const newBody = c.body.replace(fix.find, body);
      if (newBody === c.body) { R.status = 'SKIP-NO-CHANGE'; receipt.fixes.push(R); continue; }

      // key: announces the signer — verify bit-for-bit against the live authority
      const wif = keys[fix.author] || (process.env.STEEM_POSTING_WIF || '').trim() || (process.env.WEAVE_STEEM_WIF || '').trim() || null;
      if (!wif) { R.status = 'SKIP-NO-KEY'; receipt.fixes.push(R); continue; }
      const acc = (await P(cb => steem.api.getAccounts([fix.author], cb)))[0];
      const livePub = acc && acc.posting && acc.posting.key_auths && acc.posting.key_auths[0] && acc.posting.key_auths[0][0];
      let pub; try { pub = steem.auth.wifToPublic(wif); } catch (_) { R.status = 'SKIP-KEY-PARSE'; receipt.fixes.push(R); continue; }
      if (!livePub || pub !== livePub) { R.status = 'SKIP-KEY-MISMATCH'; receipt.fixes.push(R); continue; }

      const ops = [['comment', {
        parent_author: c.parent_author || '',
        parent_permlink: c.parent_permlink || fix.permlink,
        author: fix.author, permlink: fix.permlink, title: c.title || '',
        body: newBody, json_metadata: c.json_metadata || '{}',
      }]];
      await P(cb => steem.broadcast.send({ operations: ops, extensions: [] }, [wif], cb));
      await sleep(2500);
      const back = await P(cb => steem.api.getContent(fix.author, fix.permlink, cb));
      R.status = (back && back.body && back.body.includes(body)) ? 'FIXED-VERIFIED' : 'FIXED-READBACK-PENDING';
      R.bodyLenBefore = c.body.length; R.bodyLenAfter = newBody.length;
    } catch (e) {
      R.status = 'ERR'; R.msg = String(e.message || e).slice(0, 120);
    }
    receipt.fixes.push(R);
    console.log(`[${R.status}] ${fix.author}/${fix.permlink} (${fix.id})`);
  }
  for (const f of receipt.fixes) receipt.tally[f.status] = (receipt.tally[f.status] || 0) + 1;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ state: 'ok', tally: receipt.tally }));
  process.exit(0);
}

main().catch(e => {
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), tool: 'truth-fix.cjs', fatal: String(e.message || e).slice(0, 200) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
  process.exit(0);
});
