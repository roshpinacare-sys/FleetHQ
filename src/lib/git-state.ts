/**
 * git-state.ts — מנגנון-מצב-גיט טיפוסי לכל-האפליקציה (צד-שרת בלבד). [T25=A4+A10+A11]
 * ---------------------------------------------------------------------------
 * החוק (מהרוסט שלנו עצמנו, A4/A10/A11): מצב-אפליקציה אמיתי חי בגיט — לא בזיכרון,
 * לא בקובץ-מקומי שמת עם הסנדבוקס. המנגנון:
 *  · אופטימיות-מקבילות (A4): כתיבה נושאת baseSha שנקרא; התנגשות → 409 עם המצב-הטרי.
 *  · אנטי-זיוף: אחרי כל-כתיבה readback עם MD5 — אימות עצמי או דיווח-כישלון כנה.
 *  · חוק-רוטציה (A10): יומני-JSONL חסומים (bound) — שורות-ישנות נשמטות, אין-גידול-ללא-גבול.
 *  · הסגר-פגום (A11): JSON שאינו-תקני לא מושתק בשקט — מדווח corrupt עם הקשר.
 * אין-כאן שום-המצאה: כל-כשל חוזר ככשל, כל-הצלחה מאומתת-בקריאה-חוזרת.
 */
import { createHash } from 'crypto';
import { resolveGithubPat } from '@/lib/gh-pat';

const GH_API = 'https://api.github.com';
const ORG = 'roshpinacare-sys';

export interface GhCall {
  status: number;
  body: Record<string, unknown>;
}

