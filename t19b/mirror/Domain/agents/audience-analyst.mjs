#!/usr/bin/env node
/**
 * audience-analyst.mjs — daily audience-engagement digest (r145-b, D-r145-AUD)
 *
 * Mission (recruited by the army-expansion wave r145-b): measure audience
 * engagement on published network content — which posts get reactions and
 * replies, which topics resonate — and produce a measurable digest artifact
 * consumed by the home curation + sovereign layers.
 *
 * What it does (read-only on the chain, one digest file in this repo):
 *   1. Pulls the published posts of the community accounts (same roster as
 *      content-reviewer.mjs) from the last 48h via the public Steem API.
 *   2. Per post measures: votes total, external votes (community-external,
 *      bot-filtered), external rshares (the real economic signal), reply
 *      count, external repliers, pending payout.
 *   3. Aggregates topic resonance by primary tag (posts, external votes,
 *      external rshares, replies) and ranks topics + top posts.
 *   4. Writes audience/digest-YYYY-MM-DD.json + audience/latest.json (stable
 *      path for consumers) + a short markdown digest with the numbers.
 *
 * Honesty law: zero external engagement is a measurement, not a failure —
 * it is recorded as-is. The gate only trips after 3 consecutive fully-zero
 * digest days (reads the prior digest files in this repo), because a silent
 * audience sustained over days is a real signal the curation layer needs.
 *
 * Doctrine: public read-only measurement, zero keys, zero secrets, honest
 * numbers, community-accounts wording only. Different from measure-learn.cjs
 * on purpose: that agent keeps the longitudinal per-knowledge-card learning
 * ledger; this one produces the daily windowed digest (replies + topics +
 * stable latest.json for home consumption).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RPC = 'https://api.steemit.com';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'audience');

// Community accounts roster — same as agents/content-reviewer.mjs (measured
// from the live publishing machinery of this repo).
const ACCOUNTS = ['cashmachine', 'haran', 'israelnews', 'lsa', 'macrame', 'siq', 'tov', 'wic', 'wog', 'woq', 'headcorner'];

const WINDOW_H = 48;
const MAX_PER_ACCOUNT = 12;       // pagination cap per account (feed is newest-first)
const TOP_TOPICS = 8;
const TOP_POSTS = 5;
const ZERO_GATE_DAYS = 3;         // 3 consecutive all-zero digest days trip the gate

// Non-signal voters (bid-bot/trail accounts) — same filter as measure-learn.cjs,
// so the "external audience" number measures real outside attention, not noise.
const NON_SIGNAL = new Set(['steem.history', 'trailbot', 'appreciator', 'postpromoter', 'upme', 'buildawhale', 'upmewhale', 'rocky1', 'boomerang', 'dlike', 'krwhale', 'steem-echo', 'smartsteem', 'tipu', 'cardboard']);

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

async function collectPosts() {
  const cutoffMs = Date.now() - WINDOW_H * 3600_000;
  const posts = [];
  const errors = [];
  for (const who of ACCOUNTS) {
    try {
      let start = undefined;
      for (let page = 0; page < 3 && posts.filter(p => p.author === who).length < MAX_PER_ACCOUNT; page++) {
        const feed = await rpc('condenser_api.get_discussions_by_blog', [
          { tag: who, limit: 20, ...(start ? { start_author: who, start_permlink: start } : {}) },
        ]);
        if (!Array.isArray(feed) || feed.length === 0) break;
        let olderThanWindow = false;
        for (const p of feed) {
          if (!p || p.author !== who) continue;
          const createdMs = Date.parse(p.created || '');
          if (!Number.isFinite(createdMs)) continue;
          if (createdMs < cutoffMs) { olderThanWindow = true; break; }
          if (p.parent_author) continue; // blog feed should be posts, but guard anyway
          posts.push(p);
        }
        if (olderThanWindow) break;
        const last = feed[feed.length - 1];
        start = last && last.permlink;
        if (!start) break;
        await new Promise(r => setTimeout(r, 150));
      }
    } catch (e) {
      errors.push(`${who}: ${String(e.message || e).slice(0, 100)}`);
    }
  }
  return { posts, errors };
}

async function measurePost(p) {
  const votes = Array.isArray(p.active_votes) ? p.active_votes : [];
  const external = votes.filter(v => v && !ACCOUNTS.includes(v.voter));
  const externalReal = external.filter(v => !NON_SIGNAL.has(v.voter) && Math.abs(parseInt(v.rshares || '0', 10) || 0) > 0);
  const extRshares = externalReal.reduce((s, v) => s + (parseInt(v.rshares || '0', 10) || 0), 0);
  let replies = [];
  try {
    replies = (await rpc('condenser_api.get_content_replies', [p.author, p.permlink])) || [];
  } catch { replies = []; }
  const extRepliers = [...new Set(replies.map(r => r && r.author).filter(a => a && !ACCOUNTS.includes(a)))];
  const meta = (() => { try { return JSON.parse(p.json_metadata || '{}'); } catch { return {}; } })();
  const tags = Array.isArray(meta.tags) ? meta.tags.filter(t => typeof t === 'string').slice(0, 4) : [];
  return {
    author: p.author,
    permlink: p.permlink,
    title: String(p.title || '').slice(0, 120),
    createdAt: p.created,
    ageHours: Math.round((Date.now() - Date.parse(p.created || '')) / 360_000) / 10,
    tag: p.category || (tags[0] ?? 'unknown'),
    tags,
    votesTotal: votes.length,
    externalVotes: externalReal.length,
    externalRshares: extRshares,
    repliesTotal: replies.length,
    externalRepliers: extRepliers.slice(0, 6),
    externalRepliersCount: extRepliers.length,
    pendingPayout: p.pending_payout_value || null,
  };
}

const extEngagement = (m) => m.externalRshares + m.externalRepliersCount * 1e9; // replies weigh like a whale vote — conversation is audience truth

(async () => {
  const at = new Date().toISOString();
  const day = at.slice(0, 10);
  const { posts, errors } = await collectPosts();

  const measured = [];
  for (const p of posts) {
    try { measured.push(await measurePost(p)); } catch (e) { errors.push(`${p.author}/${p.permlink}: ${String(e.message || e).slice(0, 80)}`); }
    await new Promise(r => setTimeout(r, 150));
  }

  // Topic resonance — raw numbers only, ranked by external engagement
  const byTopic = {};
  for (const m of measured) {
    const t = (byTopic[m.tag] ||= { tag: m.tag, posts: 0, externalVotes: 0, externalRshares: 0, replies: 0 });
    t.posts += 1;
    t.externalVotes += m.externalVotes;
    t.externalRshares += m.externalRshares;
    t.replies += m.repliesTotal;
  }
  const topics = Object.values(byTopic)
    .map(t => ({ ...t, externalEngagement: t.externalRshares + t.replies * 1e9 }))
    .sort((a, b) => b.externalEngagement - a.externalEngagement)
    .slice(0, TOP_TOPICS);

  const topPosts = [...measured].sort((a, b) => extEngagement(b) - extEngagement(a)).slice(0, TOP_POSTS);

  const totals = {
    postsMeasured: measured.length,
    postsWithExternalVotes: measured.filter(m => m.externalVotes > 0).length,
    postsWithReplies: measured.filter(m => m.repliesTotal > 0).length,
    externalVotesTotal: measured.reduce((s, m) => s + m.externalVotes, 0),
    externalRsharesTotal: measured.reduce((s, m) => s + m.externalRshares, 0),
    repliesTotal: measured.reduce((s, m) => s + m.repliesTotal, 0),
    externalRepliersTotal: measured.reduce((s, m) => s + m.externalRepliersCount, 0),
  };
  const conversationSharePct = totals.postsMeasured ? Math.round(totals.postsWithReplies / totals.postsMeasured * 1000) / 10 : 0;

  // Zero-signal gate: all-zero external engagement now AND in the previous 2 digests
  const digestFiles = (fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : [])
    .filter(f => /^digest-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const zeroDays = [];
  for (let i = digestFiles.length - 1; i >= 0 && zeroDays.length < ZERO_GATE_DAYS - 1; i--) {
    try {
      const prev = JSON.parse(fs.readFileSync(path.join(OUT_DIR, digestFiles[i]), 'utf8'));
      if (prev.day !== day && (prev.totals?.externalVotesTotal || 0) === 0 && (prev.totals?.repliesTotal || 0) === 0) {
        zeroDays.push(prev.day);
      } else break;
    } catch { break; }
  }
  const allZeroNow = totals.postsMeasured > 0 && totals.externalVotesTotal === 0 && totals.repliesTotal === 0;
  const gateTripped = allZeroNow && zeroDays.length >= ZERO_GATE_DAYS - 1;

  const digest = {
    tool: 'audience-analyst.mjs',
    runAt: at,
    day,
    windowHours: WINDOW_H,
    accounts: ACCOUNTS,
    note: 'daily audience-engagement digest on community-account public content (read-only, keyless). Zero engagement is recorded as measured, not padded.',
    measured: { postsMeasured: measured.length, errors },
    totals,
    conversationSharePct,
    topics,
    topPosts,
    zeroSignal: { allZeroNow, priorZeroDays: zeroDays, gateDays: ZERO_GATE_DAYS, gateTripped },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `digest-${day}.json`), JSON.stringify(digest, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(digest, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, `digest-${day}.md`), md(digest));
  console.log(JSON.stringify({ state: 'ok', posts: measured.length, externalVotes: totals.externalVotesTotal, replies: totals.repliesTotal, topics: topics.length, gateTripped }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 200) })); process.exit(0); });

function md(d) {
  const lines = [
    `# audience digest ${d.day} (48h window)`,
    '',
    `posts measured: **${d.totals.postsMeasured}** · external votes: **${d.totals.externalVotesTotal}** · replies: **${d.totals.repliesTotal}** · external rshares: **${d.totals.externalRsharesTotal}** · posts with replies: **${d.conversationSharePct}%**`,
    '',
    '| topic | posts | ext votes | replies | ext rshares |',
    '|---|---|---|---|---|',
    ...d.topics.map(t => `| ${t.tag} | ${t.posts} | ${t.externalVotes} | ${t.replies} | ${t.externalRshares} |`),
    '',
    ...d.topPosts.map(m => `- ${m.author}/${m.permlink} — "${m.title}" · ext votes ${m.externalVotes} · replies ${m.repliesTotal} · rshares ${m.externalRshares}`),
    '',
    d.zeroSignal.gateTripped
      ? `**gate tripped: zero external engagement for ${d.zeroSignal.gateDays} consecutive digest days** (${[...d.zeroSignal.priorZeroDays, d.day].join(', ')})`
      : `gate: not tripped (${d.zeroSignal.allZeroNow ? 'zero day recorded honestly' : 'external engagement measured'})`,
  ];
  return lines.join('\n') + '\n';
}
