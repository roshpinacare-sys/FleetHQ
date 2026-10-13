#!/usr/bin/env node
/**
 * human-cadence.cjs — THE HUMAN CADENCE (CR-0065, fleet Rung 35)
 *
 * Why this desk exists (measured on-chain, 2026-10-04): the old stack published 10 posts
 * in one run ~500ms apart, voted in perfect 18-21s cadence in a fixed account order, and
 * sent follows at exact 3-second intervals — all in 2-3 daily bursts. Every soldier posted
 * from one shared wheel of 39 network-meta cards on one shared skeleton. A probe post with
 * the body "probe B" went on-chain AND collected 11 fleet votes. The owner's verdict:
 * robotic, detectable, self-harming. This desk replaces the burst stack as the SINGLE
 * publisher for the ten soldiers.
 *
 * Laws:
 *  · ONE MOMENT, ONE OWNER — each social op lands inside a persona-owned UTC window
 *    (persona-slots.json v2). Seeded per-day jitter. Quiet hours 00:00-04:59 UTC.
 *  · CATCH-UP, NEVER BURST — a starved runner lands inside the window (blog window =
 *    first blog hour .. last blog hour +2; curate/social get +1h). Max 2 blog posts and
 *    2 social soldiers and 3 curate soldiers per invocation, so even full catch-up cannot
 *    reproduce the old burst.
 *  · DESK TRUTH — content comes from content-library.json (hand-written per-desk pieces,
 *    each with its own shape). No shared openers, no shared closers, no fleet statistics
 *    in soldier posts, no "(measured DATE)" title stamps, no card wheel.
 *  · THE PROBE-B LAW — a post shorter than 800 chars of body is never voted, never
 *    reblogged, never commented, even inside the fleet. Titles/bodies matching
 *    /probe|test|sandbox|lorem/i are invisible to every mode.
 *  · INTERNAL-ONLY (owner directive 2026-10-04) — comments, votes and reblogs target
 *    fleet posts only, until the quality bar lifts the gate. No external engagement.
 *  · THE COMMUNITY BREATH (CR-0067) — hive-177702 is the home feed: blog posts land
 *    INSIDE The Clubhouse (first tag = the community), and joining is its own staggered
 *    lane (subscribe in persona windows, budget 1 per soldier ever, max 2 per run,
 *    read-back via bridge.list_subscribers, posting-key signature only — the measured
 *    ground-truth shape). Founder order: headcorner joins first.
 *  · verify-then-sign everywhere; read-back after every op; fail-soft exit 0; zero
 *    secrets printed; STASIS halt-before-read; single-writer atomic books.
 *
 * Modes: all (default) | blog | curate | social | status (keyless, eval surface)
 * Run:   node agents/human-cadence.cjs            (SA_FLEET_KEYS env, hourly cron 13 * * * *)
 */
