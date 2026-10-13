#!/usr/bin/env node
/**
 * blurt-connect — connect the fleet's blurt accounts (owner mission 2026-10-11).
 * v2: official blurtjs lib (baked chain_id cd8d90f2…), full-authority serialization
 * (owner/active passed unchanged — the null-serialization bug of v1 measured in run
 * 38147360100), key-census before signing.
 *
 * Lane: connect (CR-0076, directives chain i=3). Tools: account_update + comment.
 * Flow per candidate account:
 *   1. STASIS gate at sign time (fail-closed)
 *   2. census: which secret holds the ACTIVE authority (bit-compare)
 *   3. additive posting-authority update (keeps all existing posting keys)
 *   4. read-back: posting auth contains the grid posting pubkey
 *   5. verification comment signed with the dedicated POSTING key
 */
'use strict';
const fs = require('fs');
const path = require('path');
const GATE = require('./capital-gate.cjs');
const blurt = require('@blurtfoundation/blurtjs');

const AG = __dirname;
const PLAN = JSON.parse(fs.readFileSync(path.join(AG, 'treasury-plan.json'), 'utf8'));
const BLURT = PLAN.blurt;
const STATE_F = path.join(AG, 'blurt-connect-state.json');
const BOOK_F = path.join(AG, 'blurt-connect-book.md');

function nowIso() { return new Date().toISOString(); }
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_F, 'utf8')); } catch (_) { return { schema: 'saos/blurt-connect-state/1', runs: [] }; } }
function saveState(s) { fs.writeFileSync(STATE_F, JSON.stringify(s, null, 2) + '\n'); }
const rows = [];
function row(op, detail, status) { rows.push('| ' + nowIso() + ' | ' + op + ' | ' + detail + ' | ' + status + ' |'); console.log('BLURT-CONNECT-' + status.toUpperCase() + ' ' + op + ' ' + detail); }
function commitBlock() { return ['', '## BLURT-CONNECT RUN · ' + nowIso(), '', '| at | op | detail | status |', '|---|---|---|---|', ...rows, ''].join('\n'); }
function book() { fs.appendFileSync(BOOK_F, commitBlock() + '\n'); }

const RPC = BLURT.rpc;
async function rpc(method, params) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'saos-blurt-connect/2' }, body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) });
  const j = await res.json();
  if (j.error) throw new Error('rpc: ' + JSON.stringify(j.error).slice(0, 140));
  return j.result;
}

function bcast(fn, ...args) {
  return new Promise((resolve, reject) => {
    try { blurt.broadcast[fn](...args, (e, r) => e ? reject(e) : resolve(r)); }
    catch (e) { reject(e); }
  });
}

