// ============================================================================
// boot-watcher — the SEVENTH sentinel: the heart that revives the dev server.
//
// The supervisor tree (ensureSentinels in /api/foreman/health) lives INSIDE
// next-server. If next-server dies, the tree dies with it and can never fire
// again — the one unguarded ring of the sovereignty stack. This watcher runs
// as a detached session-leader (survives server death, SID==PGID==PID) and
// every 60s probes 127.0.0.1:3000; if the Next dev server is dead AND no
// next process is starting, it spawns `bun run dev` — the exact command the
// platform itself uses — as a detached child.
//
// Fixed command, no input, debounced 180s, receipts on disk. Native stdlib
// only (Law 24 — zero dependencies). Fail-soft: a dead tick retries on the
// next one; absence is measured, never invented.
// ============================================================================

import { spawn, execFile } from 'child_process';
import { connect } from 'net';
import fs from 'fs';
import path from 'path';

const ROOT = '/home/z/my-project';
const RECEIPTS = path.join(ROOT, 'receipts');
const STATE_JSON = path.join(RECEIPTS, 'boot-watcher-state.json');
const EVENTS_JSONL = path.join(RECEIPTS, 'boot-watcher.jsonl');
const DEV_PORT = 3000;
const TICK_MS = 60_000;
const SPAWN_DEBOUNCE_MS = 180_000;
const MAX_EVENTS = 500;

type WatcherState = {
  at: string;
  port_ok: boolean;
  process_found: boolean;
  spawns: number;
  last_spawn_at: string | null;
  last_probe_ms: number | null;
  note: string;
};

function readState(): WatcherState {
  try {
    return JSON.parse(fs.readFileSync(STATE_JSON, 'utf8')) as WatcherState;
  } catch {
    return { at: new Date().toISOString(), port_ok: false, process_found: false, spawns: 0, last_spawn_at: null, last_probe_ms: null, note: 'first-boot' };
  }
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function writeState(s: WatcherState): void {
  try {
    atomicWrite(STATE_JSON, JSON.stringify(s, null, 1) + '\n');
  } catch {
    /* fail-soft — retried next tick */
  }
}

function appendEvent(event: Record<string, unknown>): void {
  try {
    fs.mkdirSync(RECEIPTS, { recursive: true });
    const row = JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(EVENTS_JSONL, row);
    const lines = fs.readFileSync(EVENTS_JSONL, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_EVENTS) {
      fs.writeFileSync(EVENTS_JSONL, lines.slice(lines.length - MAX_EVENTS).join('\n') + '\n');
    }
  } catch {
    /* fail-soft — receipts are the memory, but a failed append must not kill the loop */
  }
}

function portAlive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function nextProcessPids(): Promise<number[]> {
  return new Promise((resolve) => {
    execFile('pgrep', ['-f', 'next dev -p 3000|next-server'], { timeout: 3000 }, (err, stdout) => {
      const pids = String(stdout || '').split('\n').map((l) => Number(l.trim())).filter((n) => Number.isFinite(n) && n > 0);
      resolve(!err ? pids : []);
    });
  });
}

let lastSpawnAt = 0;
// wedged-strike law: port dead + next process present. A legitimate start
// binds :3000 well within one tick (60s); two consecutive such ticks mean
// the wrapper is WEDGED (alive but never restarting its dead server) — the
// live kill-test of Task 40 proved this exact deadlock. On strike 2 the
// wedged processes are killed and a fresh server is spawned.
let wedgedStrikes = 0;

function pkillWedged(pids: number[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pkill', ['-f', 'next dev -p 3000|next-server'], { timeout: 3000 }, () => {
      appendEvent({ event: 'wedged-cleared', pids });
      resolve(true);
    });
  });
}

async function tick(): Promise<void> {
  const t0 = Date.now();
  const portOk = await portAlive(DEV_PORT);
  const probeMs = Date.now() - t0;
  const st = readState();

  if (portOk) {
    writeState({ ...st, at: new Date().toISOString(), port_ok: true, process_found: true, last_probe_ms: probeMs, note: 'server-alive' });
    return; // nothing to do — the heart beats
  }

  const procPids = await nextProcessPids();
  if (procPids.length > 0) {
    wedgedStrikes += 1;
    if (wedgedStrikes < 2) {
      // port dead but a next process exists — give it one honest tick to start
      writeState({ ...st, at: new Date().toISOString(), port_ok: false, process_found: true, last_probe_ms: probeMs, note: 'starting-or-wedged' });
      return;
    }
    // strike 2: wedged wrapper — clear it and fall through to a fresh spawn
    await pkillWedged(procPids);
    wedgedStrikes = 0;
  } else {
    wedgedStrikes = 0;
  }

  const now = Date.now();
  if (now - lastSpawnAt < SPAWN_DEBOUNCE_MS) {
    writeState({ ...st, at: new Date().toISOString(), port_ok: false, process_found: false, last_probe_ms: probeMs, note: 'spawn-debounced' });
    return;
  }
  lastSpawnAt = now;

  appendEvent({ event: 'server-down', port: DEV_PORT, probe_ms: probeMs, action: 'spawning-bun-run-dev' });
  writeState({ ...st, at: new Date().toISOString(), port_ok: false, process_found: false, spawns: (st.spawns || 0) + 1, last_spawn_at: new Date().toISOString(), last_probe_ms: probeMs, note: 'respawning-dev-server' });

  const child = spawn('bun', ['run', 'dev'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log('[boot-watcher] dev server was down — respawned `bun run dev` (detached, own session)');
  appendEvent({ event: 'spawned', pid: child.pid ?? null });
}

function main(): void {
  fs.mkdirSync(RECEIPTS, { recursive: true });
  const run = () => {
    tick().catch((e) => {
      appendEvent({ event: 'tick-error', error: e instanceof Error ? e.message : String(e) });
    });
  };
  run();
  setInterval(run, TICK_MS);
  console.log(`[boot-watcher] up — probing 127.0.0.1:${DEV_PORT} every ${TICK_MS / 1000}s — the seventh sentinel`);
}

main();
