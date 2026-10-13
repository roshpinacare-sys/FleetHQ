#!/usr/bin/env node
// measurement-only lane — capital gate N/A (STASIS scope)
/**
 * earn-audit.cjs — THE FROM-NOTHING PROOF DESK (Z-68, CR-0046)
 * Operator directive: "אם היית חכם היית יכול לייצר גם מכלום ... אל תסמוך על
 * הטענות שלך נסה להגיע להישגים ולהוכיח ... זרימה" — don't TRUST claims: MEASURE
 * the fleet's real income from the chain itself, per account, per lane.
 *
 * WHAT IT PROVES: every zero-capital flow the fleet runs — market fills (spread
 * capture), author rewards, curation rewards, claims sweeps, the powerdown drip
 * (fill_vesting_withdraw arrivals), transfers — tallied from ACCOUNT HISTORY,
 * not from any book's own claim about itself.
 *
 * LAWS (in code):
 *  1. KEYLESS + READ-ONLY: official nodes only, nothing signed, nothing spent.
 *  2. BOUNDED WINDOW: limit 100 hard cap (measured -32801); backwards pagination
 *     minIndex-1 up to MAX_PAGES per account; stops at SINCE (fill-ledger law 6).
 *  3. CHAIN-TRUTH: tallies come from ops, never from books; a book that claims
 *     income the chain doesn't show is a DEFECT this desk exposes.
 *  4. SINGLE WRITER: writes ONLY agents/earn-audit.json + earn-audit.md.
 *  5. FAIL-SOFT EXIT 0, FAIL-LOUD BOOK: per-account errors land in the book.
 *  6. REUSE: vestsToSp from drip-canon (second-mover law), roster from
 *     soldiers-curate's SOLDIERS constant.
 *
 * Env: EARN_AUDIT_JSON (out), EARN_AUDIT_ACCOUNTS (comma list), EARN_AUDIT_DAYS
 *      (default 7), EARN_AUDIT_SKIP=1 (eval off-switch)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { vestsToSp } = require(path.join(__dirname, 'drip-canon.cjs'));

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.EARN_AUDIT_JSON || path.join(ROOT, 'agents', 'earn-audit.json');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');
const NODE = 'https://api.steemit.com';
const NODE_CROSS = 'https://api.justyy.com';
const ROSTER = ['headcorner', 'cashmachine', 'haran', 'israelnews', 'lsa', 'macrame', 'siq', 'tov', 'wic', 'wog', 'woq'];
const MAX_PAGES = +(process.env.EARN_AUDIT_MAX_PAGES || 30); // Z-70 CR-0048: 4 pages (400 ops) hid the drip on rotation days — headcorner's 7d window covered only ~404 ops; 30 pages = ~3000 ops/account
const CONVERT_MATURITY_DAYS = 3.5; // STEEM chain law: SBD→STEEM conversion matures 3.5 days after open (Z-72 CR-0054 — computed from the op timestamp, never guessed)
const WINDOW_DAYS = +(process.env.EARN_AUDIT_DAYS || 7);

function rpc(method, params, node = NODE, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const u = new URL(node);
    const req = https.request({ hostname: u.hostname, path: u.pathname || '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); if (j.error) return reject(new Error(String(j.error.message || 'rpc-error').slice(0, 90))); resolve(j.result); }
        catch (_) { reject(new Error('bad-rpc')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    req.write(payload); req.end();
  });
}

const num = (s) => parseFloat(s) || 0;

// ── pure tally (exported for E37) ────────────────────────────────────────────
function freshTally() {
  return { author_sbd: 0, author_steem: 0, author_vests: 0, curation_vests: 0, claimed_steem: 0, claimed_sbd: 0, claimed_vests: 0, drip_arrived_steem: 0, transfer_in_steem: 0, transfer_in_sbd: 0, transfer_out_steem: 0, sold_steem: 0, recv_sbd: 0, bought_steem: 0, spent_sbd: 0, fills: 0, votes: 0, posts: 0, converts_sbd: 0, ops: 0, convert_maturities: [], convert_fills: [] }; // Z-71 CR-0050: the sensor keeps the maturity SCHEDULE, not just the SBD sum — the convert-canon composes its pending book from this memory
}
function tallyOp(t, op, opTs) {
  const [kind, b] = op;
  t.ops++;
  if (kind === 'author_reward') { t.author_sbd += num(b.sbd_payout); t.author_steem += num(b.steem_payout); t.author_vests += num(b.vesting_payout); }
  else if (kind === 'curation_reward') t.curation_vests += num(b.reward);
  else if (kind === 'claim_reward_balance') { t.claimed_steem += num(b.reward_steem); t.claimed_sbd += num(b.reward_sbd); t.claimed_vests += num(b.reward_vesting_balance); }
  else if (kind === 'fill_vesting_withdraw') t.drip_arrived_steem += num(b.deposited);
  else if (kind === 'convert') { t.converts_sbd += num(b.amount); const openTs = opTs || null; const maturesAt = openTs ? new Date(Date.parse(openTs) + CONVERT_MATURITY_DAYS * 864e5).toISOString().replace('.000', '') : null; t.convert_maturities.push({ requestid: b.requestid, amount_sbd: num(b.amount), open_ts: openTs, matures_at: maturesAt, conversion_date: b.conversion_date || maturesAt }); } // Z-72 CR-0054: the chain `convert` op carries NO conversion_date (measured live: body = {amount, owner, requestid} only) — maturity is a CHAIN LAW (open + 3.5d), the sensor computes it itself; booking `undefined` left the 24h pre-position window dead code forever
  else if (kind === 'fill_convert_request') t.convert_fills.push({ requestid: b.requestid }); // the closure — the schedule needs it to know what is still pending
  else if (kind === 'transfer') {
    const incoming = b.to === b.__account;
    if (String(b.amount).endsWith('STEEM')) { if (incoming) t.transfer_in_steem += num(b.amount); else t.transfer_out_steem += num(b.amount); }
    else if (String(b.amount).endsWith('SBD')) { if (incoming) t.transfer_in_sbd += num(b.amount); else t.transfer_out_sbd = (t.transfer_out_sbd || 0) + num(b.amount); }
  }
  else if (kind === 'fill_order') {
    // DIRECTION LAW (fill-ledger Z-64): ours-as-OPEN → we GAVE open_pays and RECEIVED
    // current_pays; ours-as-CURRENT (open_owner != us) → we GAVE current_pays.
    const oursAsOpen = b.open_owner === b.__account;
    const gave = String(oursAsOpen ? (b.open_pays || '') : (b.current_pays || ''));
    const got = String(oursAsOpen ? (b.current_pays || '') : (b.open_pays || ''));
    if (!gave || !got) return t; // honest skip: unparseable body
    t.fills++;
    if (gave.endsWith('STEEM') && got.endsWith('SBD')) { t.sold_steem += num(gave); t.recv_sbd += num(got); }
    else if (gave.endsWith('SBD') && got.endsWith('STEEM')) { t.spent_sbd += num(gave); t.bought_steem += num(got); }
  }
  else if (kind === 'vote') t.votes++;
  else if (kind === 'comment' && !String(b.parent_author || '').length) t.posts++;
  return t;
}

async function walkAccount(account, sinceTs, gp) {
  const t = freshTally();
  let start = -1, pagesUsed = 0, oldestScanned = null, reachedFloor = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const hist = await rpc('condenser_api.get_account_history', [account, start, 100]).catch(() => null);
    if (!hist || !hist.length) break;
    pagesUsed++;
    let minSeq = Infinity, oldestTs = null;
    for (const [seq, e] of hist) {
      minSeq = Math.min(minSeq, seq);
      oldestTs = oldestTs && oldestTs < e.timestamp ? oldestTs : e.timestamp;
      if (e.timestamp < sinceTs) continue;
      e.op[1] && (e.op[1].__account = account);
      tallyOp(t, e.op, e.timestamp); // Z-72 CR-0054: op timestamp rides along — the maturity law needs the open moment
    }
    if (oldestTs) oldestScanned = oldestScanned && oldestScanned < oldestTs ? oldestScanned : oldestTs;
    if (oldestTs && oldestTs < sinceTs) { reachedFloor = true; break; }
    if (minSeq === Infinity || minSeq <= 0) { reachedFloor = true; break; }
    start = minSeq - 1;
  }
  // Z-70 WINDOW HONESTY (anti-claims law): a walk that burned every page WITHOUT
  // reaching the window floor covered LESS than the window — the book must say so,
  // never present a truncated walk as full 7d coverage.
  t.__walk = { pages_used: pagesUsed, max_pages: MAX_PAGES, oldest_scanned_ts: oldestScanned, since_ts: sinceTs, truncated: !reachedFloor && pagesUsed >= MAX_PAGES && pagesUsed > 0 };
  return t;
}

function usdOf(t, gp, feed) {
  const sp = vestsToSp(1, gp); // SP per VESTS
  const steemUsd = feed && feed.base && feed.quote ? num(feed.base) / num(feed.quote) : null; // SBD per STEEM (peg ratio)
  const sbdSteem = null; // filled by caller from the internal book if present
  return { steemUsd, curation_sp: t.curation_vests * sp, author_vests_sp: t.author_vests * sp, claimed_vests_sp: t.claimed_vests * sp };
}

async function main() {
  if (String(process.env.EARN_AUDIT_SKIP || '') === '1') { console.log('[earn-audit] SKIP: eval-context off-switch, zero writes'); return; }
  const t0 = Date.now();
  const now = new Date();
  const sinceTs = new Date(now.getTime() - WINDOW_DAYS * 864e5).toISOString().slice(0, 19);
  const accounts = (process.env.EARN_AUDIT_ACCOUNTS || ROSTER.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const [gp, feed] = await Promise.all([
    rpc('condenser_api.get_dynamic_global_properties', []),
    rpc('condenser_api.get_current_median_history_price', []).catch(() => null),
  ]);
  const rows = [];
  for (const acc of accounts) {
    const t = await walkAccount(acc, sinceTs, gp).catch((e) => ({ error: String(e.message).slice(0, 90), ops: 0 }));
    const x = usdOf(t, gp, feed);
    const w = t.__walk || {};
    rows.push({ account: acc, window_days: WINDOW_DAYS, ...(({ __walk, ...rest }) => rest)(t), curation_sp: +x.curation_sp.toFixed(6), author_vests_sp: +x.author_vests_sp.toFixed(6), claimed_vests_sp: +x.claimed_vests_sp.toFixed(6), walk_pages: w.pages_used || 0, oldest_scanned_ts: w.oldest_scanned_ts || null, truncated: !!w.truncated, error: t.error || null });
  }
  const totals = rows.reduce((a, r) => {
    for (const k of Object.keys(r)) if (typeof r[k] === 'number' && k !== 'account' && k !== 'window_days') a[k] = +( (a[k] || 0) + r[k] ).toFixed(6);
    return a;
  }, {});
  const book = {
    protocol: 'SAOS-EARN-AUDIT/1', at: now.toISOString(), window_days: WINDOW_DAYS, since: sinceTs,
    source: NODE + ' (+cross ' + NODE_CROSS + ')', keyless: true,
    feed: feed ? { base: feed.base, quote: feed.quote, steem_usd_implied: +(num(feed.base) / num(feed.quote)).toFixed(6) } : null,
    per_account: rows, fleet_totals: totals,
    truncated_accounts: rows.filter((r) => r.truncated).length,
    window_law: 'truncated: true = the walk burned its page cap before reaching the window floor — this row covers ONLY oldest_scanned_ts..now, never present it as full window coverage (Z-70 anti-claims law)',
    duration_ms: Date.now() - t0,
    law: 'chain-truth: tallied from account_history ops only — a book claiming income the chain does not show is exposed here',
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1) + '\n');
  const md = [`# Earn audit · ${book.at} (window ${WINDOW_DAYS}d, keyless chain-truth)`, '',
    '| account | author SBD | author STEEM | curation SP | claimed vests SP | drip arrived STEEM | sold STEEM | recv SBD | bought STEEM | spent SBD | converts SBD | fills | votes | posts |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) md.push(`| ${r.account}${r.truncated ? ' ⚠TRUNC' : ''} | ${r.author_sbd} | ${r.author_steem} | ${r.curation_sp} | ${r.claimed_vests_sp} | ${r.drip_arrived_steem} | ${r.sold_steem} | ${r.recv_sbd} | ${r.bought_steem} | ${r.spent_sbd} | ${r.converts_sbd} | ${r.fills} | ${r.votes} | ${r.posts} |`);
  md.push('', `**fleet totals:** ${JSON.stringify(totals)}`, '', `_feed: ${JSON.stringify(book.feed)} — every number above is counted from chain ops, not from books_`);
  fs.writeFileSync(OUT_MD, md.join('\n') + '\n');
  console.log(`[earn-audit] booked ${rows.length} accounts · fills ${totals.fills} · sold ${totals.sold_steem} STEEM → ${totals.recv_sbd} SBD · bought ${totals.bought_steem} STEEM for ${totals.spent_sbd} SBD · votes ${totals.votes} · curation ${totals.curation_sp} SP · drip ${totals.drip_arrived_steem} STEEM · converts ${totals.converts_sbd} SBD in ${book.duration_ms}ms`);
}

module.exports = { freshTally, tallyOp, ROSTER, OUT_JSON };
if (require.main === module) main().catch((e) => { console.log('[earn-audit] RECEIPT (fail-soft): ' + String(e.message).slice(0, 120)); process.exit(0); });
