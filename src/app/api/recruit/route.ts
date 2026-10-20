/**
 * /api/recruit — reads the office-recruit engine's live receipt from disk.
 * Source of truth: mini-services/office-recruit (:3041) → receipts/recruitment/live.json
 * Fail-honest: missing/absent receipt is reported as such — never invented.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

const LIVE = "/home/z/estate/FleetHQ/receipts/recruitment/live.json";

export async function GET() {
  try {
    const raw = await readFile(LIVE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return NextResponse.json(
      { ok: true, ...parsed },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "recruitment receipt unreadable",
        source: LIVE,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}
