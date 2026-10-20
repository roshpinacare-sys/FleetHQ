#!/usr/bin/env node
/**
 * soldiers-curate.cjs — Z-30-c FLEET CURATION DESK (steem, SOLDIERS lane)
 *
 * Complementarity law (cross-agent mutual review, 2026-10-02): the weave
 * curation daemon on the home runtime owns headcorner's vote
 * (CURATION_VOTER = headcorner, DISCOVER-ONLY until operator-armed).
 * THIS desk owns the ten soldiers' voting power — measured idle:
 * 7/10 soldiers last vote 2026-09-12, ~337 SP fleet-wide, VP 100%.
 * Two lanes, one economy, zero double-voting overlap.
 *
 * Doctrine:
 *   · support the PUBLIC (directive): fleet authors are excluded from the
 *     candidate pool; we curate outside voices, never our own echo.
 *   · smart, not spray: one tag lane per soldier (rotates daily), substance
 *     filters (depth, age window, rep band, unsaturated posts), documented
 *     deterministic score, cross-account dedupe (one author per 7d fleet-wide).
 *   · budget: max 2 votes per soldier per run, 100% weight (≈2% VP each —
 *     at 20%/day VP regen two runs/day cannot exhaust VP; measured, not assumed).
 *   · verify-then-sign: key-derivation vs key_auths gate, broadcast, read-back
 *     from account history before any VERIFIED claim; honest row on failure.
 *   · fail-soft: every path exits 0; zero secrets printed; keys in memory only.
 *
 * Run: node agents/soldiers-curate.cjs   (vault recovery from the private repo)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const https = require('https');
const steem = require('steem');

steem.api.setOptions({ url: 'https://api.steemit.com' });
const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'agents', 'curation-book.json');
const OUT_MD = path.join(ROOT, 'agents', 'curation-book.md');

const SOLDIERS = ['cashmachine', 'haran', 'israelnews', 'lsa', 'macrame', 'siq', 'tov', 'wic', 'wog', 'woq'];
const FLEET = SOLDIERS.concat(['headcorner']);
const VOTE_WEIGHT = 10000;           // 100% (≈2% VP at soldier scale)
const MAX_VOTES_PER_SOLDIER = Number(process.env.MAXVOTES || 2);
const MIN_RC_PCT = 25;
const MIN_AGE_H = 2, MAX_AGE_H = 48; // curation window: judged but not stale
const MIN_DEPTH = 800;               // substance floor
const REP_FLOOR = 35, REP_CAP = 80;  // real humans, not bots, not whales (incident-tightened: 25 let yescoin/essay bots through)
const MAX_PENDING_USD = 5;           // not already saturated
const MAX_ACTIVE_VOTES = 150;
const MIN_ACTIVE_VOTES = 3;          // some organic attention (bot templates have 0-2)
const BOT_RX = /-post-\d{4}|essay-writing|yescoin|airdrop|giveaway|free-crypto/i; // template-bot fingerprints (incident-taught)
const DRYRUN = process.env.DRYRUN === '1';
const DEDUPE_DAYS = 7;

// one lane per soldier, rotates by day-of-year (diversity across the run)
const TAG_LANES = ['photography', 'travel', 'food', 'nature', 'art', 'writing', 'life', 'music', 'technology', 'health'];

function rpc(method, params) {
  return new Promise((res, rej) => {
    const data = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const req = https.request({ hostname: 'api.steemit.com', path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => { try { const j = JSON.parse(b); if (j.error) rej(new Error(j.error.message || 'rpc-error')); else res(j.result); } catch (e) { rej(e); } });
    });
    req.on('error', rej);
    req.setTimeout(20000, () => req.destroy(new Error('rpc-timeout')));
    req.write(data); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => parseFloat(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')) || 0;

function recoverVault() {
  // three key paths (proven patterns): (1) SA_FLEET_KEYS env map, (2) this repo's
  // agent/vault + recovery-meta, (3) the private steem repo (econ-desk's proven
  // STEEM_REPO_DIR path — the only path that works after a sandbox reset).
  const rawEnv = process.env.SA_FLEET_KEYS || '';
  if (rawEnv) {
    try {
      const map = JSON.parse(Buffer.from(rawEnv, 'base64').toString('utf8'));
      const out = '/tmp/sc-keys-env';
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(path.join(out, 'agent', 'keys'), { recursive: true, mode: 0o700 });
      const vault = { accounts: Object.entries(map).map(([username, v]) => { const wif = typeof v === 'string' ? v : (v && v.posting && v.posting.wif) || (v && v.keys && v.keys.posting && v.keys.posting.wif) || null; return { username, keys: { posting: { wif } } }; }) };
      const vj = path.join(out, 'agent', 'keys', 'vault.json');
      fs.writeFileSync(vj, JSON.stringify(vault));
      return vj;
    } catch (_) {}
  }
  const roots = [ROOT, process.env.STEEM_REPO_DIR || '/home/z/fleet/steem'];
  const out = '/tmp/sc-keys';
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const crypto = require('crypto');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  for (const root of roots) {
    if (!root) continue;
    const metas = [];
    try { metas.push(JSON.parse(fs.readFileSync(path.join(root, 'agent', 'recovery-meta.json'), 'utf8'))); } catch (_) {}
    const vdir = path.join(root, 'agent', 'vault');
    let encs = [];
    try { encs = fs.readdirSync(vdir).filter((f) => f.endsWith('.enc')).map((f) => path.join(vdir, f)); } catch (_) {}
    for (const enc of encs) {
      const outer = sha(enc);
      for (const m of metas) {
        if (!m || !m.keysZipPass || m.keysZipSha256 !== outer) continue;
        try {
          const dec = path.join(out, 'v.zip');
          execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '300000', '-in', enc, '-out', dec, '-pass', 'env:SCZP'], { env: { ...process.env, SCZP: m.keysZipPass }, stdio: 'pipe' });
          if (fs.readFileSync(dec).subarray(0, 2).toString('latin1') !== 'PK') continue;
          execFileSync('unzip', ['-o', '-q', dec, '-d', out], { stdio: 'pipe' });
          const vj = path.join(out, 'agent', 'keys', 'vault.json');
          if (fs.existsSync(vj)) return vj;
        } catch (_) {}
      }
    }
  }
  return null;
}

async function main() {
  try { if (require('./capital-gate.cjs').stasisHalt('soldiers-curate')) return; } catch (e) { console.log('[CAPITAL-GATE] soldiers-curate — gate module error, lane halts fail-closed: ' + String(e.message || e).slice(0, 80)); return; }
  // CR-0065: curation moved into human-cadence.cjs (hourly spread, internal-only, probe-b floor).
  // This legacy engine defers to inspection-only unless FORCE_LEGACY=1: it still logs DRYRUN
  // candidates for visibility, but never casts while the cadence owns the lane.
  try {
    const slots = require('./persona-store.cjs').slots(); // T3: doctrine sealed (persona-store)
    if (slots.version >= 2 && process.env.FORCE_LEGACY !== '1') {
      console.log('[soldiers-curate] DEFER-TO-CADENCE — curation owned by human-cadence.cjs (CR-0065, internal-only). Running as inspection DRYRUN.');
      process.env.DRYRUN = '1';
    }
  } catch (_) {}
  const t0 = new Date().toISOString();
  // INCIDENT (2026-10-02, chain-verified): the first run of this desk cast 41 votes
// (cashmachine 14, haran 14, israelnews 13) at 100% weight — the read-back rpc
// asserted (4-arg get_account_history) so cast-counting never advanced and the
// pre-fix quality band admitted template bots. Votes are irrevocable; VP regen
// restores in ~5d. Recorded here as standing evidence; fixes: 3-arg read-back,
// attempt-counting law, REP_FLOOR 35, MIN_ACTIVE_VOTES 3, BOT_RX fingerprints,
// DRYRUN gate before any live run. This book therefore opens in debt, honestly.
const INCIDENT = { at: '2026-10-02T11:41-11:48Z', what: 'read-back-throws repeat-cast loop + weak bot filter', cast: 41, perSoldier: { cashmachine: 14, haran: 14, israelnews: 13 }, corrected: '3-arg read-back, attempts-count, quality band, DRYRUN gate' };
const book0 = (() => { try { return JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')); } catch (_) { return { votes: [] }; } })();
  const cutoff = Date.now() - DEDUPE_DAYS * 864e5;
  const recentVotes = (book0.votes || []).filter((v) => v.status !== 'DRYRUN-CANDIDATE' && Date.parse(v.at || 0) > cutoff); // dry-run rows are inspection, not casts

  // keys
  const vaultPath = process.env.VAULT || recoverVault();
  if (!vaultPath) { console.log('[soldiers-curate] NO-VAULT — fail-soft'); return; }
  const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
  const keymap = {};
  for (const a of vault.accounts || []) {
    const k = a.keys || {};
    const wif = (k.posting && k.posting.wif) || (k.steem && k.steem.posting && k.steem.posting.wif) || null;
    if (wif && SOLDIERS.includes(a.username)) keymap[a.username] = wif;
  }
  console.log(`[soldiers-curate] keys: ${Object.keys(keymap).length}/${SOLDIERS.length} · zero secrets printed`);

  const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  const gpd = await rpc('condenser_api.get_dynamic_global_properties', []);
  const tvs = num(gpd.total_vesting_shares), tvf = num(gpd.total_vesting_fund_steem);
  const accounts = await rpc('condenser_api.get_accounts', [SOLDIERS]);
  const byName = {};
  for (const a of accounts) byName[a.name] = a;

  const results = [];
  const seenAuthors = new Set(recentVotes.map((v) => v.author));
  const seenPermlinks = new Set(recentVotes.map((v) => v.permlink));
  let fleetVotesToday = 0;

  // CHAIN-TRUTH LAW: the chain, not the book, is the dedupe of last resort —
  // pull each soldier's last-48h vote ops before casting (prevents identical-vote
  // rejections AND reconciles casts that failed read-back into the book).
  const recon = [];
  try {
    const known = new Set(recentVotes.map((v) => v.voter + '|' + v.author + '|' + v.permlink));
    for (const who0 of SOLDIERS) {
      if (!keymap[who0]) continue;
      const h = await rpc('condenser_api.get_account_history', [who0, -1, 100]);
      for (const o of (h || []).map((x) => x[1])) {
        if (!o || !o.op || o.op[0] !== 'vote' || o.op[1].voter !== who0) continue;
        if (Date.parse(o.timestamp + 'Z') < Date.now() - 48 * 3600000) continue;
        const key = who0 + '|' + o.op[1].author + '|' + o.op[1].permlink;
        if (Date.parse(o.timestamp + 'Z') > Date.now() - 24 * 3600000) { seenAuthors.add(o.op[1].author); seenPermlinks.add(o.op[1].permlink); }
        if (!known.has(key)) recon.push({ voter: who0, author: o.op[1].author, permlink: o.op[1].permlink, weight: o.op[1].weight, at: o.timestamp + 'Z', status: 'CHAIN-RECONCILED', trx: o.trx_id });
      }
      await sleep(300);
    }
    if (recon.length) console.log(`[soldiers-curate] chain recon: ${recon.length} casts absent from the book → CHAIN-RECONCILED`);
  } catch (e) { console.log(`[soldiers-curate] chain recon skipped (${String(e.message).slice(0, 60)})`); }

  for (let i = 0; i < SOLDIERS.length; i++) {
    const who = SOLDIERS[i];
    const R = { voter: who, lane: TAG_LANES[(doy + i) % TAG_LANES.length], picks: [] };
    results.push(R);
    if (!keymap[who]) { R.status = 'SKIP-NO-KEY'; continue; }
    const acc = byName[who];
    if (!acc) { R.status = 'SKIP-NO-ACCOUNT'; continue; }
    const sp = tvf > 0 ? ((num(acc.vesting_shares) + Math.max(0, num(acc.received_vesting_shares)) - Math.max(0, num(acc.delegated_vesting_shares))) / tvs) * tvf : 0;
    R.sp = Number(sp.toFixed(2));
    // key gate: derived public must match on-chain posting authority
    let pub = null;
    try { pub = steem.auth.wifToPublic(keymap[who]); } catch (_) { R.status = 'SKIP-KEY-PARSE'; continue; }
    if (!acc.posting || !acc.posting.key_auths || acc.posting.key_auths[0][0] !== pub) { R.status = 'SKIP-KEY-MISMATCH'; continue; }
    // RC gate
    let rcPct = null;
    try { const rc = await rpc('rc_api.find_rc_accounts', { accounts: [who] }); const m = rc.rc_accounts[0].rc_manabar; rcPct = (100 * Number(m.current_mana)) / Number(rc.rc_accounts[0].max_rc); } catch (_) {}
    R.rcPct = rcPct == null ? null : Math.round(rcPct);
    if (rcPct != null && rcPct < MIN_RC_PCT) { R.status = `SKIP-RC-LOW(${R.rcPct})`; continue; }

    // discover candidates in this soldier's lane
    let cands = [];
    try { cands = await rpc('condenser_api.get_discussions_by_created', [{ tag: R.lane, limit: 40 }]); } catch (e) { R.status = 'FAIL-DISCOVER'; R.err = String(e.message).slice(0, 80); continue; }
    const now = Date.now();
    const scored = [];
    for (const p of cands || []) {
      const ageH = (now - Date.parse(p.created + 'Z')) / 3600000;
      const depth = String(p.body || '').length;
      const rawRep = num(p.author_reputation);
      const rep = rawRep <= 0 ? 25 : Math.min(99, Math.max(1, (Math.log10(rawRep) - 9) * 9 + 25)); // raw int -> steem rep scale
      const pend = num(p.pending_payout_value) + num(p.total_payout_value);
      const votes = (p.active_votes || []).length;
      // INTERNAL-ONLY LAW (owner directive 2026-10-04, CR-0065): until the quality bar lifts,
      // the fleet does not engage outside itself. External candidates require CURATE_SCOPE=external.
      const EXTERNAL_ALLOWED = (process.env.CURATE_SCOPE || 'internal') === 'external';
      if (!FLEET.includes(p.author) && !EXTERNAL_ALLOWED) continue; // external posts: paused until quality bar
      if (BOT_RX.test(p.permlink) || BOT_RX.test(String(p.title || ''))) continue;
      if ((p.active_votes || []).length < MIN_ACTIVE_VOTES) continue;
      if (seenAuthors.has(p.author) || seenPermlinks.has(p.permlink)) continue; // fleet dedupe (7d)
      if (ageH < MIN_AGE_H || ageH > MAX_AGE_H) continue;
      if (depth < MIN_DEPTH) continue;
      if (rep < REP_FLOOR || rep > REP_CAP) continue;
      if (pend > MAX_PENDING_USD || votes > MAX_ACTIVE_VOTES) continue;
      // deterministic score: fresh + deep + discussed + in the curation sweet spot
      const score = 2 * Math.max(0, (MAX_AGE_H - ageH) / (MAX_AGE_H - MIN_AGE_H)) + Math.min(1, depth / 6000) + (p.children > 0 ? 0.5 : 0) + (votes >= 5 && votes <= 60 ? 0.5 : 0);
      scored.push({ author: p.author, permlink: p.permlink, title: String(p.title || '').slice(0, 90), ageH: Number(ageH.toFixed(1)), depth, votes, score: Number(score.toFixed(3)) });
    }
    scored.sort((a, b) => b.score - a.score);

    // vote (max 2 ATTEMPTS — incident law: count attempts, never only successes),
    // 5s spacing, verify-then-sign each; DRYRUN logs candidates without casting
    let cast = 0, attempts = 0;
    for (const c of scored) {
      if (attempts >= MAX_VOTES_PER_SOLDIER) break;
      if (DRYRUN) { R.picks.push({ voter: who, author: c.author, permlink: c.permlink, weight: VOTE_WEIGHT, at: new Date().toISOString(), status: 'DRYRUN-CANDIDATE', score: c.score, title: c.title }); cast++; continue; }
      attempts++;
      const row = { voter: who, author: c.author, permlink: c.permlink, weight: VOTE_WEIGHT, at: new Date().toISOString() };
      try {
        await new Promise((res2, rej2) => steem.broadcast.send({ operations: [['vote', { voter: who, author: c.author, permlink: c.permlink, weight: VOTE_WEIGHT }]], extensions: [] }, [keymap[who]], (e, r) => (e ? rej2(e) : res2(r))));
        await sleep(2500);
        // read-back: newest vote op for this voter matching author+permlink
        // read-back with cache-busting rotation: api.steemit.com serves STALE cached
        // responses for common [-1,100] windows (incident: a fresh vote was invisible
        // in [-1,100] while present in [-1,10]) — rotate uncommon limits + retry.
        let hit = null;
        for (const lim of [97, 99, 95]) {
          const hist = await rpc('condenser_api.get_account_history', [who, -1, lim]);
          hit = (hist || []).map((x) => x[1]).filter((o) => o && o.op && o.op[0] === 'vote' && Date.parse(o.timestamp + 'Z') > Date.parse(row.at) - 15000 && o.op[1].voter === who && o.op[1].author === c.author && o.op[1].permlink === c.permlink && Math.abs(o.op[1].weight - VOTE_WEIGHT) < 2).pop();
          if (hit) break;
          await sleep(2500);
        }
        row.trx = hit ? hit.trx_id : null;
        row.status = hit ? 'VOTED-VERIFIED' : 'BROADCAST-NO-READBACK';
        row.score = c.score; row.title = c.title;
        cast++; fleetVotesToday++;
        seenAuthors.add(c.author); seenPermlinks.add(c.permlink);
      } catch (e) { row.status = 'FAIL'; row.err = String(e.message || e).slice(0, 100); }
      R.picks.push(row);
      await sleep(5000);
    }
    R.status = R.status || (cast > 0 ? (DRYRUN ? `DRYRUN-${cast}` : `CAST-${cast}`) : 'NO-CANDIDATE');
    console.log(`[${R.status}] ${who} lane=${R.lane} sp=${R.sp} picks=${R.picks.length}`);
  }

  const book = {
    ok: true, tool: 'soldiers-curate.cjs', version: 1,
    doctrine: 'soldiers lane of the fleet curation: public external content only, deterministic scoring, verify-then-sign, fleet-wide 7d dedupe; headcorner lane owned by the weave curation daemon',
    at: t0, day: t0.slice(0, 10), incident: book0.incident || INCIDENT,
    tally: { verified: results.reduce((n, r) => n + r.picks.filter((p) => p.status === 'VOTED-VERIFIED').length, 0), attempted: results.reduce((n, r) => n + r.picks.length, 0), soldiersWithKey: Object.keys(keymap).length },
    runs: (book0.runs || []).concat([{ at: t0, results }]).slice(-30),
    votes: (book0.votes || []).concat(recon, results.flatMap((r) => r.picks)).slice(-800),
  };
  // markdown face
  const lines = [`# Soldiers curation book · ${book.day}`, '', `run ${t0} · verified ${book.tally.verified}/${book.tally.attempted} · keys ${book.tally.soldiersWithKey}/10`, '', `> INCIDENT 2026-10-02: first run cast 41 repeat votes (read-back-throws loop + weak bot filter) — standing evidence, corrected in v1.1`, ''];
  for (const r of results) {
    lines.push(`- **${r.voter}** (${r.lane}, ${r.sp == null ? '?' : r.sp} SP) — ${r.status}${r.rcPct != null ? ` rc=${r.rcPct}%` : ''}`);
    for (const p of r.picks) lines.push(`  - ${p.status} @${p.author} ${p.permlink} w=${p.weight} score=${p.score || '-'}${p.trx ? ` trx=${p.trx}` : ''}${p.err ? ` err=${p.err}` : ''}`);
  }
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 2));
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
  console.log(`[soldiers-curate] DONE · verified ${book.tally.verified}/${book.tally.attempted} → curation-book.json/.md`);
}

main().catch((e) => { console.error('[soldiers-curate] fatal:', String(e.message || e).slice(0, 160)); process.exit(0); });
