/**
 * NetworkSelf.tsx — מודעות-הרשת (T23): החלון של הבעלים אל-העצמיות של הרשת.
 * ---------------------------------------------------------------------------
 * · מציג רק מה שהאיבר הקנוני בענן (Autonomy/state/selfhood) מדד — אין-המצאה.
 * · פנייה-מהכפתור = ניתוב-אמיתי לגיט הקנוני (claims.jsonl) עם קבלת-commit.
 * · כנות: איבר-טרם-רץ / כשל-אחזור / פעימה-ישנה — הכל מוצג כפי-שהוא.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Send, X } from 'lucide-react';

type SelfCheck = { allVerified?: boolean; at?: string; discoveries?: number; claimsProcessed?: number; brain?: string | { chain?: string[]; wired?: boolean; note?: string } | null; durationMs?: number };
type Summary = {
  measuredAt: string | null;
  organsMeasured: number;
  feedsAlive: number;
  feedsTotal: number;
  sitesOk: number;
  sitesTotal: number;
  activePrivateWorkflows: number | null;
  publicOrgans: number | null;
  topOrgans: Array<{ repo: string; workflow: string; success7d: number; failure7d: number; lastSuccessAgeH: number | null }>;
  feeds: Array<{ label: string; repo: string; alive: boolean; ageH: number | null }>;
};
type Discovery = { kind?: string; repo?: string; note?: string; at?: string };
type Claim = { key?: string; claim?: string; verdict?: { verdictHe?: string; confidence?: string }; brainUsed?: boolean; at?: string };
type NetSelfData = {
  organExists: boolean;
  reason: string | null;
  selfCheck?: SelfCheck | null;
  summary?: Summary | null;
  discoveries: Discovery[];
  claims: Claim[];
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

export function NetworkSelf() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NetSelfData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [claimText, setClaimText] = useState('');
  const [claimState, setClaimState] = useState<{ kind: 'idle' | 'sending' | 'ok' | 'fail'; msg?: string }>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/network-self', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as NetSelfData;
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(`כשל-אחזור (${String(e).slice(0, 40)})`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    timer.current = setInterval(() => void load(), 90_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [open, load]);

  async function sendClaim() {
    const text = claimText.trim();
    if (!text || claimState.kind === 'sending') return;
    setClaimState({ kind: 'sending' });
    try {
      const res = await fetch('/api/network-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const j = (await res.json()) as { ok?: boolean; verified?: boolean; commitSha?: string | null; error?: string };
      if (j.ok && j.verified) {
        setClaimState({ kind: 'ok', msg: `נרשמה-בגיט (${(j.commitSha ?? '').slice(0, 7)}) · הכרעה ≤20 דק'` });
        setClaimText('');
        void load();
      } else {
        setClaimState({ kind: 'fail', msg: j.error ?? 'כשל-לא-ידוע' });
      }
    } catch (e) {
      setClaimState({ kind: 'fail', msg: String(e).slice(0, 60) });
    }
  }

  const beat = data?.selfCheck?.at ? fresh(data.selfCheck.at) : null;
  const beatOk = !!data?.selfCheck?.allVerified;
  const beatColor = !data?.organExists ? 'var(--st-attention)' : beatOk && beat && !beat.includes('שע') ? 'var(--st-ok)' : 'var(--st-attention)';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="network-self-panel"
        className="fixed bottom-4 right-4 z-40 flex h-12 min-w-[44px] items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-4 text-[13px] font-semibold text-[color:var(--ink)] shadow-lg backdrop-blur transition hover:brightness-110"
      >
        <Eye size={15} aria-hidden="true" />
        <span className="hidden sm:inline">מודעות-הרשת</span>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: beatColor }} aria-hidden="true" />
      </button>

      {open && (
        <aside
          id="network-self-panel"
          dir="rtl"
          className="fixed bottom-20 right-4 z-40 flex max-h-[76dvh] w-[min(92vw,400px)] flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)]/98 shadow-2xl backdrop-blur"
          aria-label="מודעות-הרשת"
        >
          <header className="flex items-center justify-between gap-2 border-b border-[color:var(--line)] bg-[color:var(--surface-2)]/90 px-3 py-2">
            <div className="leading-tight">
              <h2 className="text-[13px] font-bold">הרשת מודעת לעצמה</h2>
              <p className="text-[10.5px] text-[color:var(--ink-3)]">Autonomy/selfhood · כל-20-דק' בענן · מדידה-בלבד</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="rounded-md border border-[color:var(--line)] px-2 py-1 text-[11px] hover:brightness-110">
              <X size={14} aria-hidden="true" />
            </button>
          </header>

          <div className="sl-scroll flex-1 overflow-y-auto p-3 text-[12.5px]" style={{ maxHeight: '50dvh' }}>
            {loading && !data && <p className="text-[color:var(--ink-3)]">טוען מדידה…</p>}
            {err && <p className="text-[11.5px] text-red-400">{err}</p>}
            {data && !data.organExists && (
              <p className="rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2.5 text-[12px] text-[color:var(--ink-2)]">
                {data.reason}
              </p>
            )}

            {data?.selfCheck && (
              <section className="mb-3 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">בדיקה-עצמית</span>
                  <span className="text-[11px]" style={{ color: beatColor }}>
                    {beatOk ? '✓ אומת' : '✗ כשל'} · {beat ?? '—'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">
                  גילויים: {data.selfCheck.discoveries ?? '—'} · הכרעות: {data.selfCheck.claimsProcessed ?? '—'} · מוח:{' '}
                  {typeof data.selfCheck.brain === 'string'
                    ? data.selfCheck.brain === 'wired'
                      ? 'מחובר'
                      : data.selfCheck.brain
                    : data.selfCheck.brain?.wired
                      ? `מחובר (${(data.selfCheck.brain.chain ?? []).join('+')})`
                      : 'דטרמיניסטי-v1'}{' '}
                  · קריאה-חזרה לכל-קובץ
                </p>
              </section>
            )}

            {data?.summary && (
              <section className="mb-3">
                <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">מפת-יכולות (נמדד {fresh(data.summary.measuredAt) ?? '—'})</h3>
                <ul className="space-y-0.5 text-[11.5px] text-[color:var(--ink-2)]">
                  <li>· איברים-פעילים: {data.summary.organsMeasured} (פומביים {data.summary.publicOrgans ?? '—'})</li>
                  <li>· פידי-אמת חיים: {data.summary.feedsAlive}/{data.summary.feedsTotal}</li>
                  <li>· אתרים 200: {data.summary.sitesOk}/{data.summary.sitesTotal}</li>
                  <li>
                    · חוק-עצירת-הדימום (פרטי=0):{' '}
                    <span style={{ color: data.summary.activePrivateWorkflows === 0 ? 'var(--st-ok)' : 'var(--st-danger)' }}>
                      {data.summary.activePrivateWorkflows === null ? '—' : data.summary.activePrivateWorkflows === 0 ? 'קיים ✓' : `נשבר (${data.summary.activePrivateWorkflows})`}
                    </span>
                  </li>
                </ul>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(data.summary.feeds ?? []).map((f) => (
                    <span
                      key={f.label + f.repo}
                      className="rounded border px-1.5 py-0.5 text-[10.5px]"
                      style={{ borderColor: 'var(--line)', color: f.alive ? 'var(--ink-2)' : 'var(--st-danger)' }}
                      title={`${f.repo} · ${f.alive ? `גיל ${f.ageH ?? '?'}h` : 'לא-זמין'}`}
                    >
                      {f.label} {f.alive ? '· חי' : '· ✗'}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {!!data?.discoveries.length && (
              <section className="mb-3">
                <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">הרשת שמה-לב (גילויים)</h3>
                <ul className="space-y-1 text-[11.5px]">
                  {data.discoveries.map((d, i) => (
                    <li key={i} className="rounded border border-[color:var(--line)] px-2 py-1.5">
                      <span className="font-semibold">{d.repo ?? '—'}</span> · {d.note ?? d.kind}
                      <span className="block text-[9.5px] text-[color:var(--ink-3)]">{fresh(d.at) ?? ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!!data?.claims.length && (
              <section className="mb-3">
                <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">פניות-שהוכרעו</h3>
                <ul className="space-y-1 text-[11.5px]">
                  {data.claims.map((c, i) => (
                    <li key={i} className="rounded border border-[color:var(--line)] px-2 py-1.5">
                      <span className="text-[color:var(--ink-3)]">{c.claim?.slice(0, 90)}</span>
                      <span className="mt-0.5 block font-medium">{c.verdict?.verdictHe?.slice(0, 180) ?? '—'}</span>
                      <span className="block text-[9.5px] text-[color:var(--ink-3)]">
                        מוח: {c.brainUsed ? 'כן' : 'לא (fail-closed)'} · רמה: {c.verdict?.confidence ?? '—'} · {fresh(c.at) ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="border-t border-[color:var(--line)] p-3">
            <label htmlFor="claim-text" className="mb-1 block text-[11px] text-[color:var(--ink-3)]">
              פנייה-לריבונות (המפעיל-הוא-האוטונומיה — הכרעה ≤20 דק')
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="claim-text"
                value={claimText}
                onChange={(e) => setClaimText(e.target.value)}
                placeholder="למשל: למה הגריד של steem עומד? מה צריך כדי להפעיל?"
                rows={2}
                className="min-h-[44px] flex-1 resize-none rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[color:var(--accent,#b88a3a)]"
              />
              <button
                type="button"
                onClick={sendClaim}
                disabled={claimState.kind === 'sending' || !claimText.trim()}
                aria-label="שליחת-פנייה"
                className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--accent,#b88a3a)] text-black transition hover:brightness-110 disabled:opacity-50"
              >
                <Send size={16} aria-hidden="true" />
              </button>
            </div>
            {claimState.kind === 'ok' && <p className="mt-1 text-[11px]" style={{ color: 'var(--st-ok)' }}>{claimState.msg}</p>}
            {claimState.kind === 'fail' && <p className="mt-1 text-[11px] text-red-400">{claimState.msg}</p>}
            {claimState.kind === 'sending' && <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">נותב לגיט הקנוני…</p>}
          </div>
        </aside>
      )}
    </>
  );
}
