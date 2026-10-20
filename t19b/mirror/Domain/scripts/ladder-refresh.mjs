#!/usr/bin/env node
/**
 * ladder-refresh.mjs — Task 16-b: the 6-hourly ladder-refresh automation leg (STEEM internal market).
 *
 * Owner directive TODAY: "I don't want to wait — MUCH faster, MUCH more; more trades, more ways
 * to inject liquidity." This engine keeps the @headcorner STEEM/SBD ladder near the live mid —
 * the DISCIPLINED way: it reprices EXISTING liquidity (cancel+replace of stale orders only),
 * never injects fresh capital, never empties the ladder.
 *
 * Architecture (mirrors the proven economy-engine exactly):
 *   (a) checkout Domain (public home — logic only, zero key material)
 *   (b) private checkout of steem via ZIP_PAT — the seal custody lives there
 *   (c) open the key seal IN-RUNNER per keys_zip_v2.cjs doctrine (AES-256-CBC, pbkdf2-300k,
 *       sha gates outer+inner vs agent/recovery-meta.json) — material never leaves the runner
 *   (d) resolve @headcorner's ACTIVE key from the seal vault + verify it LIVE against the
 *       chain active authority (public fingerprints only)
 *   (e) spawn THE SAME single-source-of-truth executor: steem/agent/ladder_refresh.cjs
 *       (caps live THERE, in code: ≤3 cancel+replace pairs/run, staleness >7d AND >2% from mid,
 *       repost at mid±1.5% within ±2% band, floor = 2 lowest asks + 2 highest bids untouchable,
 *       ≥4 orders must remain standing, abort-on-error, DRY-RUN print before broadcast,
 *       account-history read-back confirmations, receipt JSON)
 *   (f) push the receipt JSON into steem (agent/receipts/, pull --rebase first, NEVER force)
 *   (g) SHAPE-ONLY summary (counts, orderids, prices — chain-public numbers, never key material)
 *
 * Env knobs:
 *   STEEM_DIR       private steem checkout            (default: <cwd>/steem)
 *   STEEMJS_DIR     dir whose node_modules has steem  (default: <script dir>)
 *   LADDER_ARM      '1' = allow broadcast (executor still requires its own caps+gates to pass)
 *                   anything else = plan-only (receipt with status, exit 0)
 *   PUSH_RECEIPT    'true' = git commit+push receipt into the steem repo
 *
 * HARD DISCIPLINE: headcorner-ONLY (the executor hard-locks the account); never touch
 * ynet-* / tov-hive; no secret ever printed/logged (fingerprints only); every failure = red run.
 */
'use strict';

import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const STEEM_DIR = process.env.STEEM_DIR || path.join(process.cwd(), 'steem');
const STEEMJS_DIR = process.env.STEEMJS_DIR || SCRIPT_DIR;
const ARMED = String(process.env.LADDER_ARM || '0') === '1';
const PUSH_RECEIPT = String(process.env.PUSH_RECEIPT || 'false').toLowerCase() === 'true';
const ACCOUNT = 'headcorner'; // THE liquid ladder — the only account this engine may operate
const RPC = process.env.LADDER_NODE || 'https://api.steemit.com';

const nowIso = () => new Date().toISOString();
const fp = (pub) => (pub && pub.length > 12 ? pub.slice(0, 8) + '…' + pub.slice(-4) : '??');
function die(msg) { console.error('LADDER-ENGINE-FAIL: ' + msg); process.exit(1); }
function log(msg) { console.log('[ladder-refresh] ' + msg); }

// ─────────────────────────── steem-js (CJS via createRequire — engine pattern) ───────────────────────────
const reqSteem = createRequire(path.join(STEEMJS_DIR, 'ladder-refresh-require-base.js'));
let steem;
try { steem = reqSteem('steem'); } catch (e) { die('steem-js not resolvable from STEEMJS_DIR=' + STEEMJS_DIR + ' (' + e.message + ')'); }

