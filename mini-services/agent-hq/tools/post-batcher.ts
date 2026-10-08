/**
 * post-batcher.ts — the staged broadcast packager (stdlib only, zero deps).
 *
 * THE MANDATE (Task 30): map the 11 metrics-driven books to transactional
 * content payloads, run the STANDARD compaction.py algorithm to minimize
 * text overhead, package the schema output with the current Merkle lineage
 * root, and tag the package BROADCAST-READY in the staging buffer.
 *
 * HONESTY LAWS (non-negotiable):
 *   1. ZERO ARTIFICIAL METRICS — every payload byte is derived from the
 *      measured books in Domain/ and receipts/. No invented numbers, no
 *      simulated balances, no synthetic heartbeats.
 *   2. NO KEYS, NO NETWORK — this tool touches no credential and opens no
 *      socket. Broadcasting to a public rail (Steem/Blurt) is a SEPARATE,
 *      explicit, owner-gated step that must pass the dryrun-sign gate first.
 *      That is why packages carry kind "ledger.post.draft" — honest drafts,
 *      not signed transactions.
 *   3. HOLD OVER LIE — if the lineage root is missing or a book is
 *      unreadable, the package is tagged HELD with the reason. It is NEVER
 *      marked READY on incomplete evidence.
 *
 * Run: bun mini-services/agent-hq/tools/post-batcher.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = '/home/z/my-project';
const DOMAIN = path.join(ROOT, 'Domain');
const RECEIPTS = path.join(ROOT, 'receipts');
const STAGE = path.join(ROOT, 'broadcast', 'staging');
const COMPACTION_PY = path.join(ROOT, 'sovereign-stack', 'compaction.py');
const BODY_MAX_CHARS = 1400;
const KEEP_PACKAGES = 30; // bounded staging buffer

// the 11 metrics-driven books (subset of watchdog's 22-book shelf that carry
// measured operational metrics — the content rails map onto these)
type BookRef = { id: string; file: string; title: string };
const METRIC_BOOKS: BookRef[] = [
  { id: 'status', file: 'status.json', title: 'Office Status — the live service matrix' },
  { id: 'mirror', file: 'mirror.json', title: 'Mirror — what the network reflects back' },
  { id: 'sovereign-state', file: 'agents/sovereign-state.json', title: 'Sovereignty Ledger — keys, houses, laws' },
  { id: 'sovereign-policy', file: 'agents/sovereign-policy.json', title: 'Sovereign Policy — the routing laws' },
  { id: 'econ-book', file: 'agents/econ-book.json', title: 'Econ Book — measured economics of the fleet' },
  { id: 'dex-book', file: 'agents/dex-book.json', title: 'DEX Book — the swap/trade ledger' },
  { id: 'fills-ledger', file: 'agents/fills-ledger.json', title: 'Fills Ledger — executed transactions' },
  { id: 'market-grid', file: 'agents/market-grid.json', title: 'Market Grid — measured market structure' },
  { id: 'pulse-book', file: 'agents/pulse-book.json', title: 'Pulse Book — the office heartbeat' },
  { id: 'fleet-census', file: 'agents/fleet-census.json', title: 'Fleet Census — the agent population' },
  { id: 'learning-summary', file: 'agents/learning-summary.json', title: 'Learning Summary — what the fleet learned' },
];

function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

// ---- the STANDARD compaction.py algorithm (no re-implementation) ----------
const PY_DRIVER = `
import sys, json
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'sovereign-stack'))})
from compaction import compact_text, compaction_ratio
book = json.load(open(sys.argv[1], encoding='utf-8'))
text = json.dumps(book, ensure_ascii=False, indent=1)
maxc = int(sys.argv[2])
print(json.dumps({
    "compact": compact_text(text, max_chars=maxc),
    "ratio": round(compaction_ratio(text, max_chars=maxc), 3),
    "orig_chars": len(text),
}))
`;

function compactBook(bookFile: string): { compact: string; ratio: number; orig_chars: number } | undefined {
  const r = spawnSync('python3', ['-c', PY_DRIVER, bookFile, String(BODY_MAX_CHARS)], {
    timeout: 10_000,
    encoding: 'utf8',
  });
  if (r.status !== 0 || !r.stdout) return undefined;
  try {
    return JSON.parse(r.stdout.trim()) as { compact: string; ratio: number; orig_chars: number };
  } catch {
    return undefined;
  }
}

// ---- main -------------------------------------------------------------------
function main(): void {
  fs.mkdirSync(STAGE, { recursive: true });
  const at = new Date().toISOString();

  // current Merkle lineage root — written by the live shelf watchdog
  const lineage = readJson(path.join(RECEIPTS, 'books-lineage.json')) as
    | { root?: string; books?: number }
    | undefined;
  const lineageRoot = typeof lineage?.root === 'string' ? lineage.root : undefined;

  const packages: Array<Record<string, unknown>> = [];
  let ready = 0;
  let held = 0;

  for (const b of METRIC_BOOKS) {
    const abs = path.join(DOMAIN, b.file);
    const book = readJson(abs);
    const cmp = book ? compactBook(abs) : undefined;

    const pkg: Record<string, unknown> = {
      at,
      actor: 'post-batcher',
      kind: 'ledger.post.draft', // honest: a draft, NOT a signed transaction
      schema: 'broadcast-pkg/v1',
      book: { id: b.id, file: b.file, title: b.title },
      refs: { task: 't6', book: b.file, lineage_root: lineageRoot ?? null },
      amounts: { USDS: 0 }, // zero-value ledger law: nothing is claimed or simulated
      body_compact: cmp?.compact ?? null,
      chars: cmp ? { orig: cmp.orig_chars, compact: cmp.compact.length, ratio: cmp.ratio } : null,
      signed: false,
      broadcast: false,
      status: 'HELD',
      hold_reason: undefined as string | undefined,
      note: 'staged only — dispatch requires the dryrun-sign gate and explicit owner release; no keys were touched by the batcher',
    };

    if (!book) {
      pkg.hold_reason = `book unreadable: Domain/${b.file}`;
    } else if (!cmp) {
      pkg.hold_reason = 'compaction.py failed on this book';
    } else if (!lineageRoot) {
      pkg.hold_reason = 'no Merkle lineage root in receipts/books-lineage.json';
    } else {
      pkg.status = 'BROADCAST-READY';
      delete pkg.hold_reason;
      ready++;
    }
    if (pkg.status === 'HELD') held++;

    const file = path.join(STAGE, `${at.replace(/[:.]/g, '-')}-${b.id}.json`);
    atomicWrite(file, JSON.stringify(pkg, null, 2) + '\n');
    packages.push({ id: b.id, file: path.relative(ROOT, file), status: pkg.status, chars: pkg.chars });
  }

  // manifest — the staging buffer's index (bounded: prune old packages)
  const manifest = {
    at,
    lineage_root: lineageRoot ?? null,
    books_mapped: METRIC_BOOKS.length,
    ready_count: ready,
    held_count: held,
    law: 'zero artificial metrics · dryrun-sign gate required before any rail broadcast',
    packages,
  };
  atomicWrite(path.join(STAGE, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');

  // bounded buffer: keep only the newest KEEP_PACKAGES package files
  const files = fs
    .readdirSync(STAGE)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort()
    .reverse();
  for (const f of files.slice(KEEP_PACKAGES)) fs.rmSync(path.join(STAGE, f), { force: true });

  console.log(
    `[post-batcher] ${ready} BROADCAST-READY, ${held} HELD, lineage=${(lineageRoot ?? 'none').slice(0, 16)}… → broadcast/staging/`,
  );
  if (held > 0) console.log('[post-batcher] honest holds present — see index.json hold_reason fields');
}

main();
