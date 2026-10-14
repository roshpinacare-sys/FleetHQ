/**
 * /api/sessions — רישום-סשנים שורד-סנדבוקס (A12). [T25]
 * ---------------------------------------------------------------------------
 * הפער-המדוד: "שכבת-הסשן מתה עם הסנדבוקס — אין מזהי-סשן נשמרים והתאמה-מחדש".
 * המנגנון: לכל (מסילה, סוכן) מזהה-סשן אחד חי בגיט (Autonomy state/app/sessions.json).
 * כשהסנדבוקס מת וסוכן-חדש קם — הוא מתחבר-מחדש (reattach) אל אותו-מזהה ומונה-
 * ההתחברויות-מחדש נספר בגיט: ההמשכיות נמדדת, לא מוכרזת.
 * חוק-ההתחברות: סשן טרי (עד 12 שע') = reattach; אחרת סשן-חדש. שער-כוונות על-הכתיבה.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { assertIntent } from '@/lib/intent-gate';
import { readJsonState, updateJsonState } from '@/lib/git-state';

export const revalidate = 0;

const REPO = 'Autonomy';
const PATH = 'state/app/sessions.json';
const MAX_SESSIONS = 200; // חוק-רוטציה (A10)
const REATTACH_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface AgentSession {
  key: string; // lane/agent
  lane: string;
  agent: string;
  sessionId: string;
  startedAt: string;
  lastSeenAt: string;
  /** כמה פעמים הסנדבוקס מת והסשן הותאם-מחדש — המדידה של A12 */
  reattachments: number;
  host?: string;
}
interface SessionsState {
  schema: string;
  updatedAt: string;
  sessions: AgentSession[];
}

const FRESH: SessionsState = { schema: 'sessions.registry/1', updatedAt: '', sessions: [] };

// ─────────────── GET ───────────────
export async function GET() {
  const st = await readJsonState<SessionsState>(REPO, PATH);
  const state = st.data ?? FRESH;
  const sessions = [...(state.sessions ?? [])].sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
  return NextResponse.json({
    ok: st.ok,
    error: st.error,
    corrupt: st.corrupt,
    sessions,
    health: {
      total: sessions.length,
      reattached: sessions.reduce((n, s) => n + s.reattachments, 0),
      live12h: sessions.filter((s) => Date.now() - Date.parse(s.lastSeenAt) < REATTACH_WINDOW_MS).length,
    },
    fetchedAt: new Date().toISOString(),
  });
}

// ─────────────── POST — attach/reattach ───────────────
export async function POST(req: NextRequest) {
  const gate = assertIntent(req, 'sessions', 'sessions/attach', 'agent');
  if (gate) return gate;

  let body: { lane?: string; agent?: string; host?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-json' }, { status: 400 });
  }
  const clean = (s: unknown, max: number): string => String(s ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, max);
  const lane = clean(body.lane, 32);
  const agent = clean(body.agent, 32);
  if (!lane || !agent) {
    return NextResponse.json({ ok: false, error: 'חובה lane ו-agent (תווים מותרים: A-Za-z0-9._-)' }, { status: 400 });
  }
  const key = `${lane}/${agent}`;
  const now = new Date().toISOString();

  const res = await updateJsonState<SessionsState>(
    REPO,
    PATH,
    `sessions: attach ${key} [T25]`,
    (current) => {
      const state: SessionsState = current?.schema === 'sessions.registry/1' ? current : FRESH;
      const sessions = [...(state.sessions ?? [])];
      const existing = sessions.find((s) => s.key === key);
      if (existing && Date.now() - Date.parse(existing.lastSeenAt) < REATTACH_WINDOW_MS) {
        // A12: ההתאמה-מחדש — אותו-מזהה, מונה-עולה
        existing.reattachments += 1;
        existing.lastSeenAt = now;
        if (body.host) existing.host = String(body.host).slice(0, 64);
        return { next: { ...state, updatedAt: now, sessions } };
      }
      const fresh: AgentSession = {
        key,
        lane,
        agent,
        sessionId: `sess-${randomBytes(4).toString('hex')}`,
        startedAt: now,
        lastSeenAt: now,
        reattachments: 0,
        host: body.host ? String(body.host).slice(0, 64) : undefined,
      };
      const trimmed = sessions.filter((s) => s.key !== key);
      while (trimmed.length >= MAX_SESSIONS) trimmed.shift();
      trimmed.push(fresh);
      return { next: { ...state, updatedAt: now, sessions: trimmed } };
    },
  );

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error, conflict: res.conflict ?? undefined }, { status: res.conflict ? 409 : 502 });
  }
  // שליפת-ה-meta מתוך ה-mutate — מהמצב-החדש בגיט (readback כבר אימת)
  const st = await readJsonState<SessionsState>(REPO, PATH);
  const mine = (st.data?.sessions ?? []).find((s) => s.key === key);
  return NextResponse.json({ ok: true, commit: res.commit, session: mine ?? null });
}
