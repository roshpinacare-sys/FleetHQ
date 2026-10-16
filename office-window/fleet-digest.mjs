#!/usr/bin/env node
// fleet-digest.mjs — גורם-הדיג'סט של מפקדת הצי (FleetHQ office window)
// Zero deps. Node >= 18 (global fetch). Read-only: GitHub API + raw.githubusercontent.
//
// Honesty law:
//   * every number measured from a real source at run time; failures become "unknown"
//     with a reason — never fake green, never invented values.
//   * private repo NAMES are never written to the public digest (exposure policy 7-b,
//     FLEET-BINDING deliberately does not enumerate private fleet repos). They appear
//     as stable masked labels ("private-N") with their real measured health signals.
//   * token comes ONLY from env GH_TOKEN (optional). With no token → public data only,
//     rate limits honored, rest = unknown.
//
// Usage: node fleet-digest.mjs [--out office-window/dist/digest.json] [--owner roshpinacare-sys]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER_DEFAULT = 'roshpinacare-sys';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const args = process.argv.slice(2);
function argOf(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const OWNER = argOf('--owner', OWNER_DEFAULT);
const OUT = resolve(argOf('--out', resolve(dirname(fileURLToPath(import.meta.url)), 'dist/digest.json')));
const QUIET = args.includes('--quiet');
const UA = 'roshpinacare-fleet-office-digest/1 (+https://github.com/roshpinacare-sys/FleetHQ)';

const generatedAt = new Date().toISOString();
const errors = [];

function authHeaders(json = true) {
  const h = { 'user-agent': UA, accept: json ? 'application/vnd.github+json' : 'application/vnd.github.raw' };
  if (TOKEN) h.authorization = `Bearer ${TOKEN}`;
  return h;
}

let rateRemaining = null;
async function gh(path) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  let res;
  try {
    res = await fetch(url, { headers: authHeaders(true), redirect: 'follow' });
  } catch (e) {
    errors.push({ call: path, error: `network: ${e && e.message ? e.message : 'fetch failed'}` });
    return null;
  }
  const rem = res.headers.get('x-ratelimit-remaining');
  if (rem !== null) rateRemaining = Number(rem);
  if (res.status === 200 || res.status === 202) {
    try { return await res.json(); } catch { return null; }
  }
  let msg = `http ${res.status}`;
  try {
    const body = await res.json();
    if (body && body.message) msg += `: ${String(body.message).slice(0, 160)}`;
  } catch { /* ignore */ }
  errors.push({ call: path, error: msg });
  return null;
}

async function raw(path) {
  const url = path.startsWith('http') ? path : `https://raw.githubusercontent.com/${path}`;
  try {
    const res = await fetch(url, { headers: authHeaders(false), redirect: 'follow' });
    if (!res.ok) { errors.push({ call: url, error: `http ${res.status}` }); return null; }
    return await res.text();
  } catch (e) {
    errors.push({ call: url, error: `network: ${e && e.message ? e.message : 'fetch failed'}` });
    return null;
  }
}

function jparse(s) { try { return JSON.parse(s); } catch { return null; } }

// visibility re-check (fail-closed): a repo published as "public" must be provably
// public at render time. Anonymous probe (no token): 200 = public; anything else
// (404 private-or-absent, 403 rate-limit) = not proven → the repo is OMITTED from
// the public digest and its name is never written anywhere in the artifact.
async function publiclyVisible(full) {
  try {
    const res = await fetch(`https://api.github.com/repos/${full}`, {
      headers: { 'user-agent': UA, accept: 'application/vnd.github+json' },
    });
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    // 403 = degraded/rate-limited anonymous view → retry authenticated below
  } catch { /* fall through */ }
  if (TOKEN) {
    try {
      const res = await fetch(`https://api.github.com/repos/${full}`, { headers: authHeaders(true) });
      return res.status === 200;
    } catch { return false; }
  }
  return false;
}

const daysAgoIso = (d) => new Date(Date.now() - d * 86400000).toISOString();

// ---------------------------------------------------------------- repos list
async function listRepos() {
  if (TOKEN) {
    const mine = await gh('/user/repos?per_page=100&sort=pushed');
    if (Array.isArray(mine)) {
      const own = mine.filter((r) => r && r.owner && r.owner.login === OWNER);
      if (own.length) return { repos: own, mode: 'user-token' };
    }
  }
  const pub = await gh(`/users/${OWNER}/repos?per_page=100&sort=pushed`);
  if (Array.isArray(pub)) return { repos: pub, mode: TOKEN ? 'token-public-list' : 'public' };
  return { repos: null, mode: TOKEN ? 'token-public-list' : 'public' };
}

async function latestRun(full) {
  const d = await gh(`/repos/${full}/actions/runs?per_page=1`);
  const run = d && Array.isArray(d.workflow_runs) ? d.workflow_runs[0] : null;
  if (!run) return null;
  return {
    name: run.name || null,
    status: run.status || null,
    conclusion: run.conclusion || null,
    at: run.created_at || null,
    url: run.html_url || null,
  };
}

