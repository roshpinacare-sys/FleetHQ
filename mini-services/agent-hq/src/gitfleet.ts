// ============================================================================
// THE GIT FLEET INVENTORY — מלאי-הסנכרון האמיתי של הריפויים המורשים
// ----------------------------------------------------------------------------
// A green commit count is NOT proof of synchronization. This wire answers the
// operator's real question: for every repo the office is authorized to manage —
// is it actually in sync, behind, ahead, diverged, dirty, or unreachable?
//
//   · READ-ONLY FOREVER: never fetch, never push, never touch the working
//     tree. The inventory measures; it does not act.
//   · NO REMOTE URLS: `git remote -v` is never called. Upstream existence is
//     measured through @{upstream} itself, so a remote URL (which can embed
//     credentials) is never read and never emitted.
//   · UNKNOWN ≠ HEALTHY: an unconfigured upstream stays `unknown` with
//     ahead/behind null — nothing is invented to look green.
//   · SECURITY GATE: every error message passes scrubSecrets + stripControl
//     and URL-shaped substrings are dropped before leaving the office.
//
// Fail-soft per repo: one broken repo never breaks the fleet view.
// ============================================================================

import { execFile } from 'child_process';
import { stat, realpath } from 'fs/promises';
import { join } from 'path';
import { scrubSecrets, stripControl } from './security';

export type RepoSyncState =
  | 'up-to-date'
  | 'behind'
  | 'ahead'
  | 'diverged'
  | 'dirty'
  | 'unreachable'
  | 'unknown';

export interface RepoFleetView {
  label: string;
  dir: string; // ok to expose — the learning wire already exposes it
  branch: string;
  available: boolean;
  head: string; // short sha, 7 chars; '' when the repo is unreachable
  upstreamConfigured: boolean;
  ahead: number | null; // commits only-local; null = not measured
  behind: number | null; // commits only-upstream; null = not measured
  diverged: boolean | null;
  dirtyCount: number | null; // `status --porcelain` lines; null = not measured
  lastFetchAt: number | null; // epoch ms — .git/FETCH_HEAD mtime when present
  lastSyncError: string | null; // sanitized — never a URL, never a secret
  syncState: RepoSyncState;
}

export interface RepoFleetSource {
  label: string;
  dir: string;
  branch?: string;
}

function run(dir: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', dir, ...args], { timeout: 8000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

/** Sanitize a git error before it leaves the office: no URLs, no secrets, no control chars. */
function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  const noUrls = raw.replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+/g, '«redacted»');
  return stripControl(scrubSecrets(noUrls), 160);
}

/** Honest fetch freshness: the mtime of .git/FETCH_HEAD when it exists, else null.
 *  We never fetch ourselves — we only read the trace a real fetch left behind. */
async function fetchHeadMtime(dir: string): Promise<number | null> {
  try {
    const st = await stat(join(dir, '.git', 'FETCH_HEAD'));
    return st.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * The ONE sync-state law (truthful derivation, in order):
 *   unreachable  — not a repo / cannot be read
 *   unknown      — any measurement hole (no upstream, unmeasured dirtiness)
 *   dirty        — dirtyCount > 0 wins (ahead/behind still reported as numbers)
 *   diverged     — ahead > 0 AND behind > 0
 *   behind/ahead — one-sided drift
 *   up-to-date   — only with full proof: clean tree AND measured 0/0
 */
function deriveSyncState(v: RepoFleetView): RepoSyncState {
  if (!v.available) return 'unreachable';
  if (v.dirtyCount === null) return 'unknown'; // dirtiness unmeasured — no clean claim
  if (v.upstreamConfigured && v.ahead === null) return 'unknown'; // upstream set but unmeasured
  if (v.dirtyCount > 0) return 'dirty';
  if (v.ahead !== null && v.behind !== null && v.diverged) return 'diverged';
  if (v.behind !== null && v.behind > 0) return 'behind';
  if (v.ahead !== null && v.ahead > 0) return 'ahead';
  if (v.upstreamConfigured && v.ahead !== null && v.behind !== null) return 'up-to-date';
  return 'unknown'; // no upstream configured — nothing to be "in sync" with
}

async function fleetRepo(label: string, dir: string, branch: string): Promise<RepoFleetView> {
  const view: RepoFleetView = {
    label,
    dir,
    branch,
    available: false,
    head: '',
    upstreamConfigured: false,
    ahead: null,
    behind: null,
    diverged: null,
    dirtyCount: null,
    lastFetchAt: null,
    lastSyncError: null,
    syncState: 'unreachable',
  };
  // first recorded failure wins; later fields keep their honest nulls
  const note = (e: unknown) => {
    if (!view.lastSyncError) view.lastSyncError = sanitizeError(e);
  };

  // sanity: is it a real working tree? (fails fast for missing/unreadable repos)
  try {
    await run(dir, ['rev-parse', '--is-inside-work-tree']);
  } catch (e) {
    note(e); // syncState stays 'unreachable', available stays false
    return view;
  }
  // INDEPENDENCE LAW (Task 46): a directory that is merely a SUBDIRECTORY of
  // another repository is not a repository. Walking up the tree would present
  // a foreign repo's branch/head/ahead/behind under this row's label — the
  // exact "similarly named directories" confusion a fleet inventory must
  // never ship. A work-tree subdirectory is honestly unavailable until it has
  // its own clone again.
  {
    const top = await run(dir, ['rev-parse', '--show-toplevel']).catch(() => '');
    const realDir = await realpath(dir).catch(() => dir);
    if (!top || top.trim() !== realDir) {
      view.lastSyncError = top
        ? 'not an independent repository — this directory lives inside another work tree'
        : 'no repository root resolved at this path';
      view.syncState = 'unreachable';
      return view;
    }
  }
  view.available = true;
  view.syncState = 'unknown'; // no proof yet — stays unknown until measured

  const head = await run(dir, ['rev-parse', '--short', 'HEAD']).catch((e) => {
    note(e);
    return '';
  });
  view.head = head.trim().slice(0, 7);

  // NOTE: the no-upstream case is a measured ABSENCE, not an error — no lastSyncError.
  let upstream = '';
  try {
    upstream = (await run(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).trim();
  } catch {
    view.upstreamConfigured = false;
  }
  view.upstreamConfigured = upstream.length > 0;

  if (view.upstreamConfigured) {
    try {
      // left = local-only commits (ahead), right = upstream-only commits (behind)
      const [l, r] = (await run(dir, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])).trim().split(/\s+/);
      const ahead = Number(l);
      const behind = Number(r);
      if (Number.isFinite(ahead) && Number.isFinite(behind)) {
        view.ahead = ahead;
        view.behind = behind;
        view.diverged = ahead > 0 && behind > 0;
      }
    } catch (e) {
      note(e); // ahead/behind stay null → syncState 'unknown'
    }
  }

  try {
    const st = await run(dir, ['status', '--porcelain']);
    view.dirtyCount = st.split('\n').filter((l) => l.trim().length > 0).length;
  } catch (e) {
    note(e); // dirtyCount stays null → syncState 'unknown'
  }

  view.lastFetchAt = await fetchHeadMtime(dir);
  view.syncState = deriveSyncState(view);
  return view;
}

/** Collect the truthful sync/health inventory for the office's authorized repos. Never throws. */
export async function collectRepoFleet(repos: RepoFleetSource[]): Promise<RepoFleetView[]> {
  return Promise.all(repos.map((r) => fleetRepo(r.label, r.dir, r.branch ?? 'main')));
}
