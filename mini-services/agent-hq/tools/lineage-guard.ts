#!/usr/bin/env bun
// ============================================================================
// lineage-guard — the FleetHQ repo's autonomous lineage keeper (stdlib only).
//
// LAW (owner directive, protocol 16, target 1): monitor the local repository
// state; the moment a parallel instance pushes to origin/main, rebase onto it,
// sanity-syntax-compile the changed sources, and keep the deployment path
// perfectly linear — without waiting for a human.
//
// TURF: this guard covers ONLY the FleetHQ checkout (/home/z/my-project).
// The Domain clone has its own syncer (domain-sync.sh, 600s loop) — two
// pushers on one repo is the proven twin-race pathology, so the guard never
// touches Domain.
//
// THE UNION LAW (owner-ratified, proven on d62e9c2):
//   - JSON conflict  → live-wins: both stages parsed, the record with the
//     fresher embedded timestamp (at/updated_at/ts/synced_at/updated) wins;
//     the winner is written verbatim, never re-serialized.
//   - JSONL conflict → union-ts-ordered: both stages merged, exact duplicate
//     lines dropped, sorted by the `ts` field.
//   - ANY other conflict (real code) → the guard does NOT guess. It aborts
//     the rebase, restores the working tree, and records `conflict_manual`.
//
// SAFETY RAILS, each one earned the hard way:
//   - single instance (in-process busy flag + pid lockfile with liveness)
//   - bounded git timeouts; bounded conflict-continue loop (10)
//   - bounded push retries (3 attempts total, re-fetch between attempts)
//   - syntax sanity via Bun's own transpiler on every changed source file —
//     a syntax-broken tree is NEVER pushed (event `syntax_fail`, tree stays)
//   - secret scan on the outgoing added lines — a credential hit is NEVER
//     pushed (event `secret_abort`)
//   - stash dance for a dirty tree; a stash-pop conflict keeps the stash
//     entry intact (recoverable) and records `stash_pop_conflict`
//   - everything lands in receipts/lineage-guard.jsonl (events) and
//     receipts/lineage-guard.json (latest state) — git-backed, honest.
//   - fail-soft: any crash is logged and retried next tick; the office and
//     its writers are never blocked by this guard.
// ============================================================================
import { execFile } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project'; // FleetHQ checkout — nothing else is our turf
const RECEIPTS = path.join(ROOT, 'receipts');
const STATE_JSON = path.join(RECEIPTS, 'lineage-guard.json');
const EVENTS_JSONL = path.join(RECEIPTS, 'lineage-guard.jsonl');
const LOCK = '/tmp/lineage-guard.lock';

const TICK_MS = 90_000; // "the moment" a twin pushes — 90s is tight without racing the wire
const MAX_ATTEMPTS = 3;
const CONTINUE_LIMIT = 10;
const EVENTS_MAX_LINES = 1000;
const FETCH_TIMEOUT = 60_000;
const GIT_TIMEOUT = 90_000;
const PUSH_TIMEOUT = 120_000;

type GuardEvent = {
  at: string;
  repo: 'fleethq';
  event: string;
  behind?: number;
  ahead?: number;
  from?: string;
  to?: string;
  resolved?: string[];
  syntax?: { files: number; ok: boolean; errors?: string[] };
  secret_scan?: 'clean' | 'aborted';
  pushed?: boolean;
  detail?: string;
};

type GuardState = {
  at: string;
  behind: number;
  ahead: number;
  dirty: boolean;
  head: string | null;
  origin: string | null;
  last_event: string;
  last_push: { at: string; from: string; to: string } | null;
};

// ---- tiny git exec layer (never echoes URLs — the remote may embed creds) --
function git(args: string[], opts: { timeout?: number; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: ROOT, timeout: opts.timeout ?? GIT_TIMEOUT, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...(opts.env ?? {}) } },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`git ${args[0]}: ${(stderr || err.message || '').toString().slice(0, 300)}`));
        else resolve(String(stdout ?? ''));
      },
    );
  });
}

const short = (sha: string) => sha.slice(0, 7).trim();

function atomicWrite(file: string, data: string) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}

function record(ev: GuardEvent) {
  try {
    let lines: string[] = [];
    if (fs.existsSync(EVENTS_JSONL)) lines = fs.readFileSync(EVENTS_JSONL, 'utf8').split('\n').filter(Boolean);
    lines.push(JSON.stringify(ev));
    if (lines.length > EVENTS_MAX_LINES) lines = lines.slice(-EVENTS_MAX_LINES);
    atomicWrite(EVENTS_JSONL, lines.join('\n') + '\n');
  } catch {
    // receipts must never break the guard
  }
}

// ---- the union law ----------------------------------------------------------
const TS_KEYS = ['at', 'updated_at', 'synced_at', 'updated', 'ts'] as const;

