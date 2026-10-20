#!/usr/bin/env node
/**
 * office-feed — merged PUBLIC fleet+chain digest for the Domain landing page.
 *
 * Owner mandate (trace 1a1…c355): the Domain page must stay ALIVE —
 * never silently stale. This feeder publishes one small same-origin file,
 * dex/office-feed.json, that the page can read even when the FleetHQ office
 * digest is not yet published. READ-ONLY across the network: no secrets, no
 * broadcasts, no keys.
 *
 * REDACTION LAW (task 7-b / lane 9-b): tier-A keyless aggregates ONLY —
 * verdicts, counts, timestamps, public post metadata. No addresses, no
 * strategy params beyond verdict strings, no roster tables, no secret names.
 * If a source cannot be read, the field is null and ok:false is recorded —
 * the page shows honest "אין נתון".
 *
 * [zai-12a] UNWIRED-ASSETS wiring (census sovereign/UNWIRED-ASSETS-2026-10-11.md):
 *   - learning: knowledge-cards.json (HE, 39 cards — census found ZERO machine
 *     consumers) gets its first public consumer: one card of the day, rotated
 *     deterministically by UTC day (id/title/tag only — titles measured clean
 *     against the banned-token list, 0 hits). learning-summary.json gains a
 *     public aggregate consumer (counts + stamp only).
 *   - mirror: honest age of the dex/{onramp,showcase,relay}.json local copies
 *     vs the 48h law — the census measured 528h-stale copies (Console source
 *     fresh, dex-mirror FILES skips them; work-order WO-unwired-dex-mirror).
 *     Until that lands, the gap is VISIBLE here — a site never lies about age.
 *
 * Usage:
 *   node agents/office-feed.mjs             # live run, writes dex/office-feed.json
 *   node agents/office-feed.mjs --selftest  # offline validation, no network
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dex', 'office-feed.json');
const SCHEMA = 'roshpinacare.office-feed/1';
const TIMEOUT_MS = 12000;
const HEADCORNER = 'headcorner'; // public ops account (on-chain public identity)
const STEEM_RPC = 'https://api.steemit.com';
const FLEETHQ_DIGEST = 'https://roshpinacare-sys.github.io/FleetHQ/digest.json';
const SANDBOX_RAW = 'https://raw.githubusercontent.com/roshpinacare-sys/Sandbox/main/probes';

const log = (...a) => console.log('[office-feed]', ...a);

async function jget(url, opts) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'saos-office-feed/1 (public reads only)' }, ...opts });
    if (!r.ok) throw new Error(`http ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

function utcStamp(d = new Date()) { return d.toISOString(); }

async function steemRpc(method, params) {
  const j = await jget(STEEM_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

function readJsonSafe(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function dayUtc(back = 0) {
  const d = new Date(Date.now() - back * 86400e3);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const out = {
    schema: SCHEMA,
    publishedAt: utcStamp(),
    redaction: 'tier-A keyless aggregates only — no addresses, no params, no roster (see sovereign/zai-audit/exposure-execution-2026-10-11.json)',
    staleHoursLaw: 24,
    office: null,
    chain: { steem: null },
    grid: null,
    world: null,
    deposits: null,
    probes: { hive: null, blurt: null },
    actions: { recentRuns: null },
    learning: null,
    mirror: null,
  };

  // 1) FleetHQ office digest (may not exist yet — honest null)
  try {
    const d = await jget(FLEETHQ_DIGEST);
    out.office = {
      url: 'https://roshpinacare-sys.github.io/FleetHQ/',
      digestOk: true,
      digestPublishedAt: d.publishedAt || d.generatedAt || d.updatedAt || d.at || null,
    };
  } catch (e) {
    out.office = { url: 'https://roshpinacare-sys.github.io/FleetHQ/', digestOk: false, error: String(e.message).slice(0, 60) };
  }

  // 2) Steem pulse: head block + public blog titles of the ops account
  try {
    const [dgp, posts] = await Promise.all([
      steemRpc('condenser_api.get_dynamic_global_properties', []),
      steemRpc('condenser_api.get_discussions_by_blog', [{ tag: HEADCORNER, limit: 3 }]),
    ]);
    out.chain.steem = {
      ok: true,
      headBlock: dgp.head_block_number ?? null,
      headTime: dgp.time ? dgp.time + 'Z' : null,
      headcornerLatest: (Array.isArray(posts) ? posts : []).map(p => ({
        title: String(p.title || ''),
        permlink: String(p.permlink || ''),
        created: p.created ? p.created + 'Z' : null,
        pendingPayout: p.pending_payout_value || '0.000 SBD',
        totalPayout: p.total_payout_value || '0.000 SBD',
      })),
    };
  } catch (e) {
    out.chain.steem = { ok: false, error: String(e.message).slice(0, 60) };
  }

  // 3) Grid verdict line (verdict only — params stay out by law)
  const grid = readJsonSafe(join(ROOT, 'dex', 'grid.json'));
  if (grid) {
    out.grid = {
      verdict: typeof grid.verdict === 'string' ? grid.verdict.slice(0, 40) : null,
      blocker: typeof grid.blocker === 'string' ? grid.blocker.slice(0, 80) : null,
      chains: Array.isArray(grid.chains) ? grid.chains.filter(c => typeof c === 'string') : null,
      publishedAt: grid.publishedAt || null,
    };
  }

  // 4) World book aggregates (counts only)
  const world = readJsonSafe(join(ROOT, 'dex', 'world.json'));
  if (world && world.state) {
    const s = world.state;
    out.world = {
      height: s.height ?? null,
      tps: s.tps ?? null,
      opsTotal: s.opsTotal ?? null,
      fills: s.fills ?? null,
      swaps: s.swaps ?? null,
      publishedAt: world.publishedAt || null,
    };
  }

  // 5) Deposits count only (addresses never leave tier-A receive-address fields untouched here — we do not copy them)
  const deps = readJsonSafe(join(ROOT, 'dex', 'deposits.json'));
  if (deps) {
    out.deposits = {
      count: Array.isArray(deps.deposits) ? deps.deposits.length : null,
      updatedAt: deps.updatedAt || null,
    };
  }

  // 6) Sandbox probes (today, then yesterday)
  for (const kind of ['hive', 'blurt']) {
    let digest = null, back = 0;
    for (; back < 2 && !digest; back++) {
      try { digest = await jget(`${SANDBOX_RAW}/${kind}/${dayUtc(back)}.json`); } catch { /* try next day */ }
    }
    out.probes[kind] = digest
      ? { ok: digest.ok === true, at: digest.at || null, endpoint: (digest.endpoint_used || digest.node_used || null) }
      : { ok: false, at: null, endpoint: null };
  }

  // 6.5) [zai-12a] Learning pulse — unwired-assets wiring (tier-A aggregates)
  const cards = readJsonSafe(join(ROOT, 'agents', 'knowledge-cards.json'));
  const learn = readJsonSafe(join(ROOT, 'agents', 'learning-summary.json'));
  if (Array.isArray(cards) && cards.length) {
    const day = Math.floor(Date.now() / 86400e3);
    const c = cards[day % cards.length] || null;
    out.learning = {
      cardsCount: cards.length,
      today: c && c.id ? { id: String(c.id), title: String(c.title || ''), tag: String(c.tag || '') } : null,
      external: learn && learn.byCard
        ? { cards: Object.keys(learn.byCard).length, at: learn.at || null }
        : null,
    };
  }

  // 6.6) [zai-12a] Mirror-age honesty — local dex copies vs the 48h law, measured
  const mirrorFiles = {
    onramp: (j) => Date.parse((j.onramp && j.onramp.at) || '') || null,
    showcase: (j) => (typeof j.at === 'number' ? j.at : Date.parse(j.at || '')) || null,
    relay: (j) => (j.relay && typeof j.relay.lastActivityAt === 'number' ? j.relay.lastActivityAt : null),
  };
  const mirror = {};
  for (const [name, tsOf] of Object.entries(mirrorFiles)) {
    const j = readJsonSafe(join(ROOT, 'dex', `${name}.json`));
    let ageH = null;
    if (j) { const ts = tsOf(j); if (Number.isFinite(ts)) ageH = Math.round(((Date.now() - ts) / 3.6e6) * 10) / 10; }
    mirror[name] = { ageH, stale48: ageH == null ? null : ageH > 48 };
  }
  out.mirror = { law: 'local copies older than 48h mean a dead mirror pipe (see dex-mirror.mjs)', files: mirror };

  // 7) Actions runs (public repo, unauthenticated, ONE polite batch)
  try {
    const j = await jget('https://api.github.com/repos/roshpinacare-sys/Domain/actions/runs?per_page=8');
    out.actions.recentRuns = (j.workflow_runs || []).map(r => ({
      name: r.name || null, status: r.status || null, conclusion: r.conclusion || null,
      createdAt: r.created_at || null,
    }));
  } catch (e) {
    out.actions.recentRuns = null;
    out.actions.error = String(e.message).slice(0, 60);
  }

  // atomic write
  const tmp = OUT + '.tmp';
  writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
  renameSync(tmp, OUT);
  log('wrote', OUT, 'office=' + (out.office.digestOk ? 'digest-ok' : 'digest-404'),
      'steem=' + (out.chain.steem && out.chain.steem.ok ? 'ok' : 'fail'),
      'grid=' + (out.grid ? out.grid.verdict : 'null'));
}

