/**
 * gh-pat.ts — פותר-אסימון-גיטהאב אחיד לכל-השרת. [T24]
 * ---------------------------------------------------------------------------
 * חוק-המלאי (מחסן-המפתחות): המערכת לא "מדמה" מפתח — או שיש אסימון תקני-צורה,
 * או שאין (ואז כל-מסילה נופלת-סגור/אנונימי בכנות במקום 401-רעש).
 * צורה-תקינה: ghp_… / github_pat_… / gho_… / ghu_… / ghs_… (מינימום 30 תווים).
 * כל-דבר-אחר (כולל placeholder-ניקוי כמו [REDACTED:...]) מוכרז "אין-אסימון".
 */

const TOKEN_RE = /^gh[pousr]_[A-Za-z0-9]{20,}|^github_pat_[A-Za-z0-9_]{20,}$/;

export function resolveGithubPat(): string {
  const env = (process.env.GH_PAT || '').trim();
  if (env && TOKEN_RE.test(env)) return env;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    const raw = readFileSync('/home/z/my-project/upload/pat.env', 'utf-8').trim();
    // הקובץ: KEY=value (שורה-אחת) — מוציאים את הערך ומאמתים-צורה
    const val = raw.includes('=') ? raw.split('=').slice(1).join('=').trim() : raw;
    if (val && TOKEN_RE.test(val)) return val;
    return '';
  } catch {
    return '';
  }
}

/** פומבי-או-פרטי? רשימת-הריפו-הפרטיים הידועים (לבחירת-נתיב-אחזור בלבד) */
const PRIVATE_REPOS = new Set(['Sandbox', 'saos-runtime', 'sovereign-beacon', 'sovereign-lighthouse']);

export function isPrivateRepo(repo: string): boolean {
  return PRIVATE_REPOS.has(repo);
}

/**
 * אימות-חי של האסימון מול-גיטהאב — חוק-אמת-מעל-צורה. [T24]
 * אסימון-תקני-צורה שגיטהאב דוחה (401) = שרוף; המערכת לא תעמיד-פנים שיש-גישה.
 * מטמון 10 דק' (ה-API זול: /user). אפס-חשיפה: מוחזר רק הפסק-הדין.
 */
const g = globalThis as unknown as { __patVerify?: { at: number; valid: boolean; http: number } };
const VERIFY_TTL = 600_000;

export async function verifyGithubPat(): Promise<{ valid: boolean; http: number; hasToken: boolean }> {
  const token = resolveGithubPat();
  if (!token) return { valid: false, http: 0, hasToken: false };
  const cached = g.__patVerify;
  if (cached && Date.now() - cached.at < VERIFY_TTL) {
    return { valid: cached.valid, http: cached.http, hasToken: true };
  }
  let valid = false;
  let http = 0;
  try {
    const res = await fetch('https://api.github.com/user', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'keys-registry/1' },
      signal: AbortSignal.timeout(6000),
    });
    http = res.status;
    valid = res.ok;
  } catch {
    http = -1;
    valid = false;
  }
  g.__patVerify = { at: Date.now(), valid, http };
  return { valid, http, hasToken: true };
}
