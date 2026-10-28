/**
 * /api/visitor-chat — פקידת-המבקרים של המשרד (צד-שרת בלבד). [T22]
 * ---------------------------------------------------------------------------
 * נועה, מזכירת המשרד: מדברת עם מבקרים, זוכרת את השיחות (זיכרון-אמת בבסיס-נתונים),
 * מסבירה מה קורה לפי מציאות-נמדדת בלבד, וכותבת תוכן לפי בקשה.
 * גבול-הסמכות שלה מפורש: אין לה גישה להפעלה בפועל — כל-בקשה תפעולית נרשמת
 * בפנקס-הפניות ומוסרת לריבונות לבחינה וסקירה. היא אינה מכריעה דבר.
 */
import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';
import { CREW_FALLBACK, EXPERTS } from '@/lib/hq/protocol';
import { assertIntent } from '@/lib/intent-gate';

export const revalidate = 0;

const HISTORY_WINDOW = 14;
const FACTS_WINDOW = 8;
/** קצב-הזיכרון: כל שלישית-הודעת-מבקר — הפקת-עובדות לזיכרון-המזכירה */
const FACTS_EVERY = 3;

// ─────────────── הקשר-משרד נמדד (הכל מקומי-זול, אפס רשת-כבדה) ───────────────
function jerusalemHour(): number {
  try {
    return parseInt(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false,
    }).format(new Date()), 10) % 24;
  } catch { return 10; }
}
function phaseOf(h: number): string {
  if (h >= 7 && h < 9) return 'פתיחת משמרת';
  if (h >= 9 && h < 12) return 'משמרת בוקר';
  if (h >= 12 && h < 13) return 'הפסקת צהריים';
  if (h >= 13 && h < 18) return 'משמרת צהריים';
  if (h >= 18 && h < 22) return 'סיכומי ערב';
  return 'משמרת לילה';
}

/** מקורות-האמת הציבוריים — עם-קאש שרת כדי שהמענה יישאר מהיר */
interface OfficeContext { phase: string; crew: string; openOrders: number; p0: number; capturedAt: string | null }
const g = globalThis as unknown as { __visitorCtx?: { at: number; v: OfficeContext } };

async function officeContext(): Promise<OfficeContext> {
  const cached = g.__visitorCtx;
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.v;
  const v: OfficeContext = { phase: phaseOf(jerusalemHour()), crew: '', openOrders: 0, p0: 0, capturedAt: null };
  try {
    const [state, queue] = await Promise.all([
      fetch('https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office/state/office-state.json', { signal: AbortSignal.timeout(5000) }),
      fetch('https://raw.githubusercontent.com/roshpinacare-sys/ops-intake/main/ops/QUEUE.json', { signal: AbortSignal.timeout(5000) }),
    ]);
    if (state.ok) {
      const d = (await state.json()) as { capturedAt?: string; agents?: { id: string; state: string; activity?: string; station?: string }[] };
      v.capturedAt = d.capturedAt ?? null;
      v.crew = (d.agents ?? []).map((a) => {
        const name = CREW_FALLBACK.find((c) => c.id === a.id)?.name.he ?? a.id;
        return `${name} (${EXPERTS[a.id]?.domain ?? 'מומחה'}) — ${a.activity || a.state}`;
      }).join(' · ');
    }
    if (queue.ok) {
      const d = (await queue.json()) as { orders?: { status: string; severity?: string }[] };
      const open = (d.orders ?? []).filter((o) => o.status === 'OPEN');
      v.openOrders = open.length;
      v.p0 = open.filter((o) => o.severity === 'P0').length;
    }
  } catch { /* כנות — ההקשר נשאר בסיסי והפקידה תגיד מה לא נמדד */ }
  g.__visitorCtx = { at: Date.now(), v };
  return v;
}

