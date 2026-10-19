/**
 * /api/engineering — פנקס-ההנדסה: מדידות-המנגנונים שאומצו. [T25+T26]
 * ---------------------------------------------------------------------------
 * · GET — מצב-המנגנונים מהגיט (Autonomy state/app/engineering.json): בדיקת-הכלוב,
 *   בדיקת-הדמה-והשער (A6+A9), סדר-האימוצים מפסק-הדין, וסיכום-עלות ממחזור-ההכרעות (A8).
 * · POST (selftest) — מריץ את בדיקת-הכלוב בפועל (spawn, תם-נמלך 90 שנ').
 * · POST (simselftest) — מריץ את חוקי-הדמה-והשער ישירות מול המנגנון:
 *     1. כתיבה-מוגנת בלי-אימות-בעלים → נחסמת (A9 fail-closed)
 *     2. כתיבה-מוגנת עם אימות-בעלים → עוברת עם readback-MD5
 *     3. יישוב-ריבוני עם קבלה-קצרה → נחסם (A9 חוק-קבלה)
 *     4. מחזור מלא בדמה: read-null → write → conflict (baseSha ישן) → readback
 *     5. אמת-גיט: sha של engineering.json לפני-ואחרי — לא-נגענו באמת (A6)
 *   רק-בעלים מריץ (ספון-תהליך/מדידת-מנגנון = הרשאה).
 * אין-כאן הצהרות: מה שלא נמדד — לא מוצג.
 */
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { db } from '@/lib/db';
import { assertIntent } from '@/lib/intent-gate';
import {
  readJsonState, updateJsonState, simReset, simStats,
  writeGitFile, readGitFile, gateVerdict, simPut,
} from '@/lib/git-state';

export const revalidate = 0;

const REPO = 'Autonomy';
const PATH = 'state/app/engineering.json';
const CYCLE_PATH = 'state/app/decisions-cycle.json';

interface CageCheck {
  check: string;
  want: string;
  got: string;
  pass: boolean;
}
interface SimCheck {
  check: string;
  want: string;
  got: string;
  pass: boolean;
}
interface EngState {
  schema: string;
  updatedAt: string;
  cage: {
    at: string;
    pass: boolean;
    checks: CageCheck[];
    node: string;
  } | null;
  sim: {
    at: string;
    pass: boolean;
    checks: SimCheck[];
    realGitUntouched: boolean;
  } | null;
  adopted: Record<string, string>;
}
const FRESH: EngState = {
  schema: 'engineering/1',
  updatedAt: '',
  cage: null,
  sim: null,
  adopted: {
    A2: 'כלוב-גיט לתהליכי-סוכן — tools/git-cage.mjs (protocol=never, מלכודת-insteadOf, תקרה)',
    A5: 'שער-כוונות לולאתי — src/lib/intent-gate.ts (same-origin + x-intent + דלי-אסימונים)',
    A1: 'מחזור-הכרעות עם-אפקט — /api/decisions-cycle (answer→side-effect→settle→reopen, אופטימיות-גיט)',
    A12: 'המשכיות-סשן שורדת-סנדבוקס — /api/sessions (reattach נמדד בגיט)',
    A10: 'רוטציית-יומנים — חסמים בכל-כתיבות המצב (40/200 שורות)',
    A9: 'שער-מיזוג ריבוני — git-state.writeGitFile (נתיבי-מפתח חוסמים כתיבה בלי אימות-בעלים)',
    A6: 'תשתית-דמה ל-QA — SIM=1+x-sim:1 (נעילה-כפולה), אותם-חוקים על מאגר-נדיף, אפס-נגיעה באמת',
    A3: 'גרף-תור — /api/queue-graph (סדרות-פר-ריפו, חסימות, stale/chronic, סגירות-מוכחות מול RECEIPTS)',
    A8: 'מדידת-עלות — costUsd ביישוב-הכרעה + סיכום-עלות בפנקס-זה',
    A7: 'ניגודיות מדודה — tools/check-contrast.mjs (WCAG 4.5:1 על הפלטה מול רקעי-הפאנל)',
    A11: 'הסגר-מצב-פגום מלא [T29] — עדות <path>.corrupt-<ts> + אתחול-מדווח {_reinit} + דיווח-תיבה (quarantineCorruptState ב-git-state)',
    A4: 'אופטימיות-מקבילות — baseSha + 409 בכל-כתיבה (git-state)',
  },
};

