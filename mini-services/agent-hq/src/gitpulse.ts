// The git wire — the fleet's REAL commit stream.
// The fleet's mirror repo is an actual git repository whose history IS the
// fleet's actual activity (agent-verify gates, desk runs, repairs — each landed
// as a commit and pushed). Reading `git log` from the local clone is therefore
// the most honest possible "what is actually happening" feed: real timestamps,
// real subjects, nothing invented, nothing simulated. Metadata only — never
// file contents, never diffs, never anything private.
//
// SECURITY (Task 45-c): a commit SUBJECT and AUTHOR are UNTRUSTED DATA —
// anything that ever lands in the public repo's history (by an operator, an
// agent, or a leaked credential) could carry a secret-shaped string or
// control-character payload straight to the public socket UI. The gate
// (scrubSecrets + stripControl) therefore runs HERE, at the only place a
// CommitView is ever built — the same law the git-learning wire applies
// (gitlearn.ts) — so the pulse, the snapshot and every feed line built from
// these commits are clean by construction.
//
// Fail-soft everywhere: if git or the repo is missing, available=false and the
// UI simply hides the wire.

import { execFile } from 'child_process';
import type { CommitView, GitPulse } from './types';
import { scrubSecrets, stripControl } from './security';

const MAX_COMMITS = 40;

export interface GitWireSource {
  dir: string; // the git working tree (defaults to the data dir when it is a repo)
  label: string; // human label, public
  repoUrl: string; // public URL
  branch: string;
}

export function resolveGitSource(dataDir: string): GitWireSource {
  return {
    dir: dataDir,
    label: 'Domain · ספרי הצי',
    repoUrl: 'https://github.com/roshpinacare-sys/Domain',
    branch: 'main',
  };
}

function run(dir: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', dir, ...args], { timeout: 8000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

/**
 * The commit gate: scrub + strip ONE untrusted git-log field before it can
 * become part of any public view. Exported so the security regression suite
 * can prove the boundary holds (tools/security-regression.ts).
 */
export function sanitizeCommitField(raw: string, max: number): string {
  return stripControl(scrubSecrets(raw), max);
}

/** Build the public CommitView from raw git-log fields — always through the gate. */
export function toCommitView(src: GitWireSource, hash: string, ts: number, author: string, subject: string): CommitView {
  return {
    hash,
    ts,
    author: sanitizeCommitField(author || 'fleet', 40),
    subject: sanitizeCommitField(subject, 160),
    repo: src.label,
  };
}

/** One fetch of the real log. Returns newest-first commits, or null when unavailable. */
export async function fetchCommits(src: GitWireSource): Promise<CommitView[] | null> {
  try {
    // sanity: it is a repo (fails fast if not)
    await run(src.dir, ['rev-parse', '--is-inside-work-tree']);
    const fmt = '%h|%aI|%an|%s';
    const out = await run(src.dir, ['log', `--max-count=${MAX_COMMITS}`, '--date=iso-strict', `--format=${fmt}`, src.branch]);
    const commits: CommitView[] = [];
    for (const line of out.split('\n')) {
      const idx1 = line.indexOf('|');
      if (idx1 < 0) continue;
      const hash = line.slice(0, idx1);
      const rest = line.slice(idx1 + 1);
      const idx2 = rest.indexOf('|');
      const idx3 = rest.indexOf('|', idx2 + 1);
      if (idx2 < 0 || idx3 < 0) continue;
      const ts = Date.parse(rest.slice(0, idx2));
      const author = rest.slice(idx2 + 1, idx3);
      const subject = rest.slice(idx3 + 1);
      if (!hash || !Number.isFinite(ts)) continue;
      commits.push(toCommitView(src, hash, ts, author, subject));
    }
    return commits;
  } catch {
    return null;
  }
}

/** Polling wire: emits the full pulse on fetch and per-commit events for fresh commits. */
export class GitWire {
  pulse: GitPulse;
  private timer?: ReturnType<typeof setInterval>;
  private known = new Set<string>();
  private firstFetch = true;

  constructor(
    private src: GitWireSource,
    private onPulse: (p: GitPulse) => void,
    private onNewCommits: (cs: CommitView[]) => void,
    private pollMs = 25_000,
  ) {
    this.pulse = { available: false, commits: [], lastFetch: 0, repoUrl: src.repoUrl, repoLabel: src.label, branch: src.branch };
  }

  start() {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.pollMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh() {
    const commits = await fetchCommits(this.src);
    this.pulse = {
      available: commits !== null,
      commits: commits ?? [],
      lastFetch: Date.now(),
      repoUrl: this.src.repoUrl,
      repoLabel: this.src.label,
      branch: this.src.branch,
    };
    if (commits) {
      const fresh: CommitView[] = [];
      for (const c of commits) {
        if (!this.known.has(c.hash)) {
          this.known.add(c.hash);
          if (!this.firstFetch) fresh.push(c);
        }
      }
      // keep the known set bounded
      if (this.known.size > 400) this.known = new Set([...this.known].slice(-200));
      this.firstFetch = false;
      this.onPulse(this.pulse);
      if (fresh.length) this.onNewCommits(fresh);
    } else {
      this.onPulse(this.pulse);
    }
  }
}
