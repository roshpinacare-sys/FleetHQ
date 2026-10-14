/**
 * Panels.tsx — פאנלי-החדר האמיתיים. [T22]
 * ---------------------------------------------------------------------------
 * קודם לכן לחיצות-התחנות בחדר היו עיוורות — setPanel קרא לפונקציות-ממשק
 * שאף-אחד לא חיבר, ודוכן-ההחלטות והקבלה היו רהיטים שקטים. מעכשיו לכל-תחנה
 * יש פאנל אמיתי עם נתונים אמיתיים בלבד:
 * · דוכן ההחלטות → פנקס-הכרעות חי (ops-intake · ops-forge · הפורמן · ערוץ-הריבונות)
 * · הקבלה       → פקידת-המבקרים עם זיכרון אמת ומסירת-פניות לריבונות
 * · שולחן-סוכן  → תיק-מומחה (תחום, סמכות, משמעת, מצב נמדד)
 * · הלוח / קיר-הגיט / הספרייה → הנתונים החיים שכבר זורמים לחנות
 * פאנל-אחד בכל-רגע, Esc סוגר, כנות-מלאה בכשל — שום דבר לא מומצא.
 */
'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertTriangle, BookOpen, GitCommitHorizontal, Gavel, Send, ShieldQuestion, UserRound, X } from 'lucide-react';
import { useHq } from '@/lib/hq/store';
import { useRoomPanels } from '@/lib/hq/panels';
import { ageLabel, useDecisions } from '@/lib/hq/decisions';
import { CLERK, CREW_FALLBACK, EXPERTS } from '@/lib/hq/protocol';
import { SEMANTIC_VAR, TASK_SEMANTIC } from './tokens';

// ─────────────── רכיבי-יסוד משותפים ───────────────
const PanelShell = memo(function PanelShell({ title, sub, icon, onClose, children, wide }: {
  title: string; sub?: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <aside
      dir="rtl"
      role="dialog"
      aria-label={title}
      className="sl-panel pointer-events-auto fixed bottom-24 z-30 flex flex-col overflow-hidden shadow-2xl end-2 start-2 sm:bottom-16 sm:end-3 sm:start-auto"
      style={{ width: wide ? 'min(96vw, 560px)' : 'min(96vw, 420px)', maxHeight: 'min(72dvh, 640px)' }}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color:var(--accent-dim)] text-[color:var(--accent)]">{icon}</span>
          <div className="min-w-0 leading-tight">
            <h2 className="truncate text-[13.5px] font-bold text-[color:var(--ink)]">{title}</h2>
            {sub && <p className="truncate text-[11px] text-[color:var(--ink-3)]">{sub}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="סגירת הפאנל"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[color:var(--line)] text-[color:var(--ink-2)] transition hover:bg-[color:var(--surface)]">
          <X size={14} aria-hidden />
        </button>
      </header>
      <div className="sl-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
});

const FreshChip = memo(function FreshChip({ fetchedAt, stale, error, label }: {
  fetchedAt: string | null; stale?: boolean; error?: string | null; label?: string;
}) {
  if (error) {
    return <span className="sl-chip border-[color:var(--st-danger)]/40 bg-[color:var(--st-danger)]/10 text-[10.5px] font-semibold" style={{ color: 'var(--st-danger)' }}>מקור לא נענה</span>;
  }
  if (!fetchedAt) return null;
  const age = ageLabel(fetchedAt) ?? '';
  return (
    <span className="sl-chip border-[color:var(--line)] bg-[color:var(--surface)] text-[10.5px] font-semibold" style={{ color: stale ? 'var(--st-attention)' : 'var(--ink-3)' }}>
      {label ?? 'מקור'} · {age}{stale ? ' · עתיק' : ''}
    </span>
  );
});

const SeverityChip = memo(function SeverityChip({ sev }: { sev?: string }) {
  const s = sev ?? 'P2';
  const color = s === 'P0' ? 'var(--st-danger)' : s === 'P1' ? 'var(--st-attention)' : 'var(--st-neutral)';
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-wide" style={{ color, border: `1px solid ${color}`, backgroundColor: 'color-mix(in srgb, currentColor 8%, transparent)' }}>
      {s}
    </span>
  );
});

