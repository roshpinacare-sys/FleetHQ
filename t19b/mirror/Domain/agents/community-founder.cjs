#!/usr/bin/env node
/**
 * community-founder.cjs — THE COMMUNITY HOME (CR-0066, fleet Rung 36)
 *
 * Why this desk exists (owner directive 2026-10-04): "יש לנסות לפתוח לנו קהילה יעודית
 * בסטים" — the fleet needs its own house on Steem: a community where the eleven accounts
 * are the founding members, the quality grows up INSIDE first, and the door opens outward
 * only when the bar is met.
 *
 * Ground truth measured from the live chain BEFORE code (Rung discipline, probe-first):
 * the PromoSteem flow (hive-153176, creator arie.steem) shows the whole creation ceremony:
 *   op 0  account_create {creator, fee: '3.000 STEEM', new_account_name: 'hive-153176', keys}
 *         — signed with the creator's ACTIVE key; the 3 STEEM is exactly chainProps
 *           account_creation_fee, burned with the account.
 *   op 1  custom_json id='community' ["setRole",{community,account,role:'admin'}]
 *         — signed with the COMMUNITY account's own POSTING key (the creator generated
 *           the keys and kept them, then acted AS the community).
 *   op 2  ["updateProps",{community,props:{title,about,...}}] — same signature.
 * Read-back surfaces probed live: bridge.get_community {name,observer}, bridge.list_subscribers
 * {community} -> [[account,role,title,joined]], bridge.list_community_roles {community,last,limit}
 * -> [[account,role,title]] with the community account itself as implicit 'owner'.
 *
 * Laws:
 *  · PROBE-FIRST — every run re-measures: name availability, liquid STEEM, open orders,
 *    account_creation_fee, RC. No assumptions carried between runs.
 *  · FUNDING LAW — the 3 STEEM fee is funded from OUR OWN idle capital, never from thin
 *    air and never from the owner: if liquid < fee + margin, the desk cancels the own
 *    STEEM sell order FARTHEST from the market (the idlest depth), one-cancel coverage
 *    preferred, at most MAX_CANCELS per run. SBD orders are never touched. When the
 *    powerdown inflow lands (2026-10-10) the same law funds it without a cancel.
 *  · KEY CEREMONY — the community account's four keys are generated in memory from a
 *    256-bit random master (crypto.randomBytes), derived via steem.auth.getPrivateKeys,
 *    and land ONLY in the local vault file (600 perms, outside every repo, never
 *    printed, never committed). The books carry txids and public keys — nothing else.
 *  · COLD ACTIVE — the community account's owner/active keys are stored and never used;
 *    every community op is signed with the community POSTING key, exactly like the
 *    measured ground truth. headcorner's active key signs only account_create,
 *    delegate_vesting_shares and (funding) limit_order_cancel.
 *  · RC FIRST — a fresh account has no RC: the SP delegation to the community lands
 *    BEFORE the first community custom_json (community RC reserve, equal-share math
 *    untouched — this is a reserve line, not a soldier share).
 *  · TYPE LAW — the name must match /^hive-1\d{5}$/: the condenser Role.parseType reads
 *    name[5] as the community TYPE digit; '1' is the journal type (members post freely).
 *  · verify-then-sign + read-back after every op; STASIS halt-before-read; single-writer
 *    atomic books; fail-soft exit 0 with the honest verdict; zero secrets printed.
 *
 * Modes: probe (keyless measurement) | create (LIVE: COMMUNITY_LIVE=1 + vault) |
 *        status (keyless read-back — the eval and Proof-Surface surface)
 * Run:   node agents/community-founder.cjs probe|create|status
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// lazy steem: the pure helper surface must import cleanly in evals/keyless environments
let steem = null;
function steemInit() {
  if (!steem) { steem = require('steem'); steem.api.setOptions({ url: 'https://api.steemit.com' }); }
  return steem;
}
const ROOT = path.resolve(__dirname, '..');
const AG = path.join(ROOT, 'agents');
const STASIS_FILE = path.join(AG, 'STASIS.json');
const BOOK_JSON = path.join(AG, 'community-founder.json');
const BOOK_MD = path.join(AG, 'community-founder.md');
const HC_DERIVED = process.env.HC_DERIVED || '/home/z/my-project/.fleet/headcorner-derived.json';
const COMM_KEYS = process.env.COMM_KEYS || '/home/z/my-project/.fleet/community-keys.json';
const HIVE_KEYS = process.env.HIVE_KEYS || '/home/z/my-project/.fleet/hive-keys.json';
const HEAD = 'headcorner';
const NODE = process.env.STEEM_NODE || 'https://api.steemit.com';
const FEE_MARGIN = 0.05;
const MAX_CANCELS = 2;
const COMMUNITY_RC_SP = +(process.env.COMMUNITY_RC_SP || 50);
const P = (fn) => new Promise((res, rej) => fn((e, r) => (e ? rej(e) : res(r))));

// ---------- pure helpers (E59 white-box surface) ----------

/** the community identity: human, professional, zero robotic tells */
function communityProps() {
  return {
    title: 'The Clubhouse',
    about: 'Old maps, numbers, crafts, good news, and the questions in between. A quiet clubhouse for curious people.',
    desc: 'A calm home desk for a small writers\' fleet: real conversations, replies, topics and builds. Quality grows here first; the door opens outward when the bar is met.',
    lang: 'en',
    is_nsfw: false,
  };
}

/** the robotic-tell gate for the identity itself — the house is born clean */
function propsGate(props) {
  const why = [];
  const rx = /—|\bprobe\b|\btest\b|lorem|sandbox/i;
  for (const k of ['title', 'about', 'desc']) {
    if (!props[k] || String(props[k]).trim().length < 3) why.push(k + '-missing');
    else if (rx.test(String(props[k]))) why.push(k + '-robotic-tell');
  }
  if (props.lang !== 'en') why.push('lang-law');
  return { ok: why.length === 0, why };
}

/** TYPE LAW: journal-type community names (condenser Role.parseType reads name[5]) */
function validName(name) { return /^hive-1\d{5}$/.test(String(name || '')); }
function nameCandidates(list) {
  const out = [];
  for (const n of list || []) if (validName(n) && !out.includes(n)) out.push(n);
  return out;
}

/** SP -> VESTS (both chain globals parsed as display units) */
function spToVests(sp, totalFundSteem, totalSharesVests) {
  if (!(sp > 0) || !(totalFundSteem > 0) || !(totalSharesVests > 0)) return null;
  return (sp * totalSharesVests) / totalFundSteem;
}
const vestsToSp = (v, fund, shares) => (v * fund) / shares;

