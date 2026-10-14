/**
 * Engineering.tsx — פנקס-ההנדסה (T25): המנגנונים-שאומצו מהרוסט, חיים.
 * ---------------------------------------------------------------------------
 * לא-סיסמאות — מנגנונים עם מדידה:
 *   · כלוב-הגיט (A2)     — בדיקה-עצמית מדודה (רשת-מתה, תקרה-מחזיקה, עבודה-מקומית-חיה).
 *   · מחזור-הכרעות (A1)  — לוח-חי: question→answer→settle(עם-קבלת-אפקט)→reopen.
 *   · סשנים (A12)        — מי קם, כמה פעמים הסנדבוקס מת וההתאמה-מחדש נמדדה.
 *   · שער-הכוונות (A5)   — החוק פעיל על כל-הכתיבות.
 * כל-כתיבה: x-intent + אופטימיות-גיט; reopen/selftest = בעלים-בלבד (טוקן-סשן).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, GitBranch, History, Gauge } from 'lucide-react';

const OWNER_TOKEN_KEY = 'owner-session-token';

type CageCheck = { check: string; want: string; got: string; pass: boolean };
type EngData = {
  ok: boolean;
  error?: string | null;
  adopted?: Record<string, string>;
  cage?: { at: string; pass: boolean; checks: CageCheck[]; node: string } | null;
  updatedAt?: string | null;
  fetchedAt: string;
};
type CycleAnswer = { by: string; text: string; at: string; sideEffect?: string };
type CycleDecision = {
  id: string;
  title: string;
  why?: string;
  kind: string;
  status: 'question' | 'answered' | 'settled' | 'reopened';
  openedAt: string;
  answers: CycleAnswer[];
  receiptRef?: string;
  settledAt?: string;
  reopenedAt?: string;
  reopenNote?: string;
};
type CycleData = {
  ok: boolean;
  error?: string | null;
  state?: { updatedAt: string; decisions: CycleDecision[] };
  health?: { total: number; question: number; answered: number; settled: number; reopened: number };
  fetchedAt: string;
};
type AgentSession = { key: string; sessionId: string; startedAt: string; lastSeenAt: string; reattachments: number; host?: string };
type SessionsData = {
  ok: boolean;
  error?: string | null;
  sessions?: AgentSession[];
  health?: { total: number; reattached: number; live12h: number };
  fetchedAt: string;
};

const fresh = (iso?: string | null) => {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const m = Math.round(ms / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק'`;
  return `לפני ${Math.round(m / 60)} שע'`;
};

const statusLabel: Record<CycleDecision['status'], string> = {
  question: 'שאלה',
  answered: 'נענה',
  settled: 'יושב',
  reopened: 'נפתח-מחדש',
};
const statusColor: Record<CycleDecision['status'], string> = {
  question: 'var(--st-attention)',
  answered: 'var(--accent,#b88a3a)',
  settled: 'var(--st-ok)',
  reopened: 'var(--st-danger)',
};

const intentHeaders = (intent: string, owner?: boolean): HeadersInit => {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'x-intent': intent };
  if (owner) {
    const t = typeof window !== 'undefined' ? sessionStorage.getItem(OWNER_TOKEN_KEY) : null;
    if (t) h['x-owner-token'] = t;
  }
  return h;
};

export function Engineering() {
  const [eng, setEng] = useState<EngData | null>(null);
  const [cycle, setCycle] = useState<CycleData | null>(null);
  const [sessions, setSessions] = useState<SessionsData | null>(null);
  const [msg, setMsg] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'fail'; text?: string }>({ kind: 'idle' });
  const [askOpen, setAskOpen] = useState(false);
  const [askTitle, setAskTitle] = useState('');
  const [askWhy, setAskWhy] = useState('');
  const [formFor, setFormFor] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answerBy, setAnswerBy] = useState('');
  const [answerEffect, setAnswerEffect] = useState('');
  const [receipt, setReceipt] = useState('');
  const [reopenNote, setReopenNote] = useState('');

  const loadEng = useCallback(async () => {
    try {
      const r = await fetch('/api/engineering', { cache: 'no-store' });
      if (r.ok) setEng((await r.json()) as EngData);
    } catch { /* כשל-שקט */ }
  }, []);
  const loadCycle = useCallback(async () => {
    try {
      const r = await fetch('/api/decisions-cycle', { cache: 'no-store' });
      if (r.ok) setCycle((await r.json()) as CycleData);
    } catch { /* כשל-שקט */ }
  }, []);
  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/sessions', { cache: 'no-store' });
      if (r.ok) setSessions((await r.json()) as SessionsData);
    } catch { /* כשל-שקט */ }
  }, []);

  useEffect(() => {
    // מדגם-חי: מדידה-ראשונה (אסינכרונית מתוך-טיימר) + סקר-כל-90 שנ'
    const poll = () => {
      void loadEng();
      void loadCycle();
      void loadSessions();
    };
    const first = setTimeout(poll, 0);
    const iv = setInterval(poll, 90_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [loadEng, loadCycle, loadSessions]);

  // A12 חי: הפאנל עצמו נרשם/מתחבר-מחדש — המונה עולה בכל-פתיחה
  useEffect(() => {
    void (async () => {
      try {
        await fetch('/api/sessions', {
          method: 'POST',
          headers: intentHeaders('sessions/attach'),
          body: JSON.stringify({ lane: 'panel', agent: 'engineering' }),
        });
        void loadSessions();
      } catch { /* שקט */ }
    })();
  }, [loadSessions]);

  async function cyclePost(body: Record<string, unknown>, intent: string, owner = false) {
    if (msg.kind === 'busy') return;
    setMsg({ kind: 'busy' });
    try {
      const res = await fetch('/api/decisions-cycle', {
        method: 'POST',
        headers: intentHeaders(intent, owner),
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; commit?: string; error?: string; reason?: string };
      if (j.ok) {
        setMsg({ kind: 'ok', text: `בוצע-על-הגיט (${(j.commit ?? '').slice(0, 7) || '✓'})` });
        setFormFor(null);
        setAskOpen(false);
        setAskTitle('');
        setAskWhy('');
        setAnswerText('');
        setReceipt('');
        setReopenNote('');
        void loadCycle();
      } else {
        setMsg({ kind: 'fail', text: j.error ?? j.reason ?? `http-${res.status}` });
      }
    } catch (e) {
      setMsg({ kind: 'fail', text: String(e).slice(0, 60) });
    }
  }

  async function runSelftest() {
    if (msg.kind === 'busy') return;
    setMsg({ kind: 'busy', text: 'מריץ בדיקת-כלוב…' });
    try {
      const res = await fetch('/api/engineering', {
        method: 'POST',
        headers: intentHeaders('engineering/selftest', true),
      });
      const j = (await res.json()) as { ok?: boolean; pass?: boolean; error?: string };
      setMsg({ kind: j.ok && j.pass ? 'ok' : 'fail', text: j.ok ? (j.pass ? 'הכלוב אומת 6/6 ✓' : `הכלוב נכשל: ${j.error ?? 'מדוד'}`) : j.error ?? 'כשל' });
      void loadEng();
    } catch (e) {
      setMsg({ kind: 'fail', text: String(e).slice(0, 60) });
    }
  }

  const ownerToken = typeof window !== 'undefined' ? !!sessionStorage.getItem(OWNER_TOKEN_KEY) : false;

  return (
    <div className="text-[12px]">
      {msg.kind !== 'idle' && (
        <p className={`mb-2 text-[11px] ${msg.kind === 'fail' ? 'text-red-400' : msg.kind === 'ok' ? '' : 'text-[color:var(--ink-3)]'}`} style={msg.kind === 'ok' ? { color: 'var(--st-ok)' } : undefined}>
          {msg.text ?? '…'}
        </p>
      )}

      {/* ── המנגנונים-שאומצו ── */}
      <section className="mb-3 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">המנגנונים-שאומצו מהרוסט — חיים-ומדודים</span>
          <span className="text-[10px] text-[color:var(--ink-3)]">{fresh(eng?.updatedAt) ?? '—'}</span>
        </div>
        <ul className="mt-1 space-y-0.5 text-[10.5px] text-[color:var(--ink-2)]">
          {Object.entries(eng?.adopted ?? { A2: 'כלוב-גיט', A5: 'שער-כוונות', A1: 'מחזור-הכרעות', A12: 'המשכיות-סשן', A10: 'רוטציית-יומנים' }).map(([id, what]) => (
            <li key={id} className="flex items-start gap-1.5">
              <ShieldCheck size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--st-ok)' }} aria-hidden="true" />
              <span><b>{id}</b> — {what}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── כלוב-הגיט (A2) ── */}
      <section className="mb-3 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-semibold"><GitBranch size={13} aria-hidden="true" /> כלוב-הגיט לסוכנים (A2)</span>
          {eng?.cage && (
            <span className="text-[10.5px] font-bold" style={{ color: eng.cage.pass ? 'var(--st-ok)' : 'var(--st-danger)' }}>
              {eng.cage.pass ? `PASS ${eng.cage.checks.length}/${eng.cage.checks.length}` : 'FAIL — נמדד'}
            </span>
          )}
        </div>
        {!eng && <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">טוען מדידת-כלוב…</p>}
        {eng?.cage ? (
          <>
            <p className="mt-1 text-[10px] text-[color:var(--ink-3)]">
              {fresh(eng.cage.at) ?? ''} · node {eng.cage.node} · רשת-חסומה · תקרה-מחזיקה · עבודה-מקומית-חיה
            </p>
            <ul className="mt-1 space-y-0.5 text-[10px]">
              {eng.cage.checks.map((c) => (
                <li key={c.check} className="flex items-center justify-between gap-2 rounded border border-[color:var(--line)] px-1.5 py-0.5">
                  <span className="font-mono">{c.check}</span>
                  <span style={{ color: c.pass ? 'var(--st-ok)' : 'var(--st-danger)' }}>{c.pass ? '✓' : '✗'} {c.got.slice(0, 28)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : eng ? (
          <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">עדיין-לא-נמדד — הריצו בדיקה-עצמית (בעלים).</p>
        ) : null}
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={runSelftest}
            disabled={msg.kind === 'busy'}
            className="flex min-h-[30px] items-center gap-1 rounded border border-[color:var(--line)] px-2 py-1 text-[10.5px] font-semibold transition hover:brightness-110 disabled:opacity-50"
          >
            <RefreshCw size={11} aria-hidden="true" /> הרץ-בדיקת-כלוב {ownerToken ? '' : '(דורש כניסת-בעלים)'}
          </button>
          <span className="text-[9.5px] text-[color:var(--ink-3)]">node tools/git-cage.mjs --selftest</span>
        </div>
      </section>

      {/* ── מחזור-הכרעות (A1) ── */}
      <section className="mb-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[11.5px] font-bold text-[color:var(--ink-2)]"><Gauge size={13} aria-hidden="true" /> מחזור-ההכרעות — question→answer→settle(קבלת-אפקט)→reopen</h3>
          {cycle?.health && (
            <span className="text-[10px] text-[color:var(--ink-3)]">
              ש{cycle.health.question} · נ{cycle.health.answered} · י{cycle.health.settled} · פ{cycle.health.reopened}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAskOpen((v) => !v)}
          className="mb-1.5 min-h-[32px] w-full rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 text-[11.5px] font-semibold transition hover:brightness-110"
        >
          {askOpen ? 'ביטול' : '+ פתיחת-שאלה-חדשה (נרשמת-על-הגיט)'}
        </button>
        {askOpen && (
          <div className="mb-2 space-y-1.5 rounded-md border border-[color:var(--line)] p-2">
            <input
              value={askTitle}
              onChange={(e) => setAskTitle(e.target.value)}
              placeholder="כותרת-השאלה (מינימום 4 תווים)"
              aria-label="כותרת-שאלה"
              className="w-full rounded border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2 py-1.5 text-[11.5px] outline-none"
            />
            <input
              value={askWhy}
              onChange={(e) => setAskWhy(e.target.value)}
              placeholder="למה (אופציונלי)"
              aria-label="למה"
              className="w-full rounded border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2 py-1.5 text-[11.5px] outline-none"
            />
            <button
              type="button"
              disabled={askTitle.trim().length < 4 || msg.kind === 'busy'}
              onClick={() => void cyclePost({ action: 'ask', title: askTitle, why: askWhy, kind: 'ops' }, 'decisions-cycle/ask')}
              className="min-h-[30px] w-full rounded bg-[color:var(--accent,#b88a3a)] px-2 text-[11px] font-bold text-black disabled:opacity-50"
            >
              שאל — על-הגיט
            </button>
          </div>
        )}
        {!cycle && <p className="text-[10.5px] text-[color:var(--ink-3)]">טוען מחזור…</p>}
        {cycle?.error && <p className="text-[10.5px] text-red-400">{cycle.error}</p>}
        {cycle?.state?.decisions.length === 0 && <p className="text-[10.5px] text-[color:var(--ink-3)]">אין-הכרעות — פתחו שאלה ראשונה.</p>}
        <ul className="space-y-1">
          {(cycle?.state?.decisions ?? []).map((d) => (
            <li key={d.id} className="rounded-md border border-[color:var(--line)] p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium leading-snug">{d.title}</span>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ color: statusColor[d.status], border: `1px solid ${statusColor[d.status]}` }}>
                  {statusLabel[d.status]}
                </span>
              </div>
              {d.why && <span className="mt-0.5 block text-[10px] text-[color:var(--ink-3)]">{d.why}</span>}
              <span className="mt-0.5 block text-[9.5px] text-[color:var(--ink-3)]">
                {d.id} · נפתח {fresh(d.openedAt) ?? '—'} · תשובות {d.answers.length}
                {d.receiptRef ? ` · קבלה: ${d.receiptRef.slice(0, 24)}` : ''}
                {d.reopenNote ? ` · פתיחה-מחדש: ${d.reopenNote.slice(0, 40)}` : ''}
              </span>
              {d.answers.slice(-1).map((a, i) => (
                <span key={i} className="mt-1 block rounded bg-[color:var(--surface-2)] px-1.5 py-1 text-[10px]">
                  <b>{a.by}</b>: {a.text.slice(0, 110)}
                  {a.sideEffect ? ` · אפקט: ${a.sideEffect.slice(0, 50)}` : ''}
                </span>
              ))}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(d.status === 'question' || d.status === 'reopened') && (
                  <button type="button" onClick={() => setFormFor(formFor === `${d.id}-a` ? null : `${d.id}-a`)} className="min-h-[28px] rounded border border-[color:var(--line)] px-2 py-0.5 text-[10.5px] font-semibold hover:brightness-110">
                    השב
                  </button>
                )}
                {d.status === 'answered' && (
                  <button type="button" onClick={() => { setFormFor(formFor === `${d.id}-s` ? null : `${d.id}-s`); setReceipt(''); }} className="min-h-[28px] rounded border border-[color:var(--line)] px-2 py-0.5 text-[10.5px] font-semibold hover:brightness-110">
                    יישב-בקבלה
                  </button>
                )}
                {d.status === 'settled' && (
                  <button type="button" onClick={() => setFormFor(formFor === `${d.id}-r` ? null : `${d.id}-r`)} className="min-h-[28px] rounded border border-[color:var(--line)] px-2 py-0.5 text-[10.5px] font-semibold hover:brightness-110">
                    פתח-מחדש {ownerToken ? '' : '(בעלים)'}
                  </button>
                )}
              </div>
              {formFor === `${d.id}-a` && (
                <div className="mt-1.5 space-y-1.5 rounded border border-[color:var(--line)] p-2">
                  <input value={answerBy} onChange={(e) => setAnswerBy(e.target.value)} placeholder="מי (שם-סוכן/בעלים)" aria-label="מי-עונה" className="w-full rounded border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2 py-1.5 text-[11px] outline-none" />
                  <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="התשובה (חובה)" aria-label="תשובה" rows={2} className="w-full resize-none rounded border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2 py-1.5 text-[11px] outline-none" />
                  <input value={answerEffect} onChange={(e) => setAnswerEffect(e.target.value)} placeholder="אפקט-שבוצע (אופציונלי)" aria-label="אפקט" className="w-full rounded border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2 py-1.5 text-[11px] outline-none" />
                  <button type="button" disabled={answerText.trim().length < 2 || msg.kind === 'busy'} onClick={() => void cyclePost({ action: 'answer', id: d.id, by: answerBy || 'owner', text: answerText, sideEffect: answerEffect }, 'decisions-cycle/answer')} className="min-h-[28px] w-full rounded bg-[color:var(--accent,#b88a3a)] text-[10.5px] font-bold text-black disabled:opacity-50">
                    ענה — על-הגיט
                  </button>
                </div>
              )}
              {formFor === `${d.id}-s` && (
                <div className="mt-1.5 space-y-1.5 rounded border border-[color:var(--line)] p-2">
                  <input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="קבלת-אפקט (commit/receipt — מינימום 8 תווים)" aria-label="קבלת-אפקט" className="w-full rounded border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2 py-1.5 text-[11px] outline-none" />
                  <button type="button" disabled={receipt.trim().length < 8 || msg.kind === 'busy'} onClick={() => void cyclePost({ action: 'settle', id: d.id, receiptRef: receipt }, 'decisions-cycle/settle')} className="min-h-[28px] w-full rounded bg-[color:var(--accent,#b88a3a)] text-[10.5px] font-bold text-black disabled:opacity-50">
                    יישב — אין-סגירה-בלי-ראיה
                  </button>
                </div>
              )}
              {formFor === `${d.id}-r` && (
                <div className="mt-1.5 space-y-1.5 rounded border border-[color:var(--line)] p-2">
                  <input value={reopenNote} onChange={(e) => setReopenNote(e.target.value)} placeholder="למה נפתח-מחדש (אופציונלי)" aria-label="הערת-פתיחה" className="w-full rounded border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2 py-1.5 text-[11px] outline-none" />
                  <button type="button" disabled={msg.kind === 'busy'} onClick={() => void cyclePost({ action: 'reopen', id: d.id, reopenNote }, 'decisions-cycle/reopen', true)} className="min-h-[28px] w-full rounded bg-[color:var(--accent,#b88a3a)] text-[10.5px] font-bold text-black disabled:opacity-50">
                    פתח-מחדש (בעלים-בלבד)
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── סשנים (A12) ── */}
      <section className="mb-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[11.5px] font-bold text-[color:var(--ink-2)]"><History size={13} aria-hidden="true" /> המשכיות-סשנים — שורדת-סנדבוקס (A12)</h3>
          {sessions?.health && (
            <span className="text-[10px] text-[color:var(--ink-3)]">
              {sessions.health.total} סשנים · {sessions.health.reattached} התאמות-מחדש · {sessions.health.live12h} חיים-12ש
            </span>
          )}
        </div>
        {!sessions && <p className="text-[10.5px] text-[color:var(--ink-3)]">טוען סשנים…</p>}
        {sessions?.error && <p className="text-[10.5px] text-red-400">{sessions.error}</p>}
        <ul className="space-y-0.5 text-[10px]">
          {(sessions?.sessions ?? []).slice(0, 8).map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2 rounded border border-[color:var(--line)] px-1.5 py-1">
              <span className="font-mono">{s.key}</span>
              <span className="text-[color:var(--ink-3)]">
                {s.sessionId} · ר{`${s.reattachments}`}x · {fresh(s.lastSeenAt) ?? '—'}
              </span>
            </li>
          ))}
        </ul>
        {sessions && sessions.sessions?.length === 0 && <p className="text-[10.5px] text-[color:var(--ink-3)]">הפאנל נרשם-אוטומטית — רעננו.</p>}
      </section>
    </div>
  );
}