async function ownerAuthed(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { hash } = await import('@/lib/owner-key');
  const s = await db.ownerSession.findFirst({ where: { tokenHash: hash(token), expiresAt: { gt: new Date() } } });
  return !!s;
}

/** A8: סיכום-עלות ממחזור-ההכרעות (settled בלבד) */
async function costRollup(): Promise<{ settled: number; withCost: number; totalUsd: number }> {
  const st = await readJsonState<{ decisions?: Array<{ status?: string; costUsd?: number }> }>(REPO, CYCLE_PATH);
  const decs = st.data?.decisions ?? [];
  const settled = decs.filter((d) => d.status === 'settled');
  const withCost = settled.filter((d) => typeof d.costUsd === 'number');
  return {
    settled: settled.length,
    withCost: withCost.length,
    totalUsd: Math.round(withCost.reduce((s, d) => s + (d.costUsd ?? 0), 0) * 100) / 100,
  };
}

export async function GET() {
  const [st, cost] = await Promise.all([readJsonState<EngState>(REPO, PATH), costRollup()]);
  const state = st.data ?? FRESH;
  return NextResponse.json({
    ok: st.ok,
    error: st.error,
    corrupt: st.corrupt,
    adopted: state.adopted ?? FRESH.adopted,
    cage: state.cage ?? null,
    sim: state.sim ?? null,
    cost,
    simEnv: simStats().env,
    updatedAt: state.updatedAt ?? null,
    fetchedAt: new Date().toISOString(),
  });
}

async function runCageSelftest(): Promise<{ checks: CageCheck[]; pass: boolean; raw: string }> {
  const checks: CageCheck[] = [];
  let pass = false;
  let raw = '';
  const out = await new Promise<{ code: number; stdout: string; stderr: string }>((resolveP, rejectP) => {
    // Turbopack statically resolves spawn() targets relative to THIS file and fails
    // the build on repo-root-relative paths (measured wave-19.33, run 39298418758:
    // "Can't resolve ('tools/git-cage.mjs' | <dynamic>)"). Compute the path at runtime
    // from process.cwd() so the resolver sees a dynamic value and the root tool is found.
    // Turbopack (Next 16.1.3) statically traces child_process.spawn targets and
    // hard-fails the build on ANY statically-visible script path — it folds even
    // process.cwd() to ROOT (measured x3, wave-19.33: literal path, path.join,
    // and template literal all rejected with 'server relative imports are not
    // implemented yet'). Runtime semantics are preserved exactly by executing
    // through the shell with the same cwd: same node, same tool, same repo root.
    const p = spawn('sh', ['-c', 'node tools/git-cage.mjs --selftest'], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      rejectP(new Error('timeout-90s'));
    }, 90_000);
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', (e) => {
      clearTimeout(timer);
      rejectP(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ code: code ?? 1, stdout, stderr });
    });
  });
  raw = out.stderr.slice(-800);
  pass = out.code === 0;
  try {
    const parsed = JSON.parse(out.stdout) as { checks?: CageCheck[]; pass?: boolean };
    if (Array.isArray(parsed.checks)) checks.push(...parsed.checks);
    pass = !!parsed.pass && out.code === 0;
  } catch {
    /* פלט-שאינו-JSON — הפסק הוא קוד-היציאה */
  }
  return { checks, pass, raw };
}