/**
 * FUNDING LAW (pure): given liquid STEEM, the required fee+margin and our open orders,
 * choose the own STEEM sell orders to cancel — FARTHEST from the market first (idlest
 * depth), one-cancel coverage preferred, at most maxCancels, SBD orders never touched.
 */
function fundingPlan(liquid, need, orders, maxCancels) {
  const plan = { cancels: [], freed: 0, armed: liquid + 1e-9 >= need, why: '' };
  if (plan.armed) { plan.why = 'LIQUID-SUFFICIENT'; return plan; }
  // farthest first: the highest-price sell is the idlest depth. one-cancel coverage
  // preferred: the farthest order that covers the whole gap.
  const gap = need - liquid;
  const steemSells = (orders || [])
    .filter((o) => o && o.sell_price && o.sell_price.base && o.sell_price.base.nai === '@@000000021')
    .map((o) => ({
      orderid: o.orderid,
      amount: parseInt(o.sell_price.base.amount, 10) / 1000,
      price: parseInt(o.sell_price.quote.amount, 10) / Math.max(1, parseInt(o.sell_price.base.amount, 10)),
    }))
    .sort((a, b) => b.price - a.price);
  const covering = steemSells.filter((o) => o.amount >= gap);
  const pickFrom = covering.length ? covering : steemSells;
  for (const o of pickFrom) {
    if (plan.cancels.length >= maxCancels) break;
    if (plan.freed + 1e-9 >= gap) break;
    plan.cancels.push(o.orderid);
    plan.freed += o.amount;
  }
  plan.armed = plan.freed + liquid + 1e-9 >= need;
  plan.why = plan.armed ? 'FUND-THEN-CREATE' : 'IDLE-CAPITAL-TOO-SMALL';
  return plan;
}

// ---------- chain-of-record (R38, CR-0068): the NAME is not the CHAIN ----------
// The owner measured the name and asked (2026-10-04, Hebrew): "מה לגבי קהילה בסטימיט —
// אני רואה שעשית רק בhive". The "hive-177702" prefix misled even the owner: it is the
// hivemind software's naming convention for communities ON STEEM (condenser
// Role.parseType reads name[5] as the community TYPE digit — that's why the TYPE LAW
// requires hive-1xxxxx). The chain, not the name, is the truth — so every status run
// now probes BOTH bridges live and books a derived badge.

/** the two chains the fleet runs on, with their nodes and fee assets */
function chainRegistry() {
  return {
    steem: { node: 'https://api.steemit.com', feeAsset: 'STEEM', human: 'Steem' },
    hive: { node: 'https://api.hive.blog', feeAsset: 'HIVE', human: 'Hive' },
  };
}

/** the chain-of-record badge: derived ONLY from the live probe of both bridges and
 *  the booked fee asset — never from the account name, never hardcoded. */
function chainBadge({ existsSteem, existsHive, feeAsset }) {
  const fee = String(feeAsset || '').toUpperCase();
  if (existsSteem && existsHive) return 'CROSS-CHAIN';
  if (existsSteem && !existsHive) return fee.includes('STEEM') ? 'STEEM-CHAIN' : 'STEEM-CHAIN-FEE-MISMATCH';
  if (!existsSteem && existsHive) return fee.includes('HIVE') ? 'HIVE-CHAIN' : 'HIVE-CHAIN-FEE-MISMATCH';
  return 'ABSENT-EVERYWHERE';
}

/** the Hive second-home authority law: the desk cannot sign what it does not hold.
 *  Measured live 2026-10-04: headcorner's Hive active pubkey (STM8c9vp3…) differs from
 *  the Steem one we hold (STM5HhJD…) — the same WIF does NOT sign on Hive, and the
 *  fleet holds no Hive key material. NO-KEYS is the honest verdict today. */
function hiveAuthorityVerdict(vaultPresent, chainPub, vaultPub) {
  if (!vaultPresent) return 'NO-KEYS';
  if (!chainPub || !vaultPub || chainPub !== vaultPub) return 'KEY-MISMATCH';
  return 'READY';
}

/** the honest hive-probe verdict: authority gates everything (no keys → no ceremony,
 *  no pretending), then the name, then the funding law — same order as the Steem desk. */
function hiveProbeVerdict({ nameFree, liquidHive, need, authority }) {
  if (authority === 'KEY-MISMATCH') return 'KEY-MISMATCH';
  if (authority !== 'READY') return 'HOME-ABSENT-UNKEYED';
  if (!nameFree) return 'NAME-TAKEN';
  if (!(liquidHive + 1e-9 >= need)) return 'FUNDING-SHORT';
  return 'CREATE-READY';
}

/** the founding roles: headcorner admin (the measured creator pattern), soldiers members */
function memberRoles(fleet) {
  const out = [];
  for (const who of fleet || []) {
    if (who === 'headcorner') out.push({ account: who, role: 'admin' });
    else out.push({ account: who, role: 'member' });
  }
  return out;
}

/** exact op builders — shapes copied from the measured ground truth (hive-153176 op 0/1/2) */
function accountCreateOp(newAccountName, pubs, feeAsset) {
  const auth = (pub) => ({ weight_threshold: 1, account_auths: [], key_auths: [[pub, 1]] });
  return ['account_create', {
    fee: feeAsset,
    creator: HEAD,
    new_account_name: newAccountName,
    owner: auth(pubs.owner),
    active: auth(pubs.active),
    posting: auth(pubs.posting),
    memo_key: pubs.memo,
    json_metadata: '',
  }];
}
const setRoleOp = (community, account, role) =>
  ['custom_json', { required_auths: [], required_posting_auths: [community], id: 'community', json: JSON.stringify(['setRole', { community, account, role }]) }];
const updatePropsOp = (community, props) =>
  ['custom_json', { required_auths: [], required_posting_auths: [community], id: 'community', json: JSON.stringify(['updateProps', { community, props }]) }];
// MEASURED LAW (2026-10-04, live test): hivemind applies updateProps only from an ADMIN —
// the community account's own signature sets roles but NOT props. headcorner signs the
// identity with its active authority (required_auths).
const updatePropsOpAdmin = (community, props) =>
  ['custom_json', { required_auths: [HEAD], required_posting_auths: [], id: 'community', json: JSON.stringify(['updateProps', { community, props }]) }];
const delegateOp = (spVestsAsset) => ['delegate_vesting_shares', { delegator: HEAD, delegatee: null, vesting_shares: spVestsAsset }];
const cancelOp = (orderid) => ['limit_order_cancel', { owner: HEAD, orderid }];

// ---------- RC top-up desk (CR-0067, E60 white-box surface) ----------