async function main() {
  const postingWif = (process.env[BLURT.posting.wif_env] || '').trim();
  if (!postingWif) { row('gate', BLURT.posting.wif_env + ' missing (set repo secret)', 'refused'); book(); process.exit(0); }

  if (GATE.stasisHalt('account_update')) { row('gate', 'STASIS halt on account_update', 'gated'); book(); process.exit(0); }

  blurt.config.set('url', RPC);
  blurt.config.set('websocket', RPC);
  blurt.config.set('chain_id', BLURT.chain_id);
  blurt.config.set('address_prefix', 'BLT');
  blurt.api.setOptions({ url: RPC, websocket: RPC, transport: 'http', useAppbase: false });
  row('config', 'chain_id=' + String(BLURT.chain_id).slice(0, 10) + '… (official blurtjs config)', 'ok');

  const CENSUS = require('./key-census.cjs');
  const state = loadState();
  const candidates = (BLURT.census_candidates || []).map(n => ({ name: n }));
  const newPub = BLURT.posting.pub;
  let connectedTo = null;

  for (const account of ['cornerstone', 'headcorner']) {
    if (GATE.stasisHalt('account_update')) { row('gate', 'STASIS halt mid-loop', 'gated'); break; }
    const a = (await rpc('condenser_api.get_accounts', [[account]]))[0];
    if (!a) { row('check', '@' + account + ' not found on blurt', 'skip'); continue; }
    const already = ((a.posting && a.posting.key_auths) || []).some(k => k[0] === newPub) || (a.posting && a.posting.key === newPub);
    if (already) { row('check', '@' + account + ' posting auth already has grid key', 'idempotent-skip'); connectedTo = account; continue; }

    const found = await CENSUS.resolve({ rpc, account, role: 'active', steem: blurt, candidates });
    if (!found) { row('census', '@' + account + ' no candidate secret matches live active authority', 'refused'); continue; }

    /* additive posting auth; owner/active passed UNCHANGED (full authority objects) */
    const posting = a.posting || {};
    const newPosting = {
      weight_threshold: posting.weight_threshold || 1,
      account_auths: posting.account_auths || [],
      key_auths: [...(posting.key_auths || []), [newPub, 1]]
    };
    try {
      /* owner/active fields are OMITTED — in steemd-family consensus, the mere
       * presence of the owner field requires an owner signature. Omission = unchanged. */
      const op = ['account_update', {
        account,
        posting: newPosting,
        memo_key: a.memo_key || '',
        json_metadata: typeof a.json_metadata === 'string' ? a.json_metadata : JSON.stringify(a.json_metadata || {}),
        posting_json_metadata: typeof a.posting_json_metadata === 'string' && a.posting_json_metadata ? a.posting_json_metadata : JSON.stringify({ profile: {} })
      }];
      await blurt.broadcast.sendAsync({ operations: [op], extensions: [] }, { active: found.wif });
      let verified = false;
      for (let i = 0; i < 6 && !verified; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const chk = (await rpc('condenser_api.get_accounts', [[account]]))[0];
        if (chk && chk.posting && ((chk.posting.key_auths || []).some(k => k[0] === newPub) || chk.posting.key === newPub)) verified = true;
      }
      row('account_update', '@' + account + ' posting auth + grid key (census=' + found.secretName + '), read-back=' + verified, verified ? 'verified' : 'RED-UNVERIFIED');
      state.runs.push({ at: nowIso(), account, op: 'account_update', census: found.secretName, verified });
      if (!verified) { saveState(state); book(); process.exit(1); }
      connectedTo = account;
      break; /* one connect per run (CR-0076 ops cap) */
    } catch (e) {
      const msg = String(e.message || e);
      if (/sufficient funds|balance >= fee/i.test(msg)) {
        row('account_update', '@' + account + ' signature ACCEPTED but blurt charges an account_update fee above liquid balance — funding gap, not a machine failure (provision: fund the account or set the cornerstone active key)', 'BLUE-NEEDS-FUNDING');
        saveState(state); book(); process.exit(0);
      }
      row('account_update', '@' + account + ' broadcast refused: ' + msg.replace(/\s+/g, ' ').slice(0, 120), 'no-authority-or-error');
      continue;
    }
  }

  if (!connectedTo) { row('summary', 'no blurt account connected this run — census lines above say exactly which secrets were tried', 'RED-UNCONNECTED'); saveState(state); book(); process.exit(1); }

  /* verification comment with dedicated posting key */
  if (GATE.stasisHalt('comment')) { row('gate', 'STASIS halt on comment', 'gated'); saveState(state); book(); process.exit(0); }
  const d = new Date();
  const permlink = 'saos-connect-verify-' + d.toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7);
  const title = 'SAOS grid — Blurt connectivity verification';
  const body = [
    'This account is now connected to the SAOS sovereign grid posting pipeline (CI-native, GitHub-hosted).',
    '',
    'This is a **connectivity verification post** — it proves the posting path end-to-end: dedicated posting key, additive posting authority (existing keys untouched), and signed broadcast through the connect lane under hard caps and read-back verification.',
    '',
    'Disclosure: פורסם באמצעות אוטומציה / published via automation — part of the fleet coordination protocol.',
    '',
    'No financial content, no requests, verification purpose only.',
    '',
    '- chain: blurt',
    '- lane: connect (CR-0076, directives chain i=3)',
    '- verified: read-back of posting authority + this signed post'
  ].join('\n');
  const json = JSON.stringify({ tags: ['blurt', 'saos', 'verification'], app: 'saos-grid-connect/2' });
  try {
    const op2 = ['comment', {
      parent_author: '',
      parent_permlink: 'blurt',
      author: connectedTo,
      permlink,
      title,
      body,
      json_metadata: json
    }];
    await blurt.broadcast.sendAsync({ operations: [op2], extensions: [] }, { posting: postingWif });
    let verified = false;
    for (let i = 0; i < 5 && !verified; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const c = await rpc('condenser_api.get_content', [connectedTo, permlink]).catch(() => null);
      if (c && c.author === connectedTo) verified = true;
    }
    row('comment', '@' + connectedTo + ' permlink=' + permlink + ' read-back=' + verified, verified ? 'verified' : 'RED-UNVERIFIED');
    state.runs.push({ at: nowIso(), account: connectedTo, op: 'comment', permlink, verified });
  } catch (e) {
    row('comment', '@' + connectedTo + ' failed: ' + String(e.message || e).replace(/\s+/g, ' ').slice(0, 120), 'RED-FAILED');
  }

  saveState(state);
  book();
  console.log('BLURT-CONNECT-DONE connected=' + connectedTo);
  process.exit(0);
}

main().catch(e => { console.error('BLURT-CONNECT-FATAL', e); row('fatal', String(e.message || e).replace(/\s+/g, ' ').slice(0, 140), 'RED-FATAL'); book(); process.exit(1); });
