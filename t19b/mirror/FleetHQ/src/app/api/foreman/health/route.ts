import { NextResponse } from 'next/server';
import { spawn, execFile } from 'child_process';
import { connect } from 'net';
import { readFileSync } from 'fs';

// ============================================================================
// /api/foreman/health — REPORTER + last-resort planter of the runtime owner.
//
// Task 47 (Phase 5 — runtime independence): the UI must be a CLIENT of the
// autonomous runtime, never its owner. The foreman (:3010) and the gateway
// (:3011) are therefore NO LONGER spawned here. They are owned by the
// dedicated runtime supervisor (tools/runtime-supervisor.ts) — a detached
// session-leader (PPID 1) that outlives this server, the browser, and the
// coding-agent shell.
//
// What THIS endpoint still does (and why):
//   · ensures the runtime supervisor exists — the sandbox reaper spares the
//     server's boot tree, so the INITIAL plant of the supervisor happens from
//     here (detached → immediately orphaned to PPID 1); after that one plant
//     the supervisor is independent and this endpoint only reads its state.
//   · ensures the sentinel engines (same law as before — they are already
//     detached session-leaders once planted).
//   · reports the whole truth: foreman/gateway ports, supervisor heartbeat,
//     sentinel matrix. No input, fixed local spawns only — safe by
//     construction.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORT = 3010;
const GW_PORT = 3011;
const CWD = '/home/z/my-project/mini-services/agent-hq';

// the dedicated runtime owner (Task 47)
const RUNTIME_SUPERVISOR = '/home/z/my-project/mini-services/agent-hq/tools/runtime-supervisor.ts';
const SUPERVISOR_PID = '/home/z/my-project/receipts/runtime-supervisor.pid';
const SUPERVISOR_STATE = '/home/z/my-project/receipts/runtime-supervisor-state.json';

let lastSupervisorPlantAt = 0;

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

function pidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The supervisor is alive if its pid answers AND its heartbeat is fresh. */
function supervisorAlive(): { alive: boolean; detail: Record<string, unknown> } {
  try {
    const pid = Number(readFileSync(SUPERVISOR_PID, 'utf8').trim());
    const st = JSON.parse(readFileSync(SUPERVISOR_STATE, 'utf8')) as { at?: string; services?: unknown };
    const fresh = st.at ? Date.now() - new Date(st.at).getTime() < 20_000 : false;
    const alive = pidAlive(pid) && fresh;
    return { alive, detail: { pid, heartbeatAt: st.at ?? null, fresh, services: st.services ?? null } };
  } catch {
    return { alive: false, detail: { pid: null, heartbeatAt: null, fresh: false, services: null } };
  }
}

/** Plant the runtime supervisor ONCE — detached; it immediately orphans to
 *  PPID 1 and never dies with this server. Debounced; fixed command, no input. */
function ensureRuntimeSupervisor(): { alive: boolean; planted: boolean } & Record<string, unknown> {
  const cur = supervisorAlive();
  if (cur.alive) return { alive: true, planted: false, ...cur.detail };
  const now = Date.now();
  if (now - lastSupervisorPlantAt < 30_000) return { alive: false, planted: false, spawning: true, ...cur.detail };
  lastSupervisorPlantAt = now;
  try {
    const child = spawn('bun', [RUNTIME_SUPERVISOR], {
      cwd: '/home/z/my-project',
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        AGENT_HQ_PORT: String(PORT),
        AGENT_HQ_DATA_DIR: '/home/z/my-project/Domain',
        AGENT_HQ_FLEET_DIR: '/home/z/my-project',
      },
    });
    child.unref();
  } catch { /* retried on the next poll */ }
  return { alive: false, planted: true, ...cur.detail };
}

// ---- memory commit pipeline (domain-sync) -----------------------------------

function syncLoopAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pgrep', ['-f', 'domain-sync.sh loop'], { timeout: 3000 }, (err, stdout) => {
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