'use strict';
const fs = require('fs');
const path = require('path');
// lazy steem: the pure helper surface must import cleanly in evals/keyless environments
let steem = null;
function steemInit() {
  if (!steem) { steem = require('steem'); steem.api.setOptions({ url: 'https://api.steemit.com' }); }
  return steem;
}
const ROOT = path.resolve(__dirname, '..');
const AG = path.join(ROOT, 'agents');
// T3/P0-1: persona doctrine is SEALED (persona-store.cjs) — plaintext gone from the public tree.
const personaStore = require('./persona-store.cjs');
const SLOTS = personaStore.slots();
const dedupe = require('./social-dedupe.cjs');
const LIB = (() => { try { return JSON.parse(fs.readFileSync(path.join(AG, 'content-library.json'), 'utf8')); } catch (_) { return { desks: {} }; } })();
const MEMORY_FILE = path.join(AG, 'cadence-memory.json');
const BOOK_JSON = path.join(AG, 'human-cadence.json');
const BOOK_MD = path.join(AG, 'human-cadence.md');
const STASIS_FILE = path.join(AG, 'STASIS.json');
const SOLDIERS = Object.keys((SLOTS && SLOTS.soldiers) || {});
const FLEET = SOLDIERS.concat(['headcorner']);
const HEAD = 'headcorner';
const MIN_RC_PCT = 25;
const PROBE_RX = /\bprobe\b|\btest post\b|sandbox|lorem/i;
const MAX_BLOG_PER_RUN = 2, MAX_SOCIAL_SOLDIERS_PER_RUN = 2, MAX_CURATE_SOLDIERS_PER_RUN = 3;
const MIN_CANDIDATE_AGE_H = SLOTS.minAgeHoursBeforeComment || 2;
const MAX_CANDIDATE_AGE_H = 48;
const CANDIDATE_BODY_FLOOR = 800;
const P = (fn) => new Promise((res, rej) => fn((e, r) => (e ? rej(e) : res(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- pure helpers (E58 white-box surface) ----------

/** seeded PRNG: same (doy, account, mode) always yields the same stream — deterministic jitter */
function seeded(doy, who, mode) {
  let h = 2166136261 >>> 0;
  const s = `${doy}|${who}|${mode}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
}
const jitterMinute = (doy, who, mode, span) => Math.floor(seeded(doy, who, mode)() * (span + 1));
const pickWeight = (doy, who, mode, weights) => weights[Math.floor(seeded(doy, who, mode)() * weights.length)];

/** blog window for a soldier on doy's weekday: [firstHour, lastHour+2] — catch-up room, never a burst */
function blogWindow(cfg, weekday) {
  if (!cfg.blogDaysUTC.includes(weekday)) return null;
  const h = cfg.blogHoursUTC.slice().sort((a, b) => a - b);
  return { start: h[0], end: h[h.length - 1] + 2 };
}
/** slot-window law shared by curate (+1h) and social (+1h catch-up) */
function hourInWindow(hours, hour, weekday, days) {
  if (days && !days.includes(weekday)) return false;
  const min = Math.min(...hours), max = Math.max(...hours);
  return hour >= min && hour <= max + 1;
}
/** quiet-hours law: no fleet op starts before SLOTS.quietHoursUTC.to */
function inQuietHours(hour) { const q = SLOTS.quietHoursUTC || { from: 0, to: 5 }; return hour >= q.from && hour < q.to; }

/** THE CONTENT GATE: rejects AI-tell markers, probe/test junk, too-short bodies, shared-skeleton leftovers */
const MARKERS = [
  /[—–]/, /\bdelve\b/i, /\btapestry\b/i, /\bmoreover\b/i, /\bfurthermore\b/i, /\bin conclusion\b/i,
  /\bit'?s important to note\b/i, /\bdive into\b/i, /\bvibrant\b/i, /\bseamless(ly)?\b/i,
  /\blet'?s explore\b/i, /\bembark\b/i, /\bgame.?chang/i, /\bstunning\b/i, /\bmust-read\b/i,
];
function contentGate(piece) {
  const why = [];
  if (!piece || typeof piece !== 'object') why.push('not-a-piece');
  if (!piece) return { ok: false, why };
  if (typeof piece.title !== 'string' || piece.title.length < 8 || piece.title.length > 90) why.push('title-length');
  if (/\(measured\b/.test(piece.title)) why.push('measured-stamp');
  if (typeof piece.body !== 'string' || piece.body.length < 400) why.push('body-too-short');
  if (/\(measured\b/.test(piece.body)) why.push('measured-stamp-body');
  if (/\bsaos\b/i.test(piece.body)) why.push('ops-word-in-body');
  if (/\bSP\b/.test(piece.body) || /\bfleet\b.{0,60}\b(SP|stake|delegat|voting power)/i.test(piece.body) || /\b(stake|delegat)[a-z]*\b.{0,60}\bfleet\b/i.test(piece.body)) why.push('fleet-stats-in-soldier-post');
  if (PROBE_RX.test(piece.title) || PROBE_RX.test(piece.body)) why.push('probe-word');
  if (MARKERS.some((r) => r.test(piece.title) || r.test(piece.body))) why.push('ai-marker');
  if (!Array.isArray(piece.tags) || piece.tags.length < 2 || piece.tags[piece.tags.length - 1] !== (SLOTS.hub && SLOTS.hub.tag || 'saos')) why.push('hub-tag-missing');
  return { ok: why.length === 0, why };
}
const slugify = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** piece selection: desk-owned pool, no reuse within 14 days for the same soldier */
const PIECE_COOLDOWN_DAYS = 14;
function pickPiece(pieces, soldierState, doy) {
  const use = (soldierState && soldierState.pieceUse) || {};
  const fresh = [];
  for (const p of pieces || []) {
    const last = use[p.id];
    if (typeof last !== 'number' || doy - last >= PIECE_COOLDOWN_DAYS) fresh.push(p);
  }
  if (!fresh.length) return null;
  const sorted = fresh.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const idx = Math.floor(seeded(doy, sorted[0].id.split('-')[0] || 'x', 'piece')() * sorted.length) % sorted.length;
  return sorted[idx];
}

/** THE PROBE-B LAW as data: curation/comment/reblog candidate floor */
function candidateEligible(post, { now, voter }) {
  if (!post || !post.author || post.author === voter) return { ok: false, why: 'not-external-or-self' };
  if (!FLEET.includes(post.author)) return { ok: false, why: 'internal-only-law' };
  const ageH = (now - Date.parse(post.created + 'Z')) / 3600000;
  if (!isFinite(ageH) || ageH < MIN_CANDIDATE_AGE_H || ageH > MAX_CANDIDATE_AGE_H) return { ok: false, why: 'age-window' };
  const depth = String(post.body || '').length;
  if (depth < CANDIDATE_BODY_FLOOR) return { ok: false, why: `probe-b-law(depth=${depth})` };
  if (PROBE_RX.test(String(post.title || '')) || PROBE_RX.test(String(post.body || '').slice(0, 200))) return { ok: false, why: 'probe-word' };
  if ((post.active_votes || []).some((v) => v.voter === voter)) return { ok: false, why: 'already-voted' };
  return { ok: true, ageH: Number(ageH.toFixed(1)), depth };
}

/** curation score for internal fleet posts: fresh + deep + discussed (deterministic) */
function curateScore(post) {
  const depth = String(post.body || '').length;
  const ageH = (Date.now() - Date.parse(post.created + 'Z')) / 3600000;
  const fresh = Math.max(0, (MAX_CANDIDATE_AGE_H - ageH) / (MAX_CANDIDATE_AGE_H - MIN_CANDIDATE_AGE_H));
  const discuss = (post.children || 0) > 0 ? 0.5 : 0;
  return Number((2 * fresh + Math.min(1, depth / 6000) + discuss).toFixed(3));
}

// ---------- community breath (CR-0067, E60 white-box surface) ----------

/** the home feed: soldier posts land INSIDE The Clubhouse (CR-0066 founded it, CR-0067 lives in it) */
const COMMUNITY = (SLOTS.community && SLOTS.community.name) || null;
const MAX_SUBSCRIBES_PER_RUN = SLOTS.maxSubscribesPerRun || 2;

/** subscribe op — byte-shape of the measured ground truth (furqanashraf@hive-153176, 2026-10-04):
 *  custom_json id='community', required_auths [], required_posting_auths [who],
 *  json ["subscribe",{"community":"<name>"}] — posting-key signature only. */
function subscribeOp(who, community) {
  return ['custom_json', {
    required_auths: [],
    required_posting_auths: [who],
    id: 'community',
    json: JSON.stringify(['subscribe', { community }]),
  }];
}

/** a library piece becomes a community post: the house is the first tag, hub tag stays trailing */
function communityTags(piece, community) {
  if (!piece || !Array.isArray(piece.tags) || !community) return null;
  return [community, ...piece.tags];
}

/** bridge.list_subscribers returns [[account, role, title, joined]] — parse into objects */
function subscribersReadBack(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && r[0])
    .map((r) => ({ account: r[0], role: typeof r[1] === 'string' ? r[1] : null, joined: typeof r[3] === 'string' ? r[3] : null }))
    .sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
}

/** eligibility for the subscribe wave: persona comment window, quiet-hours law, one per lifetime, read-back truth first */
function subscribeEligible(who, cfg, { hour, weekday, subscribedSet, memorySub, hasKey }) {
  if (subscribedSet && subscribedSet.has(who)) return { ok: false, why: 'already-subscribed' };
  if (memorySub && memorySub[who]) return { ok: false, why: 'budget-used' };
  if (!hasKey) return { ok: false, why: 'no-key' };
  if (!hourInWindow(cfg.commentHoursUTC, hour, weekday)) return { ok: false, why: 'outside-window' };
  if (inQuietHours(hour)) return { ok: false, why: 'quiet-hours' };
  return { ok: true };
}

/** the join plan: headcorner (founder) first, then soldiers by window start — deterministic, capped */
function subscribePlan(now, subscribedSet, memory, keys) {
  const hour = now.getUTCHours(), weekday = now.getUTCDay();
  const memSub = (memory && memory.subscribeDone) || {};
  const cand = [];
  for (const who of FLEET) {
    const cfg = SLOTS.soldiers[who];
    if (!cfg) continue; // headcorner rides the founder slot below
    const e = subscribeEligible(who, cfg, { hour, weekday, subscribedSet, memorySub: memSub, hasKey: !!keys[who] });
    if (e.ok) cand.push({ who, start: Math.min(...cfg.commentHoursUTC) });
  }
  cand.sort((a, b) => (a.start - b.start) || (a.who < b.who ? -1 : 1));
  const plan = [];
  if (keys[HEAD] && !(subscribedSet && subscribedSet.has(HEAD)) && !memSub[HEAD]) plan.push({ who: HEAD, start: 0 });
  for (const c of cand) plan.push(c);
  return plan.slice(0, MAX_SUBSCRIBES_PER_RUN);
}

/** slot plan for a whole UTC day (status surface + eval determinism) */
function dayPlan(doy, weekday) {
  const plan = {};
  for (const who of SOLDIERS) {
    const cfg = SLOTS.soldiers[who];
    const w = blogWindow(cfg, weekday);
    plan[who] = {
      desk: cfg.desk,
      blogDay: !!w,
      blogWindowUTC: w ? [w.start, w.end] : null,
      blogJitterMin: w ? jitterMinute(doy, who, 'blog', SLOTS.jitterMinutes) : null,
      commentHoursUTC: cfg.commentHoursUTC,
      curateHoursUTC: cfg.curateHoursUTC,
    };
  }
  return plan;
}

// ---------- runtime helpers ----------

function loadMemory() { try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (_) { return { pieceUse: {}, lastBlogDoy: {}, reblogDoy: {}, votesDoy: {}, commentDoy: {}, subscribeDone: {} }; } }
function saveMemory(m) { const t = MEMORY_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(m, null, 1)); fs.renameSync(t, MEMORY_FILE); }

function loadKeys() {
  const raw = process.env.SA_FLEET_KEYS || '';
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (_) { return null; }
}
const rpc = (method, params) => new Promise((res, rej) => {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const req = require('https').request({ hostname: 'api.steemit.com', path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 20000 }, (r) => {
    let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { const j = JSON.parse(d); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } });
  });
  req.on('error', rej); req.write(body); req.end();
});
async function getContent(a, p) { try { return await P((cb) => steemInit().api.getContent(a, p, cb)); } catch (_) { return null; } }

// ---------- modes ----------

async function modeBlog(now, keys, memory, run, posts) {
  const doy = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5);
  const weekday = now.getUTCDay();
  const hour = now.getUTCHours(), minute = now.getUTCMinutes();
  const eligible = [];
  // T3: the fleet's recent post bodies (live chain pre-pass) + everything accepted in THIS
  // run — one list, so cross-account near-dups can never sign.
  const recentBodies = (posts || []).map((p) => ({ author: p.author, body: p.body }));
  const runBodies = [];
  for (const who of SOLDIERS) {
    const cfg = SLOTS.soldiers[who];
    const w = blogWindow(cfg, weekday);
    if (!w) continue;
    if (inQuietHours(hour)) continue;
    if (hour < w.start || hour > w.end) continue;
    const offset = jitterMinute(doy, who, 'blog', SLOTS.jitterMinutes);
    if (hour === w.start && minute < offset) continue; // jitter: not yet inside the window
    if (memory.lastBlogDoy[who] === doy) continue;     // one post per soldier per day
    const pieces = (LIB.desks[who] || []);
    const piece = pickPiece(pieces, { pieceUse: memory.pieceUse[who] }, doy);
    if (!piece) { run.blog.push({ author: who, status: 'SKIP-NO-FRESH-PIECE' }); continue; }
    const gate = contentGate(piece);
    if (!gate.ok) { run.blog.push({ author: who, piece: piece.id, status: 'SKIP-GATE', why: gate.why.join(',') }); continue; }
    // T3 HARD GATE: near-duplicate post vs the fleet's recent posts or this run's accepted
    // bodies => the piece NEVER signs (the audit's byte-identical pairs die here).
    // Fail-closed on missing recent list (null) — no chain truth, no broadcast.
    const dup = dedupe.gatePost(piece.body, recentBodies.concat(runBodies));
    if (!dup.ok) { run.blog.push({ author: who, piece: piece.id, status: 'SKIP-NEAR-DUP', sim: dup.bestSim, against: dup.partner, why: dup.why }); continue; }
    eligible.push({ who, piece, w });
  }
  eligible.sort((a, b) => a.w.start - b.w.start);
  let published = 0;
  for (const e of eligible) {
    if (published >= MAX_BLOG_PER_RUN) break;
    const wif = keys[e.who];
    if (!wif) { run.blog.push({ author: e.who, status: 'SKIP-NO-KEY' }); continue; }
    const R = { author: e.who, piece: e.piece.id };
    try {
      const acc = (await rpc('condenser_api.get_accounts', [[e.who]]))[0];
      let rcPct = null;
      try { const rc = await rpc('rc_api.find_rc_accounts', { accounts: [e.who] }); rcPct = 100 * Number(rc.rc_accounts[0].rc_manabar.current_mana) / Number(rc.rc_accounts[0].max_rc); } catch (_) {}
      R.rcPct = rcPct == null ? null : Math.round(rcPct);
      if (rcPct != null && rcPct < MIN_RC_PCT) R.status = `SKIP-RC-LOW(${R.rcPct})`;
      else {
        let pub; try { pub = steem.auth.wifToPublic(wif); } catch (_) { R.status = 'SKIP-KEY-PARSE'; run.blog.push(R); continue; }
        if (!acc || !acc.posting || acc.posting.key_auths[0][0] !== pub) R.status = 'SKIP-KEY-MISMATCH';
        else {
          const day = now.toISOString().slice(0, 10).replace(/-/g, '');
          const permlink = `${slugify(e.piece.title)}-${day}`;
          const existing = await getContent(e.who, permlink);
          if (existing && existing.author === e.who) R.status = 'SKIP-ALREADY-POSTED';
          else {
            // CR-0067: the house is home — first tag = community (when the house exists), hub tag stays trailing
            const tags = COMMUNITY ? communityTags(e.piece, COMMUNITY) : e.piece.tags;
            R.community = COMMUNITY || null;
            const ops = [
              ['comment', { parent_author: '', parent_permlink: tags[0], author: e.who, permlink, title: e.piece.title, body: e.piece.body, json_metadata: JSON.stringify({ tags, app: 'saos-human-cadence/1', format: 'markdown' }) }],
              ['comment_options', { author: e.who, permlink, max_accepted_payout: '1000000.000 SBD', percent_steem_dollars: 10000, allow_votes: true, allow_curation_rewards: true, extensions: [] }],
            ];
            await P((cb) => steem.broadcast.send({ operations: ops, extensions: [] }, [wif], cb));
            runBodies.push({ author: e.who, body: e.piece.body }); // this run's own truth feeds the next candidate's gate
            await sleep(2500 + Math.floor(Math.random() * 3500));
            const chk = await getContent(e.who, permlink);
            R.status = chk && chk.author === e.who && chk.body === e.piece.body ? 'POSTED-VERIFIED' : 'BROADCAST-NO-READBACK';
            R.url = COMMUNITY ? `https://steemit.com/hive-177702/@${e.who}/${permlink}` : `https://steemit.com/@${e.who}/${permlink}`;
            if (R.status === 'POSTED-VERIFIED') {
              published++;
              memory.lastBlogDoy[e.who] = doy;
              memory.pieceUse[e.who] = memory.pieceUse[e.who] || {};
              memory.pieceUse[e.who][e.piece.id] = doy;
            }
          }
        }
      }
    } catch (err) { R.status = 'FAIL'; R.err = String(err.message || err).slice(0, 100); }
    run.blog.push(R);
    console.log(`[human-cadence blog] ${R.status} ${e.who} ${e.piece.id}`);
    await sleep(2000 + Math.floor(Math.random() * 5000));
  }
}

