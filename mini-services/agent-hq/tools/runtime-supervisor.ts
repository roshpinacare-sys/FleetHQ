// ============================================================================
// runtime-supervisor — THE DEDICATED RUNTIME OWNER (Task 47, Phase 5).
//
// WHY THIS EXISTS: until now the foreman (:3010) and the gateway (:3011) were
// spawned as children of the Next.js server by /api/foreman/health — the UI's
// web server OWNED the autonomous executor. That is the exact dependency this
// task forbids: restarting/redeploying the UI or losing the server tree took
// the crew down with it (and boot-watcher's revival chain had a window with
// no foreman at all).
//
// THIS PROCESS is a detached session-leader (setsid → PPID 1, SID==PGID):
// it outlives the coding-agent shell, the browser, AND the Next server. The
// UI (and /api/foreman/health) becomes a CLIENT: it may START this supervisor
// once (the proven way to survive the sandbox reaper), and after that it only
// REPORTS what the supervisor reports.
//
// LAW (stdlib only — Law 24, zero dependencies):
//   · liveness = the PROCESS (signal-0) + its port; never the paper
//   · restart with debounce + backoff (12s → ×2 → 5min cap), journaled
//   · foreman runs `bun index.ts` (NO --hot: hot reload is untrustworthy —
//     Task 45's measured lesson; recovery = a supervisor restart)
//   · logs append to receipts/runtime/<service>.log (capped, sanitized by the
//     services themselves — this tool never transforms log content)
//   · every takeover/restart lands in receipts/runtime-supervisor.jsonl
//   · a dead tick retries on the next one; absence is measured, never invented
// ============================================================================

import { spawn, execFile } from 'child_process';
import { connect } from 'net';
import fs from 'fs';
import path from 'path';

const ROOT = '/home/z/my-project';
const RECEIPTS = path.join(ROOT, 'receipts');
const RUNTIME = path.join(RECEIPTS, 'runtime');
const JOURNAL = path.join(RECEIPTS, 'runtime-supervisor.jsonl');
const STATE = path.join(RECEIPTS, 'runtime-supervisor-state.json');
const PID_FILE = path.join(RECEIPTS, 'runtime-supervisor.pid');
const MAX_JOURNAL = 500;
const MAX_LOG = 512 * 1024;
const TICK_MS = 5_000;

interface ServiceDef {
  name: string;
  port: number;
  cwd: string;
  script: string;
  env: Record<string, string>;
  log: string;
}

const services: ServiceDef[] = [
  {
    name: 'foreman',
    port: Number(process.env.AGENT_HQ_PORT || 3010),
    cwd: path.join(ROOT, 'mini-services/agent-hq'),
    script: 'index.ts',
    env: {
      AGENT_HQ_PORT: String(process.env.AGENT_HQ_PORT || 3010),
      AGENT_HQ_DATA_DIR: process.env.AGENT_HQ_DATA_DIR || path.join(ROOT, 'Domain'),
      // the office's own code repo (the git-learning wire studies it):
      AGENT_HQ_FLEET_DIR: process.env.AGENT_HQ_FLEET_DIR || ROOT,
    },
    log: path.join(RUNTIME, 'foreman.log'),
  },
  {
    name: 'gateway',
    port: 3011,
    cwd: path.join(ROOT, 'mini-services/sovereign-gateway'),
    script: 'index.ts',
    env: {},
    log: path.join(RUNTIME, 'gateway.log'),
  },
];

type ServiceState = {
  lastSpawnAt: number;
  crashes: number;
  backoffUntil: number;
  childPid: number | null;
  restarts: number;
};

const state = new Map<string, ServiceState>();
for (const s of services) {
  state.set(s.name, { lastSpawnAt: 0, crashes: 0, backoffUntil: 0, childPid: null, restarts: 0 });
}

fs.mkdirSync(RUNTIME, { recursive: true });

function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function appendBounded(file: string, line: string, max = MAX_JOURNAL): void {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch { /* first line ever */ }
  lines.push(line);
  if (lines.length > max) lines = lines.slice(-max);
  atomicWrite(file, lines.join('\n') + '\n');
}

