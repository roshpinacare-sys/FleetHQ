import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';

/**
 * צ'אט-המנהל (T17) — ערוץ-הפעלה-ריבוני.
 * הוראת-מנהל = נרשמת-על-הגיט של הבעלים (Sandbox ops/sovereign/OWNER-CHANNEL/inbox.jsonl,
 * append-bounded 60) + הצתה-מיידית של המכריע/הסורק לפי-בקשה. המכריע צורך-את-התיבה (D0).
 * ביטחון-מידע: הטוקן-בשרת hash-בלבד; אין-שמות-חשבונות-ואין-פרטי-התחברות בשום-פלט.
 */

import { resolveGithubPat } from '@/lib/gh-pat';

const GH_API = 'https://api.github.com';
const ORG = 'roshpinacare-sys';
const REPO = 'Sandbox'; // התיבה-חיה — אומת-חי (contents API 200, inbox.jsonl 19KB)
const PATH = 'ops/sovereign/OWNER-CHANNEL/inbox.jsonl';
const BOUND = 60;

function pat(): string {
  // [T24] פותר-אסימון אחיד: צורה-תקינה או אין — האסימון חי-מקומית-בלבד
  return resolveGithubPat();
}

async function gh(method: string, path: string, payload?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${GH_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'owner-channel/1',
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  return { status: res.status, body };
}

async function appendInbox(line: string): Promise<{ ok: boolean; sha?: string; error?: string }> {
  if (!pat()) return { ok: false, error: 'אין-אמצעי-פרסום-בשרת (PAT חסר)' };
  const got = await gh('GET', `/repos/${ORG}/${REPO}/contents/${PATH}?ref=main`);
  let existing = '';
  let sha: string | undefined;
  if (got.status === 200) {
    sha = (got.body as { sha?: string }).sha;
    existing = Buffer.from((got.body.content as string) ?? '', 'base64').toString('utf-8');
  } else if (got.status !== 404) {
    return { ok: false, error: `קריאת-התיבה נכשלה (${got.status})` };
  }
  const lines = [...existing.split('\n').filter((l) => l.trim()), line].slice(-BOUND);
  const content = Buffer.from(lines.join('\n') + '\n', 'utf-8').toString('base64');
  const put = await gh('PUT', `/repos/${ORG}/${REPO}/contents/${PATH}`, {
    message: `owner-directive: ${new Date().toISOString()} (office chat) [T17]`,
    content,
    ...(sha ? { sha } : {}),
  });
  if (put.status !== 200 && put.status !== 201) {
    return { ok: false, error: `פרסום-התיבה נכשל (${put.status})` };
  }
  // readback — אנטי-זיופים
  const rb = await gh('GET', `/repos/${ORG}/${REPO}/contents/${PATH}?ref=main`);
  const back = Buffer.from(((rb.body?.content as string) ?? ''), 'base64').toString('utf-8');
  if (!back.includes(line)) return { ok: false, error: 'readback-נכשל — ההוראה לא אומתה-על-הגיט' };
  return { ok: true, sha: ((put.body as { commit?: { sha?: string } }).commit?.sha as string | undefined)?.slice(0, 9) };
}

async function ignite(event: string): Promise<{ ok: boolean; http?: number; error?: string }> {
  if (!pat()) return { ok: false, error: 'אין-אמצעי-הצתה-בשרת' };
  const wf = event === 'value-scan-tick' ? 'value-scan.yml' : 'sovereign-decider.yml';
  // נתיב-מוכח-חי: workflow_dispatch (repository_dispatch מתקבל-204-אך-לא-תמיד-מתממש-בריפו-זה)
  const res = await fetch(`https://api.github.com/repos/${ORG}/${REPO}/actions/workflows/${wf}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat()}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'owner-channel/1',
    },
    body: JSON.stringify({ ref: 'main' }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 204) return { ok: true, http: 204 };
  // fallback: repository_dispatch (המפעיל-הפנימי משתמש-בו)
  const res2 = await fetch(`https://api.github.com/repos/${ORG}/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat()}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'owner-channel/1',
    },
    body: JSON.stringify({ event_type: event, client_payload: { from: 'owner-chat' } }),
    signal: AbortSignal.timeout(15000),
  });
  return { ok: res2.status === 204, http: res2.status, error: res2.status === 204 ? undefined : `http ${res2.status}` };
}