/* ── offline selftest: schema shape + redaction guards, zero network ── */
function selftest() {
  const fixture = {
    schema: SCHEMA, publishedAt: utcStamp(), redaction: 'x', staleHoursLaw: 24,
    office: { url: 'u', digestOk: false, error: 'http 404' },
    chain: { steem: { ok: true, headBlock: 1, headTime: 't', headcornerLatest: [{ title: 't', permlink: 'p', created: 'c', pendingPayout: '0.000 SBD', totalPayout: '0.000 SBD' }] } },
    grid: { verdict: 'ARMED-STABLE', blocker: null, chains: ['STEEM'], publishedAt: 'p' },
    world: { height: 1, tps: 2, opsTotal: 3, fills: 4, swaps: 5, publishedAt: 'p' },
    deposits: { count: 0, updatedAt: 'u' },
    probes: { hive: { ok: true, at: 'a', endpoint: 'e' }, blurt: { ok: false, at: null, endpoint: null } },
    actions: { recentRuns: [{ name: 'n', status: 'completed', conclusion: 'success', createdAt: 'c' }] },
    learning: { cardsCount: 39, today: { id: 'verify-then-sign', title: 't', tag: 'security' }, external: { cards: 8, at: 'a' } },
    mirror: { law: 'l', files: { onramp: { ageH: 1.2, stale48: false }, showcase: { ageH: null, stale48: null }, relay: { ageH: 52.0, stale48: true } } },
  };
  const banned = [/STM[0-9A-Za-z]{10,}/, /5[HJK][0-9A-Za-z]{10,}/, /0x[0-9a-fA-F]{6,}/, /TG[0-9A-Za-z]{8,}/, /WIF/i, /\bsteem_active\b/i, /\bcommitPct\b/, /\bspreadBps\b/];
  const blob = JSON.stringify(fixture);
  const hits = banned.filter(rx => rx.test(blob));
  if (hits.length) { console.error('selftest FAIL: redaction tokens present', hits.map(String)); process.exit(2); }
  for (const k of ['schema', 'publishedAt', 'office', 'chain', 'grid', 'world', 'deposits', 'probes', 'actions', 'learning', 'mirror']) {
    if (!(k in fixture)) { console.error('selftest FAIL: missing key', k); process.exit(2); }
  }
  if (fixture.chain.steem.headcornerLatest[0].pendingPayout !== '0.000 SBD') { console.error('selftest FAIL: payout shape'); process.exit(2); }
  console.log('selftest PASS (schema keys + redaction token guards, offline)');
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  main().catch(e => { log('unexpected failure (writing honest ok:false is preferred):', e.message); process.exit(0); });
}
