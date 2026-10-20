#!/usr/bin/env node
/**
 * economy-engine.mjs — Task 15-c + 16-a: the autonomous economy engine (steem + HIVE + BLURT
 * curation legs).
 *
 * Owner directive: "the simulated economy must become REAL step by step — many more trades,
 * many ways to inject liquidity, the network devices must run sovereign/autonomous/AUTOMATIC".
 *
 * This script is the daily autonomous engine. It runs inside a GitHub Actions runner (public
 * Domain repo workflow `economy-engine.yml`) that ALSO holds a private checkout of the `steem`
 * repo — the ONLY place key material lives (sealed custody). Nothing secret ever reaches Domain.
 *
 * Pipeline (fail-honest at every step — a failure exits nonzero so the workflow goes red):
 *   (a) read fleet truth from the private steem checkout (agent/lib/fleet-roster.cjs)
 *   (b) open the key seal IN-RUNNER per keys_zip_v2.cjs doctrine (AES-256-CBC, pbkdf2-300k,
 *       passphrase from committed custody metadata agent/recovery-meta.json — the passphrase is
 *       itself committed IN THE PRIVATE REPO by design: "זה אצלך בקבצים לא אצלי" Task 117p8).
 *       Sha gates: outer == keysZipSha256, inner == keysZipInnerSha256.
 *   (c) verify every account's posting authority LIVE against the chain before any broadcast
 *   (d) deterministically pick up to N quality candidate posts (niche allowlist, min length,
 *       likes/comment ratio, exclude our fleet + already-voted + recent-vote cooldown + Task 18
 *       AUTHORITATIVE voter-list dedupe: the candidate's own active_votes beats the ~100-op
 *       account-history window — an aged-out vote can no longer produce a doomed broadcast)
 *   (e) broadcast ONE 100% curation vote per account (curation = zero principal at risk;
 *       no funds move)
 *   (e2) CLAIM pending rewards for every verified account (posting-authorized op; dust
 *       threshold 0.001; nothing compounds unclaimed) — Task 17 revenue wave
 *   (e3) AUTHOR-SUPPORT: each verified account self-votes its own young low-traction post
 *       (≤24h old, ≤3 net votes, alreadyVoted gate, ≤1/account/run) at 100% — author rewards
 *       are the second income stream (Task 17; ENGINE_AUTHOR_SUPPORT=true by default)
 *   (f) read back the real txids from account history (steem-js exposes no txid — 14-c doctrine)
 *   (g) write a receipt JSON into the steem checkout (agent/receipts/)
 *   (h) optionally push the receipt (PUSH_RECEIPT=true; pull --rebase first, NEVER force)
 *   (i) print a SHAPE-ONLY summary (accounts, txids, counts — never any key material)
 *
 * Task 16-a — HIVE + BLURT legs (after the steem receipt, same run, same seal):
 *   · key path proven live 2026-10-02 (receipt steem:agent/receipts/2026-10-02-hive-blurt-first.json):
 *     ONE vault.json role-WIF body rules all three graphene chains (STM/STM/BLT pubkey prefix)
 *   · hive: steem-js signTransaction under the hive chain_id (anchor.cjs recipe) + synchronous
 *     broadcast + account-history read-back confirmed on ≥2 nodes
 *   · blurt: node-serialized canonical-ECDSA signing (anchor.cjs recipe, proven live 2026-09-06)
 *     + get_ops_in_block confirmation (rc_api absent on blurt — honest)
 *   · per-chain caps (≤12 votes/run/chain, 1/account, 10h cooldown, already-voted skip),
 *     per-chain roster gates (hive: 9/12 keyed rows; blurt: 11 economic rows, ynet retired),
 *     per-chain NEVER_TOUCH (ynet* everywhere, tov-hive blocked-no-key on hive)
 *   · Task 18 dedupe doctrine (live-proven 2026-10-02): pre-broadcast get_content gate +
 *     chain-as-gate identical-vote skip — a dedupe skip is a healthy no-op receipt row
 *     ('skipped-*'), never a run failure; only REAL broadcast failures fail the run
 *   · per-chain receipt: agent/receipts/<date>-economy-engine-{hive|blurt}[-dryrun].json
 *   · any leg failure = the run fails honestly (exit nonzero → red) AFTER both legs attempted
 *
 * Env knobs (all optional unless noted):
 *   STEEM_DIR      path to private steem checkout           (default: <cwd>/steem)
 *   STEEMJS_DIR    dir whose node_modules has steem@0.7.11  (default: <script dir>)
 *   DRY_RUN        'true' (default) = no broadcast, plan-only receipt
 *   ENGINE_MAX_VOTES     max accounts to vote this run     (default 12 — every healthy account)
 *   ENGINE_ACCOUNTS      comma override of account order   (default: rotation, then SP-weighted:
 *                        accounts sorted by EFFECTIVE vesting desc — the whale votes first)
 *   ENGINE_MIN_HOURS_BETWEEN_VOTES  account cooldown       (default 10 — 2h cadence safe; ~2.4 votes/day/account)
 *   ENGINE_AUTHOR_SUPPORT  'true' (default) = self-vote own young low-traction post, ≤1/account
 *   ENGINE_TAGS    comma override of niche tag allowlist
 *   PUSH_RECEIPT   'true' = git commit+push receipt into the steem repo
 *
 * HARD DISCIPLINE: never touch ynet* / tov-hive / owner-only rows (roster control flags are
 * enforced); never print or log any private material (public-key fingerprints only); no market
 * ops, no transfers, no comments — broadcast ops limited to VOTES, CLAIMS, AUTHOR-SUPPORT
 * self-votes (all posting-authorized, zero principal at risk; the ladder executor is a
 * separate tool with its own hard caps).
 */