async function commits7d(full) {
  const d = await gh(`/repos/${full}/commits?per_page=100&since=${encodeURIComponent(daysAgoIso(7))}`);
  if (!Array.isArray(d)) return { count: null, capped: false };
  return { count: d.length, capped: d.length >= 100 };
}

// ---------------------------------------------------------------- grid verdict
// Preference order:
//  1. Domain dex/grid.json (PUBLIC, redacted for public by the exposure lanes) — primary.
//  2. saos-dex db/grid-public.json (grid-beat's own public doc; private repo → needs a
//     token with access; used only for verdict fields, never account/key material).
async function gridVerdict() {
  const fromDomain = jparse(await raw(`${OWNER}/Domain/main/dex/grid.json`));
  const src = fromDomain && fromDomain.verdict ? 'Domain dex/grid.json (public mirror)' : null;
  let g = fromDomain;
  if (!g || !g.verdict) {
    const fromDex = jparse(await raw(`${OWNER}/saos-dex/main/db/grid-public.json`));
    if (fromDex && fromDex.verdict) { g = fromDex; }
  }
  if (!g || !g.verdict) return { status: 'unknown', reason: 'no grid public doc reachable' };
  const verdict = {
    status: 'measured',
    source: src || 'saos-dex db/grid-public.json (needs token access)',
    publishedAt: g.publishedAt || null,
    engine: g.engine || null,
    real: !!g.real,
    armed: !!g.armed,
    verdict: g.verdict || null,
    blocker: g.blocker || null,
    chains: Array.isArray(g.chains) ? g.chains : null,
  };
  if (g.hive) {
    verdict.hive = {
      verdict: g.hive.verdict || null,
      authorityOk: typeof g.hive.authorityOk === 'boolean' ? g.hive.authorityOk : null,
      blocker: Array.isArray(g.hive.blocker) ? g.hive.blocker : (g.hive.blocker ? [g.hive.blocker] : null),
    };
  }
  return verdict;
}

// ---------------------------------------------------------------- fleet truth (grid-doctor)
async function fleetTruth() {
  const t = jparse(await raw(`${OWNER}/Domain/main/agents/grid-truth.json`));
  if (!t || !t.totals) return { status: 'unknown', reason: 'agents/grid-truth.json not reachable' };
  const st = t.totals && t.totals.steem ? t.totals.steem : {};
  const hv = t.totals && t.totals.hive ? t.totals.hive : {};
  return {
    status: 'measured',
    source: 'Domain agents/grid-truth.json (grid-doctor, live chain RPC — zero self-reports)',
    generatedAt: t.generatedAt || null,
    by: t.by || null,
    steem: {
      effectivePower: typeof st.effective_power === 'number' ? st.effective_power : null,
      accountsAlive: typeof st.accounts_alive === 'number' ? st.accounts_alive : null,
      liquid: typeof st.liquid === 'number' ? st.liquid : null,
    },
    hive: {
      effectivePower: typeof hv.effective_power === 'number' ? hv.effective_power : null,
      accountsAlive: typeof hv.accounts_alive === 'number' ? hv.accounts_alive : null,
    },
  };
}

// ---------------------------------------------------------------- sandbox probes
async function latestProbeDir(dir) {
  const list = await gh(`/repos/${OWNER}/Sandbox/contents/${dir}`);
  if (!Array.isArray(list)) return null;
  const files = list.filter((f) => f && f.type === 'file' && /\.json$/.test(f.name)).map((f) => f.name).sort();
  return files.length ? files[files.length - 1] : null;
}

async function sandboxProbes() {
  const out = {};
  const hiveFile = await latestProbeDir('probes/hive');
  if (hiveFile) {
    const h = jparse(await raw(`${OWNER}/Sandbox/main/probes/hive/${hiveFile}`));
    if (h) {
      const dgp = h.calls && h.calls.dgp && h.calls.dgp.result ? h.calls.dgp.result : {};
      out.hive = {
        status: 'measured',
        file: `probes/hive/${hiveFile}`,
        at: h.at || null,
        ok: !!h.ok,
        degraded: !!h.degraded,
        readOnly: !!h.read_only,
        broadcast: !!h.broadcast,
        keysUsed: !!h.keys_used,
        endpoint: h.endpoint_used || null,
        headBlock: typeof dgp.head_block_number === 'number' ? dgp.head_block_number : null,
        chainTime: dgp.time || null,
      };
    } else out.hive = { status: 'unknown', reason: `probes/hive/${hiveFile} unreadable` };
  } else out.hive = { status: 'unknown', reason: 'probe listing unavailable (probes/hive)' };

  const blurtFile = await latestProbeDir('probes/blurt');
  if (blurtFile) {
    const b = jparse(await raw(`${OWNER}/Sandbox/main/probes/blurt/${blurtFile}`));
    if (b) {
      const nodes = Array.isArray(b.nodes) ? b.nodes : [];
      const alive = nodes.filter((n) => n && n.alive).length;
      const used = nodes.find((n) => n && n.node === b.node_used) || {};
      out.blurt = {
        status: 'measured',
        file: `probes/blurt/${blurtFile}`,
        at: b.at || null,
        ok: !!b.ok,
        readOnly: !!b.read_only,
        broadcast: !!b.broadcast,
        keysUsed: !!b.keys_used,
        nodeUsed: b.node_used || null,
        aliveNodes: `${alive}/${nodes.length}`,
        headBlock: typeof used.head_block_number === 'number' ? used.head_block_number : null,
      };
    } else out.blurt = { status: 'unknown', reason: `probes/blurt/${blurtFile} unreadable` };
  } else out.blurt = { status: 'unknown', reason: 'probe listing unavailable (probes/blurt)' };
  return out;
}