// ─────────────── דוכן ההחלטות — פנקס-הכרעות חי ───────────────
const DecisionDesk = memo(function DecisionDesk() {
  const close = useRoomPanels((s) => s.close);
  const d = useDecisions();
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force((n) => n + 1), 30_000); return () => clearInterval(iv); }, []);

  // סדר-הצגה מקצועי: החמורות קודם (P0 → P3), ואז החדשות
  const sevRank = (s?: string) => (s === 'P0' ? 0 : s === 'P1' ? 1 : s === 'P2' ? 2 : 3);
  const openOrders = (d.queue?.items ?? []).filter((o) => o.status === 'OPEN')
    .slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const foremanOpen = (d.foreman?.items ?? []).filter((x) => x.status === 'open');

  return (
    <PanelShell
      title="דוכן ההחלטות — פנקס הכרעות"
      sub="מה פתוח · מה בוצע עם קבלה · מה מוסלק לריבונות"
      icon={<Gavel size={15} aria-hidden />}
      onClose={close}
      wide
    >
      <div className="space-y-4 p-3.5">
        {/* פתוחות — סדרי-עבודה מהמדידה בענן */}
        <section aria-label="סדרי-עבודה פתוחים">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">פתוחות</h3>
            {d.queue && <FreshChip fetchedAt={d.queue.fetchedAt} stale={d.queue.staleData} error={d.queue.ok ? null : d.queue.error} label="ops-intake" />}
            {d.queue?.ok && (
              <span className="text-[11px] font-semibold" style={{ color: d.queue.p0 > 0 ? 'var(--st-danger)' : 'var(--ink-3)' }}>
                {d.queue.open} פתוחים · {d.queue.p0} P0 · {d.queue.p1} P1
              </span>
            )}
          </div>
          {!d.loaded && <p className="text-[12px] text-[color:var(--ink-3)]">הפנקס נטען מהמקורות…</p>}
          {d.loaded && d.queue && !d.queue.ok && (
            <p className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--st-danger)' }}>
              <AlertTriangle size={13} aria-hidden /> מקור סדרי-העבודה לא נענה — לא יוצג דבר במקומו
            </p>
          )}
          {d.queue?.ok && openOrders.length === 0 && (
            <p className="text-[12px] text-[color:var(--ink-2)]">אין סדרי-עבודה פתוחים — המדידה בענן לא מצאה דבר שדורש הכרעה כרגע.</p>
          )}
          <ul className="space-y-2">
            {openOrders.slice(0, 6).map((o) => (
              <li key={o.id} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)]/70 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <SeverityChip sev={o.severity} />
                  <span className="truncate text-[12.5px] font-bold text-[color:var(--ink)]" title={o.title}>{o.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-[color:var(--ink-3)]">
                  <span className="font-semibold">{o.repo}</span>
                  <span>{o.kind}</span>
                  <span>{ageLabel(o.firstSeen)}</span>
                </div>
                {o.why && <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-5 text-[color:var(--ink-2)]">{o.why}</p>}
              </li>
            ))}
          </ul>
        </section>

        {/* בוצעו עם קבלה — ops-forge */}
        <section aria-label="הכרעות שבוצעו">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">בוצעו · עם קבלה</h3>
            {d.receipts && <FreshChip fetchedAt={d.receipts.fetchedAt} stale={d.receipts.staleData} error={d.receipts.ok ? null : d.receipts.error} label="ops-forge" />}
          </div>
          {d.receipts?.ok && d.receipts.items.length === 0 && (
            <p className="text-[12px] text-[color:var(--ink-2)]">עדיין אין קבלות ביצוע — המבצע בענן טרם רשם הכרעות.</p>
          )}
          <ul className="space-y-1.5">
            {(d.receipts?.items ?? []).slice(0, 7).map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex items-baseline gap-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)]/60 px-3 py-2 text-[11.5px] leading-5">
                <span className="shrink-0 font-mono text-[10px] text-[color:var(--ink-3)]">{r.orderId ?? '—'}</span>
                <span className="min-w-0 flex-1 truncate text-[color:var(--ink-2)]" title={r.result}>{r.result ?? r.recipe}</span>
                <span className="shrink-0 text-[10px] text-[color:var(--ink-3)]">{ageLabel(r.at)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* הסלמות לריבונות — ערוץ פרטי מאומת-שרת */}
        <section aria-label="הסלמות לריבונות">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">מוסלק לריבונות</h3>
            {d.sovereign && <FreshChip fetchedAt={d.sovereign.fetchedAt} stale={d.sovereign.staleData} error={d.sovereign.ok ? null : d.sovereign.error} label="ערוץ-ריבונות" />}
          </div>
          {d.sovereign?.ok && d.sovereign.items.length === 0 && (
            <p className="text-[12px] text-[color:var(--ink-2)]">אין הסלמות פתוחות בערוץ-הריבונות.</p>
          )}
          <ul className="space-y-1.5">
            {(d.sovereign?.items ?? []).slice(0, 5).map((e, i) => (
              <li key={`${e.at}-${i}`} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)]/60 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: 'var(--st-info)' }}>
                  <ShieldQuestion size={11} aria-hidden />
                  <span>{e.source ?? 'סוכן'}</span>
                  <span className="text-[color:var(--ink-3)]">{e.kind} · {ageLabel(e.at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-[color:var(--ink-2)]">{e.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* הכרעות-הפורמן — מהמשרד עצמו */}
        {(d.foreman?.ok && (foremanOpen.length > 0 || d.foreman.items.length > 0)) && (
          <section aria-label="הכרעות המשרד">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">הכרעות-המשרד</h3>
              <FreshChip fetchedAt={d.foreman.fetchedAt} stale={d.foreman.staleData} label="הפורמן" />
            </div>
            <ul className="space-y-1.5">
              {d.foreman.items.slice(0, 6).map((f, i) => (
                <li key={f.id ?? i} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)]/60 px-3 py-2 text-[11.5px] leading-5">
                  <span className="font-semibold text-[color:var(--ink)]">{f.title ?? f.text ?? 'הכרעה'}</span>
                  <span className="ms-2 rounded-md bg-[color:var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[color:var(--ink-3)]">{f.status ?? '—'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.error && (
          <p className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--st-attention)' }}>
            <AlertTriangle size={12} aria-hidden /> הפנקס לא התרענן במחזור-האחרון ({d.error}) — מוצג המדידה-הקודמת
          </p>
        )}
      </div>
    </PanelShell>
  );
});

// ─────────────── פקידת-המבקרים — נועה בקבלה ───────────────
interface ClerkMsg { id: string; role: 'visitor' | 'clerk'; text: string; at: number }
interface ClerkRouted { id: string; subject: string }
const EMPTY_LOGS: never[] = [];

const ClerkChat = memo(function ClerkChat() {
  const close = useRoomPanels((s) => s.close);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ClerkMsg[]>([]);
  const [pending, setPending] = useState(0);
  const [visits, setVisits] = useState(1);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // זיכרון-המזכירה חי בשרת; המזהה-המקומי של המבקר במכשיר בלבד
  useEffect(() => {
    const saved = localStorage.getItem('visitor-session-id');
    if (!saved) return;
    setSessionId(saved);
    void (async () => {
      try {
        const r = await fetch(`/api/visitor-chat?sessionId=${encodeURIComponent(saved)}`, { cache: 'no-store' });
        const d = await r.json();
        if (d.ok) {
          setMsgs(d.messages.map((m: { role: string; text: string; createdAt: string }, i: number) => ({
            id: `h-${i}`, role: m.role === 'visitor' ? 'visitor' : 'clerk', text: m.text, at: Date.parse(m.createdAt),
          })));
          setPending(d.requests?.filter((r: { status: string }) => r.status === 'awaiting-sovereignty').length ?? 0);
          setVisits(d.visits ?? 1);
        }
      } catch { /* כנות — היסטוריה לא זמינה עכשיו */ }
    })();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setErr(null);
    const localId = `l-${Date.now()}`;
    setMsgs((m) => [...m, { id: localId, role: 'visitor', text, at: Date.now() }]);
    setDraft('');
    try {
      const r = await fetch('/api/visitor-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? 'unavailable');
      setSessionId(d.sessionId);
      localStorage.setItem('visitor-session-id', d.sessionId);
      setMsgs((m) => [...m, { id: `c-${Date.now()}`, role: 'clerk', text: d.reply, at: Date.now() }]);
      if (d.routed) {
        setPending(d.pendingRequests ?? pending + 1);
        setMsgs((m) => [...m, {
          id: `r-${Date.now()}`, role: 'clerk',
          text: `הפנייה נרשמה בפנקס (${d.routed.subject}) והועברה לריבונות לבחינה וסקירה. אין לי גישה להפעלה בפועל — הריבונות זו שתכריע.`,
          at: Date.now(),
        }]);
      }
      setVisits(d.visits ?? visits);
    } catch {
      setErr('הקבלה לא נענתה כרגע — נסו שוב בעוד רגע');
    } finally {
      setSending(false);
    }
  };

  return (
    <PanelShell
      title={`${CLERK.name.he} · ${CLERK.title.he}`}
      sub={visits > 1 ? `ביקור מספר ${visits} — המזכירה זוכרת אתכם` : 'קבלת-מבקרים · זיכרון-שיחה בצד-השרת'}
      icon={<UserRound size={15} aria-hidden />}
      onClose={close}
      wide
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* גבול-הסמכות — מוצג תמיד, בלי-יוצאים */}
        <div className="shrink-0 border-b border-[color:var(--line)] bg-[color:var(--surface)]/70 px-3.5 py-2 text-[10.5px] leading-4 text-[color:var(--ink-3)]">
          <span className="font-semibold text-[color:var(--ink-2)]">סמכות:</span> {CLERK.can.join(' · ')}.
          <span className="font-semibold" style={{ color: 'var(--st-attention)' }}> {CLERK.cannot[0]}</span> — כל-פנייה תפעולית נרשמת ומוסרת לריבונות לבחינה.
          {pending > 0 && <span className="ms-1 font-semibold" style={{ color: 'var(--st-attention)' }}>({pending} פניות ממתינות)</span>}
        </div>
        <div ref={logRef} className="sl-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3.5" style={{ maxHeight: '38dvh' }}>
          {msgs.length === 0 && (
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)]/70 px-3 py-2.5 text-[12.5px] leading-6 text-[color:var(--ink-2)]">
              ברוכים-הבאים למשרד. אפשר לשאול מה קורה כאן וברשת, לבקש ניסוח או טיוטת-תוכן, או להשאיר פנייה שתועבר לריבונות. מה אני יכולה לעזור?
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'visitor' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[86%] rounded-xl border px-3 py-2 text-[12.5px] leading-6 ${
                m.role === 'visitor'
                  ? 'border-[color:var(--line)] bg-[color:var(--surface-2)]/80 text-[color:var(--ink)]'
                  : 'bg-[color:var(--accent-dim)] border-transparent text-[color:var(--ink)]'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {sending && <div className="text-end text-[11px] text-[color:var(--ink-3)]">המזכירה כותבת…</div>}
          {err && <div className="text-end text-[11.5px]" style={{ color: 'var(--st-danger)' }}>{err}</div>}
        </div>
        <div className="flex shrink-0 items-end gap-2 border-t border-[color:var(--line)] p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={2}
            placeholder="כתבו למזכירת המשרד… (Enter = שליחה)"
            aria-label="הודעה למזכירת המשרד"
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[color:var(--accent)]"
          />
          <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()}
            aria-label="שליחת הודעה"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white transition hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}>
            <Send size={15} aria-hidden />
          </button>
        </div>
      </div>
    </PanelShell>
  );
});

// ─────────────── תיק-מומחה — דף-אישי של סוכן ───────────────
/** מצב-הסוכן בעברית — לעולם לא מפתח-גלמי בממשק */
const STATE_HE: Record<string, string> = {
  idle: 'פנוי', thinking: 'חושב', reading: 'קורא', checking: 'בודק', writing: 'כותב',
  walking: 'בדרך', waiting_user: 'ממתין למשוב', blocked: 'חסום', done: 'סיים', error: 'בתקלה',
};
const ExpertDossier = memo(function ExpertDossier({ agentId }: { agentId: string }) {
  const close = useRoomPanels((s) => s.close);
  const crew = useHq((s) => s.snap.crew);
  const agent = useHq((s) => s.snap.agents.find((a) => a.id === agentId));
  const logs = useHq(useShallow((s) => s.snap.logs[agentId]?.slice(-5) ?? EMPTY_LOGS));
  const tasks = useHq(useShallow((s) => s.snap.tasks.filter((t) => t.assignee === agentId && t.status !== 'done' && t.status !== 'cancelled')));
  const member = crew.find((c) => c.id === agentId) ?? CREW_FALLBACK.find((c) => c.id === agentId);
  const expert = EXPERTS[agentId];
  if (!member) return null;
  return (
    <PanelShell
      title={`${member.name.he} · ${member.title.he}`}
      sub={expert?.domain ?? member.specialty.he}
      icon={<UserRound size={15} aria-hidden />}
      onClose={close}
    >
      <div className="space-y-3.5 p-3.5">
        <div className="flex items-center gap-2">
          <span className="sl-dot" style={{ backgroundColor: agent ? SEMANTIC_VAR.working : 'var(--st-neutral)' }} aria-hidden />
          <span className="text-[12px] font-semibold text-[color:var(--ink-2)]">
            מצב נמדד: {agent ? (STATE_HE[agent.state] ?? agent.state) : 'לא ידוע'}{agent?.activity ? ` · ${agent.activity}` : ''}
          </span>
        </div>
        {expert && (
          <>
            <section aria-label="התמחויות">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">התמחות</h3>
              <div className="flex flex-wrap gap-1.5">
                {expert.expertise.map((e) => (
                  <span key={e} className="sl-chip border-[color:var(--line)] bg-[color:var(--surface)] text-[11px] font-semibold text-[color:var(--ink-2)]">{e}</span>
                ))}
              </div>
            </section>
            <section aria-label="סמכות">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">סמכות-הכרעה</h3>
              <p className="text-[12.5px] leading-6 text-[color:var(--ink-2)]">{expert.authority}.</p>
              <p className="mt-1 text-[12.5px] leading-6" style={{ color: 'var(--st-attention)' }}>מוסלק לריבונות: {expert.escalates}.</p>
            </section>
            <section aria-label="משמעת-ביצוע">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">משמעת-הביצוע</h3>
              <ul className="space-y-1">
                {expert.discipline.map((d) => (
                  <li key={d} className="flex items-baseline gap-1.5 text-[12.5px] leading-6 text-[color:var(--ink-2)]">
                    <span aria-hidden style={{ color: 'var(--accent)' }}>▪</span>{d}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        {member.books.length > 0 && (
          <section aria-label="ספרי-עבודה">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">
              <BookOpen size={12} aria-hidden /> ספרי-עבודה
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {member.books.map((b) => <span key={b} className="sl-chip border-[color:var(--line)] bg-[color:var(--surface)] font-mono text-[10.5px] text-[color:var(--ink-2)]">{b}</span>)}
            </div>
          </section>
        )}
        {tasks.length > 0 && (
          <section aria-label="על-השולחן">
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">על-השולחן עכשיו</h3>
            <ul className="space-y-1.5">
              {tasks.slice(0, 4).map((t) => (
                <li key={t.id} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)]/60 px-2.5 py-2 text-[12px] leading-5">
                  <span className="font-semibold" style={{ color: SEMANTIC_VAR[TASK_SEMANTIC[t.status]] }}>●</span>{' '}
                  <span className="text-[color:var(--ink-2)]">{t.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {logs.length > 0 && (
          <section aria-label="יומן-אחרון">
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">יומן-אחרון</h3>
            <ul className="space-y-1">
              {logs.map((l, i) => (
                <li key={i} className="truncate text-[11px] text-[color:var(--ink-3)]" title={l.text}>
                  <span className="font-mono">{new Date(l.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span> · {l.text}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PanelShell>
  );
});

// ─────────────── לוח-המשימות · קיר-הגיט · הספרייה — הנתונים החיים ───────────────
/** מצב-משימה בעברית — אותו חוק שפה */
const TASK_HE: Record<string, string> = {
  todo: 'ממתינה', doing: 'בביצוע', review: 'בביקורת', done: 'בוצעה', blocked: 'חסומה', cancelled: 'בוטלה',
};

const TaskWallPanel = memo(function TaskWallPanel() {
  const close = useRoomPanels((s) => s.close);
  const tasks = useHq((s) => s.snap.tasks);
  const crew = useHq((s) => s.snap.crew);
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const done = tasks.filter((t) => t.status === 'done');
  const nameOf = (id: string | undefined) => crew.find((c) => c.id === id)?.name.he ?? 'לא משויך';
  return (
    <PanelShell title="לוח המשימות" sub={`${open.length} פתוחות · ${done.length} בוצעו — מהפורמן האמיתי`} icon={<Gavel size={15} aria-hidden />} onClose={close} wide>
      <div className="space-y-2 p-3.5">
        {tasks.length === 0 && <p className="text-[12px] text-[color:var(--ink-2)]">הלוח ריק כרגע — הפורמן לא מדווח משימות פתוחות.</p>}
        {open.slice(0, 14).map((t) => (
          <div key={t.id} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)]/60 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-bold" style={{ color: SEMANTIC_VAR[TASK_SEMANTIC[t.status]] }}>{TASK_HE[t.status] ?? t.status}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[color:var(--ink)]" title={t.title}>{t.title}</span>
            </div>
            <div className="mt-0.5 text-[10.5px] text-[color:var(--ink-3)]">{nameOf(t.assignee)} · {ageLabel(t.updatedAt) ?? ''}</div>
          </div>
        ))}
        {done.length > 0 && (
          <p className="pt-1 text-[11px] text-[color:var(--ink-3)]">ועוד {done.length} שהושלמו ונרשמו ביומן.</p>
        )}
      </div>
    </PanelShell>
  );
});

const GitWallPanel = memo(function GitWallPanel() {
  const close = useRoomPanels((s) => s.close);
  const git = useHq((s) => s.snap.git);
  return (
    <PanelShell title="קיר הגיט" sub={git?.repoLabel ? `${git.repoLabel} · main — קומיטים אמיתיים` : 'קומיטים אמיתיים מהרשת'} icon={<GitCommitHorizontal size={15} aria-hidden />} onClose={close} wide>
      <div className="space-y-1.5 p-3.5">
        {!git?.available && <p className="text-[12px] text-[color:var(--ink-2)]">פיד-הגיט לא נענה כרגע — לא יוצג דבר במקומו.</p>}
        {(git?.commits ?? []).map((c) => (
          <div key={c.hash} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)]/60 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-[10.5px]" style={{ color: 'var(--accent)' }}>{c.hash}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--ink-2)]" title={c.subject}>{c.subject}</span>
            </div>
            <div className="mt-0.5 text-[10.5px] text-[color:var(--ink-3)]">{c.author} · {ageLabel(c.ts)} · {c.repo}</div>
          </div>
        ))}
        {git?.available && git.commits.length === 0 && <p className="text-[12px] text-[color:var(--ink-2)]">אין קומיטים טריים להצגה.</p>}
      </div>
    </PanelShell>
  );
});

const LibraryPanel = memo(function LibraryPanel() {
  const close = useRoomPanels((s) => s.close);
  const books = useHq((s) => s.snap.books);
  return (
    <PanelShell title="הספרייה" sub="ספרי-הצי — הזיכרון המוסדי החי" icon={<BookOpen size={15} aria-hidden />} onClose={close}>
      <div className="space-y-1.5 p-3.5">
        {books.length === 0 && <p className="text-[12px] text-[color:var(--ink-2)]">הספרייה עוד לא נטענה מהפורמן — בלי ספרים מדומיינים.</p>}
        {books.slice(0, 30).map((b) => (
          <div key={b.id} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)]/60 px-3 py-2 text-[12px] leading-5">
            <span className="font-semibold text-[color:var(--ink)]">{b.title.he}</span>
            <span className="ms-2 text-[10.5px] text-[color:var(--ink-3)]">{b.category.he}</span>
            {b.heartbeat ? <span className="ms-2 text-[10.5px] text-[color:var(--ink-3)]">{ageLabel(b.heartbeat)}</span> : null}
          </div>
        ))}
      </div>
    </PanelShell>
  );
});

// ─────────────── שכבת-הפאנלים — חיבור החדר לפאנלים ───────────────
export function RoomPanels() {
  const panel = useRoomPanels((s) => s.panel);
  const close = useRoomPanels((s) => s.close);

  useEffect(() => {
    // החיבור-החסר (T22): קליקי-התחנות בחדר פותחים סוף-סוף פאנל אמיתי
    useHq.getState().bindUi({
      selectAgent: (id) => useRoomPanels.getState().open({ kind: 'expert', agentId: id }),
      openTab: (tab) => {
        const open = useRoomPanels.getState().open;
        if (tab === 'podium') open({ kind: 'decisions' });
        else if (tab === 'wall') open({ kind: 'wall' });
        else if (tab === 'git') open({ kind: 'git' });
        else if (tab === 'library') open({ kind: 'library' });
        else open({ kind: 'decisions' }); // flame/lead → פנקס-הריבונות
      },
      openChat: () => useRoomPanels.getState().open({ kind: 'clerk' }),
    });
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useRoomPanels.getState().panel) useRoomPanels.getState().close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (!panel) return null;
  return (
    <>
      {panel.kind === 'decisions' && <DecisionDesk />}
      {panel.kind === 'clerk' && <ClerkChat />}
      {panel.kind === 'expert' && <ExpertDossier agentId={panel.agentId} />}
      {panel.kind === 'wall' && <TaskWallPanel />}
      {panel.kind === 'git' && <GitWallPanel />}
      {panel.kind === 'library' && <LibraryPanel />}
    </>
  );
}
