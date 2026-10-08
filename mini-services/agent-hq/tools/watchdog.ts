/**
 * watchdog.ts — the floor's self-healing sentinel (stdlib only, zero deps).
 *
 * WHY: the office "died" once with every service green — a container recycle
 * wiped the crew's book shelf (Domain/agents/*.json …) → zero tasks → an
 * empty room that LOOKS dead. This watcher closes that death vector:
 *
 *   1. EVENT LANE: fs.watch on DATA_DIR (recursive) — a wipe is detected in ms.
 *   2. PERIODIC LANE: 60s scan — belt-and-braces, because fs.watch in
 *      containers can silently drop watches after directory replacement.
 *
 * RESPONSE LAW (honest escalation, lighter tool first):
 *   - books missing  → re-run plant-books.ts (measured-data restore, seconds)
 *   - plant fails ×3 → log CRITICAL event (boot-sovereign.sh is the COLD-BOOT
 *     path, deliberately NOT invoked mid-life: the machine is healthy, only
 *     the shelf is empty — full boot would double-spawn live services)
 *   - recovery       → lineage recomputed, event logged, crew keeps working
 *
 * Everything it does lands in receipts/ — the office's own paper trail.
 *
 * Run: bun mini-services/agent-hq/tools/watchdog.ts   (supervised as a child
 * of the Next server tree by /api/foreman/health — the proven survivor way)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const ROOT = '/home/z/my-project';
const DATA_DIR = '/home/z/my-project/Domain';
const RECEIPTS = path.join(ROOT, 'receipts');
const PLANT = path.join(ROOT, 'mini-services/agent-hq/tools/plant-books.ts');

// the canonical shelf — same definitions the foreman reads (src/books.ts)
type BookDef = { id: string; file: string };
const BOOK_DEFS: BookDef[] = [
  { id: 'dex-book', file: 'agents/dex-book.json' },
  { id: 'fills-ledger', file: 'agents/fills-ledger.json' },
  { id: 'market-grid', file: 'agents/market-grid.json' },
  { id: 'truth-history', file: 'truth/history.json' },
  { id: 'claims-audit', file: 'agents/claims-audit.json' },
  { id: 'workflow-audit', file: 'agents/workflow-audit.json' },
  { id: 'harness-audit', file: 'agents/harness-audit.json' },
  { id: 'capability-matrix', file: 'agents/capability-matrix.json' },
  { id: 'deep-audit', file: 'agents/deep-audit.json' },
  { id: 'econ-book', file: 'agents/econ-book.json' },
  { id: 'sovereign-state', file: 'agents/sovereign-state.json' },
  { id: 'sovereign-policy', file: 'agents/sovereign-policy.json' },
  { id: 'fleet-roster', file: 'agents/fleet-roster.json' },
  { id: 'fleet-indicators', file: 'agents/fleet-indicators.json' },
  { id: 'fleet-census', file: 'agents/fleet-census.json' },
  { id: 'pulse-book', file: 'agents/pulse-book.json' },
  { id: 'learning-summary', file: 'agents/learning-summary.json' },
  { id: 'registry', file: 'agents/registry.json' },
  { id: 'coord-bus', file: 'agents/coord-bus.json' },
  { id: 'scheduler-audit', file: 'agents/scheduler-audit.json' },
  { id: 'status', file: 'status.json' },
  { id: 'mirror', file: 'mirror.json' },
];

const MIN_BOOKS = 15; // of 22 — below this the floor visibly starves

fs.mkdirSync(RECEIPTS, { recursive: true });

function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function appendBounded(file: string, line: string, max = 500): void {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    /* first line ever */
  }
  lines.push(line);
  if (lines.length > max) lines = lines.slice(-max);
  atomicWrite(file, lines.join('\n') + '\n');
}

function logEvent(kind: string, detail: Record<string, unknown>): void {
  const at = new Date().toISOString();
  const line = JSON.stringify({ at, kind, ...detail });
  appendBounded(path.join(RECEIPTS, 'watchdog-events.jsonl'), line);
  console.log(`[watchdog] ${kind}`, JSON.stringify(detail).slice(0, 160));
}

