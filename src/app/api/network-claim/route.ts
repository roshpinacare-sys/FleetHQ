/**
 * /api/network-claim — ניתוב-פניות לריבונות (T23).
 * ---------------------------------------------------------------------------
 * הריבונות היא המפעיל: כל-פנייה שנכתבת כאן נרשמת מיד בגיט הקנוני
 * (Autonomy/state/selfhood/claims.jsonl) ומוכרעת במחזור-ה-selfhood הבא
 * (≤20 דק') על-ידי האוטונומיה עצמה — עם מוח fail-closed וחוקי-מדידה.
 * הקבלה = sha של ה-commit בגיט הציבורי (אמת-בלתי-תלויה בסנדבוקס).
 */
import { NextResponse } from 'next/server';
import { resolveGithubPat } from '@/lib/gh-pat';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.github.com/repos/roshpinacare-sys/Autonomy/contents/';
const CLAIMS_PATH = 'state/selfhood/claims.jsonl';

function pat(): string {
  // [T24] פותר-אסימון אחיד: צורה-תקינה או אין — אין-אסימון = fail-closed כן, בלי 401-רעש
  return resolveGithubPat();
}

function headers(): Record<string, string> | null {
  const token = pat();
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'network-claim/1',
  };
}

export async function POST(req: Request) {
  const h = headers();
  if (!h) return NextResponse.json({ ok: false, error: 'אין-אמצעי-פרסום-בשרת (PAT חסר)' }, { status: 500 });

  let text = '';
  try {
    const body = (await req.json()) as { text?: unknown };
    text = String(body.text ?? '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'בקשה-לא-תקינה' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ ok: false, error: 'פנייה-ריקה' }, { status: 400 });
  if (text.length > 600) text = text.slice(0, 600);

  try {
    // 1) קריאת-הקובץ הקיים (לשרשור ללא-דריסה)
    const cur = await fetch(`${API_BASE}${CLAIMS_PATH}?ref=main`, {
      cache: 'no-store',
      headers: { ...h, Accept: 'application/vnd.github.raw' },
      signal: AbortSignal.timeout(8000),
    });
    const exists = cur.ok;
    const curTxt = exists ? (await cur.text()).trimEnd() : '';
    const shaRes = await fetch(`${API_BASE}${CLAIMS_PATH}?ref=main`, {
      cache: 'no-store',
      headers: h,
      signal: AbortSignal.timeout(8000),
    });
    const sha = shaRes.ok ? ((await shaRes.json()) as { sha?: string }).sha : undefined;

    // 2) השורה-החדשה (owner-claim — מנותב מהקונסולה של-הבעלים)
    const line = JSON.stringify({
      at: new Date().toISOString(),
      role: 'owner-claim',
      source: 'owner-app',
      text,
    });
    const nextTxt = (curTxt ? curTxt + '\n' : '') + line + '\n';

    // 3) דחיפה + קבלה
    const put = await fetch(`${API_BASE}${CLAIMS_PATH}`, {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({
        message: 'owner-claim: פנייה-מנותבת-מהקונסולה לריבונות (selfhood תכריע)',
        content: Buffer.from(nextTxt, 'utf8').toString('base64'),
        branch: 'main',
        ...(sha ? { sha } : {}),
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!put.ok) {
      const errTxt = await put.text();
      return NextResponse.json({ ok: false, error: `פרסום-נכשל (${put.status})`, detail: errTxt.slice(0, 160) }, { status: 502 });
    }
    const putJson = (await put.json()) as { content?: { sha?: string } };
    const commitSha = putJson.content?.sha ?? null;

    // 4) קריאה-חזרה (אמת)
    const back = await fetch(`${API_BASE}${CLAIMS_PATH}?ref=main`, {
      cache: 'no-store',
      headers: { ...h, Accept: 'application/vnd.github.raw' },
      signal: AbortSignal.timeout(8000),
    });
    const backTxt = back.ok ? await back.text() : '';
    const verified = backTxt.includes(line.slice(0, 80));

    return NextResponse.json({ ok: true, commitSha, verified, nextCycle: '≤20 דק' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'כשל-רשת בפרסום-הפנייה', detail: String(e).slice(0, 120) }, { status: 502 });
  }
}
