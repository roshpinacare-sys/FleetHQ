/**
 * /api/crew-closure — מה נסגר עם כל-אחת מהצוות. [T24-b]
 * ---------------------------------------------------------------------------
 * מקור: מדידת-T24-b (t24/crew-closure.json — 11 מקורות-גיט ציבוריים, md5-כפול).
 * העותק-המקומי הוא עדות-מהודקת; המדידה-הקנונית רצה-בענן. אין-המצאה בין-מדידות.
 */
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

let cache: { at: number; body: unknown } | null = null;
const TTL = 120_000;

interface CrewMember {
  id: string;
  heName: string;
  role: string;
  currentlyDoing: string;
  workingNow: boolean;
  workingNowEvidence: string;
  closedLast24h: Array<{ what: string; evidence?: string; when?: string }>;
  openOrStuck: Array<{ what: string; why: string }>;
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body);
  let data: unknown = null;
  let error: string | null = null;
  try {
    const p = path.join(process.cwd(), 'src', 'data', 'crew-closure.json');
    data = JSON.parse(readFileSync(p, 'utf-8'));
  } catch (e) {
    error = `כשל-קריאת-אסמכתא (${String(e).slice(0, 50)})`;
  }
  const d = data as { generatedAt?: string; crew?: CrewMember[]; unownedOpenOrders?: unknown[]; verdictSummary?: string | Record<string, unknown> } | null;
  const vs = d?.verdictSummary;
  const verdictText =
    typeof vs === 'string'
      ? vs
      : vs && typeof vs === 'object'
        ? String((vs as { bottomLine?: string }).bottomLine ?? JSON.stringify(vs).slice(0, 300))
        : null;
  const body = {
    ok: !!d,
    error,
    measuredAt: d?.generatedAt ?? null,
    ageMin: d?.generatedAt ? Math.round((Date.now() - Date.parse(d.generatedAt)) / 60000) : null,
    crew: (d?.crew ?? []).map((c) => ({
      id: c.id,
      heName: c.heName,
      role: c.role,
      currentlyDoing: c.currentlyDoing,
      workingNow: c.workingNow,
      evidence: c.workingNowEvidence,
      closed24h: c.closedLast24h?.length ?? 0,
      closedItems: (c.closedLast24h ?? []).slice(0, 4),
      floating: c.openOrStuck ?? [],
    })),
    unownedOpenOrders: d?.unownedOpenOrders ?? [],
    verdict: verdictText,
    servedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
