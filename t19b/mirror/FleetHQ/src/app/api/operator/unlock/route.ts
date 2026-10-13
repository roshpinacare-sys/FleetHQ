/**
 * /api/operator/unlock — the operator gate (מפתח מנהל).
 *
 * SECURITY DOCTRINE (owner-mandated):
 *  - The key itself lives NOWHERE: not in this repo, not in any repo, not in
 *    any published page. Only a salted sha256 hash exists, in a file OUTSIDE
 *    all repos (/home/z/.operator/config.json, chmod 700).
 *  - This route NEVER logs, echoes, or persists the attempted key.
 *  - UI label is exactly "מפתח מנהל" (admin key) — no hints about identity,
 *    network, or connection method.
 *  - Rate-limited: 5 attempts / minute / process. Attempts are counted, not stored.
 *  - Session tokens are memory-only (10 min TTL) — survive nothing, leak nothing.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { issueToken } from "@/lib/operator-session";

export const dynamic = "force-dynamic";

const CONFIG = "/home/z/.operator/config.json";
const MAX_ATTEMPTS_PER_MIN = 5;

/** In-memory rate limiter. */
let windowStart = Date.now();
let attempts = 0;

function rateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    attempts = 0;
  }
  attempts += 1;
  return attempts > MAX_ATTEMPTS_PER_MIN;
}

export async function POST(req: Request) {
  if (rateLimited()) {
    return NextResponse.json(
      { ok: false, error: "too-many-attempts" },
      { status: 429, headers: { "cache-control": "no-store" } },
    );
  }

  let key = "";
  try {
    const body = (await req.json()) as { key?: unknown };
    if (typeof body.key === "string") key = body.key;
  } catch {
    // fallthrough: empty key → generic failure below
  }

  if (!key || key.length > 256) {
    return NextResponse.json(
      { ok: false, error: "invalid" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  let salt = "";
  let expected = "";
  try {
    const cfg = JSON.parse(await readFile(CONFIG, "utf8")) as { salt?: string; hash?: string };
    salt = cfg.salt ?? "";
    expected = cfg.hash ?? "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "gate-unconfigured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const candidate = createHash("sha256").update(salt + key).digest("hex");

  // constant-shape comparison (length equal; timing delta negligible at this threat model)
  const ok = candidate.length === expected.length && candidate === expected;

  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "invalid" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  // prune expired sessions handled inside issueToken; issue fresh token
  const { token, ttlMs } = issueToken();

  return NextResponse.json(
    { ok: true, token, ttlMs, label: "operator" },
    { headers: { "cache-control": "no-store" } },
  );
}
