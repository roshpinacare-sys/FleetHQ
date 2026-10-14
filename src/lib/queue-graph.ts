/**
 * queue-graph.ts — גרף-תלויות לתור-סדרי-העבודה (A3). [T26]
 * ---------------------------------------------------------------------------
 * הפער-המדוד (מהרוסט): "QUEUE שטוח P0-P3 בלי תלויות, בלי blocked, וסגירה
 * לא-מוכחת-בקבלה". המנגנון בונה גרף אמת משני-מקורות-גיט:
 *   · ops-intake ops/QUEUE.json      — התור החי (orders עם id/repo/severity/kind).
 *   · ops-forge  ops/RECEIPTS.jsonl  — קבלות מקושרות-orderId.
 * חוקי-הגרף (כולם מדידה, אפס-המצאה):
 *   1. סדרות-פר-ריפו: רק סדר-העבודה הותיק-ביותר בריפו-נתון הוא ראש-מוכן; כל-השאר
 *      באותו-ריפו חסומים-על-ידו (dependsOn מרומז — אין-שניים-כותבים-לריפו-אחד).
 *   2. תלויות-מפורשות: dependsOn אם-קיים (עתיד-תואם-agentcraft); מעגלים מדודים.
 *   3. stale: lastSeen ישן מ-48 שע'. chronic: פתוח-מעל-7 ימים מאז firstSeen.
 *   4. ערירי: אין-בעל-מסילה (kind שאינו קבוע-בבעלות).
 *   5. סגירה-מוכחת: קבלות-receipts שמתייחסות ל-orderId שאינו-עוד-בתור = נסגרו;
 *      קבלה-על-סדר-שעודנו-פתוח = קבלה-לא-סוגרת (מדוד ומדווח כנה).
 */
import { fetchTruth, fetchTruthText, parseJsonl } from '@/lib/gh-truth';

export interface QueueOrder {
  id: string;
  kind: string;
  repo: string;
  severity: string;
  title: string;
  status?: string;
  firstSeen?: string;
  lastSeen?: string;
  dependsOn?: string[];
}

export interface GraphNode {
  id: string;
  repo: string;
  severity: string;
  kind: string;
  title: string;
  ageH: number;
  openH: number;
  /** ראש-מוכן ללקיחה (לפי סדרות-פר-ריפו + תלויות) */
  ready: boolean;
  blockedBy: string[];
  stale: boolean;
  chronic: boolean;
  orphan: boolean;
  /** קבלה-קיימת-על-סדר-פתוח — לא סוגרת (דווח כנה) */
  openReceipt?: string;
  /** terminal receipt on an open order — resolved out-of-band, closure-eligible [T27] */
  openReceiptTerminal?: boolean;
}

export interface QueueGraph {
  ok: boolean;
  error?: string;
  nodes: GraphNode[];
  health: {
    total: number;
    ready: number;
    blocked: number;
    stale: number;
    chronic: number;
    orphan: number;
    cycles: number;
    receipts: number;
    provenClosed: number;
    openWithReceipt: number;
    openWithTerminalReceipt: number;
  };
  receiptsFetchedAt: string;
  queueFetchedAt: string;
  fetchedAt: string;
}

/** Terminal receipt = the order was resolved outside the executor path
 * (skipped / handed off via escalation / declared refused). Such receipts are
 * closure-eligible: the owner should close the order — it must not float open forever.
 * Opposite: receipts that declare waiting ('ממתין', 'measured-unmatched') = real work
 * still pending; they stay open honestly. */
function isTerminalReceipt(result: string): boolean {
  const r = result ?? '';
  return r.includes('דולג') || r.includes('הסלמה') || /skipped|escalated|refused/i.test(r);
}

const STALE_H = 48;
const CHRONIC_H = 168;

interface ReceiptLine {
  at?: string;
  orderId?: string;
  result?: string;
  kind?: string;
}

