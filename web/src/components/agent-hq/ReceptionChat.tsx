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
      className="hq-glass hq-page-enter fixed bottom-0 end-0 z-40 flex h-[min(600px,100dvh)] w-full flex-col !rounded-none sm:bottom-4 sm:end-4 sm:h-[600px] sm:w-[400px] sm:!rounded-[14px] shadow-[0_28px_80px_-16px_rgba(0,0,0,0.9)]"
      role="dialog"
      aria-label={t('repTitle', lang)}
    >
      {/* header — the worker himself, not a help widget */}
      <div className="flex items-center gap-3 border-b border-amber-400/15 px-4 py-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f2d492] to-[#a8823a] text-base font-black text-[#241a08] shadow-[0_0_18px_rgba(224,180,95,0.35)]">
          ע
          <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-[#171009] bg-[#34d399]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-4 text-[#f5e3b8]">{t('repName', lang)} <span className="font-normal text-stone-500">· {t('repRole', lang)}</span></div>
          <div className="truncate text-[10.5px] text-stone-500">{t('repStatus', lang)}</div>
        </div>
        <button onClick={onClose} className="hq-btn-ghost px-2 py-1 text-xs" aria-label={t('close', lang)}>
          ✕
        </button>
      </div>

      {/* scope banner — the honest restriction, always visible */}
      <div className="border-b border-amber-400/10 bg-black/25 px-4 py-1.5 text-[10px] leading-3.5 text-stone-500">
        🔒 {t('repScope', lang)}
      </div>

      {/* messages */}
      <div ref={scroller} className="hq-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`hq-feed-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'rep' && <span className="me-2 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f2d492] to-[#a8823a] text-[10px] font-black text-[#241a08]">ע</span>}
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-5 ${
                m.role === 'user'
                  ? 'border border-white/8 bg-white/6 text-stone-200'
                  : 'border border-amber-400/30 bg-[#221809]/90 text-stone-100'
              }`}
              dir="auto"
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-[#221809]/90 px-3 py-2">
              <span className="hq-dot-flash inline-flex gap-1">
                <i className="h-1.5 w-1.5 rounded-full bg-[#e0b45f]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#e0b45f]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#e0b45f]" />
              </span>
              <span className="text-[10px] text-stone-500">{t('repName', lang)}…</span>
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
              className="rounded-full border border-white/8 bg-black/30 px-2.5 py-1 text-[11px] text-stone-300 transition hover:border-[#e0b45f]/60 hover:text-[#f5e3b8]"
              dir="auto"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* input */}
      <div className="border-t border-amber-400/15 p-2.5">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(draft)}
            placeholder={t('repPlaceholder', lang)}
            className="min-w-0 flex-1 rounded-xl border border-white/8 bg-black/40 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-[#e0b45f]/70 focus:shadow-[0_0_0_1px_rgba(224,180,95,0.35),0_0_18px_rgba(224,180,95,0.15)] placeholder:text-stone-600"
            dir="auto"
            maxLength={600}
            aria-label={t('repPlaceholder', lang)}
            disabled={busy}
          />
          <button
            onClick={() => send(draft)}
            disabled={busy || !draft.trim()}
            className="hq-btn-gold px-4 py-2.5 text-sm"
          >
            {t('send', lang)}
          </button>
        </div>
        <p className="mt-1.5 text-[9.5px] leading-3 text-stone-600">{t('repDisclaimer', lang)}</p>
      </div>
    </div>
  );
}
