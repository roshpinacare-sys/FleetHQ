/**
 * /api/network-self — מודעות-הרשת (T23): מה הרשת יודעת על עצמה, עכשיו.
 * ---------------------------------------------------------------------------
 * האיבר הקנוני חי ב-Autonomy/state/selfhood (ענן, כל-20-דק', בלי-תלות-בסנדבוקס):
 *   · self-check.json      — קבלת-הבדיקה-העצמית של האיבר (קריאה-חזרה לכל-קובץ)
 *   · capabilities.json    — מפת-יכולות נמדדת (איברים-שרצו, פידים, אתרים, חישוב)
 *   · journal.jsonl        — יומן-הגילויים (מה-הבעלים-בנה/שינה — הרשת שמה-לב)
 *   · claims-processed.jsonl — פניות-שהוכרעו-על-ידי-הריבונות
 * אין המצאה: אין-איבר/אין-נתונים → empty-state כן. ה-PAT לעולם לא יוצא מהשרת.
 */
import { NextResponse } from 'next/server';
import { resolveGithubPat } from '@/lib/gh-pat';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.github.com/repos/roshpinacare-sys/Autonomy/contents/';
const RAW_BASE = 'https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/';

function pat(): string {
  // [T24] פותר-אסימון אחיד: צורה-תקינה או אין (placeholder-ניקוי = אין, לא 401-רעש)
  return resolveGithubPat();
}

async function fetchAuthRaw(file: string, timeoutMs = 8000): Promise<string | null> {
  // [T24] חוק-מקור-כפול: Autonomy ריפו-ציבורי — אנונימי-raw קודם (לא-תלוי-אסימון),
  // ואם-נכשל מאומת-API (טריות-קצה). אין-אסימון ≠ אין-איבר.
  try {
    const res = await fetch(`${RAW_BASE}${file}`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'network-self/1' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return res.text();
  } catch {
    /* נופל-לאימות */
  }
  try {
    const token = pat();
    if (!token) return null;
    const res = await fetch(`${API_BASE}${file}?ref=main`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'network-self/1',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

function tailJsonl(txt: string | null, n: number): Array<Record<string, unknown>> {
  if (!txt) return [];
  return txt
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-n)
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return { raw: l.slice(0, 120) };
      }
    });
}

type SelfCheck = {
  allVerified?: boolean;
  at?: string;
  discoveries?: number;
  claimsProcessed?: number;
  brain?: string;
  durationMs?: number;
};
type Capabilities = {
  organs?: Array<{ repo: string; workflow: string; success7d: number; failure7d: number; lastSuccessAgeH: number | null; private: boolean }>;
  feeds?: Array<{ label: string; repo: string; alive: boolean; ageH: number | null }>;
  sites?: Array<{ url: string; status: number }>;
  compute?: { activePrivateWorkflows: string[]; publicOrgans: number };
  measuredAt?: string;
};

let cache: { at: number; body: unknown } | null = null;
const TTL = 90_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json(cache.body);
  }
  const [selfCheckTxt, capsTxt, journalTxt, claimsTxt] = await Promise.all([
    fetchAuthRaw('state/selfhood/self-check.json'),
    fetchAuthRaw('state/selfhood/capabilities.json'),
    fetchAuthRaw('state/selfhood/journal.jsonl'),
    fetchAuthRaw('state/selfhood/claims-processed.jsonl'),
  ]);
  const parse = <T,>(t: string | null): T | null => {
    if (!t) return null;
    try {
      return JSON.parse(t) as T;
    } catch {
      return null;
    }
  };
  const selfCheck = parse<SelfCheck>(selfCheckTxt);
  const caps = parse<Capabilities>(capsTxt);
  const organExists = !!(selfCheckTxt || capsTxt);
  // חוק-עצירת-הדימום: החריגה-המתועדת-היחידה = מערכת-Pages (pages-build-deployment)
  const rawPrivate = caps?.compute?.activePrivateWorkflows ?? [];
  const realPrivate = rawPrivate.filter((w) => !w.endsWith('/pages-build-deployment'));
  const pagesSystem = rawPrivate.length - realPrivate.length;
  const body = {
    organExists,
    reason: organExists ? null : 'איבר-העצמיות טרם-השלים מחזור-ראשון בענן (selfhood.yml)',
    selfCheck,
    summary: caps
      ? {
          measuredAt: caps.measuredAt ?? null,
          organsMeasured: caps.organs?.length ?? 0,
          feedsAlive: caps.feeds?.filter((f) => f.alive).length ?? 0,
          feedsTotal: caps.feeds?.length ?? 0,
          sitesOk: caps.sites?.filter((s) => s.status === 200).length ?? 0,
          sitesTotal: caps.sites?.length ?? 0,
          activePrivateWorkflows: realPrivate.length,
          pagesSystemWorkflows: pagesSystem,
          publicOrgans: caps.compute?.publicOrgans ?? null,
          topOrgans: (caps.organs ?? []).slice(0, 6),
          feeds: caps.feeds ?? [],
        }
      : null,
    discoveries: tailJsonl(journalTxt, 6).reverse(),
    claims: tailJsonl(claimsTxt, 4).reverse(),
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
