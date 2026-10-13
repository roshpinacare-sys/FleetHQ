'use strict';
/**
 * treasury-desk.cjs — Z-26 CAPITAL ENGINE (read + claim + curate + armed rail).
 *
 * מה-הזה: הסוכן-האוצר. מודד את-כל-ההון-בידיים (3 שרשראות + TRON + Hive-Engine),
 * תובע-פרסים מוטלים על hive+blurt (steem כבר-מכוסה-ב-fleet-claim), מריץ קורצ'ינג-ראש
 * על steem (4279 SP יעילים — התמריץ-הממשי-היחיד-להכנסה-פאסיבית-עם-מפתחות-posting),
 * ומחזיק מסילת-ביצוע מוכנה (HE swap / STEEM transfer) שמושבתת-ברירת-מחדל.
 *
 * דוקטרינה: verify-then-sign · אידמפוטנציה · fail-soft (exit 0) · אפס-סודות-בפלט.
 * ספר-ההון: agents/money-ledger.json — מחויב-לrepo, חסר-סודות, עם-היסטוריה-של-30.
 */
const steem = require('steem');
const https = require('https');
const fs = require('fs');
const path = require('path');

steem.api.setOptions({ url: 'https://api.steemit.com' });
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.RECEIPT_OUT || path.join(ROOT, 'agents', 'receipts', 'treasury-desk-receipt.json');
const LEDGER = path.join(ROOT, 'agents', 'money-ledger.json');

const STEEM_NODE = 'https://api.steemit.com';
const HIVE_NODE = 'https://api.hive.blog';
const BLURT_NODE = 'https://rpc.beblurt.com';
const HIVE_CHAIN_ID = 'beeab0de00000000000000000000000000000000000000000000000000000000';
const BLURT_CHAIN_ID = 'cd8d90f29ae273abec3eaa7731e25934c63eb654d55080caff2ebb7f5df6381f';
// Z-33: hive head lane — VP found idle at 100% (25.4 HP manabar-verified); hive serves
// reputation on condenser (unlike blurt), so the steem repScore gate works as-is.
const HIVE_TAGS = ['life', 'blog', 'photography', 'food', 'travel', 'story', 'nature', 'health', 'writing', 'hive'];
const CUR_VOTE_MAX_HIVE = 2;
const HIVE_MIN_REP = 40;   // Z-33 calibrated: the hive 'created' feed is small-account heavy; 55 zeroed all 20 candidates. 40 still requires raw rep ≥ ~4.6e10.
const HIVE_MAX_AGE_MIN = 480;
const RETIRED = new Set(['ynet']);
const HEAD = 'headcorner';
const TRON_CUSTODY = 'TYVwwuvdDmfy3shxT3cb3RKLrRCshaZxTy';
// curation policy: bounded, quality-gated, VP-gated
const CUR_VOTE_MAX = 4;
const CUR_WEIGHT = 5000;           // 50%
const CUR_VP_FLOOR = 6000;         // stop below 60% VP
const CUR_MIN_REP = 55;
const CUR_MIN_AGE_MIN = 20, CUR_MAX_AGE_MIN = 480;
const CUR_TAGS = ['life', 'blog', 'writing', 'photography', 'travel', 'food', 'story', 'nature', 'poetry', 'health'];
const EXEC_ENABLED = process.env.ENABLE_TX === '1'; // rail stays holstered unless explicitly armed