/** fleet posts of the last 48h, once per run, shared by curate + social */
async function fleetPosts(now) {
  const day = now.toISOString().slice(0, 10);
  const posts = [];
  for (const who of FLEET) {
    try {
      const h = await rpc('condenser_api.get_account_history', [who, -1, 100]);
      const seen = new Set();
      for (const o of (h || []).map((x) => x[1])) {
        if (!o || !o.op || o.op[0] !== 'comment' || o.op[1].parent_author !== '' || o.op[1].author !== who) continue;
        if (seen.has(o.op[1].permlink)) continue;
        seen.add(o.op[1].permlink);
        if (Date.parse(o.timestamp + 'Z') < now.getTime() - MAX_CANDIDATE_AGE_H * 3600000) continue;
        posts.push({ author: who, permlink: o.op[1].permlink, created: o.timestamp + 'Z' });
      }
    } catch (_) {}
    await sleep(200);
  }
  // The blog permlink carries the date; historic saos-<who>-<day> form and legacy forms both resolve
  const full = [];
  for (const p of posts) { const c = await getContent(p.author, p.permlink); if (c && c.author === p.author) full.push({ ...p, title: c.title, body: c.body, children: c.children, active_votes: c.active_votes || [] }); await sleep(120); }
  return full;
}

async function modeCurate(now, keys, run, posts, memoryVotesDoy) {
  const hour = now.getUTCHours(), weekday = now.getUTCDay();
  const doy = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5);
  const voters = SOLDIERS.filter((who) => hourInWindow(SLOTS.soldiers[who].curateHoursUTC, hour, weekday) && !inQuietHours(hour) && keys[who]).slice(0, MAX_CURATE_SOLDIERS_PER_RUN);
  for (const who of voters) {
    const wif = keys[who];
    const R = { voter: who, lane: 'internal', picks: [] };
    if (memoryVotesDoy[who] === doy) { R.status = 'SKIP-BUDGET-USED-TODAY'; run.curate.push(R); continue; } // 1 curation window per soldier per day (catch-up may run twice, the budget may not)
    memoryVotesDoy[who] = doy;
    try {
      const cands = posts.map((p) => ({ p, e: candidateEligible(p, { now: now.getTime(), voter: who }) })).filter((x) => x.e.ok);
      cands.sort((a, b) => curateScore(b.p) - curateScore(a.p));
      let attempts = 0;
      for (const c of cands) {
        if (attempts >= 2) break;
        attempts++;
        const weightPct = pickWeight(now.getUTCDate(), who, 'curate' + c.p.permlink.slice(0, 12), [50, 75, 100]);
        const row = { voter: who, author: c.p.author, permlink: c.p.permlink, weight: weightPct * 100, weightPct, score: curateScore(c.p), title: String(c.p.title || '').slice(0, 90) };
        try {
          await P((cb) => steem.broadcast.send({ operations: [['vote', { voter: who, author: c.p.author, permlink: c.p.permlink, weight: row.weight }]], extensions: [] }, [wif], cb));
          await sleep(4000 + Math.floor(Math.random() * 8000));
          const after = await getContent(c.p.author, c.p.permlink);
          row.status = after && (after.active_votes || []).some((v) => v.voter === who) ? 'VOTED-VERIFIED' : 'BROADCAST-NO-READBACK';
        } catch (err) { row.status = 'FAIL'; row.err = String(err.message || err).slice(0, 80); }
        R.picks.push(row);
        console.log(`[human-cadence curate] ${row.status} ${who} -> @${c.p.author}`);
      }
      R.status = R.picks.length ? `CAST-${R.picks.filter((p) => p.status === 'VOTED-VERIFIED').length}` : 'NO-CANDIDATE';
    } catch (err) { R.status = 'FAIL'; R.err = String(err.message || err).slice(0, 80); }
    run.curate.push(R);
  }
}

