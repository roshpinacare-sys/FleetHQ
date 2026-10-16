/**
 * /api/roast — רוסט agentcraft + פתרונות-חריפים. [T24-a]
 * ---------------------------------------------------------------------------
 * מקור: הרוסט-המדוד של blendi-remade/agentcraft (קלון מלא 61.5K LOC,
 * 546/548 בדיקות-נמדדו, חור-מדיניות נתפס) — t24/agentcraft-verdict.json.
 * העמוד המלא: t24/agentcraft-roast.md
 */
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

let cache: { at: number; body: unknown } | null = null;
const TTL = 300_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body);
  let v: Record<string, unknown> | null = null;
  let error: string | null = null;
  try {
    const p = path.join(process.cwd(), 'src', 'data', 'agentcraft-verdict.json');
    v = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch (e) {
    error = `כשל-קריאת-אסמכתא (${String(e).slice(0, 50)})`;
  }
  const body = {
    ok: !!v,
    error,
    repo: v?.repo ?? null,
    loc: v?.loc ?? null,
    measuredTests: v?.measuredTests ?? null,
    verdictSummary: v?.verdictSummary ?? null,
    theirGaps: v?.theirGaps ?? [],
    ourGaps: v?.ourGaps ?? [],
    adoptables: v?.adoptables ?? [],
    notAdopt: v?.notAdopt ?? [],
    servedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