function rpcNode(node, method, params, timeout = 20000) {
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const u = new URL(node);
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: u.hostname, path: u.pathname || '/', method: 'POST', family: 4, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); if (j.error) return reject(new Error(j.error.message || 'rpc-error')); resolve(j.result); }
        catch (_) { reject(new Error('bad-rpc')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    req.write(payload); req.end();
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const f = (s) => parseFloat(String(s || '0'));

function loadKeys() {
  const raw = process.env.SA_FLEET_KEYS || '';
  if (!raw) return {};
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (_) { return {}; } // {username: postingWIF}
}

// Head posting key from the private steem repo vault (Z-21 self-recovery pattern,
// proven live 3+ times). STEEM_REPO_DIR points at a checkout of roshpinacare-sys/steem.
// Returns ONLY headcorner's posting WIF; nothing is printed, temp dir is 0700 and wiped.
function recoverHeadPosting() {
  const dir = process.env.STEEM_REPO_DIR;
  if (!dir) return null;
  const { execFileSync } = require('child_process');
  const crypto = require('crypto');
  const out = path.join('/tmp', 'td-keys-' + Date.now());
  try {
    fs.mkdirSync(out, { recursive: true, mode: 0o700 });
    const metaPath = path.join(dir, 'agent', 'recovery-meta.json');
    if (!fs.existsSync(metaPath)) return null;
    const metas = [JSON.parse(fs.readFileSync(metaPath, 'utf8'))];
    const vdir = path.join(dir, 'agent', 'vault');
    const encs = fs.readdirSync(vdir).filter(f => f.endsWith('.enc')).map(f => path.join(vdir, f));
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    for (const enc of encs) {
      const outer = sha(enc);
      for (const m of metas) {
        if (!m || !m.keysZipPass || m.keysZipSha256 !== outer) continue;
        const dec = path.join(out, 'v.zip');
        execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', enc, '-out', dec, '-pass', 'env:TDZP'], { env: { ...process.env, TDZP: m.keysZipPass }, stdio: 'pipe' });
        if (fs.readFileSync(dec).subarray(0, 2).toString('latin1') !== 'PK') continue;
        execFileSync('unzip', ['-o', '-q', dec, '-d', out], { stdio: 'pipe' });
        const vj = path.join(out, 'agent', 'keys', 'vault.json');
        if (!fs.existsSync(vj)) continue;
        const v = JSON.parse(fs.readFileSync(vj, 'utf8'));
        const hc = (v.accounts || []).find(a => a.username === HEAD);
        const wif = hc && hc.keys && hc.keys.steem && hc.keys.steem.posting && hc.keys.steem.posting.wif;
        try { fs.rmSync(out, { recursive: true, force: true }); } catch (_) {}
        return typeof wif === 'string' && wif.length > 40 ? wif : null;
      }
    }
  } catch (_) {}
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (_) {}
  return null;
}

// Z-33: headcorner's HIVE posting key — same private-vault pattern as recoverHeadPosting.
// The hive key is DISTINCT from steem's (verified vault-side) and matches the on-chain
// posting authority (STM6u99… — verified 2026-10-02 before first hive-lane run).
function recoverHeadHive() {
  const dir = process.env.STEEM_REPO_DIR;
  if (!dir) return null;
  const { execFileSync } = require('child_process');
  const crypto = require('crypto');
  const out = path.join('/tmp', 'td-keys-h-' + Date.now());
  try {
    fs.mkdirSync(out, { recursive: true, mode: 0o700 });
    const metaPath = path.join(dir, 'agent', 'recovery-meta.json');
    if (!fs.existsSync(metaPath)) return null;
    const metas = [JSON.parse(fs.readFileSync(metaPath, 'utf8'))];
    const vdir = path.join(dir, 'agent', 'vault');
    const encs = fs.readdirSync(vdir).filter(f => f.endsWith('.enc')).map(f => path.join(vdir, f));
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    for (const enc of encs) {
      const outer = sha(enc);
      for (const m of metas) {
        if (!m || !m.keysZipPass || m.keysZipSha256 !== outer) continue;
        const dec = path.join(out, 'v.zip');
        execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', enc, '-out', dec, '-pass', 'env:TDZP'], { env: { ...process.env, TDZP: m.keysZipPass }, stdio: 'pipe' });
        if (fs.readFileSync(dec).subarray(0, 2).toString('latin1') !== 'PK') continue;
        execFileSync('unzip', ['-o', '-q', dec, '-d', out], { stdio: 'pipe' });
        const vj = path.join(out, 'agent', 'keys', 'vault.json');
        if (!fs.existsSync(vj)) continue;
        const v = JSON.parse(fs.readFileSync(vj, 'utf8'));
        const hc = (v.accounts || []).find(a => a.username === HEAD);
        const wif = hc && hc.keys && hc.keys.hive && hc.keys.hive.posting && hc.keys.hive.posting.wif;
        try { fs.rmSync(out, { recursive: true, force: true }); } catch (_) {}
        return typeof wif === 'string' && wif.length > 40 ? wif : null;
      }
    }
  } catch (_) {}
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (_) {}
  return null;
}

async function signAndBroadcast({ node, chainId, wif, ops }) {
  const dgp = await rpcNode(node, 'condenser_api.get_dynamic_global_properties', []);
  const tx = {
    ref_block_num: dgp.head_block_number & 0xffff,
    ref_block_prefix: Buffer.from(dgp.head_block_id, 'hex').readUInt32LE(4),
    expiration: new Date(new Date(dgp.time + 'Z').getTime() + 90000).toISOString().slice(0, 19),
    operations: ops, extensions: [],
  };
  const prev = steem.config.get('chain_id');
  let signed;
  try { if (chainId) steem.config.set('chain_id', chainId); signed = steem.auth.signTransaction(tx, [wif]); }
  finally { if (chainId) steem.config.set('chain_id', prev); }
  await rpcNode(node, 'condenser_api.broadcast_transaction', [signed]);
}

const vestsToHp = (vests, props, sym) => {
  const tvf = f(props.total_vesting_fund_steem || props.total_vesting_fund_hive || props.total_vesting_fund_blurt);
  const tvs = f(props.total_vesting_shares);
  return +(f(vests) * tvf / tvs).toFixed(3);
};

async function chainBook(chain, node, names) {
  const sym = chain === 'steem' ? 'SP' : chain === 'hive' ? 'HP' : 'BP';
  const props = await rpcNode(node, 'condenser_api.get_dynamic_global_properties', []);
  const rows = await rpcNode(node, 'condenser_api.get_accounts', [names]);
  const out = { head: null, soldiers: {}, powerdown: null };
  for (const r of rows) {
    const eff = vestsToHp(f(r.vesting_shares) - f(r.delegated_vesting_shares || 0) + f(r.received_vesting_shares || 0), props, sym);
    const pend = {
      liquid: r.reward_steem_balance || r.reward_hive_balance || r.reward_blurt_balance || null,
      debt: r.reward_sbd_balance || r.reward_hbd_balance || null,
      vests: r.reward_vesting_balance || null,
    };
    const entry = {
      liquid: r.balance, debt: r.sbd_balance || r.hbd_balance || null,
      effStake: eff + ' ' + sym, votingPower: f(r.voting_power) / 100, pending: pend,
    };
    if (chain === 'hive') {
      try {
        const rc = await rpcNode(node, 'rc_api.find_rc_accounts', { accounts: [r.name] });
        entry.rcPct = +(f(rc.rc_accounts[0].rc_manabar.current_mana) / f(rc.rc_accounts[0].max_rc) * 100).toFixed(1);
      } catch (_) {}
    }
    if (r.name === HEAD) {
      out.head = entry;
      const active = r.to_withdraw && f(r.to_withdraw) > f(r.withdrawn) && r.next_vesting_withdrawal && !r.next_vesting_withdrawal.startsWith('1969') && !r.next_vesting_withdrawal.startsWith('1970');
      if (active) out.powerdown = {
        active: true, rate: r.vesting_withdraw_rate, next: r.next_vesting_withdrawal,
        rateSp: vestsToHp(r.vesting_withdraw_rate, props, sym),
      };
    } else out.soldiers[r.name] = entry;
  }
  return out;
}

async function tronBook() {
  return new Promise((resolve) => {
    const req = https.request({ hostname: 'api.trongrid.io', path: '/v1/accounts/' + TRON_CUSTODY, method: 'GET', headers: { accept: 'application/json' }, timeout: 15000 }, res => {
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); const a = j.data && j.data[0]; resolve({ addr: TRON_CUSTODY.slice(0, 6) + '...' + TRON_CUSTODY.slice(-4), trx: a ? (a.balance || 0) / 1e6 : 0 }); }
        catch (_) { resolve({ error: 'parse' }); }
      });
    });
    req.on('error', () => resolve({ error: 'net' })); req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}