function buildComment(target, who, doy) {
  const frag = (() => {
    const m = String(target.body || '').match(/\*\*([^*\n]{6,70})\*\*/);
    if (m) return m[1];
    const line = String(target.body || '').split(/[.!?]\s/)[0];
    return line && line.length > 12 && line.length < 90 ? line : null;
  })();
  const clean = (s) => String(s || '').replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim();
  const titleBit = clean(target.title).split(':')[0].slice(0, 60) || 'this piece';
  if (!frag) return null;
  const f = clean(frag);
  const shapes = [
    `The ${titleBit} framing held up on a second read, and the part about ${f} is what sent me back to it.`,
    `Saving this one. The line about ${f} answers something I had been circling without naming.`,
    `Read this twice before saying anything. ${f} is the detail that makes the rest click.`,
    `Quiet thanks for the part about ${f}. It settles a small argument I was having with myself.`,
    `Came for the title, stayed for the bit about ${f}. That is the paragraph I would have underlined.`,
    `The piece earns its keep around ${f}. Everything before sets it up and everything after earns it.`,
  ];
  const body = shapes[Math.floor(seeded(doy, who, 'comment' + target.permlink.slice(0, 16))() * shapes.length)];
  const gateMarkers = MARKERS.some((r) => r.test(body));
  return body && !gateMarkers ? body : null;
}

