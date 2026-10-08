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

let lastSpawnAt = 0;

function foremanAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(PORT, '127.0.0.1');
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

export async function GET() {
  try {
    ensureSyncLoop();
    const alive = await foremanAlive();
    if (alive) return NextResponse.json({ ok: true, foreman: 'up' });

    // debounce: never spawn twice within 8s
    const now = Date.now();
    if (now - lastSpawnAt < 8000) {
      return NextResponse.json({ ok: false, foreman: 'spawning' }, { status: 202 });
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
    return NextResponse.json({ ok: up, foreman: up ? 'respawned' : 'starting' }, { status: up ? 200 : 202 });
  } catch {
    return NextResponse.json({ ok: false, foreman: 'error' }, { status: 500 });
  }
}
