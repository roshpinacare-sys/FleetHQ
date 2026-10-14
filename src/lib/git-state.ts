/**
 * git-state.ts — מנגנון-מצב-גיט טיפוסי לכל-האפליקציה (צד-שרת בלבד). [T25=A4+A10+A11]
 * ---------------------------------------------------------------------------
 * החוק (מהרוסט שלנו עצמנו, A4/A10/A11): מצב-אפליקציה אמיתי חי בגיט — לא בזיכרון,
 * לא בקובץ-מקומי שמת עם הסנדבוקס. המנגנון:
 *  · אופטימיות-מקבילות (A4): כתיבה נושאת baseSha שנקרא; התנגשות → 409 עם המצב-הטרי.
 *  · אנטי-זיוף: אחרי כל-כתיבה readback עם MD5 — אימות עצמי או דיווח-כישלון כנה.
 *  · חוק-רוטציה (A10): יומני-JSONL חסומים (bound) — שורות-ישנות נשמטות, אין-גידול-ללא-גבול.
 *  · הסגר-פגום (A11, מלא [T29]): JSON שאינו-תקני לא מושתק בשקט —
 *      (1) העדות נשמרת: התוכן-הפגום מועתק ל-<path>.corrupt-<ts> (rename-צד),
 *      (2) אתחול-מדווח: המקור מוחלף בשלד {_reinit} תקני,
 *      (3) דיווח-תיבה: שורה-חסומה ב-quarantine-inbox.jsonl ליד המצב.
 *    הכל באותם-חוקי-כתיבה (אופטימיות+readback) — ובדמה אפס-רשת.
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

// ── SWR read-cache [T27-שיפור-ביצועים] ──
/**
 * חוק (מהמדידה: engineering GET = 2×readGitFile×~0.45ש' כל-בקשה בלי קאש):
 * קריאות-תצוגה מוגשות מקאש SWR (TTL 30ש', מיידי-גם-כשישן + רענון-רקע
 * single-flight), אבל — וזה-החוק-המחמיר — **כל-קריאה-שמזינה-כתיבה טרייה-תמיד**:
 * readback אחרי-כתיבה, קריאת-baseSha ב-updateJsonState/appendJsonlBounded —
 * מדלגים-על-הקאש במפורש (fresh). כתיבה מוצלחת מזריעה-קאש בתוכן-החדש,
 * כדי-שהתצוגה-תראה מיד את-מה-שאומת. אפס-שינוי-התנהגות במסילת-הכתיבה.
 */
interface ReadCacheEntry { at: number; result: GitRead }
const cacheG = globalThis as unknown as {
  __gitReadCache?: Map<string, ReadCacheEntry>;
  __gitReadInflight?: Map<string, Promise<GitRead>>;
};
const readTtlMs = 30_000;
const readKey = (repo: string, path: string, ref: string) => `${repo}/${ref}/${path}`;

export function readCacheStats(): { files: number; inflight: number } {
  return { files: cacheG.__gitReadCache?.size ?? 0, inflight: cacheG.__gitReadInflight?.size ?? 0 };
}

async function fetchGitFile(repo: string, path: string, ref: string): Promise<GitRead> {
  const got = await ghCall('GET', `/repos/${ORG}/${repo}/contents/${path}?ref=${ref}`);
  if (got.status === 404) return { ok: true, text: null, via: 'api' }; // עדיין-לא-קיים — מצב-חוקי
  if (got.status !== 200) return { ok: false, text: null, via: 'api', error: `http-${got.status}` };
  const sha = got.body.sha as string | undefined;
  const text = Buffer.from((got.body.content as string) ?? '', 'base64').toString('utf-8');
  return { ok: true, text, sha, via: 'api' };
}

function seedReadCache(repo: string, path: string, ref: string, result: GitRead): void {
  (cacheG.__gitReadCache ??= new Map()).set(readKey(repo, path, ref), { at: Date.now(), result });
}

