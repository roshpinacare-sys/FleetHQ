/**
 * main.tsx — עמוד-המשרד הסטטי התמידי (exec-14-3d, מסלול office3d-static).
 * ------------------------------------------------------------------
 * החוויה-המובילה של העמוד-הפומבי (office-pages): החדר התלת-מימדי ישירות —
 * בלי Room3D/ViewDeck (תלות ב-Tailwind/Next) ובלי בקאנד ובלי סודות.
 * · HUD מינימלי-עצמאי (hud.css — משתני-CSS מ-DESIGN.md, RTL, מאפיינים לוגיים):
 *   כפתורי נקודות-תצפית (CAMERA_PRESETS, כולל wall/git), צ'יפ-טריות,
 *   קישור "מעבר לחלון-החי הדו-ממדי" (../index.html); הסיור-המודרך של הבמאי
 *   (11-a) מנוהל בתוך הסצנה — כל קלט מחזיר שליטה,
 *   שכבת-טעינה (useProgress) עד roomReady ואז דוהה.
 * · StaticAdapter: מדיג'סט אמיתי מ-../digest.json (עם נפילה ל-./digest.json)
 *   → חוזה GitPulse — מה שאי-אפשר למלא נשאר '—' בצד-השרת, אף-המצאה.
 *   רענון כל 10 דקות. כשל-גישה → צ'יפ "לא ידוע" (danger), החדר ממשיך להיטען —
 *   כנות-כשל, לעולם לא ירוק-מזויף.
 * · אפס סודות: הכל ניזון מ-digest.json פומבי שמפרסם מסלול office-window.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useProgress } from '@react-three/drei';
import { Office3D } from '@/components/hq/Office3D';
import { CAMERA_PRESETS } from '@/lib/hq/contract';
import { useHq } from '@/lib/hq/store';
import { director, type PresetId } from '@/lib/hq/world';
import { computeFreshness } from '@/components/hq/GitWallData';
import type { GitPulse, RepoFleetView } from '@/components/agent-hq/types';
import { keyMatches, OP_SESSION_KEY } from './operator-gate';
import './hud.css';

// ─────────────── נקודות-תצפית (אותה זרימה של ViewDeck — בלי Tailwind) ───────────────
function selectPreset(id: PresetId) {
  director.preset = id;
  director.focus = null;
  window.dispatchEvent(new CustomEvent('hq-camera-preset', { detail: id }));
}

// ─────────────── חוזה-המדיג'סט (roshpinacare.fleet-digest/1) ───────────────
interface DigestRepo {
  name: string;
  pushedAt?: string | null;
  defaultBranch?: string | null;
  lastRun?: { status?: string | null; conclusion?: string | null } | null;
  commits7d?: number | null;
  commits7dCapped?: boolean | null;
}
interface Digest {
  schema?: string;
  generatedAt?: string;
  repos?: DigestRepo[];
}

/** שליפה כנה: ../digest.json קודם (שורש-הענף שמפרסם מסלול office-window),
 *  נפילה ל-./digest.json (עותק-מקומי לבדיקות), נפילה ל-digest החי המפורסם
 *  ב-raw (CORS=* — מתקן את קיר-האמת בפריסות שאין להן דיג׳סט מקומי), ואז
 *  כישלון-כן. */
async function fetchDigest(): Promise<Digest | null> {
  for (const url of [
    '../digest.json',
    './digest.json',
    'https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/office-pages/digest.json',
  ]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const j = (await res.json()) as Digest;
      if (j && j.schema === 'roshpinacare.fleet-digest/1') return j;
    } catch {
      /* ה-URL הבא */
    }
  }
  return null;
}