export async function buildQueueGraph(): Promise<QueueGraph> {
  const fetchedAt = new Date().toISOString();
  const [queueRes, recRes] = await Promise.all([
    fetchTruth<Record<string, unknown>>('ops-intake', 'ops/QUEUE.json', { ttlMs: 120_000 }),
    fetchTruthText('ops-forge', 'ops/RECEIPTS.jsonl', { ttlMs: 120_000 }),
  ]);

  if (!queueRes.ok || !queueRes.data) {
    return emptyGraph(fetchedAt, queueRes.error ?? 'queue-unreachable', recRes.fetchedAt ?? fetchedAt, queueRes.fetchedAt);
  }

  const orders = (Array.isArray(queueRes.data.orders) ? queueRes.data.orders : []) as QueueOrder[];
  const receipts: ReceiptLine[] = recRes.ok && recRes.data ? parseJsonl<ReceiptLine>(recRes.data, 400) : [];
  const nowMs = Date.now();

  const open = orders.filter((o) => (o.status ?? 'OPEN') === 'OPEN');
  const receiptByOrder = new Map<string, ReceiptLine[]>();
  for (const r of receipts) {
    if (!r.orderId) continue;
    const arr = receiptByOrder.get(r.orderId) ?? [];
    arr.push(r);
    receiptByOrder.set(r.orderId, arr);
  }

  // חוק-סדרות: ראש = הותיק-ביותר (firstSeen) פר-ריפו
  const headByRepo = new Map<string, QueueOrder>();
  for (const o of open) {
    const cur = headByRepo.get(o.repo);
    if (!cur || Date.parse(o.firstSeen ?? o.lastSeen ?? '1970') < Date.parse(cur.firstSeen ?? cur.lastSeen ?? '1970')) {
      headByRepo.set(o.repo, o);
    }
  }

  // מעגלים — רק על תלויות-מפורשות (עתידי; מדידה גם-אם-אפס)
  const byId = new Map(open.map((o) => [o.id, o]));
  let cycles = 0;
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function hasCycle(id: string): boolean {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const deps = byId.get(id)?.dependsOn ?? [];
    for (const d of deps) if (byId.has(d) && hasCycle(d)) { cycles++; break; }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const o of open) hasCycle(o.id);

  function blockedFor(o: QueueOrder): string[] {
    const blocks: string[] = [];
    const head = headByRepo.get(o.repo);
    if (head && head.id !== o.id) blocks.push(head.id);
    for (const d of o.dependsOn ?? []) if (byId.has(d) && d !== o.id) blocks.push(d);
    return [...new Set(blocks)];
  }

  const nodes: GraphNode[] = open.map((o) => {
    const blockedBy = blockedFor(o);
    const openH = o.firstSeen ? Math.max(0, (nowMs - Date.parse(o.firstSeen)) / 3_600_000) : 0;
    const recs = receiptByOrder.get(o.id) ?? [];
    return {
      id: o.id,
      repo: o.repo,
      severity: o.severity,
      kind: o.kind,
      title: o.title,
      ageH: o.lastSeen ? Math.round(Math.max(0, (nowMs - Date.parse(o.lastSeen)) / 3_600_000) * 10) / 10 : 0,
      openH: Math.round(openH * 10) / 10,
      ready: blockedBy.length === 0,
      blockedBy,
      stale: o.lastSeen ? nowMs - Date.parse(o.lastSeen) > STALE_H * 3_600_000 : false,
      chronic: openH > CHRONIC_H,
      orphan: !['gridwatch-owned'].includes(o.kind),
      openReceipt: recs.length ? (recs[recs.length - 1].result ?? 'receipt').slice(0, 80) : undefined,
      openReceiptTerminal: recs.length > 0 && isTerminalReceipt(recs[recs.length - 1].result ?? ''),
    };
  });

  // מיון: P0 ראשון ואז גיל
  const pRank = (p: string) => ['P0', 'P1', 'P2', 'P3'].indexOf(p) >= 0 ? ['P0', 'P1', 'P2', 'P3'].indexOf(p) : 9;
  nodes.sort((a, b) => pRank(a.severity) - pRank(b.severity) || b.openH - a.openH);

  const openIds = new Set(open.map((o) => o.id));
  let provenClosed = 0;
  for (const r of receipts) {
    if (r.orderId && !openIds.has(r.orderId)) provenClosed++;
  }
  const openWithReceipt = open.filter((o) => (receiptByOrder.get(o.id) ?? []).length > 0).length;
  const openWithTerminalReceipt = nodes.filter((n) => n.openReceiptTerminal).length;

  return {
    ok: true,
    nodes,
    health: {
      total: nodes.length,
      ready: nodes.filter((n) => n.ready).length,
      blocked: nodes.filter((n) => !n.ready).length,
      stale: nodes.filter((n) => n.stale).length,
      chronic: nodes.filter((n) => n.chronic).length,
      orphan: nodes.filter((n) => n.orphan).length,
      cycles,
      receipts: receipts.length,
      provenClosed,
      openWithReceipt,
      openWithTerminalReceipt,
    },
    receiptsFetchedAt: recRes.fetchedAt ?? fetchedAt,
    queueFetchedAt: queueRes.fetchedAt,
    fetchedAt,
  };
}

function emptyGraph(fetchedAt: string, error: string, receiptsFetchedAt: string, queueFetchedAt: string): QueueGraph {
  return {
    ok: false,
    error,
    nodes: [],
    health: { total: 0, ready: 0, blocked: 0, stale: 0, chronic: 0, orphan: 0, cycles: 0, receipts: 0, provenClosed: 0, openWithReceipt: 0, openWithTerminalReceipt: 0 },
    receiptsFetchedAt,
    queueFetchedAt,
    fetchedAt,
  };
}
