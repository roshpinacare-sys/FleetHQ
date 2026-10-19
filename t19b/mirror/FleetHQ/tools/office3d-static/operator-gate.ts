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
  '492dd53b7859d16ed14621160022811964e21cb105695fc7bbc23c6a57842e70';

export const OP_SESSION_KEY = 'hq.op';

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function keyMatches(candidate: string): Promise<boolean> {
  const k = candidate.trim();
  if (!k) return false;
  return (await sha256Hex(k)) === OPERATOR_DIGEST;
}