/** מדיג'סט → GitPulse. רק מה שנמדד; שדות-חסרים → '—'/null — לעולם לא המצאה. */
function digestToGitPulse(d: Digest): GitPulse {
  const gen = Date.parse(d.generatedAt || '');
  const genMs = Number.isFinite(gen) ? gen : 0;
  const fleet: RepoFleetView[] = (d.repos ?? []).map((r) => ({
    label: r.name,
    dir: '—', // לא נמדד במדיג'סט הפומבי — לא מוצג
    branch: typeof r.defaultBranch === 'string' && r.defaultBranch ? r.defaultBranch : '',
    available: true, // המדיג'סט עצמו זמין — זו האמת
    head: '', // לא נמדד — לא מוצג
    upstreamConfigured: false, // לא נמדד (שדה-חוזה; אינו מוצג בקיר-האמת)
    ahead: null,
    behind: null,
    diverged: null,
    dirtyCount: null,
    lastFetchAt: genMs || null,
    lastSyncError: null,
    syncState: 'unknown', // המצב-הכן: לא נמדד כאן
    lastRunStatus: r.lastRun?.status ?? null,
    lastRunConclusion: r.lastRun?.conclusion ?? null,
    commits7d: typeof r.commits7d === 'number' ? r.commits7d : null,
    commits7dCapped: r.commits7dCapped === true ? true : null,
  }));
  return {
    available: true,
    repoLabel: 'מדיג׳סט ציבורי (office-pages)',
    commits: [], // למדיג'סט אין זרם-קומיטים — '—' ולא המצאה
    lastFetch: genMs, // חותמת-הנמדד של הנתונים (לא זמן-השליפה!) — חוק-הטריות
    fleet,
  };
}

// ─────────────── המתאם-הסטטי ───────────────
const REFRESH_MS = 10 * 60 * 1000; // רענון כל 10 דקות

function StaticAdapter({ onChip }: { onChip: (c: Chip) => void }) {
  useEffect(() => {
    let alive = true;
    // זריעה-כנה טרם-השליפה: סטטי, לא "מתחבר" — המסך לעולם לא ייראה LIVE
    useHq.getState().syncStatus({
      backend: 'static',
      llmProvider: '—',
      message: { he: 'מצב-סטטי — טוען מדיג׳סט…', en: 'static mode — loading digest' },
      startedAt: Date.now(),
      opsDone: 0, // העמוד הזה לא הריץ אף-פעולה — 0 הוא האמת
    });
    useHq.getState().syncConnected(false); // אין סוקט — מנותק מהפורמן, בכנות

    const load = async () => {
      const d = await fetchDigest();
      if (!alive) return;
      if (!d) {
        // כשל-כן: צ'יפ "לא ידוע", החדר ממשיך לרנדר — אף-ירוק-מזויף
        onChip({ tone: 'danger', label: 'לא ידוע' });
        useHq.getState().syncConnected(false);
        return;
      }
      const pulse = digestToGitPulse(d);
      const genMs = pulse.lastFetch;
      useHq.getState().syncGit(pulse);
      const fresh = genMs > 0 && (Date.now() - genMs) / 60000 <= 45;
      useHq.getState().syncStatus({
        backend: 'static',
        llmProvider: '—',
        message: { he: 'מצב-סטטי — מדיג׳סט ' + (fresh ? 'טרי' : 'מיושן'), en: 'static digest mode' },
        startedAt: Date.now(),
        opsDone: 0,
      });
      useHq.getState().syncConnected(false);
      // אותו חוק-טריות אחד של הקיר — אגדה יחידה בכל-המסוף
      const f = computeFreshness(genMs || null);
      onChip({ tone: f.tone, label: f.label });
    };
    void load();
    const iv = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [onChip]);
  return null;
}

// ─────────────── HUD ───────────────
type Chip = { tone: 'ok' | 'attention' | 'danger'; label: string } | null;

function TopBar({ chip }: { chip: Chip }) {
  return (
    <div className="hud-top">
      <span className="hud-title">
        מפקדת הצי
        <span className="en">FLEET HQ · 3D</span>
      </span>
      {chip && (
        <span className={'hud-chip tone-' + chip.tone} role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          {chip.label}
        </span>
      )}
      <a className="hud-link" href="../index.html">
        מעבר לחלון-החי הדו-ממדי
      </a>
      {/* T19-c — כניסת-המנהל המקצועית: עמוד-פקודות נפרד (noindex), כניסה מקומית בלבד */}
      <a className="hud-link" href="./operator.html" title="עמדת-מנהל — ערוץ-הפקודות" aria-label="עמדת-מנהל">
        מנהל
      </a>
      <OperatorDock />
    </div>
  );
}

function PresetDeck() {
  const [active, setActive] = useState<PresetId>(director.preset);
  useEffect(() => {
    const on = (e: Event) => setActive((e as CustomEvent<PresetId>).detail);
    window.addEventListener('hq-camera-preset', on as EventListener);
    return () => window.removeEventListener('hq-camera-preset', on as EventListener);
  }, []);
  return (
    <nav className="hud-deck" aria-label="נקודות תצפית בחדר">
      {CAMERA_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="hud-btn"
          aria-pressed={active === p.id}
          title={p.label.en}
          onClick={() => selectPreset(p.id)}
        >
          {p.label.he}
        </button>
      ))}
      {/* פתיח-סשן: הסיור-המודרך של 11-a נשלט-עצמית — כל קלט מחזיר שליטה;
          אין כפתור-דילוג נפרד (מיזוג exec-14 ∩ 11-a: מנגנון אחד, לא שניים) */}
    </nav>
  );
}