async function heBook(names) {
  const out = {};
  for (const n of names) {
    try {
      const rows = await rpcNode('https://api.hive-engine.com/rpc/contracts', 'find', { contract: 'tokens', table: 'balances', query: { account: n }, limit: 1000, offset: 0 }, 25000);
      const nz = (rows || []).filter(t => f(t.balance) > 0.0001 || f(t.staked) > 0.0001).map(t => ({ symbol: t.symbol, balance: t.balance, staked: t.staked || '0' }));
      if (nz.length) out[n] = nz;
    } catch (_) {}
    await sleep(200);
  }
  return out;
}

// ---- CLAIMS (hive + blurt; steem handled by fleet-claim daily) ----
async function claimChain({ chain, node, chainId, names, keys }) {
  const liquidField = chain === 'hive' ? 'reward_hive_balance' : 'reward_blurt_balance';
  const results = [];
  for (const n of names) {
    const wif = keys[n];
    if (!wif) { results.push({ n, chain, op: 'SKIP-NO-KEY' }); continue; }
    try {
      const acc = (await rpcNode(node, 'condenser_api.get_accounts', [[n]]))[0];
      if (!acc) { results.push({ n, chain, op: 'SKIP-NO-ACCOUNT' }); continue; }
      const liq = acc[liquidField] || '0.000';
      const debt = acc.reward_sbd_balance || acc.reward_hbd_balance || '0.000';
      const vests = acc.reward_vesting_balance || '0.000000 VESTS';
      if (f(liq) === 0 && f(debt) === 0 && f(vests) === 0) { results.push({ n, chain, op: 'NOTHING-PENDING' }); continue; }
      const op = ['claim_reward_balance', {
        account: n,
        reward_steem: liq, reward_sbd: debt, reward_vesting_shares: vests, // condenser field aliases are per-chain; pass raw strings
      }];
      const alias = chain === 'hive'
        ? { reward_steem: acc.reward_hive_balance, reward_sbd: acc.reward_hbd_balance, reward_vesting_shares: acc.reward_vesting_balance }
        : { reward_steem: acc.reward_blurt_balance, reward_sbd: acc.reward_sbd_balance || '0.000 SBD', reward_vesting_shares: acc.reward_vesting_balance };
      op[1] = { account: n, ...alias };
      await signAndBroadcast({ node, chainId, wif, ops: [op] });
      await sleep(2000);
      const back = (await rpcNode(node, 'condenser_api.get_accounts', [[n]]))[0];
      const zeroed = f(back[liquidField]) === 0 && f(back.reward_vesting_balance) === 0;
      results.push({ n, chain, op: zeroed ? 'CLAIMED-VERIFIED' : 'CLAIMED-READBACK-PENDING', claimed: { liquid: liq, debt, vests } });
    } catch (e) { results.push({ n, chain, op: 'ERR', msg: String(e.message || e).slice(0, 90) }); }
    await sleep(400);
  }
  return results;
}