'use strict';

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const STEEM_DIR = process.env.STEEM_DIR || path.join(process.cwd(), 'steem');
const STEEMJS_DIR = process.env.STEEMJS_DIR || SCRIPT_DIR;
const DRY_RUN = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true';
const PUSH_RECEIPT = String(process.env.PUSH_RECEIPT || 'false').toLowerCase() === 'true';
const MAX_VOTES = Math.max(1, Math.min(12, parseInt(process.env.ENGINE_MAX_VOTES || '12', 10)));
const MIN_HOURS_BETWEEN_VOTES = parseFloat(process.env.ENGINE_MIN_HOURS_BETWEEN_VOTES || '10');
const AUTHOR_SUPPORT = String(process.env.ENGINE_AUTHOR_SUPPORT || 'true').toLowerCase() === 'true';
const AUTHOR_SUPPORT_MAX_AGE_H = 24;   // self-vote only the account's own post younger than this
const AUTHOR_SUPPORT_MAX_NET_VOTES = 3; // ...and only while it still has ≤3 net votes
const CLAIM_MIN = 0.001;               // claim when ANY pending component ≥ this (dust floor)
const ACCOUNTS_OVERRIDE = (process.env.ENGINE_ACCOUNTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const TAG_OVERRIDE = (process.env.ENGINE_TAGS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const NICHE_TAGS = TAG_OVERRIDE.length ? TAG_OVERRIDE : [
  'opensource', 'linux', 'ubuntu', 'debian', 'python', 'programming', 'javascript',
  'technology', 'science', 'education', 'tutorial', 'software',
];
const RPCS = (process.env.ENGINE_RPC || 'https://api.steemit.com,https://api.justyy.com,https://steemapi.boylikegirl.wtf,https://steem.fans')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

// ─────────────────────────── STASIS circuit breaker (FATE-DEFENSE law #1) ───────────────────────────
// Emergence World Season 1/2 lesson (arXiv 2606.08367 / 2609.17320): societies hit tipping points
// and collapsed with no warning shot — "monitor and intervene" is too slow. Our answer is a
// MECHANICAL brake the engine itself obeys BEFORE any seal/broadcast: agents/STASIS.json
// {active:true} → STASIS-HALT, exit 0 (a healthy no-op, same family as skipped-identical-vote).
// The flag is a visible, auditable commit — never a hidden env kill.
try {
  const stasisPath = path.join(SCRIPT_DIR, '..', 'agents', 'STASIS.json');
  const stasis = JSON.parse(fs.readFileSync(stasisPath, 'utf8'));
  if (stasis && stasis.active === true) {
    console.log('STASIS-HALT ' + JSON.stringify({
      at: new Date().toISOString(), protocol: stasis.protocol || 'SAOS-FATE-DEFENSE-STASIS/1',
      reason: stasis.reason || 'unspecified', requestedBy: stasis.requestedBy || null,
      since: stasis.since || null, scope: stasis.scope || 'economy-engine (all legs)',
      note: 'healthy no-op — engine obeyed the mechanical circuit breaker before any key/seal/broadcast',
    }));
    process.exit(0);
  }
} catch (e) {
  if (e && e.code !== 'ENOENT') { console.log('[economy-engine] STASIS file unreadable (' + e.message + ') — failing open to normal operation; file is law, absence is not.'); }
}

/** Accounts we never touch, by name pattern (belt-and-braces on top of roster flags). */
const NEVER_TOUCH = [/^ynet/, /^tov-hive/];
const WEIGHT = 10000; // 100% — curation + author-support only, per doctrine
const MIN_BODY_CHARS = 500;
const MIN_TITLE_CHARS = 10;
const MIN_NET_VOTES = 3;
const MAX_CHILDREN = 100;
const MIN_LIKES_PER_COMMENT = 0.5;   // effectivelikes/comment ratio floor
const MIN_AUTHOR_REP = 45;           // spam guard
const MAX_POST_AGE_DAYS = 6;         // leave the payout window margin (7d)
const NODES_FOR_READBACK = 4;

const nowIso = () => new Date().toISOString();
const fp = (pub) => (pub && pub.length > 12 ? pub.slice(0, 8) + '…' + pub.slice(-4) : '??');
function die(msg) { console.error('ENGINE-FAIL: ' + msg); process.exit(1); }
function log(msg) { console.log('[economy-engine] ' + msg); }

// ─────────────────────────── steem-js (CJS via createRequire) ───────────────────────────
const reqSteem = createRequire(path.join(STEEMJS_DIR, 'engine-require-base.js'));
let steem;
try { steem = reqSteem('steem'); } catch (e) { die('steem-js not resolvable from STEEMJS_DIR=' + STEEMJS_DIR + ' (' + e.message + ')'); }
steem.api.setOptions({ url: RPCS[0] }); // broadcast signs locally; any condenser node relays it

// ─────────────────────────── roster (fleet truth, zero secrets) ───────────────────────────
const reqSteemRepo = createRequire(path.join(STEEM_DIR, 'roster-require-base.js'));
let rosterMod;
try { rosterMod = reqSteemRepo(path.join(STEEM_DIR, 'agent', 'lib', 'fleet-roster.cjs')); } catch (e) {
  die('fleet-roster.cjs not loadable from STEEM_DIR (commit exists? ' + e.message + ')');
}
const fleet = rosterMod.roster();
const fleetRows = rosterMod.rows().filter((r) => r.chain === 'steem');
log('fleet truth: source=' + fleet.source + ' accounts=' + fleet.accounts.length + ' activeFleet=' + fleet.activeFleet);

/** steem rows the fleet doctrine allows for economic use. */
const ALLOWED_ROW_NAMES = new Set(
  fleetRows.filter((r) => r.control === 'full' && r.economicUse === true).map((r) => (r.account || '').toLowerCase())
);
if (ALLOWED_ROW_NAMES.size === 0) die('roster grants zero full-control steem rows — refusing to operate');

// ─────────────────────────── condenser JSON-RPC with fallback ───────────────────────────
let rpcIdx = 0;
async function rpc(body) {
  let lastErr = null;
  for (let attempt = 0; attempt < RPCS.length * 2; attempt++) {
    const url = RPCS[rpcIdx % RPCS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (j.error) throw new Error('rpc-error: ' + (j.error.message || JSON.stringify(j.error)).slice(0, 120));
      // advance the rotating cursor so the next call starts on a healthy node
      rpcIdx = (rpcIdx + 1) % RPCS.length;
      return j.result;
    } catch (e) {
      lastErr = e;
      rpcIdx = (rpcIdx + 1) % RPCS.length;
    }
  }
  throw new Error('all RPC nodes failed (' + (lastErr && lastErr.message) + ')');
}
const condenser = (method, params) => rpc({ jsonrpc: '2.0', id: 1, method: 'condenser_api.' + method, params });

// ─────────────────────────── Task 16-a: HIVE + BLURT legs — shared chain plumbing ───────────────────────────
// Key path (proven live 2026-10-02, receipt steem:agent/receipts/2026-10-02-hive-blurt-first.json):
// ONE vault.json role-WIF body rules all three graphene chains — steem/hive use the STM pubkey
// prefix, blurt uses BLT; the base58 body (and therefore every signature) is identical. The same
// seal → resolvePostingWif material therefore signs votes on all three chains, after a per-chain
// LIVE posting-authority match.
const HIVE_RPCS = (process.env.ENGINE_HIVE_RPC || 'https://api.hive.blog,https://api.openhive.network,https://api.deathwing.me,https://anyx.io')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const BLURT_RPCS = (process.env.ENGINE_BLURT_RPC || 'https://rpc.beblurt.com,https://rpc.blurt.blog')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const HIVE_CHAIN_ID = 'beeab0de00000000000000000000000000000000000000000000000000000000';
const BLURT_CHAIN_ID = 'cd8d90f29ae273abec3eaa7731e25934c63eb654d55080caff2ebb7f5df6381f'; // @blurtfoundation/blurtjs config.json (anchor.cjs recipe, proven live 2026-09-06)
const HIVE_TAGS = (process.env.ENGINE_TAGS_HIVE || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const BLURT_TAGS = (process.env.ENGINE_TAGS_BLURT || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const DEFAULT_HIVE_TAGS = ['opensource', 'linux', 'ubuntu', 'debian', 'python', 'programming', 'javascript', 'technology', 'science', 'education', 'tutorial', 'software'];
const DEFAULT_BLURT_TAGS = ['life', 'photography', 'nature', 'story', 'blog', 'food'];
// blurt calibration (measured 2026-10-02): discussion objects omit net_votes + author_reputation
// and rc_api is ABSENT on blurt nodes → netVotes derives from active_votes, the rep gate is
// skipped, ≥1 positive upvote still required, RC budgeting is not possible (honestly documented).
const BLURT_GATES = { minNetVotes: 1, repGate: false };

/** Generic rotating-node JSON-RPC (same shape as rpc() above, parameterized by node list). */
async function rpcAt(nodes, body) {
  let lastErr = null;
  for (let attempt = 0; attempt < nodes.length * 2; attempt++) {
    const url = nodes[attempt % nodes.length];
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (j.error) throw new Error('rpc-error: ' + (j.error.message || JSON.stringify(j.error)).slice(0, 120));
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw new Error('all RPC nodes failed (' + (lastErr && lastErr.message) + ')');
}
const condAt = (nodes, method, params) => rpcAt(nodes, { jsonrpc: '2.0', id: 1, method: 'condenser_api.' + method, params });

// ECDSA for blurt (ecurve/bigi ship inside steem@0.7.11 deps — resolved from the same base).
// Math ported verbatim from steem:agent/identity.cjs (proven live: the 2026-09-06 blurt anchor).
const reqChain = createRequire(path.join(STEEMJS_DIR, 'engine-require-base.js'));
let ecurve = null, bigi = null;
try { ecurve = reqChain('ecurve'); bigi = reqChain('bigi'); } catch (_) { /* blurt leg dies honestly if reached without these */ }
const SECP = ecurve ? ecurve.getCurveByName('secp256k1') : null;
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function wifToScalar(wif) {
  let num = bigi.ZERO;
  for (const ch of wif) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('bad base58 char');
    num = num.multiply(bigi.valueOf(58)).add(bigi.valueOf(idx));
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let raw = Buffer.from(hex, 'hex');
  let pad = 0;
  for (const ch of wif) { if (ch === '1') pad++; else break; }
  raw = Buffer.concat([Buffer.alloc(pad), raw]);
  const bodyBuf = raw.subarray(0, raw.length - 4);
  const expect = crypto.createHash('sha256').update(crypto.createHash('sha256').update(bodyBuf).digest()).digest().subarray(0, 4);
  if (!raw.subarray(raw.length - 4).equals(expect)) throw new Error('WIF checksum mismatch');
  if (bodyBuf[0] !== 0x80) throw new Error('not a mainnet WIF prefix');
  return bigi.fromBuffer(bodyBuf.subarray(1, 33));
}
function ecdsaSignLowS(h, dBig) {
  const N = SECP.n;
  const hB = h instanceof bigi ? h : bigi.fromBuffer(h);
  for (let t = 0; t < 64; t++) {
    const k = bigi.fromBuffer(crypto.randomBytes(32)).mod(N);
    if (k.signum() === 0) continue;
    const R = SECP.G.multiply(k);
    const r = R.affineX.mod(N);
    if (r.signum() === 0) continue;
    let s = k.modInverse(N).multiply(hB.add(r.multiply(dBig))).mod(N);
    if (s.signum() === 0) continue;
    let recid = (R.affineY.testBit(0) ? 1 : 0) | (R.affineX.compareTo(N) >= 0 ? 2 : 0);
    if (s.compareTo(N.shiftRight(1)) > 0) { s = N.subtract(s); recid ^= 1; }
    return { r, s, recid };
  }
  throw new Error('ecdsa sign failed after 64 tries');
}
function ecdsaRecover(h, rBig, sBig, recid) {
  const N = SECP.n;
  const hB = h instanceof bigi ? h : bigi.fromBuffer(h);
  const x = rBig.add(N.multiply(bigi.valueOf(recid >> 1)));
  if (x.compareTo(SECP.p) >= 0) return null;
  const alpha = x.multiply(x).multiply(x).add(SECP.a.multiply(x)).add(SECP.b).mod(SECP.p);
  let beta = alpha.modPow(SECP.p.add(bigi.ONE).divide(bigi.valueOf(4)), SECP.p);
  if (beta.testBit(0) !== ((recid & 1) === 1)) beta = SECP.p.subtract(beta);
  const R = new ecurve.Point(SECP, x, beta, bigi.ONE);
  const rInv = rBig.modInverse(N);
  const hNeg = N.subtract(hB.mod(N)).mod(N);
  return R.multiply(sBig).add(SECP.G.multiply(hNeg)).multiply(rInv);
}

// ─────────────────────────── (b) seal → posting keys (in-runner only) ───────────────────────────
/** Opens the committed key seal inside a 0700 temp dir. Returns { wifByAccount, materialDir, openedAt }. */
function openSeal() {
  const metaPath = path.join(STEEM_DIR, 'agent', 'recovery-meta.json');
  if (!fs.existsSync(metaPath)) die('custody metadata absent in private checkout: agent/recovery-meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.keysZipPass || !meta.keysZipFile || !meta.keysZipSha256) die('custody metadata incomplete (keysZip*)');
  const sealPath = path.join(STEEM_DIR, meta.keysZipFile);
  if (!fs.existsSync(sealPath)) die('seal absent: ' + meta.keysZipFile);

  const outerSha = crypto.createHash('sha256').update(fs.readFileSync(sealPath)).digest('hex');
  if (outerSha !== meta.keysZipSha256) die('seal outer sha256 MISMATCH vs custody metadata — refusing');
  if (!meta.keysZipInnerSha256) die('custody metadata missing keysZipInnerSha256');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'econ-seal-'));
  fs.chmodSync(work, 0o700);
  const innerZip = path.join(work, 'inner.zip');
  execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', sealPath, '-out', innerZip, '-pass', 'env:ECON_ZP'], {
    stdio: 'pipe', env: { ...process.env, ECON_ZP: meta.keysZipPass },
  });
  const head = fs.readFileSync(innerZip).subarray(0, 2).toString('latin1');
  if (head !== 'PK') die('decrypted payload is not a zip (PK header missing) — seal/custody mismatch');
  const innerSha = crypto.createHash('sha256').update(fs.readFileSync(innerZip)).digest('hex');
  if (innerSha !== meta.keysZipInnerSha256) die('seal inner sha256 MISMATCH vs custody metadata — refusing');
  execFileSync('unzip', ['-q', '-o', innerZip, '-d', work], { stdio: 'pipe' });
  fs.rmSync(innerZip, { force: true }); // no plaintext archive lingering

  const vaultPath = path.join(work, 'agent', 'keys', 'vault.json');
  if (!fs.existsSync(vaultPath)) die('materialized vault.json absent from seal — cannot operate');
  const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));

  // soldiers: {role:{wif}} shape; the head (revived 09-29): chain-keyed {steem:{role:{wif}}} shape
  const wifByAccount = {};
  for (const a of vault.accounts || []) {
    const k = a.keys || {};
    const posting = (k.posting && k.posting.wif) || (k.steem && k.steem.posting && k.steem.posting.wif) || null;
    if (posting) wifByAccount[(a.username || '').toLowerCase()] = posting;
  }

  // doctrine fallback for the head: 2018 sheet oracle (13-a proved exactly one line matches live)
  const sheetPath = path.join(work, 'agent', 'keys', 'hed-soldiers-source.txt');
  const sheetLines = fs.existsSync(sheetPath)
    ? fs.readFileSync(sheetPath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l.length >= 20)
    : [];

  const openedAt = nowIso();
  return { wifByAccount, sheetLines, work, openedAt, outerShaOk: true, innerShaOk: true };
}

/** Resolve posting WIF for an account: vault first, then the 2018-sheet oracle (head). */
function resolvePostingWif(account, seal, chainAuths) {
  const vaultWif = seal.wifByAccount[account];
  const livePubs = chainAuths.map((x) => x.toLowerCase());
  if (vaultWif) {
    try {
      const pub = steem.auth.wifToPublic(vaultWif);
      if (livePubs.includes(pub.toLowerCase())) return { wif: vaultWif, source: 'vault', pub };
    } catch (_) { /* fall through to oracle */ }
  }
  for (let i = 0; i < seal.sheetLines.length; i++) {
    try {
      const wif = steem.auth.getPrivateKeys(account, seal.sheetLines[i], ['posting']).posting;
      const pub = steem.auth.wifToPublic(wif);
      if (livePubs.includes(pub.toLowerCase())) return { wif, source: 'sheet:line' + (i + 1), pub };
    } catch (_) { /* try next line */ }
  }
  return null;
}

// ─────────────────────────── (c) live posting-auth verification + health ───────────────────────────
function repFromRaw(raw) {
  const r = Number(raw);
  if (!isFinite(r) || r <= 0) return 25;
  return Math.max(25, Math.round((Math.log10(r) - 9) * 9 + 25));
}

async function verifyAccounts(candidates) {
  const props = await condenser('get_dynamic_global_properties', []);
  const headTime = Date.parse(props.time);
  const out = [];
  for (const name of candidates) {
    if (NEVER_TOUCH.some((re) => re.test(name))) { out.push({ account: name, verdict: 'skip-never-touch' }); continue; }
    if (!ALLOWED_ROW_NAMES.has(name)) { out.push({ account: name, verdict: 'skip-roster-not-full-control' }); continue; }
    const accs = await condenser('get_accounts', [[name]]);
    const acc = accs && accs[0];
    if (!acc) { out.push({ account: name, verdict: 'skip-account-missing' }); continue; }
    const pubKeys = (acc.posting && acc.posting.key_auths ? acc.posting.key_auths : []).map((k) => k[0]);
    const resolved = resolvePostingWif(name, seal, pubKeys);
    if (!resolved) { out.push({ account: name, verdict: 'skip-no-posting-key-matches-live-auth' }); continue; }
    // voting manabar (max = 10 × vests-micros, regen over 5 days — steem source semantics)
    const vestsMicros = Math.round(parseFloat(acc.vesting_shares) * 1e6);
    const maxMana = 10 * vestsMicros;
    const vm = acc.voting_manabar || { current_mana: 0, last_update_time: 0 };
    const elapsed = Math.max(0, headTime / 1000 - Number(vm.last_update_time || 0));
    const vpMana = Math.min(maxMana, Number(vm.current_mana || 0) + maxMana * (elapsed / 432000));
    const vpPct = maxMana > 0 ? (vpMana / maxMana) * 100 : 0;
    const effVests =
      parseFloat(acc.vesting_shares) -
      parseFloat(acc.delegated_vesting_shares || '0') +
      parseFloat(acc.received_vesting_shares || '0');
    out.push({
      account: name,
      verdict: 'ok',
      pubFp: fp(resolved.pub),
      keySource: resolved.source,
      vpPct: Math.round(vpPct * 100) / 100,
      rep: repFromRaw(acc.reputation),
      effVests: Math.round(effVests), // Task 17: whale-first ordering weight
    });
  }
  return out;
}