// ─────────────── ההנחיה — שפת-המשרד, גבולות-סמכות ───────────────
function systemPrompt(ctx: OfficeContext, facts: string[], visits: number): string {
  const crew = CREW_FALLBACK.map((c) => {
    const e = EXPERTS[c.id];
    return `${c.name.he} — ${c.title.he}, תחום: ${e?.domain ?? c.specialty.he}`;
  }).join(' · ');
  return [
    'את נועה, מזכירת המשרד של מפקדת-הצי — משרד סוכני אוטונומי שעובד בגיט.',
    'את מקבלת מבקרים בקבלה. כתבי עברית טבעית, זורמת ומקצועית, בלי מירכאות-קישוט, בלי נימוסים ריקים, בלי אמירות-שבח עצמי.',
    'את זוכרת את המבקר — זו הפגישה שלו עם המשרד, והנה מה שנשמר מהביקורים הקודמים.',
    '',
    'מה את עושה בעצמך:',
    '- מסבירה מה קורה במשרד וברשת לפי המציאות הנמדדת שלמטה בלבד — אסור להמציא מספר, שם או אירוע.',
    '- כותבת ומנסחת תוכן לפי בקשה — טיוטות, סיכומים, מיילים, טקסטים.',
    '- מתעדת פניות תפעוליות ומעבירה אותן לריבונות לבחינה וסקירה — בלי להתחייב בשם המשרד.',
    '',
    'גבול-הסמכות שלך — מפורש ובלי-יוצאים:',
    '- אין לך גישה להפעלה בפועל: אינך מריצה משימות, אינך נוגעת בכסף, אינך משנה דבר בגיט.',
    '- אם המבקר מבקש פעולה (להריץ, לתקן, לפרסם, להחליט, לבדוק משהו בפועל) — עני שתרשמי את הפנייה ותמסירי אותה לריבונות לבחינה, והשבי שהפנייה נרשמה.',
    '- אינך מכריעה החלטות ואינך מדברת בשם הריבונות.',
    '',
    `המציאות הנמדדת עכשיו: פאזת-משמרת ${ctx.phase}.`,
    ctx.crew ? `הצוות בשדה: ${ctx.crew}.` : 'מצב-הצוות מהמקור החי לא נענה כרגע — תגיד בכנות שהמדידה לא זמינה ברגע זה.',
    ctx.openOrders > 0
      ? `פנקס-ההכרעות: ${ctx.openOrders} סדרי-עבודה פתוחים (${ctx.p0} בדרגה-חמורה) — מוצגים בדוכן-ההחלטות במערב המשרד.`
      : 'פנקס-ההכרעות: אין סדרי-עבודה פתוחים ברגע זה.',
    '',
    `הצוות (תחומי-אחריות): ${crew}.`,
    'הערוץ-הריבוני (להחלטות-בעלים בלבד) נפתח מהצ\'אט-מנהל בפינת-המסך.',
    '',
    visits > 1 ? `המבקר הזה פוגש את המשרד בפעם ה-${visits}.` : 'זהו הביקור-הראשון של המבקר הזה במשרד.',
    facts.length ? `זיכרון-המזכירה על המבקר הזה: ${facts.join(' | ')}` : 'אין זיכרון קודם על המבקר הזה.',
    '',
    'תשובתך חייבת להיות JSON תקני בלבד, בלי טקסט-עוטף:',
    '{"reply": "המענה המלא למבקר", "routeToSovereignty": false, "requestSubject": ""}',
    'routeToSovereignty=true רק כשהמבקר ביקש פעולה אמיתית — אז requestSubject מנוסח בקצרה.',
  ].join('\n');
}

/** חילוץ-JSON סלחני מהמענה */
function parseReply(raw: string): { reply: string; routeToSovereignty: boolean; requestSubject: string } {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const m = /\{[\s\S]*\}/.exec(cleaned);
  if (m) {
    try {
      const d = JSON.parse(m[0]) as { reply?: string; routeToSovereignty?: boolean; requestSubject?: string };
      if (d.reply) return { reply: d.reply, routeToSovereignty: !!d.routeToSovereignty, requestSubject: d.requestSubject ?? '' };
    } catch { /* נופל-למטה */ }
  }
  return { reply: cleaned, routeToSovereignty: false, requestSubject: '' };
}

// ─────────────── GET — היסטוריית-ביקור ───────────────
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ ok: false, error: 'missing-session' }, { status: 400 });
  const session = await db.visitorSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 60 }, requests: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!session) return NextResponse.json({ ok: false, error: 'unknown-session' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    sessionId,
    visits: session.visits,
    messages: session.messages.map((m) => ({ role: m.role, text: m.text, createdAt: m.createdAt })),
    requests: session.requests.map((r) => ({ id: r.id, subject: r.subject, status: r.status, createdAt: r.createdAt })),
  });
}

