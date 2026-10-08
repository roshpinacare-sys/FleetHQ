// ============================================================================
// THE GIT LEARNING WIRE — המשרד לומד מהגיט, דרך שער האבטחה
// ----------------------------------------------------------------------------
// The office studies its REAL repositories (Domain = the fleet's data books,
// FleetHQ = the office's own code) and turns the commit stream into a compact,
// SECRET-SAFE digest for the operator brain:
//
//   · METADATA ONLY — subjects, authors, counts, hot file paths.
//   · NEVER file contents, never diffs, never anything from the working tree.
//   · Every subject passes scrubSecrets() — a pushed commit can NEVER smuggle
//     a key or an instruction-shaped secret into a prompt.
//   · Sensitive paths are DROPPED (isSensitivePath), allowlist applies on top,
//     so the digest can only mention legitimate work areas.
//   · Commit subjects are UNTRUSTED DATA by doctrine: the operator prompts
//     label them as data, never as instructions (anti prompt-injection).
//
// Fail-soft: any repo that is missing/undreadable reports available:false and
// the office keeps running (the digest just says so honestly).
// ============================================================================

import { execFile } from 'child_process';
import { isSensitivePath, scrubSecrets, stripControl } from './security';

export interface GitRepoLearning {
  label: string;
  dir: string;
  branch: string;
  available: boolean;
  commits24h: number;
  commits7d: number;
  lastSubjects: string[]; // scrubbed + capped, newest first
  hotPaths: string[]; // allowlisted work areas, capped 6
}

export interface GitLearning {
  repos: GitRepoLearning[];
  digest: string; // compact text for operator/worker prompts (capped)
  ts: number;
}

function run(dir: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', dir, ...args], { timeout: 8000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

/** Only legitimate work areas may be named in a learning digest. */
const ALLOWED_PATH_RE = /^(data|docs|mini-services|src|public|scripts|examples|skills)\//;

function hotPathsFromNameOnly(out: string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of out) {
    const p = line.trim();
    if (!p || p.includes(' ') || isSensitivePath(p) || !ALLOWED_PATH_RE.test(p)) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([p, n]) => `${p}×${n}`);
}

async function learnRepo(label: string, dir: string, branch: string): Promise<GitRepoLearning> {
  const base: GitRepoLearning = {
    label,
    dir,
    branch,
    available: false,
    commits24h: 0,
    commits7d: 0,
    lastSubjects: [],
    hotPaths: [],
  };
  try {
    await run(dir, ['rev-parse', '--is-inside-work-tree']);
    const countLines = async (args: string[]) => {
      const out = await run(dir, args);
      return out.split('\n').filter((l) => l.trim()).length;
    };
    const [c24, c7] = await Promise.all([
      countLines(['log', '--since=24.hours.ago', '--oneline', branch]).catch(() => 0),
      countLines(['log', '--since=7.days.ago', '--oneline', branch]).catch(() => 0),
    ]);
    const subjectsRaw = await run(dir, ['log', '--max-count=12', `--format=%s`, branch]).catch(() => '');
    const subjects = subjectsRaw
      .split('\n')
      .map((s) => stripControl(scrubSecrets(s), 110))
      .filter(Boolean)
      .slice(0, 12);
    const namesRaw = await run(dir, ['log', '--max-count=200', '--name-only', '--format=', branch]).catch(() => '');
    const hotPaths = hotPathsFromNameOnly(namesRaw.split('\n'));
    return { ...base, available: true, commits24h: c24, commits7d: c7, lastSubjects: subjects, hotPaths };
  } catch {
    return base;
  }
}

/** Collect the learning digest for the office's repos. Never throws. */
export async function collectGitLearning(
  repos: Array<{ label: string; dir: string; branch?: string }>,
): Promise<GitLearning> {
  const learned = await Promise.all(repos.map((r) => learnRepo(r.label, r.dir, r.branch ?? 'main')));
  const parts: string[] = [];
  for (const r of learned) {
    if (!r.available) {
      parts.push(`[${r.label}] לא זמין`);
      continue;
    }
    const subj = r.lastSubjects.length ? r.lastSubjects.slice(0, 6).map((s) => `"${s}"`).join(', ') : '—';
    const hot = r.hotPaths.length ? r.hotPaths.join(', ') : '—';
    parts.push(`[${r.label}] 24h:${r.commits24h} 7d:${r.commits7d} · נושאים: ${subj} · אזורים חמים: ${hot}`);
  }
  return { repos: learned, digest: parts.join('\n').slice(0, 1400), ts: Date.now() };
}