// ─────────────────────────── (d) deterministic candidate selection ───────────────────────────
/** Vote history via get_account_history — condenser retired get_account_votes ("no longer
 *  supported" on api.steemit.com + api.justyy.com, verified live 2026-10-02), so the cooldown
 *  and already-voted gates read real vote ops from account history instead. FAIL-HONEST:
 *  throws on total node failure and the caller must exclude the account from broadcasting —
 *  an unreadable history must never default to "never voted". Normalized {authorperm,weight,time}. */
async function accountVoteHistory(name) {
  let lastErr = null;
  // condenser nodes cap get_account_history at 100 (verified live 2026-10-02 on api.steemit.com +
  // api.justyy.com: "upper limit is 100") — try 100 first, larger windows only if a node allows
  for (const size of [100, 200, 500]) {
    try {
      const hist = await condenser('get_account_history', [name, -1, size]);
      if (!Array.isArray(hist)) throw new Error('non-array account history');
      const votes = [];
      for (const entry of hist) {
        const ev = entry && entry[1];
        if (!ev || !ev.op || ev.op[0] !== 'vote') continue;
        const v = ev.op[1] || {};
        if ((v.voter || '').toLowerCase() !== name) continue;
        votes.push({ authorperm: (v.author || '').toLowerCase() + '/' + v.permlink, weight: Number(v.weight), time: ev.timestamp });
      }
      return votes;
    } catch (e) { lastErr = e; }
  }
  throw new Error('account history unreadable on all nodes (' + (lastErr && lastErr.message) + ')');
}

/** Content-farm detector: production-line authors publish near-daily at fixed times.
 *  Returns posts the author made in the last 96h (from their own blog feed); -1 = probe failed. */
async function authorRecentPostCount(author) {
  try {
    const blog = await condenser('get_discussions_by_blog', [{ tag: author, limit: 10 }]);
    const own = (blog || []).filter((x) => (x.author || '').toLowerCase() === author.toLowerCase());
    return own.filter((x) => Date.parse(x.created) > Date.now() - 96 * 3600 * 1000).length;
  } catch (_) { return -1; }
}

async function fetchCandidatePool() {
  const props = await condenser('get_dynamic_global_properties', []);
  const headMs = Date.parse(props.time);
  const seen = new Map();
  for (const tag of NICHE_TAGS) {
    for (const sort of ['get_discussions_by_created', 'get_discussions_by_hot']) {
      try {
        const posts = await condenser(sort, [{ tag, limit: 20 }]);
        for (const p of posts || []) {
          if (!p || seen.has(p.author + '/' + p.permlink)) continue;
          seen.set(p.author + '/' + p.permlink, p);
        }
      } catch (_) { /* a niche tag failing on one node must not kill the cycle */ }
    }
  }
  const fleetSet = new Set(fleet.accounts.map((a) => a.toLowerCase()));
  const pool = [];
  for (const [authorperm, p] of seen) {
    if (p.depth !== 0) continue;
    const author = (p.author || '').toLowerCase();
    if (fleetSet.has(author)) continue;
    if (NEVER_TOUCH.some((re) => re.test(author))) continue;
    const ageDays = (headMs - Date.parse(p.created)) / 86400000;
    if (!(ageDays >= 0 && ageDays <= MAX_POST_AGE_DAYS)) continue;
    if ((p.title || '').length < MIN_TITLE_CHARS) continue;
    const bodyChars = Number(p.body_length || (p.body || '').length);
    if (bodyChars < MIN_BODY_CHARS) continue;
    // steem nodes stopped returning net_votes — derive effectivelikes from active_votes weights
    const av = Array.isArray(p.active_votes) ? p.active_votes : [];
    const posVotes = av.filter((v) => Number(v.percent) > 0).length;
    const netVotes = Number.isFinite(Number(p.net_votes)) ? Number(p.net_votes) : posVotes;
    // Task 18: carry the post's OWN voter list — the authoritative already-voted truth at plan
    // time (account-history gates read the last ~100 ops and can age out older votes → the chain
    // then rejects an identical re-vote: Assert itr->vote_percent != o.weight, seen live 18:34Z +
    // 20:28Z 2026-10-02). Zero extra RPC — av is already in hand.
    const voters = new Set(av.map((v) => (v.voter || '').toLowerCase()));
    if (netVotes < MIN_NET_VOTES) continue;
    const children = Number(p.children || 0);
    if (children > MAX_CHILDREN) continue;
    if (netVotes / Math.max(children, 1) < MIN_LIKES_PER_COMMENT) continue;
    if (repFromRaw(p.author_reputation) < MIN_AUTHOR_REP) continue;
    const payoutAt = Date.parse(p.cashout_time || p.created);
    if (!(payoutAt > headMs + 12 * 3600 * 1000)) continue; // still inside the payout window
    pool.push({
      author: p.author,
      permlink: p.permlink,
      authorperm,
      titleShape: (p.title || '').slice(0, 60) + ((p.title || '').length > 60 ? '…' : ''),
      niche: p.category || '',
      ageDays: Math.round(ageDays * 10) / 10,
      netVotes,
      children,
      bodyChars,
      voters,
    });
  }
  // deterministic order: underserved quality first (fewest effective likes), then freshest, then permlink asc
  pool.sort((x, y) => (x.netVotes - y.netVotes) || (y.ageDays - x.ageDays) || (x.authorperm < y.authorperm ? -1 : 1));
  return pool;
}

// ─────────────────────────── (e) broadcast ───────────────────────────
function broadcastVote(wif, voter, author, permlink, weight) {
  return new Promise((resolve, reject) => {
    steem.broadcast.vote(wif, voter, author, permlink, weight, (err, result) => {
      if (err) reject(err); else resolve(result);
    });
  });
}

/** STEEM claim_reward_balance — posting-authorized (op schema probed live 2026-10-02:
 *  {account, reward_steem, reward_sbd, reward_vesting_shares}). */
function broadcastClaimSteem(wif, account, r) {
  return new Promise((resolve, reject) => {
    steem.broadcast.claimRewardBalance(wif, account, r.liquid, r.debt, r.vesting, (err, result) => {
      if (err) reject(err); else resolve(result);
    });
  });
}

/** Best-effort steem claim read-back (account-history; indexing lag = honest null). */
async function readBackClaim(account) {
  try {
    const hist = await condenser('get_account_history', [account, -1, 50]);
    for (let i = (hist || []).length - 1; i >= 0; i--) {
      const ev = hist[i] && hist[i][1];
      if (ev && ev.op && ev.op[0] === 'claim_reward_balance') return { txid: ev.trx_id, block: ev.block };
    }
  } catch (_) { /* honest null */ }
  return null;
}

// ─────────────────────────── (f) txid read-back from account history ───────────────────────────
async function readBackTxid(voter, author, permlink) {
  // account-history indexing can lag a relaying node by tens of seconds — keep probing
  for (const attempt of [1, 2, 3, 4, 5, 6]) {
    try {
      const hist = await condenser('get_account_history', [voter, -1, 100]); // nodes cap this call at 100
      for (let i = (hist || []).length - 1; i >= 0; i--) {
        const entry = hist[i];
        const ev = entry && entry[1];
        if (!ev || !ev.op || ev.op[0] !== 'vote') continue;
        const v = ev.op[1] || {};
        if ((v.voter || '').toLowerCase() === voter && (v.author || '').toLowerCase() === author.toLowerCase() && v.permlink === permlink) {
          return { txid: ev.trx_id, block: ev.block, histIndex: entry[0] };
        }
      }
    } catch (_) { /* rotate to next node implicitly */ }
    await new Promise((r) => setTimeout(r, attempt * 5000));
  }
  return null;
}

