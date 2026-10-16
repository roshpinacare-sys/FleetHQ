/**
 * decisions.ts — גשר-פנקס-ההכרעות (דפדפן בלבד). [T22]
 * ---------------------------------------------------------------------------
 * סקר-מחזורי של /api/decisions → חנות-זוסטנד אחת שכל-החדר קורא ממנה:
 * טבעת-הדוכן, ה-HUD, פאנל-דוכן-ההחלטות והתכנסות-הצוות. אין כאן שום המצאה —
 * כשהמקור נופל הפנקס מציג כשל בכנות, והטבעת לא נדלקת מזויפת.
 */
'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

export interface LedgerOrder {
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
export interface LedgerReceipt { at?: string; orderId?: string; recipe?: string; result?: string; commits?: string[] }
export interface LedgerForemanDecision { id?: string; title?: string; status?: string; by?: string; at?: number; text?: string; kind?: string }
export interface LedgerSovereign { at?: string; role?: string; source?: string; kind?: string; text?: string }

interface BoxWire<T> { ok: boolean; error?: string; items: T; fetchedAt: string; ageMs: number; staleData?: boolean }

interface DecisionsWire {
  fetchedAt: string;
  queue: BoxWire<LedgerOrder[]> & { generatedAt?: string | null; open: number; p0: number; p1: number };
  receipts: BoxWire<LedgerReceipt[]>;
  foreman: BoxWire<LedgerForemanDecision[]> & { capturedAt: string | null };
  sovereign: BoxWire<LedgerSovereign[]> & { via: string };
}

export interface DecisionsLedger {
  loaded: boolean;
  fetchedAt: string | null;
  queue: DecisionsWire['queue'] | null;
  receipts: DecisionsWire['receipts'] | null;
  foreman: DecisionsWire['foreman'] | null;
  sovereign: DecisionsWire['sovereign'] | null;
  /** מספר-הכרעות-פתוחות בכל-דרגה — המקור לטבעת-הדוכן ולהתכנסות */
  openCount: number;
  p0Count: number;
  error: string | null;
}

interface DecisionsState extends DecisionsLedger {
  pull(): Promise<void>;
}

const EMPTY: DecisionsLedger = {
  loaded: false, fetchedAt: null, queue: null, receipts: null, foreman: null,
  sovereign: null, openCount: 0, p0Count: 0, error: null,
};

export const useDecisions = create<DecisionsState>((set, get) => ({
  ...EMPTY,
  async pull() {
    try {
      const res = await fetch('/api/decisions', { cache: 'no-store', signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error(`http-${res.status}`);
      const d = (await res.json()) as DecisionsWire;
      const openCount = (d.queue.ok ? d.queue.open : 0) + (d.foreman.ok ? d.foreman.items.filter((x) => x.status === 'open').length : 0);
      set({
        loaded: true, fetchedAt: d.fetchedAt, queue: d.queue, receipts: d.receipts,
        foreman: d.foreman, sovereign: d.sovereign,
        openCount, p0Count: d.queue.ok ? d.queue.p0 : 0, error: null,
      });
    } catch (e) {
      // כנות-בכשל: הפנקס הקיים נשאר אבל מסומן כשגיאה — לעולם לא ירוק-מזויף
      set({ loaded: true, error: e instanceof Error ? e.message : 'unreachable' });
    }
  },
}));

let timer: ReturnType<typeof setInterval> | null = null;

/** סוקר את פנקס-ההכרעות; מחזיר פונקציית-עצירה */
export function startDecisionsBridge(intervalMs = 120_000): () => void {
  void useDecisions.getState().pull();
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void useDecisions.getState().pull(); }, intervalMs);
  return () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
}

/** גיל קריא לתצוגה מחותמת-זמן ISO */
export function ageLabel(iso: string | number | null | undefined): string | null {
  if (!iso) return null;
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (min < 1) return 'עכשיו';
  if (min < 60) return `לפני ${min} דק'`;
  const h = Math.round(min / 60);
  if (h < 24) return `לפני ${h} שע'`;
  return `לפני ${Math.round(h / 24)} ימים`;
}
