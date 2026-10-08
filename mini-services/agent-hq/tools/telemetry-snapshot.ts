/**
 * telemetry-snapshot.ts — the gateway's vital-sign recorder (stdlib only).
 *
 * Every 30s: pull the sovereign gateway's live health matrix (/telemetry +
 * /health) and write ONE atomic snapshot file the cockpit and postmortems can
 * read without touching the gateway:
 *
 *   receipts/gateway-telemetry-latest.json   ← always the freshest state
 *   receipts/gateway-telemetry-history.jsonl ← one line per 10 minutes (bounded)
 *
 * The cockpit UI reads LIVE data from /api/v1/telemetry (through Caddy) —
 * this file is for persistence, receipts and after-action analysis, so a
 * container recycle cannot erase what the routing engine actually saw.
 *
 * Run: bun mini-services/agent-hq/tools/telemetry-snapshot.ts  (supervised
 * as a child of the Next server tree by /api/foreman/health)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const RECEIPTS = '/home/z/my-project/receipts';

// ---- HOST MEMORY LAW (owner question, answered with code) ----------------
// The 2.5GB available-memory boundary is the sovereign ceiling: below it the
// runtime must compact context instead of spawning/loading. The snapshot
// engine MEASURES the host every cycle, records the curve into
// receipts/host-mem.jsonl (bounded), and writes an EDGE-TRIGGERED compaction
// request into receipts/compaction-requests.jsonl exactly when the ceiling is
// crossed (not every 30s — one honest request per crossing).
const MEM_CEILING_AVAIL_MB = 2560; // the 2.5GB sovereign boundary
let memCeilingBreached = false; // edge trigger state
const GATEWAY = 'http://127.0.0.1:3011';
const POLL_MS = 30_000;
const HISTORY_EVERY_MS = 10 * 60_000;
const HISTORY_MAX_LINES = 2000;

// ---- TASK-31 BRIDGE (unified single-source-of-truth telemetry loop) ------
// mem_profiler.py (the sovereign-stack python sentinel, 500MB OOM law) and
// this memguard (ts, 2.5GB ceiling law) are two intentional layers with
// different thresholds and consumers. This bridge sweeps the python
// sentinel's raw outputs (health/mem.json + compaction-policy.json) into
// receipts/host-mem.jsonl as edge-triggered records — append-only, so the
// linear history tree is never rewritten. Every 5 minutes this process also
// KICKS mem_profiler.py --once so both layers measure the same living host.
const STACK = '/home/z/my-project/sovereign-stack';
const MEM_JSON = path.join(STACK, 'health', 'mem.json');
const POLICY_JSON = path.join(STACK, 'health', 'compaction-policy.json');
const PROFILER_KICK_MS = 5 * 60_000;
let lastMemHash = '';
let lastPolicyHash = '';
let lastProfilerKick = 0;

function sha256File(file: string): string | null {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null; // absent measured, never invented
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function sweepTask31Bridge(at: string): void {
  const memSha = sha256File(MEM_JSON);
  const polSha = sha256File(POLICY_JSON);
  if (!memSha && !polSha) return; // profiler never ran yet — nothing to bridge
  if (memSha === lastMemHash && polSha === lastPolicyHash) return; // edge only
  const first = !lastMemHash && !lastPolicyHash;
  lastMemHash = memSha ?? '';
  lastPolicyHash = polSha ?? '';
  if (first) return; // first sight = baseline, not a change event
  appendBounded(
    path.join(RECEIPTS, 'host-mem.jsonl'),
    JSON.stringify({
      at,
      kind: 'task31-mem-profiler-bridge',
      mem: readJson(MEM_JSON),
      policy: readJson(POLICY_JSON),
      evidence: { mem_json_sha256: memSha, compaction_policy_sha256: polSha },
    }),
    500,
  );
  console.log('[telemetry-snapshot] task31 bridge: mem_profiler output change recorded');
}

function kickProfiler(now: number): void {
  if (now - lastProfilerKick < PROFILER_KICK_MS) return;
  lastProfilerKick = now;
  execFile(
    'python3',
    ['mem_profiler.py', '--once'],
    { cwd: STACK, timeout: 20_000 },
    (err) => {
      if (err) console.log(`[telemetry-snapshot] mem_profiler kick failed: ${err.message}`);
      else console.log('[telemetry-snapshot] mem_profiler kicked (task31 refresh)');
    },
  );
}

fs.mkdirSync(RECEIPTS, { recursive: true });
const LATEST = path.join(RECEIPTS, 'gateway-telemetry-latest.json');
const HISTORY = path.join(RECEIPTS, 'gateway-telemetry-history.jsonl');

function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function appendBounded(file: string, line: string, max: number): void {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    /* first line */
  }
  lines.push(line);
  if (lines.length > max) lines = lines.slice(-max);
  atomicWrite(file, lines.join('\n') + '\n');
}

