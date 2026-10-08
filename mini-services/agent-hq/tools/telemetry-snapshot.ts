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

const RECEIPTS = '/home/z/my-project/receipts';
const GATEWAY = 'http://127.0.0.1:3011';
const POLL_MS = 30_000;
const HISTORY_EVERY_MS = 10 * 60_000;
const HISTORY_MAX_LINES = 2000;

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

async function pull(): Promise<void> {
  const at = new Date().toISOString();
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
    };
  } catch (e) {
    // honest failure: the snapshot says the gateway was NOT reachable now
    payload = { at, ok: false, error: (e as Error).message };
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