function journal(event: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: Date.now(), ...event });
  try { appendBounded(JOURNAL, line); } catch { /* fail-soft */ }
}

function writeState(): void {
  const heartbeat = { at: new Date().toISOString(), pid: process.pid, services: Object.fromEntries(state) };
  try { atomicWrite(STATE, JSON.stringify(heartbeat, null, 1) + '\n'); } catch { /* fail-soft */ }
}

function truncateLog(file: string): void {
  try {
    const sz = fs.statSync(file).size;
    if (sz > MAX_LOG) {
      const buf = fs.readFileSync(file).slice(Math.floor(sz / 2));
      atomicWrite(file, buf.toString('utf8'));
    }
  } catch { /* absent — created on first spawn */ }
}

/** signal-0 liveness — THE process law (a dead peer's paperwork lies; /proc doesn't) */
function pidAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portAlive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(1200);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** who listens on the port — used to adopt an already-running service once */
function pidsOf(pattern: string): Promise<number[]> {
  return new Promise((resolve) => {
    execFile('pgrep', ['-f', pattern], { timeout: 3000 }, (err, stdout) => {
      const pids = String(stdout || '').split('\n').map((l) => Number(l.trim())).filter((n) => n > 0 && n !== process.pid);
      resolve(err ? [] : pids);
    });
  });
}

function spawnService(s: ServiceDef): void {
  const st = state.get(s.name)!;
  truncateLog(s.log);
  const out = fs.openSync(s.log, 'a');
  const child = spawn('bun', [s.script], {
    cwd: s.cwd,
    env: { ...process.env, ...s.env },
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  st.lastSpawnAt = Date.now();
  st.childPid = child.pid ?? null;
  st.restarts += 1;
  fs.closeSync(out); // the child inherited the fd; drop our copy
  journal({ type: 'spawn', service: s.name, pid: child.pid ?? null, restarts: st.restarts });
  writeState();
}

async function tickService(s: ServiceDef): Promise<void> {
  const st = state.get(s.name)!;
  const up = await portAlive(s.port);
  if (up) {
    if (st.crashes > 0) { st.crashes = 0; st.backoffUntil = 0; writeState(); }
    return;
  }
  // down — respect crash backoff
  const now = Date.now();
  if (now < st.backoffUntil) return;
  if (now - st.lastSpawnAt < 12_000) return; // debounce
  // a child we own that is merely slow to bind — probe the process first
  if (st.childPid && pidAlive(st.childPid) && now - st.lastSpawnAt < 30_000) return;
  st.crashes += 1;
  if (st.crashes >= 3) {
    const backoffMs = Math.min(300_000, 30_000 * Math.pow(2, st.crashes - 3));
    st.backoffUntil = now + backoffMs;
    journal({ type: 'backoff', service: s.name, crashes: st.crashes, backoffMs });
  }
  spawnService(s);
}

async function main(): Promise<void> {
  // single-flight: another supervisor already owns the floor
  try {
    const existing = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    if (existing && existing !== process.pid && pidAlive(existing)) {
      journal({ type: 'supervisor-exit', reason: 'already-running', owner: existing });
      return;
    }
  } catch { /* first boot */ }
  fs.writeFileSync(PID_FILE, String(process.pid));
  journal({ type: 'supervisor-start', pid: process.pid, ppid: process.ppid, sid: process.pid });

  // adopt services that are already up (migration: the legacy health-route
  // children keep running; the supervisor becomes their safety net)
  for (const s of services) {
    if (await portAlive(s.port)) {
      const pids = await pidsOf(s.script === 'index.ts' ? `${s.cwd}/index.ts|bun --hot index.ts` : s.script);
      journal({ type: 'adopt', service: s.name, externalPids: pids.slice(0, 3) });
    }
  }

  let shuttingDown = false;
  const stop = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    journal({ type: 'supervisor-stop', pid: process.pid });
    writeState();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  const loop = async () => {
    if (shuttingDown) return;
    writeState();
    for (const s of services) {
      try { await tickService(s); } catch { /* a dead tick retries on the next one */ }
    }
  };
  await loop();
  setInterval(loop, TICK_MS);
}

main().catch(() => process.exit(1));