// ─────────────────────────── (h) receipt push (rebase-first, never force) ───────────────────────────
function pushReceipt(receiptPath, commitMsg) {
  const rel = path.relative(STEEM_DIR, receiptPath);
  execFileSync('git', ['add', rel], { cwd: STEEM_DIR, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', commitMsg], { cwd: STEEM_DIR, stdio: 'pipe' });
  execFileSync('git', ['pull', '--rebase', 'origin', 'main'], { cwd: STEEM_DIR, stdio: 'pipe' });
  execFileSync('git', ['push', 'origin', 'main'], { cwd: STEEM_DIR, stdio: 'pipe' });
}

// ═══════════════════════ Task 16-a: the generic curation leg (hive / blurt) ═══════════════════════
// Same discipline as the steem leg, per chain: live-auth verify → deterministic quality
// candidates (niche tags, min length, engagement, fleet+already-voted+cooldown+farm-cadence
// gates) → ≤5 votes of 100% from distinct keyed accounts → txid read-back → receipt pushed
// rebase-first. Per-chain caps and per-chain NEVER_TOUCH lists. Fail-honest at every step.

/** Vote history via get_account_history on a given node list (same gates/fail-honest as steem). */
async function accountVoteHistoryAt(nodes, name) {
  let lastErr = null;
  for (const size of [100, 200, 500]) {
    try {
      const hist = await condAt(nodes, 'get_account_history', [name, -1, size]);
      if (!Array.isArray(hist)) throw new Error('non-array account history');
      const votes = [];
      for (const entry of hist) {
        const ev = entry && entry[1];
        if (!ev || !ev.op || ev.op[0] !== 'vote') continue;
        const v = ev.op[1] || {};
        if ((v.voter || '').toLowerCase() !== name) continue;
        votes.push({ authorperm: (v.author || '').toLowerCase() + '/' + v.permlink, weight: Number(v.weight), time: ev.timestamp });
      }
      return votes;
    } catch (e) { lastErr = e; }
  }
  throw new Error('account history unreadable on all nodes (' + (lastErr && lastErr.message) + ')');
}

/** Content-farm detector on a given node list (≥4 own posts in 96h = production line). */
async function authorRecentPostCountAt(nodes, author) {
  try {
    const blog = await condAt(nodes, 'get_discussions_by_blog', [{ tag: author, limit: 10 }]);
    const own = (blog || []).filter((x) => (x.author || '').toLowerCase() === author.toLowerCase());
    return own.filter((x) => Date.parse(x.created + (x.created && x.created.endsWith('Z') ? '' : 'Z')) > Date.now() - 96 * 3600 * 1000).length;
  } catch (_) { return -1; }
}

/** Candidate pool on a given node list + per-chain gates. */
async function fetchCandidatePoolAt(nodes, tags, gates) {
  const dgp = await condAt(nodes, 'get_dynamic_global_properties', []);
  const headMs = Date.parse(dgp.time + (dgp.time.endsWith('Z') ? '' : 'Z'));
  const seen = new Map();
  for (const tag of tags) {
    for (const sort of ['get_discussions_by_created', 'get_discussions_by_hot']) {
      try {
        const posts = await condAt(nodes, sort, [{ tag, limit: 20 }]);
        for (const p of posts || []) {
          if (!p || seen.has(p.author + '/' + p.permlink)) continue;
          seen.set(p.author + '/' + p.permlink, p);
        }
      } catch (_) { /* a niche tag failing on one node must not kill the cycle */ }
    }
  }
  const fleetSet = new Set(fleet.accounts.map((a) => a.toLowerCase()));
  const pool = [];
  for (const [authorperm, p] of seen) {
    if (p.depth !== 0) continue;
    const author = (p.author || '').toLowerCase();
    if (fleetSet.has(author)) continue;
    if (NEVER_TOUCH.some((re) => re.test(author))) continue;
    const ageDays = (headMs - Date.parse(p.created + (p.created && p.created.endsWith('Z') ? '' : 'Z'))) / 86400000;
    if (!(ageDays >= 0 && ageDays <= MAX_POST_AGE_DAYS)) continue;
    if ((p.title || '').length < MIN_TITLE_CHARS) continue;
    const bodyChars = Number(p.body_length || (p.body || '').length);
    if (bodyChars < MIN_BODY_CHARS) continue;
    const av = Array.isArray(p.active_votes) ? p.active_votes : [];
    const posVotes = av.filter((v) => Number(v.percent) > 0).length;
    const netVotes = Number.isFinite(Number(p.net_votes)) ? Number(p.net_votes) : posVotes;
    // Task 18: same authoritative voter set as the steem pool (see note there)
    const voters = new Set(av.map((v) => (v.voter || '').toLowerCase()));
    if (netVotes < (gates.minNetVotes ?? MIN_NET_VOTES)) continue;
    const children = Number(p.children || 0);
    if (children > MAX_CHILDREN) continue;
    if (netVotes / Math.max(children, 1) < MIN_LIKES_PER_COMMENT) continue;
    if (gates.repGate !== false && repFromRaw(p.author_reputation) < MIN_AUTHOR_REP) continue;
    const payoutAt = Date.parse(p.cashout_time || p.created);
    if (!(payoutAt > headMs + 12 * 3600 * 1000)) continue;
    pool.push({
      author: p.author, permlink: p.permlink, authorperm,
      titleShape: (p.title || '').slice(0, 60) + ((p.title || '').length > 60 ? '…' : ''),
      niche: p.category || '', ageDays: Math.round(ageDays * 10) / 10,
      netVotes, children, bodyChars, voters,
    });
  }
  pool.sort((x, y) => (x.netVotes - y.netVotes) || (y.ageDays - x.ageDays) || (x.authorperm < y.authorperm ? -1 : 1));
  return pool;
}

/** HIVE broadcast (generic ops): graphene tx build + steem-js signTransaction under the HIVE
 *  chain_id (anchor.cjs grapheneBroadcast recipe — proven live) + synchronous broadcast. */
async function broadcastHiveOps(wif, operations) {
  const dgp = await condAt(HIVE_RPCS, 'get_dynamic_global_properties', []);
  const tx = {
    ref_block_num: dgp.head_block_number & 0xffff,
    ref_block_prefix: Buffer.from(dgp.head_block_id, 'hex').readUInt32LE(4),
    expiration: new Date(new Date(dgp.time + (dgp.time.endsWith('Z') ? '' : 'Z')).getTime() + 60000).toISOString().slice(0, 19),
    operations,
    extensions: [],
  };
  const prev = steem.config.get('chain_id');
  steem.config.set('chain_id', HIVE_CHAIN_ID);
  let signed;
  try { signed = steem.auth.signTransaction(tx, [wif]); } finally { steem.config.set('chain_id', prev); }
  const res = await condAt(HIVE_RPCS, 'broadcast_transaction_synchronous', [signed]);
  return { txid: (res && (res.id || res.trx_id)) || null, block: (res && res.block_num) || null, method: 'condenser_api.broadcast_transaction_synchronous (steem-js signTransaction, hive chain_id)' };
}

function broadcastVoteHive(wif, voter, author, permlink) {
  return broadcastHiveOps(wif, [['vote', { voter, author, permlink, weight: WEIGHT }]]);
}

/** HIVE claim — op schema {account, reward_hive, reward_hbd, reward_vesting_shares}
 *  (probed live 2026-10-02 via get_transaction_hex serialization). */
function broadcastHiveClaim(wif, account, r) {
  return broadcastHiveOps(wif, [['claim_reward_balance', { account, reward_hive: r.liquid, reward_hbd: r.debt, reward_vesting_shares: r.vesting }]]);
}

/** BLURT broadcast (generic ops): node-serialized + manually signed (anchor.cjs blurtBroadcast
 *  recipe — blurt renumbers ops vs steem-js, so the NODE serializes; digest = sha256(chain_id ‖
 *  bytes); canonical low-s ECDSA with header = 31 + recid; self-verify by recovery first). */
async function broadcastBlurtOps(wif, operations) {
  const dgp = await condAt(BLURT_RPCS, 'get_dynamic_global_properties', []);
  const tx = {
    ref_block_num: dgp.head_block_number & 0xffff,
    ref_block_prefix: Buffer.from(dgp.head_block_id, 'hex').readUInt32LE(4),
    expiration: new Date(new Date(dgp.time + (dgp.time.endsWith('Z') ? '' : 'Z')).getTime() + 60000).toISOString().slice(0, 19),
    operations,
    extensions: [],
  };
  const nodeHex = await condAt(BLURT_RPCS, 'get_transaction_hex', [tx]);
  const nb = Buffer.from(nodeHex, 'hex');
  if (nb[nb.length - 1] !== 0x00 || nb[nb.length - 2] !== 0x00) throw new Error('unexpected node serialization tail');
  const txBytes = nb.subarray(0, nb.length - 1); // strip trailing signatures-vector count (unsigned)
  const digest = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(BLURT_CHAIN_ID, 'hex'), txBytes])).digest();
  const d = wifToScalar(wif);
  let sig = null;
  for (let i = 0; i < 64; i++) {
    const cand = ecdsaSignLowS(digest, d);
    const rb = cand.r.toBuffer(32), sb = cand.s.toBuffer(32);
    if (rb[0] !== 0x00 && rb[0] < 0x80 && sb[0] !== 0x00 && sb[0] < 0x80) { sig = cand; break; }
  }
  if (!sig) throw new Error('blurt canonical signature not found in 64 tries');
  const point = SECP.G.multiply(d);
  const rec = ecdsaRecover(digest, sig.r, sig.s, sig.recid);
  if (!rec || rec.getEncoded(true).toString('hex') !== point.getEncoded(true).toString('hex')) {
    throw new Error('blurt self-verify failed — not broadcasting');
  }
  const sigHex = Buffer.concat([Buffer.from([31 + sig.recid]), sig.r.toBuffer(32), sig.s.toBuffer(32)]).toString('hex');
  const res = await condAt(BLURT_RPCS, 'broadcast_transaction_synchronous', [{ ...tx, signatures: [sigHex] }]);
  return { txid: (res && (res.id || res.trx_id)) || null, block: (res && (res.block_num || res.trx_block_num)) || null, method: 'node-serialized canonical-ECDSA + condenser_api.broadcast_transaction_synchronous (anchor.cjs recipe, proven 2026-09-06)' };
}

function broadcastVoteBlurt(wif, voter, author, permlink) {
  return broadcastBlurtOps(wif, [['vote', { voter, author, permlink, weight: WEIGHT }]]);
}

/** BLURT claim — op schema {account, reward_blurt, reward_vesting_shares} (NO debt asset on
 *  blurt; probed live 2026-10-02: 3-field steem-style op REJECTED, 2-field op serializes). */
function broadcastBlurtClaim(wif, account, r) {
  return broadcastBlurtOps(wif, [['claim_reward_balance', { account, reward_blurt: r.liquid, reward_vesting_shares: r.vesting }]]);
}

// ─────────────────── Task 17 revenue wave: claims + author-support (all chains) ───────────────────
/** Pending-reward shape from a condenser account row (per-chain field names verified live
 *  2026-10-02: steem reward_steem_balance/reward_sbd_balance/reward_vesting_shares;
 *  hive reward_hive_balance/reward_hbd_balance/reward_vesting_balance; blurt
 *  reward_blurt_balance/reward_vesting_balance — no debt asset). Op fields differ from the
 *  account-row fields; the broadcast wrappers own that mapping. */
function pendingRewards(chain, acc) {
  if (chain === 'steem') {
    return {
      liquid: parseFloat(acc.reward_steem_balance) > 0 ? String(acc.reward_steem_balance) : '0.000 STEEM',
      debt: parseFloat(acc.reward_sbd_balance) > 0 ? String(acc.reward_sbd_balance) : '0.000 SBD',
      vesting: parseFloat(acc.reward_vesting_shares) > 0 ? String(acc.reward_vesting_shares) : '0.000000 VESTS',
    };
  }
  if (chain === 'hive') {
    return {
      liquid: parseFloat(acc.reward_hive_balance) > 0 ? String(acc.reward_hive_balance) : '0.000 HIVE',
      debt: parseFloat(acc.reward_hbd_balance) > 0 ? String(acc.reward_hbd_balance) : '0.000 HBD',
      vesting: parseFloat(acc.reward_vesting_balance) > 0 ? String(acc.reward_vesting_balance) : '0.000000 VESTS',
    };
  }
  return { // blurt — no debt asset
    liquid: parseFloat(acc.reward_blurt_balance) > 0 ? String(acc.reward_blurt_balance) : '0.000 BLURT',
    debt: null,
    vesting: parseFloat(acc.reward_vesting_balance) > 0 ? String(acc.reward_vesting_balance) : '0.000000 VESTS',
  };
}

function hasPending(r) {
  const n = (s) => parseFloat(s) || 0;
  return !!r && (n(r.liquid) >= CLAIM_MIN || n(r.debt || '0') >= CLAIM_MIN || n(r.vesting) >= CLAIM_MIN);
}

/** Per-chain claim broadcast dispatch (steem reads its txid back from account-history). */
const CHAIN_CLAIM = {
  steem: async (wif, account, r) => {
    await broadcastClaimSteem(wif, account, r);
    const rb = await readBackClaim(account);
    return { txid: rb ? rb.txid : null, block: rb ? rb.block : null, method: 'steem.broadcast.claimRewardBalance + account-history read-back' };
  },
  hive: (wif, account, r) => broadcastHiveClaim(wif, account, r),
  blurt: (wif, account, r) => broadcastBlurtClaim(wif, account, r),
};

/** Read the pending shape for one account on one chain (no broadcast — plan/dry-safe). */
async function pendingShapeAt(chain, nodes, name) {
  const acc = (await condAt(nodes, 'get_accounts', [[name]]))[0];
  if (!acc) return null;
  const r = pendingRewards(chain, acc);
  return { liquid: r.liquid, debt: r.debt, vesting: r.vesting, pending: hasPending(r) };
}

/** The account's own top-level post younger than AUTHOR_SUPPORT_MAX_AGE_H with ≤
 *  AUTHOR_SUPPORT_MAX_NET_VOTES net votes (steem nodes may omit net_votes → active_votes
 *  fallback, same as the candidate pool). DEDUPE: the post's own active_votes list is the
 *  authoritative already-voted source (account-history can lag across queued runs — observed
 *  14:41Z run 37019584988 sibling: chain rejected an identical re-vote). null = nothing
 *  supportable (or probe failed). */
async function latestSupportableOwnPostAt(nodes, account) {
  try {
    const blog = await condAt(nodes, 'get_discussions_by_blog', [{ tag: account, limit: 5 }]);
    for (const p of blog || []) {
      if ((p.author || '').toLowerCase() !== account || p.depth !== 0) continue;
      const created = Date.parse(p.created + (p.created && p.created.endsWith('Z') ? '' : 'Z'));
      const ageH = (Date.now() - created) / 3600000;
      if (!(ageH >= 0 && ageH <= AUTHOR_SUPPORT_MAX_AGE_H)) continue;
      const av = Array.isArray(p.active_votes) ? p.active_votes : [];
      if (av.some((v) => (v.voter || '').toLowerCase() === account)) return null; // already voted (authoritative)
      const netVotes = Number.isFinite(Number(p.net_votes)) ? Number(p.net_votes) : av.filter((x) => Number(x.percent) > 0).length;
      if (netVotes > AUTHOR_SUPPORT_MAX_NET_VOTES) return null; // already has traction
      return { permlink: p.permlink, netVotes, ageHours: Math.round(ageH * 10) / 10 };
    }
  } catch (_) { /* fail-honest */ }
  return null;
}

/** Instant self-vote confirmation from the post's own active_votes (authoritative — no
 *  account-history lag; replaces the 105s probe loop for author-support results). */
async function confirmSelfVoteAt(nodes, author, permlink, voter) {
  try {
    const p = await condAt(nodes, 'get_content', [author, permlink]);
    const v = (p && Array.isArray(p.active_votes) ? p.active_votes : []).find((x) => (x.voter || '').toLowerCase() === voter);
    if (v) return { confirmed: true, percent: Number(v.percent), rshares: String(v.rshares) };
  } catch (_) { /* honest null */ }
  return { confirmed: false };
}

/** txid read-back per chain. hive: account-history probes + confirmation across ≥2 nodes.
 *  blurt: synchronous-broadcast id is primary; get_ops_in_block(syncBlock) + account-history
 *  best-effort (rc_api absent on blurt — documented). */