/** שכבת-טעינה: "המשרד נטען… {n}%" — דוהה בפריים-האמיתי הראשון (roomReady) */
function Loader() {
  const { progress } = useProgress();
  const ready = useHq((s) => s.roomReady);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setGone(true), 600); // זמן-הדהיה 500ms + רגע-חסד
    return () => clearTimeout(t);
  }, [ready]);
  if (gone) return null;
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className={'hud-loader' + (ready ? ' done' : '')} role="status" aria-live="polite">
      <div className="box">
        <h1>המשרד נטען… {pct}%</h1>
        <div className="bar" aria-hidden="true">
          <span style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <p>דמויות ותאורה נטענות — זה יימשך רגע</p>
      </div>
    </div>
  );
}

// ─────────────── שער-מפתח-המנהל (אפס-חשיפת-זהות) ───────────────
interface StasisDoc {
  active?: boolean;
  mode?: string;
  stagedLanes?: { allow?: string[] } | null;
}
interface JournalRow {
  at?: string;
  via?: string;
  intent?: string;
  text?: string;
}

/** פאנל-המפעיל: אמת נמדדת בלבד מהספרים הציבוריים — כשל = מוצג ככשל. */
function OperatorPanel() {
  const [stasis, setStasis] = useState<StasisDoc | null>(null);
  const [stasisErr, setStasisErr] = useState('');
  const [rows, setRows] = useState<JournalRow[] | null>(null);
  const [rowsErr, setRowsErr] = useState('');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/agents/STASIS.json', { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = (await r.json()) as StasisDoc;
        if (alive) {
          setStasis(j);
          setStasisErr('');
        }
      } catch (e) {
        if (alive) setStasisErr('מצב-הסטאזיס לא נטען — ' + String(e).slice(0, 60));
      }
      try {
        const r = await fetch('https://raw.githubusercontent.com/roshpinacare-sys/Sandbox/main/ops/office/operator-journal.jsonl', { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const parsed = (await r.text())
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(-7)
          .map((l) => {
            try {
              return JSON.parse(l) as JournalRow;
            } catch {
              return { text: l } as JournalRow;
            }
          })
          .reverse();
        if (alive) {
          setRows(parsed);
          setRowsErr('');
        }
      } catch (e) {
        if (alive) setRowsErr('יומן-הפקודות לא נטען — ' + String(e).slice(0, 60));
      }
    };
    void load();
    const iv = setInterval(() => void load(), 60000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  const lanes = stasis?.stagedLanes?.allow?.length;
  return (
    <>
      <section className="hud-op-sec">
        <div className="hud-op-h">מצב-הריבונות (נמדד)</div>
        {stasisErr ? (
          <p className="bad">{stasisErr}</p>
        ) : (
          <div className="hud-op-row">
            <span className={'tag ' + (stasis?.active ? 'warn' : 'ok')}>{stasis?.active ? 'סטאזיס-מדורג' : 'חופש-פעולה'}</span>
            <span className="mono">
              mode={stasis?.mode ?? '—'} · מסילות {lanes ?? '—'}
            </span>
          </div>
        )}
      </section>
      <section className="hud-op-sec">
        <div className="hud-op-h">יומן-הפקודות (אחרונות)</div>
        {rowsErr ? <p className="bad">{rowsErr}</p> : null}
        {(rows ?? []).map((r, i) => (
          <div key={i} className="hud-op-row">
            <span className="mono">{(r.at ?? '').slice(5, 16).replace('T', ' ')}</span>
            <span>{r.text ?? r.intent ?? ''}</span>
          </div>
        ))}
        {rows && rows.length === 0 && <p className="hint">אין רשומות עדיין.</p>}
      </section>
      <p className="hud-op-note">פקודות ושיחה — בעמדת-המפעיל של אתר-המשרד. המפתח לא נשמר — סגירת-הטאב מנתקת.</p>
    </>
  );
}

function OperatorDock() {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(OP_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !key.trim()) return;
    setBusy(true);
    setErr('');
    const k = key;
    setKey(''); // השדה מתרוקן מיד — המפתח לא נשאר בזיכרון-הדף
    const ok = await keyMatches(k);
    setBusy(false);
    if (ok) {
      try {
        sessionStorage.setItem(OP_SESSION_KEY, '1');
      } catch {
        /* מצב-פרטי — הכניסה לסשן-זה בלבד */
      }
      setUnlocked(true);
    } else {
      setErr('מפתח לא מאומת — שום דבר לא נשמר.');
    }
  }

  function logout() {
    try {
      sessionStorage.removeItem(OP_SESSION_KEY);
    } catch {
      /* כלום */
    }
    setUnlocked(false);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="hud-op-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {unlocked ? 'עמדת-מנהל' : 'מפתח מנהל'}
      </button>
      {open && (
        <div className="hud-op" role="dialog" aria-label="עמדת מפתח-המנהל">
          {!unlocked ? (
            <form onSubmit={submit}>
              <label htmlFor="hq-op-key">כניסת מנהל — הזן מפתח מנהל</label>
              <input
                id="hq-op-key"
                type="password"
                autoComplete="off"
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <div className="row-btns">
                <button type="submit" className="hud-btn" disabled={busy || !key.trim()}>
                  {busy ? 'בודק…' : 'כניסה'}
                </button>
                <button type="button" className="hud-btn hud-btn-ghost" onClick={() => setOpen(false)}>
                  סגור
                </button>
              </div>
              {err && <p className="bad">{err}</p>}
              <p className="hint">המפתח נבדק מקומית בדפדפן, מתרוקן מיד, ולעולם לא נשמר ולא נשלח לשום מקום.</p>
            </form>
          ) : (
            <>
              <OperatorPanel />
              <div className="row-btns">
                <button type="button" className="hud-btn hud-btn-ghost" onClick={logout}>
                  ניתוק
                </button>
                <button type="button" className="hud-btn hud-btn-ghost" onClick={() => setOpen(false)}>
                  סגור
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function App() {
  const [chip, setChip] = useState<Chip>(null);
  return (
    <>
      <div className="stage">
        <Office3D />
      </div>
      <StaticAdapter onChip={setChip} />
      <TopBar chip={chip} />
      <PresetDeck />
      <Loader />
    </>
  );
}

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
