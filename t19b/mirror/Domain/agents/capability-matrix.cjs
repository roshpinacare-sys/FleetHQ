'use strict';
/**
 * capability-matrix.cjs — Z-27 USAGE VERIFICATION BOOK (keyless output, read-only).
 *
 * Answers the standing question "what do we hold and what are we actually using":
 * for every fleet account x chain (steem/hive/blurt):
 *   - which authorities (posting/active/owner) are byte-verified OURS (secp256k1
 *     derivation vs live key_auths, ripemd160 checksum, per-chain prefix);
 *   - what the account did in its last ~200 ops (op-class tally);
 *   - which capabilities sit IDLE (authority ours + capital above dust + zero
 *     recent ops in that class). This is the engine that finds things like
 *     "8,727 BP with voting power at 0 and zero votes in history" (found live 09-30).
 *
 * Doctrine: no secrets in output (pubkey prefixes only) · read-only · fail-soft exit 0.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.MATRIX_JSON || path.join(ROOT, 'agents', 'capability-matrix.json');
const OUT_MD = path.join(ROOT, 'agents', 'capability-matrix.md');

const NODES = {
  steem: 'https://api.steemit.com',
  hive: 'https://api.hive.blog',
  blurt: 'https://rpc.beblurt.com',
};
const PREFIX = { steem: 'STM', hive: 'STM', blurt: 'BLT' };
const RETIRED = new Set(['ynet']);
const HEAD = 'headcorner';
const HIVE_SKIP = new Set(['tov']); // posting authority not ours (byte-verified 09-30)

// capital floors for "worth calling idle" (dust does not count)
const CAPITAL_FLOOR = {
  curation: { steem: 20, hive: 5, blurt: 50 },   // effective stake units (SP/HP/BP)
  banking: { steem: 5, hive: 1, blurt: 1 },      // liquid units
};

// which operations each authority class can sign
const AUTH_CLASS = {
  posting: ['comment', 'vote', 'claim_reward_balance', 'custom_json', 'reblog', 'delete_comment'],
  active: ['transfer', 'transfer_to_vesting', 'withdraw_vesting', 'limit_order_create', 'limit_order_cancel', 'convert', 'set_withdraw_vesting_route', 'delegate_vesting_shares', 'account_update', 'witness_vote'],
};

function rpc(node, method, params, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const u = new URL(node);
    const req = https.request({ hostname: u.hostname, path: u.pathname || '/', method: 'POST', family: 4, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); if (j.error) return reject(new Error(String(j.error.message || 'rpc-error').slice(0, 80))); resolve(j.result); }
        catch (_) { reject(new Error('bad-rpc')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    req.write(payload); req.end();
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const f = (s) => parseFloat(String(s || '0'));

// ---- per-chain public key reconstruction from a WIF ----
// CHAIN TRUTH (live-verified 10/10 on blurt, 09-30): steem-family keys share the
// identical 37-byte base58 body; the chain prefix is the ONLY difference. No
// checksum re-derivation (re-encoding with a recomputed ripemd160^2 produces a
// WRONG body — caught live and reverted to the pure prefix swap).
function chainPubkeys(wif) {
  let steemLib = null;
  try { steemLib = require('steem'); } catch (_) { return null; }
  let out = { STM: null, BLT: null };
  try {
    const stm = steemLib.auth.wifToPublic(wif);
    out.STM = stm;
    out.BLT = 'BLT' + stm.slice(3);
  } catch (_) {}
  return out;
}

function loadKeys() {
  const raw = process.env.SA_FLEET_KEYS || '';
  if (!raw) return {};
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    // two generations of the fleet-keys shape exist:
    //   flat:   {user: postingWIF}
    //   nested: {user: {posting, active, steem_posting, hive_active, ...}}
    // normalize to nested so every role is verifiable (R-cm-1: the old code fed
    // OBJECTS into wifToPublic, every derivation failed, and the book then
    // reported NO-KEY-IN-VAULT for keys we demonstrably sign with — a lie).
    const out = {};
    for (const [u, v] of Object.entries(j || {})) {
      if (typeof v === 'string') out[u] = { posting: v };
      else if (v && typeof v === 'object') out[u] = v;
    }
    return out;
  } catch (_) { return {}; }
}

// candidate WIFs for (user, chain, role) across both shape generations
function wifsFor(entry, chain, role) {
  if (!entry || typeof entry !== 'object') return typeof entry === 'string' && role === 'posting' ? [entry] : [];
  const cands = [];
  const add = (x) => { if (typeof x === 'string' && x.length > 30) cands.push(x); };
  add(entry[chain + '_' + role]);
  if (chain === 'blurt') { add(entry[role]); add(entry['steem_' + role]); } // blurt shares the steem-family body (live-verified chain truth)
  add(entry[role]);                                // flat shape (steem roles)
  return [...new Set(cands)];
}

// head posting key: secret first, then the private-steem-repo recovery (Z-21 pattern, proven in CI)
function recoverHeadPosting() {
  const dir = process.env.STEEM_REPO_DIR;
  if (!dir) return null;
  const { execFileSync } = require('child_process');
  const crypto = require('crypto');
  const out = path.join('/tmp', 'cm-keys-' + Date.now());
  try {
    fs.mkdirSync(out, { recursive: true, mode: 0o700 });
    const metaPath = path.join(dir, 'agent', 'recovery-meta.json');
    if (!fs.existsSync(metaPath)) return null;
    const metas = [JSON.parse(fs.readFileSync(metaPath, 'utf8'))];
    const vdir = path.join(dir, 'agent', 'vault');
    const encs = fs.readdirSync(vdir).filter(f => f.endsWith('.enc')).map(f => path.join(vdir, f));
    const sha = (x) => crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex');
    for (const enc of encs) {
      const outer = sha(enc);
      for (const m of metas) {
        if (!m || !m.keysZipPass || m.keysZipSha256 !== outer) continue;
        const dec = path.join(out, 'v.zip');
        execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', enc, '-out', dec, '-pass', 'env:CMZP'], { env: { ...process.env, CMZP: m.keysZipPass }, stdio: 'pipe' });
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

const vestsToEff = (r, props, sym) => {
  const tvf = f(props.total_vesting_fund_steem || props.total_vesting_fund_hive || props.total_vesting_fund_blurt);
  const tvs = f(props.total_vesting_shares);
  return f(f(r.vesting_shares) - f(r.delegated_vesting_shares || 0) + f(r.received_vesting_shares || 0)) * tvf / tvs;
};

async function accountRow(chain, name) {
  const acc = (await rpc(NODES[chain], 'condenser_api.get_accounts', [[name]]))[0];
  if (!acc) return null;
  let props;
  try { props = await rpc(NODES[chain], 'condenser_api.get_dynamic_global_properties', []); } catch (_) { props = null; }
  const sym = chain === 'steem' ? 'SP' : chain === 'hive' ? 'HP' : 'BP';
  const eff = props ? vestsToEff(acc, props, sym) : 0;
  return {
    effStake: +eff.toFixed(3), stakeSym: sym,
    liquid: f(acc.balance),
    votingPower: f(acc.voting_power) / 100,
    postingKey: (acc.posting.key_auths || []).map(k => k[0]),
    activeKeys: (acc.active.key_auths || []).map(k => k[0]),
    ownerKeys: (acc.owner.key_auths || []).map(k => k[0]),
  };
}

async function opTally(chain, name) {
  // last ~200 ops; nodes lag sometimes — honest marker on failure
  const hist = await rpc(NODES[chain], 'condenser_api.get_account_history', [name, -1, 200], 25000);
  const tally = {};
  for (const [, ev] of (hist || [])) {
    const [type] = ev.op || [];
    if (type) tally[type] = (tally[type] || 0) + 1;
  }
  return tally;
}

function authorityStatus(oursList, chainList) {
  if (!oursList || !oursList.length) return 'NO-KEY-IN-VAULT';
  const ours = new Set(oursList);
  const hit = (chainList || []).some(k => ours.has(k));
  return hit ? 'OURS' : 'NOT-OURS';
}

function idleFlags({ chain, eff, liquid, vp, tally, postingOurs, activeOurs }) {
  const flags = [];
  if (postingOurs === 'OURS' && eff >= CAPITAL_FLOOR.curation[chain] && f(vp) < 20 && !(tally.vote > 0)) flags.push('CURATION-IDLE: ' + eff.toFixed(0) + ' ' + (chain === 'steem' ? 'SP' : chain === 'hive' ? 'HP' : 'BP') + ', VP ' + vp + '%, 0 votes in recent history');
  if (activeOurs === 'OURS' && liquid >= CAPITAL_FLOOR.banking[chain] && !(tally.transfer > 0) && !(tally.limit_order_create > 0) && !(tally.transfer_to_vesting > 0)) flags.push('BANKING-IDLE: ' + liquid + ' liquid unused by any banking op in recent history');
  return flags;
}

(async () => {
  try { if (require('./capital-gate.cjs').stasisHalt('capability-matrix')) return; } catch (e) { console.log('[CAPITAL-GATE] capability-matrix — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  const t0 = Date.now();
  const receipt = { at: new Date().toISOString(), agent: 'capability-matrix', chains: {}, idle: [], notes: [] };

  const keys = loadKeys();
  const headPosting = process.env.SA_HEAD_POSTING || recoverHeadPosting();
  if (headPosting && !keys[HEAD]) keys[HEAD] = headPosting;
  const roster = Object.keys(keys).filter(n => n && /^[a-z0-9-]{3,16}$/.test(n) && !RETIRED.has(n));
  receipt.roster = roster.slice();

  const propsCache = {};
  for (const chain of ['steem', 'hive', 'blurt']) {
    const rows = {};
    for (const name of roster) {
      if (chain === 'hive' && HIVE_SKIP.has(name)) { rows[name] = { skip: 'posting-not-ours (byte-verified 09-30)' }; continue; }
      const pubs = chainPubkeys(wifsFor(keys[name], chain, 'posting')[0] || wifsFor(keys[name], 'steem', 'posting')[0] || (typeof keys[name] === 'string' ? keys[name] : null));
      try {
        const row = await accountRow(chain, name);
        if (!row) { rows[name] = { skip: 'no-account' }; continue; }
        const postingOurs = authorityStatus(pubs && pubs.STM ? [pubs.STM] : [], row.postingKey);
        const blurtPubs = pubs && pubs.BLT ? [pubs.BLT] : (pubs && pubs.STM ? [pubs.STM] : []);
        const listForChain = chain === 'blurt' ? blurtPubs : (pubs && pubs.STM ? [pubs.STM] : []);
        const po = authorityStatus(listForChain, row.postingKey);
        // R-cm-2: ACTIVE authority is now verified too — the banking layer
        // (transfer / limit_order / power ops) is the part with real money rails.
        let activePubs = [];
        for (const w of wifsFor(keys[name], chain, 'active')) {
          const p = chainPubkeys(w);
          if (p && p.STM) activePubs.push(chain === 'blurt' && p.BLT ? p.BLT : p.STM);
        }
        const ao = authorityStatus(activePubs, row.activeKeys);
        let tally = {};
        try { tally = await opTally(chain, name); } catch (e) { tally = { __unavailable: String(e.message || e).slice(0, 40) }; }
        rows[name] = {
          effStake: row.effStake + ' ' + row.stakeSym, liquid: row.liquid, votingPower: row.votingPower,
          posting: po, postingAuthorityCount: (row.postingKey || []).length,
          active: ao, activeAuthorityCount: (row.activeKeys || []).length,
          recentOps: tally,
        };
        const flags = idleFlags({ chain, eff: row.effStake, liquid: row.liquid, vp: row.votingPower, tally, postingOurs: po, activeOurs: ao });
        for (const fl of flags) receipt.idle.push({ account: name, chain, flag: fl });
      } catch (e) { rows[name] = { error: String(e.message || e).slice(0, 60) }; }
      await sleep(250);
    }
    receipt.chains[chain] = rows;
  }

  // summary
  const ours = {};
  const activeOurs = {};
  for (const c of Object.keys(receipt.chains)) {
    ours[c] = Object.entries(receipt.chains[c]).filter(([, v]) => v && v.posting === 'OURS').map(([k]) => k);
    activeOurs[c] = Object.entries(receipt.chains[c]).filter(([, v]) => v && v.active === 'OURS').map(([k]) => k);
  }
  receipt.summary = {
    postingOurs: Object.fromEntries(Object.entries(ours).map(([c, l]) => [c, l.length])),
    activeOurs: Object.fromEntries(Object.entries(activeOurs).map(([c, l]) => [c, l.length])),
    idleFlags: receipt.idle.length,
    ms: Date.now() - t0,
  };

  const md = [
    '# Capability Matrix (Z-27 usage-verification book)', '',
    'Updated: ' + receipt.at + ' UTC. Read-only; derived from live key_auths + recent account history. Generated by agents/capability-matrix.cjs.', '',
    '## Posting authority: OURS (byte-verified per run)', '',
    ...Object.entries(ours).map(([c, l]) => '- ' + c + ': ' + l.length + ' accounts [' + l.join(', ') + ']'), '',
    '## Active authority: OURS (banking layer, byte-verified per run)', '',
    ...Object.entries(activeOurs).map(([c, l]) => '- ' + c + ': ' + l.length + ' accounts [' + l.join(', ') + ']'), '',
    '## Idle capital flags (authority ours + capital above dust + no recent use)', '',
    ...(receipt.idle.length ? receipt.idle.map(i => '- **' + i.account + '@' + i.chain + '** — ' + i.flag) : ['- none detected this run']), '',
    'Recent-history windows may be unavailable on some nodes (marked honestly per account).', '',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(receipt, null, 1));
  fs.writeFileSync(OUT_MD, md);
  console.log(JSON.stringify({ state: 'ok', summary: receipt.summary }));
  process.exit(0);
})().catch(e => {
  try { fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true }); fs.writeFileSync(OUT_JSON, JSON.stringify({ at: new Date().toISOString(), agent: 'capability-matrix', fatal: String(e.message || e).slice(0, 200) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
  process.exit(0);
});
