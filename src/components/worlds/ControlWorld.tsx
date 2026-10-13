/**
 * ControlWorld.tsx — עולם-הבקרה: מישור-הבקרה של הצי (GridWatch). [T-watch]
 * ---------------------------------------------------------------------------
 * העיניים שהיו חסרות: כל-ריפו, כל-workflow, כל-ריצה — נמדדים כל 30 דק' בענן
 * GitHub (אפס-תלות בסנדבוקס). כשלים שקטים הופכים לגלויים: סטריקים, חסימות-חיוב,
 * שתיקה מול-הקצב, וריפוי-עצמי מתועד. כנות-מלאה: אין ירוק-מאולתש — רק מה שנמדד.
 */
'use client';

import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Wrench, ShieldAlert, CheckCircle2, CircleDot } from 'lucide-react';
import type { WorldsPayload, FleetHealthWire, FleetRepoWire, FleetWorkflowWire } from '@/lib/worlds/types';
import { WorldUnavailable } from './WorldShell';

const HEALTH_HE: Record<string, string> = { ok: 'תקין', amber: 'מוקדם-שים-לב', red: 'אדום' };

function ageHe(ts?: string | null): string {
  if (!ts) return '—';
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return '—';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m} דק'`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} שע׳` : `${Math.floor(h / 24)} ימ׳`;
}