function sampleHost(): {
  total_mb: number;
  avail_mb: number;
  used_pct: number;
  load1: number;
  rss_mb: number;
  compact_suggested: boolean;
} {
  const total = os.totalmem();
  const avail = os.freemem();
  const availMb = Math.round(avail / 1024 / 1024);
  return {
    total_mb: Math.round(total / 1024 / 1024),
    avail_mb: availMb,
    used_pct: Math.round(((total - avail) / total) * 100),
    load1: Math.round(os.loadavg()[0] * 100) / 100,
    rss_mb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
    compact_suggested: availMb < MEM_CEILING_AVAIL_MB,
  };
}

async function pull(): Promise<void> {
  const at = new Date().toISOString();
  const host = sampleHost();
  // memory curve — one bounded line per cycle (30s), pruned to 500
  appendBounded(
    path.join(RECEIPTS, 'host-mem.jsonl'),
    JSON.stringify({ at, ...host }),
    500,
  );
  // TASK-31 unified loop: refresh python sentinel, then bridge its outputs
  kickProfiler(Date.now());
  sweepTask31Bridge(at);
  // EDGE-TRIGGERED compaction request: fire only on ceiling crossing
  if (host.compact_suggested && !memCeilingBreached) {
    appendBounded(
      path.join(RECEIPTS, 'compaction-requests.jsonl'),
      JSON.stringify({
        at,
        kind: 'compaction-request',
        reason: 'host avail below 2.5GB sovereign ceiling',
        avail_mb: host.avail_mb,
        engine: 'sovereign-stack/compaction.py',
      }),
      200,
    );
    console.log(`[telemetry-snapshot] MEM CEILING BREACH — avail ${host.avail_mb}MB < ${MEM_CEILING_AVAIL_MB}MB, compaction requested`);
  }
  memCeilingBreached = host.compact_suggested;
  let payload: Record<string, unknown>;
  try {
    const [tel, health] = await Promise.all([
      fetch(`${GATEWAY}/telemetry`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : undefined)),
      fetch(`${GATEWAY}/health`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : undefined)),
    ]);
    if (!tel) throw new Error('telemetry endpoint not ok');
    const t = tel as { totals?: unknown; families?: unknown };
    const h = health as { uptime_s?: number; last_answered_via?: string; last_latency_ms?: number } | undefined;
    payload = {
      at,
      ok: true,
      gateway: {
        uptime_s: h?.uptime_s,
        last_answered_via: h?.last_answered_via ?? null,
        last_latency_ms: h?.last_latency_ms ?? null,
      },
      totals: t.totals ?? null,
      families: t.families ?? [],
      host,
    };
  } catch (e) {
    // honest failure: the snapshot says the gateway was NOT reachable now
    payload = { at, ok: false, error: (e as Error).message, host };
  }
  atomicWrite(LATEST, JSON.stringify(payload, null, 2) + '\n');
  // history: 10-minute cadence, bounded — enough for trend postmortems
  const now = Date.now();
  if (now - lastHist > HISTORY_EVERY_MS) {
    lastHist = now;
    if (payload.ok) appendBounded(HISTORY, JSON.stringify({ at, totals: payload.totals, families: payload.families }), HISTORY_MAX_LINES);
  }
}

let lastHist = 0;
await pull();
setInterval(() => void pull(), POLL_MS);
console.log(`[telemetry-snapshot] live — ${LATEST} every ${POLL_MS / 1000}s`);