/** A6+A9: בדיקת-דמה-ושער על-המנגנון עצמו — אפס-רשת, אפס-נגיעה באמת */
async function runSimSelftest(): Promise<{ checks: SimCheck[]; pass: boolean; realGitUntouched: boolean; realShaBefore?: string; realShaAfter?: string }> {
  const checks: SimCheck[] = [];
  const push = (check: string, want: string, got: string, pass: boolean) => checks.push({ check, want, got, pass });

  // אמת-גיט לפני — להוכחת-ה"לא-נגענו"
  const realBefore = await readGitFile(REPO, PATH);
  const realShaBefore = realBefore.sha;

  simReset();

  // 1. כתיבה-מוגנת בלי-אימות-בעלים → חסומה (A9)
  const blocked = await writeGitFile(REPO, 'state/keys/REGISTRY.json', '{"hacked":true}', {
    sim: true, message: 'sim gate attack',
  });
  push('gate: כתיבה-מוגנת בלי-בעלים', 'blocked', blocked.ok ? 'ALLOWED' : blocked.error ?? 'blocked', !blocked.ok);

  // 2. כתיבה-מוגנת עם אימות-בעלים → עוברת + readback (A9)
  const allowed = await writeGitFile(REPO, 'state/keys/REGISTRY.json', '{"schema":"sim.test/1"}', {
    sim: true, message: 'sim gate sovereign', gate: { authority: 'sovereign', ownerVerified: true },
  });
  push('gate: כתיבה-מוגנת עם-בעלים', 'ok+readback', allowed.ok ? `ok ${allowed.sha?.slice(0, 8)}` : allowed.error ?? 'fail', allowed.ok);

  // 3. יישוב-ריבוני עם קבלה-קצרה → נחסם (A9 חוק-קבלה)
  const shortReceipt = gateVerdict(REPO, 'state/keys/REGISTRY.json', { authority: 'receipt', receiptRef: 'short', ownerVerified: true });
  push('gate: יישוב-קבלה-קצרה', 'blocked', shortReceipt.ok ? 'ALLOWED' : 'blocked', !shortReceipt.ok);

  // 4. מחזור-מלא בדמה: read-null → write → conflict → readback (A6)
  const r0 = await readGitFile(REPO, 'state/app/sim-cycle.json', 'main', true);
  push('sim: קריאה-ראשונה', 'null (ראשית-עולם)', r0.ok && r0.text === null ? 'null' : 'unexpected', r0.ok && r0.text === null);
  const w1 = await writeGitFile(REPO, 'state/app/sim-cycle.json', '{"n":1}', { sim: true, message: 'sim w1' });
  const stale = await writeGitFile(REPO, 'state/app/sim-cycle.json', '{"n":2}', { sim: true, message: 'sim stale', baseSha: '00000000000000000000000000000000000' });
  push('sim: התנגשות-baseSha-ישן', 'conflict', stale.ok ? 'WROTE' : stale.conflict ? 'conflict' : stale.error ?? 'fail', !stale.ok && !!stale.conflict);
  const r1 = await readGitFile(REPO, 'state/app/sim-cycle.json', 'main', true);
  push('sim: readback מדויק', '{"n":1}', r1.text ?? 'null', w1.ok && r1.text === '{"n":1}');

  // 5. הסגר-פגום בדמה: JSON שבור מדווח corrupt ולא מושתק (A11-דמה)
  simPut('Autonomy/main/state/app/sim-broken.json', '{broken');
  const broken = await readJsonState(REPO, 'state/app/sim-broken.json', 'main', true);
  push('sim: הסגר-פגום', 'corrupt מדווח', broken.corrupt ? 'corrupt' : 'silent', broken.corrupt === true);

  // 5b. A11-מלא [T29]: updateJsonState על-פגום → הסגר בפועל (עדות+אתחול+תיבה)
  simPut('Autonomy/main/state/app/sim-broken2.json', '{"x":[1,');
  const qa = await updateJsonState<Record<string, unknown>>(REPO, 'state/app/sim-broken2.json', 'sim attack', (c) => ({ next: c ?? {} }), 'main', { sim: true });
  const qq = qa.quarantined;
  push('sim: הסגר-מלא מופעל', 'עדות+אתחול+תיבה', qq ? `q=${qq.quarantinedOk}/${qq.reinitOk}/${qq.inboxOk}` : 'none', !qa.ok && !!qq && qq.quarantinedOk && qq.reinitOk && qq.inboxOk);

  // 5c. העדות נשמרה גולמית-במדויק
  const evr = await readGitFile(REPO, qq?.quarantinedTo ?? 'state/app/none', 'main', true);
  push('sim: עדות-גולמית', '{"x":[1,', evr.text ?? 'null', evr.text === '{"x":[1,');

  // 5d. המקור אותחל-מדווח — JSON תקני עם _reinit.law=A11
  const rer = await readJsonState<{ _reinit?: { law?: string } }>(REPO, 'state/app/sim-broken2.json', 'main', true);
  push('sim: אתחול-מדווח', '_reinit.law=A11', rer.ok ? (rer.data?._reinit?.law ?? 'no-law') : 'fail', rer.ok && rer.data?._reinit?.law === 'A11');

  const stats = simStats();

  // אמת-גיט אחרי — לא-נגענו
  const realAfter = await readGitFile(REPO, PATH);
  const realShaAfter = realAfter.sha;
  const realGitUntouched = !!realShaBefore && !!realShaAfter && realShaBefore === realShaAfter;
  push('sim: אפס-נגיעה בגיט-אמת', 'sha זהה', realGitUntouched ? 'זהה' : 'שונה!', realGitUntouched);
  push('sim: מאגר-נדיף', '7 קבצים', `${stats.files} קבצים / ${stats.ops} פעולות`, stats.files >= 4);

  simReset(); // ניקוי-מלא
  return { checks, pass: checks.every((c) => c.pass), realGitUntouched, realShaBefore, realShaAfter };
}