/** measured units law (2026-10-04): account.to_withdraw / withdrawn are GESTS-scale
 *  (micro-vests) — divide by 1e6 to get VESTS. headcorner measured live:
 *  to_withdraw 3.070814e12 µv = 1903.5 SP scheduled, withdrawn 2.303111e12 µv = 1427.6 SP. */
const gestsToVests = (g) => (Number(g) > 0 ? Number(g) / 1e6 : 0);

/** the chain-assert truth (R36 law): the reservation math is chain-side — when a
 *  delegate attempt is refused, the assert message carries the REAL available shares.
 *  Measured 2026-10-04 live: `available: {"amount":"1396610000","precision":6,...}` —
 *  the amount is micro-vests and is followed by precision/nai, never a bare closing brace. */
function parseAvailableVests(msg) {
  const m = String(msg || '').match(/available:\s*\{"amount":"(\d+)"/);
  if (!m) return null;
  const v = parseInt(m[1], 10) / 1e6;
  return isFinite(v) && v >= 0 ? v : null;
}

/** RC top-up plan (pure): the honest local estimate. available = own - delegated-out
 *  - powerdown reservation (to_withdraw - withdrawn). The OP is absolute (the total
 *  delegation), the resize NEVER lands below the current received floor — a top-up
 *  must not become a stealth clawback of the house's RC. */
function rcTopUpPlan({ ownVests, delegatedVests, toWithdrawGests, withdrawnGests, receivedVests, targetSp, fund, sharesTotal }) {
  const p = { reservationVests: 0, availableVests: 0, availableSp: 0, targetVests: 0, shortVests: 0, floorVests: 0, verdict: 'RECLAIM-PENDING' };
  if (!(fund > 0) || !(sharesTotal > 0) || !(ownVests > 0)) return p;
  const targetVests = (targetSp * sharesTotal) / fund;
  const reservation = Math.max(0, gestsToVests(toWithdrawGests) - gestsToVests(withdrawnGests));
  const available = Math.max(0, ownVests - delegatedVests - reservation);
  p.reservationVests = reservation;
  p.availableVests = available;
  p.availableSp = +((available * fund) / sharesTotal).toFixed(3);
  p.targetVests = targetVests;
  p.shortVests = Math.max(0, targetVests - (receivedVests || 0));
  p.floorVests = receivedVests || 0;
  p.verdict = available + 1e-6 >= p.shortVests ? 'TOPUP-READY' : 'RECLAIM-PENDING';
  return p;
}

/** the top-up op: ABSOLUTE total delegation to the community */
function rcTopUpOp(community, vests) {
  return ['delegate_vesting_shares', { delegator: HEAD, delegatee: community, vesting_shares: vests.toFixed(6) + ' VESTS' }];
}

// exported pure surface (E59+E60 white-box + evals) — zero secrets, zero chain I/O
module.exports = {
  communityProps, propsGate, validName, nameCandidates, spToVests, vestsToSp,
  fundingPlan, memberRoles, accountCreateOp, setRoleOp, updatePropsOp, updatePropsOpAdmin, cancelOp,
  COMMUNITY_RC_SP, FEE_MARGIN, MAX_CANCELS, HEAD,
  gestsToVests, parseAvailableVests, rcTopUpPlan, rcTopUpOp,
  chainRegistry, chainBadge, hiveAuthorityVerdict, hiveProbeVerdict, HIVE_KEYS,
};

// ---------- runtime helpers ----------

function stasis() {
  try { return JSON.parse(fs.readFileSync(STASIS_FILE, 'utf8')).active === true; } catch (_) { return false; }
}
function loadHeadVault() {
  try { return JSON.parse(fs.readFileSync(HC_DERIVED, 'utf8')); } catch (_) { return null; }
}
function communityVaultPresent() { try { return fs.existsSync(COMM_KEYS); } catch (_) { return false; } }

const rpc = (method, params, node) => new Promise((res, rej) => {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const req = require('https').request({ hostname: new URL(node || NODE).hostname, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 25000 }, (r) => {
    let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { const j = JSON.parse(d); j.error ? rej(new Error(String(j.error.data && j.error.data.stack && j.error.data.stack[0] && j.error.data.stack[0].data && j.error.data.stack[0].data.format ? JSON.stringify(j.error.data.stack[0].data).slice(0, 500) : (j.error.message || j.error.data || 'rpc')).slice(0, 500))) : res(j.result); } catch (e) { rej(e); } });
  });
  req.on('error', rej); req.write(body); req.end();
});

async function getAccount(name) {
  const a = await rpc('condenser_api.get_accounts', [[name]]);
  return a && a[0] ? a[0] : null;
}
async function getProps() { return rpc('condenser_api.get_chain_properties', []); }
async function getDGP() { return rpc('condenser_api.get_dynamic_global_properties', []); }
async function getOpenOrders(name) { return rpc('database_api.find_limit_orders', { account: name }).then((r) => r.orders || r || []); }

async function broadcast(operations, wifs) {
  // wire law (market-exec measured runs #4/#5): sign locally with steem.auth.signTransaction,
  // broadcast via condenser_api.broadcast_transaction (object op payloads). The broadcast
  // result carries no txid — the signature prefix is booked as the hint (house convention);
  // the read-back after every op is the binding confirmation.
  const S = steemInit();
  const dgp = await getDGP();
  const tx = {
    ref_block_num: dgp.head_block_number & 0xffff,
    ref_block_prefix: Buffer.from(dgp.head_block_id, 'hex').readUInt32LE(4),
    expiration: new Date(new Date(dgp.time + 'Z').getTime() + 90000).toISOString().slice(0, 19),
    operations, extensions: [],
  };
  const signed = S.auth.signTransaction(tx, wifs);
  await rpc('condenser_api.broadcast_transaction', [signed]);
  return { txid_hint: ((signed.signatures && signed.signatures[0]) || '').slice(0, 10) + '…', ref_block: tx.ref_block_num };
}

/** keys from a 256-bit random master — in memory only, vault is the single home */
function keyMaterial(name) {
  const S = steemInit();
  const master = crypto.randomBytes(32).toString('hex');
  const kp = S.auth.getPrivateKeys(name, master, ['owner', 'active', 'posting', 'memo']);
  return {
    owner: { wif: kp.owner, pub: kp.ownerPubkey },
    active: { wif: kp.active, pub: kp.activePubkey },
    posting: { wif: kp.posting, pub: kp.postingPubkey },
    memo: { wif: kp.memo, pub: kp.memoPubkey },
  };
}

