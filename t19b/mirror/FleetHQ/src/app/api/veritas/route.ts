/**
 * /api/veritas — the no-forgery gate as a LIVE service.
 *
 * On every call it re-reads the estate's critical receipts FROM DISK,
 * computes their real sha256 + byte length, and runs the veritas verdict
 * (age vs 3h window, malformed hash = tampered, future timestamp = tampered).
 * The office's honesty = its WORST source (aggregateVerdict).
 *
 * Fail-loud: a missing receipt is status "missing" — never invented,
 * never silently dropped (R1 lesson: fail-soft masked a 26h frozen source).
 */
import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  verifyReceipt,
  aggregateVerdict,
  VERITAS_MAX_AGE_MS,
  type VeritasReceipt,
  type VeritasVerdict,
} from "@/lib/veritas";

export const dynamic = "force-dynamic";

const ROOT = "/home/z/estate/FleetHQ";
const RECEIPTS = join(ROOT, "receipts");

/** Time field candidates per source, in priority order. */
function pickTime(j: Record<string, unknown>): string {
  for (const k of [
    "producedAt",
    "generatedAt",
    "at",
    "timestamp",
    "checkedAt",
    "scannedAt",
    "savedAt",
    "capturedAt",
    "updatedAt",
    "publishedAt",
  ]) {
    const v = j[k];
    if (typeof v === "string" && Number.isFinite(Date.parse(v))) return v;
    // epoch-ms number form (e.g. office-state-mirror savedAt: 1791758134577)
    if (typeof v === "number" && v > 1_000_000_000_000 && v < 4_000_000_000_000) {
      return new Date(v).toISOString();
    }
  }
  return "";
}

async function verifyFile(
  source: string,
  path: string,
  maxAgeMs?: number,
): Promise<VeritasVerdict> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return verifyReceipt({ source, producedAt: "", sha256: "", bytes: 0 });
  }
  const buf = Buffer.from(raw, "utf8");
  const sha256 = createHash("sha256").update(buf).digest("hex");
  let producedAt = "";
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    producedAt = pickTime(j);
  } catch {
    producedAt = ""; // non-JSON receipt: no time claim → cannot prove freshness
  }
  if (!producedAt) {
    // File exists but claims no time — cannot prove freshness, cannot fake it.
    return verifyReceipt({ source, producedAt: "", sha256, bytes: buf.length });
  }
  return verifyReceipt({ source, producedAt, sha256, bytes: buf.length }, Date.now(), maxAgeMs);
}

async function latestIn(dir: string): Promise<string | null> {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
    return files.length ? files[files.length - 1] : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  // maxAgeMs per source = the PRODUCER's DECLARED cadence (calibration, not leniency:
  // a source on a measured daily beat is not "frozen" at 3h — the real age stays
  // fully visible in ageMs either way; a 3h gate on a daily producer just cries wolf
  // and drowns the real signals). Default stays VERITAS_MAX_AGE_MS (3h).
  const sources: Array<{ source: string; path: string; maxAgeMs?: number }> = [
    { source: "fresh-oracle/latest.json", path: join(RECEIPTS, "fresh-oracle", "latest.json") },
    { source: "recruitment/live.json", path: join(RECEIPTS, "recruitment", "live.json") },
    { source: "office-state-mirror.json", path: join(RECEIPTS, "office-state-mirror.json") },
    { source: "boot-verify.json", path: join(RECEIPTS, "boot-verify.json") },
    // grid + money sentinel — the profitability lane under the gate's eye (Domain/dex)
    // grid.json: producer grid-pulse (Console, keyless, cron 03:13/15:13 = 2×/day)
    //   + hourly dex-mirror → fleet's own opens-closer law for this exact file is
    //   slaMin 1800 (30h) — veritas aligned to the same declared law.
    { source: "dex/grid.json", path: "/home/z/estate/Domain/dex/grid.json", maxAgeMs: 30 * 60 * 60 * 1000 },
    // money.json: producer money-watch (Console, cron 33 */2 = every 2h) + hourly
    //   dex-mirror → worst chain ~3h + measured scheduler drift → 4h.
    { source: "dex/money.json", path: "/home/z/estate/Domain/dex/money.json", maxAgeMs: 4 * 60 * 60 * 1000 },
  ];

  // office-ci: latest receipt file
  const ciLatest = await latestIn(join(RECEIPTS, "office-ci"));
  if (ciLatest) {
    sources.push({ source: `office-ci/${ciLatest}`, path: join(RECEIPTS, "office-ci", ciLatest) });
  }

  const verdicts: VeritasVerdict[] = [];
  for (const s of sources) {
    verdicts.push(await verifyFile(s.source, s.path, s.maxAgeMs));
  }

  const aggregate = aggregateVerdict(verdicts);

  return NextResponse.json(
    {
      gate: "veritas",
      doctrine: "fail-loud; evidence (sha256+bytes+age) over claims; worst source defines honesty",
      maxAgeMs: VERITAS_MAX_AGE_MS,
      checkedAt: new Date(now).toISOString(),
      aggregate,
      verdicts,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