// ─────────────── POST — שיחה עם הפקידה ───────────────
export async function POST(req: NextRequest) {
  try {
    // A5 [T25]: שער-הכוונות — דפדפן: לולאתיות + קצב (בלי-כוונה-מפורשת, זו-שיחת-אורח)
    const gate = assertIntent(req, 'visitor-chat', '', 'browser');
    if (gate) return gate;
    const body = (await req.json()) as { sessionId?: string; text?: string };
    const text = (body.text ?? '').trim().slice(0, 2000);
    if (!text) return NextResponse.json({ ok: false, error: 'empty' }, { status: 400 });

    // סשן-מבקר: קיים → מתעדכן; חדש → נפתח
    let session = body.sessionId
      ? await db.visitorSession.findUnique({ where: { id: body.sessionId } })
      : null;
    if (session) {
      const dayPassed = Date.now() - session.lastSeenAt.getTime() > 30 * 60_000;
      session = await db.visitorSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), ...(dayPassed ? { visits: { increment: 1 } } : {}) },
      });
    } else {
      session = await db.visitorSession.create({ data: {} });
    }

    await db.visitorMsg.create({ data: { sessionId: session.id, role: 'visitor', text } });

    // זיכרון-אמת: היסטוריית-שיחה + עובדות-מוצקות
    const [history, facts] = await Promise.all([
      db.visitorMsg.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'desc' }, take: HISTORY_WINDOW }),
      db.clerkFact.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'desc' }, take: FACTS_WINDOW }),
    ]);
    const ctx = await officeContext();

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt(ctx, facts.map((f) => f.fact).reverse(), session.visits) },
        ...history.reverse().map((m) => ({ role: m.role === 'visitor' ? ('user' as const) : ('assistant' as const), content: m.text })),
      ],
      thinking: { type: 'disabled' },
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = parseReply(raw);
    if (!parsed.reply) return NextResponse.json({ ok: false, error: 'empty-reply' }, { status: 502 });

    await db.visitorMsg.create({ data: { sessionId: session.id, role: 'clerk', text: parsed.reply } });

    // פנייה-תפעולית → פנקס-הפניות, מוסר לריבונות לבחינה וסקירה
    let routed: { id: string; subject: string } | null = null;
    if (parsed.routeToSovereignty && parsed.requestSubject) {
      const r = await db.visitorRequest.create({
        data: { sessionId: session.id, subject: parsed.requestSubject.slice(0, 300), detail: text.slice(0, 2000) },
      });
      routed = { id: r.id, subject: r.subject };
    }

    // זיכרון-מתמשך: כל שישית-הודעת-מבקר — הפקת-עובדות קצרות לשיחות-הבאות
    const visitorMsgCount = await db.visitorMsg.count({ where: { sessionId: session.id, role: 'visitor' } });
    if (visitorMsgCount % FACTS_EVERY === 0) {
      try {
        const all = await db.visitorMsg.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' }, take: 40 });
        const distill = await zai.chat.completions.create({
          messages: [
            { role: 'assistant', content: 'מתוך השיחה עם מבקר המשרד, הפק עד ארבע עובדות-זיכרון קצרות שיאפשרו למזכירה לזכור את המבקר בביקור-הבא (העדפות, נושאים חוזרים, מה נבקש). עברית, שורה-לכל-עובדה, בלי מירכאות-קישוט. אם אין מה לזכור — החזר שורה-ריקה.' },
            { role: 'user', content: all.map((m) => `${m.role === 'visitor' ? 'מבקר' : 'מזכירה'}: ${m.text}`).join('\n') },
          ],
          thinking: { type: 'disabled' },
        });
        const lines = (distill.choices[0]?.message?.content ?? '').split('\n').map((l: string) => l.replace(/^[-•\d.\s]+/, '').trim()).filter((l: string) => l.length > 6).slice(0, 4);
        const existing = new Set(facts.map((f) => f.fact));
        for (const fact of lines) {
          if (!existing.has(fact)) await db.clerkFact.create({ data: { sessionId: session.id, fact: fact.slice(0, 300) } });
        }
      } catch { /* זיכרון-רך: ניסיון-הפקה נכשל בשקט — השיחה לא נפגעת */ }
    }

    const pendingCount = await db.visitorRequest.count({ where: { sessionId: session.id, status: 'awaiting-sovereignty' } });
    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      visits: session.visits,
      reply: parsed.reply,
      routed,
      pendingRequests: pendingCount,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'clerk-unavailable' }, { status: 502 });
  }
}
