/**
 * /api/fleet-health — the sovereign-stack live health reader (stdlib only).
 *
 * Reads the stack's own state files from disk and re-verifies BOTH hash
 * chains on EVERY call (never cached trust):
 *   - content/MANIFEST.md chain + last-record-wins re-hash of staged rails
 *   - receipts/RECEIPTS.chain (immutable alert receipts)
 * plus the honest state of: host memory law, python sentinel (mem_profiler),
 * tps bench, BROADCAST-READY seal generation, books lineage, and the
 * unified telemetry bridge.
 *
 * Every file that cannot be read is reported as null — absent is measured,
 * never invented.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

const ROOT = '/home/z/my-project';
const STACK = path.join(ROOT, 'sovereign-stack');
const RECEIPTS = path.join(ROOT, 'receipts');

const CHAIN_LINE = /^\| (\d+) \| ([^|]+) \| ([0-9a-f]{64}) \| ([0-9a-f]{64}) \|$/;

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Faithful TS port of memory_store.MemoryStore.verify() (linkage + hashes). */
function verifyMemoryChain(
  manifestPath: string,
): { ok: boolean; records: number; detail: string } {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(manifestPath, 'utf8').split('\n');
  } catch {
    return { ok: true, records: 0, detail: 'absent' };
  }
  let expectedLink: string | null = null;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = CHAIN_LINE.exec(lines[i].trim());
    if (!m) continue;
    const idx = Number(m[1]);
    const ts = m[2];
    const prev = m[3];
    const sha = m[4];
    let body: string | null = null;
    let kind = '';
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      if (lines[j].startsWith(':: ')) {
        const rest = lines[j].slice(3);
        const p = rest.indexOf(' :: ');
        kind = p >= 0 ? rest.slice(0, p) : rest;
        body = p >= 0 ? rest.slice(p + 4) : '';
        break;
      }
    }
    if (body === null) {
      return { ok: false, records: n, detail: `record ${idx}: missing body line` };
    }
    const payload = `${idx}|${ts}|${kind}|${body}`;
    const calc = crypto.createHash('sha256').update(payload + prev).digest('hex');
    if (calc !== sha) {
      return { ok: false, records: n, detail: `record ${idx}: hash mismatch` };
    }
    if (expectedLink !== null) {
      if (prev !== expectedLink) {
        return { ok: false, records: n, detail: `record ${idx}: broken link` };
      }
    } else if (idx === 0 && prev !== '0'.repeat(64)) {
      return { ok: false, records: n, detail: 'genesis prev != 0' };
    }
    expectedLink = sha;
    n += 1;
  }
  return { ok: true, records: n, detail: 'chain ok' };
}

/** Last-record-wins re-hash of STAGE-anchored rails (mirrors verify_rail). */
function verifyStagedRails(): {
  ok: boolean;
  files: number;
  superseded: number;
  bad: string[];
} {
  const man = path.join(STACK, 'content', 'MANIFEST.md');
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(man, 'utf8').split('\n');
  } catch {
    return { ok: true, files: 0, superseded: 0, bad: [] };
  }
  const latest = new Map<string, { rail: string; date: string; slug: string; sha: string }>();
  const order: string[] = [];
  let superseded = 0;
  for (const ln of lines) {
    if (!ln.startsWith(':: STAGE :: ')) continue;
    const kv: Record<string, string> = {};
    for (const part of ln.slice(':: STAGE :: '.length).split(' ')) {
      const p = part.indexOf('=');
      if (p > 0) kv[part.slice(0, p)] = part.slice(p + 1);
    }
    const rel = `${kv.rail ?? '_'}/${kv.date ?? '_'}/${kv.slug ?? '_'}.md`;
    if (latest.has(rel)) superseded += 1;
    else order.push(rel);
    latest.set(rel, { rail: kv.rail ?? '_', date: kv.date ?? '_', slug: kv.slug ?? '_', sha: kv.sha256 ?? '' });
  }
  const bad: string[] = [];
  let files = 0;
  for (const rel of order) {
    const rec = latest.get(rel)!;
    const f = path.join(STACK, 'content', 'rails', rec.rail, rec.date, `${rec.slug}.md`);
    let actual: string | null = null;
    try {
      actual = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    } catch {
      actual = null;
    }
    if (actual === null) {
      bad.push(`missing:${rel}`);
      continue;
    }
    files += 1;
    if (actual !== rec.sha) bad.push(`tampered:${rel}`);
  }
  return { ok: bad.length === 0, files, superseded, bad };
}