// ─────────────────────────── (a) custody metadata gates ───────────────────────────
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

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ladder-seal-'));
  fs.chmodSync(work, 0o700);
  const innerZip = path.join(work, 'inner.zip');
  execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', sealPath, '-out', innerZip, '-pass', 'env:LADDER_ZP'], {
    stdio: 'pipe', env: { ...process.env, LADDER_ZP: meta.keysZipPass },
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
  return { vault, work, openedAt: nowIso() };
}

async function liveActiveAuthority(account) {
  const res = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'condenser_api.get_accounts', params: [[account]] }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json();
  if (j.error) die('get_accounts rpc error: ' + JSON.stringify(j.error).slice(0, 140));
  const acc = j.result && j.result[0];
  if (!acc) die('account missing on chain: @' + account);
  return (acc.active && acc.active.key_auths ? acc.active.key_auths : []).map((k) => k[0]);
}

// ─────────────────────────── receipt push (rebase-first, never force — engine pattern) ───────────────────────────
function pushLadderReceipts(commitMsg) {
  const receiptsDir = path.join(STEEM_DIR, 'agent', 'receipts');
  const today = nowIso().slice(0, 10);
  const files = fs.readdirSync(receiptsDir).filter((f) => f.startsWith(today + '-ladder-') && f.endsWith('.json'));
  if (!files.length) die('no ladder receipts to push today — refusing to commit blind');
  for (const f of files) execFileSync('git', ['add', path.join('agent', 'receipts', f)], { cwd: STEEM_DIR, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', commitMsg], { cwd: STEEM_DIR, stdio: 'pipe' });
  execFileSync('git', ['pull', '--rebase', 'origin', 'main'], { cwd: STEEM_DIR, stdio: 'pipe' });
  execFileSync('git', ['push', 'origin', 'main'], { cwd: STEEM_DIR, stdio: 'pipe' });
  return files;
}

// ═══════════════════════════════ MAIN ═══════════════════════════════
const seal = openSeal();
log('seal opened in-runner (sha gates outer+inner ok) · ' + seal.openedAt);

// resolve @headcorner ACTIVE key from the vault (memory only — never printed)
// T-50 (custody truth): shape-compat across vault generations — the R245-ROT2 re-seal
// flattened accounts to keys.{role}.{wif,pub} + chains:[…], while this script was written
// against the legacy keys.steem.{role}.wif shape. Both shapes are read here; the seal
// (T50-TRUTH1) carries both. A null active wif is a CUSTODY BOUNDARY, not a breakage:
// the executor's DRY doctrine takes over (plan-only SHAPE receipt, exit 0) and the daily
// cadence stays green — the day the owner deposits the active key, broadcasting resumes
// automatically without any code change.
const head = (seal.vault.accounts || []).find((a) => String(a.username || '').toLowerCase() === ACCOUNT);
const activeWif =
  (head && head.keys && head.keys.steem && head.keys.steem.active && head.keys.steem.active.wif) ||
  (head && head.keys && head.keys.active && head.keys.active.wif) ||
  null;
let CUSTODY_BOUNDARY = false;
if (!activeWif) {
  CUSTODY_BOUNDARY = true;
  log('LADDER-CUSTODY-BOUNDARY: no active-key material for @' + ACCOUNT + ' in the seal vault — PLAN-ONLY by design (owner-gated custody; executor DRY doctrine produces the plan receipt)');
}
if (activeWif) {
  const derivedPub = steem.auth.wifToPublic(activeWif);
  const chainPubs = await liveActiveAuthority(ACCOUNT);
  if (!chainPubs.includes(derivedPub)) die('resolved active key does NOT match @' + ACCOUNT + ' live chain authority — refusing (fingerprint ' + fp(derivedPub) + ')');
  log('active key verified live for @' + ACCOUNT + ' (fingerprint ' + fp(derivedPub) + ')');
}

// the executor is the single source of truth for caps/plan/broadcast/receipt
const execPath = path.join(STEEM_DIR, 'agent', 'ladder_refresh.cjs');
if (!fs.existsSync(execPath)) die('executor missing in private checkout: agent/ladder_refresh.cjs (pin a steem main commit that has it)');

// T-50: never ARMED without key material in hand — the arm flag alone must not arm.
const EFFECTIVE_ARM = ARMED && !CUSTODY_BOUNDARY;
log('mode=' + (EFFECTIVE_ARM ? 'ARMED (broadcast allowed under executor caps)' : 'PLAN-ONLY (no broadcast)') + (CUSTODY_BOUNDARY ? ' · custody-boundary downgrade (armed=' + ARMED + ' → effective=false)' : ''));
const child = spawnSync(process.execPath, [execPath], {
  cwd: STEEM_DIR,
  stdio: 'inherit', // executor prints SHAPE-ONLY lines (no secret material by construction)
  env: {
    ...process.env,
    AGENT_ACCOUNT: ACCOUNT,
    ACTIVE_WIF: activeWif || '',              // memory-only env inheritance, never logged; empty = DRY doctrine
    LADDER_ARM: EFFECTIVE_ARM ? '1' : '0',    // T-50: never armed without custody
    HE_LIVE: EFFECTIVE_ARM ? '1' : '0',       // 28-b live-gate agrees with the task gate
    HE_LIVE_CONFIRM: EFFECTIVE_ARM ? ACCOUNT : '',
    LADDER_NODE: RPC,
    STEEMJS_DIR,
  },
});
if (child.error) die('executor spawn failed: ' + child.error.message);
log('executor exit code=' + child.status);

// shape-only summary from the receipts the executor just wrote (public numbers only)
const receiptsDir = path.join(STEEM_DIR, 'agent', 'receipts');
const today = nowIso().slice(0, 10);
const fresh = fs.readdirSync(receiptsDir)
  .filter((f) => f.startsWith(today + '-ladder-refresh-') && f.endsWith('.json'))
  .sort()
  .pop();
let shape = { receipt: null };
if (fresh) {
  const r = JSON.parse(fs.readFileSync(path.join(receiptsDir, fresh), 'utf8'));
  shape = {
    receipt: 'agent/receipts/' + fresh,
    status: r.status, gates: r.gates, market: r.market,
    opsPlanned: r.opsPlanned, executed: (r.executed || []).map((e) => ({ side: e.side, cancelOrderid: e.cancel && e.cancel.orderid, createOrderid: e.create && e.create.orderid, priceVsMidPct: e.priceVsMidPct, cancelTxid: e.confirmations && e.confirmations.cancel && e.confirmations.cancel.txid, createTxid: e.confirmations && e.confirmations.create && e.confirmations.create.txid })),
    verify: r.verify, ladderAfter: r.ladderAfter, churnVerdict: r.churn && r.churn.verdict,
  };
}

if (PUSH_RECEIPT) {
  const msg = 'ladder-refresh: ' + nowIso() + ' · ' + (EFFECTIVE_ARM ? 'armed' : 'plan-only' + (CUSTODY_BOUNDARY ? ' (custody-boundary)' : '')) + ' · ' + (shape.status || 'no-receipt') + ' · caps enforced';
  const files = pushLadderReceipts(msg);
  log('receipt pushed to steem (pull --rebase first, no force): ' + files.join(', '));
}

// zero secrets in the summary — orderids/prices/txids are chain-public
console.log('SUMMARY ' + JSON.stringify({ armed: EFFECTIVE_ARM, armedRequested: ARMED, custodyBoundary: CUSTODY_BOUNDARY, executorExit: child.status, ...shape, pushed: PUSH_RECEIPT }));
if (child.status !== 0) process.exit(child.status || 1);