function missingBooks(): string[] {
  return BOOK_DEFS.filter((b) => !fs.existsSync(path.join(DATA_DIR, b.file))).map((b) => b.id);
}

// ---- lineage: per-book sha256 + merkle root (stdlib crypto only) ------------
function sha256(buf: fs.PathOrFileDescriptor): string {
  return crypto.createHash('sha256').update(fs.readFileSync(buf)).digest('hex');
}

function merkleRoot(hashes: string[]): string {
  if (!hashes.length) return crypto.createHash('sha256').update('empty-shelf').digest('hex');
  let layer = [...hashes];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i];
      const b = layer[i + 1] ?? a; // odd node pairs with itself — honest standard
      next.push(crypto.createHash('sha256').update(a + b).digest('hex'));
    }
    layer = next;
  }
  return layer[0];
}

function writeLineage(): { root: string; files: number } {
  const files: Record<string, string> = {};
  const present = BOOK_DEFS.filter((b) => fs.existsSync(path.join(DATA_DIR, b.file)));
  for (const b of present.slice().sort((x, y) => x.file.localeCompare(y.file))) {
    files[b.file] = sha256(path.join(DATA_DIR, b.file));
  }
  const root = merkleRoot(Object.keys(files).sort().map((k) => `${k}:${files[k]}`));
  const lineage = { at: new Date().toISOString(), books: present.length, root, files };
  atomicWrite(path.join(RECEIPTS, 'books-lineage.json'), JSON.stringify(lineage, null, 2) + '\n');
  // lineage history: append only when the root actually changed (bounded)
  const hist = path.join(RECEIPTS, 'books-lineage-history.jsonl');
  let last = '';
  try {
    const lines = fs.readFileSync(hist, 'utf8').split('\n').filter(Boolean);
    last = lines.length ? (JSON.parse(lines[lines.length - 1]) as { root: string }).root : '';
  } catch {
    /* no history yet */
  }
  if (last !== root) appendBounded(hist, JSON.stringify({ at: lineage.at, books: present.length, root }), 300);
  return { root, files: present.length };
}

// ---- recovery ----------------------------------------------------------------
let planting = false;
let plantFails = 0;

function plantBooks(reason: string): void {
  if (planting) return;
  planting = true;
  logEvent('restore-started', { reason, trigger: 'plant-books.ts' });
  const child = spawn('bun', [PLANT], { cwd: ROOT, stdio: 'ignore', detached: true });
  child.on('exit', (code) => {
    planting = false;
    if (code === 0) {
      plantFails = 0;
      const miss = missingBooks();
      const lin = writeLineage();
      logEvent('restore-done', { still_missing: miss, books: lin.files, lineage_root: lin.root.slice(0, 16) });
    } else {
      plantFails++;
      logEvent('restore-failed', { attempt: plantFails, exit_code: code });
      if (plantFails >= 3) {
        logEvent('critical', {
          note: 'plant failed 3× — manual cold boot may be needed (bash vault/boot-sovereign.sh on a fresh machine); boot-sovereign is deliberately NOT called mid-life',
        });
        plantFails = 0; // avoid event spam; periodic lane keeps watching
      }
    }
  });
  child.unref();
}

// ---- the two lanes -------------------------------------------------------------
function scanLane(lane: 'event' | 'periodic'): void {
  const miss = missingBooks();
  if (miss.length >= 3) {
    logEvent('wipe-detected', { lane, missing: miss.length, ids: miss.slice(0, 6) });
    plantBooks(`wipe detected via ${lane} lane (${miss.length} books missing)`);
  } else {
    writeLineage();
  }
}

// EVENT LANE — debounced: a wipe touches many files in one burst
let debounce: ReturnType<typeof setTimeout> | undefined;
try {
  fs.watch(DATA_DIR, { recursive: true }, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => scanLane('event'), 2500);
  });
  console.log('[watchdog] event lane armed on Domain (recursive)');
} catch (e) {
  console.log(`[watchdog] event lane unavailable (${(e as Error).message}) — periodic lane only`);
}

// PERIODIC LANE — 60s
setInterval(() => scanLane('periodic'), 60_000);

// boot: initial scan + lineage receipt
scanLane('periodic');
console.log('[watchdog] armed — shelf sentinel live, receipts in receipts/');
