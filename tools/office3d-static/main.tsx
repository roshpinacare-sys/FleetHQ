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
import { director, phaseOfJerusalem, type PresetId } from '@/lib/hq/world';
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

// ─────────────── v5-P2⑦·⑥·⑤ — מקורות-החיים הציבוריים (אפס-המצאה) ───────────────
// office-live.json (ספרים·צוות·משמרות) · office-events.jsonl (פס-פעילות) ·
// sovereign-decisions.jsonl (הכרעה-ריבונית אחרונה). הכל raw ציבורי CORS=* —
// מה שלא נטען מוצג ככשל/— לעולם לא ירוק-מזויף.
const RAW_AGENTS = 'https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/agents/';

interface OfficeLive {
  status?: string;
  generatedAt?: string;
  shifts?: { total?: number; lastShiftAt?: string };
  crew?: { total?: number };
  books?: { total?: number; fresh?: number; stale?: number };
}
interface OfficeEvent { ts?: number; type?: string; agentId?: string; text?: string }
interface SovereignDecision { ts?: string; decision?: string; reason?: string; tier?: string }

/** זנב-JSONL זול: Range 64KB מהסוף (CDN תומך) — נפילה לקריאה-מלאה כשנדחה */
async function fetchJsonlTail(url: string, want: number): Promise<string[]> {
  let text = '';
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { Range: 'bytes=-131072' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    text = await res.text();
    if (res.status !== 206) {
      // ה-CDN החזיר הכל (200) — אצלנו זה בסדר, רק כבד יותר; חותכים מהסוף
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
      return lines.slice(-want);
    }
  } catch {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    text = await res.text();
  }
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.slice(-want);
}

interface LifeData {
  live: OfficeLive | null;
  liveErr: string | null;
  events: OfficeEvent[];
  eventsErr: string | null;
  decision: SovereignDecision | null;
  decisionErr: string | null;
}

const LIFE_EMPTY: LifeData = { live: null, liveErr: null, events: [], eventsErr: null, decision: null, decisionErr: null };

function useOfficeLife(): LifeData {
  const [data, setData] = useState<LifeData>(LIFE_EMPTY);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next: LifeData = { ...LIFE_EMPTY };
      try {
        const r = await fetch(RAW_AGENTS + 'office-live.json', { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        next.live = (await r.json()) as OfficeLive;
      } catch (e) {
        next.liveErr = String(e).slice(0, 60);
      }
      try {
        const lines = await fetchJsonlTail(RAW_AGENTS + 'office-events.jsonl', 14);
        next.events = lines
          .map((l) => {
            try { return JSON.parse(l) as OfficeEvent; } catch { return { text: l } as OfficeEvent; }
          })
          .reverse();
      } catch (e) {
        next.eventsErr = String(e).slice(0, 60);
      }
      try {
        const lines = await fetchJsonlTail(RAW_AGENTS + 'sovereign-decisions.jsonl', 1);
        next.decision = lines.length ? (JSON.parse(lines[0]) as SovereignDecision) : null;
      } catch (e) {
        next.decisionErr = String(e).slice(0, 60);
      }
      if (alive) setData(next);
    };
    void load();
    const iv = setInterval(() => void load(), 5 * 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return data;
}

// ─────────────── v5-P2⑦ — שעון-ירושלים + פאזת-משמרת (חוק-הפאזות הקנוני) ───────────────
function Clock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const time = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(now);
  const phase = phaseOfJerusalem(now);
  return (
    <span className="hud-clock" title="שעון-ירושלים · פאזת-המשמרת הקנונית">
      <b>{time}</b>
      <span className="ph">{phase.he}</span>
    </span>
  );
}

// ─────────────── v5-P2⑦ — צ'יפ-אמת: ספרים חיים · אזהרות נמדדות ───────────────
function LifeChips({ data }: { data: LifeData }) {
  const live = data.live;
  const books = live?.books;
  const stale = typeof books?.stale === 'number' ? books.stale : null;
  const fresh = typeof books?.fresh === 'number' ? books.fresh : null;
  const total = typeof books?.total === 'number' ? books.total : null;
  const alive = live?.status === 'ALIVE';
  return (
    <>
      <span
        className={'hud-chip tone-' + (alive ? (stale ? 'attention' : 'ok') : 'danger')}
        title={data.liveErr ? 'office-live לא נטען — ' + data.liveErr : 'מדידה: agents/office-live.json'}
        role="status"
        aria-live="polite"
      >
        <span className="dot" aria-hidden="true" />
        {live ? `ספרים ${fresh ?? '—'}/${total ?? '—'} חיים · צוות ${live.crew?.total ?? '—'}` : 'ספרים לא ידוע'}
      </span>
      {stale !== null && stale > 0 && (
        <span className="hud-chip tone-attention" title="ספרים שעברו חלון-טריות (נמדד)">
          <span className="dot" aria-hidden="true" />
          {stale} ספרים ישנים
        </span>
      )}
    </>
  );
}

// ─────────────── v5-P2⑥ — פס-פעילות תחתון (יומן-האירועים האמיתי + הכרעה ריבונית) ───────────────
function Ticker({ data }: { data: LifeData }) {
  const segs: string[] = [];
  const d = data.decision;
  if (d?.decision) {
    const t = d.ts ? new Date(d.ts).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) : '';
    segs.push(`הכרעה ריבונית ${t} — ${d.decision}${d.reason ? ' · ' + d.reason.split(':')[0] : ''}`);
  }
  for (const e of data.events.slice(0, 12)) {
    const t = e.ts ? new Date(e.ts).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) : '';
    const who = e.agentId ?? '';
    const txt = e.text ?? '';
    if (txt) segs.push(`${t} · ${who} · ${txt}`);
  }
  if (data.eventsErr) segs.push('יומן-האירועים לא נטען — ' + data.eventsErr);
  return (
    <div className="hud-ticker" role="marquee" aria-label="פס-פעילות חי מיומן-האירועים">
      <span className="hud-ticker-tag">חי</span>
      <div className="track">
        {segs.length === 0 ? (
          <span className="seg">—</span>
        ) : (
          [...segs, ...segs].map((s, i) => (
            <span className="seg" key={i} dir="rtl">{s}</span>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────── HUD ───────────────
type Chip = { tone: 'ok' | 'attention' | 'danger'; label: string } | null;

function TopBar({ chip, life }: { chip: Chip; life: LifeData }) {
  return (
    <div className="hud-top">
      <span className="hud-title">
        מפקדת הצי
        <span className="en">FLEET HQ · 3D</span>
      </span>
      <Clock />
      {chip && (
        <span className={'hud-chip tone-' + chip.tone} role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          {chip.label}
        </span>
      )}
      <LifeChips data={life} />
      <a className="hud-link" href="../index.html">
        מעבר לחלון-החי הדו-ממדי
      </a>
      <a className="hud-link" href="./fallback.html" title="גרסת-טקסט מלאה — בלי תלת-מימד (fallback כן)">
        גרסת-טקסט
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
  const life = useOfficeLife();
  return (
    <>
      <div className="stage">
        <Office3D />
      </div>
      <StaticAdapter onChip={setChip} />
      <TopBar chip={chip} life={life} />
      <PresetDeck />
      <Ticker data={life} />
      <Loader />
    </>
  );
}

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
