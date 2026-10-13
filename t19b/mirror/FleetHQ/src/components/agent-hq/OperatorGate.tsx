'use client';

/**
 * OperatorGate — how the owner enters as operator (מפעיל) and steers
 * the whole sovereignty from the office chat.
 *
 * SECURITY (owner-mandated, do not weaken):
 *  - The field is labeled exactly "מפתח מנהל" (admin key). No hints about
 *    identity, network, or connection method appear anywhere.
 *  - The key lives in React state ONLY (never localStorage, never logs).
 *    It is sent once to /api/operator/unlock; the server compares against a
 *    salted hash stored OUTSIDE all repos. The key is then dropped.
 *  - Session = memory token (10 min). Refresh = re-unlock. By doctrine.
 *  - Directives are public office words — the UI tells the operator to send
 *    directives, never secrets.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from './i18n';

interface Directive {
  at: string;
  id: string;
  text: string;
  sha16: string;
}

export default function OperatorGate({ lang }: { lang: Lang }) {
  const he = lang === 'he';
  const [unlocked, setUnlocked] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [draft, setDraft] = useState('');
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadDirectives = useCallback(async () => {
    try {
      const r = await fetch('/api/operator/message', { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as { directives?: Directive[] };
      setDirectives(d.directives ?? []);
    } catch {
      // honest silence is NOT allowed here either — but polling failure on a
      // public read is non-critical; show nothing rather than fake data
    }
  }, []);

  useEffect(() => {
    void loadDirectives();
    const id = setInterval(() => void loadDirectives(), 30_000);
    return () => clearInterval(id);
  }, [loadDirectives]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [directives.length]);

  const unlock = useCallback(async () => {
    if (!keyDraft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/operator/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: keyDraft }),
      });
      const d = (await r.json()) as { ok?: boolean; token?: string; error?: string };
      if (d.ok && d.token) {
        tokenRef.current = d.token;
        setUnlocked(true);
      } else {
        setError(d.error === 'too-many-attempts'
          ? (he ? 'נסיונות רבים מדי — המתן דקה' : 'too many attempts — wait a minute')
          : (he ? 'מפתח לא נכון' : 'wrong key'));
      }
    } catch {
      setError(he ? 'השער לא זמין' : 'gate unavailable');
    } finally {
      // the key is dropped immediately — it lives nowhere
      setKeyDraft('');
      setBusy(false);
    }
  }, [keyDraft, busy, he]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !tokenRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/operator/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tokenRef.current, text }),
      });
      const d = (await r.json()) as { ok?: boolean; receipt?: { id: string }; error?: string };
      if (d.ok && d.receipt) {
        setDraft('');
        setLastReceipt(`${d.receipt.id}`);
        await loadDirectives();
      } else if (r.status === 401) {
        setUnlocked(false);
        tokenRef.current = null;
        setError(he ? 'הפג תוקף — הזן מפתח מנהל מחדש' : 'session expired — unlock again');
      } else {
        setError(d.error ?? (he ? 'נכשל' : 'failed'));
      }
    } catch {
      setError(he ? 'השער לא זמין' : 'gate unavailable');
    } finally {
      setBusy(false);
    }
  }, [draft, busy, he, loadDirectives]);

  return (
    <section className="sl-panel mb-4" aria-label={he ? 'ערוץ-המפעיל' : 'operator channel'}>
      <header className="sl-panel-head flex flex-wrap items-center justify-between gap-2">
        <h2 className="sl-panel-title" dir="auto">
          {he ? 'ערוץ-המפעיל · הנחיה לאוטונומיה' : 'Operator channel · steer the autonomy'}
        </h2>
        {unlocked && (
          <span className="rounded px-2 py-0.5 font-mono text-xs" style={{ backgroundColor: 'var(--sem-ok, #16a34a)', color: '#fff' }}>
            {he ? 'מפעיל מחובר' : 'operator'}
          </span>
        )}
      </header>

      {!unlocked ? (
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
          <input
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }}
            placeholder={he ? 'מפתח מנהל' : 'admin key'}
            aria-label={he ? 'מפתח מנהל' : 'admin key'}
            autoComplete="off"
            dir="ltr"
            className="min-w-0 flex-1 rounded border border-[color:var(--line)] bg-transparent px-2 py-1.5 font-mono text-sm outline-none focus:border-[color:var(--accent,#a1a1aa)]"
          />
          <button
            type="button"
            onClick={() => void unlock()}
            disabled={busy || !keyDraft.trim()}
            className="rounded px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent-soft, #e4e4e7)' }}
          >
            {busy ? '…' : he ? 'כניסה' : 'Enter'}
          </button>
          {error && (
            <span className="text-xs" style={{ color: 'var(--sem-danger, #dc2626)' }} dir={he ? 'rtl' : 'ltr'}>
              {error}
            </span>
          )}
        </div>
      ) : (
        <>
          <p className="px-3 pt-2 text-xs opacity-70" dir={he ? 'rtl' : 'ltr'}>
            {he
              ? 'כתוב הנחיות בלבד — לעולם לא סודות. כל הנחיה נכנסת לספר-הציבורי של המשרד עם קבלה, והצי קורא אותה.'
              : 'Directives only — never secrets. Every directive enters the office public book with a receipt; the fleet reads it.'}
          </p>
          <div className="mx-3 mt-2 max-h-48 overflow-y-auto rounded border border-[color:var(--line)] p-2">
            {directives.length === 0 ? (
              <p className="text-xs opacity-60" dir={he ? 'rtl' : 'ltr'}>
                {he ? 'אין הנחיות עדיין.' : 'No directives yet.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {directives.map((d) => (
                  <li key={d.id} className="text-sm" dir="auto">
                    <span className="mr-2 font-mono text-xs opacity-50" dir="ltr">{d.at.slice(11, 16)}</span>
                    {d.text}
                  </li>
                ))}
              </ul>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-3 py-3">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
              placeholder={he ? 'הנחיה לאוטונומיה…' : 'directive to the autonomy…'}
              aria-label={he ? 'הנחיה' : 'directive'}
              dir="auto"
              maxLength={2000}
              className="min-w-0 flex-1 rounded border border-[color:var(--line)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[color:var(--accent,#a1a1aa)]"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              className="rounded px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-soft, #e4e4e7)' }}
            >
              {busy ? '…' : he ? 'שלח' : 'Send'}
            </button>
          </div>
          {lastReceipt && (
            <p className="px-3 pb-2 font-mono text-xs opacity-60" dir="ltr">
              receipt: {lastReceipt}
            </p>
          )}
          {error && (
            <p className="px-3 pb-2 text-xs" style={{ color: 'var(--sem-danger, #dc2626)' }} dir={he ? 'rtl' : 'ltr'}>
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
