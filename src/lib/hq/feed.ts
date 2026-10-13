/**
 * feed.ts — גשר-המראה (snapshot-feed bridge, Task 11-a).
 * ---------------------------------------------------------------------------
 * כשהאפליקציה נפרסת בלי פורמן חי (חלון-הציבור / בייק), NEXT_PUBLIC_OFFICE_FEED
 * מצביע על עותק של יומן-הפורמן האמיתי (receipts/office-state-mirror.json —
 * היומן ש-office.ts עצמו כותב, scrubbed בגבול-הסודות). המודול הזה:
 * · טוען את היומן פעם אחת ומרענן כל שתי דקות;
 * · מזריק אותו דרך אותן פונקציות sync* ב-store שמטפלי-הסוקט משתמשים בהן —
 *   אין מיפוי-שני, אין מסלול-צד; החדר לא יודע מאין הגיעו הנתונים;
 * · מסמן כנות: feedMode='mirror' + savedAt + שגיאות כנות. אין כאן סימולציה
 *   ואין המצאה — שדה חסר נשאר ריק-כנה, לעולם לא ממולא.
 *
 * אם סוקט חי מתחבר במקביל (פריסת-מפעיל) — החי מנצח: המודול מפסיק למשוך
 * בזמן שהסוקט מחובר וחוזר למשוך כשהוא מתנתק (stopWhenLive).
 */
import type { Decision, Goal, Report, Task } from '@/components/agent-hq/types';
import { useHq, type FeedJournal } from './store';

/** נתיב יומן-המראה (מוטמע ב-build דרך NEXT_PUBLIC_OFFICE_FEED, למשל /office-state.json) */
export const OFFICE_FEED_PATH: string = process.env.NEXT_PUBLIC_OFFICE_FEED ?? '';
/** קצב-הרענון של יומן המראה — 2 דקות */
export const FEED_REFRESH_MS = 120_000;

/** צורת יומן-הפורמן (office.ts persistDurableWrite — מקור-אמת אחד) */
interface MirrorJournal {
  v: number;
  savedAt: number;
  nextId?: number;
  tasks?: Task[];
  taskAttempts?: Record<string, number>;
  reviewAttempts?: Record<string, number>;
  rescued?: string[];
  decisions?: Decision[];
  reports?: Report[];
  goal?: Goal;
}

function isTask(x: unknown): x is Task {
  return Boolean(x) && typeof x === 'object' && typeof (x as Task).id === 'string'
    && typeof (x as Task).title === 'string' && typeof (x as Task).status === 'string';
}

/** ספירת-יומן אמיתית — מדדי-עזר ל-HUD, null כשהשדה חסר (אף-פעם לא 0 מומצא) */
function journalOf(m: MirrorJournal): FeedJournal {
  const attempts = m.taskAttempts && typeof m.taskAttempts === 'object' ? m.taskAttempts : null;
  const rounds = m.reviewAttempts && typeof m.reviewAttempts === 'object' ? m.reviewAttempts : null;
  return {
    nextId: typeof m.nextId === 'number' ? m.nextId : null,
    attemptsTotal: attempts ? Object.values(attempts).filter((n) => typeof n === 'number').reduce((s, n) => s + n, 0) : null,
    rescuedCount: Array.isArray(m.rescued) ? m.rescued.filter((x) => typeof x === 'string').length : null,
    reviewRoundsTotal: rounds ? Object.values(rounds).filter((n) => typeof n === 'number').reduce((s, n) => s + n, 0) : null,
  };
}

/**
 * הזרקת יומן אמיתי אל ה-store — בדיוק בדרכי-הסוקט.
 * מיפוי נאמן לסמנטיקה של office.ts (מקור היומן):
 * · tasks → syncTask (upsert לפי id, בדיוק כמו אירוע 'task')
 * · decisions → syncDecision · reports → syncReport (היומן חדש-ראשון —
 *   מזריקים בסדר-הפוך כדי שה-store יישאר חדש-ראשון כמו מהסוקט)
 * · goal → syncGoal · taskAttempts/reviewAttempts/rescued/nextId → מדדי-HUD
 * · מה שאין ביומן (סוכנים/ספרים/לוגים) לא ממולא — ריק-כנה.
 */
export function injectMirrorJournal(m: unknown): { savedAt: number } {
  const j = m as MirrorJournal;
  if (!j || typeof j !== 'object' || j.v !== 1 || !Array.isArray(j.tasks)) {
    throw new Error('mirror journal invalid: expected {v:1, tasks:[…]} (office.ts durable schema)');
  }
  const st = useHq.getState();
  for (const t of j.tasks) if (isTask(t)) st.syncTask(t);
  for (const d of j.decisions ?? []) if (d && typeof d.id === 'string') st.syncDecision(d);
  // היומן חדש-ראשון (unshift ב-office.ts) — הזרקה מהישן-לחדש שומרת על סדר-הסוקט
  const reports = [...(j.reports ?? [])].reverse();
  for (const r of reports) if (r && typeof r.id === 'string') st.syncReport(r);
  if (j.goal && typeof j.goal.id === 'string') st.syncGoal(j.goal);
  // סטטוס כנה: זהו יומן אמיתי קפוא — לא 'live' ולא 'sim'
  const done = j.tasks.filter((t) => isTask(t) && t.status === 'done').length;
  st.syncStatus({
    backend: 'mirror',
    llmProvider: 'journal',
    message: {
      he: `מראה — מציאות נמדדה מ-${new Date(j.savedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
      en: `Mirror — measured reality from ${new Date(j.savedAt).toISOString()}`,
    },
    startedAt: typeof j.savedAt === 'number' ? j.savedAt : 0,
    opsDone: done,
  });
  st.setFeedMeta({
    mode: 'mirror',
    ready: true,
    savedAt: typeof j.savedAt === 'number' ? j.savedAt : null,
    error: null,
    journal: journalOf(j),
  });
  return { savedAt: j.savedAt };
}

/**
 * הפעלת-גשר המראה. מחזיר פונקציית-ביטול.
 * @param stopWhenLive פונקציה שמדווחת אם סוקט חי מחובר כרגע (החי מנצח —
 *        בזמן שהוא חי לא מושכים מהיומן).
 */
export function startMirrorFeed(stopWhenLive: () => boolean): () => void {
  if (!OFFICE_FEED_PATH) return () => {};
  const st = useHq.getState();
  st.setFeedMeta({ mode: 'mirror' }); // הצהרת-מסלול כנה מהרגע הראשון (טרם-נטען = בלי ready)
  let stopped = false;
  let pulling = false;
  const tick = async () => {
    if (stopped || pulling || stopWhenLive()) return;
    pulling = true;
    try {
      const res = await fetch(OFFICE_FEED_PATH, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} מ-${OFFICE_FEED_PATH}`);
      injectMirrorJournal(await res.json());
    } catch (e) {
      // כשל כנה — מוצג, לא מוסתר, והחדר ממשיך להציג את מה שכבר נטען
      useHq.getState().setFeedMeta({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      pulling = false;
    }
  };
  void tick();
  const iv = setInterval(() => void tick(), FEED_REFRESH_MS);
  return () => { stopped = true; clearInterval(iv); };
}
