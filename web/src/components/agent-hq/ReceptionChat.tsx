'use client';

import { useEffect, useRef, useState } from 'react';
import { T, t, type Lang } from './i18n';

// The office receptionist — עמית, the front-desk worker of Fleet HQ.
//
// There is NO floating launcher and NO side chat: the conversation is opened by
// clicking עמית himself on the office floor (Office.tsx renders the character).
// This component is the conversation window that appears next to his desk.
//
// Security model (critical, by design):
//  - Talks ONLY to /api/visitor-chat.
//  - That endpoint has zero access to files, the database, internal services or
//    the fleet books: it answers from a fixed platform description plus the
//    PUBLIC counters already visible on this page (validated server-side).
//  - The conversation history sent is capped and sanitized server-side.
//  - Rate limited per IP, input length capped, generic error messages only.

export interface PublicStats {
  live: boolean;
  sim: boolean;
  crew: number;
  busy: number;
  books: number;
  reports: number;
  commits: number;
  opsDone: number;
  openTasks: number;
  openDecisions: number;
  goalPhase: string;
}

interface Msg {
  role: 'user' | 'rep';
  text: string;
}

export function ReceptionChat({
  lang,
  open,
  onClose,
  stats,
}: {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  stats: PublicStats;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'rate' | 'error' | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rtl = lang === 'he';

  // seed the greeting once, on first open (client-only)
  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ role: 'rep', text: t('repGreeting', lang) }]);
    }
  }, [open, msgs.length, lang]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, notice]);

  // Esc closes the conversation, like any door in the office
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  const send = async (text: string) => {
    const message = text.trim().slice(0, 600);
    if (!message || busy) return;
    setDraft('');
    setNotice(null);
    const history = msgs.slice(-10);
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await fetch('/api/visitor-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, lang, history, stats }),
      });
      if (res.status === 429) {
        setNotice('rate');
      } else if (!res.ok) {
        setNotice('error');
      } else {
        const data = (await res.json()) as { reply?: string };
        setMsgs((m) => [...m, { role: 'rep', text: data.reply || t('repError', lang) }]);
      }
    } catch {
      setNotice('error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="hq-page-enter fixed bottom-0 end-0 z-40 flex h-[min(600px,100dvh)] w-full flex-col rounded-none border border-[#2e2e36] bg-[#0c0c10] shadow-[0_0_60px_rgba(0,0,0,0.7)] sm:bottom-4 sm:end-4 sm:h-[600px] sm:w-[400px]"
      role="dialog"
      aria-label={t('repTitle', lang)}
    >
      {/* header — the worker himself, not a help widget */}
      <div className="flex items-center gap-3 border-b border-[#232329] bg-[#0e0e13] px-4 py-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] text-base font-black text-white shadow-[0_0_18px_rgba(199,125,255,0.35)]">
          ע
          <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-[#0e0e13] bg-[#46a758]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-4">{t('repName', lang)} <span className="font-normal text-zinc-500">· {t('repRole', lang)}</span></div>
          <div className="truncate text-[10.5px] text-zinc-500">{t('repStatus', lang)}</div>
        </div>
        <button onClick={onClose} className="rounded-none border border-[#2e2e36] px-2 py-1 text-xs text-zinc-400 transition hover:border-[#FF1464] hover:text-[#ff8fb4]" aria-label={t('close', lang)}>
          ✕
        </button>
      </div>

      {/* scope banner — the honest restriction, always visible */}
      <div className="border-b border-[#232329] bg-[#101016] px-4 py-1.5 text-[10px] leading-3.5 text-zinc-500">
        🔒 {t('repScope', lang)}
      </div>

      {/* messages */}
      <div ref={scroller} className="hq-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`hq-feed-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'rep' && <span className="me-2 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] text-[10px] font-black text-white">ע</span>}
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-none px-3 py-2 text-[13px] leading-5 ${
                m.role === 'user'
                  ? 'border border-[#2e2e36] bg-[#15151b] text-zinc-200'
                  : 'border border-[#7c3aed]/40 bg-[#0e0a18] text-zinc-100'
              }`}
              dir="auto"
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-none border border-[#7c3aed]/40 bg-[#0e0a18] px-3 py-2">
              <span className="hq-dot-flash inline-flex gap-1">
                <i className="h-1.5 w-1.5 rounded-full bg-[#c77dff]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#c77dff]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#c77dff]" />
              </span>
              <span className="text-[10px] text-zinc-500">{t('repName', lang)}…</span>
            </div>
          </div>
        )}
        {notice === 'rate' && <p className="text-center text-[11px] text-amber-400">{t('repRate', lang)}</p>}
        {notice === 'error' && <p className="text-center text-[11px] text-red-400">{t('repError', lang)}</p>}
      </div>

      {/* suggestions (stay available so a visitor can retry after an error) */}
      {!busy && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {T.repSuggestions[lang].map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-[#232329] bg-[#101015] px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-[#00E5FF] hover:text-[#4de3ff]"
              dir="auto"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* input */}
      <div className="border-t border-[#232329] p-2.5">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(draft)}
            placeholder={t('repPlaceholder', lang)}
            className="min-w-0 flex-1 rounded-none border border-[#232329] bg-[#08080b] px-3 py-2.5 text-sm outline-none transition focus:border-[#7c3aed]"
            dir="auto"
            maxLength={600}
            aria-label={t('repPlaceholder', lang)}
            disabled={busy}
          />
          <button
            onClick={() => send(draft)}
            disabled={busy || !draft.trim()}
            className="rounded-none bg-[#FF1464] px-4 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-[#ff3d80] disabled:opacity-40"
          >
            {t('send', lang)}
          </button>
        </div>
        <p className="mt-1.5 text-[9.5px] leading-3 text-zinc-600">{t('repDisclaimer', lang)}</p>
      </div>
    </div>
  );
}