async function modeSocial(now, keys, memory, run, posts, memoryCommentDoy) {
  const hour = now.getUTCHours(), weekday = now.getUTCDay();
  const doy = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5);
  const speakers = SOLDIERS.filter((who) => hourInWindow(SLOTS.soldiers[who].commentHoursUTC, hour, weekday) && !inQuietHours(hour) && keys[who]).slice(0, MAX_SOCIAL_SOLDIERS_PER_RUN);
  for (const who of speakers) {
    const wif = keys[who];
    const R = { by: who, comment: null, vote: null, reblog: null };
    if (memoryCommentDoy[who] === doy) { R.comment = { status: 'SKIP-BUDGET-USED-TODAY' }; R.reblog = { status: 'SKIP-BUDGET-USED-TODAY' }; run.social.push(R); continue; }
    memoryCommentDoy[who] = doy;
    try {
      const candidates = [];
      for (const p of posts) {
        const e = candidateEligible(p, { now: now.getTime(), voter: who });
        if (!e.ok) continue;
        const cPermlink = `re-${p.permlink}-${who}`.slice(0, 255);
        const already = await getContent(who, cPermlink);
        if (already && already.author === who) continue;
        candidates.push({ p, cPermlink });
        await sleep(100);
      }
      candidates.sort((a, b) => (a.p.children || 0) - (b.p.children || 0)); // fewest fleet comments first — spread the love
      const target = candidates.length ? candidates[Math.floor(seeded(doy, who, 'target')() * Math.min(3, candidates.length))] : null;
      if (!target) { R.comment = { status: 'NO-CANDIDATE' }; }
      else {
        const body = buildComment(target.p, who, doy);
        if (!body) R.comment = { status: 'SKIP-NO-VOICE' };
        else {
          try {
            // T3 THREAD LOCK: one fleet voice per thread per hour — the second voice defers.
            // Fail-closed: replies unavailable => no comment (the measured fingerprint dies here).
            let replies = null;
            try { replies = await rpc('condenser_api.get_content_replies', [target.p.author, target.p.permlink]); } catch (_) {}
            const lock = dedupe.threadLockVerdict(replies, { author: who });
            if (!lock.ok) { R.comment = { status: 'SKIP-THREAD-LOCKED', on: target.p.author, by: lock.by, ageMin: lock.ageMin }; }
            else {
              // T3 comment dedupe: the same gateCast hard gate fleet-social obeys (0.6).
              let mem = null;
              try { mem = await dedupe.buildMemory(false); } catch (_) { mem = null; }
              const cast = dedupe.gateCast(who, body, mem, doy);
              if (cast.verdict === 'SKIP') { R.comment = { status: 'SKIP-NEAR-DUP', sim: cast.bestSim, reason: cast.reason }; }
              else {
                await P((cb) => steem.broadcast.send({ operations: [['comment', { parent_author: target.p.author, parent_permlink: target.p.permlink, author: who, permlink: target.cPermlink, title: '', body, json_metadata: JSON.stringify({ tags: ['saos'], app: 'saos-human-cadence/1' }) }]], extensions: [] }, [wif], cb));
                await sleep(3000 + Math.floor(Math.random() * 5000));
                const back = await getContent(who, target.cPermlink);
                R.comment = { on: target.p.author, permlink: target.cPermlink, status: back && back.author === who && back.body === body ? 'COMMENTED-VERIFIED' : 'COMMENTED-READBACK-PENDING' };
              }
            }
          } catch (err) { R.comment = { status: 'FAIL', err: String(err.message || err).slice(0, 80) }; }
        }
        // support vote beside the comment (probe-b law already filtered the target)
        if (R.comment && (R.comment.status === 'COMMENTED-VERIFIED' || R.comment.status === 'COMMENTED-READBACK-PENDING')) {
          try {
            const acc = (await rpc('condenser_api.get_accounts', [[who]]))[0];
            const vp = Math.round(acc.voting_power / 100);
            if (vp < 20) R.vote = { status: `SKIP-VP-LOW(${vp})` };
            else {
              const wPct = pickWeight(doy, who, 'support' + target.p.permlink.slice(0, 12), SLOTS.supportVoteWeightsPct);
              await P((cb) => steem.broadcast.send({ operations: [['vote', { voter: who, author: target.p.author, permlink: target.p.permlink, weight: wPct * 100 }]], extensions: [] }, [wif], cb));
              await sleep(2500);
              const after = await getContent(target.p.author, target.p.permlink);
              R.vote = { on: target.p.author, weightPct: wPct, status: after && (after.active_votes || []).some((v) => v.voter === who) ? 'VOTED-VERIFIED' : 'BROADCAST-NO-READBACK' };
            }
          } catch (err) { R.vote = { status: 'FAIL', err: String(err.message || err).slice(0, 80) }; }
        }
      }
      // reblog: one per soldier per day, deep fleet post from a different author than the comment target
      if (memory.reblogDoy[who] !== doy) {
        const deep = posts.filter((p) => String(p.body || '').length >= CANDIDATE_BODY_FLOOR && p.author !== who && (!target || p.author !== target.p.author));
        const rb = deep.find((p) => p.author !== who);
        if (rb) {
          try {
            const json = JSON.stringify(['reblog', { account: who, author: rb.author, permlink: rb.permlink }]);
            await P((cb) => steem.broadcast.send({ operations: [['custom_json', { required_auths: [], required_posting_auths: [who], id: 'follow', json }]], extensions: [] }, [wif], cb));
            memory.reblogDoy[who] = doy;
            R.reblog = { on: rb.author, permlink: rb.permlink, status: 'REBLOG-SENT' };
          } catch (err) { R.reblog = { status: 'FAIL', err: String(err.message || err).slice(0, 80) }; }
        } else R.reblog = { status: 'NO-CANDIDATE' };
      } else R.reblog = { status: 'ALREADY-TODAY' };
    } catch (err) { R.err = String(err.message || err).slice(0, 90); }
    run.social.push(R);
    console.log(`[human-cadence social] ${who}: comment=${R.comment && R.comment.status} vote=${R.vote && R.vote.status} reblog=${R.reblog && R.reblog.status}`);
    await sleep(4000 + Math.floor(Math.random() * 6000));
  }
}