// ---- HEAD CURATION (steem; real income lever: 4279 SP effective) ----
const CUR_VOTE_MAX_BLURT = 2;      // blurt lane: 8727 BP idle surface (Z-32 discovery)
const BLURT_TAGS = ['life', 'blog', 'photography', 'story', 'nature', 'poetry', 'health', 'food', 'travel', 'blurt'];
const BLURT_MIN_REP = 40;          // blurt reps run lower than steem
const BLURT_MAX_AGE_MIN = 720;     // blurt is thinner — widen the window, keep the floor
const repScore = (raw) => { const r = f(String(raw).replace(/[^0-9.\-]/g, '')); if (r <= 0) return 0; return Math.round((Math.log10(r) - 9) * 9 + 25); };
const r3 = (x) => Math.round(x * 1000) / 1000;
async function headCurate(headWif, ownNames) {
  const log = [];
  if (!headWif) { log.push({ op: 'SKIP-NO-HEAD-POSTING', note: 'set SA_HEAD_POSTING secret' }); return log; }
  const headAcc = (await rpcNode(STEEM_NODE, 'condenser_api.get_accounts', [[HEAD]]))[0];
  const vp = f(headAcc.voting_power);
  if (vp < CUR_VP_FLOOR) { log.push({ op: 'SKIP-VP-FLOOR', vp: vp / 100 }); return log; }
  // pass 1: collect candidates (condenser discussions no longer carry reputation)
  const seenAuthors = new Set();
  const candidates = [];
  for (const tag of CUR_TAGS) {
    let disc = [];
    try { disc = await rpcNode(STEEM_NODE, 'condenser_api.get_discussions_by_created', [{ tag, limit: 20 }]); } catch (_) { continue; }
    for (const p of disc) {
      const author = p.author;
      if (!author || ownNames.has(author) || seenAuthors.has(author)) continue;
      const ageMin = (Date.now() - new Date(p.created + 'Z').getTime()) / 60000;
      if (ageMin < CUR_MIN_AGE_MIN || ageMin > CUR_MAX_AGE_MIN) continue;
      if ((p.active_votes || []).some(v => v.voter === HEAD)) continue;
      seenAuthors.add(author);
      candidates.push({ author, permlink: p.permlink, tag, ageMin: Math.round(ageMin) });
      if (candidates.length >= 30) break;
    }
    if (candidates.length >= 30) break;
    await sleep(250);
  }
  // pass 2: reputation via batched get_accounts
  const reps = {};
  for (let i = 0; i < candidates.length; i += 30) {
    const chunk = [...new Set(candidates.slice(i, i + 30).map(c => c.author))];
    try {
      const rows = await rpcNode(STEEM_NODE, 'condenser_api.get_accounts', [chunk]);
      for (const r of rows) reps[r.name] = repScore(r.reputation);
    } catch (_) {}
    await sleep(250);
  }
  // pass 3: bounded voting
  let voted = 0;
  for (const c of candidates) {
    if (voted >= CUR_VOTE_MAX) break;
    if ((reps[c.author] || 0) < CUR_MIN_REP) continue;
    try {
      await signAndBroadcast({ node: STEEM_NODE, chainId: undefined, wif: headWif, ops: [['vote', { voter: HEAD, author: c.author, permlink: c.permlink, weight: CUR_WEIGHT }]] });
      await sleep(1500);
      const back = await rpcNode(STEEM_NODE, 'condenser_api.get_content', [c.author, c.permlink]);
      const ok = back && (back.active_votes || []).some(v => v.voter === HEAD);
      log.push({ op: ok ? 'VOTED-VERIFIED' : 'VOTED-READBACK-PENDING', author: c.author, permlink: c.permlink.slice(0, 40), tag: c.tag, ageMin: c.ageMin, rep: reps[c.author] });
      voted++;
    } catch (e) { log.push({ op: 'ERR', author: c.author, msg: String(e.message || e).slice(0, 80) }); }
    await sleep(12500); // STEEM_MIN_VOTE_INTERVAL is 10s — respect the lockout with margin
  }
  log.push({ op: 'SUMMARY', voted, candidates: candidates.length, vpBefore: vp / 100 });
  return log;
}