function saveVault(vault) {
  fs.mkdirSync(path.dirname(COMM_KEYS), { recursive: true });
  const tmp = COMM_KEYS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(vault, null, 1));
  fs.renameSync(tmp, COMM_KEYS);
  try { fs.chmodSync(COMM_KEYS, 0o600); } catch (_) {}
}

// atomic single-writer books
function readBook() { try { return JSON.parse(fs.readFileSync(BOOK_JSON, 'utf8')); } catch (_) { return { protocol: 'SAOS-COMMUNITY-FOUNDER/1', community: null, runs: [] }; } }
function writeBook(b) {
  b.at = new Date().toISOString();
  const tmp = BOOK_JSON + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(b, null, 1)); fs.renameSync(tmp, BOOK_JSON);
  const md = bookToMd(b);
  const tmpMd = BOOK_MD + '.tmp';
  fs.writeFileSync(tmpMd, md); fs.renameSync(tmpMd, BOOK_MD);
}
function bookToMd(b) {
  const L = [];
  L.push('# community-founder — הבית הקהילתי (CR-0066)');
  L.push('');
  L.push('עודכן: ' + b.at);
  if (b.community) {
    const c = b.community;
    L.push('');
    L.push('## הקהילה חיה');
    L.push('- שם-חשבון: ' + c.name);
    L.push('- כותרת: ' + c.title);
    L.push('- חברים: ' + (c.members || []).length + ' (admin: headcorner, חיילים: member)');
    L.push('- SP שהואצל ל-RC: ' + c.delegatedSp);
    L.push('- נוצרה: ' + c.createdAt + ' · עמלה: ' + c.feeAsset);
    L.push('- txids: ' + JSON.stringify(c.txids || {}));
  } else {
    L.push('');
    L.push('## מצב: הקהילה טרם נוצרה (כנות מלאה)');
  }
  if (b.chainProof && b.chainProof.badge) {
    const p = b.chainProof;
    L.push('');
    L.push('## שרשרת-האם (הוכחה חיה, R38)');
    L.push('- פס-דין: ' + p.badge);
    L.push('- נבדק חי: steem=' + p.existsSteem + ' · hive=' + p.existsHive + ' · ב-' + p.checkedAt);
    L.push('- הסבר: "hive-" בשם הוא קונבנציית-hivemind על Steem (סוג 1 = journal), לא רשת Hive');
  }
  L.push('');
  L.push('## ריצות אחרונות');
  for (const r of (b.runs || []).slice(-12)) {
    L.push('- [' + r.at + '] ' + r.mode + ' → ' + r.verdict + (r.why ? ' · ' + r.why : ''));
    for (const s of r.steps || []) L.push('  - ' + s);
  }
  return L.join('\n') + '\n';
}
function pushRun(book, run) {
  book.runs = (book.runs || []);
  book.runs.push(run);
  if (book.runs.length > 100) book.runs = book.runs.slice(-100);
}

// ---------- modes ----------

async function modeProbe(run) {
  const [props, dgp, head] = await Promise.all([getProps(), getDGP(), getAccount(HEAD)]);
  const fee = props.account_creation_fee;
  const orders = await getOpenOrders(HEAD);
  const fund = parseFloat(dgp.total_vesting_fund_steem), shares = parseFloat(dgp.total_vesting_shares);
  const cand = nameCandidates(process.env.COMM_NAME_CANDIDATES
    ? JSON.parse(process.env.COMM_NAME_CANDIDATES)
    : ['hive-177701', 'hive-177702', 'hive-180901', 'hive-190200', 'hive-199801', 'hive-199802']);
  const taken = new Set((await rpc('condenser_api.get_accounts', [cand])).map((a) => a.name));
  const free = cand.filter((n) => !taken.has(n));
  const liquid = parseFloat(head.balance);
  const need = parseFloat(fee) + FEE_MARGIN;
  const plan = fundingPlan(liquid, need, orders, MAX_CANCELS);
  run.steps.push('fee=' + fee + ' · liquid=' + liquid.toFixed(3) + ' · need=' + need.toFixed(3));
  run.steps.push('open_orders=' + orders.length + ' · funding=' + plan.why + ' · cancels=' + plan.cancels.length);
  run.steps.push('names_free=' + (free[0] || 'NONE') + ' (of ' + cand.length + ')');
  run.steps.push('vault=' + (loadHeadVault() ? 'present' : 'absent') + ' · stasis=' + (stasis() ? 'HALT' : 'clear'));
  run.verdict = (free.length && plan.armed && loadHeadVault() && !stasis()) ? 'CREATE-READY' : 'ARMED-WAITING';
  if (!free.length) run.why = 'NAME-NONE-FREE';
  else if (!plan.armed) run.why = plan.why;
  run.communityPlan = { candidates: cand, freeFirst: free[0] || null, fee, need, liquid, props: communityProps(), funding: plan };
  return run;
}