async function readBackLeg(chain, nodes, voter, author, permlink, syncId, syncBlock) {
  if (chain === 'blurt' && syncId) {
    let opsInBlock = null;
    if (syncBlock) {
      try {
        const ops = await condAt(nodes, 'get_ops_in_block', [syncBlock, false]);
        for (const rec of ops || []) {
          const [t, v] = rec.op || [];
          if (t !== 'vote') continue;
          if ((v.voter || '').toLowerCase() === voter && (v.author || '').toLowerCase() === author.toLowerCase() && v.permlink === permlink) {
            opsInBlock = { txid: rec.trx_id || syncId, block: syncBlock, match: true };
            break;
          }
        }
      } catch (_) { /* best-effort */ }
    }
    let histTxid = null;
    for (const attempt of [1, 2, 3]) {
      try {
        const hist = await condAt(nodes, 'get_account_history', [voter, -1, 100]);
        for (let i = (hist || []).length - 1; i >= 0; i--) {
          const ev = hist[i] && hist[i][1];
          if (!ev || !ev.op || ev.op[0] !== 'vote') continue;
          const v = ev.op[1] || {};
          if ((v.voter || '').toLowerCase() === voter && (v.author || '').toLowerCase() === author.toLowerCase() && v.permlink === permlink) { histTxid = ev.trx_id; break; }
        }
        if (histTxid) break;
      } catch (_) { /* rotate implicitly */ }
      await new Promise((r) => setTimeout(r, attempt * 4000));
    }
    return { confirmedBy: opsInBlock ? 'get_ops_in_block' : (histTxid ? 'account-history' : 'sync-broadcast-id-only'), txid: (opsInBlock && opsInBlock.txid) || histTxid || syncId, block: syncBlock || (opsInBlock && opsInBlock.block) || null, histTxid, opsInBlock: !!opsInBlock, note: 'rc_api absent on blurt — RC not budgeted; account-history indexing can lag, ops-in-block is the on-chain proof' };
  }
  // hive: keep probing account history (indexing lag), then confirm on every reachable node
  let found = null;
  for (const attempt of [1, 2, 3, 4, 5, 6]) {
    try {
      const hist = await condAt(nodes, 'get_account_history', [voter, -1, 100]);
      for (let i = (hist || []).length - 1; i >= 0; i--) {
        const ev = hist[i] && hist[i][1];
        if (!ev || !ev.op || ev.op[0] !== 'vote') continue;
        const v = ev.op[1] || {};
        if ((v.voter || '').toLowerCase() === voter && (v.author || '').toLowerCase() === author.toLowerCase() && v.permlink === permlink) { found = { txid: ev.trx_id, block: ev.block }; break; }
      }
      if (found) break;
    } catch (_) { /* rotate implicitly */ }
    await new Promise((r) => setTimeout(r, attempt * 4000));
  }
  if (!found) return { confirmedBy: 'pending-not-found-in-latest-ops', txid: syncId || null, block: syncBlock || null, confirmNodes: [] };
  const confirmNodes = [];
  for (const node of nodes) {
    try {
      const hist = await condAt([node], 'get_account_history', [voter, -1, 100]);
      let hit = false;
      for (const entry of hist || []) {
        const ev = entry && entry[1];
        if (!ev || !ev.op || ev.op[0] !== 'vote') continue;
        const v = ev.op[1] || {};
        if ((v.voter || '').toLowerCase() === voter && (v.author || '').toLowerCase() === author.toLowerCase() && v.permlink === permlink) { hit = true; break; }
      }
      if (hit) confirmNodes.push(node.replace('https://', ''));
    } catch (_) { /* node down — honest count only */ }
  }
  return { confirmedBy: 'account-history', txid: found.txid, block: found.block, confirmNodes };
}

/** ONE full curation leg for a non-steem graphene chain. Returns a summary object; throws on
 *  hard failure (fail-honest — the caller records the failure and the run goes red). */
