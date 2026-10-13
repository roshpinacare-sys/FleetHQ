import fs from 'node:fs';
import path from 'node:path';
import type { BookView } from './types';

// Real-book registry. In live mode DATA_DIR points at the fleet's real data root
// and every book here is a real file with a real heartbeat.
// In sim/demo mode DATA_DIR points at demo-data/ (synthetic, clearly-labeled books).
// Default './data' keeps public checkouts self-contained; deployments export AGENT_HQ_DATA_DIR.
export const DATA_DIR = process.env.AGENT_HQ_DATA_DIR || new URL('../data', import.meta.url).pathname;

interface BookDef {
  id: string;
  file: string;
  title: { he: string; en: string };
  category: { he: string; en: string };
}

export const BOOK_DEFS: BookDef[] = [
  { id: 'dex-book', file: 'agents/dex-book.json', title: { he: 'ספר הדקס', en: 'DEX book' }, category: { he: 'שוק', en: 'market' } },
  { id: 'fills-ledger', file: 'agents/fills-ledger.json', title: { he: 'פנקס הביצועים', en: 'Fills ledger' }, category: { he: 'שוק', en: 'market' } },
  { id: 'market-grid', file: 'agents/market-grid.json', title: { he: 'רשת השוק', en: 'Market grid' }, category: { he: 'שוק', en: 'market' } },
  { id: 'truth-history', file: 'truth/history.json', title: { he: 'היסטוריית שערי-אמת', en: 'Truth gate history' }, category: { he: 'אמת', en: 'truth' } },
  { id: 'claims-audit', file: 'agents/claims-audit.json', title: { he: 'ביקורת טענות', en: 'Claims audit' }, category: { he: 'ביקורת', en: 'audit' } },
  { id: 'workflow-audit', file: 'agents/workflow-audit.json', title: { he: 'ביקורת זרימות', en: 'Workflow audit' }, category: { he: 'ביקורת', en: 'audit' } },
  { id: 'harness-audit', file: 'agents/harness-audit.json', title: { he: 'ביקורת רתמה', en: 'Harness audit' }, category: { he: 'ביקורת', en: 'audit' } },
  { id: 'capability-matrix', file: 'agents/capability-matrix.json', title: { he: 'מטריצת יכולות', en: 'Capability matrix' }, category: { he: 'ביקורת', en: 'audit' } },
  { id: 'deep-audit', file: 'agents/deep-audit.json', title: { he: 'ביקורת עומק', en: 'Deep audit' }, category: { he: 'ביקורת', en: 'audit' } },
  { id: 'econ-book', file: 'agents/econ-book.json', title: { he: 'ספר הכלכלה', en: 'Econ book' }, category: { he: 'כלכלה', en: 'economy' } },
  { id: 'sovereign-state', file: 'agents/sovereign-state.json', title: { he: 'מצב הריבונות', en: 'Sovereign state' }, category: { he: 'כלכלה', en: 'economy' } },
  { id: 'sovereign-policy', file: 'agents/sovereign-policy.json', title: { he: 'מדיניות ריבונית', en: 'Sovereign policy' }, category: { he: 'כלכלה', en: 'economy' } },
  { id: 'fleet-roster', file: 'agents/fleet-roster.json', title: { he: 'רוסטר ההון', en: 'Capital roster' }, category: { he: 'כלכלה', en: 'economy' } },
  { id: 'fleet-indicators', file: 'agents/fleet-indicators.json', title: { he: 'מדדי הצי', en: 'Fleet indicators' }, category: { he: 'מודיעין', en: 'intel' } },
  { id: 'fleet-census', file: 'agents/fleet-census.json', title: { he: 'מפקד הצי', en: 'Fleet census' }, category: { he: 'מודיעין', en: 'intel' } },
  { id: 'pulse-book', file: 'agents/pulse-book.json', title: { he: 'ספר הדופק', en: 'Pulse book' }, category: { he: 'מודיעין', en: 'intel' } },
  { id: 'learning-summary', file: 'agents/learning-summary.json', title: { he: 'סיכום למידה', en: 'Learning summary' }, category: { he: 'מודיעין', en: 'intel' } },
  { id: 'registry', file: 'agents/registry.json', title: { he: 'רישום הסוכנים', en: 'Agent registry' }, category: { he: 'תשתיות', en: 'infra' } },
  { id: 'coord-bus', file: 'agents/coord-bus.json', title: { he: 'אוטובוס תיאום', en: 'Coordination bus' }, category: { he: 'תשתיות', en: 'infra' } },
  { id: 'scheduler-audit', file: 'agents/scheduler-audit.json', title: { he: 'ביקורת מזכיר-זמנים', en: 'Scheduler audit' }, category: { he: 'תשתיות', en: 'infra' } },
  { id: 'status', file: 'status.json', title: { he: 'מצב הרשת', en: 'Network status' }, category: { he: 'תשתיות', en: 'infra' } },
  { id: 'mirror', file: 'mirror.json', title: { he: 'ספר המראה', en: 'Mirror book' }, category: { he: 'תשתיות', en: 'infra' } },
];