export async function ghCall(method: string, path: string, payload?: unknown, timeoutMs = 20000): Promise<GhCall> {
  const res = await fetch(`${GH_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${resolveGithubPat()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'git-state/1 [T25]',
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* גוף-ריק תקין */
  }
  return { status: res.status, body };
}

export const md5hex = (b: Buffer | string): string => createHash('md5').update(b).digest('hex');

// ─────────────── A9: שער-מיזוג — סמכויות-כתיבה [T26] ───────────────
/**
 * חוק (מהרוסט A9 — "ops-forge כותב ישירות ל-main בלי שער"): אין כתיבה אנונימית
 * לנתיבי-ריבונות. השער מנגני — בתוך writeGitFile עצמו (נקודת-חנק אחת לכל-האפליקציה):
 *   · נתיבי-ריבונות (state/keys/**, state/app/engineering.json) דורשים
 *     authority='sovereign' + ownerVerified=true — כלומר המסלול שקרא לכתיבה
 *     אימת טוקן-בעלים בפועל, לא רק הצהיר.
 *   · כתיבת-יישוב (authority='receipt') מחייבת receiptRef≥8 — סגירה-בלי-ראיה נדחית.
 *   · 'lane' — כתיבת-מסילה רגילה לנתיבים לא-מוגנים (ברירת-התנהגות ההיסטורית,
 *     כעת מפורשת-בחוק במקום שקט).
 */
export type WriteAuthority = 'sovereign' | 'receipt' | 'lane';

export interface WriteGate {
  authority: WriteAuthority;
  /** true רק אם המסלול אימת טוקן-בעלים (ownerSession) לפני הכתיבה */
  ownerVerified?: boolean;
  /** קבלת-אפקט — חובה עבור authority='receipt' */
  receiptRef?: string;
}

const SOVEREIGN_PATHS: Array<{ repo: string; path: string; prefix?: boolean }> = [
  { repo: 'Autonomy', path: 'state/keys/', prefix: true },
  { repo: 'Autonomy', path: 'state/app/engineering.json' },
];

export function isSovereignPath(repo: string, path: string): boolean {
  return SOVEREIGN_PATHS.some((p) => p.repo === repo && (p.prefix ? path.startsWith(p.path) : path === p.path));
}

export function gateVerdict(repo: string, path: string, gate: WriteGate | undefined): { ok: boolean; error?: string } {
  if (!isSovereignPath(repo, path)) return { ok: true }; // נתיב-מסילה רגיל
  if (gate?.authority === 'sovereign' && gate.ownerVerified === true) return { ok: true };
  if (gate?.authority === 'receipt' && (gate.receiptRef ?? '').length >= 8 && gate.ownerVerified === true) {
    return { ok: true }; // יישוב-ריבוני עם קבלה — מותר גם דרך מסלול-מאומת
  }
  return {
    ok: false,
    error: gate?.authority === 'receipt' && (gate.receiptRef ?? '').length < 8
      ? 'merge-gate: יישוב חייב קבלת-אפקט (מינימום 8 תווים)'
      : 'merge-gate: נתיב-ריבונות — דרוש אימות-בעלים (ownerVerified)',
  };
}

// ─────────────── A6: תשתית-דמה — QA בלי-נגיעה באמת [T26] ───────────────
/**
 * חוק (מהרוסט A6 — "אפס רצפת בדיקות; QA דפדפן-בלבד"): מצב-דמה PRNG-זרוע-כמעט:
 * מאגר-תודעה נדיף (globalThis) עם אותם-חוקים בדיוק — אופטימיות-מקבילות, readback-MD5,
 * הסגר-פגום, שער-מיזוג. הפעלה-כפולה-נעולה: נדרש SIM=1 בסביבת-השרת **וגם** x-sim:1
 * בבקשה. בלי-השניים — כל-נתיב מדמה נדחה (fail-closed), ואין-נגיעה בגיט-אמת.
 */
const simG = globalThis as unknown as { __simGitStore?: Map<string, string>; __simOps?: number };

export function simEnvEnabled(): boolean {
  return process.env.SIM === '1';
}

/** דמה פעיל רק כשהסביבה נעלה אותה והבקשה ביקשה במפורש */
export function simRequested(headerSim: boolean): boolean {
  return simEnvEnabled() && headerSim;
}

export function simReset(): void {
  simG.__simGitStore = new Map();
  simG.__simOps = 0;
}

export function simStats(): { files: number; ops: number; env: boolean } {
  return { files: simG.__simGitStore?.size ?? 0, ops: simG.__simOps ?? 0, env: simEnvEnabled() };
}

function simGet(key: string): string | undefined {
  return simG.__simGitStore?.get(key);
}

/** כתיבה-גולמית-לדמה — לשימוש בדיקות-מנגנון בלבד (לא למסלולים) */
export function simPut(key: string, content: string): { sha: string; commit: string } {
  const store = (simG.__simGitStore ??= new Map());
  store.set(key, content);
  simG.__simOps = (simG.__simOps ?? 0) + 1;
  return { sha: md5hex(content), commit: `sim-${String(simG.__simOps).padStart(6, '0')}` };
}

// ─────────────── קריאה ───────────────

export interface GitRead {
  ok: boolean;
  text: string | null;
  /** blob-sha של הקובץ — הבסיס לאופטימיות-המקבילות */
  sha?: string;
  via: 'api';
  error?: string;
}

export async function readGitFile(repo: string, path: string, ref = 'main', sim = false): Promise<GitRead> {
  if (sim) {
    // A6: קריאה-מהמאגר-הנדיף — אותן-חוקים (404 חוקי כשאין; sha=md5)
    const text = simGet(`${repo}/${ref}/${path}`);
    return { ok: true, text: text ?? null, sha: text === undefined ? undefined : md5hex(text), via: 'api' };
  }
  const got = await ghCall('GET', `/repos/${ORG}/${repo}/contents/${path}?ref=${ref}`);
  if (got.status === 404) return { ok: true, text: null, via: 'api' }; // עדיין-לא-קיים — מצב-חוקי
  if (got.status !== 200) return { ok: false, text: null, via: 'api', error: `http-${got.status}` };
  const sha = got.body.sha as string | undefined;
  const text = Buffer.from((got.body.content as string) ?? '', 'base64').toString('utf-8');
  return { ok: true, text, sha, via: 'api' };
}

export interface JsonStateRead<T> {
  ok: boolean;
  data: T | null;
  sha?: string;
  error?: string;
  /** A11: הקובץ קיים אך שבור — לא מושתק בשקט */
  corrupt?: boolean;
}

export async function readJsonState<T>(repo: string, path: string, ref = 'main', sim = false): Promise<JsonStateRead<T>> {
  const r = await readGitFile(repo, path, ref, sim);
  if (!r.ok) return { ok: false, data: null, error: r.error };
  if (r.text === null) return { ok: true, data: null, sha: r.sha }; // ראשית-עולם
  try {
    return { ok: true, data: JSON.parse(r.text) as T, sha: r.sha };
  } catch (e) {
    return { ok: false, data: null, sha: r.sha, corrupt: true, error: e instanceof Error ? `corrupt: ${e.message}` : 'corrupt' };
  }
}

// ─────────────── כתיבה ───────────────

export interface GitWrite {
  ok: boolean;
  /** blob-sha החדש — לשרשור-כתיבות בטוח */
  sha?: string;
  commit?: string;
  error?: string;
  /** A4: התנגשות-כתיבה (מישהו-אחר כתב לפנינו) — הקורא חייב-לקרוא-מחדש ולהפעיל-שוב */
  conflict?: boolean;
  /** אנטי-זיוף: ה-PUT עבר אבל ה-readback לא אימת */
  readbackFailed?: boolean;
}

export async function writeGitFile(
  repo: string,
  path: string,
  content: string,
  opts: { baseSha?: string; message: string; ref?: string; sim?: boolean; gate?: WriteGate },
): Promise<GitWrite> {
  const ref = opts.ref ?? 'main';
  // A9: שער-המיזוג — נקודת-החנק. כל-כתיבה עוברת-כאן; נתיב-ריבונות בלי-אימות-בעלים = חסום.
  const gate = gateVerdict(repo, path, opts.gate);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (opts.sim) {
    // A6: כתיבה-מדומה — אופטימיות + readback באותם-חוקים, אפס-רשת
    const key = `${repo}/${ref}/${path}`;
    const cur = simGet(key);
    if (opts.baseSha && cur !== undefined && md5hex(cur) !== opts.baseSha) {
      return { ok: false, conflict: true, error: 'conflict-sim' };
    }
    const put2 = simPut(key, content);
    const rb2 = simGet(key);
    if (rb2 === undefined || md5hex(rb2) !== md5hex(content)) return { ok: false, readbackFailed: true, error: 'readback-mismatch-sim' };
    return { ok: true, sha: put2.sha, commit: put2.commit };
  }
  const put = await ghCall('PUT', `/repos/${ORG}/${repo}/contents/${path}`, {
    message: opts.message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    ...(opts.baseSha ? { sha: opts.baseSha } : {}),
    branch: ref,
  });
  if (put.status === 409 || put.status === 422) {
    return { ok: false, conflict: true, error: `conflict-http-${put.status}` };
  }
  if (put.status !== 200 && put.status !== 201) {
    return { ok: false, error: `http-${put.status}` };
  }
  const commit = ((put.body.commit as Record<string, unknown> | undefined)?.sha as string | undefined)?.slice(0, 9);
  // אנטי-זיוף: readback עם MD5 (חוק gh-put — הצלחה לא-אומתת = כישלון)
  const rb = await readGitFile(repo, path, ref);
  if (!rb.ok || rb.text === null || md5hex(rb.text) !== md5hex(content)) {
    return { ok: false, readbackFailed: true, error: 'readback-mismatch' };
  }
  return { ok: true, sha: rb.sha, commit };
}

/** עדכון-מצב-JSON מלא עם אופטימיות (קרא → החל → כתוב עם ה-baseSha שנקרא) */
export async function updateJsonState<T>(
  repo: string,
  path: string,
  message: string,
  mutate: (current: T | null) => { next: T; abort?: { error: string; status?: number } },
  ref = 'main',
  opts: { sim?: boolean; gate?: WriteGate } = {},
): Promise<GitWrite & { current?: T | null }> {
  const read = await readJsonState<T>(repo, path, ref, opts.sim);
  if (!read.ok) {
    return { ok: false, error: read.corrupt ? `state-corrupt: ${read.error}` : `read-failed: ${read.error}` };
  }
  if (read.corrupt) {
    // A11: הסגר — לא מאתחלים בשקט; כותבים מדווחים ומשאירים לריפוי-ידני
    return { ok: false, error: `state-corrupt-quarantined: ${read.error}` };
  }
  const applied = mutate(read.data);
  if (applied.abort) return { ok: false, error: applied.abort.error, current: read.data };
  const wr = await writeGitFile(repo, path, JSON.stringify(applied.next, null, 2) + '\n', {
    baseSha: read.sha, message, ref, sim: opts.sim, gate: opts.gate,
  });
  return wr.conflict ? { ...wr, current: read.data } : wr;
}

/** A10: רוטציה-חוקית — הוספת-שורות JSONL עם חסם-גודל (זנב אחרון-שורה) */
export async function appendJsonlBounded(
  repo: string,
  path: string,
  line: string,
  opts: { bound: number; message: string; ref?: string; sim?: boolean; gate?: WriteGate },
): Promise<GitWrite> {
  const read = await readGitFile(repo, path, opts.ref ?? 'main', opts.sim);
  if (!read.ok) return { ok: false, error: read.error };
  const existing = (read.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const lines = [...existing, line].slice(-opts.bound);
  return writeGitFile(repo, path, lines.join('\n') + '\n', {
    baseSha: read.sha, message: opts.message, ref: opts.ref ?? 'main', sim: opts.sim, gate: opts.gate,
  });
}

export { ORG };
