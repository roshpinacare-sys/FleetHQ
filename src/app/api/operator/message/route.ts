/**
 * /api/operator/message — the operator's command channel to the autonomy.
 *
 * POST (operator, token-gated): append a directive to office/state/operator-inbox.jsonl
 *   → the inbox is a receipted file the whole organism reads (recruit engine turns
 *   unread directives into a work role; CI pushes it; fleet loops see it on pull).
 *   This is how the operator steers the sovereignty — smartly, through the office chat,
 *   with a receipt for every word.
 *
 * GET (public): recent directives — the office is transparent by doctrine; directives
 *   are owner words and are shown as such. NOTE: the operator is advised (in UI) to
 *   write directives only — never secrets; the office is a public book.
 *
 * The key is never involved here (only the memory token). Nothing is echoed back.
 */
import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { verifyToken } from "@/lib/operator-session";

export const dynamic = "force-dynamic";

// repo-relative (process.cwd() = the Next app root) — never a host-pinned
// absolute path: the same image must run on the estate host and anywhere else
const INBOX = join(process.cwd(), "office", "state", "operator-inbox.jsonl");
const MAX_TEXT = 2000;

interface Directive {
  at: string;
  id: string;
  text: string;
  sha16: string;
}

async function readAll(): Promise<Directive[]> {
  try {
    const raw = await readFile(INBOX, "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        try {
          return JSON.parse(l) as Directive;
        } catch {
          return null;
        }
      })
      .filter((d): d is Directive => d !== null);
  } catch {
    return [];
  }
}

export async function GET() {
  const all = await readAll();
  return NextResponse.json(
    { ok: true, count: all.length, directives: all.slice(-20) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  let token = "";
  let text = "";
  try {
    const body = (await req.json()) as { token?: unknown; text?: unknown };
    if (typeof body.token === "string") token = body.token;
    if (typeof body.text === "string") text = body.text;
  } catch {
    return NextResponse.json({ ok: false, error: "bad-body" }, { status: 400 });
  }

  if (!verifyToken(token)) {
    return NextResponse.json(
      { ok: false, error: "operator-session-required" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  text = text.trim();
  if (!text || text.length > MAX_TEXT) {
    return NextResponse.json(
      { ok: false, error: `text required (1..${MAX_TEXT} chars)` },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const directive: Directive = {
    at: new Date().toISOString(),
    id: createHash("sha256").update(text + Date.now().toString()).digest("hex").slice(0, 12),
    text,
    sha16: createHash("sha256").update(text).digest("hex").slice(0, 16),
  };

  try {
    await mkdir(join(process.cwd(), "office", "state"), { recursive: true });
    await writeFile(INBOX, JSON.stringify(directive) + "\n", { flag: "a", encoding: "utf8" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "inbox-unwritable", detail: (e as Error).message },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true, receipt: { id: directive.id, at: directive.at, sha16: directive.sha16 } },
    { headers: { "cache-control": "no-store" } },
  );
}