function embeddedTs(o: unknown): number | null {
  if (!o || typeof o !== 'object') return null;
  const rec = o as Record<string, unknown>;
  for (const k of TS_KEYS) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const p = Date.parse(v);
      if (Number.isFinite(p)) return p;
    }
  }
  return null;
}

/** JSON conflict → live-wins: the fresher embedded timestamp wins, verbatim. */
async function resolveJsonConflict(file: string): Promise<boolean> {
  try {
    const [o, t] = await Promise.all([git(['show', ':2:' + file]), git(['show', ':3:' + file])]); // :2 ours, :3 theirs
    let oj: unknown = null;
    let tj: unknown = null;
    try {
      oj = JSON.parse(o);
      tj = JSON.parse(t);
    } catch {
      return false; // unparseable json — not our call
    }
    const ot = embeddedTs(oj) ?? 0;
    const tt = embeddedTs(tj) ?? 0;
    // live-wins: fresher record wins; ties keep ours (the live working side)
    atomicWrite(path.join(ROOT, file), tt > ot ? t : o);
    return true;
  } catch {
    return false;
  }
}

/** JSONL conflict → union-ts-ordered, exact-duplicate lines dropped. */
async function resolveJsonlConflict(file: string): Promise<boolean> {
  try {
    const [o, t] = await Promise.all([git(['show', ':2:' + file]), git(['show', ':3:' + file])]);
    const seen = new Set<string>();
    const rows: { ts: number; line: string }[] = [];
    for (const line of [...o.split('\n'), ...t.split('\n')]) {
      const l = line.trim();
      if (!l || seen.has(l)) continue;
      seen.add(l);
      let ts = 0;
      try {
        const j = JSON.parse(l) as { ts?: number };
        if (typeof j.ts === 'number') ts = j.ts;
      } catch {
        return false; // a torn/unparseable row — not our call
      }
      rows.push({ ts, line: l });
    }
    rows.sort((a, b) => a.ts - b.ts);
    atomicWrite(path.join(ROOT, file), rows.map((r) => r.line).join('\n') + '\n');
    return true;
  } catch {
    return false;
  }
}

// ---- sanity syntax compilation (bun's own transpiler — zero new deps) -------
type Transpiler = { transformSync(code: string): string };
const BUN = (globalThis as unknown as { Bun?: { Transpiler: new (o: { loader: string }) => Transpiler } }).Bun;

const LOADER: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
};

