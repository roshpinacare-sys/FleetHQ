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

async function verifyFile(source: string, path: string): Promise<VeritasVerdict> {
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
  return verifyReceipt({ source, producedAt, sha256, bytes: buf.length });
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
  const sources: Array<{ source: string; path: string }> = [
    { source: "fresh-oracle/latest.json", path: join(RECEIPTS, "fresh-oracle", "latest.json") },
    { source: "recruitment/live.json", path: join(RECEIPTS, "recruitment", "live.json") },
    { source: "office-state-mirror.json", path: join(RECEIPTS, "office-state-mirror.json") },
    { source: "boot-verify.json", path: join(RECEIPTS, "boot-verify.json") },
    // grid + money sentinel — the profitability lane under the gate's eye (Domain/dex)
    { source: "dex/grid.json", path: "/home/z/estate/Domain/dex/grid.json" },
    { source: "dex/money.json", path: "/home/z/estate/Domain/dex/money.json" },
  ];

  // office-ci: latest receipt file
  const ciLatest = await latestIn(join(RECEIPTS, "office-ci"));
  if (ciLatest) {
    sources.push({ source: `office-ci/${ciLatest}`, path: join(RECEIPTS, "office-ci", ciLatest) });
  }

  const verdicts: VeritasVerdict[] = [];
  for (const s of sources) {
    verdicts.push(await verifyFile(s.source, s.path));
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
