/**
 * /api/decisions — פנקס-ההכרעות של דוכן-ההחלטות (צד-שרת בלבד). [T22]
 * ---------------------------------------------------------------------------
 * ארבעה מקורות-אמת, כולם נמדדים ומפורסמים — אפס המצאה:
 * · ops-intake QUEUE.json (ציבורי)   — סדרי-העבודה הפתוחים עם דרגת-חומרה וראיות
 * · ops-forge RECEIPTS.jsonl (ציבורי) — הכרעות שבוצעו בפועל עם קבלות
 * · FleetHQ office-state (ציבורי)     — הכרעות הפורמן של המשרד
 * · ערוץ-הריבונות (פרטי, מאומת-שרת)   — הסלמות שהמתינות להכרעת-בעלים
 * SWR בכל-מקור: תשובה מיידית מהקאש + רענון-רקע; כל מקור נושא fetchedAt + ageMs
 * וחוק-החיות (נתון-גולמי עתיק מ-24h מסומן staleData). מה שנכשל — מוצג ככשל.
 */
import { NextResponse } from 'next/server';
import { fetchTruth, fetchTruthText, parseJsonl, ageMs } from '@/lib/gh-truth';
import type { ForemanRaw } from '@/lib/hq/truth';

export const revalidate = 0;

const TTL_MS = 120_000; // סדרי-עבודה מתעדכנים בענן כל 30 דק' — 2 דק' קאש מספיקה
const STALE_LAW_MS = 24 * 60 * 60 * 1000;

// ─────────────── צורות-המקורות ───────────────
interface QueueOrder {
  id: string;
  kind: string;
  repo: string;
  severity?: string;
  title: string;
  why?: string;
  status: string;
  firstSeen?: string;
  lastSeen?: string;
  isNew?: boolean;
  readyPrompt?: string;
}
interface QueueFile { generatedAt?: string; orders?: QueueOrder[]; resolved?: QueueOrder[] }
interface ForgeReceipt { at?: string; orderId?: string; recipe?: string; result?: string; commits?: string[] }
interface ForemanDecision { id?: string; title?: string; status?: string; by?: string; at?: number; text?: string; kind?: string }
interface SovereignEntry { at?: string; role?: string; source?: string; kind?: string; text?: string }

interface SourceBox<T> {
  ok: boolean;
  error?: string;
  items: T;
  fetchedAt: string;
  ageMs: number;
  staleData?: boolean;
}

function box<T>(r: { ok: boolean; data: unknown; error?: string; fetchedAt: string }, items: T, rawTs: number | null): SourceBox<T> {
  const age = ageMs(r.fetchedAt);
  const stale = rawTs !== null && Date.now() - rawTs > STALE_LAW_MS;
  return r.ok && r.data !== null
    ? { ok: true, items, fetchedAt: r.fetchedAt, ageMs: age, ...(stale ? { staleData: true } : {}) }
    : { ok: false, error: r.error ?? 'unavailable', items, fetchedAt: r.fetchedAt, ageMs: age };
}

function newestTs(items: { at?: string; firstSeen?: string }[]): number | null {
  let newest: number | null = null;
  for (const it of items) {
    const t = it.at ?? it.firstSeen;
    if (!t) continue;
    const p = Date.parse(t);
    if (!Number.isNaN(p) && (newest === null || p > newest)) newest = p;
  }
  return newest;
}

export async function GET() {
  const [queue, forgeText, foremanState, sovereignText] = await Promise.all([
    fetchTruth<QueueFile>('ops-intake', 'ops/QUEUE.json', { ttlMs: TTL_MS }),
    fetchTruthText('ops-forge', 'ops/RECEIPTS.jsonl', { ttlMs: TTL_MS }),
    fetchTruth<ForemanRaw>('FleetHQ', 'office/state/office-state.json', { ttlMs: TTL_MS }),
    // ערוץ-הריבונות — ריפו פרטי, אחזור מאומת מהשרת בלבד (ה-PAT לא יוצא מכאן)
    fetchTruthText('Sandbox', 'ops/sovereign/OWNER-CHANNEL/inbox.jsonl', { ttlMs: TTL_MS }),
  ]);

  const orders = (queue.data?.orders ?? []).slice().reverse(); // חדש-ראשון
  const receipts = parseJsonl<ForgeReceipt>(forgeText.data ?? '', 30).reverse(); // חדש-ראשון
  const foremanDecisions = Array.isArray(foremanState.data?.decisions)
    ? (foremanState.data!.decisions as ForemanDecision[]).slice(-12).reverse()
    : [];
  // ערוץ-הריבונות: רק שורות-סוכן (אנטי-זיוף — לעולם לא רול owner) + טריות
  const sovereignEntries = parseJsonl<SovereignEntry>(sovereignText.data ?? '', 40)
    .filter((e) => e.role && e.role !== 'owner')
    .slice(-10)
    .reverse();

  const payload = {
    fetchedAt: new Date().toISOString(),
    queue: {
      ...box(queue, orders, newestTs(orders)),
      generatedAt: queue.data?.generatedAt ?? null,
      open: orders.filter((o) => o.status === 'OPEN').length,
      p0: orders.filter((o) => o.status === 'OPEN' && o.severity === 'P0').length,
      p1: orders.filter((o) => o.status === 'OPEN' && o.severity === 'P1').length,
    },
    receipts: box(forgeText, receipts, newestTs(receipts)),
    foreman: {
      ...box(foremanState, foremanDecisions, foremanState.data?.capturedAt ? Date.parse(foremanState.data.capturedAt) : null),
      capturedAt: foremanState.data?.capturedAt ?? null,
    },
    sovereign: {
      ...box(sovereignText, sovereignEntries, newestTs(sovereignEntries)),
      /** ה-PAT והנתיב הפרטי לא נחשפים — רק האם הערוץ זמין */
      via: sovereignText.via,
    },
  };

  return NextResponse.json(payload, { headers: { 'x-decisions-cache': 'swr' } });
}