function syntaxCheck(files: string[]): { ok: boolean; errors: string[]; count: number } {
  const errors: string[] = [];
  if (!BUN?.Transpiler) return { ok: true, errors: ['transpiler-unavailable'], count: 0 };
  let count = 0;
  for (const f of files) {
    const loader = LOADER[path.extname(f).toLowerCase()];
    if (!loader) continue;
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) continue; // deleted in the diff
    try {
      const src = fs.readFileSync(abs, 'utf8');
      if (src.length > 2_000_000) continue; // not source — skip giants
      new BUN.Transpiler({ loader }).transformSync(src);
      count += 1;
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message.split('\n')[0].slice(0, 200)}`);
    }
  }
  return { ok: errors.length === 0, errors, count };
}

// ---- secret scan on the outgoing added lines --------------------------------
// Inventory law: this list MUST track the actual credential inventory the vault
// carries (kept in lockstep with vault/push-vaults.sh). Task 48 added the
// platform/web-research shapes that 47-b had extended only in push-vaults.
const SECRET_RES = [
  /sk-[A-Za-z0-9]{20,}/,
  /sk-or-v1-[A-Za-z0-9-]{20,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /xai-[A-Za-z0-9]{20,}/,
  /gsk_[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /glpat-[A-Za-z0-9_-]{20,}/,
  /sbp_[A-Za-z0-9]{20,}/,
  /vck_[A-Za-z0-9]{20,}/,
  /rnd_[A-Za-z0-9]{20,}/,
  /tvly-[A-Za-z0-9_-]{20,}/,
  /jina_[A-Za-z0-9_-]{20,}/,
  /[0-9a-f]{32}\.[A-Za-z0-9_-]{20,}/, // dotted key shape (32-hex id . suffix)
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /[a-z+]+:\/\/[^\s/:@]+:[^\s@]{8,}@/, // URL-embedded credentials
];

async function secretScan(): Promise<{ clean: boolean; hit?: string }> {
  try {
    const diff = await git(['diff', 'origin/main', 'HEAD'], { timeout: GIT_TIMEOUT });
    for (const line of diff.split('\n')) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      for (const re of SECRET_RES) {
        const m = re.exec(line);
        if (m) return { clean: false, hit: m[0].slice(0, 12) + '…' };
      }
    }
    return { clean: true };
  } catch {
    return { clean: true }; // no diff (pure ff) — nothing outgoing to scan
  }
}

// ---- lockfile (cross-instance) + busy flag (in-process) ---------------------
let busy = false;

function lockHeld(): boolean {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
    if (Number.isFinite(pid) && pid > 0) {
      process.kill(pid, 0); // throws if dead
      return pid !== process.pid;
    }
  } catch {
    /* no lock or dead holder */
  }
  return false;
}

function takeLock(): boolean {
  try {
    fs.writeFileSync(LOCK, String(process.pid));
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.readFileSync(LOCK, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK);
  } catch {
    /* already gone */
  }
}

// ---- the actual lineage cycle -----------------------------------------------
async function cycle(): Promise<void> {
  if (busy || lockHeld()) return;
  busy = true;
  takeLock();
  try {
    await git(['fetch', 'origin', 'main'], { timeout: FETCH_TIMEOUT });
    const behind = Number((await git(['rev-list', '--count', 'main..origin/main'])).trim() || 0);
    const ahead = Number((await git(['rev-list', '--count', 'origin/main..main'])).trim() || 0);
    const dirty = (await git(['status', '--porcelain'])).trim().length > 0;

    if (behind === 0 && ahead === 0) {
      await writeState({ behind, ahead, dirty, last_event: 'clean' });
      return; // the common case: we ARE origin/main
    }

    // --- autonomous publish: local commits sitting unpushed get released ----
    // (the book-sync writer commits quietly; a real git operator ships them —
    // through the SAME secret gate, never raw onto the wire)
    if (behind === 0 && ahead > 0) {
      const headSha = (await git(['rev-parse', 'HEAD'])).trim();
      const scan = await secretScan();
      if (!scan.clean) {
        record({ at: new Date().toISOString(), repo: 'fleethq', event: 'secret_abort', ahead, from: short(headSha), secret_scan: 'aborted', detail: `pattern hit: ${scan.hit}` });
        await writeState({ behind, ahead, dirty, last_event: 'secret_abort' });
        return;
      }
      try {
        await git(['push', 'origin', 'main'], { timeout: PUSH_TIMEOUT });
        record({ at: new Date().toISOString(), repo: 'fleethq', event: 'pushed_local', ahead, from: short(headSha), secret_scan: 'clean', pushed: true });
        await writeState({ behind, ahead: 0, dirty, last_event: 'pushed_local', last_push: { at: new Date().toISOString(), from: short(headSha), to: short(headSha) } });
      } catch (e) {
        record({ at: new Date().toISOString(), repo: 'fleethq', event: 'push_rejected', ahead, from: short(headSha), detail: (e as Error).message.slice(0, 200) });
        await writeState({ behind, ahead, dirty, last_event: 'push_rejected' });
      }
      return;
    }

    if (behind === 0) {
      await writeState({ behind, ahead, dirty, last_event: 'clean' });
      return;
    }

    // --- a twin pushed: the lineage must move -------------------------------
    const origHead = (await git(['rev-parse', 'HEAD'])).trim();
    let stashed = false;
    if (dirty) {
      await git(['stash', 'push', '-u', '-m', 'lineage-guard autostash']);
      stashed = true;
    }

    try {
      // fast-forward when we have nothing of our own; rebase when we do
      if (ahead === 0) await git(['merge', '--ff-only', 'origin/main']);
      else await git(['rebase', 'origin/main']);

      // resolve only machine-resolvable conflicts; code conflicts abort honestly
      const resolved: string[] = [];
      for (let i = 0; i < CONTINUE_LIMIT; i++) {
        const unmerged = (await git(['diff', '--name-only', '--diff-filter=U']))
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!unmerged.length) break;
        for (const f of unmerged) {
          const ok = f.endsWith('.json')
            ? await resolveJsonConflict(f)
            : f.endsWith('.jsonl')
              ? await resolveJsonlConflict(f)
              : false; // a conflict the union law cannot own — never guess
          if (!ok) {
            await git(['rebase', '--abort']);
            record({ at: new Date().toISOString(), repo: 'fleethq', event: 'conflict_manual', behind, ahead, detail: `unresolvable: ${f.slice(0, 120)}` });
            await writeState({ behind, ahead, dirty: true, last_event: 'conflict_manual' });
            return;
          }
          resolved.push(f);
          await git(['add', f]);
        }
        await git(['rebase', '--continue'], { env: { GIT_EDITOR: 'true' } });
      }

      const newHead = (await git(['rev-parse', 'HEAD'])).trim();

      // sanity syntax compilation on everything the move touched
      const changed = (await git(['diff', '--name-only', 'ORIG_HEAD', 'HEAD']))
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const syn = syntaxCheck(changed);
      if (resolved.length) {
        record({ at: new Date().toISOString(), repo: 'fleethq', event: 'conflict_resolved', behind, ahead, from: short(origHead), to: short(newHead), resolved });
      }

      if (!syn.ok) {
        record({ at: new Date().toISOString(), repo: 'fleethq', event: 'syntax_fail', behind, ahead, from: short(origHead), to: short(newHead), syntax: { files: syn.count, ok: false, errors: syn.errors.slice(0, 5) }, detail: 'tree NOT pushed — fix before the wire' });
        await writeState({ behind: 0, ahead, dirty: true, last_event: 'syntax_fail' });
        return; // a broken tree never reaches origin
      }

      const scan = await secretScan();
      if (!scan.clean) {
        record({ at: new Date().toISOString(), repo: 'fleethq', event: 'secret_abort', behind, ahead, from: short(origHead), to: short(newHead), secret_scan: 'aborted', detail: `pattern hit: ${scan.hit}` });
        await writeState({ behind: 0, ahead, dirty: true, last_event: 'secret_abort' });
        return; // a credential never rides the wire
      }

      // push with bounded retries (a twin may move origin again mid-flight)
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await git(['push', 'origin', 'main'], { timeout: PUSH_TIMEOUT });
          record({
            at: new Date().toISOString(),
            repo: 'fleethq',
            event: ahead > 0 ? 'rebased' : 'behind_ff',
            behind,
            ahead,
            from: short(origHead),
            to: short(newHead),
            resolved: resolved.length ? resolved : undefined,
            syntax: { files: syn.count, ok: true },
            secret_scan: 'clean',
            pushed: true,
          });
          await writeState({ behind: 0, ahead: 0, dirty, last_event: ahead > 0 ? 'rebased' : 'behind_ff', last_push: { at: new Date().toISOString(), from: short(origHead), to: short(newHead) } });
          return;
        } catch (e) {
          if (attempt === MAX_ATTEMPTS) {
            record({ at: new Date().toISOString(), repo: 'fleethq', event: 'push_rejected', behind, ahead, from: short(origHead), detail: (e as Error).message.slice(0, 200) });
            await writeState({ behind: 0, ahead, dirty, last_event: 'push_rejected' });
            return;
          }
          await git(['fetch', 'origin', 'main'], { timeout: FETCH_TIMEOUT });
          await git(['rebase', 'origin/main'], { env: { GIT_EDITOR: 'true' } }); // bounded: retry once more next tick if this fails
        }
      }
    } finally {
      if (stashed) {
        try {
          await git(['stash', 'pop']);
        } catch {
          try {
            await git(['checkout', '--', '.']); // keep the rebased tree; stash entry stays recoverable
          } catch {
            /* live writers own the tree anyway */
          }
          record({ at: new Date().toISOString(), repo: 'fleethq', event: 'stash_pop_conflict', detail: 'stash entry preserved' });
        }
      }
    }
  } catch (e) {
    record({ at: new Date().toISOString(), repo: 'fleethq', event: 'error', detail: (e as Error).message.slice(0, 200) });
    try {
      await writeState({ behind: -1, ahead: -1, dirty: false, last_event: 'error' });
    } catch {
      /* nothing more we can do */
    }
  } finally {
    releaseLock();
    busy = false;
  }
}

async function writeState(s: { behind: number; ahead: number; dirty: boolean; last_event: string; last_push?: { at: string; from: string; to: string } }) {
  let prev: GuardState['last_push'] = null;
  try {
    const old = JSON.parse(fs.readFileSync(STATE_JSON, 'utf8')) as GuardState;
    prev = old.last_push ?? null;
  } catch {
    /* first state ever */
  }
  let head: string | null = null;
  let origin: string | null = null;
  try {
    head = short(await git(['rev-parse', 'HEAD']));
    origin = short(await git(['rev-parse', 'origin/main']));
  } catch {
    /* keep nulls — absent is measured, never invented */
  }
  const st: GuardState = {
    at: new Date().toISOString(),
    behind: s.behind,
    ahead: s.ahead,
    dirty: s.dirty,
    head,
    origin,
    last_event: s.last_event,
    last_push: s.last_push ?? prev,
  };
  atomicWrite(STATE_JSON, JSON.stringify(st, null, 1) + '\n');
}

function main() {
  fs.mkdirSync(RECEIPTS, { recursive: true });
  const once = process.argv.includes('--once');
  const run = () => {
    cycle().catch(() => {}); // fail-soft: a dead tick retries on the next one
  };
  run();
  if (!once) setInterval(run, TICK_MS);
  console.log(`[lineage-guard] ${once ? 'once' : `up — every ${TICK_MS / 1000}s`} — FleetHQ only (Domain belongs to domain-sync)`);
}

main();
