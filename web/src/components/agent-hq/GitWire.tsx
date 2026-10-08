'use client';

import type { GitPulse } from './types';
import type { Lang } from './i18n';
import { t } from './i18n';
import { goldenHue } from './golden';

// The git wire tab: the fleet's real commit stream, verifiable on the public repo.
// Metadata only (hash / time / author / subject) — never file contents.

function timeAgo(ts: number, lang: Lang): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return t('now', lang);
  if (m < 60) return lang === 'he' ? `לפני ${m} דק׳` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'he' ? `לפני ${h} שע׳` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === 'he' ? `לפני ${d} ימים` : `${d}d ago`;
}

export function GitWirePanel({ lang, git }: { lang: Lang; git?: GitPulse }) {
  if (!git || !git.available) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-zinc-400">{t('gitUnavailable', lang)}</p>
          <p className="mt-2 text-xs text-zinc-600">{t('gitLive', lang)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col" dir="auto">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 hq-pulse" />
          {t('gitLive', lang)}
        </span>
        {git.repoUrl && (
          <a
            href={git.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-fuchsia-500/40 px-3.5 py-1.5 text-xs font-bold text-fuchsia-300 transition hover:border-fuchsia-500/70 hover:shadow-[0_0_14px_rgba(217,70,239,0.25)]"
          >
            {t('gitOpen', lang)} ↗
          </a>
        )}
      </div>
      <div className="hq-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
        {git.commits.map((c, i) => {
          const fresh = i === 0 && Date.now() - c.ts < 60000;
          return (
            <div
              key={c.hash}
              data-t={`${c.repo}${c.branch ? ` · ${c.branch}` : ''}`}
              className={`hq-card hq-tip rounded-xl border p-3 ${fresh ? 'border-fuchsia-500/50 bg-fuchsia-500/10' : 'border-white/10 bg-black/30'}`}
            >
              <div className="flex items-center gap-2">
                <code className="rounded-md bg-fuchsia-500/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-fuchsia-200" dir="ltr">
                  {c.hash}
                </code>
                <span className="text-[11px] text-zinc-500" dir="ltr">
                  {timeAgo(c.ts, lang)}
                </span>
                {fresh && (
                  <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-bold text-fuchsia-100">
                    {t('newestCommit', lang)}
                  </span>
                )}
                <span
                  className="ms-auto truncate text-[10px] font-semibold"
                  dir="ltr"
                  style={{ color: `hsl(${goldenHue(c.author)}, 80%, 66%)` }}
                >
                  {c.author}
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-zinc-200" dir="auto">
                {c.subject}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-4 text-zinc-500">{t('gitPrivacy', lang)}</p>
    </div>
  );
}