async function authed(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  // חייב-להיות זהה-ל-hash של owner-gate (אותו-pepper — מקור-אמת אחד: owner-key.ts)
  const { hash } = await import('@/lib/owner-key');
  const h = hash(token);
  const s = await db.ownerSession.findFirst({ where: { tokenHash: h, expiresAt: { gt: new Date() } } });
  return !!s;
}

export async function GET(req: Request) {
  try {
    // חוק-חדש (T19): קריאת-ההיסטוריה מחייבת-כניסת-מנהל — אפס-דליפה לאורחים.
    // בלי-טוקן תקף מוחזר 401 ולא מוחזר אף-תוכן (fail-closed).
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? req.headers.get('x-owner-token') ?? undefined;
    if (!(await authed(token))) {
      return NextResponse.json({ ok: false, error: 'נדרשת כניסת-מנהל' }, { status: 401 });
    }
    const msgs = await db.ownerMsg.findMany({ orderBy: { createdAt: 'asc' }, take: 60 });
    return NextResponse.json({ ok: true, messages: msgs });
  } catch {
    return NextResponse.json({ ok: false, error: 'chat-unavailable' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: { token?: string; text?: string; ignite?: boolean | string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-json' }, { status: 400 });
  }
  if (!(await authed(body.token))) {
    return NextResponse.json({ ok: false, error: 'נדרשת כניסת-מנהל' }, { status: 401 });
  }
  const text = (body.text ?? '').trim().slice(0, 600);
  const igniteRaw = body.ignite;
  const doIgnite = igniteRaw === true || igniteRaw === 'decider' || igniteRaw === 'scan' || igniteRaw === true.toString();
  if (!text) {
    return NextResponse.json({ ok: false, error: 'הוראה ריקה' }, { status: 400 });
  }
  try {
    await db.ownerMsg.create({ data: { role: 'owner', text } });
    const push = await appendInbox(
      JSON.stringify({ at: new Date().toISOString(), text, source: 'office-chat', kind: body.kind ?? 'directive' }),
    );
    if (!push.ok) {
      await db.ownerMsg.create({
        data: { role: 'system', text: `⚠️ ההוראה לא נרשמה-על-הגיט: ${push.error} — fail-closed, אין-הצגת-הצלחה-שקרית` },
      });
      return NextResponse.json({ ok: false, error: push.error }, { status: 502 });
    }
    let igniteNote = '';
    if (doIgnite) {
      const event = igniteRaw === 'scan' ? 'value-scan-tick' : 'sovereign-decider-tick';
      const ig = await ignite(event);
      igniteNote = ig.ok
        ? ' · הוצתה-פעימה-מיידית'
        : ` · ההצתה-המיידית נכשלה (${ig.http}) — המכריע יצרוך-בפעימה-הבאה`;
    }
    await db.ownerMsg.create({
      data: {
        role: 'system',
        text: `✅ ההוראה נרשמה-על-הגיט שלך (ops/sovereign/OWNER-CHANNEL${push.sha ? ` · commit ${push.sha}` : ''})${igniteNote} — הריבונות צורכת-אותה ומדווחת בהכרעות`,
      },
    });
    const msgs = await db.ownerMsg.findMany({ orderBy: { createdAt: 'asc' }, take: 60 });
    return NextResponse.json({ ok: true, messages: msgs });
  } catch {
    return NextResponse.json({ ok: false, error: 'chat-error' }, { status: 500 });
  }
}
