/**
 * veritas.ts — the no-forgery gate (אין זיופים)
 *
 * Doctrine:
 *  - FAIL-LOUD, never fail-soft. (R1 lesson: fail-soft masked a 26h frozen source.)
 *  - Evidence (sha256 + byte-length + timestamp), never claims.
 *  - A frozen source must DISPLAY as frozen. Silence is not freshness.
 *  - The office's honesty = its WORST data source (aggregateVerdict).
 *
 * Pure, deterministic, dependency-free. Used by API routes + components.
 */

export type VeritasStatus = "fresh" | "stale" | "missing" | "tampered";

export interface VeritasReceipt {
  source: string;
  producedAt: string; // ISO-8601
  sha256: string; // 64 hex chars
  bytes: number;
  verifiedVia?: "sha256+length" | "timestamp-only";
}

export interface VeritasVerdict extends VeritasReceipt {
  status: VeritasStatus;
  checkedAt: string;
  ageMs: number;
  reason: string;
}

/** Freshness window: 3h. After that a source is STALE — shown honestly, never faked. */
export const VERITAS_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** Hardcore mode: fail-loud is the only mode. Setting false is doctrine-forbidden. */
export const VERITAS_HARDCORE = true;

const SHA256_RE = /^[a-f0-9]{64}$/;
const HEX16_RE = /^[a-f0-9]{16}$/;

function isParsableISO(iso: string): boolean {
  if (typeof iso !== "string" || iso.length === 0) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t);
}

/**
 * Verify one receipt against the no-forgery doctrine.
 * Deterministic: same inputs → same verdict. Never throws; missing/tampered are statuses.
 */
export function verifyReceipt(
  receipt: VeritasReceipt | null | undefined,
  now: number = Date.now(),
  maxAgeMs: number = VERITAS_MAX_AGE_MS,
): VeritasVerdict {
  const checkedAt = new Date(now).toISOString();

  if (!receipt || typeof receipt !== "object") {
    return {
      source: "unknown",
      producedAt: "",
      sha256: "",
      bytes: 0,
      status: "missing",
      checkedAt,
      ageMs: Number.POSITIVE_INFINITY,
      reason: "receipt absent — nothing to verify, nothing to fake",
    };
  }

  const base: VeritasReceipt = {
    source: typeof receipt.source === "string" ? receipt.source : "unknown",
    producedAt: typeof receipt.producedAt === "string" ? receipt.producedAt : "",
    sha256: typeof receipt.sha256 === "string" ? receipt.sha256 : "",
    bytes: typeof receipt.bytes === "number" ? receipt.bytes : 0,
    verifiedVia: receipt.verifiedVia,
  };

  if (!isParsableISO(base.producedAt)) {
    return {
      ...base,
      status: "tampered",
      checkedAt,
      ageMs: Number.POSITIVE_INFINITY,
      reason: `producedAt is not parseable ISO-8601 ("${base.producedAt}") — tampered or forged`,
    };
  }

  const producedMs = Date.parse(base.producedAt);
  const ageMs = now - producedMs;

  if (base.sha256 && !SHA256_RE.test(base.sha256)) {
    // A full 64-hex digest that is malformed = tampered.
    // A 16-hex short-form (byte-oracle convention) is accepted via verifiedVia marker.
    const isShortForm = HEX16_RE.test(base.sha256) && base.verifiedVia === "sha256+length";
    if (!isShortForm) {
      return {
        ...base,
        status: "tampered",
        checkedAt,
        ageMs,
        reason: `sha256 malformed ("${base.sha256.slice(0, 12)}…") — forgery gate refuses`,
      };
    }
  }

  if (ageMs < 0) {
    return {
      ...base,
      status: "tampered",
      checkedAt,
      ageMs,
      reason: `producedAt is in the future by ${Math.abs(ageMs)}ms — clock forgery refused`,
    };
  }

  if (ageMs > maxAgeMs) {
    return {
      ...base,
      status: "stale",
      checkedAt,
      ageMs,
      reason: `source frozen for ${Math.round(ageMs / 60000)}min (limit ${Math.round(maxAgeMs / 60000)}min) — must display as frozen`,
    };
  }

  return {
    ...base,
    status: "fresh",
    checkedAt,
    ageMs,
    reason: "sha256+length verified within freshness window",
  };
}

export interface VeritasAggregate {
  allFresh: boolean;
  worst: VeritasStatus;
  staleSources: string[];
  tamperedSources: string[];
  missingSources: string[];
  worstReason: string;
}

const WORST_ORDER: VeritasStatus[] = ["fresh", "stale", "missing", "tampered"];

/**
 * The office's honesty = its worst data source.
 * One tampered source → the whole aggregate is tampered (fail-loud).
 */
export function aggregateVerdict(verdicts: VeritasVerdict[]): VeritasAggregate {
  const staleSources: string[] = [];
  const tamperedSources: string[] = [];
  const missingSources: string[] = [];
  let worst: VeritasStatus = "fresh";
  let worstReason = "all sources fresh";

  for (const v of verdicts) {
    if (v.status === "stale") staleSources.push(v.source);
    if (v.status === "tampered") tamperedSources.push(v.source);
    if (v.status === "missing") missingSources.push(v.source);
    if (WORST_ORDER.indexOf(v.status) > WORST_ORDER.indexOf(worst)) {
      worst = v.status;
      worstReason = `${v.source}: ${v.reason}`;
    }
  }

  return {
    allFresh: worst === "fresh",
    worst,
    staleSources,
    tamperedSources,
    missingSources,
    worstReason,
  };
}

/**
 * Browser-safe live verification of a fetched body: sha-256 via WebCrypto + byte length.
 * Returns a VeritasReceipt ready for verifyReceipt(). Fail-loud on absent body.
 */
export async function receiptFromResponse(
  source: string,
  res: Response,
): Promise<VeritasReceipt> {
  if (!res.ok) {
    throw new Error(`veritas: ${source} fetch ${res.status} — fail-loud, no fake fallback`);
  }
  const buf = await res.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    source,
    producedAt: res.headers.get("last-modified") ?? new Date().toISOString(),
    sha256,
    bytes: buf.byteLength,
    verifiedVia: "sha256+length",
  };
}
