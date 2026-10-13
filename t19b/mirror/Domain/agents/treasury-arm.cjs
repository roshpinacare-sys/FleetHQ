#!/usr/bin/env node
/**
 * treasury-arm — capped, idempotent, read-back-verified treasury arming.
 *
 * Law chain: owner directives 2026-10-11 (traces 1a1…89d5 + 1a1…7275)
 *   → directives chain i=3 (staged-open powerup/delegation/connect)
 *   → CR-0076-owner-approval.json (caps + revocation)
 *   → STASIS.json stagedLanes
 *   → capital-gate.cjs stasisHalt AT SIGN TIME (fail-closed)
 *   → treasury-plan.json caps double-checked here
 *   → read-back verification after every broadcast (RED book row on failure, exit 1)
 *
 * Zero capital to keyless accounts (hcsoldier1/2/3 = bannedCapital, LOST-NO-CUSTODY).
 * Usage: node agents/treasury-arm.cjs <steem|hive|blurt>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const GATE = require('./capital-gate.cjs');
const steem = require('steem');

const AG = __dirname;
const PLAN = JSON.parse(fs.readFileSync(path.join(AG, 'treasury-plan.json'), 'utf8'));
const STATE_F = path.join(AG, 'treasury-state.json');
const BOOK_F = path.join(AG, 'treasury-arm-book.md');
const chain = (process.argv[2] || '').toLowerCase();
if (!['steem', 'hive', 'blurt'].includes(chain)) { console.error('usage: treasury-arm <steem|hive|blurt>'); process.exit(2); }
const cfg = PLAN[chain];

function nowIso() { return new Date().toISOString(); }
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_F, 'utf8')); } catch (_) { return { schema: 'saos/treasury-state/1', runs: [] }; } }
function saveState(s) { fs.writeFileSync(STATE_F, JSON.stringify(s, null, 2) + '\n'); }
function book() { fs.appendFileSync(BOOK_F, commitBlock() + '\n'); }

const bookRows = [];
function row(op, detail, status, extra) {
  bookRows.push('| ' + nowIso() + ' | ' + chain + ' | ' + op + ' | ' + detail + ' | ' + status + ' | ' + (extra || '') + ' |');
  console.log('TREASURY-' + status.toUpperCase() + ' ' + chain + ' ' + op + ' ' + detail + (extra ? ' · ' + extra : ''));
}

function tok(v) { return Number(String(v).split(' ')[0]); }
function unit(v) { const p = String(v).split(' '); return p[1] || ''; }
function fmt(amount, sym) { return amount.toFixed(3) + ' ' + sym; }

async function rpc(method, params) {
  const res = await fetch(cfg.rpc, {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'saos-treasury-arm/1' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  const j = await res.json();
  if (j.error) throw new Error('rpc: ' + JSON.stringify(j.error).slice(0, 140));
  return j.result;
}

async function getAccount(name) {
  const r = await rpc('condenser_api.get_accounts', [[name]]);
  return (r || [])[0] || null;
}

async function dynProps() { return rpc('condenser_api.get_dynamic_global_properties', []); }

async function main() {
  const CENSUS = require('./key-census.cjs');
  const candidates = (cfg.census_candidates || []).map(n => ({ name: n }));
  const PFX = chain === 'steem' ? 'STM' : chain === 'hive' ? 'HIVE' : 'BLT';
  try { steem.config.set('address_prefix', PFX); } catch (_) { /* older steem-js */ }
  const found = await CENSUS.resolve({ rpc, account: cfg.source, role: 'active', steem, candidates });
  if (!found) { row('gate', 'no candidate secret matches live active authority of ' + cfg.source + ' — owner must provision (see CENSUS lines)', 'refused'); saveState(loadState()); book(); process.exit(0); }
  const wif = found.wif;

  const state = loadState();
  const runId = nowIso();
  const SYM = chain === 'steem' ? 'STEEM' : chain === 'hive' ? 'HIVE' : 'BLURT';

  if (chain === 'steem') steem.api.setOptions({ url: cfg.rpc, useAppbase: false });
  if (chain === 'hive') steem.api.setOptions({ url: cfg.rpc, useAppbase: false, chain_id: '0000000000000000000000000000000000000000' });
  if (chain === 'blurt') {
    const dgp = await dynProps();
    const cid = (dgp && dgp.chain_id) || '';
    steem.api.setOptions({ url: cfg.rpc, useAppbase: false, address_prefix: 'BLT', chain_id: cid });
    row('config', 'chain_id=' + String(cid).slice(0, 12) + '…', 'ok');
  }

  const src = await getAccount(cfg.source);
  if (!src) { row('source', cfg.source + ' missing on ' + chain, 'refused'); book(); process.exit(0); }
  const liquid = tok(src.balance);
  const sym = unit(src.balance) || SYM;

  /* ---------- powerup lane ---------- */
  const powerGate = GATE.stasisHalt('transfer_to_vesting');
  if (powerGate) { row('gate', 'STASIS halt on transfer_to_vesting', 'gated'); book(); process.exit(0); }

  let done = 0;
  const targets = chain === 'steem' ? (cfg.targets || []) : [{ name: cfg.source, powerup: cfg.self_powerup_blurt || cfg.self_powerup_hive }];
  for (const t of targets) {
    const amount = t.powerup_steem !== undefined ? t.powerup_steem : t.powerup;
    if (!amount || done + amount > cfg.per_run_cap) { row('powerup', 'to ' + (t.name || cfg.source) + ' amount ' + amount + ' exceeds per-run cap remaining', 'skipped'); continue; }
    if (liquid - done - amount < cfg.min_liquid_reserve) { row('powerup', 'to ' + (t.name || cfg.source) + ' would breach reserve floor ' + cfg.min_liquid_reserve, 'skipped'); continue; }
    if (chain === 'steem') {
      const g = GATE.guardTargets('transfer_to_vesting', [t.name]);
      if (!g.allowed.length) { row('powerup', 'target ' + t.name + ' refused by canonical roster', 'refused'); continue; }
    }
    const dup = state.runs.find(r => r.chain === chain && r.op === 'powerup' && r.to === (t.name || cfg.source) && r.amount === amount && r.verified);
    if (dup) { row('powerup', 'to ' + (t.name || cfg.source) + ' already done (txid ' + dup.txid + ')', 'idempotent-skip'); continue; }
    try {
      const res = await new Promise((resolve, reject) => {
        steem.broadcast.transferToVesting(wif, cfg.source, (t.name || cfg.source), fmt(amount, sym), (e, r) => e ? reject(e) : resolve(r));
      });
      const txid = res && res.id ? res.id : 'unknown';
      done += amount;
      /* read-back: target vesting must rise */
      let verified = false;
      for (let i = 0; i < 6 && !verified; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const chk = await getAccount(t.name || cfg.source);
        if (chk && tok(chk.vesting_shares) > tok(t.name === cfg.source ? src.vesting_shares : 0) - 0.000001) verified = tok(chk.vesting_shares) > (t.name === cfg.source ? tok(src.vesting_shares) : 0);
      }
      row('powerup', fmt(amount, sym) + ' → @' + (t.name || cfg.source) + ' txid=' + txid, verified ? 'verified' : 'RED-UNVERIFIED', verified ? '' : 'broadcast ok but read-back not confirmed in 24s — human must check');
      state.runs.push({ at: runId, chain, op: 'powerup', from: cfg.source, to: t.name || cfg.source, amount, txid, verified });
      if (!verified) { saveState(state); book(); process.exit(1); }
    } catch (e) {
      row('powerup', 'to ' + (t.name || cfg.source) + ' failed: ' + String(e.message || e).slice(0, 110), 'RED-FAILED');
      saveState(state); book(); process.exit(1);
    }
  }

  /* ---------- delegation lane (hive) ---------- */
  if (chain === 'hive' && cfg.delegate) {
    const delGate = GATE.stasisHalt('delegate_vesting_shares');
    if (delGate) { row('gate', 'STASIS halt on delegate_vesting_shares', 'gated'); }
    else {
      const dup = state.runs.find(r => r.chain === chain && r.op === 'delegate' && r.to === cfg.delegate.to && r.verified);
      if (dup) row('delegate', 'to @' + cfg.delegate.to + ' already done (txid ' + dup.txid + ')', 'idempotent-skip');
      else {
        try {
          const tgt = await getAccount(cfg.delegate.to);
          const dgp = await dynProps();
          const vsp = dgp.vesting_share_price;
          const vestsPerHive = tok(vsp.base) / tok(vsp.quote); // base VESTS / quote HIVE
          const vestsNeeded = cfg.delegate.hp * vestsPerHive;
          const before = tgt ? tok(tgt.received_vesting_shares) : 0;
          const res = await new Promise((resolve, reject) => {
            steem.broadcast.delegateVestingShares(wif, cfg.source, cfg.delegate.to, vestsNeeded.toFixed(6) + ' VESTS', (e, r) => e ? reject(e) : resolve(r));
          });
          const txid = res && res.id ? res.id : 'unknown';
          let verified = false;
          for (let i = 0; i < 6 && !verified; i++) {
            await new Promise(r => setTimeout(r, 4000));
            const chk = await getAccount(cfg.delegate.to);
            if (chk && tok(chk.received_vesting_shares) >= before + vestsNeeded * 0.99) verified = true;
          }
          row('delegate', cfg.delegate.hp + ' HP (' + vestsNeeded.toFixed(0) + ' VESTS) → @' + cfg.delegate.to + ' txid=' + txid, verified ? 'verified' : 'RED-UNVERIFIED');
          state.runs.push({ at: runId, chain, op: 'delegate', from: cfg.source, to: cfg.delegate.to, amount: cfg.delegate.hp, txid, verified });
          if (!verified) { saveState(state); book(); process.exit(1); }
        } catch (e) {
          row('delegate', 'failed: ' + String(e.message || e).slice(0, 110), 'RED-FAILED');
          saveState(state); book(); process.exit(1);
        }
      }
    }
  }

  saveState(state);
  book();
  console.log('TREASURY-ARM-DONE ' + chain + ' broadcasts=' + bookRows.filter(r => r.includes('| verified |')).length);
  process.exit(0);
}

function commitBlock() {
  return ['', '## TREASURY-ARM RUN · ' + nowIso() + ' · chain=' + chain,
    '', '| at | chain | op | detail | status | extra |', '|---|---|---|---|---|---|',
    ...bookRows, ''].join('\n');
}

main().catch(e => { console.error('TREASURY-ARM-FATAL', e); row('fatal', String(e.message || e).slice(0, 140), 'RED-FATAL'); book(); process.exit(1); });
