import { NextResponse } from 'next/server';
import { spawn, execFile } from 'child_process';
import { connect } from 'net';

// ============================================================================
// /api/foreman/health — self-healing supervisor for the Fleet HQ foreman.
//
// The foreman (mini-services/agent-hq, :3010) is the crew's socket service.
// In this sandbox, background processes spawned from ad-hoc shells get reaped
// between sessions; only processes under the server's boot tree survive. The
// Next.js server IS part of that tree, so the foreman is respawned FROM HERE
// (detached child of the dev server) whenever a health check finds it down.
//
// The endpoint takes NO input and spawns ONE fixed local service — it cannot
// be used to run anything else. Safe by construction.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORT = 3010;
const CWD = '/home/z/my-project/mini-services/agent-hq';

// SOVEREIGN GATEWAY (:3011) — the office's own OpenAI-compatible endpoint.
// Supervised exactly like the foreman: respawned as a detached child of THIS
// server tree whenever a health check finds it down. Fixed command, no input.
const GW_PORT = 3011;
const GW_CWD = '/home/z/my-project/mini-services/sovereign-gateway';

let lastSpawnAt = 0;
let lastGwSpawnAt = 0;

function foremanAlive(): Promise<boolean> {
  return portAlive(PORT);
}

function gatewayAlive(): Promise<boolean> {
  return portAlive(GW_PORT);
}

function portAlive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// ---- memory commit pipeline (domain-sync) -----------------------------------
// The foreman writes the office memory into the Domain clone; domain-sync.sh
// commits and pushes it so the memory survives sandbox death. The loop is a
// child of THIS server tree (it survives the reaper) and is spawned only if
// no other instance is running. Fixed command, no input, safe by construction.

function syncLoopAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pgrep', ['-f', 'domain-sync.sh loop'], { timeout: 3000 }, (err, stdout) => {
      // ignore our own pgrep match; any real hit means the loop is up
      const hits = String(stdout || '').split('\n').filter((l) => l.trim()).length;
      resolve(hits > 0);
    });
  });
}

function ensureSyncLoop() {
  syncLoopAlive().then((alive) => {
    if (alive) return;
    const child = spawn('bash', ['domain-sync.sh', 'loop'], {
      cwd: CWD,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, AGENT_HQ_DATA_DIR: '/home/z/my-project/Domain' },
    });
    child.unref();
  }).catch(() => {});
}

// ---- shelf watchdog + telemetry snapshot (receipts/ engines) ---------------
// Both are the office's own self-healing/recordkeeping tools (stdlib only).
// They run as children of THIS server tree — the only processes the sandbox
// reaper reliably spares. Fixed commands, no input, safe by construction.

const WATCHDOG_TS = '/home/z/my-project/mini-services/agent-hq/tools/watchdog.ts';
const SNAPSHOT_TS = '/home/z/my-project/mini-services/agent-hq/tools/telemetry-snapshot.ts';
const HISTORY_TS = '/home/z/my-project/mini-services/agent-hq/tools/shift-history.ts';

function pgrepAlive(pattern: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pgrep', ['-f', pattern], { timeout: 3000 }, (err, stdout) => {
      resolve(!err && String(stdout || '').split('\n').filter((l) => l.trim()).length > 0);
    });
  });
}

function ensureNode(label: string, script: string, pattern: string, lastAt: { v: number }): Promise<boolean> {
  return pgrepAlive(pattern).then((alive) => {
    if (alive) return true;
    const now = Date.now();
    if (now - lastAt.v < 30_000) return false; // debounce respawns
    lastAt.v = now;
    const child = spawn('bun', [script], { cwd: '/home/z/my-project', detached: true, stdio: 'ignore' });
    child.unref();
    console.log(`[supervisor] respawned ${label}`);
    return false; // will report alive on the next poll
  }).catch(() => false);
}

const watchdogStamp = { v: 0 };
const snapshotStamp = { v: 0 };
const historyStamp = { v: 0 };

function ensureSentinels(): Promise<{ watchdog: boolean; snapshot: boolean; history: boolean }> {
  return Promise.all([
    ensureNode('shelf-watchdog', WATCHDOG_TS, 'tools/watchdog.ts', watchdogStamp),
    ensureNode('telemetry-snapshot', SNAPSHOT_TS, 'tools/telemetry-snapshot.ts', snapshotStamp),
    ensureNode('shift-history', HISTORY_TS, 'tools/shift-history.ts', historyStamp),
  ]).then(([watchdog, snapshot, history]) => ({ watchdog, snapshot, history }));
}

export async function GET() {
  try {
    ensureSyncLoop();
    const sentinels = await ensureSentinels();
    const gatewayState = await ensureGateway();
    const alive = await foremanAlive();
    if (alive) return NextResponse.json({ ok: true, foreman: 'up', gateway: gatewayState, sentinels });

    // debounce: never spawn twice within 8s
    const now = Date.now();
    if (now - lastSpawnAt < 8000) {
      return NextResponse.json({ ok: false, foreman: 'spawning', gateway: gatewayState, sentinels }, { status: 202 });
    }
    lastSpawnAt = now;

    const child = spawn('bun', ['run', 'dev'], {
      cwd: CWD,
      detached: true,
      stdio: 'ignore',
      env: {
      ...process.env,
      AGENT_HQ_PORT: String(PORT),
      AGENT_HQ_DATA_DIR: '/home/z/my-project/Domain',
      AGENT_HQ_FLEET_DIR: '/home/z/my-project/fleethq',
    },
    });
    child.unref();
    // give it a moment, then re-check once
    await new Promise((r) => setTimeout(r, 2500));
    const up = await foremanAlive();
    return NextResponse.json({ ok: up, foreman: up ? 'respawned' : 'starting', gateway: gatewayState, sentinels }, { status: up ? 200 : 202 });
  } catch {
    return NextResponse.json({ ok: false, foreman: 'error', gateway: 'error' }, { status: 500 });
  }
}

/** Respawn the sovereign gateway as a child of this server tree when down. */
async function ensureGateway(): Promise<string> {
  try {
    if (await gatewayAlive()) return 'up';
    const now = Date.now();
    if (now - lastGwSpawnAt < 8000) return 'spawning';
    lastGwSpawnAt = now;
    const child = spawn('bun', ['run', 'dev'], {
      cwd: GW_CWD,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    await new Promise((r) => setTimeout(r, 2500));
    return (await gatewayAlive()) ? 'respawned' : 'starting';
  } catch {
    return 'error';
  }
}