const WATCHDOG_TS = '/home/z/my-project/mini-services/agent-hq/tools/watchdog.ts';
const SNAPSHOT_TS = '/home/z/my-project/mini-services/agent-hq/tools/telemetry-snapshot.ts';
const HISTORY_TS = '/home/z/my-project/mini-services/agent-hq/tools/shift-history.ts';
const LINEAGE_TS = '/home/z/my-project/mini-services/agent-hq/tools/lineage-guard.ts';
const POSTBATCH_TS = '/home/z/my-project/mini-services/agent-hq/tools/post-batcher.ts';
const BOOTWATCH_TS = '/home/z/my-project/mini-services/agent-hq/tools/boot-watcher.ts';
const MONITOR_CMD = '/home/z/my-project/sovereign-stack/health_monitor.py';

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
const lineageStamp = { v: 0 };
const monitorStamp = { v: 0 };
const batcherStamp = { v: 0 };
const bootwatchStamp = { v: 0 };

function ensureSentinels(): Promise<{
  watchdog: boolean;
  snapshot: boolean;
  history: boolean;
  lineage: boolean;
  monitor: boolean;
  batcher: boolean;
  bootwatcher: boolean;
}> {
  return Promise.all([
    ensureNode('shelf-watchdog', WATCHDOG_TS, 'tools/watchdog.ts', watchdogStamp),
    ensureNode('telemetry-snapshot', SNAPSHOT_TS, 'tools/telemetry-snapshot.ts', snapshotStamp),
    ensureNode('shift-history', HISTORY_TS, 'tools/shift-history.ts', historyStamp),
    ensureNode('lineage-guard', LINEAGE_TS, 'tools/lineage-guard.ts', lineageStamp),
    ensureMonitor(),
    ensureBatcher(),
    ensureBootWatcher(),
  ]).then(([watchdog, snapshot, history, lineage, monitor, batcher, bootwatcher]) => ({ watchdog, snapshot, history, lineage, monitor, batcher, bootwatcher }));
}

function ensureMonitor(): Promise<boolean> {
  return pgrepAlive('health_monitor.py --loop').then((alive) => {
    if (alive) return true;
    const now = Date.now();
    if (now - monitorStamp.v < 30_000) return false;
    monitorStamp.v = now;
    const child = spawn('python3', [MONITOR_CMD, '--loop', '120'], {
      cwd: '/home/z/my-project/sovereign-stack',
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log('[supervisor] respawned health-monitor');
    return false;
  }).catch(() => false);
}

function ensureBootWatcher(): Promise<boolean> {
  return pgrepAlive('tools/boot-watcher.ts').then((alive) => {
    if (alive) return true;
    const now = Date.now();
    if (now - bootwatchStamp.v < 30_000) return false;
    bootwatchStamp.v = now;
    const child = spawn('bun', [BOOTWATCH_TS], {
      cwd: '/home/z/my-project',
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log('[supervisor] respawned boot-watcher');
    return false;
  }).catch(() => false);
}

function ensureBatcher(): Promise<boolean> {
  return pgrepAlive('tools/post-batcher.ts').then((alive) => {
    if (alive) return true;
    const now = Date.now();
    if (now - batcherStamp.v < 30_000) return false;
    batcherStamp.v = now;
    const child = spawn('bun', [POSTBATCH_TS, '--loop', '1800'], {
      cwd: '/home/z/my-project',
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log('[supervisor] respawned post-batcher');
    return false;
  }).catch(() => false);
}

export async function GET() {
  try {
    ensureSyncLoop();
    const [sentinels, foremanUp, gatewayUp] = await Promise.all([
      ensureSentinels(),
      portAlive(PORT),
      portAlive(GW_PORT),
    ]);
    // The runtime supervisor owns foreman+gateway; this endpoint only plants
    // it once (the sanctioned-tree law) and REPORTS its heartbeat.
    const runtime = ensureRuntimeSupervisor();
    const ok = foremanUp && gatewayUp;
    return NextResponse.json({
      ok,
      foreman: foremanUp ? 'up' : 'down',
      gateway: gatewayUp ? 'up' : 'down',
      runtime,
      sentinels,
    }, { status: ok ? 200 : 202 });
  } catch {
    return NextResponse.json({ ok: false, foreman: 'error', gateway: 'error' }, { status: 500 });
  }
}
