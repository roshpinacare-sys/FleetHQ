import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { candidateHashes, canonicalOwnerHash, hash } from '@/lib/owner-key';

/**
 * שער-המנהל (T19-מהדורה-שנייה) — כניסה = המפתח-האמיתי של הבעלים בלבד.
 * ---------------------------------------------------------------------------
 * · אין-קביעה-חופשית: אורח-עם-טקסט-רנדומלי לא יכול לתבוע-בעלות.
 * · השער נזרע מהמפתח שהבעלים צירף; מחזיק-המפתח-הנוכחי יכול לעגן-מחדש (rotation).
 * · בכניסה מוצלחת רצת-בדיקת-התאמה-חיה מול השרשרות (STEEM/BLURT) — כנות מלאה.
 * · אפס-חשיפת-זהות: אין-שמות-חשבונות בפלט; אין-רמזים בשגיאות; הסוד לא נשמר.
 */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export async function GET() {
  try {
    const gate = await db.ownerGate.findFirst();
    return NextResponse.json({ claimed: !!gate });
  } catch {
    return NextResponse.json({ claimed: null, error: 'gate-unavailable' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: { action?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-json' }, { status: 400 });
  }
  const secret = (body.secret ?? '').trim();
  if (!secret || secret.length < 8) {
    return NextResponse.json({ ok: false, error: 'מפתח קצר מדי — מינימום 8 תווים' }, { status: 400 });
  }
  try {
    const cands = candidateHashes(secret);
    if (!cands.length) {
      return NextResponse.json({ ok: false, error: 'פורמט-מפתח-לא-מזוהה' }, { status: 400 });
    }
    const existing = await db.ownerGate.findFirst();
    // חוק-השער (fail-closed): הקביעה-והכניסה מאומתות מול-המפתח-המקורי בלבד.
    // [T-audit] תוקן: לפני-כן claim-עם-מפתח-זר יכול היה לתפוס-את-השער (cands[0]) — חור-ביטחוני.
    const canonical = canonicalOwnerHash();
    if (!canonical) {
      // אין-מפתח-מקורי-זמין בשרת → אין-בסיס-אימות → אין-כניסה (לעולם לא fail-open)
      return NextResponse.json({ ok: false, error: 'השער אינו מאותחל — אין-בסיס-אימות בשרת' }, { status: 503 });
    }
    const isCanonical = cands.includes(canonical);

    if (!existing) {
      // אין-שער-קיים: רק-המפתח-המקורי מאתחל (claim או verify — שניהם באותו-חוק)
      if (!isCanonical) {
        return NextResponse.json({ ok: false, error: 'קביעה מותרת רק עם המפתח-המקורי של הבעלים' }, { status: 403 });
      }
      await db.ownerGate.create({ data: { secretHash: canonical } });
    } else {
      const match = cands.includes(existing.secretHash);
      if (!match) {
        // מפתח-מקורי תמיד מנצח — עיגון-מחדש (rotation) ואישור
        if (isCanonical) {
          await db.ownerGate.update({ where: { id: existing.id }, data: { secretHash: canonical } });
        } else {
          return NextResponse.json({ ok: false, error: 'מפתח שגוי' }, { status: 401 });
        }
      }
    }

    const token = randomBytes(32).toString('hex');
    await db.ownerSession.create({
      data: { tokenHash: hash(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });

    // בדיקת-התאמה-חיה מול השרשרות (המפתח-בזיכרון-בלבד, לא-נשמר-ולא-נרשם)
    let keyfit: Record<string, unknown> | null = null;
    try {
      const { runKeyfit } = await import('@/lib/keyfit');
      keyfit = (await runKeyfit(secret)) as unknown as Record<string, unknown>;
    } catch {
      keyfit = { ok: false, error: 'keyfit-unavailable' };
    }

    // סיכום-ההתאמה נשמר כהודעת-מערכת (מתמשך — שורד רענון וסקר)
    if (keyfit) {
      const k = keyfit as {
        ok?: boolean; wif?: { wifValid?: boolean };
        steem?: { reachable?: boolean; registeredRoles?: string[]; note?: string };
        blurt?: { reachable?: boolean; registeredRoles?: string[]; note?: string };
        measuredAt?: string;
      };
      const parts: string[] = [];
      parts.push(k.wif?.wifValid ? 'מפתח-תקין-קריפטוגרפית ✓' : 'מפתח-לא-תקין ✗');
      if (k.steem?.reachable) {
        parts.push(
          k.steem.registeredRoles?.length
            ? `STEEM: מחובר ✓ (${k.steem.registeredRoles.join(', ')})`
            // [T-audit] כנות: לא-"ההרשמה-בתהליך" — אין-תהליך-כזה; עדכון-רשויות דורש מפתח-active של החשבון
            : 'STEEM: המפתח אינו רשום כרשות בחשבון — עדכון-רשויות מחייב מפתח-active/owner של החשבון (ממשק הרשת) או מפתח-אחר שנרשם',
        );
      } else {
        parts.push('STEEM: צמתים-לא-זמינים-כרגע (נמדד)');
      }
      if (k.blurt?.reachable) {
        parts.push(k.blurt.registeredRoles?.length ? 'BLURT: מחובר ✓' : 'BLURT: המפתח אינו רשום כרשות בחשבון');
      } else {
        // [T-audit] כנות: לא-"בתחזוקה" — הצמתים לא נגישים מהסביבה-הזאת (מדידה)
        parts.push('BLURT: צמתים לא נגישים מהסביבה (נמדד)');
      }
      await db.ownerMsg.create({
        data: {
          role: 'system',
          text: `🔗 מצב-חיבור חי (${(k.measuredAt ?? new Date().toISOString()).slice(11, 16)}Z): ${parts.join(' · ')}`,
        },
      });
    }

    return NextResponse.json({ ok: true, token, expiresInMs: SESSION_TTL_MS, keyfit });
  } catch {
    return NextResponse.json({ ok: false, error: 'gate-error' }, { status: 500 });
  }
}