// ---- HEAD CURATION (hive lane; Z-33: 25.4 HP manabar-verified 100% VP — idle surface)
async function headCurateHive(headWif) {
  const log = [];
  if (!headWif) { log.push({ op: 'SKIP-NO-HEAD-POSTING' }); return log; }
  const headAcc = (await rpcNode(HIVE_NODE, 'condenser_api.get_accounts', [[HEAD]]))[0];
  if (!headAcc) { log.push({ op: 'SKIP-NO-ACCOUNT', chain: 'hive' }); return log; }
  const hp = f(headAcc.vesting_shares) + f(headAcc.received_vesting_shares) - f(headAcc.delegated_vesting_shares);
  // hive manabar scale verified exact: mana == vests×1e6 at full (Z-33 probe)
  let vp = f(headAcc.voting_power);
  if (headAcc.voting_manabar && headAcc.voting_manabar.current_mana != null && hp > 0) {
    const maxMana = hp * 1e6;
    const nowSec = Math.floor(Date.now() / 1000);
    const elapsed = Math.max(0, nowSec - (headAcc.voting_manabar.last_update_time || nowSec));
    const regen = maxMana * Math.min(elapsed, 432000) / 432000;
    vp = Math.min(10000, 10000 * Math.min(maxMana, f(headAcc.voting_manabar.current_mana) + regen) / maxMana);
  }
  if (vp < CUR_VP_FLOOR) { log.push({ op: 'SKIP-VP-FLOOR', chain: 'hive', vp: vp / 100, hp: r3(hp) }); return log; }
  const seenAuthors = new Set();
  const candidates = [];
  for (const tag of HIVE_TAGS) {
    let disc = [];
    try { disc = await rpcNode(HIVE_NODE, 'condenser_api.get_discussions_by_created', [{ tag, limit: 20 }]); } catch (_) { continue; }
    for (const p of disc) {
      const author = p.author;
      if (!author || seenAuthors.has(author)) continue;
      const ageMin = (Date.now() - new Date(p.created + 'Z').getTime()) / 60000;
      if (ageMin < CUR_MIN_AGE_MIN || ageMin > HIVE_MAX_AGE_MIN) continue;
      if ((p.active_votes || []).some(v => v.voter === HEAD)) continue;
      seenAuthors.add(author);
      candidates.push({ author, permlink: p.permlink, tag, ageMin: Math.round(ageMin) });
      if (candidates.length >= 20) break;
    }
    if (candidates.length >= 20) break;
    await sleep(250);
  }
  const reps = {};
  for (let i = 0; i < candidates.length; i += 30) {
    const chunk = [...new Set(candidates.slice(i, i + 30).map(c => c.author))];
    try {
      const rows = await rpcNode(HIVE_NODE, 'condenser_api.get_accounts', [chunk]);
      for (const r0 of rows) {
        // Z-33 second calibration: api.hive.blog serves reputation=0 across the fresh
        // 'created' feed (measured: 5/5 authors at 0) — repScore zeroed all candidates.
        // Same measured substitute as blurt: age ≥ 30d AND post_count ≥ 10 → 50.
        if (f(r0.reputation) > 0) { reps[r0.name] = repScore(r0.reputation); continue; }
        const ageDays = r0.created ? (Date.now() - new Date(r0.created + 'Z').getTime()) / 864e5 : 0;
        reps[r0.name] = (ageDays >= 30 && f(r0.post_count) >= 10) ? 50 : 0;
      }
    } catch (_) {}
    await sleep(250);
  }
  let voted = 0;
  for (const c of candidates) {
    if (voted >= CUR_VOTE_MAX_HIVE) break;
    if ((reps[c.author] || 0) < HIVE_MIN_REP) continue;
    try {
      await signAndBroadcast({ node: HIVE_NODE, chainId: HIVE_CHAIN_ID, wif: headWif, ops: [['vote', { voter: HEAD, author: c.author, permlink: c.permlink, weight: CUR_WEIGHT }]] });
      await sleep(1500);
      const back = await rpcNode(HIVE_NODE, 'condenser_api.get_content', [c.author, c.permlink]);
      const ok = back && (back.active_votes || []).some(v => v.voter === HEAD);
      log.push({ op: ok ? 'VOTED-VERIFIED' : 'VOTED-READBACK-PENDING', chain: 'hive', author: c.author, permlink: c.permlink.slice(0, 40), tag: c.tag, ageMin: c.ageMin, rep: reps[c.author] });
      voted++;
    } catch (e) { log.push({ op: 'ERR', chain: 'hive', author: c.author, msg: String(e.message || e).slice(0, 80) }); }
    await sleep(12500); // vote lockout margin
  }
  log.push({ op: 'SUMMARY', chain: 'hive', voted, candidates: candidates.length, vpBefore: vp / 100, vestsRaw: r3(hp) });
  return log;
}