/** THE COMMUNITY BREATH (CR-0067): staggered joins — one moment, one owner, read-back truth */
async function modeCommunity(now, keys, run, memory) {
  if (!COMMUNITY) { run.community.push({ status: 'SKIP-NO-COMMUNITY' }); return; }
  const doy = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5);
  let subs = [];
  try { subs = await rpc('bridge.list_subscribers', { community: COMMUNITY }); } catch (err) { run.community.push({ status: 'FAIL', err: String(err.message || err).slice(0, 80) }); return; }
  const before = subscribersReadBack(subs);
  run.communityBefore = before.length;
  const subscribedSet = new Set(before.map((s) => s.account));
  const plan = subscribePlan(now, subscribedSet, memory, keys);
  if (!plan.length) { run.community.push({ status: subscribedSet.size >= FLEET.length ? 'HOME-SUBSCRIBED' : 'NO-ELIGIBLE', subscribed: subscribedSet.size, target: FLEET.length }); return; }
  let joined = 0;
  for (const c of plan) {
    const wif = keys[c.who];
    const R = { who: c.who, community: COMMUNITY };
    if (!wif) { R.status = 'SKIP-NO-KEY'; run.community.push(R); continue; }
    try {
      const op = subscribeOp(c.who, COMMUNITY);
      await P((cb) => steem.broadcast.send({ operations: [op], extensions: [] }, [wif], cb));
      await sleep(4000 + Math.floor(Math.random() * 6000));
      const after = subscribersReadBack(await rpc('bridge.list_subscribers', { community: COMMUNITY }));
      R.status = after.some((s) => s.account === c.who) ? 'SUBSCRIBED-VERIFIED' : 'BROADCAST-NO-READBACK';
      if (R.status === 'SUBSCRIBED-VERIFIED') { joined++; memory.subscribeDone[c.who] = doy; }
    } catch (err) { R.status = 'FAIL'; R.err = String(err.message || err).slice(0, 80); }
    run.community.push(R);
    console.log(`[human-cadence community] ${R.status} ${c.who} -> ${COMMUNITY}`);
    await sleep(3000 + Math.floor(Math.random() * 5000));
  }
  run.communityJoined = joined;
}

