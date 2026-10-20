/**
 * /api/queue-graph — גרף-התור החי (A3). [T26]
 * ---------------------------------------------------------------------------
 * GET בלבד — התור נמצא-בבעלות מסילת-ops-intake; האפליקציה מודדת ומציגה,
 * לא כותבת. כל-החוקים מהגרף (סדרות-פר-ריפו, חסימות, stale, chronic, עריריות,
 * סגירות-מוכחות) מחושבים ממקורות-גיט-אמת בקריאה-זו.
 */
import { NextResponse } from 'next/server';
import { buildQueueGraph } from '@/lib/queue-graph';

export const revalidate = 0;

export async function GET() {
  const graph = await buildQueueGraph();
  return NextResponse.json(graph, {
    headers: { 'x-queue-source': graph.ok ? 'git' : 'git-error' },
  });
}
