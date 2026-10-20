// ============================================================================
// SMOKE-TRUTH — repeatable validation of the office's truth chain (stdlib only)
// ----------------------------------------------------------------------------
// Verifies the CONTRACT the console is built on, against the live foreman:
//   · snapshot: backend is live|sim; a live office has a real crew
//   · books: every book carries id/file/title/bytes (the registry law)
//   · tasks: every status is one of the six wire statuses (no invented states)
//   · agents: every state is one of the ten wire states
//   · git wire: available is a boolean; commits carry hash/ts/repo metadata
//   · heartbeat: a status event arrives within HEARTBEAT window (30s × 1.5)
//   · supervisor: /api/foreman/health reports 7 boolean sentinels
// Exit 0 = every assertion held; exit 1 = the chain is lying somewhere.
// Run: bun mini-services/agent-hq/tools/smoke-truth.ts [port]
// ============================================================================
import { io } from 'socket.io-client';

const PORT = process.argv[2] || '3010';
const HEARTBEAT_MS = 45_000;
const AGENT_STATES = new Set(['idle', 'thinking', 'reading', 'checking', 'writing', 'walking', 'waiting_user', 'blocked', 'done', 'error']);
const TASK_STATUSES = new Set(['todo', 'doing', 'review', 'done', 'blocked', 'cancelled']);

const failures: string[] = [];
const must = (cond: boolean, what: string) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${what}`);
  if (!cond) failures.push(what);
};

type Snap = {
  status: { backend: string };
  crew: { id: string }[];
  agents: { id: string; state: string }[];
  tasks: { id: string; status: string }[];
  books: { id: string; file: string; bytes: number }[];
  decisions: { id: string; status: string }[];
  git?: { available: boolean; commits: { hash: string; ts: number; repo: string }[] };
};

const socket = io(`http://localhost:${PORT}`, { path: '/', transports: ['websocket', 'polling'], timeout: 8000 });
let snap: Snap | null = null;
let sawStatus = false;
socket.on('status', () => { sawStatus = true; });
socket.on('snapshot', (s: Snap) => { snap = s; });
socket.on('connect', () => socket.emit('snapshot:request'));
socket.on('connect_error', (e: Error) => {
  console.log(`  ✗ socket connect failed: ${e.message}`);
  process.exit(1);
});

setTimeout(async () => {
  console.log(`smoke-truth against :${PORT}`);
  must(!!snap, 'snapshot received');
  if (snap) {
    must(['live', 'sim'].includes(snap.status.backend), `status.backend is live|sim (got ${snap.status.backend})`);
    if (snap.status.backend === 'live') must(snap.crew.length > 0, 'a live office has a real crew');
    must(snap.agents.every((a) => AGENT_STATES.has(a.state)), 'agent states are all wire states');
    must(snap.tasks.every((t) => TASK_STATUSES.has(t.status)), 'task statuses are all wire statuses');
    must(snap.books.every((b) => !!b.id && !!b.file && typeof b.bytes === 'number'), 'books carry id/file/bytes');
    must(snap.decisions.every((d) => ['open', 'answered'].includes(d.status)), 'decision statuses are open|answered');
    if (snap.git) {
      must(typeof snap.git.available === 'boolean', 'git.available is a boolean (never invented)');
      if (snap.git.available) {
        must(snap.git.commits.every((c) => !!c.hash && Number.isFinite(c.ts) && !!c.repo), 'commits carry hash/ts/repo metadata');
      }
    }
  }
  must(sawStatus, `heartbeat: a status event arrived within ${HEARTBEAT_MS / 1000}s`);
  try {
    const r = await fetch(`http://localhost:3000/api/foreman/health`);
    const j = (await r.json()) as { sentinels?: Record<string, boolean> };
    const s = j.sentinels ?? {};
    const keys = ['watchdog', 'snapshot', 'history', 'lineage', 'monitor', 'batcher', 'bootwatcher'];
    must(keys.every((k) => typeof s[k] === 'boolean'), `supervisor reports all 7 sentinels as booleans (got ${keys.filter((k) => typeof s[k] !== 'boolean').length} missing)`);
  } catch {
    must(false, 'supervisor health endpoint reachable');
  }
  console.log(failures.length === 0 ? 'SMOKE-TRUTH: ALL GREEN' : `SMOKE-TRUTH: ${failures.length} FAILURE(S)`);
  process.exit(failures.length === 0 ? 0 : 1);
}, HEARTBEAT_MS);