// ---------- bookkeeping ----------

function writeBooks(run) {
  const stable = { ...run };
  delete stable.at;
  const book0 = (() => { try { return JSON.parse(fs.readFileSync(BOOK_JSON, 'utf8')); } catch (_) { return { runs: [] }; } })();
  const book = { ok: true, tool: 'human-cadence.cjs', version: 2, law: SLOTS.law, internalOnly: true, community: COMMUNITY, at: run.at, runs: book0.runs.concat([{ at: run.at, stable }]).slice(-48) };
  const t = BOOK_JSON + '.tmp'; fs.writeFileSync(t, JSON.stringify(book, null, 1)); fs.renameSync(t, BOOK_JSON);
  const c = (arr, s) => (arr || []).reduce((n, r) => n + ((r && r.status === s) || (r && r.comment && r.comment.status === s) ? 1 : 0), 0);
  const posted = (run.blog || []).filter((r) => r.status === 'POSTED-VERIFIED').length;
  const votes = (run.curate || []).reduce((n, r) => n + r.picks.filter((p) => p.status === 'VOTED-VERIFIED').length, 0);
  const comments = (run.social || []).filter((r) => r.comment && r.comment.status === 'COMMENTED-VERIFIED').length;
  const joined = (run.community || []).filter((r) => r.status === 'SUBSCRIBED-VERIFIED').length;
  const lines = [
    `# הקצב האנושי · ${run.at.slice(0, 10)}`, '',
    `ריצה ${run.at} · פורסמו ${posted}${COMMUNITY ? ` אל-תוך ${COMMUNITY}` : ''} · הצבעות-פנים ${votes} · תגובות ${comments} · הצטרפו ${joined}`, '',
    `> חוק CR-0065+CR-0067: רגע-אחד, בעל-אחד. אין-פיצוצים. כל-חייל בחלון-השעות-שלו, רטט-מזריע-ליום,`,
    `> שעות-דממה 00:00-04:59 UTC. הקהילה ${COMMUNITY || '-'} היא הבית: הפוסטים נוחתים בתוכה, וההצטרפות`,
    `> לה עצמה מפוזרת בחלונות-אישיים (תקציב 1 לכל-חייל, 2 לריצה). חוק-ה-probe: פוסט מתחת-ל-800 תווים`,
    `> לא-מקבל תגובה, הצבעה או reblog — אפילו-שלנו.`, '',
    `| פוסטים | חוק |`, '|---|---|',
  ];
  if (run.community && run.community.length) {
    lines.push('', '| הצטרפות-לבית | חוק |', '|---|---|');
    for (const c of run.community) lines.push(`| ${c.who || '-'} -> ${c.community || COMMUNITY || '-'} | ${c.status}${c.err ? ` (${c.err})` : ''} |`);
  }
  for (const b of run.blog || []) lines.push(`| ${b.author} ${b.piece || ''} | ${b.status}${b.why ? ` (${b.why})` : ''} |`);
  lines.push('', '| הצבעות-פנים | חוק |', '|---|---|');
  for (const r of run.curate || []) for (const p of r.picks || []) lines.push(`| ${r.voter} -> @${p.author} w=${p.weightPct}% | ${p.status} |`);
  lines.push('', '| חברתי | חוק |', '|---|---|');
  for (const r of run.social || []) lines.push(`| ${r.by} | תגובה: ${(r.comment && r.comment.status) || '-'} · הצבעה: ${(r.vote && r.vote.status) || '-'} · reblog: ${(r.reblog && r.reblog.status) || '-'} |`);
  const t2 = BOOK_MD + '.tmp'; fs.writeFileSync(t2, lines.join('\n') + '\n'); fs.renameSync(t2, BOOK_MD);
}

