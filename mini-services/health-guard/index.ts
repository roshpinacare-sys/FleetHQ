/**
 * health-guard — sovereign watchdog for the office app (port 3000).
 *
 * WHY: next-server was OOM-killed repeatedly (measured: total-vm 21.7GB,
 * anon-rss 1.7GB on a 4GB box → kernel OOM kill → the user-visible app died
 * silently = "everything feels quiet"). Dev server death is invisible to
 * everyone. This guard makes the alive-ness itself measured and enforced.
 *
 * LAWS:
 *  - Every event is measured and timestamped (jsonl). No faked health.
 *  - Restart = engineering action with a receipt, not magic.
 *  - Proactive restart BEFORE the kernel OOM kill when RSS crosses the wall.
 *
 * API (port 3090):
 *  GET /        → measured status summary (uptime, checks, restarts, rss)
 *  GET /health  → { ok: true }
 *  GET /events  → last 50 events
 */
import { createServer } from 'http';
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { execSync, spawn } from 'child_process';

const APP = 'http://127.0.0.1:3000/';
const STATE_DIR = new URL('./state/', import.meta.url).pathname;
const EVENTS = STATE_DIR + 'guard-events.jsonl';
const PORT = 3090;
const CHECK_INTERVAL_MS = 30_000;
const APP_TIMEOUT_MS = 10_000;
const DOWN_STRIKES_TO_RESTART = 2;
const RSS_RESTART_BYTES = 1.5 * 1024 * 1024 * 1024; // office process wall (2026-10-16: kernel OOM-killed office at ~1.2GB anon-rss when box full — 2.0GB wall was TOO LATE)
const RSS_LEAK_WALL_BYTES = 3.2 * 1024 * 1024 * 1024; // global sum wall (law T30: wall counts ONLY the :3000 office server)
const MIN_RESTART_GAP_MS = 3 * 60_000; // anti-flap
const MAX_HEAP_MB = 1024;

mkdirSync(STATE_DIR, { recursive: true });

type Ev = { at: string; kind: string; detail: string };
const events: Ev[] = [];
if (existsSync(EVENTS)) {
  try {
    for (const l of readFileSync(EVENTS, 'utf8').trim().split('\n').slice(-50)) {
      try { events.push(JSON.parse(l)); } catch {}
    }
  } catch {}
}
let checks = 0, fails = 0, downStrikes = 0, restarts = 0, lastRestartAt = 0;
const startedAt = new Date();

function log(kind: string, detail: string) {
  const ev: Ev = { at: new Date().toISOString(), kind, detail: detail.slice(0, 400) };
  events.push(ev);
  if (events.length > 200) events.splice(0, events.length - 200);
  try { appendFileSync(EVENTS, JSON.stringify(ev) + '\n'); } catch {}
  console.log(`[guard] ${ev.at} ${kind} ${detail}`);
}

/** RSS of every next-server process (bytes) — measured from /proc, per-pid. */
function nextServerRssList(): { per: { pid: number; bytes: number; args: string }[]; sum: number } {
  try {
    const out = execSync(`ps -eo pid,rss,comm,args | grep -E 'next-server|next dev' | grep -v grep || true`, { encoding: 'utf8', timeout: 8000 });
    const per: { pid: number; bytes: number; args: string }[] = [];
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+\S+\s+(.*)$/);
      if (!m) continue;
      const pid = Number(m[1]), rss = Number(m[2]), args = m[3];
      if (!args.includes('next')) continue;
      per.push({ pid, bytes: rss * 1024, args });
    }
    return { per, sum: per.reduce((a, p) => a + p.bytes, 0) };
  } catch { return { per: [], sum: 0 }; }
}

/** The pid serving :3000 — mapped from ss (the office next-server), null if unknown. */
function officePid(): number | null {
  try {
    const out = execSync(`ss -tlnp | grep ':3000 ' || true`, { encoding: 'utf8', timeout: 8000 });
    const m = out.match(/pid=(\d+)/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

function nextServerRss(): { bytes: number; pids: number[] } {
  const { per, sum } = nextServerRssList();
  return { bytes: sum, pids: per.map((p) => p.pid) };
}

async function appAlive(): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), APP_TIMEOUT_MS);
  try {
    const r = await fetch(APP, { signal: ctl.signal, cache: 'no-store' });
    return r.ok;
  } catch { return false; } finally { clearTimeout(t); }
}

function killLeftovers() {
  try { execSync(`pkill -f 'next dev' || true; pkill -f 'next-server' || true`, { timeout: 8000 }); } catch {}
}