function HealthDot({ h, size = 9 }: { h: string; size?: number }) {
  const color = h === 'red' ? '#b3402f' : h === 'amber' ? '#c98a1b' : '#3BA08F';
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

function WfRow({ w }: { w: FleetWorkflowWire }) {
  const color = w.health === 'red' ? '#b3402f' : w.health === 'amber' ? '#c98a1b' : 'var(--ink-2)';
  return (
    <li className="flex items-start gap-2 py-[3px] text-[11.5px] leading-snug">
      <HealthDot h={w.health} />
      <span className="min-w-0 flex-1">
        <span style={{ color }} className="font-semibold">{w.name}</span>
        {w.cron ? <span className="ms-1.5 text-[10px] text-[color:var(--ink-3)]" title="קצב מתוכנן">⏱ {w.cron}</span> : null}
        {w.note ? <span className="ms-1 text-[color:var(--ink-3)]">— {w.note}</span> : null}
        {w.lastRunAt ? <span className="ms-1 text-[10px] text-[color:var(--ink-3)]">({ageHe(w.lastRunAt)} מהריצה האחרונה)</span> : null}
      </span>
    </li>
  );
}

function RepoCard({ r }: { r: FleetRepoWire }) {
  const [open, setOpen] = useState(r.health === 'red');
  const interesting = r.workflows.filter((w) => w.health !== 'ok');
  const border = r.health === 'red' ? '#b3402f66' : r.health === 'amber' ? '#c98a1b55' : 'var(--line)';
  return (
    <div className="rounded-xl border bg-[color:var(--surface-2)]" style={{ borderColor: border }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-start"
      >
        <HealthDot h={r.health === 'ok' ? 'ok' : r.health} size={10} />
        <span className="text-[13px] font-bold text-[color:var(--ink)]">{r.name}</span>
        {r.private ? <span className="rounded bg-[color:var(--surface)] px-1 py-px text-[9.5px] text-[color:var(--ink-3)]">פרטי</span> : null}
        <span className="ms-auto flex items-center gap-2 text-[11px] text-[color:var(--ink-2)]">
          <span className="tabular-nums text-[#b3402f]">{r.counts.red}</span>
          <span className="tabular-nums text-[#c98a1b]">{r.counts.amber}</span>
          <span className="tabular-nums text-[#3BA08F]">{r.counts.green}</span>
          <span className="text-[color:var(--ink-3)]">· נדחף {ageHe(r.pushedAt)}</span>
        </span>
      </button>
      {open && interesting.length > 0 ? (
        <ul className="border-t border-[color:var(--line)] px-3 py-1.5">
          {interesting.map((w) => <WfRow key={w.name} w={w} />)}
        </ul>
      ) : null}
      {open && interesting.length === 0 ? (
        <p className="border-t border-[color:var(--line)] px-3 py-2 text-[11.5px] text-[color:var(--ink-3)]">
          כל {r.counts.workflows} ה-workflows בריאים.
        </p>
      ) : null}
    </div>
  );
}

export function ControlWorld({ p }: { p: WorldsPayload | null }) {
  const fh: FleetHealthWire | undefined = p?.fleetHealth?.data;
  const [onlyProblems, setOnlyProblems] = useState(true);

  const repos = useMemo(() => {
    const all = fh?.repos ?? [];
    return all
      .slice()
      .sort((a, b) => {
        const rank = (h: string) => (h === 'red' ? 0 : h === 'amber' ? 1 : 2);
        return rank(a.health) - rank(b.health) || b.counts.red - a.counts.red;
      })
      .filter((r) => (onlyProblems ? r.health !== 'ok' : true));
  }, [fh, onlyProblems]);

  const billingBlocked = useMemo(
    () => (fh?.repos ?? []).flatMap((r) => r.workflows).filter((w) => w.class === 'billing-blocked'),
    [fh],
  );
  const remediations = fh?.remediations ?? [];
  const alerts = fh?.alerts ?? [];

  if (!p) return <WorldUnavailable what="מישור-הבקרה" />;
  if (!p.fleetHealth?.ok || !fh?.totals) return <WorldUnavailable what="מישור-הבקרה (GridWatch — state/fleet-health.json)" />;

  const t = fh.totals;
  const healthPct = t.workflows ? Math.round((t.green / t.workflows) * 100) : 0;

  return (
    <div className="h-full w-full overflow-y-auto sl-scroll" dir="rtl">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5">
        {/* כותרת-אמת */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="sl-chip border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[12.5px] font-bold text-[color:var(--ink)]">
            <Activity className="me-1.5 inline h-3.5 w-3.5 text-[#3BA08F]" aria-hidden />
            מישור-הבקרה · GridWatch
          </span>
          <span className="text-[11.5px] text-[color:var(--ink-3)]">
            מדידה אוטונומית כל {fh.cadenceMin ?? 30} דק' בענן GitHub · עודכן {ageHe(fh.generatedAt)} זהב
          </span>
          <span className="ms-auto text-[11px] text-[color:var(--ink-3)]">מקור: GridWatch/state/fleet-health.json</span>
        </div>

        {/* סה״כ הצי */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
            <div className="text-[10.5px] text-[color:var(--ink-3)]">ריפואים בצי</div>
            <div className="text-[20px] font-black tabular-nums text-[color:var(--ink)]">{t.repos}</div>
            <div className="text-[10.5px] text-[color:var(--ink-3)]">{t.public} ציבוריים · {t.private} פרטיים</div>
          </div>
          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
            <div className="text-[10.5px] text-[color:var(--ink-3)]">Workflows נמדדים</div>
            <div className="text-[20px] font-black tabular-nums text-[color:var(--ink)]">{t.workflows}</div>
            <div className="text-[10.5px] text-[color:var(--ink-3)]">{healthPct}% ירוקים</div>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: t.red ? '#b3402f66' : 'var(--line)', background: t.red ? '#b3402f0d' : 'var(--surface-2)' }}>
            <div className="text-[10.5px] text-[color:var(--ink-3)]">אדומים (כישלון חוזר)</div>
            <div className="text-[20px] font-black tabular-nums" style={{ color: t.red ? '#b3402f' : '#3BA08F' }}>{t.red}</div>
            <div className="text-[10.5px] text-[color:var(--ink-3)]">ריפוי-עצמי פעיל</div>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: t.amber ? '#c98a1b55' : 'var(--line)', background: t.amber ? '#c98a1b0d' : 'var(--surface-2)' }}>
            <div className="text-[10.5px] text-[color:var(--ink-3)]">מוקדם-שים-לב</div>
            <div className="text-[20px] font-black tabular-nums" style={{ color: t.amber ? '#c98a1b' : '#3BA08F' }}>{t.amber}</div>
            <div className="text-[10.5px] text-[color:var(--ink-3)]">flaky · שתיקה · חדלים</div>
          </div>
        </div>

        {/* חסימת-חיוב — הערה שקטה שהייתה בלתי-נראית עד עכשיו */}
        {billingBlocked.length > 0 ? (
          <div className="mb-3 rounded-xl border border-[#b3402f66] bg-[#b3402f0f] p-3">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-bold" style={{ color: '#b3402f' }}>
              <ShieldAlert className="h-4 w-4" aria-hidden />
              חסימת-חיוב GitHub — jobs לא מתחילים בכלל ({billingBlocked.length})
            </div>
            <p className="text-[11.5px] leading-relaxed text-[color:var(--ink-2)]">
              זו החלטה ברמת-הבעלים (חיוב/מכסה) — הריבונות לא יכולה לתקן אותה לבד; היא מדווחת ומדלגת על ריפוי-מזויף.
              נמדד: {billingBlocked.map((w) => w.name).join(', ')}
            </p>
          </div>
        ) : null}

        {/* ריפוי-עצמי מתועד */}
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-[color:var(--ink)]">
              <Wrench className="h-3.5 w-3.5 text-[#3BA08F]" aria-hidden /> ריפוי-עצמי במחזור האחרון ({remediations.length})
            </div>
            {remediations.length === 0 ? (
              <p className="text-[11.5px] text-[color:var(--ink-3)]">אין פעולות במחזור זה — לא נמצאו כשלים לתיקון-אוטונומי.</p>
            ) : (
              <ul className="max-h-36 space-y-1 overflow-y-auto sl-scroll pe-1">
                {remediations.slice(0, 30).map((r, i) => (
                  <li key={i} className="text-[11px] leading-snug text-[color:var(--ink-2)]">
                    <span className="font-semibold">{r.repo}/{r.workflow}</span> — {r.action}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-[color:var(--ink)]">
              <AlertTriangle className="h-3.5 w-3.5 text-[#c98a1b]" aria-hidden /> התראות חדשות לריבונות ({alerts.length})
            </div>
            {alerts.length === 0 ? (
              <p className="text-[11.5px] text-[color:var(--ink-3)]">אין אדומים חדשים — הערוץ רגוע.</p>
            ) : (
              <ul className="max-h-36 space-y-1 overflow-y-auto sl-scroll pe-1">
                {alerts.slice(0, 30).map((a, i) => (
                  <li key={a.key ?? i} className="text-[11px] leading-snug text-[color:var(--ink-2)]">
                    <span className="font-semibold">{a.repo}{a.workflow ? `/${a.workflow}` : ''}</span> — {a.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* מצב-צפייה */}
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={() => setOnlyProblems((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
              onlyProblems
                ? 'border-[color:var(--line)] bg-[color:var(--surface-2)] text-[color:var(--ink-2)]'
                : 'border-[#3BA08F66] bg-[#3BA08F14] text-[#3BA08F]'
            }`}
          >
            {onlyProblems ? `רק בעיות (${(fh.repos ?? []).filter((r) => r.health !== 'ok').length}/${fh.repos.length} ריפואים)` : `כל הריפואים (${fh.repos.length})`}
          </button>
          <span className="text-[11px] text-[color:var(--ink-3)]">קצב ה-watch: כל {fh.cadenceMin ?? 30} דק' · גרסה {fh.version ?? 1}</span>
        </div>

        {/* ריפואים */}
        {repos.length === 0 ? (
          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[#3BA08F]" aria-hidden />
            <p className="text-[13px] font-bold text-[color:var(--ink)]">הצי כולו ירוק</p>
            <p className="text-[11.5px] text-[color:var(--ink-3)]">כל {t.workflows} ה-workflows נמדדו תקינים במחזור האחרון.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {repos.map((r) => <RepoCard key={r.name} r={r} />)}
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-[10.5px] leading-relaxed text-[color:var(--ink-3)]">
          <CircleDot className="h-3 w-3" aria-hidden />
          חוק-אמת: כל שורה כאן נמדדה מ-API של GitHub במחזור האחרון של GridWatch — לא השערה, לא זיכרון. ריפוי-עצמי מוגבל להיפוך-מלא; חסימות-חיוב וכשלים חוזרים עוברים לריבונות.
        </p>
      </div>
    </div>
  );
}
