/**
 * /api/decisions-cycle — מחזור-הכרעות טיפוסי עם השפעה (A1). [T25]
 * ---------------------------------------------------------------------------
 * הפער-המדוד שלנו: "פנקס-ההכרעות קריא-בלבד — אין מחזור answer→side-effect→settle
 * עם השפעה". המסלול הזה הוא המחזור עצמו, בחוק-מנגני:
 *   question ──answer──▶ answered ──settle(קבלת-אפקט)──▶ settled ──reopen(בעלים)──▶ reopened
 * חוקי-המעבר נאכפים בשרת; כל-כתיבה עם אופטימיות-מקבילות על הגיט (Autonomy
 * state/app/decisions-cycle.json) + readback. אין-יישוב בלי-קבלת-אפקט (A1):
 * settle חייב receiptRef של האפקט — סגירה-בלי-ראיה נדחית.
 * כתיבה: ask/answer/settle/reopen — כולם דרך שער-הכוונות (A5); reopen = בעלים-בלבד.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { assertIntent } from '@/lib/intent-gate';
import { readJsonState, updateJsonState, simRequested } from '@/lib/git-state';

export const revalidate = 0;

const REPO = 'Autonomy';
const PATH = 'state/app/decisions-cycle.json';
const MAX_DECISIONS = 40; // חוק-רוטציה (A10)

// ─────────────── צורת-המצב ───────────────
export interface CycleAnswer {
  by: string;
  text: string;
  at: string;
  sideEffect?: string;
}
export interface CycleDecision {
  id: string;
  title: string;
  why?: string;
  kind: string;
  status: 'question' | 'answered' | 'settled' | 'reopened';
  openedAt: string;
  answers: CycleAnswer[];
  receiptRef?: string;
  /** A8: עלות-האפקט המדודה (USD) — נרשמת עם הקבלה, נספרת בפנקס-ההנדסה */
  costUsd?: number;
  settledAt?: string;
  reopenedAt?: string;
  reopenNote?: string;
}
interface CycleState {
  schema: string;
  updatedAt: string;
  decisions: CycleDecision[];
}

const FRESH_STATE: CycleState = { schema: 'decisions.cycle/1', updatedAt: '', decisions: [] };

async function ownerAuthed(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { hash } = await import('@/lib/owner-key');
  const s = await db.ownerSession.findFirst({ where: { tokenHash: hash(token), expiresAt: { gt: new Date() } } });
  return !!s;
}

// ─────────────── GET ───────────────
export async function GET(req: NextRequest) {
  const sim = simRequested(req.headers.get('x-sim') === '1');
  const st = await readJsonState<CycleState>(REPO, PATH, 'main', sim);
  const state = st.data ?? FRESH_STATE;
  const decisions = [...(state.decisions ?? [])].reverse(); // חדש-ראשון
  return NextResponse.json(
    {
      ok: st.ok,
      error: st.error,
      corrupt: st.corrupt,
      state: { ...state, decisions },
      health: {
        total: decisions.length,
        question: decisions.filter((d) => d.status === 'question').length,
        answered: decisions.filter((d) => d.status === 'answered').length,
        settled: decisions.filter((d) => d.status === 'settled').length,
        reopened: decisions.filter((d) => d.status === 'reopened').length,
      },
      fetchedAt: new Date().toISOString(),
    },
    { headers: { 'x-cycle-source': st.ok ? (sim ? 'sim' : 'git') : 'git-error' } },
  );
}

// ─────────────── POST — המחזור ───────────────
interface PostBody {
  action?: 'ask' | 'answer' | 'settle' | 'reopen';
  id?: string;
  title?: string;
  why?: string;
  kind?: string;
  by?: string;
  text?: string;
  sideEffect?: string;
  receiptRef?: string;
  costUsd?: number;
  reopenNote?: string;
}

