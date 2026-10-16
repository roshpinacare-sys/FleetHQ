'use strict';
/**
 * blurt-curate.cjs — Z-27 IDLE-STAKE ACTIVATION: headcorner blurt curation.
 *
 * Found live on 09-30 by capability-matrix: headcorner holds 8,727 BP on blurt with
 * voting power at 0 and zero votes in recent history — real capital, fully idle.
 * This agent wakes it: bounded, quality-gated curation (same doctrine as the steem
 * head curation shipped in Z-26):
 *   - posting key: SA_HEAD_POSTING secret, else private-steem-repo recovery
 *     (Z-21 pattern; the steem posting WIF IS the blurt posting key, byte-verified);
 *   - byte-verify the derived BLT public key against live key_auths BEFORE any vote;
 *   - VP floor 25% (blurt regen is slow; never drain), weight 50%, max 3 votes/run,
 *     12.5s spacing (vote-interval law), age window 20–480 min, non-fleet authors,
 *     reputation gate, read-back verification per vote.
 *
 * Doctrine: verify-then-sign · idempotent (active_votes read) · fail-soft exit 0 · secretless receipts.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.RECEIPT_OUT || path.join(ROOT, 'agents', 'receipts', 'blurt-curate-receipt.json');

const BLURT_NODE = 'https://rpc.beblurt.com';
const BLURT_CHAIN_ID = 'cd8d90f29ae273abec3eaa7731e25934c63eb654d55080caff2ebb7f5df6381f';
const HEAD = 'headcorner';
const VP_FLOOR = 2500;           // 25% — regen is slow, never drain the VP
const VOTE_WEIGHT = 5000;        // 50%
const MAX_VOTES = 3;
const VOTE_SPACING_MS = 12500;   // STEEM_MIN_VOTE_INTERVAL law (blurt inherits the family rule)
const MIN_AGE_MIN = 20, MAX_AGE_MIN = 480;
const MIN_REP = 50;
const TAGS = ['life', 'blog', 'photography', 'nature', 'food', 'story', 'writing', 'travel', 'health', 'art'];

function rpc(method, params, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const u = new URL(BLURT_NODE);
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

function loadFleetNames() {
  const raw = process.env.SA_FLEET_KEYS || '';
  if (!raw) return new Set([HEAD, 'ynet']);
  try { return new Set(Object.keys(JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))).concat([HEAD, 'ynet'])); }
  catch (_) { return new Set([HEAD, 'ynet']); }
}

// steem posting WIF (the blurt posting WIF, same material) — secret first, then recovery
function recoverHeadPosting() {
  const dir = process.env.STEEM_REPO_DIR;
  if (!dir) return null;
  const { execFileSync } = require('child_process');
  const crypto = require('crypto');
  const out = path.join('/tmp', 'bc-keys-' + Date.now());
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
        execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', enc, '-out', dec, '-pass', 'env:BCZP'], { env: { ...process.env, BCZP: m.keysZipPass }, stdio: 'pipe' });
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

// derive the BLT-prefixed public key from a WIF (pure prefix swap — chain truth:
// steem-family bodies are identical, verified 10/10 against live key_auths 09-30)
function blurtPubOf(wif) {
  try {
    const steem = require('steem');
    const stm = steem.auth.wifToPublic(wif);
    return 'BLT' + stm.slice(3);
  } catch (_) { return null; }
}

async function signAndBroadcast(wif, ops) {
  const dgp = await rpc('condenser_api.get_dynamic_global_properties', []);
  const tx = {
    ref_block_num: dgp.head_block_number & 0xffff,
    ref_block_prefix: Buffer.from(dgp.head_block_id, 'hex').readUInt32LE(4),
    expiration: new Date(new Date(dgp.time + 'Z').getTime() + 90000).toISOString().slice(0, 19),
    operations: ops, extensions: [],
  };
  const steem = require('steem');
  const prev = steem.config.get('chain_id');
  let signed;
  try { steem.config.set('chain_id', BLURT_CHAIN_ID); signed = steem.auth.signTransaction(tx, [wif]); }
  finally { steem.config.set('chain_id', prev); }
  await rpc('condenser_api.broadcast_transaction', [signed]);
}

const repScore = (raw) => { const r = f(String(raw).replace(/[^0-9.\-]/g, '')); if (r <= 0) return 0; return Math.round((Math.log10(r) - 9) * 9 + 25); };

(async () => {
  try { if (require('./capital-gate.cjs').stasisHalt('blurt-curate')) return; } catch (e) { console.log('[CAPITAL-GATE] blurt-curate — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  const t0 = Date.now();
  const receipt = { at: new Date().toISOString(), agent: 'blurt-curate', votes: [], summary: {} };

  const headWif = process.env.SA_HEAD_POSTING || recoverHeadPosting();
  if (!headWif) { receipt.fatal = 'no head posting key (secret absent + recovery unavailable) — nothing signed'; fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1)); console.log(JSON.stringify({ state: 'no-key', failSoft: true })); process.exit(0); }

  // byte-truth gate: derived BLT key must match the live posting authority
  const acc = (await rpc('condenser_api.get_accounts', [[HEAD]]))[0];
  if (!acc) throw new Error('head account unreadable');
  const pub = blurtPubOf(headWif);
  const ours = pub && (acc.posting.key_auths || []).some(k => k[0] === pub);
  receipt.keyCheck = { derivedPrefix: pub ? pub.slice(0, 8) : null, authorityMatch: !!ours, postingAuthCount: (acc.posting.key_auths || []).length };
  if (!ours) { receipt.fatal = 'BLT public key does not match headcorner posting authority — ABORT (nothing signed)'; fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1)); console.log(JSON.stringify({ state: 'key-mismatch', failSoft: true })); process.exit(0); }

  // Z-34: manabar-first canon — Z-33 proved beblurt's legacy voting_power field is
  // lazily stale (0 at 14:05Z, 9799 at 14:08Z); treasury-desk got the permanent fix,
  // this lane was missed. Standard regen math, blurt scale vests×1e6 (verified exact).
  const bp = f(acc.vesting_shares) + f(acc.received_vesting_shares) - f(acc.delegated_vesting_shares);
  let vp = f(acc.voting_power);
  if (acc.voting_manabar && acc.voting_manabar.current_mana != null && bp > 0) {
    const maxMana = bp * 1e6;
    const nowSec = Math.floor(Date.now() / 1000);
    const elapsed = Math.max(0, nowSec - (acc.voting_manabar.last_update_time || nowSec));
    const regen = maxMana * Math.min(elapsed, 432000) / 432000;
    vp = Math.min(10000, 10000 * Math.min(maxMana, f(acc.voting_manabar.current_mana) + regen) / maxMana);
  }
  receipt.vpMethod = (acc.voting_manabar && acc.voting_manabar.current_mana != null && bp > 0) ? 'manabar+regen' : 'legacy-fallback';
  receipt.vpBefore = +(vp / 100).toFixed(2);
  if (vp < VP_FLOOR) { receipt.summary = { op: 'SKIP-VP-FLOOR', vp: receipt.vpBefore }; fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1)); console.log(JSON.stringify({ state: 'skip-vp', vp: receipt.vpBefore })); process.exit(0); }

  // candidates: fresh, non-fleet, quality-gated, not yet voted
  const fleet = loadFleetNames();
  const seen = new Set();
  const candidates = [];
  for (const tag of TAGS) {
    let disc = [];
    try { disc = await rpc('condenser_api.get_discussions_by_created', [{ tag, limit: 20 }]); } catch (_) { continue; }
    for (const p of disc) {
      if (!p.author || fleet.has(p.author) || seen.has(p.author)) continue;
      const ageMin = (Date.now() - new Date(p.created + 'Z').getTime()) / 60000;
      if (ageMin < MIN_AGE_MIN || ageMin > MAX_AGE_MIN) continue;
      if ((p.active_votes || []).some(v => v.voter === HEAD)) continue;
      seen.add(p.author);
      candidates.push({ author: p.author, permlink: p.permlink, tag, ageMin: Math.round(ageMin) });
      if (candidates.length >= 30) break;
    }
    if (candidates.length >= 30) break;
    await sleep(250);
  }
  receipt.candidates = candidates.length;

  // reputation gate via batched get_accounts
  const reps = {};
  for (let i = 0; i < candidates.length; i += 30) {
    const chunk = [...new Set(candidates.slice(i, i + 30).map(c => c.author))];
    try {
      const rows = await rpc('condenser_api.get_accounts', [chunk]);
      for (const r of rows) reps[r.name] = repScore(r.reputation);
    } catch (_) {}
    await sleep(250);
  }

  // bounded voting with read-back
  let voted = 0;
  for (const c of candidates) {
    if (voted >= MAX_VOTES) break;
    if ((reps[c.author] || 0) < MIN_REP) continue;
    try {
      await signAndBroadcast(headWif, [['vote', { voter: HEAD, author: c.author, permlink: c.permlink, weight: VOTE_WEIGHT }]]);
      await sleep(1800);
      const back = await rpc('condenser_api.get_content', [c.author, c.permlink]);
      const ok = back && (back.active_votes || []).some(v => v.voter === HEAD);
      receipt.votes.push({ op: ok ? 'VOTED-VERIFIED' : 'VOTED-READBACK-PENDING', author: c.author, permlink: c.permlink.slice(0, 40), tag: c.tag, ageMin: c.ageMin, rep: reps[c.author] });
      voted++;
    } catch (e) { receipt.votes.push({ op: 'ERR', author: c.author, msg: String(e.message || e).slice(0, 80) }); }
    await sleep(VOTE_SPACING_MS);
  }
  receipt.summary = { voted, candidates: candidates.length, vpBefore: receipt.vpBefore, ms: Date.now() - t0 };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ state: 'ok', summary: receipt.summary }));
  process.exit(0);
})().catch(e => {
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), agent: 'blurt-curate', fatal: String(e.message || e).slice(0, 200) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
  process.exit(0);
});
