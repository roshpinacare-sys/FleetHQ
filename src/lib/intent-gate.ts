/**
 * intent-gate.ts — שער-כוונות לולאתי (A5). [T25]
 * ---------------------------------------------------------------------------
 * הרוסט המדוד שלנו: "API-מקומיים פתוחים ללא שער" + אימוץ-A5: "חוק-לולאתי/שער-כוונות
 * בלי לאמץ 'לוקל=אמון'". המנגנון הזה הוא החוק:
 *  · לולאתיות: בקשות-מוטציה חייבות להגיע מאותו-מקור (sec-fetch-site same-origin/none)
 *    — פנייה-חוצת-מקור נדחית 403 בכנות.
 *  · כוונה-מפורשת (מסילות-סוכן): חובה כותרת x-intent שתואמת את-הכוונה-הצפויה —
 *    סוכן שלא יודע *למה* הוא קורא, לא קורא.
 *  · דלי-אסימונים: הגבלת-קצב לכל (IP, מסילה) — ברסט מוגבל, לא-הצפה.
 * אין fail-open: ערפול-כותרות = דחייה. כל-דחייה נושאת סיבה כנה ומדידה.
 */
import { NextResponse } from 'next/server';

export type GateMode = 'browser' | 'agent';

export interface GateVerdict {
  ok: boolean;
  status?: number;
  reason?: string;
  http?: number;
}

const BUCKET_CAPACITY = 20; // ברסט
const REFILL_PER_MIN = 30; // אסימונים לדקה

interface Bucket {
  tokens: number;
  at: number;
}

const g = globalThis as unknown as { __intentBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__intentBuckets ??= new Map());

function clientKey(req: Request, route: string): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'loopback';
  return `${route}:${ip}`;
}

/** דלי-אסימונים — מחזיר פסק: עבר / נדחה-קצב */
function rateVerdict(key: string): GateVerdict {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: BUCKET_CAPACITY, at: now };
  const refill = ((now - b.at) / 60_000) * REFILL_PER_MIN;
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + refill);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, status: 429, reason: 'rate-limited (דלי-אסימונים ריק — המתן רגע)', http: 429 };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true };
}

function loopbackVerdict(req: Request): GateVerdict {
  const site = req.headers.get('sec-fetch-site');
  // none = קלט ישיר (curl/סוכן); same-origin = הדף שלנו. אחרת — פנייה-חוצת-מקור.
  if (site && site !== 'same-origin' && site !== 'none') {
    return { ok: false, status: 403, reason: `cross-site blocked (sec-fetch-site=${site}) — חוק-הלולאה`, http: 403 };
  }
  return { ok: true };
}

/**
 * שער-הכוונות. מצב-דפדפן: לולאתיות + קצב.
 * מצב-סוכן: לולאתיות + כוונה-מפורשת + קצב.
 * החזר: NextResponse דוחה — או null כשהשער עובר.
 */
export function assertIntent(req: Request, route: string, expectedIntent: string, mode: GateMode = 'agent'): NextResponse | null {
  const loop = loopbackVerdict(req);
  if (!loop.ok) {
    return NextResponse.json({ ok: false, error: 'intent-gate', reason: loop.reason }, { status: loop.http ?? 403 });
  }
  if (mode === 'agent') {
    const intent = (req.headers.get('x-intent') ?? '').trim();
    if (!intent) {
      return NextResponse.json(
        { ok: false, error: 'intent-gate', reason: `נדרשת כותרת x-intent: "${expectedIntent}" — אין-קריאות-חסרות-כוונה` },
        { status: 403 },
      );
    }
    if (intent !== expectedIntent) {
      return NextResponse.json(
        { ok: false, error: 'intent-gate', reason: `כוונה שגויה (${intent}) — הכוונה-הצפויה: ${expectedIntent}` },
        { status: 403 },
      );
    }
  }
  const rate = rateVerdict(clientKey(req, route));
  if (!rate.ok) {
    return NextResponse.json({ ok: false, error: 'intent-gate', reason: rate.reason }, { status: rate.http ?? 429 });
  }
  return null;
}