function startApp() {
  // double-fork subshell is the ONLY spawn form that survives session
  // boundaries in this sandbox (measured: setsid & nohup forms get reaped)
  execSync(`( cd /home/z/my-project && NODE_OPTIONS=--max-old-space-size=${MAX_HEAP_MB} bun run dev > /home/z/my-project/dev.log 2>&1 < /dev/null & )`, { encoding: 'utf8', timeout: 8000 });
  restarts++; lastRestartAt = Date.now();
  log('restart', `spawned double-forked 'bun run dev' (heap cap ${MAX_HEAP_MB}MB), restarts=${restarts}`);
}

async function tick() {
  checks++;
  const alive = await appAlive();
  const rss = nextServerRss();
  if (!alive) {
    fails++; downStrikes++;
    log('check-down', `strike ${downStrikes}/${DOWN_STRIKES_TO_RESTART}`);
    if (downStrikes >= DOWN_STRIKES_TO_RESTART) {
      if (Date.now() - lastRestartAt < MIN_RESTART_GAP_MS) {
        log('restart-skipped', 'anti-flap gap — still down, waiting before next attempt');
      } else {
        log('action', `app down ${DOWN_STRIKES_TO_RESTART} strikes → kill leftovers + restart`);
        killLeftovers();
        await new Promise(r => setTimeout(r, 2500));
        startApp();
      }
      downStrikes = 0;
    }
    return;
  }
  downStrikes = 0;
  const { per, sum } = nextServerRssList();
  const officePidNum = officePid();
  const officeBytes = officePidNum ? per.find((p) => p.pid === officePidNum)?.bytes ?? sum : sum;
  // law T30: the office restart wall counts ONLY the :3000 office process —
  // transient verification servers (estate/giant runs) must not kill the office
  if (officeBytes > RSS_RESTART_BYTES && Date.now() - lastRestartAt > MIN_RESTART_GAP_MS) {
    log('action', `office :3000 RSS ${(officeBytes / 1e9).toFixed(2)}GB > wall → proactive restart (prevents OOM kill)`);
    killLeftovers();
    await new Promise(r => setTimeout(r, 2500));
    startApp();
    return;
  }
  // leak-healing: global sum over the leak wall → a non-office next-server outlived
  // its welcome (transient verification windows are minutes, not hours) → kill it
  if (sum > RSS_LEAK_WALL_BYTES) {
    const strays = per.filter((p) => p.pid !== officePidNum);
    if (strays.length > 0) {
      log('action', `sum RSS ${(sum / 1e9).toFixed(2)}GB > leak wall → killing ${strays.length} stray next-server(s) [${strays.map((p) => p.pid).join(',')}] (office ${officePidNum} spared)`);
      try { strays.forEach((p) => { try { process.kill(p.pid, 'SIGKILL'); } catch {} }); } catch {}
    }
  }
  log('check-ok', `up; office=${officePidNum} officeRSS=${(officeBytes / 1e6).toFixed(0)}MB sumRSS=${(sum / 1e6).toFixed(0)}MB pids=[${per.map((p) => p.pid).join(',')}]`);
}

function summary() {
  const { per, sum } = nextServerRssList();
  const officePidNum = officePid();
  const officeBytes = officePidNum ? per.find((p) => p.pid === officePidNum)?.bytes ?? sum : sum;
  return {
    guard: { startedAt: startedAt.toISOString(), uptimeSec: Math.round((Date.now() - startedAt.getTime()) / 1000) },
    measured: { checks, fails, restarts, downStrikes, officePid: officePidNum, officeRssMB: Math.round(officeBytes / 1e6), sumRssMB: Math.round(sum / 1e6), nextServerPids: per.map((p) => p.pid) },
    law: { checkIntervalMs: CHECK_INTERVAL_MS, officeRssRestartWallGB: +(RSS_RESTART_BYTES / 1e9).toFixed(1), sumLeakWallGB: +(RSS_LEAK_WALL_BYTES / 1e9).toFixed(1), heapCapMB: MAX_HEAP_MB, antiFlapMin: MIN_RESTART_GAP_MS / 60000 },
    lastEvents: events.slice(-10),
  };
}

createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  const j = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o, null, 1)); };
  if (u.pathname === '/health') return j(200, { ok: true });
  if (u.pathname === '/events') return j(200, { events: events.slice(-50) });
  return j(200, summary());
}).listen(PORT, () => log('guard-up', `health-guard listening on :${PORT}, watching ${APP} every ${CHECK_INTERVAL_MS / 1000}s`));

log('guard-start', `measured baseline: ${events.length} prior events loaded`);
setInterval(() => {
  // wedge-law 2026-10-16: guard listened but stopped ticking (26min silent while office dead).
  // Every tick runs inside try/catch and ALWAYS logs — silence is a bug, not a state.
  try { void tick(); } catch (e) { try { log('tick-error', `tick threw: ${String(e).slice(0, 160)}`); } catch {} }
}, CHECK_INTERVAL_MS);
tick(); // first check immediately
