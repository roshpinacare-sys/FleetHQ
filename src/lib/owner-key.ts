import { createHash } from 'crypto';
import { readFileSync } from 'fs';

/**
 * שער-הבעלים (T19) — כניסה = המפתח האמיתי של המנהל בלבד.
 * ---------------------------------------------------------------------------
 * חוק: המפתח שהבעלים צירף (upload/headcorner.txt) הוא חומר-הכניסה היחיד.
 * אין-claim-חופשי לאורחים; אין-רמזים; המפתח לעולם לא נשמר — רק SHA-256 עם מלח.
 * נרמול: מקבל את הקובץ המלא, שורה אחרונה, או המפתח עם/בלי קידומת "P".
 */

const PEPPER = 'owner-gate/2/keyfit';
export const hash = (s: string) => createHash('sha256').update(`${PEPPER}:${s}`).digest('hex');

const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{51,52}$/;

/** מנרמל קלט לרשימת-מועמדים (קובץ-מלא / שורה / עם-ובלי-P) */
export function secretCandidates(raw: string): string[] {
  const text = (raw ?? '').replace(/\r/g, '').trim();
  if (!text) return [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bases = new Set<string>([text, ...lines.slice(-3)]);
  const out = new Set<string>();
  for (const b of bases) {
    out.add(b);
    if (b.length === 52 && b.startsWith('P') && B58_RE.test(b)) out.add(b.slice(1));
    if (b.length === 51 && B58_RE.test(b)) out.add('P' + b);
  }
  return [...out];
}

/** hash-ים של מועמדים להשוואה מול ה-DB */
export function candidateHashes(raw: string): string[] {
  return secretCandidates(raw).map(hash);
}

/** המפתח-המקורי (מהקובץ שצירף הבעלים) — זמין-רק בשרת, רק להזרעת-hash */
function ownerKeyLine(): string | null {
  try {
    const file = readFileSync('/home/z/my-project/upload/headcorner.txt', 'utf-8');
    const lines = file.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    const key = lines.find((l) => /^[1-9A-HJ-NP-Za-km-zP]{51,52}$/.test(l));
    return key ?? null;
  } catch {
    return null;
  }
}

export function ownerSeedHashes(): string[] {
  const key = ownerKeyLine();
  return key ? candidateHashes(key) : [];
}

/** hash-ה-canonical: שורת-המפתח כפי-שהיא-בקובץ (צורת-P) */
export const canonicalOwnerHash = (): string | null => {
  const key = ownerKeyLine();
  return key ? hash(key) : null;
};