// ---- HEAD CURATION (blurt lane; Z-32: 8727 BP idle — same doctrine, blurt chain)
async function headCurateBlurt(headWif) {
  const log = [];
  if (!headWif) { log.push({ op: 'SKIP-NO-HEAD-POSTING' }); return log; }
  const headAcc = (await rpcNode(BLURT_NODE, 'condenser_api.get_accounts', [[HEAD]]))[0];
  if (!headAcc) { log.push({ op: 'SKIP-NO-ACCOUNT', chain: 'blurt' }); return log; }
  const bp = f(headAcc.vesting_shares) + f(headAcc.received_vesting_shares) - f(headAcc.delegated_vesting_shares);
  // Z-33: beblurt's legacy voting_power field is broken (always 0) — the manabar is
  // the chain truth (probe 2026-10-02: manabar 100.00% vs legacy 0). Standard regen math.
  let vp = f(headAcc.voting_power);
  if (headAcc.voting_manabar && headAcc.voting_manabar.current_mana != null && bp > 0) {
    const maxMana = bp * 1e6;
    const nowSec = Math.floor(Date.now() / 1000);
    const elapsed = Math.max(0, nowSec - (headAcc.voting_manabar.last_update_time || nowSec));
    const regen = maxMana * Math.min(elapsed, 432000) / 432000;
    vp = Math.min(10000, 10000 * Math.min(maxMana, f(headAcc.voting_manabar.current_mana) + regen) / maxMana);
  }
  if (vp < CUR_VP_FLOOR) { log.push({ op: 'SKIP-VP-FLOOR', chain: 'blurt', vp: vp / 100, bp: r3(bp) }); return log; }
  const seenAuthors = new Set();
  const candidates = [];
  for (const tag of BLURT_TAGS) {
    let disc = [];
    try { disc = await rpcNode(BLURT_NODE, 'condenser_api.get_discussions_by_created', [{ tag, limit: 20 }]); } catch (_) { continue; }
    for (const p of disc) {
      const author = p.author;
      if (!author || seenAuthors.has(author)) continue;
      const ageMin = (Date.now() - new Date(p.created + 'Z').getTime()) / 60000;
      if (ageMin < CUR_MIN_AGE_MIN || ageMin > BLURT_MAX_AGE_MIN) continue;
      if ((p.active_votes || []).some(v => v.voter === HEAD)) continue;
      seenAuthors.add(author);
      candidates.push({ author, permlink: p.permlink, tag, ageMin: Math.round(ageMin) });
      if (candidates.length >= 20) break;
    }
    if (candidates.length >= 20) break;
    await sleep(250);
  }
  const reps = {};
  for (let i = 0; i < candidates.length; i += 30) {
    const chunk = [...new Set(candidates.slice(i, i + 30).map(c => c.author))];
    try {
      const rows = await rpcNode(BLURT_NODE, 'condenser_api.get_accounts', [chunk]);
      for (const r0 of rows) {
        // Z-33: blurt nodes serve no reputation field (verified on both live nodes) —
        // the steem repScore silently zeroed every candidate and the lane starved.
        // Substitute measured gate: account age ≥ 30d AND post_count ≥ 10 → 50 (passes
        // BLURT_MIN_REP=40); otherwise 0. Anti-spam floor from data that blurt DOES serve.
        if (r0.reputation != null) { reps[r0.name] = repScore(r0.reputation); continue; }
        const ageDays = r0.created ? (Date.now() - new Date(r0.created + 'Z').getTime()) / 864e5 : 0;
        reps[r0.name] = (ageDays >= 30 && f(r0.post_count) >= 10) ? 50 : 0;
      }
    } catch (_) {}
    await sleep(250);
  }
  let voted = 0;
  for (const c of candidates) {
    if (voted >= CUR_VOTE_MAX_BLURT) break;
    if ((reps[c.author] || 0) < BLURT_MIN_REP) continue;
    try {
      await signAndBroadcast({ node: BLURT_NODE, chainId: BLURT_CHAIN_ID, wif: headWif, ops: [['vote', { voter: HEAD, author: c.author, permlink: c.permlink, weight: CUR_WEIGHT }]] });
      await sleep(1500);
      const back = await rpcNode(BLURT_NODE, 'condenser_api.get_content', [c.author, c.permlink]);
      const ok = back && (back.active_votes || []).some(v => v.voter === HEAD);
      log.push({ op: ok ? 'VOTED-VERIFIED' : 'VOTED-READBACK-PENDING', chain: 'blurt', author: c.author, permlink: c.permlink.slice(0, 40), tag: c.tag, ageMin: c.ageMin, rep: reps[c.author] });
      voted++;
    } catch (e) { log.push({ op: 'ERR', chain: 'blurt', author: c.author, msg: String(e.message || e).slice(0, 80) }); }
    await sleep(12500);
  }
  log.push({ op: 'SUMMARY', chain: 'blurt', voted, candidates: candidates.length, vpBefore: vp / 100, bp: r3(bp) });
  return log;
}