const DATE_KEYS = ['at', 'asOf', 'generatedAt', 'publishedAsOf', 'updated', 'lastRun', 'checkedAt', 'timestamp', 'measuredAt'];

function findHeartbeat(value: unknown, depth = 0): number | undefined {
  if (value == null || typeof value !== 'object' || depth > 3) return undefined;
  const obj = value as Record<string, unknown>;
  for (const k of DATE_KEYS) {
    const v = obj[k];
    if (typeof v === 'string') {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return t;
    } else if (typeof v === 'number' && v > 1_600_000_000_000) {
      return v;
    }
  }
  for (const v of Object.values(obj)) {
    const found = findHeartbeat(v, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function loadBooks(ownerOf: (id: string) => string | undefined): BookView[] {
  const out: BookView[] = [];
  for (const def of BOOK_DEFS) {
    const p = path.join(DATA_DIR, def.file);
    try {
      const st = fs.statSync(p);
      let heartbeat: number | undefined;
      let ok: boolean | undefined;
      let verdict: string | undefined;
      try {
        const json = JSON.parse(fs.readFileSync(p, 'utf8'));
        heartbeat = findHeartbeat(json);
        if (typeof json.ok === 'boolean') ok = json.ok;
        if (typeof json.verdict === 'string') verdict = json.verdict.slice(0, 40);
      } catch {
        /* book exists but not pure JSON — still a real file, heartbeat stays undefined */
      }
      out.push({
        id: def.id,
        file: def.file,
        title: def.title,
        category: def.category,
        bytes: st.size,
        heartbeat,
        ageHours: heartbeat ? (Date.now() - heartbeat) / 3_600_000 : undefined,
        ok,
        verdict,
        owner: ownerOf(def.id),
      });
    } catch {
      /* missing book: skipped honestly — never invented */
    }
  }
  return out;
}

export function bookPath(id: string): string | undefined {
  const def = BOOK_DEFS.find((b) => b.id === id);
  if (!def) return undefined;
  const p = path.join(DATA_DIR, def.file);
  return fs.existsSync(p) ? p : undefined;
}

export function readBookRaw(id: string): { bytes: number; text: string } | undefined {
  const p = bookPath(id);
  if (!p) return undefined;
  const text = fs.readFileSync(p, 'utf8');
  return { bytes: Buffer.byteLength(text), text };
}

/** Smart JSON excerpt: shape first, then meat. Bounded output for the model context. */
export function excerptBook(id: string, limit = 3600): string | undefined {
  const raw = readBookRaw(id);
  if (!raw) return undefined;
  try {
    const json = JSON.parse(raw.text);
    const shape = describeShape(json, 0);
    let flat = JSON.stringify(json);
    if (flat.length <= limit) return `shape: ${shape}\nfull: ${flat}`;
    // keep head+tail of the compact JSON
    const head = flat.slice(0, limit * 0.62);
    const tail = flat.slice(-limit * 0.3);
    return `shape: ${shape}\nhead: ${head} …[truncated ${flat.length - head.length - tail.length} bytes]… tail: ${tail}`;
  } catch {
    return raw.text.slice(0, limit);
  }
}

function describeShape(v: unknown, depth: number): string {
  if (Array.isArray(v)) return `array[${v.length}] of ${v.length ? describeShape(v[0], depth + 1) : 'empty'}`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).slice(0, 14);
    return `{${keys.join(', ')}${Object.keys(o).length > 14 ? ', …' : ''}}`;
  }
  return typeof v;
}

/** Measure a real value at a dot path (supports [n] indexing). */
export function measureBook(id: string, jsonPath: string): { found: boolean; value?: unknown } {
  const raw = readBookRaw(id);
  if (!raw) return { found: false };
  try {
    const json = JSON.parse(raw.text);
    const parts = jsonPath
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean);
    let cur: unknown = json;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return { found: false };
      cur = (cur as Record<string, unknown>)[part];
    }
    return { found: cur !== undefined, value: cur };
  } catch {
    return { found: false };
  }
}

