#!/usr/bin/env node
/**
 * book-auditor — the anti-fabrication machine.
 *
 * Lesson measured 2026-10-11 15:03: treasury-arm's book claimed "4 verified
 * broadcasts" while the chain showed ZERO treasury ops. Books lie; the chain
 * does not. This auditor cross-examines every book claim against live chain
 * history and stamps each claim VERIFIED-ON-CHAIN or FABRICATED.
 *
 * Law: a book claim without a chain-verifiable txid is not a claim.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const AG = __dirname;
const UA = 'saos-book-auditor/1';

const RPCS = {
  steem: 'https://api.steemit.com',
  hive: 'https://api.hive.blog',
  blurt: 'https://blurt-rpc.saboin.com'
};

async function rpc(chain, method, params) {
  const res = await fetch(RPCS[chain], {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  const j = await res.json();
  if (j.error) throw new Error(chain + ' rpc: ' + JSON.stringify(j.error).slice(0, 100));
  return j.result;
}

/* fetch an account's recent ops (steem-family account_history), flattened */
async function recentOps(chain, account, limit) {
  const r = await rpc(chain, 'account_history_api.get_account_history',
    { account, start: -1, limit: limit || 100 });
  const out = [];
  for (const item of (r && r.history) || []) {
    const ev = Array.isArray(item) ? item[1] : item;
    const op = ev.op;
    const t = Array.isArray(op) ? op[0] : String(op.type || '').replace('_operation', '');
    const d = Array.isArray(op) ? op[1] : (op.value || {});
    out.push({ ts: ev.timestamp, type: t, d, block: ev.block });
  }
  return out;
}

/* audit one state file: every run entry with a txid must exist in chain history */
async function auditStateFile(file, chain, accounts) {
  const findings = [];
  let state;
  try { state = JSON.parse(fs.readFileSync(path.join(AG, file), 'utf8')); }
  catch (e) { return [{ file, verdict: 'UNREADABLE', detail: String(e.message || e).slice(0, 80) }]; }
  const runs = state.runs || [];
  if (!runs.length) return [{ file, verdict: 'EMPTY', detail: 'no run claims to audit' }];
  /* pull each account's history once */
  const hist = {};
  for (const a of accounts) {
    try { hist[a] = await recentOps(chain, a, 200); } catch (e) { hist[a] = null; }
  }
  for (const run of runs) {
    const txid = run.txid;
    const acc = run.to || run.from || run.account || accounts[0];
    const h = hist[acc] || [];
    /* txid match OR (op-type + amount + timestamp-window match as fallback) */
    let onChain = h.some(op => JSON.stringify(op).indexOf(String(txid)) !== -1 && String(txid) !== 'unknown');
    if (!onChain && run.op && run.amount !== undefined) {
      const t0 = Date.parse(run.at) - 120e3, t1 = Date.parse(run.at) + 300e3;
      onChain = h.some(op => {
        const ts = Date.parse(op.ts + (op.ts.endsWith('Z') ? '' : 'Z'));
        if (Number.isNaN(ts) || ts < t0 || ts > t1) return false;
        const s = JSON.stringify(op.d);
        const opName = { powerup: 'transfer_to_vesting', delegate: 'delegate_vesting_shares', comment: 'comment' }[run.op] || run.op;
        return op.type === opName && s.indexOf(String(run.amount)) !== -1;
      });
    }
    findings.push({
      file, at: run.at, op: run.op, to: acc, amount: run.amount, txid: String(txid || '').slice(0, 20),
      verdict: onChain ? 'VERIFIED-ON-CHAIN' : 'FABRICATED'
    });
  }
  return findings;
}

async function main() {
  const all = [];
  /* treasury claims live on steem+hive+blurt; account fields vary per chain */
  try { all.push(...await auditStateFile('treasury-state.json', 'steem', ['headcorner', 'haran', 'cashmachine', 'wic', 'woq', 'tov'])); } catch (e) { all.push({ file: 'treasury-state.json', verdict: 'AUDIT-ERROR', detail: String(e.message || e).slice(0, 100) }); }
  try { all.push(...await auditStateFile('treasury-state.json', 'hive', ['cornerstone', 'headcorner'])); } catch (e) { all.push({ file: 'treasury-state.json(hive)', verdict: 'AUDIT-ERROR', detail: String(e.message || e).slice(0, 100) }); }
  try { all.push(...await auditStateFile('blurt-connect-state.json', 'blurt', ['cornerstone', 'headcorner'])); } catch (e) { all.push({ file: 'blurt-connect-state.json', verdict: 'AUDIT-ERROR', detail: String(e.message || e).slice(0, 100) }); }

  const fabricated = all.filter(f => f.verdict === 'FABRICATED');
  const verified = all.filter(f => f.verdict === 'VERIFIED-ON-CHAIN');
  const lines = [
    '# BOOK-AUDIT · ' + new Date().toISOString(),
    '',
    'law: a book claim without a chain-verifiable txid is not a claim',
    '',
    '| file | at | op | account | amount | txid | verdict |',
    '|---|---|---|---|---|---|---|',
    ...all.map(f => '| ' + [f.file, f.at || '', f.op || '', f.to || '', f.amount !== undefined ? f.amount : '', String(f.txid || '').slice(0, 16), f.verdict].join(' | ') + ' |'),
    '',
    'verified: ' + verified.length + ' · fabricated: ' + fabricated.length, ''
  ];
  if (fabricated.length) {
    lines.push('## FABRICATION ALERT', '', 'The books claimed work the chain never recorded. Every FABRICATED row above is', 'a claim that must be treated as false until a real txid appears. This is the', 'exact disease the owner reported for a month — now caught mechanically.', '');
  }
  fs.writeFileSync(path.join(AG, 'book-audit.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(AG, 'book-audit-state.json'), JSON.stringify({
    schema: 'saos/book-audit/1', at: new Date().toISOString(),
    verified: verified.length, fabricated: fabricated.length, findings: all
  }, null, 2) + '\n');
  console.log('BOOK-AUDIT-DONE verified=' + verified.length + ' fabricated=' + fabricated.length);
  for (const f of fabricated) console.log('FABRICATED ' + f.file + ' ' + (f.op || '') + ' ' + (f.to || '') + ' txid=' + (f.txid || 'none'));
  /* loud: fabrications must be visible, but the auditor itself must not gate the fleet */
  process.exit(0);
}

main().catch(e => { console.error('BOOK-AUDIT-FATAL', e); process.exit(0); });