async function modeCreate(run, book) {
  if (process.env.COMMUNITY_LIVE !== '1') { run.verdict = 'MODE-DRY'; run.why = 'COMMUNITY_LIVE unset — קבלת-תכנון בלבד, אפס שריפת-STEEM'; return run; }
  if (stasis()) { run.verdict = 'STASIS-HALT'; run.why = 'המפסק פעיל — הידיים כבולות בכוונה'; return run; }
  const vault = loadHeadVault();
  if (!vault || !vault.steem || !vault.steem.active || !vault.steem.active.wif) {
    run.verdict = 'VAULT-ABSENT-LOCAL'; run.why = 'הידיים החתומות חיות רק איפה שה-vault חי'; return run;
  }
  const activeWif = vault.steem.active.wif;
  if (book.community && book.community.name) { run.verdict = 'ALREADY-CREATED'; run.why = 'הספר כבר נושא קהילה (' + book.community.name + ') — יצירה כפולה נאסרת'; return run; }

  // RESUME law: a saved community vault with no community in the book means the ceremony
  // was interrupted AFTER the account existed — finish it, never create a second account.
  let resumeVault = null;
  if (communityVaultPresent()) {
    try { resumeVault = JSON.parse(fs.readFileSync(COMM_KEYS, 'utf8')); } catch (_) {}
    if (resumeVault && resumeVault.community && resumeVault.keys) {
      const exists = await getAccount(resumeVault.community);
      if (exists) {
        run.communityPlan = { name: resumeVault.community, resume: true };
        run.steps.push('RESUME: vault carries ' + resumeVault.community + ' with keys — the ceremony continues from the delegation step');
      } else { run.verdict = 'VAULT-MISMATCH'; run.why = 'ה-vault נושא חשבון שלא קיים בשרשרת'; return run; }
    } else { run.verdict = 'VAULT-UNREADABLE'; run.why = 'קובץ-המפתחות קיים אך לא ניתן לקריאה'; return run; }
  }

  const probe = await modeProbe({ mode: 'probe-inner', steps: [], communityPlan: null });
  const plan = probe.communityPlan;
  const name = resumeVault ? resumeVault.community : plan.freeFirst;
  if (!name) { run.verdict = 'NAME-NONE-FREE'; run.why = 'אף שם-מועמד לא פנוי'; return run; }
  const feeAsset = plan.fee;
  const need = plan.need;

  let keys = null;
  if (resumeVault) {
    keys = resumeVault.keys;
  } else {
    const funding = plan.funding || { armed: false, why: 'NO-PLAN' };
    if (!funding.armed) { run.verdict = 'IDLE-CAPITAL-TOO-SMALL'; run.why = funding.why + ' · liquid=' + plan.liquid.toFixed(3) + ' · need=' + plan.need.toFixed(3); return run; }
    keys = keyMaterial(name);
    const pubs = { owner: keys.owner.pub, active: keys.active.pub, posting: keys.posting.pub, memo: keys.memo.pub };
    run.steps.push('keys-generated (vault-only, pubs=' + pubs.posting.slice(0, 9) + '…)');
  }
  run.communityPlan = { name, resume: !!resumeVault };

  // FUNDING LAW live (fresh account only): cancel the idlest own STEEM sells until liquid covers fee+margin
  if (!resumeVault) {
    const fundingLive = fundingPlan(plan.liquid, need, await getOpenOrders(HEAD), MAX_CANCELS);
    for (const orderid of fundingLive.cancels) {
      // STASIS per-site gate (owner directive 2026-10-04): halt before the capital broadcast, fail-closed
      try { if (require('./capital-gate.cjs').stasisHalt('community-founder')) { run.verdict = 'STASIS-HALT'; run.why = 'capital lane halted before broadcast (owner directive 2026-10-04)'; return run; } } catch (e) { console.log('[CAPITAL-GATE] community-founder — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); run.verdict = 'STASIS-HALT'; run.why = 'capital-gate module error — fail-closed'; return run; }
      const tx = await broadcast([cancelOp(orderid)], [activeWif]);
      run.steps.push('funding-cancel order ' + orderid + ' hint=' + tx.txid_hint);
      run.txids.push({ op: 'limit_order_cancel:' + orderid, hint: tx.txid_hint });
    }
    let headAfter = null, liquidAfter = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 3000)); // inclusion lag: poll until the credit is visible
      headAfter = await getAccount(HEAD);
      liquidAfter = parseFloat(headAfter.balance);
      if (liquidAfter + 1e-9 >= need) break;
    }
    run.steps.push('liquid-after-funding=' + liquidAfter.toFixed(3));
    if (liquidAfter + 1e-9 < need) { run.verdict = 'FUNDING-SHORT'; run.why = 'liquid ' + liquidAfter.toFixed(3) + ' < ' + need.toFixed(3); return run; }
  }

  // 1) the account (3 STEEM burned with creation — the measured fee) — fresh accounts only
  if (!resumeVault) {
    const pubs = { owner: keys.owner.pub, active: keys.active.pub, posting: keys.posting.pub, memo: keys.memo.pub };
    // STASIS per-site gate (owner directive 2026-10-04): halt before the capital broadcast, fail-closed
    try { if (require('./capital-gate.cjs').stasisHalt('community-founder')) { run.verdict = 'STASIS-HALT'; run.why = 'capital lane halted before broadcast (owner directive 2026-10-04)'; return run; } } catch (e) { console.log('[CAPITAL-GATE] community-founder — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); run.verdict = 'STASIS-HALT'; run.why = 'capital-gate module error — fail-closed'; return run; }
    const createTx = await broadcast([accountCreateOp(name, pubs, feeAsset)], [activeWif]);
    run.txids.push({ op: 'account_create:' + name, hint: createTx.txid_hint });
    run.steps.push('account_create ' + name + ' hint=' + createTx.txid_hint);
    let created = null;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      created = await getAccount(name);
      if (created) break;
    }
    if (!created) { run.verdict = 'READ-BACK-FAIL'; run.why = 'account not visible after create'; return run; }
    // THE ORPHAN LAW (measured 2026-10-04, hive-177701): the keys hit the vault the moment the
    // account exists — BEFORE anything else that can fail. A created-but-unkeyed community is
    // an orphan nobody can open (recovery needs the lost owner key). 3 STEEM bought this law.
    saveVault({ protocol: 'SAOS-COMMUNITY-KEYS/1', note: 'community keys (cold active; posting signs customs) — never commit, 600 perms', createdAt: run.at, community: name, keys });
    run.steps.push('vault-saved (600 perms, outside every repo) — keys can no longer be lost');
  }

  // 2) RC first: SP delegation BEFORE any community custom_json — sized to the chain's truth
  // (the reservation math is chain-side; we attempt the law target and shrink to the measured
  // available, at most one resize, never below 1 SP — the measured min_delegation)
  const dgp = await getDGP();
  const fund = parseFloat(dgp.total_vesting_fund_steem), sharesTotal = parseFloat(dgp.total_vesting_shares);
  let rcSp = COMMUNITY_RC_SP, delTx = null;
  for (let attempt = 0; attempt < 2 && !delTx; attempt++) {
    const vestAsset = (rcSp * sharesTotal / fund).toFixed(6) + ' VESTS';
    try {
      // STASIS per-site gate (owner directive 2026-10-04): halt before the capital broadcast, fail-closed
      try { if (require('./capital-gate.cjs').stasisHalt('community-founder')) { run.verdict = 'STASIS-HALT'; run.why = 'capital lane halted before broadcast (owner directive 2026-10-04)'; return run; } } catch (e) { console.log('[CAPITAL-GATE] community-founder — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); run.verdict = 'STASIS-HALT'; run.why = 'capital-gate module error — fail-closed'; return run; }
      delTx = await broadcast([['delegate_vesting_shares', { delegator: HEAD, delegatee: name, vesting_shares: vestAsset }]], [activeWif]);
      run.txids.push({ op: 'delegate_vesting_shares:' + rcSp + 'SP', hint: delTx.txid_hint });
      run.steps.push('delegated ' + rcSp + ' SP (' + vestAsset + ') hint=' + delTx.txid_hint);
    } catch (e) {
      const m = String(e.message || e);
      const avail = m.match(/available:\s*\{"amount":"(\d+)"/);
      if (avail && attempt === 0) {
        const availVests = parseInt(avail[1], 10) / 1e6;
        rcSp = Math.max(1, Math.floor(availVests * 0.95 * fund / sharesTotal));
        run.steps.push('delegate-resized: chain available ' + availVests.toFixed(1) + ' vests -> ' + rcSp + ' SP (chain-truth reservation, never guessed)');
      } else { run.verdict = 'DELEGATE-FAIL'; run.why = m.slice(0, 200); return run; }
    }
  }

  // 3) community customs — signed AS the community account (posting key), ground-truth order
  const commWif = keys.posting.wif;
  const props = communityProps();
  const gate = propsGate(props);
  if (!gate.ok) { run.verdict = 'PROPS-GATE'; run.why = gate.why.join(','); return run; }
  const roleTx = await broadcast([setRoleOp(name, HEAD, 'admin')], [commWif]);
  run.txids.push({ op: 'setRole:admin:' + HEAD, hint: roleTx.txid_hint });
  run.steps.push('setRole admin headcorner hint=' + roleTx.txid_hint);
  const propsTx = await broadcast([updatePropsOpAdmin(name, props)], [activeWif]);
  run.txids.push({ op: 'updateProps', hint: propsTx.txid_hint });
  run.steps.push('updateProps hint=' + propsTx.txid_hint);
  for (const m of memberRoles([HEAD].concat(Object.keys(require('./persona-store.cjs').slots().soldiers || {}))).filter((x) => x.role === 'member')) { // T3: sealed doctrine
    const tx = await broadcast([setRoleOp(name, m.account, m.role)], [commWif]);
    run.txids.push({ op: 'setRole:member:' + m.account, hint: tx.txid_hint });
    run.steps.push('setRole member ' + m.account + ' hint=' + tx.txid_hint);
    await new Promise((r) => setTimeout(r, 400));
  }

  // 4) read-back: the chain must confirm the house
  await new Promise((r) => setTimeout(r, 1500));
  const comm = await rpc('bridge.get_community', { name, observer: null }).catch(() => null);
  const roles = await rpc('bridge.list_community_roles', { community: name, last: null, limit: 100 }).catch(() => []);
  const subs = await rpc('bridge.list_subscribers', { community: name }).catch(() => []);
  const after = await getAccount(name);
  const receivedSp = vestsToSp(parseFloat(after.received_vesting_shares), fund, sharesTotal);
  run.steps.push('read-back: title=' + (comm && comm.title) + ' · roles=' + roles.length + ' · subs=' + subs.length + ' · receivedSP=' + receivedSp.toFixed(1));
  run.verdict = (comm && comm.title && roles.length >= 12 && receivedSp >= Math.min(rcSp, COMMUNITY_RC_SP) - 1) ? 'COMMUNITY-LIVE' : 'READ-BACK-WEAK';
  if (run.verdict === 'COMMUNITY-LIVE') {
    book.community = {
      name, title: props.title, about: props.about, desc: props.desc, lang: props.lang,
      createdAt: new Date().toISOString(), creator: HEAD, feeAsset,
      delegatedSp: rcSp, delegatedSpTarget: COMMUNITY_RC_SP, receivedSp: +receivedSp.toFixed(2),
      members: roles.map((r) => ({ account: r[0], role: r[1] })),
      subscriberCount: subs.length,
      txids: Object.fromEntries(run.txids.map((t) => [t.op, t.hint])),
    };
    writeBook(book);
  }
  return run;
}

async function communityExists(name, node) {
  // trivalent truth: true (title seen) / false (the bridge's own "does not exist" assert
  // — evidence of ABSENCE, never a network failure) / null (unreachable — honest gap).
  // The two must never be conflated: absence is a measured answer, unreachable is none.
  // One retry on the unreachable path only (a transient hiccup must not erase the
  // badge's second leg; absence asserts are answers and are never retried).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const c = await rpc('bridge.get_community', { name, observer: null }, node);
      return !!(c && c.title);
    } catch (e) {
      if (/does not exist/i.test(String(e.message || e))) return false;
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      return null;
    }
  }
  return null;
}

async function chainProof(name, feeAsset) {
  // R38: the NAME is not the CHAIN — probe BOTH bridges live, derive the badge from
  // the evidence (never from the account name). Unreachable → null (honest gap).
  const reg = chainRegistry();
  const existsSteem = await communityExists(name, reg.steem.node);
  const existsHive = await communityExists(name, reg.hive.node);
  return { name, existsSteem, existsHive, badge: chainBadge({ existsSteem, existsHive, feeAsset }), checkedAt: new Date().toISOString() };
}

async function modeStatus(run, book) {
  let name = book.community && book.community.name;
  let adopt = false;
  if (!name && communityVaultPresent()) {
    try {
      const v = JSON.parse(fs.readFileSync(COMM_KEYS, 'utf8'));
      if (v && v.community && v.keys) { name = v.community; adopt = true; run.steps.push('adopt: the vault carries ' + name + ' with keys — finalizing from the chain'); }
    } catch (_) {}
  }
  if (!name) {
    run.verdict = 'COMMUNITY-ABSENT'; run.why = 'אין קהילה בפנקס — כנות מלאה, אפס המצאה';
    const probe = await modeProbe({ mode: 'probe-inner', steps: [], communityPlan: null });
    run.communityPlan = probe.communityPlan; run.steps.push(...probe.steps);
    return run;
  }
  const comm = await rpc('bridge.get_community', { name, observer: null }).catch(() => null);
  const roles = await rpc('bridge.list_community_roles', { community: name, last: null, limit: 100 }).catch(() => []);
  const subs = await rpc('bridge.list_subscribers', { community: name }).catch(() => []);
  const after = await getAccount(name);
  const dgp = await getDGP();
  const receivedSp = after ? vestsToSp(parseFloat(after.received_vesting_shares), parseFloat(dgp.total_vesting_fund_steem), parseFloat(dgp.total_vesting_shares)) : 0;
  run.steps.push('chain: ' + name + ' title=' + (comm && comm.title) + ' · roles=' + roles.length + ' · subs=' + subs.length + ' · receivedSP=' + receivedSp.toFixed(1));
  // COMMUNITY-LIVE = the chain itself confirms the house: a title (real or still-default
  // '@name' while props propagate), the full founding roles (owner row + admin + 10 members),
  // and the RC delegation visible on the account. Subscribers are informational (they land
  // when soldiers subscribe from the cadence desk).
  run.verdict = (comm && comm.title && roles.length >= 12 && receivedSp >= 8) ? 'COMMUNITY-LIVE' : 'READ-BACK-WEAK';
  // CHAIN PROOF (R38): the badge answers "קהילה בסטימיט או בהייב?" with chain evidence,
  // not with the name — measured live on both bridges every status run.
  try {
    const proof = await chainProof(name, (book.community && book.community.feeAsset) || '3.000 STEEM');
    run.chainProof = proof;
    book.chainProof = proof;
    run.steps.push('chain-proof: steem=' + (proof.existsSteem === null ? 'unreachable' : proof.existsSteem) + ' · hive=' + (proof.existsHive === null ? 'unreachable' : proof.existsHive) + ' → ' + proof.badge);
  } catch (e) { run.steps.push('chain-proof: unavailable (' + String(e.message || e).slice(0, 60) + ')'); }
  if (adopt && run.verdict === 'COMMUNITY-LIVE') {
    // finalize: the ceremony ran, the book lagged — build the community record from the
    // chain read-back plus the create run's booked ceremony hints
    // the ceremony may span several runs (fresh create + RESUME continuation) — merge them all
    const ceremonyRuns = (book.runs || []).filter((r) => r.mode === 'create' && r.communityPlan && r.communityPlan.name === name);
    const mergedTxids = {};
    for (const cr of ceremonyRuns) for (const t of cr.txids || []) mergedTxids[t.op] = t.hint;
    const propsNow = communityProps();
    book.community = {
      name,
      title: (comm && comm.title) || propsNow.title,
      about: propsNow.about, desc: propsNow.desc, lang: propsNow.lang,
      createdAt: (ceremonyRuns[0] && ceremonyRuns[0].at) || run.at, creator: HEAD,
      feeAsset: '3.000 STEEM',
      delegatedSp: Math.round(receivedSp), delegatedSpTarget: COMMUNITY_RC_SP, receivedSp: +receivedSp.toFixed(2),
      members: roles.map((r) => ({ account: r[0], role: r[1] })),
      subscriberCount: subs.length,
      txids: mergedTxids,
      finalizedBy: 'status-adoption',
    };
  } else if (book.community) {
    book.community = Object.assign({}, book.community, {
      title: (comm && comm.title) || book.community.title,
      subscriberCount: subs.length,
      members: (roles && roles.length ? roles.map((r) => ({ account: r[0], role: r[1] })) : book.community.members),
      receivedSp: +receivedSp.toFixed(2),
      lastStatusAt: new Date().toISOString(),
    });
  }
  return run;
}

// ---------- RC top-up (CR-0067): the house's RC grows from the powerdown reclaim ----------

async function modeRc(run, book) {
  if (stasis()) { run.verdict = 'STASIS-HALT'; run.why = 'the breaker is active, the desk obeys'; return run; }
  const name = book.community && book.community.name;
  if (!name) { run.verdict = 'COMMUNITY-ABSENT'; run.why = 'no community in the book — nothing to top up'; return run; }
  const [hc, comm, dgp] = await Promise.all([getAccount(HEAD), getAccount(name), getDGP()]);
  if (!hc || !comm || !dgp) { run.verdict = 'READ-BACK-FAIL'; run.why = 'accounts/globals unavailable'; return run; }
  const fund = parseFloat(dgp.total_vesting_fund_steem), sharesTotal = parseFloat(dgp.total_vesting_shares);
  const num = (a) => parseFloat(String(a).split(' ')[0]);
  const receivedVests = num(comm.received_vesting_shares);
  const plan = rcTopUpPlan({
    ownVests: num(hc.vesting_shares), delegatedVests: num(hc.delegated_vesting_shares),
    toWithdrawGests: hc.to_withdraw, withdrawnGests: hc.withdrawn,
    receivedVests, targetSp: COMMUNITY_RC_SP, fund, sharesTotal,
  });
  run.plan = plan;
  run.steps.push('plan: available ' + plan.availableVests.toFixed(0) + ' vests (' + plan.availableSp.toFixed(2) + ' SP) · reservation ' + plan.reservationVests.toFixed(0) + ' vests · short ' + plan.shortVests.toFixed(0) + ' vests · floor ' + (plan.floorVests * fund / sharesTotal).toFixed(0) + ' SP received');
  if (plan.verdict !== 'TOPUP-READY') {
    run.verdict = 'RECLAIM-PENDING';
    run.why = 'available ' + plan.availableSp.toFixed(2) + ' SP < short ' + (plan.shortVests * fund / sharesTotal).toFixed(2) + ' SP — the powerdown reclaim (' + hc.next_vesting_withdrawal + ') frees the stake';
    return run;
  }
  if (process.env.COMMUNITY_LIVE !== '1') { run.verdict = 'MODE-DRY'; run.why = 'plan armed — COMMUNITY_LIVE=1 signs the top-up'; return run; }
  const vault = loadHeadVault();
  if (!vault || !vault.steem || !vault.steem.active || !vault.steem.active.wif) { run.verdict = 'VAULT-ABSENT-LOCAL'; return run; }
  const activeWif = vault.steem.active.wif;
  // attempt the ABSOLUTE target; on chain-refusal resize ONCE from the assert truth,
  // never below the received floor (a top-up must not become a clawback)
  let vests = plan.targetVests, tx = null;
  for (let attempt = 0; attempt < 2 && !tx; attempt++) {
    try {
      // STASIS per-site gate (owner directive 2026-10-04): halt before the capital broadcast, fail-closed
      try { if (require('./capital-gate.cjs').stasisHalt('community-founder')) { run.verdict = 'STASIS-HALT'; run.why = 'capital lane halted before broadcast (owner directive 2026-10-04)'; return run; } } catch (e) { console.log('[CAPITAL-GATE] community-founder — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); run.verdict = 'STASIS-HALT'; run.why = 'capital-gate module error — fail-closed'; return run; }
      tx = await broadcast([rcTopUpOp(name, vests)], [activeWif]);
      run.txids.push({ op: 'rc_topup:' + (vests * fund / sharesTotal).toFixed(1) + 'SP', hint: tx.txid_hint });
      run.steps.push('delegated total ' + (vests * fund / sharesTotal).toFixed(1) + ' SP hint=' + tx.txid_hint);
    } catch (e) {
      const m = String(e.message || e);
      const avail = parseAvailableVests(m);
      if (avail != null && attempt === 0) {
        const resizedSp = Math.max(plan.floorVests * fund / sharesTotal, Math.floor(avail * 0.95 * fund / sharesTotal));
        const resizedVests = (resizedSp * sharesTotal) / fund;
        if (resizedVests <= plan.floorVests) { run.verdict = 'TOPUP-HOLD'; run.why = 'chain available ' + avail.toFixed(0) + ' vests <= floor — the current RC stands, the reclaim decides'; return run; }
        vests = resizedVests;
        run.steps.push('delegate-resized: chain available ' + avail.toFixed(1) + ' vests -> total ' + resizedSp.toFixed(1) + ' SP (chain-truth, floor protected)');
      } else { run.verdict = 'DELEGATE-FAIL'; run.why = m.slice(0, 200); return run; }
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
  const after = await getAccount(name);
  const afterSp = after ? vestsToSp(parseFloat(after.received_vesting_shares), fund, sharesTotal) : 0;
  run.steps.push('read-back: receivedSP=' + afterSp.toFixed(1));
  run.verdict = afterSp >= Math.min(vests * fund / sharesTotal, COMMUNITY_RC_SP) - 1 ? 'TOPUP-LIVE' : 'READ-BACK-WEAK';
  if (run.verdict === 'TOPUP-LIVE' && book.community) {
    book.community = Object.assign({}, book.community, {
      delegatedSp: Math.round(vests * fund / sharesTotal), delegatedSpTarget: COMMUNITY_RC_SP,
      receivedSp: +afterSp.toFixed(2), rcTopUpAt: run.at,
    });
  }
  return run;
}

// ---------- hive mode (R38): the second-home desk, keyless honesty ----------
// The owner directive "או אם יש גם ברשתות האחרות" books a home on Hive too. The desk
// probes Hive keylessly every run: fee, fleet balances, open orders, name law, and the
// AUTHORITY truth (we hold no Hive keys — measured: headcorner's Hive active pubkey
// differs from the Steem one). It cannot create, and it never pretends: the verdicts
// HOME-ABSENT-UNKEYED / KEY-MISMATCH / NAME-TAKEN / FUNDING-SHORT / CREATE-READY are
// the whole surface. When Hive key material + 3 HIVE arrive (operator upload like R33,
// or estate earnings), a create --chain hive rung is booked — not dead code today.

async function modeHive(run, book) {
  const reg = chainRegistry();
  const H = (method, params) => rpc(method, params, reg.hive.node);
  const props = await H('condenser_api.get_chain_properties', []);
  const fee = props && props.account_creation_fee ? String(props.account_creation_fee) : null;
  if (!fee) { run.verdict = 'READ-BACK-FAIL'; run.why = 'hive chain props unavailable'; return run; }
  const fleet = [HEAD].concat(Object.keys(require('./persona-store.cjs').slots().soldiers || {})); // T3: sealed doctrine
  const accs = await H('condenser_api.get_accounts', [fleet]);
  const byName = Object.fromEntries((accs || []).filter(Boolean).map((a) => [a.name, a]));
  const head = byName[HEAD];
  if (!head) { run.verdict = 'READ-BACK-FAIL'; run.why = 'headcorner absent on hive'; return run; }
  const liquid = parseFloat(head.balance);
  const need = parseFloat(fee) + FEE_MARGIN;
  const chainPub = (head.active && head.active.key_auths && head.active.key_auths[0] && head.active.key_auths[0][0]) || null;
  const present = fs.existsSync(HIVE_KEYS);
  let vaultPub = null;
  if (present) { try { const v = JSON.parse(fs.readFileSync(HIVE_KEYS, 'utf8')); vaultPub = (v && v.active && v.active.pub) || (v && v.steem && v.steem.active && v.steem.active.pubkey) || null; } catch (_) {} }
  const authority = hiveAuthorityVerdict(present, chainPub, vaultPub);
  const cand = nameCandidates(process.env.COMM_NAME_CANDIDATES_HIVE
    ? JSON.parse(process.env.COMM_NAME_CANDIDATES_HIVE)
    : ['hive-177702', 'hive-180901', 'hive-190200', 'hive-199801', 'hive-199802']);
  const taken = new Set((await H('condenser_api.get_accounts', [cand]) || []).map((a) => a.name));
  const free = cand.filter((n) => !taken.has(n));
  const orders = await H('database_api.find_limit_orders', { account: HEAD }).then((r) => (r && r.orders) || []).catch(() => []);
  const houseOnHive = await communityExists('hive-177702', reg.hive.node);
  const verdict = hiveProbeVerdict({ nameFree: free.length > 0, liquidHive: liquid, need, authority });
  run.verdict = verdict;
  run.why = authority === 'NO-KEYS'
    ? 'no Hive key material is held (measured: headcorner hive active pub ' + String(chainPub || '').slice(0, 9) + '… ≠ the held steem pub) — the desk cannot sign what it does not hold'
    : authority === 'KEY-MISMATCH' ? 'vault pub ≠ chain pub — wrong key generation, never guessed' : null;
  run.steps.push('hive fee=' + fee + ' · headcorner liquid=' + liquid.toFixed(3) + ' · need=' + need.toFixed(3) + ' · orders=' + orders.length);
  run.steps.push('soldiers-on-hive=' + fleet.slice(1).filter((s) => byName[s]).length + '/' + (fleet.length - 1) + ' · names-free=' + (free[0] || 'NONE') + ' · steem-house-on-hive=' + (houseOnHive === true ? 'yes' : houseOnHive === false ? 'no' : 'unreachable'));
  run.steps.push('authority=' + authority + ' · vault=' + (present ? 'present' : 'absent') + ' · stasis=' + (stasis() ? 'HALT' : 'clear'));
  run.hivePlan = { fee, liquid, need, authority, chainPubPrefix: String(chainPub || '').slice(0, 9), freeFirst: free[0] || null, soldiersOnHive: fleet.slice(1).filter((s) => byName[s]).length, steemHouseOnHive: houseOnHive };
  return run;
}

// ---------- main ----------

async function main() {
  const mode = (process.argv[2] || 'status').toLowerCase();
  if (!['probe', 'create', 'status', 'rc', 'hive'].includes(mode)) { console.log('usage: community-founder.cjs probe|create|status|rc|hive'); process.exit(0); }
  const run = { at: new Date().toISOString(), mode, steps: [], txids: [], verdict: null, why: null, communityPlan: null };
  const book = readBook();
  try {
    if (mode === 'probe') await modeProbe(run);
    else if (mode === 'create') await modeCreate(run, book);
    else if (mode === 'rc') await modeRc(run, book);
    else if (mode === 'hive') await modeHive(run, book);
    else await modeStatus(run, book);
  } catch (e) {
    run.verdict = 'ERROR'; run.why = String(e.message || e).slice(0, 200);
  }
  pushRun(book, run);
  writeBook(book); // single-writer atomic: every mode persists its honest run
  console.log('[community-founder] ' + mode + ' → ' + run.verdict + (run.why ? ' · ' + run.why : ''));
  for (const s of run.steps) console.log('  · ' + s);
  process.exit(0);
}
if (require.main === module) main();
module.exports.main = main;