/** Real mechanical cross-check between two books. */
export interface CrossCheckResult {
  a: string;
  b: string;
  aHeartbeat?: number;
  bHeartbeat?: number;
  ageDeltaHours?: number;
  aOk?: boolean;
  bOk?: boolean;
  sharedNumeric: Array<{ key: string; a: number; b: number; equal: boolean }>;
  aOnlyKeys: string[];
  bOnlyKeys: string[];
  notes: string[];
}

export function crossCheckBooks(idA: string, idB: string): CrossCheckResult | undefined {
  const ra = readBookRaw(idA);
  const rb = readBookRaw(idB);
  if (!ra || !rb) return undefined;
  const out: CrossCheckResult = {
    a: idA,
    b: idB,
    sharedNumeric: [],
    aOnlyKeys: [],
    bOnlyKeys: [],
    notes: [],
  };
  try {
    const a = JSON.parse(ra.text);
    const b = JSON.parse(rb.text);
    const ha = findHeartbeat(a);
    const hb = findHeartbeat(b);
    out.aHeartbeat = ha;
    out.bHeartbeat = hb;
    if (ha && hb) out.ageDeltaHours = (ha - hb) / 3_600_000;
    if (typeof a.ok === 'boolean') out.aOk = a.ok;
    if (typeof b.ok === 'boolean') out.bOk = b.ok;
    const flatA = flatNumerics(a, 2);
    const flatB = flatNumerics(b, 2);
    for (const [k, v] of Object.entries(flatA)) {
      if (k in flatB) {
        const w = flatB[k];
        out.sharedNumeric.push({ key: k, a: v, b: w, equal: v === w });
      } else if (out.aOnlyKeys.length < 12) out.aOnlyKeys.push(k);
    }
    for (const k of Object.keys(flatB)) if (!(k in flatA) && out.bOnlyKeys.length < 12) out.bOnlyKeys.push(k);
    if (out.sharedNumeric.some((s) => !s.equal)) out.notes.push('shared counters differ — books measure at different times or disagree');
    else if (out.sharedNumeric.length) out.notes.push('all shared counters agree');
    else out.notes.push('no shared numeric counters — structural comparison only');
    if (out.ageDeltaHours !== undefined && Math.abs(out.ageDeltaHours) > 6)
      out.notes.push(`heartbeat gap ${Math.abs(out.ageDeltaHours).toFixed(1)}h — one book is materially staler`);
  } catch (e) {
    out.notes.push(`parse failure: ${(e as Error).message}`);
  }
  return out;
}

function flatNumerics(v: unknown, depth: number, prefix = ''): Record<string, number> {
  const out: Record<string, number> = {};
  if (depth <= 0 || v == null || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof val === 'number' && Number.isFinite(val)) out[key] = val;
    else if (val && typeof val === 'object') Object.assign(out, flatNumerics(val, depth - 1, key));
  }
  return out;
}