function lastLines(file: string, n: number): string[] {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-n);
  } catch {
    return [];
  }
}

export async function GET() {
  const at = new Date().toISOString();
  const manifestChain = verifyMemoryChain(path.join(STACK, 'content', 'MANIFEST.md'));
  const rails = verifyStagedRails();
  const receiptsChain = verifyMemoryChain(path.join(STACK, 'receipts', 'RECEIPTS.chain'));

  const status = readJson(path.join(STACK, 'health', 'status.json')) as
    | { ts?: string; all_ok?: boolean; results?: { name?: string; verdict?: string; detail?: string }[] }
    | null;
  const mem = readJson(path.join(STACK, 'health', 'mem.json')) as
    | { ts?: string; mem_total_mb?: number; mem_available_mb?: number; state?: string; policy_max_chars?: number }
    | null;
  const policy = readJson(path.join(STACK, 'health', 'compaction-policy.json')) as
    | { low_mem?: boolean; max_chars?: number; reason?: string }
    | null;
  const tps = readJson(path.join(STACK, 'health', 'tps.json')) as
    | { ts?: string; state?: string; note?: string }
    | null;
  const seal = readJson(path.join(STACK, 'content', 'staging', 'BROADCAST-READY.json')) as
    | { state?: string; rails_merkle_root?: string; generation?: { parent_broadcast_root?: string; parent_from?: string } }
    | null;
  const lineage = readJson(path.join(RECEIPTS, 'books-lineage.json')) as
    | { books?: number; root?: string; at?: string }
    | null;
  const telem = readJson(path.join(RECEIPTS, 'gateway-telemetry-latest.json')) as
    | { at?: string; ok?: boolean; error?: string }
    | null;
  const memCurve = lastLines(path.join(RECEIPTS, 'host-mem.jsonl'), 2)
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const bridgeCount = lastLines(path.join(RECEIPTS, 'host-mem.jsonl'), 500)
    .filter((l) => l.includes('task31-mem-profiler-bridge')).length;

  // shift-history receipt (the office's operational log, compiled by
  // mini-services/agent-hq/tools/shift-history.ts from the append-only journal)
  let shiftHistory: { md_at?: string; closed_shifts?: number; last_closed?: { goal?: string; approvals?: number; cancellations?: number; redos?: number } | null } | null = null;
  try {
    const mdPath = path.join(RECEIPTS, 'shift-history-latest.md');
    const mdSt = fs.existsSync(mdPath) ? fs.statSync(mdPath) : null;
    const histLines = lastLines(path.join(RECEIPTS, 'shift-history-history.jsonl'), 1);
    let lastClosed: { goal?: string; approvals?: number; cancellations?: number; redos?: number } | null = null;
    if (histLines.length) {
      try {
        const j = JSON.parse(histLines[0]) as { goal?: string; approvals?: number; cancellations?: number; redos?: number };
        lastClosed = { goal: j.goal, approvals: j.approvals, cancellations: j.cancellations, redos: j.redos };
      } catch {
        lastClosed = null;
      }
    }
    const closedCount = fs.existsSync(path.join(RECEIPTS, 'shift-history-history.jsonl'))
      ? fs.readFileSync(path.join(RECEIPTS, 'shift-history-history.jsonl'), 'utf8').split('\n').filter(Boolean).length
      : 0;
    shiftHistory = {
      md_at: mdSt ? mdSt.mtime.toISOString() : undefined,
      closed_shifts: closedCount,
      last_closed: lastClosed,
    };
  } catch {
    shiftHistory = null;
  }

  const allOk =
    manifestChain.ok &&
    rails.ok &&
    receiptsChain.ok &&
    (seal?.state ?? '') !== 'HALT-CHAIN-BROKEN';

  return Response.json({
    at,
    all_ok: allOk,
    chains: { manifest: manifestChain, staged_rails: rails, receipts: receiptsChain },
    status,
    host_mem: mem,
    compaction_policy: policy,
    tps,
    seal,
    books_lineage: lineage,
    gateway_telemetry: telem
      ? { at: telem.at ?? null, ok: telem.ok ?? null, error: telem.error ?? null }
      : null,
    unified_bridge: { records: bridgeCount, curve_tail: memCurve },
    shift_history: shiftHistory,
  });
}
