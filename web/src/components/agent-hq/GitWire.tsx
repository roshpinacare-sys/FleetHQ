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
          <p className="text-sm text-stone-400">{t('gitUnavailable', lang)}</p>
          <p className="mt-2 text-xs text-stone-600">{t('gitLive', lang)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col" dir="auto">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-stone-400">
          <span className="h-2 w-2 rounded-full bg-[#34d399] hq-pulse" />
          {t('gitLive', lang)}
        </span>
        {git.repoUrl && (
          <a
            href={git.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg border border-amber-400/35 px-2.5 py-1 text-xs font-bold text-[#f5e3b8] transition hover:border-amber-400/70 hover:shadow-[0_0_14px_rgba(224,180,95,0.2)]"
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
              className={`hq-card hq-tip rounded-xl border p-2.5 ${fresh ? 'border-amber-400/50 bg-amber-400/8' : 'border-white/7 bg-black/30'}`}
            >
              <div className="flex items-center gap-2">
                <code className="rounded-md bg-amber-400/12 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#f5e3b8]" dir="ltr">
                  {c.hash}
                </code>
                <span className="text-[11px] text-stone-500" dir="ltr">
                  {timeAgo(c.ts, lang)}
                </span>
                {fresh && (
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-[#f5e3b8]">
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
              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-stone-200" dir="auto">
                {c.subject}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 border-t border-white/8 pt-2 text-[11px] leading-4 text-stone-500">{t('gitPrivacy', lang)}</p>
    </div>
  );
}
