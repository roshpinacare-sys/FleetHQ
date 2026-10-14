/**
 * /api/world-broadcast — השידור החי הקנוני של המשרד (T20).
 * ---------------------------------------------------------------------------
 * העולם המתמשך חי ב-Domain הציבורי (office/world-state.json) ומתקדם בענן
 * כל 10 דק' על ידי office-worldbeat — בלי שום תלות בסנדבוקס הזה. הנתיב
 * מביא את המראה ואת יומן-המשמרת, עם מטמון 60 שניות ו-stale-while-revalidate.
 * אין כאן המצאה — מה שהמראה לא מחזירה מדווח ככשל כנה.
 */
import { NextResponse } from 'next/server';
import { resolveGithubPat } from '@/lib/gh-pat';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.github.com/repos/roshpinacare-sys/Domain/contents/office/';

/**
 * חוק-משיכה (T20, נמדד): raw.githubusercontent מחזיר עותקי-קצה לא-עקביים
 * (שני מקורות קצה החזירו עולמות בפרשות-30 דק' בו-זמנית), וה-API האנונימי
 * מוגבל-מכסה מה-IP המשותף. המשיכה-האמיתית היא contents-API מאומת בצד-השרת —
 * תמיד התוכן הטרי, בלי מטמון-קצה. ה-PAT לעולם לא יוצא מהשרת.
 */
function pat(): string {
  // [T24] פותר-אסימון אחיד — צורה-תקינה או אין (אין ≠ אין-שידור; נפילה-לאנונימי)
  return resolveGithubPat();
}

async function fetchAuthRaw<T>(file: string, timeoutMs = 8000, asText = false): Promise<T | null> {
  try {
    const token = pat();
    if (token) {
      const res = await fetch(`${API_BASE}${file}?ref=main`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.raw',
          'User-Agent': 'office-broadcast/1',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (asText ? ((await res.text()) as unknown as T) : ((await res.json()) as T));
    }
    // [T24] נפילה-אנונימית: Domain ריפו-ציבורי — השידור חי גם בלי אסימון
    // (ידוע-ש-raw יכול להיות באיחור-קצה; עדיף-שידור-חי עם איחור קטן על שידור-מת)
    const raw = await fetch(`https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/${file}`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'office-broadcast/1' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!raw.ok) return null;
    if (asText) return (await raw.text()) as unknown as T;
    try {
      return (await raw.json()) as T;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

interface WorldAgent { id: string; state?: string; label?: string; activity?: string }
interface WorldState {
  v: number; engine?: string; t: number;
  meetingUntil?: number;
  agents?: WorldAgent[];
  events?: { ts: number; who: string; text: string }[];
}
interface JournalLine {
  at: string; advMin?: number; steps?: number; phase?: string;
  evs?: { at: string; who: string; text: string }[];
}

interface BroadcastPayload {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  world: WorldState | null;
  journal: { at: number; who: string; text: string }[];
}

/** יומן-הזנב (JSONL) מתיישר לאירועים אחרונים — עד 12 אירועים משלוש הפעימות האחרונות */
function flattenJournal(raw: string | null): { at: number; who: string; text: string }[] {
  if (!raw) return [];
  const out: { at: number; who: string; text: string }[] = [];
  const lines = raw.split('\n').filter(Boolean).slice(-3);
  for (const line of lines) {
    try {
      const j = JSON.parse(line) as JournalLine;
      for (const e of j.evs ?? []) {
        const at = Date.parse(e.at);
        if (Number.isFinite(at)) out.push({ at, who: e.who, text: e.text });
      }
    } catch { /* שורה פגומה — לא עוצרת את השידור */ }
  }
  return out.slice(-12);
}

let cache: { at: number; payload: BroadcastPayload } | null = null;
let inflight: Promise<BroadcastPayload> | null = null;

async function measure(): Promise<BroadcastPayload> {
  const [world, journalRaw] = await Promise.all([
    fetchAuthRaw<WorldState>('world-state.json'),
    fetchAuthRaw<string>('world-journal.jsonl', 8000, true),
  ]);
  return {
    ok: !!world,
    ...(world ? {} : { error: 'unavailable' }),
    fetchedAt: new Date().toISOString(),
    world,
    journal: flattenJournal(journalRaw),
  };
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) {
    return NextResponse.json(cache.payload);
  }
  // SWR — מראה ישנה מוצגת מיד בזמן שהמדידה הטרייה רצה ברקע
  if (cache && inflight) {
    return NextResponse.json(cache.payload);
  }
  if (!inflight) {
    inflight = measure().finally(() => { inflight = null; });
    const p = await inflight;
    cache = { at: Date.now(), payload: p };
  }
  return NextResponse.json(cache!.payload);
}