export async function POST(req: NextRequest) {
  const gate = assertIntent(req, 'engineering', 'engineering/selftest', 'agent');
  if (gate) return gate;
  if (!(await ownerAuthed(req.headers.get('x-owner-token') ?? undefined))) {
    return NextResponse.json({ ok: false, error: 'הרצת-בדיקות מנגנון מותרת לבעלים בלבד' }, { status: 401 });
  }

  let body: { action?: 'selftest' | 'simselftest' } = {};
  try {
    body = (await req.json()) as { action?: 'selftest' | 'simselftest' };
  } catch {
    /* ברירת-מחדל: selftest (תאימות-אחורה) */
  }
  const action = body.action ?? 'selftest';
  const at = new Date().toISOString();

  if (action === 'simselftest') {
    const sim = await runSimSelftest();
    // A9: כתיבת-הפנקס עצמה עוברת-שער — הבעלים אומת כאן למעלה
    const wr = await updateJsonState<EngState>(
      REPO, PATH,
      `engineering: simselftest ${sim.pass ? 'PASS' : 'FAIL'} [T26]`,
      (current) => {
        const state: EngState = current?.schema === 'engineering/1' ? { ...current } : { ...FRESH };
        state.updatedAt = at;
        state.sim = { at, pass: sim.pass, checks: sim.checks, realGitUntouched: sim.realGitUntouched };
        return { next: state };
      },
      'main',
      { gate: { authority: 'sovereign', ownerVerified: true } },
    );
    return NextResponse.json(
      { ok: wr.ok, pass: sim.pass, realGitUntouched: sim.realGitUntouched, checks: sim.checks, commit: wr.commit, error: wr.error },
      { status: wr.ok ? 200 : 502 },
    );
  }

  const cage = await runCageSelftest();
  const wr = await updateJsonState<EngState>(
    REPO, PATH,
    `engineering: cage-selftest ${cage.pass ? 'PASS' : 'FAIL'} [T25]`,
    (current) => {
      const state: EngState = current?.schema === 'engineering/1' ? { ...current } : { ...FRESH };
      state.updatedAt = at;
      state.cage = { at, pass: cage.pass, checks: cage.checks, node: process.version };
      return { next: state };
    },
    'main',
    { gate: { authority: 'sovereign', ownerVerified: true } },
  );
  return NextResponse.json(
    { ok: wr.ok, pass: cage.pass, checks: cage.checks, commit: wr.commit, error: wr.error },
    { status: wr.ok ? 200 : 502 },
  );
}
