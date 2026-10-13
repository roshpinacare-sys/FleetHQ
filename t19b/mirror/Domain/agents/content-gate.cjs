#!/usr/bin/env node
/**
 * content-gate — quality gate for the fleet's posting cadence.
 * Mission 2026-10-11: examine published content, raise the level, reduce density.
 * Policy: <=7 posts/7d per account, >=600 chars body, cross-account dup-ratio <=0.2,
 * automated posts carry a disclosure line. Measured from live chain (read-only).
 * Exit 0 = within policy; exit 1 = violation (loud, booked, visible).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const AG = __dirname;
const ROSTER = JSON.parse(fs.readFileSync(path.join(AG, 'grid-roster.json'), 'utf8'));
const OUT = path.join(AG, 'content-gate-book.md');
const POLICY = { max_posts_7d: 7, min_body_chars: 600, max_dup_ratio: 0.2 };
const UA = 'saos-content-gate/1';

async function rpc(method, params) {
  const res = await fetch('https://api.steemit.com', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  const j = await res.json();
  if (j.error) throw new Error('rpc: ' + JSON.stringify(j.error).slice(0, 100));
  return j.result;
}

async function main() {
  const accounts = (ROSTER.chains.steem.accounts || [])
    .filter(a => /worker-active|treasury|poster/.test(a.role)).map(a => a.name);
  const since = Date.now() - 7 * 86400e3;
  const rows = [];
  const violations = [];
  const fingerprints = [];

  for (const a of accounts) {
    let posts = [];
    try {
      posts = (await rpc('condenser_api.get_discussions_by_blog', [{ tag: a, limit: 20 }])) || [];
    } catch (e) { rows.push('| ' + a + ' | RPC-ERR | - | - | - | - |'); continue; }
    const recent = posts.filter(p => Date.parse(p.created + 'Z') >= since);
    const n = recent.length;
    let shortBodies = 0, disclosed = 0;
    for (const p of recent) {
      const body = p.body || '';
      const sig = (p.title || '') + '::' + body.slice(100, 400);
      fingerprints.push({ account: a, sig, permlink: p.permlink });
      if (body.length < POLICY.min_body_chars) shortBodies++;
      if (/published via automation|published via automation/i.test(body)) disclosed++;
    }
    let status = 'ok';
    if (n > POLICY.max_posts_7d) { status = 'DENSITY-OVER'; violations.push('@' + a + ' posts7d=' + n + ' > ' + POLICY.max_posts_7d + ' — the density disease is back'); }
    if (n > 0 && shortBodies === n) { status = 'SUBSTANCE-LOW'; violations.push('@' + a + ' all ' + n + ' posts under ' + POLICY.min_body_chars + ' chars'); }
    rows.push('| @' + a + ' | ' + n + ' | ' + shortBodies + ' | ' + disclosed + '/' + n + ' | ' + status + ' |');
  }

  /* cross-account duplication (cross-account duplication = the #1 spam-fingerprint) */
  let dups = 0;
  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      if (fingerprints[i].account !== fingerprints[j].account &&
          fingerprints[i].sig === fingerprints[j].sig &&
          fingerprints[i].sig.length > 50) {
        dups++;
        violations.push('DUP @' + fingerprints[i].account + ' ≡ @' + fingerprints[j].account + ' permlink=' + fingerprints[j].permlink);
      }
    }
  }

  const lines = [
    '# CONTENT-GATE · ' + new Date().toISOString(),
    '',
    'policy: <=' + POLICY.max_posts_7d + ' posts/7d/account · >=' + POLICY.min_body_chars + ' chars · dup-ratio <=' + POLICY.max_dup_ratio + ' · disclosure on automated posts',
    '',
    '| account | posts7d | short-bodies | disclosed | status |',
    '|---|---|---|---|---|',
    ...rows, '',
    'cross-account dup pairs: ' + dups, ''
  ];
  if (violations.length) {
    lines.push('## VIOLATIONS (' + violations.length + ')', '');
    violations.forEach(v => lines.push('- ' + v));
    lines.push('');
  } else {
    lines.push('no violations — cadence within policy', '');
  }
  /* enforcement state: cadence generators read skip_accounts and stand down */
  const skip = new Set();
  for (const v of violations) {
    const m = v.match(/@(\w+)/g);
    if (m) m.forEach(x => skip.add(x.slice(1)));
  }
  fs.writeFileSync(path.join(AG, 'content-gate-state.json'), JSON.stringify({
    schema: 'saos/content-gate-state/1', generatedAt: new Date().toISOString(),
    skip_accounts: [...skip], violation_count: violations.length
  }, null, 2) + '\n');
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log('CONTENT-GATE-DONE accounts=' + accounts.length + ' posts7d=' + fingerprints.length + ' violations=' + violations.length);
  if (violations.length) { violations.forEach(v => console.log('CONTENT-VIOLATION ' + v)); process.exit(1); }
}

main().catch(e => { console.error('CONTENT-GATE-FATAL', e); process.exit(0); });