const clean = (s: unknown, max: number): string => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-json' }, { status: 400 });
  }
  const action = body.action;
  const intentMap: Record<string, string> = {
    ask: 'decisions-cycle/ask',
    answer: 'decisions-cycle/answer',
    settle: 'decisions-cycle/settle',
    reopen: 'decisions-cycle/reopen',
  };
  const intent = action ? intentMap[action] : undefined;
  if (!action || !intent) {
    return NextResponse.json({ ok: false, error: 'חסר-פעולה חוקית (ask|answer|settle|reopen)' }, { status: 400 });
  }

  // A5: שער-הכוונות — לולאתיות + כוונה-מפורשת + קצב
  const gate = assertIntent(req, 'decisions-cycle', intent, 'agent');
  if (gate) return gate;

  // A6: תשתית-דמה — נעילה-כפולה (סביבה+בקשה); בלי-השניים = דחייה ולא גיט-אמת
  const sim = simRequested(req.headers.get('x-sim') === '1');
  if (req.headers.get('x-sim') === '1' && !sim) {
    return NextResponse.json({ ok: false, error: 'sim-disabled — נדרש SIM=1 בסביבת-השרת (fail-closed)' }, { status: 403 });
  }

  // reopen = הריבונות בלבד (פתיחת-מחדש של הכרעה-סגורה דורשת בעלים)
  if (action === 'reopen' && !(await ownerAuthed(req.headers.get('x-owner-token') ?? undefined))) {
    return NextResponse.json({ ok: false, error: 'reopen מותר לבעלים בלבד (נדרשת כניסת-מנהל)' }, { status: 401 });
  }

  const now = new Date().toISOString();

  const res = await updateJsonState<CycleState>(
    REPO,
    PATH,
    `decisions-cycle: ${action}${sim ? ' [sim]' : ''} [T26]`,
    (current) => {
      const state: CycleState = current?.schema === 'decisions.cycle/1' ? current : FRESH_STATE;
      const decisions = [...(state.decisions ?? [])];

      if (action === 'ask') {
        const title = clean(body.title, 120);
        if (title.length < 4) return { next: state, abort: { error: 'כותרת-שאלה חייבת להיות לפחות 4 תווים' } };
        const dec: CycleDecision = {
          id: `dec-${randomBytes(4).toString('hex')}`,
          title,
          why: clean(body.why, 300) || undefined,
          kind: clean(body.kind, 24) || 'ops',
          status: 'question',
          openedAt: now,
          answers: [],
        };
        // רוטציה: קודם נשמטת-ההכרעה-הישנה-הסגורה
        while (decisions.length >= MAX_DECISIONS) {
          const idx = decisions.findIndex((d) => d.status === 'settled');
          decisions.splice(idx >= 0 ? idx : 0, 1);
        }
        decisions.push(dec);
        return { next: { ...state, updatedAt: now, decisions } };
      }

      const id = clean(body.id, 40);
      const dec = decisions.find((d) => d.id === id);
      if (!dec) return { next: state, abort: { error: `הכרעה לא נמצאה (${id})` } };

      if (action === 'answer') {
        if (dec.status !== 'question' && dec.status !== 'reopened') {
          return { next: state, abort: { error: `מעבר לא-חוקי: answer דורש question|reopened, המצב ${dec.status}` } };
        }
        const text = clean(body.text, 600);
        if (text.length < 2) return { next: state, abort: { error: 'תשובה ריקה אסורה' } };
        dec.answers.push({
          by: clean(body.by, 40) || 'agent',
          text,
          at: now,
          sideEffect: clean(body.sideEffect, 300) || undefined,
        });
        dec.status = 'answered';
        return { next: { ...state, updatedAt: now, decisions } };
      }

      if (action === 'settle') {
        if (dec.status !== 'answered') {
          return { next: state, abort: { error: `מעבר לא-חוקי: settle דורש answered, המצב ${dec.status}` } };
        }
        // חוק-אפקט: אין-יישוב בלי-ראיה (A1 — done-only-via-receipt)
        const receiptRef = clean(body.receiptRef, 160);
        if (receiptRef.length < 8) {
          return { next: state, abort: { error: 'settle חייב receiptRef — אין-סגירה-בלי-קבלת-אפקט (מינימום 8 תווים)' } };
        }
        // A8: עלות-מדודה (אופציונלית) — מספר לא-שלילי, עד 2 ספרות-עשרוניות
        const cost = typeof body.costUsd === 'number' && Number.isFinite(body.costUsd) && body.costUsd >= 0
          ? Math.round(body.costUsd * 100) / 100
          : undefined;
        dec.receiptRef = receiptRef;
        if (cost !== undefined) dec.costUsd = cost;
        dec.status = 'settled';
        dec.settledAt = now;
        return { next: { ...state, updatedAt: now, decisions } };
      }

      // reopen
      if (dec.status !== 'settled') {
        return { next: state, abort: { error: `מעבר לא-חוקי: reopen דורש settled, המצב ${dec.status}` } };
      }
      dec.status = 'reopened';
      dec.reopenedAt = now;
      dec.reopenNote = clean(body.reopenNote, 300) || undefined;
      return { next: { ...state, updatedAt: now, decisions } };
    },
    'main',
    { sim },
  );

  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: res.error,
        conflict: res.conflict ?? undefined,
        readbackFailed: res.readbackFailed ?? undefined,
        current: res.conflict ? res.current : undefined,
      },
      { status: res.conflict ? 409 : res.error?.includes('לא נמצאה') ? 404 : res.error?.includes('מעבר לא-חוקי') || res.error?.includes('אסור') || res.error?.includes('חייב') || res.error?.includes('תווים') ? 400 : 502 },
    );
  }
  return NextResponse.json({ ok: true, action, commit: res.commit, blobSha: res.sha });
}