(async () => {
  try { if (require('./capital-gate.cjs').stasisHalt('treasury-desk')) return; } catch (e) { console.log('[CAPITAL-GATE] treasury-desk — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  const t0 = Date.now();
  let keys = loadKeys();
  const headPosting = process.env.SA_HEAD_POSTING || keys[HEAD] || recoverHeadPosting() || null;
  if (headPosting && !keys[HEAD]) keys = { ...keys, [HEAD]: headPosting };
  const names = Object.keys(keys).filter(n => n && /^[a-z0-9-]{3,16}$/.test(n));
  const soldiers = names.filter(n => n !== HEAD && !RETIRED.has(n));
  const receipt = { at: new Date().toISOString(), agent: 'treasury-desk', book: {}, claims: [], curation: [], rail: { enabled: EXEC_ENABLED } };

  // ---- BOOK ----
  try { receipt.book.steem = await chainBook('steem', STEEM_NODE, [HEAD, ...soldiers]); } catch (e) { receipt.book.steem = { error: String(e.message || e).slice(0, 100) }; }
  try { receipt.book.hive = await chainBook('hive', HIVE_NODE, [HEAD, ...soldiers.filter(n => n !== 'tov')]); } catch (e) { receipt.book.hive = { error: String(e.message || e).slice(0, 100) }; }
  try { receipt.book.blurt = await chainBook('blurt', BLURT_NODE, [HEAD, ...soldiers]); } catch (e) { receipt.book.blurt = { error: String(e.message || e).slice(0, 100) }; }
  try { receipt.book.tron = await tronBook(); } catch (_) { receipt.book.tron = { error: 'x' }; }
  try { receipt.book.hiveEngine = await heBook([HEAD, ...soldiers]); } catch (_) {}

  // ---- CLAIMS (hive + blurt) ----
  try { receipt.claims.push(...await claimChain({ chain: 'hive', node: HIVE_NODE, chainId: HIVE_CHAIN_ID, names: [HEAD, ...soldiers], keys })); } catch (e) { receipt.claims.push({ chain: 'hive', op: 'ERR', msg: String(e.message || e).slice(0, 90) }); }
  try { receipt.claims.push(...await claimChain({ chain: 'blurt', node: BLURT_NODE, chainId: BLURT_CHAIN_ID, names: [HEAD, ...soldiers], keys })); } catch (e) { receipt.claims.push({ chain: 'blurt', op: 'ERR', msg: String(e.message || e).slice(0, 90) }); }

  // ---- HEAD CURATION (steem) ----
  try { receipt.curation = await headCurate(headPosting, new Set([HEAD, ...soldiers, 'ynet', 'tov'])); }
  catch (e) { receipt.curation = [{ op: 'ERR', msg: String(e.message || e).slice(0, 100) }]; }
  try { receipt.curationBlurt = await headCurateBlurt(headPosting); }
  catch (e) { receipt.curationBlurt = [{ op: 'ERR', msg: String(e.message || e).slice(0, 100) }]; }
  try { receipt.curationHive = await headCurateHive(process.env.SA_HEAD_HIVE_POSTING || recoverHeadHive() || headPosting); }
  catch (e) { receipt.curationHive = [{ op: 'ERR', msg: String(e.message || e).slice(0, 100) }]; }

  // ---- ARMED RAIL (holstered) ----
  receipt.rail.note = EXEC_ENABLED
    ? 'ENABLED: HE swap + STEEM transfer permitted (still allowlist-gated at execution)'
    : 'HOLSTERED: set ENABLE_TX=1 + SA_HEAD_STEEM_ACTIVE / SA_HEAD_HIVE_ACTIVE secrets to arm';

  // ---- LEDGER (committed, keyless) ----
  const book = {
    executor: 'headcorner', // Task 18: the ledger names the account it describes — the reconcile cross-check (references executor account) reads this identity
    headSteemLiquid: receipt.book.steem && receipt.book.steem.head ? receipt.book.steem.head.liquid : null,
    headSteemDebt: receipt.book.steem && receipt.book.steem.head ? receipt.book.steem.head.debt : null,
    headSteemStake: receipt.book.steem && receipt.book.steem.head ? receipt.book.steem.head.effStake : null,
    powerdown: receipt.book.steem && receipt.book.steem.powerdown ? receipt.book.steem.powerdown : null,
    headHive: receipt.book.hive && receipt.book.hive.head ? receipt.book.hive.head : null,
    headBlurt: receipt.book.blurt && receipt.book.blurt.head ? receipt.book.blurt.head : null,
    tron: receipt.book.tron,
    claimsDone: receipt.claims.filter(c => c.op === 'CLAIMED-VERIFIED').length,
    curated: receipt.curation.filter(c => c.op === 'VOTED-VERIFIED').length,
  };
  let ledger = { updated: receipt.at, book, history: [] };
  try { const prev = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); ledger.history = (prev.history || []).slice(-29); const pb = prev.book || {}; ledger.history.push({ at: prev.updated, headSteemLiquid: pb.headSteemLiquid, headSteemStake: pb.headSteemStake, curated: pb.curated, claimsDone: pb.claimsDone }); } catch (_) {}
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));

  // receipt
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({
    state: 'ok',
    headSteem: receipt.book.steem && receipt.book.steem.head ? receipt.book.steem.head.liquid : null,
    powerdown: receipt.book.steem && receipt.book.steem.powerdown ? receipt.book.steem.powerdown.rateSp + 'SP/week' : 'none',
    claims: receipt.claims.filter(c => String(c.op).startsWith('CLAIMED')).length + ' claimed / ' + receipt.claims.filter(c => c.op === 'NOTHING-PENDING').length + ' nothing-pending',
    curated: receipt.curation.filter(c => String(c.op).startsWith('VOTED')).length,
    rail: EXEC_ENABLED ? 'ENABLED' : 'HOLSTERED',
    ms: Date.now() - t0,
  }));
  process.exit(0);
})().catch(e => {
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), agent: 'treasury-desk', fatal: String(e.message || e).slice(0, 200) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
  process.exit(0);
});