async function curationLeg(cfg) {
  const { chain, nodes, tags, gates, eligibleRows, broadcastVote, chainNote } = cfg;
  const allowed = new Set(eligibleRows.map((r) => r.account.toLowerCase()));
  if (allowed.size === 0) throw new Error('roster grants zero ' + chain + ' rows — refusing to operate');

  // account order: deterministic daily rotation over eligible roster order
  let order = [...allowed];
  const day = Math.floor(Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') / 86400000);
  const off = day % order.length;
  order = order.slice(off).concat(order.slice(0, off));
  log('[' + chain + '] mode=' + (DRY_RUN ? 'DRY-RUN' : 'REAL') + ' · maxVotes=' + MAX_VOTES + ' · accountOrder=' + order.slice(0, MAX_VOTES).join(','));

  // live verification + VP health (per-chain auth semantics)
  const verified = [];
  for (const name of order.slice(0, MAX_VOTES * 2)) {
    if (NEVER_TOUCH.some((re) => re.test(name))) { verified.push({ account: name, verdict: 'skip-never-touch' }); continue; }
    if (!allowed.has(name)) { verified.push({ account: name, verdict: 'skip-roster-not-full-control' }); continue; }
    try {
      const acc = (await condAt(nodes, 'get_accounts', [[name]]))[0];
      if (!acc) { verified.push({ account: name, verdict: 'skip-account-missing' }); continue; }
      const chainAuths = ((acc.posting || {}).key_auths || []).map((k) => k[0]);
      const vaultWif = seal.wifByAccount[name];
      let resolved = null;
      if (vaultWif) {
        const pub = steem.auth.wifToPublic(vaultWif);
        const hit = chain === 'hive'
          ? chainAuths.some((k) => k === pub) // hive keeps the STM prefix
          : chainAuths.some((k) => String(k).slice(3) === String(pub).slice(3) && String(k).slice(0, 3) === 'BLT');
        if (hit) resolved = { wif: vaultWif, source: 'vault', pub };
      }
      if (!resolved) { verified.push({ account: name, verdict: 'skip-no-posting-key-matches-live-auth', chainPubFps: chainAuths.map(fp) }); continue; }
      // voting manabar (10 × vests-micros max, 5-day regen — same graphene semantics)
      const vestsMicros = Math.round(parseFloat(acc.vesting_shares) * 1e6);
      const maxMana = 10 * vestsMicros;
      const vm = acc.voting_manabar || { current_mana: 0, last_update_time: 0 };
      const dgp = await condAt(nodes, 'get_dynamic_global_properties', []);
      const headSec = Date.parse(dgp.time + (dgp.time.endsWith('Z') ? '' : 'Z')) / 1000;
      const elapsed = Math.max(0, headSec - Number(vm.last_update_time || 0));
      const vpPct = maxMana > 0 ? (Math.min(maxMana, Number(vm.current_mana || 0) + maxMana * (elapsed / 432000)) / maxMana) * 100 : 0;
      const effVests =
        parseFloat(acc.vesting_shares) -
        parseFloat(acc.delegated_vesting_shares || '0') +
        parseFloat(acc.received_vesting_shares || '0');
      verified.push({ account: name, verdict: 'ok', pubFp: fp(resolved.pub), keySource: resolved.source, vpPct: Math.round(vpPct * 100) / 100, effVests: Math.round(effVests) });
    } catch (e) {
      verified.push({ account: name, verdict: 'skip-verification-error', errorShape: String(e && e.message).slice(0, 120) });
    }
  }
  // Task 17: whale-first — order by EFFECTIVE vesting desc (delegations-out subtracted)
  const healthy = verified.filter((v) => v.verdict === 'ok' && v.vpPct >= 5).sort((a, b) => (b.effVests || 0) - (a.effVests || 0));
  for (const v of verified) {
    if (v.verdict !== 'ok') log('[' + chain + '] account ' + v.account + ': ' + v.verdict);
    else log('[' + chain + '] account ' + v.account + ': verified ' + v.keySource + ' pub=' + v.pubFp + ' vp=' + v.vpPct + '%');
  }

  // vote-history gates (fail-honest: unreadable history = no broadcast for that account)
  const voteHistories = new Map();
  const historyDead = new Set();
  for (const v of healthy) {
    try { voteHistories.set(v.account, await accountVoteHistoryAt(nodes, v.account)); }
    catch (e) { historyDead.add(v.account); log('[' + chain + '] account ' + v.account + ': vote-history unreadable — excluded this run (' + String(e.message).slice(0, 100) + ')'); }
  }

  const pool = await fetchCandidatePoolAt(nodes, tags, gates);
  log('[' + chain + '] candidate pool: ' + pool.length + ' posts passed the deterministic quality gate (' + tags.length + ' niche tags)');

  const used = new Set();
  const usedAuthors = new Set();
  const rejectedAuthors = new Set();
  const plans = [];
  const skips = [];
  const candidateRejects = [];
  let cadenceProbes = 0;
  for (const v of healthy) {
    if (plans.length >= MAX_VOTES) break;
    if (historyDead.has(v.account)) { skips.push({ account: v.account, reason: 'vote-history-unavailable-no-broadcast-allowed' }); continue; }
    const hist = voteHistories.get(v.account) || [];
    const lastVoteAt = hist.reduce((acc, x) => (x.time && Date.parse(x.time) > acc ? Date.parse(x.time) : acc), 0);
    const hoursSince = lastVoteAt ? (Date.now() - lastVoteAt) / 3600000 : Infinity;
    if (hoursSince < MIN_HOURS_BETWEEN_VOTES) { skips.push({ account: v.account, reason: 'cooldown-last-vote-' + Math.round(hoursSince * 10) / 10 + 'h-ago' }); continue; }
    const alreadyVoted = new Set(hist.filter((x) => Number(x.weight) > 0).map((x) => x.authorperm.toLowerCase()));
    let pick = null;
    for (const c of pool) {
      if (used.has(c.authorperm) || alreadyVoted.has(c.authorperm.toLowerCase())) continue;
      // Task 18: authoritative live dedupe — the candidate's own active_votes beats the ~100-op
      // history window (older votes age out of history, never out of the post's voter list)
      if (c.voters && c.voters.has(v.account.toLowerCase())) continue;
      if (usedAuthors.has(c.author.toLowerCase()) || rejectedAuthors.has(c.author.toLowerCase())) continue;
      if (cadenceProbes < 12) {
        cadenceProbes++;
        const recent = await authorRecentPostCountAt(nodes, c.author);
        if (recent >= 4) {
          rejectedAuthors.add(c.author.toLowerCase());
          candidateRejects.push({ author: c.author, authorperm: c.authorperm, reason: 'content-farm-cadence-' + recent + '-posts-in-96h' });
          continue;
        }
      }
      pick = c;
      break;
    }
    if (!pick) { skips.push({ account: v.account, reason: 'no-fresh-candidate-not-already-voted' }); continue; }
    used.add(pick.authorperm);
    usedAuthors.add(pick.author.toLowerCase());
    plans.push({ account: v.account, pubFp: v.pubFp, keySource: v.keySource, vote: pick });
  }

  // Task 17 author-support plan: ≤1 self-vote/run on the account's own young low-traction post
  const authorSupport = [];
  if (AUTHOR_SUPPORT) {
    for (const v of healthy) {
      if (historyDead.has(v.account)) continue;
      const hist = voteHistories.get(v.account) || [];
      const alreadyVoted = new Set(hist.filter((x) => Number(x.weight) > 0).map((x) => x.authorperm.toLowerCase()));
      try {
        const post = await latestSupportableOwnPostAt(nodes, v.account);
        if (!post) continue;
        if (alreadyVoted.has((v.account + '/' + post.permlink).toLowerCase())) continue;
        authorSupport.push({ account: v.account, pubFp: v.pubFp, author: v.account, permlink: post.permlink, netVotes: post.netVotes, ageHours: post.ageHours });
      } catch (_) { /* fail-honest: skip this account's author-support */ }
    }
  }

  // receipt (collision-safe naming per chain)
  let receiptName = utcDate + '-economy-engine-' + chain + (DRY_RUN ? '-dryrun' : '') + '.json';
  for (let n = 2; fs.existsSync(path.join(STEEM_DIR, 'agent', 'receipts', receiptName)); n++) {
    receiptName = utcDate + '-economy-engine-' + chain + (DRY_RUN ? '-dryrun' : '') + '-r' + n + '.json';
  }
  const legReceiptPath = path.join(STEEM_DIR, 'agent', 'receipts', receiptName);
  const legReceipt = {
    engine: 'economy-engine v3 (Task 17 revenue wave) — ' + chain + ' leg',
    at: nowIso(),
    mode: DRY_RUN ? 'dry-run' : 'real-votes',
    chain,
    fleetTruth: { source: fleet.source, activeFleet: fleet.activeFleet, rows: eligibleRows.map((r) => ({ account: r.account, control: r.control, economicUse: r.economicUse })) },
    seal: {
      opened: true, outerShaGate: 'ok', innerShaGate: 'ok', openedAt: seal.openedAt,
      note: 'same in-runner seal as the steem leg; ONE vault WIF body rules steem/hive/blurt (STM/STM/BLT prefix) — proven live 2026-10-02 (receipt 2026-10-02-hive-blurt-first.json)',
    },
    nicheTags: tags,
    candidatePoolSize: pool.length,
    verifiedAccounts: verified.map((v) => ({ account: v.account, verdict: v.verdict, pubFp: v.pubFp || null, keySource: v.keySource || null, vpPct: v.vpPct ?? null })),
    plans: plans.map((p) => ({
      account: p.account, voterPubFp: p.pubFp, keySource: p.keySource, weight: WEIGHT,
      author: p.vote.author, permlink: p.vote.permlink,
      candidateShape: { niche: p.vote.niche, ageDays: p.vote.ageDays, netVotes: p.vote.netVotes, children: p.vote.children, bodyChars: p.vote.bodyChars, titleShape: p.vote.titleShape },
    })),
    skips, candidateRejects,
    results: [],
    claims: [],        // Task 17: claim_reward_balance receipts (per account)
    authorSupport,     // Task 17: planned self-votes on own posts (results filled below in real mode)
    costs: { principalAtRisk: 0, liquidSpent: 0, orders: 0, note: 'curation votes + claims + author-support self-votes only — zero principal at risk; no comments, no transfers, no market ops' },
    chainNote,
    dryRunState: { DRY_RUN: DRY_RUN, note: DRY_RUN ? 'no broadcast performed' : 'votes broadcast with verified posting keys only' },
  };

  if (!DRY_RUN) {
    // Task 17 claims first (independent of candidate gates — every verified account, dust floor)
    for (const v of verified) {
      if (v.verdict !== 'ok') continue;
      try {
        const acc = (await condAt(nodes, 'get_accounts', [[v.account]]))[0];
        const chainAuths = ((acc.posting || {}).key_auths || []).map((k) => k[0]);
        const resolved = resolvePostingWif(v.account, seal, chain === 'hive' ? chainAuths : chainAuths.map((k) => 'STM' + String(k).slice(3)));
        if (!resolved) { legReceipt.claims.push({ account: v.account, claimed: false, reason: 'no-matching-key' }); continue; }
        const shape = await pendingShapeAt(chain, nodes, v.account);
        if (!shape || !shape.pending) { legReceipt.claims.push({ account: v.account, claimed: false, reason: 'nothing-pending-above-dust', pendingShape: shape ? { liquid: shape.liquid, debt: shape.debt, vesting: shape.vesting } : null }); continue; }
        const r = { liquid: shape.liquid, debt: shape.debt, vesting: shape.vesting };
        const bc = await CHAIN_CLAIM[chain](resolved.wif, v.account, r);
        legReceipt.claims.push({ account: v.account, claimed: true, rewards: { liquid: r.liquid, debt: r.debt || undefined, vesting: r.vesting }, txid: bc.txid || null, block: bc.block || null, method: bc.method });
        log('[' + chain + '] CLAIMED ' + v.account + ': ' + r.liquid + (r.debt ? ' + ' + r.debt : '') + ' + ' + r.vesting + ' txid=' + (bc.txid || 'PENDING'));
      } catch (e) {
        legReceipt.claims.push({ account: v.account, claimed: false, errorShape: String(e && e.message).slice(0, 160) });
        log('[' + chain + '] CLAIM FAILED for ' + v.account + ': ' + String(e && e.message).slice(0, 120));
      }
    }
    for (const p of plans) {
      try {
        // re-verify the live auth immediately before signing (never sign on a stale match)
        const acc = (await condAt(nodes, 'get_accounts', [[p.account]]))[0];
        const chainAuths = ((acc.posting || {}).key_auths || []).map((k) => k[0]);
        const resolved = resolvePostingWif(p.account, seal, chain === 'hive' ? chainAuths : chainAuths.map((k) => 'STM' + String(k).slice(3)));
        if (!resolved) throw new Error('posting key stopped matching live auth — refusing to broadcast');
        // Task 18: final live gate right before signing — get_content is the zero-lag truth;
        // if the account already voted (any weight) this plan is a no-op, never a broadcast
        // (the chain rejects identical re-votes: Assert itr->vote_percent != o.weight)
        try {
          const cur = await condAt(nodes, 'get_content', [p.vote.author, p.vote.permlink]);
          const prev = (cur && Array.isArray(cur.active_votes) ? cur.active_votes : []).find((x) => (x.voter || '').toLowerCase() === p.account.toLowerCase());
          if (prev) {
            legReceipt.results.push({
              account: p.account, author: p.vote.author, permlink: p.vote.permlink, weight: WEIGHT,
              broadcast: 'skipped-already-voted-live', txid: null, confirmedBy: null,
              priorPercent: Number(prev.percent), note: 'live active_votes gate — chain truth beats the account-history window',
            });
            log('[' + chain + '] SKIP ' + p.account + ' → @' + p.vote.author + '/' + p.vote.permlink.slice(0, 28) + '… (already voted live at ' + Number(prev.percent) / 100 + '% — no broadcast)');
            continue;
          }
        } catch (_) { /* gate probe failed — proceed; the chain itself remains the final gate */ }
        const bc = await broadcastVote(resolved.wif, p.account, p.vote.author, p.vote.permlink);
        const rb = await readBackLeg(chain, nodes, p.account, p.vote.author, p.vote.permlink, bc.txid, bc.block);
        legReceipt.results.push({
          account: p.account, author: p.vote.author, permlink: p.vote.permlink, weight: WEIGHT,
          broadcast: 'ok', broadcastMethod: bc.method,
          txid: rb.txid, txidBlock: rb.block, confirmedBy: rb.confirmedBy,
          confirmNodes: rb.confirmNodes || undefined, opsInBlock: rb.opsInBlock, readBackNote: rb.note || undefined,
        });
        log('[' + chain + '] VOTED ' + p.account + ' → @' + p.vote.author + '/' + p.vote.permlink.slice(0, 28) + '… txid=' + (rb.txid || 'PENDING'));
      } catch (e) {
        const msg = String(e && e.message);
        // Task 18: chain-as-gate — an identical re-vote is not a failure, it is the chain telling
        // us the vote is already on chain with the same weight (no new tx exists, so no read-back;
        // history gates can age a vote out of their ~100-op window, the post's active_votes cannot)
        if (/identical to this vote/i.test(msg)) {
          legReceipt.results.push({
            account: p.account, author: p.vote.author, permlink: p.vote.permlink,
            broadcast: 'skipped-identical-vote', txid: null, confirmedBy: null,
            errorShape: msg.slice(0, 160), note: 'chain-as-gate: vote already on chain with identical weight — no new tx, not a failure',
          });
          log('[' + chain + '] SKIP-IDENTICAL ' + p.account + ' → @' + p.vote.author + '/' + p.vote.permlink.slice(0, 28) + '… (chain: identical vote already cast — no new tx)');
          continue;
        }
        // the tx may have landed even if the relaying node errored — read back before declaring failure
        const rb = await readBackLeg(chain, nodes, p.account, p.vote.author, p.vote.permlink, null, null);
        legReceipt.results.push({
          account: p.account, author: p.vote.author, permlink: p.vote.permlink,
          broadcast: rb.txid ? 'ok-after-error' : 'FAILED',
          txid: rb.txid || null, txidBlock: rb.block || null, confirmedBy: rb.confirmedBy || null,
          errorShape: msg.slice(0, 160),
        });
        log('[' + chain + '] BROADCAST ' + (rb.txid ? 'landed despite node error' : 'FAILED') + ' for ' + p.account + ': ' + msg.slice(0, 120));
      }
    }
    // Task 17 author-support broadcasts (do NOT count toward the vote-success gate)
    for (const s of authorSupport) {
      try {
        const acc = (await condAt(nodes, 'get_accounts', [[s.account]]))[0];
        const chainAuths = ((acc.posting || {}).key_auths || []).map((k) => k[0]);
        const resolved = resolvePostingWif(s.account, seal, chain === 'hive' ? chainAuths : chainAuths.map((k) => 'STM' + String(k).slice(3)));
        if (!resolved) throw new Error('posting key stopped matching live auth — refusing to broadcast');
        const bc = await broadcastVote(resolved.wif, s.account, s.author, s.permlink);
        const cf = await confirmSelfVoteAt(nodes, s.author, s.permlink, s.account);
        s.broadcast = 'ok'; s.txid = bc.txid || (cf.confirmed ? 'confirmed-in-active-votes' : null); s.txidBlock = bc.block || null; s.confirmedBy = cf.confirmed ? 'active-votes-percent-' + cf.percent : null; s.rshares = cf.rshares || undefined;
        log('[' + chain + '] AUTHOR-SUPPORT ' + s.account + ' → own post ' + s.permlink.slice(0, 28) + '… txid=' + (s.txid || 'PENDING') + (cf.confirmed ? ' CONFIRMED ' + cf.percent / 100 + '%' : ''));
      } catch (e) {
        const msg = String(e && e.message);
        if (/identical to this vote/i.test(msg)) {
          // Task 18: chain-as-gate — the self-vote is already on chain (no new tx, not a failure)
          s.broadcast = 'skipped-identical-vote'; s.errorShape = msg.slice(0, 160);
          s.note = 'chain-as-gate: identical self-vote already cast — no new tx';
          log('[' + chain + '] AUTHOR-SUPPORT SKIP-IDENTICAL for ' + s.account + ' (already voted own post — no new tx)');
        } else {
          s.broadcast = 'FAILED'; s.errorShape = msg.slice(0, 160);
          log('[' + chain + '] AUTHOR-SUPPORT FAILED for ' + s.account + ': ' + msg.slice(0, 120));
        }
      }
    }
    const ok = legReceipt.results.filter((r) => r.broadcast === 'ok' || r.broadcast === 'ok-after-error');
    log('[' + chain + '] real cycle done: broadcast ok=' + ok.length + '/' + plans.length + ' · claims=' + legReceipt.claims.filter((c) => c.claimed).length + ' · authorSupport=' + authorSupport.filter((s) => s.broadcast === 'ok').length + '/' + authorSupport.length + ' · txids read back=' + ok.filter((r) => r.txid).length);
    if (plans.length === 0) {
      log('[' + chain + '] real cycle: zero PLANNED votes (cooldown/dedupe/history gates) — honest no-op cycle, not a failure');
    } else if (ok.length === 0) {
      // Task 18: dedupe skips (live gate / chain-as-gate identical) are healthy no-ops — only a
      // REAL broadcast failure fails the run (fail-honest preserved, false alarms eliminated)
      const failed = legReceipt.results.filter((r) => r.broadcast === 'FAILED').length;
      const skipped = legReceipt.results.filter((r) => r.broadcast === 'skipped-already-voted-live' || r.broadcast === 'skipped-identical-vote').length;
      if (failed > 0) {
        throw new Error('zero ' + chain + ' votes succeeded in a REAL run with ' + plans.length + ' plans (' + failed + ' broadcast failure(s)) — failing honestly (check accounts/RC/keys)');
      }
      log('[' + chain + '] real cycle: all ' + plans.length + ' plan(s) were dedupe skips (' + skipped + ' already-voted) — honest no-op cycle, not a failure');
    }
  } else {
    // dry-run: record claim plans (no broadcast) + keep author-support as plan-only
    for (const v of verified) {
      if (v.verdict !== 'ok') continue;
      try {
        const shape = await pendingShapeAt(chain, nodes, v.account);
        legReceipt.claims.push({ account: v.account, claimed: false, reason: shape && shape.pending ? 'dry-run-plan' : 'nothing-pending-above-dust', pendingShape: shape ? { liquid: shape.liquid, debt: shape.debt, vesting: shape.vesting } : null });
      } catch (e) {
        legReceipt.claims.push({ account: v.account, claimed: false, errorShape: String(e && e.message).slice(0, 160) });
      }
    }
    log('[' + chain + '] dry-run: ' + plans.length + ' planned votes · ' + legReceipt.claims.filter((c) => c.reason === 'dry-run-plan').length + ' claim plans · ' + authorSupport.length + ' author-support plans, none broadcast');
  }

  fs.mkdirSync(path.dirname(legReceiptPath), { recursive: true });
  fs.writeFileSync(legReceiptPath, JSON.stringify(legReceipt, null, 2) + '\n');
  log('[' + chain + '] receipt written: agent/receipts/' + receiptName);
  if (PUSH_RECEIPT) {
    const nVotes = legReceipt.results.filter((r) => r.broadcast === 'ok' || r.broadcast === 'ok-after-error').length;
    const nClaims = legReceipt.claims.filter((c) => c.claimed).length;
    const nSelf = authorSupport.filter((s) => s.broadcast === 'ok').length;
    pushReceipt(legReceiptPath, 'economy-engine[' + chain + ']: ' + nowIso() + ' · ' + (DRY_RUN ? 'dry-run plan' : nVotes + ' votes · ' + nClaims + ' claims · ' + nSelf + ' self-votes') + ' · txids inside');
    log('[' + chain + '] receipt pushed to steem (pull --rebase first, no force)');
  }
  return {
    chain,
    receipt: 'agent/receipts/' + receiptName,
    plans: plans.length,
    voted: legReceipt.results.filter((r) => r.broadcast === 'ok' || r.broadcast === 'ok-after-error').map((r) => ({ account: r.account, txid: r.txid, confirmedBy: r.confirmedBy || null })),
    claims: legReceipt.claims.filter((c) => c.claimed).map((c) => ({ account: c.account, txid: c.txid })),
    authorSupport: authorSupport.filter((s) => s.broadcast === 'ok').map((s) => ({ account: s.account, permlink: s.permlink, txid: s.txid })),
    skipped: skips.length,
    candidatePool: pool.length,
  };
}

// roster rows per chain + per-chain NEVER_TOUCH (belt-and-braces on top of roster flags)
const rowsAll = rosterMod.rows();
const HIVE_ROWS = rowsAll.filter((r) => r.chain === 'hive' && r.control === 'full' && r.economicUse === true && !r.retired);
const BLURT_ROWS = rowsAll.filter((r) => r.chain === 'blurt' && r.control === 'full' && r.economicUse === true && !r.retired);
// tov-hive is blocked-no-key (owner-confirmed) and can never appear in HIVE_ROWS; the pattern
// list below additionally forbids it (and ynet*) as voter OR author on every leg.
const LEGS = [
  {
    chain: 'hive', nodes: HIVE_RPCS,
    tags: HIVE_TAGS.length ? HIVE_TAGS : DEFAULT_HIVE_TAGS,
    gates: { minNetVotes: MIN_NET_VOTES, repGate: true },
    eligibleRows: HIVE_ROWS,
    broadcastVote: broadcastVoteHive,
    chainNote: 'hive chain_id ' + HIVE_CHAIN_ID.slice(0, 8) + '… (anchor.cjs, proven live); STM pubkeys; ≤12 votes/run, 1/account, 10h cooldown + claims + author-support self-votes (Task 17); NEVER_TOUCH incl. tov-hive (blocked-no-key)',
  },
  {
    chain: 'blurt', nodes: BLURT_RPCS,
    tags: BLURT_TAGS.length ? BLURT_TAGS : DEFAULT_BLURT_TAGS,
    gates: BLURT_GATES,
    eligibleRows: BLURT_ROWS,
    broadcastVote: broadcastVoteBlurt,
    chainNote: 'blurt chain_id ' + BLURT_CHAIN_ID.slice(0, 8) + '… (blurtjs config; anchor.cjs recipe proven live 2026-09-06); BLT pubkeys, same WIF body; rc_api ABSENT (no RC budgeting — honest); ≤12 votes/run, 1/account, 10h cooldown + claims (blurt op has NO debt asset) + author-support self-votes (Task 17); blurt discussion objects omit net_votes/author_reputation → netVotes from active_votes, rep gate skipped; ynet-blurt retired (economicUse false) — never touched',
  },
];

// ═══════════════════════════════ MAIN ═══════════════════════════════
const seal = openSeal();
const utcDate = new Date().toISOString().slice(0, 10);
// collision-safe receipt naming: same-day reruns get -r2, -r3… (no receipt is ever overwritten)
let receiptName = utcDate + '-economy-engine' + (DRY_RUN ? '-dryrun' : '') + '.json';
for (let n = 2; fs.existsSync(path.join(STEEM_DIR, 'agent', 'receipts', receiptName)); n++) {
  receiptName = utcDate + '-economy-engine' + (DRY_RUN ? '-dryrun' : '') + '-r' + n + '.json';
}
const receiptPath = path.join(STEEM_DIR, 'agent', 'receipts', receiptName);

// account order: override, else deterministic daily rotation over roster order
let accountOrder = ACCOUNTS_OVERRIDE.length ? ACCOUNTS_OVERRIDE : fleet.accounts.map((a) => a.toLowerCase()).filter((a) => a !== 'ynet');
if (!ACCOUNTS_OVERRIDE.length) {
  const day = Math.floor(Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') / 86400000);
  const off = day % accountOrder.length;
  accountOrder = accountOrder.slice(off).concat(accountOrder.slice(0, off));
}
log('mode=' + (DRY_RUN ? 'DRY-RUN (no broadcast)' : 'REAL (votes will be broadcast)') + ' · maxVotes=' + MAX_VOTES + ' · accountOrder=' + accountOrder.slice(0, MAX_VOTES).join(','));

// (c) live verification first — we only keep accounts that verify + are healthy
const verified = await verifyAccounts(accountOrder.slice(0, MAX_VOTES * 2));
// Task 17: whale-first — order by EFFECTIVE vesting desc (delegations-out subtracted)
const healthy = verified.filter((v) => v.verdict === 'ok' && v.vpPct >= 5).sort((a, b) => (b.effVests || 0) - (a.effVests || 0));
for (const v of verified) {
  if (v.verdict !== 'ok') log('account ' + v.account + ': ' + v.verdict);
  else log('account ' + v.account + ': verified ' + v.keySource + ' pub=' + v.pubFp + ' vp=' + v.vpPct + '% rep=' + v.rep);
}

// vote-history gates: per-post already-voted + account cooldown (fail-honest — see accountVoteHistory)
const voteHistories = new Map();
const historyDead = new Set();
for (const v of healthy) {
  try { voteHistories.set(v.account, await accountVoteHistory(v.account)); }
  catch (e) { historyDead.add(v.account); log('account ' + v.account + ': vote-history unreadable — excluded from broadcasting this run (' + String(e.message).slice(0, 100) + ')'); }
}

const pool = await fetchCandidatePool();
log('candidate pool: ' + pool.length + ' posts passed the deterministic quality gate (from ' + NICHE_TAGS.length + ' niche tags)');

const used = new Set();
const usedAuthors = new Set();
const rejectedAuthors = new Set();
const plans = [];
const skips = [];
const candidateRejects = [];
let cadenceProbes = 0;
for (const v of healthy) {
  if (plans.length >= MAX_VOTES) break;
  if (historyDead.has(v.account)) { skips.push({ account: v.account, reason: 'vote-history-unavailable-no-broadcast-allowed' }); continue; }
  const hist = voteHistories.get(v.account) || [];
  // cooldown: skip accounts that already voted too recently (daily-safe by design)
  const lastVoteAt = hist.reduce((acc, x) => (x.time && Date.parse(x.time) > acc ? Date.parse(x.time) : acc), 0);
  const hoursSince = lastVoteAt ? (Date.now() - lastVoteAt) / 3600000 : Infinity;
  if (hoursSince < MIN_HOURS_BETWEEN_VOTES) { skips.push({ account: v.account, reason: 'cooldown-last-vote-' + Math.round(hoursSince * 10) / 10 + 'h-ago' }); continue; }
  const alreadyVoted = new Set(hist.filter((x) => Number(x.weight) > 0).map((x) => x.authorperm.toLowerCase()));
  // first candidate that is fresh for this account, not used this run, from an un-planned author,
  // and from an author that is not a production-line farm (≥4 posts/96h cadence gate)
  let pick = null;
  for (const c of pool) {
    if (used.has(c.authorperm) || alreadyVoted.has(c.authorperm.toLowerCase())) continue;
    // Task 18: authoritative live dedupe — the candidate's own active_votes beats the ~100-op
    // history window (an aged-out vote can no longer produce a doomed identical re-vote)
    if (c.voters && c.voters.has(v.account.toLowerCase())) continue;
    if (usedAuthors.has(c.author.toLowerCase()) || rejectedAuthors.has(c.author.toLowerCase())) continue;
    if (cadenceProbes < 12) {
      cadenceProbes++;
      const recent = await authorRecentPostCount(c.author);
      if (recent >= 4) {
        rejectedAuthors.add(c.author.toLowerCase());
        candidateRejects.push({ author: c.author, authorperm: c.authorperm, reason: 'content-farm-cadence-' + recent + '-posts-in-96h' });
        continue;
      }
    }
    pick = c;
    break;
  }
  if (!pick) { skips.push({ account: v.account, reason: 'no-fresh-candidate-not-already-voted' }); continue; }
  used.add(pick.authorperm);
  usedAuthors.add(pick.author.toLowerCase());
  plans.push({ account: v.account, pubFp: v.pubFp, keySource: v.keySource, vote: pick });
}

// Task 17 author-support plan: ≤1 self-vote/run on the account's own young low-traction post
const authorSupport = [];
if (AUTHOR_SUPPORT) {
  for (const v of healthy) {
    if (historyDead.has(v.account)) continue;
    const hist = voteHistories.get(v.account) || [];
    const alreadyVoted = new Set(hist.filter((x) => Number(x.weight) > 0).map((x) => x.authorperm.toLowerCase()));
    try {
      const post = await latestSupportableOwnPostAt(RPCS, v.account);
      if (!post) continue;
      if (alreadyVoted.has((v.account + '/' + post.permlink).toLowerCase())) continue;
      authorSupport.push({ account: v.account, pubFp: v.pubFp, author: v.account, permlink: post.permlink, netVotes: post.netVotes, ageHours: post.ageHours });
    } catch (_) { /* fail-honest: skip this account's author-support */ }
  }
}

const receipt = {
  engine: 'economy-engine v3 (Task 17 revenue wave) — steem leg',
  at: nowIso(),
  mode: DRY_RUN ? 'dry-run' : 'real-votes',
  chain: 'steem',
  fleetTruth: { source: fleet.source, activeFleet: fleet.activeFleet },
  seal: {
    opened: true, outerShaGate: 'ok', innerShaGate: 'ok', openedAt: seal.openedAt,
    note: 'keys_zip_v2 doctrine (AES-256-CBC pbkdf2-300k) opened in-runner from private checkout; material never leaves the runner, never enters Domain',
  },
  nicheTags: NICHE_TAGS,
  candidatePoolSize: pool.length,
  verifiedAccounts: verified.map((v) => ({ account: v.account, verdict: v.verdict, pubFp: v.pubFp || null, keySource: v.keySource || null, vpPct: v.vpPct ?? null })),
  plans: plans.map((p) => ({
    account: p.account,
    voterPubFp: p.pubFp,
    keySource: p.keySource,
    weight: WEIGHT,
    author: p.vote.author,
    permlink: p.vote.permlink,
    candidateShape: { niche: p.vote.niche, ageDays: p.vote.ageDays, netVotes: p.vote.netVotes, children: p.vote.children, bodyChars: p.vote.bodyChars, titleShape: p.vote.titleShape },
  })),
  skips,
  candidateRejects,
  results: [],
  claims: [],        // Task 17: claim_reward_balance receipts (per account)
  authorSupport,     // Task 17: planned self-votes on own posts (results filled below in real mode)
  costs: { principalAtRisk: 0, liquidSpent: 0, orders: 0, note: 'curation votes + claims + author-support self-votes only — zero principal at risk; no market ops' },
  dryRunState: { DRY_RUN: DRY_RUN, note: DRY_RUN ? 'no broadcast performed' : 'votes broadcast with verified posting keys only' },
};

if (!DRY_RUN) {
  // Task 17 claims first (independent of candidate gates — every verified account, dust floor)
  for (const v of verified) {
    if (v.verdict !== 'ok') continue;
    try {
      const wif = resolvePostingWif(v.account, seal, (await condenser('get_accounts', [[v.account]]))[0].posting.key_auths.map((k) => k[0]));
      if (!wif) { receipt.claims.push({ account: v.account, claimed: false, reason: 'no-matching-key' }); continue; }
      const shape = await pendingShapeAt('steem', RPCS, v.account);
      if (!shape || !shape.pending) { receipt.claims.push({ account: v.account, claimed: false, reason: 'nothing-pending-above-dust', pendingShape: shape ? { liquid: shape.liquid, debt: shape.debt, vesting: shape.vesting } : null }); continue; }
      const bc = await CHAIN_CLAIM.steem(wif.wif, v.account, { liquid: shape.liquid, debt: shape.debt, vesting: shape.vesting });
      receipt.claims.push({ account: v.account, claimed: true, rewards: { liquid: shape.liquid, debt: shape.debt, vesting: shape.vesting }, txid: bc.txid || null, block: bc.block || null, method: bc.method });
      log('CLAIMED ' + v.account + ': ' + shape.liquid + ' + ' + shape.debt + ' + ' + shape.vesting + ' txid=' + (bc.txid || 'PENDING'));
    } catch (e) {
      receipt.claims.push({ account: v.account, claimed: false, errorShape: String(e && e.message).slice(0, 160) });
      log('CLAIM FAILED for ' + v.account + ': ' + String(e && e.message).slice(0, 120));
    }
  }
  for (const p of plans) {
    try {
      const wif = resolvePostingWif(p.account, seal, (await condenser('get_accounts', [[p.account]]))[0].posting.key_auths.map((k) => k[0]));
      if (!wif) throw new Error('posting key stopped matching live auth — refusing to broadcast');
      // Task 18: final live gate right before signing — get_content is the zero-lag truth;
      // an already-voted plan is a no-op skip, never a doomed broadcast (the chain rejects
      // identical re-votes: Assert itr->vote_percent != o.weight, seen live 2026-10-02)
      try {
        const cur = (await condenser('get_content', [p.vote.author, p.vote.permlink]));
        const prev = (cur && Array.isArray(cur.active_votes) ? cur.active_votes : []).find((x) => (x.voter || '').toLowerCase() === p.account.toLowerCase());
        if (prev) {
          receipt.results.push({
            account: p.account, author: p.vote.author, permlink: p.vote.permlink, weight: WEIGHT,
            broadcast: 'skipped-already-voted-live', txid: null, txidBlock: null,
            priorPercent: Number(prev.percent), note: 'live active_votes gate — chain truth beats the account-history window',
          });
          log('SKIP ' + p.account + ' → @' + p.vote.author + '/' + p.vote.permlink.slice(0, 28) + '… (already voted live at ' + Number(prev.percent) / 100 + '% — no broadcast)');
          continue;
        }
      } catch (_) { /* gate probe failed — proceed; the chain itself remains the final gate */ }
      await broadcastVote(wif.wif, p.account, p.vote.author, p.vote.permlink, WEIGHT);
      let rb = await readBackTxid(p.account, p.vote.author, p.vote.permlink);
      let readBackNote = rb ? 'account-history' : 'pending-not-found-in-100-latest-ops';
      if (!rb) {
        // Task 18 fallback: the post's own active_votes is the zero-lag authoritative
        // confirmation (account-history on some nodes lags minutes behind the head)
        const cf = await confirmSelfVoteAt(RPCS, p.vote.author, p.vote.permlink, p.account).catch(() => ({ confirmed: false }));
        if (cf.confirmed) { rb = { txid: null, block: null, confirmedInActiveVotes: true }; readBackNote = 'active-votes-percent-' + cf.percent + ' (history lagged, vote proven on the post itself)'; }
      }
      receipt.results.push({ account: p.account, author: p.vote.author, permlink: p.vote.permlink, weight: WEIGHT, broadcast: 'ok', txid: rb ? rb.txid : null, txidBlock: rb ? rb.block : null, readBack: readBackNote });
      log('VOTED ' + p.account + ' → @' + p.vote.author + '/' + p.vote.permlink.slice(0, 28) + '… txid=' + (rb ? rb.txid : 'PENDING'));
    } catch (e) {
      const msg = String(e && e.message);
      // Task 18: chain-as-gate — an identical re-vote is the chain confirming the vote is already
      // on chain (no new tx exists → no read-back; not a failure, a skip receipt row)
      if (/identical to this vote/i.test(msg)) {
        receipt.results.push({
          account: p.account, author: p.vote.author, permlink: p.vote.permlink,
          broadcast: 'skipped-identical-vote', txid: null, txidBlock: null,
          errorShape: msg.slice(0, 160), note: 'chain-as-gate: vote already on chain with identical weight — no new tx, not a failure',
        });
        log('SKIP-IDENTICAL ' + p.account + ' → @' + p.vote.author + '/' + p.vote.permlink.slice(0, 28) + '… (chain: identical vote already cast — no new tx)');
        continue;
      }
      // the tx may have landed even if the relaying node errored — read back before declaring failure
      const rb = await readBackTxid(p.account, p.vote.author, p.vote.permlink);
      receipt.results.push({
        account: p.account, author: p.vote.author, permlink: p.vote.permlink,
        broadcast: rb ? 'ok-after-error' : 'FAILED',
        txid: rb ? rb.txid : null, txidBlock: rb ? rb.block : null,
        readBack: rb ? 'account-history' : null,
        errorShape: msg.slice(0, 160),
      });
      log('BROADCAST ' + (rb ? 'landed despite node error' : 'FAILED') + ' for ' + p.account + ': ' + msg.slice(0, 120));
    }
  }
  // Task 17 author-support broadcasts (do NOT count toward the vote-success gate)
  for (const s of authorSupport) {
    try {
      const wif = resolvePostingWif(s.account, seal, (await condenser('get_accounts', [[s.account]]))[0].posting.key_auths.map((k) => k[0]));
      if (!wif) throw new Error('posting key stopped matching live auth — refusing to broadcast');
      await broadcastVote(wif.wif, s.account, s.author, s.permlink, WEIGHT);
      const cf = await confirmSelfVoteAt(RPCS, s.author, s.permlink, s.account);
      s.broadcast = 'ok'; s.txid = cf.confirmed ? 'confirmed-in-active-votes' : null; s.confirmedBy = cf.confirmed ? 'active-votes-percent-' + cf.percent : null; s.rshares = cf.rshares || undefined;
      log('AUTHOR-SUPPORT ' + s.account + ' → own post ' + s.permlink.slice(0, 28) + '… ' + (cf.confirmed ? 'CONFIRMED ' + cf.percent / 100 + '% rshares=' + cf.rshares : 'broadcast ok, confirmation pending'));
    } catch (e) {
      const msg = String(e && e.message);
      if (/identical to this vote/i.test(msg)) {
        // Task 18: chain-as-gate — the self-vote is already on chain (no new tx, not a failure)
        s.broadcast = 'skipped-identical-vote'; s.errorShape = msg.slice(0, 160);
        s.note = 'chain-as-gate: identical self-vote already cast — no new tx';
        log('AUTHOR-SUPPORT SKIP-IDENTICAL for ' + s.account + ' (already voted own post — no new tx)');
      } else {
        s.broadcast = 'FAILED'; s.errorShape = msg.slice(0, 160);
        log('AUTHOR-SUPPORT FAILED for ' + s.account + ': ' + msg.slice(0, 120));
      }
    }
  }
  const ok = receipt.results.filter((r) => r.broadcast === 'ok' || r.broadcast === 'ok-after-error');
  log('real cycle done: broadcast ok=' + ok.length + '/' + plans.length + ' · claims=' + receipt.claims.filter((c) => c.claimed).length + ' · authorSupport=' + authorSupport.filter((s) => s.broadcast === 'ok').length + '/' + authorSupport.length + ' · txids read back=' + ok.filter((r) => r.txid).length);
  if (plans.length === 0) {
    log('real cycle: zero PLANNED votes (cooldown/dedupe/history gates) — honest no-op cycle, not a failure');
  } else if (ok.length === 0) {
    // Task 18: dedupe skips (live gate / chain-as-gate identical) are healthy no-ops — only a
    // REAL broadcast failure fails the run (fail-honest preserved, false alarms eliminated)
    const failed = receipt.results.filter((r) => r.broadcast === 'FAILED').length;
    const skipped = receipt.results.filter((r) => r.broadcast === 'skipped-already-voted-live' || r.broadcast === 'skipped-identical-vote').length;
    if (failed > 0) {
      die('zero votes succeeded in a REAL run with ' + plans.length + ' plans (' + failed + ' broadcast failure(s)) — failing honestly (check accounts/RC/keys)');
    }
    log('real cycle: all ' + plans.length + ' plan(s) were dedupe skips (' + skipped + ' already-voted) — honest no-op cycle, not a failure');
  }
} else {
  // dry-run: record claim plans (no broadcast) + keep author-support as plan-only
  for (const v of verified) {
    if (v.verdict !== 'ok') continue;
    try {
      const shape = await pendingShapeAt('steem', RPCS, v.account);
      receipt.claims.push({ account: v.account, claimed: false, reason: shape && shape.pending ? 'dry-run-plan' : 'nothing-pending-above-dust', pendingShape: shape ? { liquid: shape.liquid, debt: shape.debt, vesting: shape.vesting } : null });
    } catch (e) {
      receipt.claims.push({ account: v.account, claimed: false, errorShape: String(e && e.message).slice(0, 160) });
    }
  }
  log('dry-run: ' + plans.length + ' planned votes · ' + receipt.claims.filter((c) => c.reason === 'dry-run-plan').length + ' claim plans · ' + authorSupport.length + ' author-support plans, none broadcast');
}

fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
log('receipt written: agent/receipts/' + receiptName);

if (PUSH_RECEIPT) {
  const nVotes = receipt.results.filter((r) => r.broadcast === 'ok' || r.broadcast === 'ok-after-error').length;
  const nClaims = receipt.claims.filter((c) => c.claimed).length;
  const nSelf = authorSupport.filter((s) => s.broadcast === 'ok').length;
  const nSkips = receipt.results.filter((r) => String(r.broadcast || '').startsWith('skipped')).length;
  const msg = 'economy-engine: ' + nowIso() + ' · ' + (DRY_RUN ? 'dry-run plan' : nVotes + ' votes · ' + nClaims + ' claims · ' + nSelf + ' self-votes' + (nSkips ? ' · ' + nSkips + ' dedupe-skips' : '')) + ' · txids inside';
  try {
    pushReceipt(receiptPath, msg);
    log('receipt pushed to steem (pull --rebase first, no force)');
  } catch (e) {
    die('receipt push failed: ' + String(e && e.message).slice(0, 160));
  }
}

// ═══════════════════════ Task 16-a: HIVE + BLURT legs ═══════════════════════════════
// The steem leg above is untouched in behavior; its receipt is already written/pushed.
// Both remaining legs now run with the identical discipline (per-chain caps + NEVER_TOUCH).
const legSummaries = [];
const legFailures = [];
for (const leg of LEGS) {
  try { legSummaries.push(await curationLeg(leg)); }
  catch (e) {
    legFailures.push({ chain: leg.chain, error: String(e && e.message).slice(0, 200) });
    log('LEG ' + leg.chain + ' FAILED: ' + String(e && e.message).slice(0, 160));
  }
}
if (legFailures.length) {
  die('leg failure(s) [' + legFailures.map((f) => f.chain).join(',') + '] — failing honestly: ' + legFailures.map((f) => f.error).join(' | '));
}

// (i) SHAPE-ONLY summary — accounts, counts, txids. No keys, no secret-shaped strings.
console.log('SUMMARY ' + JSON.stringify({
  mode: receipt.mode, accounts: receipt.plans.map((p) => p.account), voted: receipt.results.filter((r) => r.broadcast === 'ok' || r.broadcast === 'ok-after-error').map((r) => ({ account: r.account, txid: r.txid })),
  claims: receipt.claims.filter((c) => c.claimed).map((c) => ({ account: c.account, txid: c.txid })),
  authorSupport: authorSupport.filter((s) => s.broadcast === 'ok').map((s) => ({ account: s.account, permlink: s.permlink.slice(0, 40), txid: s.txid })),
  skipped: skips.length, candidatePool: pool.length, receipt: 'agent/receipts/' + receiptName, pushed: PUSH_RECEIPT,
  legs: legSummaries,
}));
