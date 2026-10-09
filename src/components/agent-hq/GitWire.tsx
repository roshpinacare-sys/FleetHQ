'use client';

// Git evidence — the fleet's real commit stream, verifiable on the public repo.
// Metadata only (hash / time / author / subject / repo / branch) — never file contents.

import type { GitPulse } from './types';
import type { Lang } from './i18n';
import { t } from './i18n';
import { timeAgo } from './panels';

// stable per-author hue (metadata color, not decoration — distinguishes authors)
function authorColor(author: string): string {
  let h = 0;
  for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) % 360;
  return `hsl(${h}, 32%, 68%)`;
}

export function GitEvidencePanel({ lang, git }: { lang: Lang; git?: GitPulse }) {
  if (!git || !git.available) {
    return (
      <div className="sl-empty" dir="auto">
        <p>{t('gitUnavailable', lang)}</p>
        <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">{t('gitLive', lang)}</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-col" dir="auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] px-3.5 py-2.5 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--st-ok)' }}>
          <span className="sl-dot sl-dot-live" style={{ backgroundColor: 'var(--st-ok)' }} aria-hidden="true" />
          {t('gitLive', lang)}
        </span>
        {git.repoLabel && <span className="sl-chip font-mono" dir="ltr">{git.repoLabel}</span>}
        {git.branch && (
          <span className="sl-chip font-mono" dir="ltr">
            {t('branchLabel', lang)}: {git.branch}
          </span>
        )}
        {git.repoUrl && (
          <a
            href={git.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sl-btn sl-btn-ghost ms-auto !min-h-[32px] !px-2.5 !py-1 !text-[12px]"
          >
            {t('gitOpen', lang)} ↗
          </a>
        )}
      </div>
      <div className="sl-scroll min-h-0 flex-1 overflow-y-auto">
        {git.commits.map((c) => (
          <div key={c.hash} data-t={`${c.repo}${c.branch ? ` · ${c.branch}` : ''}`} className="sl-tip sl-row !items-start">
            <code className="shrink-0 rounded bg-[color:var(--surface-2)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[color:var(--ink)]" dir="ltr">
              {c.hash.slice(0, 7)}
            </code>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] leading-5 text-[color:var(--ink)]" dir="auto">{c.subject}</span>
              <span className="block text-[11px] text-[color:var(--ink-3)]" dir="ltr">
                {c.repo}{c.branch ? ` · ${c.branch}` : ''} · {timeAgo(c.ts, lang)}
              </span>
            </span>
            <span className="shrink-0 truncate text-[11px] font-semibold" dir="ltr" style={{ color: authorColor(c.author) }}>
              {c.author}
            </span>
          </div>
        ))}
      </div>
      <p className="border-t border-[color:var(--line)] px-3.5 py-2 text-[11px] leading-4 text-[color:var(--ink-3)]" dir="auto">{t('gitPrivacy', lang)}</p>
    </div>
  );
}