function writeStatus(now) {
  const doy = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5);
  const plan = dayPlan(doy, now.getUTCDay());
  const memory = loadMemory();
  const out = { protocol: 'SAOS-HUMAN-CADENCE-STATUS/1', at: now.toISOString(), day: now.toISOString().slice(0, 10), weekdayUTC: now.getUTCDay(), doy, quietHoursUTC: SLOTS.quietHoursUTC, jitterMinutes: SLOTS.jitterMinutes, hubTag: SLOTS.hub && SLOTS.hub.tag, community: COMMUNITY, subscribeDone: Object.keys((memory && memory.subscribeDone) || {}), plan, pieceCounts: Object.fromEntries(Object.entries(LIB.desks || {}).map(([d, ps]) => [d, ps.length])) };
  fs.writeFileSync(path.join(AG, 'human-cadence-status.json'), JSON.stringify(out, null, 1));
  console.log(`[human-cadence status] day ${out.day} · blogs today: ${Object.entries(plan).filter(([, p]) => p.blogDay).map(([w]) => w).join(', ')}`);
}

// ---------- main ----------

async function main(modeArg) {
  const now = new Date();
  const mode = modeArg || process.argv[2] || 'all';
  if (mode === 'status') { writeStatus(now); process.exit(0); }
  const run = { at: now.toISOString(), mode, blog: [], curate: [], social: [], community: [] };
  try {
    if (fs.existsSync(STASIS_FILE) && JSON.parse(fs.readFileSync(STASIS_FILE, 'utf8')).active === true) {
      console.log('[human-cadence] STASIS-HALT — the breaker is active, the cadence obeys');
      run.halt = 'STASIS'; writeBooks(run); process.exit(0);
    }
  } catch (_) {}
  try { steemInit(); } catch (e) { console.log('[human-cadence] steem-js unavailable — fail-soft'); run.halt = 'NO-STEEM-JS'; writeBooks(run); process.exit(0); }
  const keys = loadKeys() || {};
  const withKeys = SOLDIERS.filter((w) => keys[w]).length;
  console.log(`[human-cadence] mode=${mode} keys=${withKeys}/${SOLDIERS.length} · zero secrets printed`);
  const memory = loadMemory();
  const memoryVotesDoy = memory.votesDoy || (memory.votesDoy = {});
  const memoryCommentDoy = memory.commentDoy || (memory.commentDoy = {});
  if (!SLOTS || !SLOTS.soldiers || !SOLDIERS.length) {
    // T3/P0-1: the persona doctrine is sealed; without the key the cadence halts fail-closed —
    // no doctrine, no coordinated publishing.
    console.log('uman-cadence] PERSONAS-UNAVAILABLE — doctrine sealed and key missing; fail-closed halt');
    run.halt = 'PERSONAS-UNAVAILABLE';
    writeBooks(run); process.exit(0);
  }
  let posts = [];
  if (mode === 'all' || mode === 'blog' || mode === 'curate' || mode === 'social') { try { posts = await fleetPosts(now); } catch (_) {} run.fleetPostsScanned = posts.length; }
  if (mode === 'all' || mode === 'community') await modeCommunity(now, keys, run, memory); // join before post — the founder order
  if (mode === 'all' || mode === 'blog') await modeBlog(now, keys, memory, run, posts);
  if (mode === 'all' || mode === 'curate') await modeCurate(now, keys, run, posts, memoryVotesDoy);
  if (mode === 'all' || mode === 'social') await modeSocial(now, keys, memory, run, posts, memoryCommentDoy);
  saveMemory(memory);
  writeBooks(run);
  console.log(`[human-cadence] DONE · blog=${run.blog.length} curate=${run.curate.length} social=${run.social.length} community=${run.community.length}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) })); process.exit(0); });
}

module.exports = { seeded, jitterMinute, pickWeight, blogWindow, hourInWindow, inQuietHours, contentGate, pickPiece, candidateEligible, curateScore, dayPlan, slugify, buildComment, PROBE_RX, CANDIDATE_BODY_FLOOR, PIECE_COOLDOWN_DAYS, SOLDIERS, FLEET, COMMUNITY, MAX_SUBSCRIBES_PER_RUN, subscribeOp, communityTags, subscribersReadBack, subscribeEligible, subscribePlan };
