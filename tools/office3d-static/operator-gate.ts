/**
 * operator-gate.ts — שער-מפתח-המנהל של החדר (אפס-חשיפת-זהות).
 * ------------------------------------------------------------------
 * · בקוד חי דיגסט SHA-256 אחד בלבד — המפתח עצמו לעולם לא נכתב בשום מקור,
 *   בשום לוג, בשום תשובה. מי שאינו מחזיק במפתח לומד מהדיגסט אפס.
 * · האימות כולו בצד-הלקוח (crypto.subtle) — אין בקאנד, אין שליחת-מפתח.
 * · הסשן = דגל-sessionStorage בלבד — נעלם בסגירת-הטאב, אין localStorage.
 * · אפס רמז לזהות-המנהל: השער נקרא "מפתח מנהל" וזהו.
 */

export const OPERATOR_DIGEST =
  'c056922c73549649932441da972e97f88032a2e6ee7f6599856c95c12e6a68e4';

export const OP_SESSION_KEY = 'hq.op';

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** כל-צורות-ההדבקה הסבירות (חוק-טעות-אנוש): שורה-יחידה · ריבוי-שורות · תווית+מפתח ·
 *  שדה-password ששחק ירידות-שורה ("תווית+מפתח" מחוברים — חיתוך מהראשון P[5KL] תואם-WIF).
 *  אפס-הרעה: השוואה נשארת דיגיסט-יחיד; המועמדים לעולם לא נרשמים בשום מקור. */
export function keyCandidateForms(input: string): string[] {
  const out = new Set<string>();
  const push = (s?: string) => {
    if (!s) return;
    const t = s.trim();
    if (t.length < 8 || t.length > 512) return;
    out.add(t);
    if (t.length >= 2 && t[0] === 'P' && /^[5KL]/.test(t[1] ?? '')) out.add(t.slice(1));
  };
  const lines = input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  push(input);
  push(input.replace(/\s+/g, ''));
  for (const l of lines) push(l);
  if (lines.length > 1) {
    push(lines[lines.length - 1]);
    push([...lines].sort((a, b) => b.length - a.length)[0]);
  }
  const wifIdx = input.search(/P[5KL]/);
  if (wifIdx > 0) push(input.slice(wifIdx));
  return [...out];
}

export async function keyMatches(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  for (const form of keyCandidateForms(candidate)) {
    if ((await sha256Hex(form)) === OPERATOR_DIGEST) return true;
  }
  return false;
}
