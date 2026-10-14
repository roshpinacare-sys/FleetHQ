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

// ─────────────── קריאה ───────────────

export interface GitRead {
  ok: boolean;
  text: string | null;
  /** blob-sha של הקובץ — הבסיס לאופטימיות-המקבילות */
  sha?: string;
  via: 'api';
  error?: string;
}

export async function readGitFile(repo: string, path: string, ref = 'main'): Promise<GitRead> {
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

export async function readJsonState<T>(repo: string, path: string, ref = 'main'): Promise<JsonStateRead<T>> {
  const r = await readGitFile(repo, path, ref);
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
  opts: { baseSha?: string; message: string; ref?: string },
): Promise<GitWrite> {
  const ref = opts.ref ?? 'main';
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
): Promise<GitWrite & { current?: T | null }> {
  const read = await readJsonState<T>(repo, path, ref);
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
    baseSha: read.sha, message, ref,
  });
  return wr.conflict ? { ...wr, current: read.data } : wr;
}

/** A10: רוטציה-חוקית — הוספת-שורות JSONL עם חסם-גודל (זנב אחרון-שורה) */
export async function appendJsonlBounded(
  repo: string,
  path: string,
  line: string,
  opts: { bound: number; message: string; ref?: string },
): Promise<GitWrite> {
  const read = await readGitFile(repo, path, opts.ref ?? 'main');
  if (!read.ok) return { ok: false, error: read.error };
  const existing = (read.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const lines = [...existing, line].slice(-opts.bound);
  return writeGitFile(repo, path, lines.join('\n') + '\n', {
    baseSha: read.sha, message: opts.message, ref: opts.ref ?? 'main',
  });
}

export { ORG };
