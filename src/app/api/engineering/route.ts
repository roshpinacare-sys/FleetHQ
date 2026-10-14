/**
 * /api/engineering — פנקס-ההנדסה: מדידות-המנגנונים שאומצו (A2/A5/A1/A12). [T25]
 * ---------------------------------------------------------------------------
 * · GET — מצב-המנגנונים מהגיט (Autonomy state/app/engineering.json): בדיקת-הכלוב
 *   האחרונה, חוק-השער, סדר-האימוצים מפסק-הדין.
 * · POST (selftest) — מריץ את בדיקת-הכלוב בפועל (spawn ללא-shell, תם-נמלך 90 שנ')
 *   ורושם את הפסק על הגיט עם readback. רק-בעלים מריץ (ספון-תהליך = הרשאה).
 * אין-כאן הצהרות: מה שלא נמדד — לא מוצג.
 */
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { db } from '@/lib/db';
import { assertIntent } from '@/lib/intent-gate';
import { readJsonState, updateJsonState } from '@/lib/git-state';

export const revalidate = 0;

const REPO = 'Autonomy';
const PATH = 'state/app/engineering.json';

interface CageCheck {
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
  adopted: Record<string, string>;
}
const FRESH: EngState = {
  schema: 'engineering/1',
  updatedAt: '',
  cage: null,
  adopted: {
    A2: 'כלוב-גיט לתהליכי-סוכן — tools/git-cage.mjs (protocol=never, מלכודת-insteadOf, תקרה)',
    A5: 'שער-כוונות לולאתי — src/lib/intent-gate.ts (same-origin + x-intent + דלי-אסימונים)',
    A1: 'מחזור-הכרעות עם-אפקט — /api/decisions-cycle (answer→side-effect→settle→reopen, אופטימיות-גיט)',
    A12: 'המשכיות-סשן שורדת-סנדבוקס — /api/sessions (reattach נמדד בגיט)',
    A10: 'רוטציית-יומנים — חסמים בכל-כתיבות המצב (40/200 שורות)',
  },
};

async function ownerAuthed(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { hash } = await import('@/lib/owner-key');
  const s = await db.ownerSession.findFirst({ where: { tokenHash: hash(token), expiresAt: { gt: new Date() } } });
  return !!s;
}

export async function GET() {
  const st = await readJsonState<EngState>(REPO, PATH);
  const state = st.data ?? FRESH;
  return NextResponse.json({
    ok: st.ok,
    error: st.error,
    corrupt: st.corrupt,
    adopted: state.adopted ?? FRESH.adopted,
    cage: state.cage ?? null,
    updatedAt: state.updatedAt ?? null,
    fetchedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const gate = assertIntent(req, 'engineering', 'engineering/selftest', 'agent');
  if (gate) return gate;
  if (!(await ownerAuthed(req.headers.get('x-owner-token') ?? undefined))) {
    return NextResponse.json({ ok: false, error: 'הרצת-בדיקת-הכלוב מותרת לבעלים בלבד' }, { status: 401 });
  }

  const checks: CageCheck[] = [];
  let verdict = { pass: false, raw: '' };
  try {
    const out = await new Promise<{ code: number; stdout: string; stderr: string }>((resolveP, rejectP) => {
      const p = spawn('node', ['tools/git-cage.mjs', '--selftest'], {
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
    verdict = { pass: out.code === 0, raw: out.stderr.slice(-800) };
    try {
      const parsed = JSON.parse(out.stdout) as { checks?: CageCheck[]; pass?: boolean };
      if (Array.isArray(parsed.checks)) checks.push(...parsed.checks);
      verdict.pass = !!parsed.pass && out.code === 0;
    } catch {
      /* פלט-שאינו-JSON — הפסק הוא קוד-היציאה */
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'spawn-failed' }, { status: 500 });
  }

  const at = new Date().toISOString();
  const wr = await updateJsonState<EngState>(REPO, PATH, `engineering: cage-selftest ${verdict.pass ? 'PASS' : 'FAIL'} [T25]`, (current) => {
    const state: EngState = current?.schema === 'engineering/1' ? { ...current } : { ...FRESH };
    state.updatedAt = at;
    state.cage = { at, pass: verdict.pass, checks, node: process.version };
    return { next: state };
  });
  return NextResponse.json(
    { ok: wr.ok, pass: verdict.pass, checks, commit: wr.commit, error: wr.error },
    { status: wr.ok ? 200 : 502 },
  );
}