export async function readGitFile(
  repo: string,
  path: string,
  ref = 'main',
  sim = false,
  opts: { fresh?: boolean } = {},
): Promise<GitRead> {
  if (sim) {
    // A6: קריאה-מהמאגר-הנדיף — אותן-חוקים (404 חוקי כשאין; sha=md5)
    const text = simGet(`${repo}/${ref}/${path}`);
    return { ok: true, text: text ?? null, sha: text === undefined ? undefined : md5hex(text), via: 'api' };
  }
  const key = readKey(repo, path, ref);
  const cache = (cacheG.__gitReadCache ??= new Map());
  const inflight = (cacheG.__gitReadInflight ??= new Map());

  if (opts.fresh) {
    const got = await fetchGitFile(repo, path, ref);
    if (got.ok) seedReadCache(repo, path, ref, got);
    return got;
  }

  const entry = cache.get(key);
  const age = entry ? Date.now() - entry.at : Infinity;
  if (entry && age < readTtlMs) return entry.result; // טרי — מוגש מיד

  // ישן-או-חסר: רענון single-flight; ישן מוגש מיד בזמן-הרענון (SWR)
  const running = inflight.get(key);
  if (running) return entry ? entry.result : running;
  const p = fetchGitFile(repo, path, ref)
    .then((res) => {
      if (res.ok) seedReadCache(repo, path, ref, res);
      return res;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  if (entry) return entry.result; // SWR: הישן מוגש, הרענון ברקע
  return p;
}

export interface JsonStateRead<T> {
  ok: boolean;
  data: T | null;
  sha?: string;
  error?: string;
  /** A11: הקובץ קיים אך שבור — לא מושתק בשקט */
  corrupt?: boolean;
  /** A11 [T29]: הטקסט-הגולמי-הפגום — חומר-ההסגר (מוחזר רק כשcorrupt) */
  raw?: string;
}

export async function readJsonState<T>(
  repo: string,
  path: string,
  ref = 'main',
  sim = false,
  opts: { fresh?: boolean } = {},
): Promise<JsonStateRead<T>> {
  const r = await readGitFile(repo, path, ref, sim, opts);
  if (!r.ok) return { ok: false, data: null, error: r.error };
  if (r.text === null) return { ok: true, data: null, sha: r.sha }; // ראשית-עולם
  try {
    return { ok: true, data: JSON.parse(r.text) as T, sha: r.sha };
  } catch (e) {
    return { ok: false, data: null, sha: r.sha, corrupt: true, raw: r.text, error: e instanceof Error ? `corrupt: ${e.message}` : 'corrupt' };
  }
}

// ─────────────── A11 מלא: הסגר-מצב-פגום [T29] ───────────────
/**
 * חוק (מהרוסט A11 — "rename .corrupt-<ts> + אתחול-מדווח ל-inbox", נותר חצי-מנגנון עד T29):
 * מצב-פגום לא נשאר במקומו ולא נמחק — הוא מוסגר בשלושה-צעדים-מאומתים:
 *   1. העדות: <path>.corrupt-<ts> עם התוכן-הגולמי (תקרה 256KB — דפורמציה-לא-בעיה,
 *      פרטיות-ותקרת-גודל כן).
 *   2. אתחול-מדווח: המקור מוחלף בשלד {_reinit} תקני — הצרכנים מקבלים מצב-חוקי
 *      ומזוהה, ואין-שתיקה.
 *   3. דיווח: שורה-חסומה (A10) ב-quarantine-inbox.jsonl ליד המצב.
 * כל-הצעדים דרך writeGitFile — אופטימיות, readback-MD5, ובדמה אפס-רשת.
 */
export interface QuarantineReport {
  ok: boolean;
  /** md5 של התוכן-הפגום — זיהוי-העדות */
  evidenceSha: string;
  bytes: number;
  /** נתיב-ההסגר (אם הצליח) */
  quarantinedTo?: string;
  quarantinedOk: boolean;
  reinitOk: boolean;
  inboxOk: boolean;
  errors: string[];
}

const QUARANTINE_MAX_CHARS = 262_144;
const INBOX_BOUND = 200;
const corruptTs = () => new Date().toISOString().replace(/[:.]/g, '-');

export async function quarantineCorruptState(
  repo: string,
  path: string,
  raw: string,
  opts: { ref?: string; sim?: boolean; reason?: string; corruptBlobSha?: string } = {},
): Promise<QuarantineReport> {
  const ref = opts.ref ?? 'main';
  const errors: string[] = [];
  const bytes = Buffer.byteLength(raw, 'utf-8');
  const evidenceSha = md5hex(raw);
  const evidence =
    raw.length > QUARANTINE_MAX_CHARS
      ? raw.slice(0, QUARANTINE_MAX_CHARS) + `\n<!-- A11-truncated @ ${QUARANTINE_MAX_CHARS} chars -->`
      : raw;
  const qPath = `${path}.corrupt-${corruptTs()}`;

  // 1. העדות-נשמרת (קובץ-חדש — בלי baseSha)
  const q = await writeGitFile(repo, qPath, evidence, {
    message: `A11: הסגר-מצב-פגום ${path} → ${qPath.split('/').pop()}`, ref, sim: opts.sim,
  });
  const quarantinedOk = q.ok;
  if (!q.ok) errors.push(`evidence: ${q.error ?? 'fail'}`);

  // 2. אתחול-מדווח של המקור — עם ה-blob-sha שנקרא (אופטימיות-מלאה)
  const skeleton = {
    _reinit: {
      law: 'A11',
      path,
      quarantinedAt: new Date().toISOString(),
      evidence: qPath,
      evidenceSha,
      bytes,
      reason: opts.reason ?? 'JSON.parse failed',
      note: 'המקור הוסגר כפגום והוחלף באתחול-מדווח; שחזור-ידני אפשר מקובץ-ההסגר',
    },
  };
  const wr = await writeGitFile(repo, path, JSON.stringify(skeleton, null, 2) + '\n', {
    baseSha: opts.corruptBlobSha, message: `A11: אתחול-מדווח ${path} (המקור הוסגר)`, ref, sim: opts.sim,
  });
  const reinitOk = wr.ok;
  if (!wr.ok) errors.push(`reinit: ${wr.error ?? 'fail'}`);

  // 3. דיווח-תיבה — חסום לפי A10
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const line = JSON.stringify({
    at: new Date().toISOString(), law: 'A11', repo, path,
    evidence: qPath, evidenceSha, bytes, action: 'quarantine+reinit',
    evidenceOk: quarantinedOk, reinitOk,
  });
  const inbox = await appendJsonlBounded(repo, `${dir}quarantine-inbox.jsonl`, line, {
    bound: INBOX_BOUND, message: `A11: דיווח-הסגר ${path}`, ref, sim: opts.sim,
  });
  const inboxOk = inbox.ok;
  if (!inbox.ok) errors.push(`inbox: ${inbox.error ?? 'fail'}`);

  return {
    ok: quarantinedOk && reinitOk && inboxOk,
    evidenceSha, bytes,
    ...(quarantinedOk ? { quarantinedTo: qPath } : {}),
    quarantinedOk, reinitOk, inboxOk, errors,
  };
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
  // אנטי-זיוף: readback עם MD5 (חוק gh-put — הצלחה לא-אומתת = כישלון).
  // fresh=true: הקריאה-שמאמתת-כתיבה חייבת לעבור-על-הרשת, לא-מקאש.
  const rb = await readGitFile(repo, path, ref, false, { fresh: true });
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
): Promise<GitWrite & { current?: T | null; quarantined?: QuarantineReport }> {
  // fresh=true: baseSha שמזין-כתיבה חייב להיות טרי (שלא-נוצרו-התנגשויות-שווא)
  const read = await readJsonState<T>(repo, path, ref, opts.sim, { fresh: true });
  // [T29-תיקון-באג] corrupt בדיקה ראשונה: קריאה-פגומה נושאת ok:false — הבדיקה
  // הישנה (!read.ok) בלעה-את-הענף-הפגום והפכה את ההסגר לקוד-מת (נמדד ב-selftest).
  if (read.corrupt) {
    // A11 מלא [T29]: הסגר בפועל — עדות + אתחול-מדווח + דיווח-תיבה; ואז fail-closed
    // כנה למסלול-הקורא (יכול לחזור על עצמו מול השלד-התקני)
    const q = await quarantineCorruptState(repo, path, read.raw ?? '', {
      ref, sim: opts.sim, reason: read.error, corruptBlobSha: read.sha,
    });
    return { ok: false, error: `state-corrupt-quarantined: ${read.error}`, quarantined: q };
  }
  if (!read.ok) {
    return { ok: false, error: `read-failed: ${read.error}` };
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
  const read = await readGitFile(repo, path, opts.ref ?? 'main', opts.sim, { fresh: true });
  if (!read.ok) return { ok: false, error: read.error };
  const existing = (read.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const lines = [...existing, line].slice(-opts.bound);
  return writeGitFile(repo, path, lines.join('\n') + '\n', {
    baseSha: read.sha, message: opts.message, ref: opts.ref ?? 'main', sim: opts.sim, gate: opts.gate,
  });
}

export { ORG };