// ---------------------------------------------------------------- main
const { repos: repoList, mode: listMode } = await listRepos();

const reposOut = [];
let privateCount = 0;
let privateIdx = 0;
let omittedUnverified = 0;
let stopEarly = false;

if (Array.isArray(repoList) && repoList.length) {
  for (const r of repoList) {
    if (rateRemaining === 0) { stopEarly = true; break; }
    const full = r.full_name;
    const isPrivate = !!r.private;
    if (isPrivate) { privateIdx += 1; privateCount += 1; }
    else {
      // fail-closed: publish as public only what is provably public right now
      if (!(await publiclyVisible(full))) { omittedUnverified += 1; continue; }
    }
    const entry = {
      name: isPrivate ? `private-${String(privateIdx).padStart(2, '0')}` : r.name,
      private: isPrivate,
      pushedAt: r.pushed_at || null,
      defaultBranch: r.default_branch || null,
      description: isPrivate ? null : (r.description || null),
      lastRun: null,
      lastRunReason: null,
      commits7d: null,
      commits7dCapped: false,
      commitsReason: null,
    };
    const run = await latestRun(full);
    if (run) {
      entry.lastRun = isPrivate
        ? { name: null, status: run.status, conclusion: run.conclusion, at: run.at, url: null }
        : run;
    } else entry.lastRunReason = 'latest-run-unavailable';
    const c = await commits7d(full);
    if (c.count !== null) { entry.commits7d = c.count; entry.commits7dCapped = c.capped; }
    else entry.commitsReason = 'commits-unavailable';
    reposOut.push(entry);
  }
}

if (stopEarly) errors.push({ call: 'loop', error: 'GitHub rate limit exhausted — remaining repos marked unknown (honest degradation)' });
if (omittedUnverified > 0) errors.push({ call: 'visibility-recheck', error: `${omittedUnverified} repo(s) omitted — public visibility not verifiable at render time (names withheld, fail-closed)` });


const digest = {
  schema: 'roshpinacare.fleet-digest/1',
  generatedAt,
  owner: OWNER,
  tokenMode: TOKEN ? 'gh-token' : 'public-unauthenticated',
  repoListMode: listMode,
  note: 'All values measured at render time by office-window/fleet-digest.mjs (read-only). Unknown means not measured — never a fake green. Private repo names are masked per exposure policy 7-b. Repos whose public visibility could not be re-verified at render time are omitted (fail-closed).',
  fleet: {
    reposSeen: reposOut.length,
    publicCount: reposOut.filter((r) => !r.private).length,
    privateCount,
    unverifiedOmitted: omittedUnverified,
    visibilityRecheck: 'fail-closed',
    rateLimitRemaining: rateRemaining,
    degradedEarly: stopEarly,
  },
  repos: reposOut,
  grid: await gridVerdict(),
  fleetTruth: await fleetTruth(),
  probes: await sandboxProbes(),
  errors,
};

// fail-closed scrub (runs after ALL collection): no repo name that is not
// verified-public may remain in the public artifact — including the error log
// (/user/repos 403, probe-list 404/403, network failures must not leak names).
const publicNames = new Set(reposOut.filter((r) => !r.private).map((r) => `${OWNER}/${r.name}`));
const scrubName = (t) => String(t).replace(new RegExp(`(?<!users/)${OWNER}/[A-Za-z0-9_.-]+`, 'g'), (m) => (publicNames.has(m) ? m : '(unpublished-source)'));
for (const e of errors) {
  if (e.call) e.call = scrubName(e.call);
  if (e.error) e.error = scrubName(e.error);
}

mkdirSync(dirname(OUT), { recursive: true });
// whole-artifact scrub: any OWNER/<name> that is not a verified-public repo
// (run URLs, error strings, anything forgotten upstream) is redacted before write.
let outText = JSON.stringify(digest, null, 2) + '\n';
outText = outText.replace(new RegExp(`(?<!users/)${OWNER}/[A-Za-z0-9_.-]+`, 'g'), (m) => (publicNames.has(m) ? m : '(unpublished-source)'));
writeFileSync(OUT, outText);
if (!QUIET) {
  const summary = {
    generatedAt,
    tokenMode: digest.tokenMode,
    reposSeen: digest.fleet.reposSeen,
    privateCount,
    grid: digest.grid.status === 'measured' ? digest.grid.verdict : 'unknown',
    probes: { hive: digest.probes.hive.status, blurt: digest.probes.blurt.status },
    errors: errors.length,
    out: OUT,
  };
  console.log(JSON.stringify(summary, null, 2));
}
process.exit(0);
