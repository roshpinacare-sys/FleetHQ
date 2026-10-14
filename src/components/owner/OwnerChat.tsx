'use client';

/**
 * צ'אט-המנהל (T17) — ערוץ-הפעלה-ריבוני מתוך המשרד.
 * שער: "מפתח-מנהל" בלבד (קביעה-ראשונה → כניסה). אפס-חשיפת-זהות:
 * אין-שמות-חשבונות, אין-רשתות, אין-רמזי-התחברות בשום-מקום בממשק.
 * הוראה → נרשמת-על-הגיט של הבעלים → הריבונות צורכת-ומדווחת.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Radio } from 'lucide-react';

type Msg = { id: string; role: string; text: string; createdAt: string };
type GateState = 'loading' | 'unclaimed' | 'claimed' | 'open';

const TOKEN_KEY = 'owner-session-token';

export function OwnerChat() {
  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState<GateState>('loading');
  const [secret, setSecret] = useState('');
  const [gateErr, setGateErr] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const loadMsgs = useCallback(async () => {
    try {
      const t = sessionStorage.getItem(TOKEN_KEY);
      if (!t) return; // חוק-T19: אין-שליפת-היסטוריה בלי-כניסה
      // [T-audit] הטוקן בכותרת — לא ב-query-string (לא-נרשם-בלוגים)
      const r = await fetch('/api/owner-chat', { cache: 'no-store', headers: { 'x-owner-token': t } });
      if (r.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
        return;
      }
      const d = await r.json();
      if (d.ok) setMsgs(d.messages ?? []);
    } catch {
      /* fail-soft */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/owner-gate', { cache: 'no-store' });
        const d = await r.json();
        setGate(d.claimed ? 'claimed' : 'unclaimed');
      } catch {
        setGate('loading');
      }
      const saved = sessionStorage.getItem(TOKEN_KEY);
      if (saved) setToken(saved);
      void loadMsgs();
    })();
  }, [loadMsgs]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => void loadMsgs(), 20000);
    return () => clearInterval(t);
  }, [open, loadMsgs]);

  useEffect(() => {
    if (!open) return;
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) setToken(t);
  }, [open]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, open]);

  const submitSecret = async (action: 'claim' | 'verify') => {
    setGateErr('');
    try {
      const r = await fetch('/api/owner-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, secret }),
      });
      const d = await r.json();
      if (!d.ok) {
        setGateErr(d.error ?? 'שגיאה');
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, d.token);
      setToken(d.token);
      setSecret('');
      await loadMsgs(); // סיכום-ההתאמה נשמר-בשרת ומופיע כהודעת-מערכת מתמשכת
    } catch {
      setGateErr('השער לא זמין');
    }
  };

  const send = async (text: string, ignite?: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch('/api/owner-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, text, ignite }),
      });
      const d = await r.json();
      if (d.ok) setMsgs(d.messages ?? []);
      else setMsgs((m) => [...m, { id: `err-${Date.now()}`, role: 'system', text: `⚠️ ${d.error ?? 'שגיאה'}`, createdAt: new Date().toISOString() }]);
      setDraft('');
    } catch {
      setMsgs((m) => [...m, { id: `err-${Date.now()}`, role: 'system', text: '⚠️ הערוץ לא זמין', createdAt: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  return (
    <>
      {/* כפתור-צף — מטרה ≥44px */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="פתיחת צ'אט המנהל"
        aria-expanded={open}
        className="fixed bottom-4 left-4 z-40 flex h-12 min-w-[44px] items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-4 text-[13px] font-semibold text-[color:var(--ink)] shadow-lg backdrop-blur transition hover:brightness-110"
      >
        <Radio size={15} aria-hidden="true" />
        <span className="hidden sm:inline">צ&apos;אט-מנהל</span>
      </button>

      {open && (
        <aside
          dir="rtl"
          aria-label="ערוץ-הפעלה-ריבוני — צ'אט מנהל"
          className="fixed bottom-20 left-4 z-40 flex max-h-[70dvh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)]/98 shadow-2xl backdrop-blur"
        >
          <header className="flex items-center justify-between gap-2 border-b border-[color:var(--line)] bg-[color:var(--surface-2)]/90 px-3 py-2">
            <div className="leading-tight">
              <h2 className="text-[13px] font-bold">ערוץ-הפעלה-ריבוני</h2>
              <p className="text-[10.5px] text-[color:var(--ink-3)]">
                הוראה → הגיט שלך → הריבונות צורכת-ומדווחת · אפס-חשיפת-זהות
              </p>
            </div>
            {token ? (
              <button type="button" onClick={logout} className="rounded-md border border-[color:var(--line)] px-2 py-1 text-[11px] hover:brightness-110">
                יציאה
              </button>
            ) : (
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="rounded-md border border-[color:var(--line)] px-2 py-1 text-[11px] hover:brightness-110">
                ✕
              </button>
            )}
          </header>

          {!token ? (
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-start gap-1.5 text-[color:var(--ink-2)]">
                <KeyRound size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-[12px]">
                  {gate === 'unclaimed'
                    ? 'כניסת-מנהל: המפתח-המקורי בלבד. אין-קביעה-חופשית; הסוד אינו-נשמר ואינו-נשלח.'
                    : 'כניסת-מנהל: הדבק את המפתח. אימות-קריפטוגרפי; אפס-רמזים מחוץ-למכשיר-זה.'}
                </p>
              </div>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitSecret(gate === 'unclaimed' ? 'claim' : 'verify');
                }}
                placeholder="מפתח-מנהל"
                aria-label="מפתח-מנהל"
                autoComplete="off"
                className="h-11 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 text-[13px] outline-none focus:border-[color:var(--accent,#b88a3a)]"
              />
              {gateErr && <p className="text-[11.5px] text-red-400">{gateErr}</p>}
              <button
                type="button"
                onClick={() => void submitSecret(gate === 'unclaimed' ? 'claim' : 'verify')}
                className="h-11 rounded-md bg-[color:var(--accent,#b88a3a)] px-3 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                disabled={gate === 'loading' || secret.length < 8}
              >
                {gate === 'unclaimed' ? 'קביעת-מפתח-וכניסה' : 'כניסת-מנהל'}
              </button>
            </div>
          ) : (
            <>
              <div ref={logRef} className="sl-scroll flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: '44dvh' }}>
                {msgs.length === 0 && (
                  <p className="text-[12px] text-[color:var(--ink-3)]">
                    הערוץ ריק — הוראה-ראשונה תירשם-על-הגיט והריבונות תענה בהכרעות הפומביות.
                  </p>
                )}
                {msgs.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border px-2.5 py-2 text-[12.5px] leading-snug ${
                      m.role === 'owner'
                        ? 'border-[color:var(--accent,#b88a3a)]/50 bg-[color:var(--accent,#b88a3a)]/10'
                        : 'border-[color:var(--line)] bg-[color:var(--surface-2)]/70'
                    }`}
                  >
                    <span className="sr-only">{m.role === 'owner' ? 'הוראת-מנהל: ' : 'מענה-המערכת: '}</span>
                    {m.text}
                    <span className="block text-[9.5px] text-[color:var(--ink-3)]">
                      {new Date(m.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--line)] px-3 pt-2">
                {[
                  { label: 'הפעל-הכרעה-עכשיו', ignite: 'decider', text: 'הפעל פעימת-הכרעה מיידית ודווח מצב עדכני' },
                  { label: 'סריקת-ערך', ignite: 'scan', text: 'הרץ סריקת-ערך ופרסם הזדמנויות עדכניות' },
                ].map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    disabled={sending}
                    onClick={() => void send(q.text, q.ignite)}
                    className="h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-[11.5px] transition hover:brightness-110 disabled:opacity-50"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2 p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send(draft, 'decider');
                    }
                  }}
                  rows={2}
                  placeholder="הוראה לריבונות… (Enter = שליחה)"
                  aria-label="הוראה לריבונות"
                  className="min-h-[44px] flex-1 resize-none rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[color:var(--accent,#b88a3a)]"
                />
                <button
                  type="button"
                  onClick={() => void send(draft, 'decider')}
                  disabled={sending || !draft.trim()}
                  className="h-11 rounded-md bg-[color:var(--accent,#b88a3a)] px-3 text-[12.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {sending ? '…' : 'שלח'}
                </button>
              </div>
            </>
          )}
        </aside>
      )}
    </>
  );
}
