'use client';

// Git evidence — the fleet's real commit stream, verifiable on the public repo.
// Metadata only (hash / time / author / subject / repo / branch) — never file contents.
//
// מלאי ריפוים / Repo fleet: the truthful per-repo sync/health inventory from the
// foreman's gitfleet wire (read-only git, no fetch/push). Unknown stays unknown —
// nulls render as '—', never as a fabricated 0.

import type { GitPulse, RepoFleetView, RepoSyncState } from './types';
import type { Lang } from './i18n';
import { t } from './i18n';
import { timeAgo } from './panels';
import { semanticVar, type Semantic } from '@/components/hq/tokens';

// stable per-author hue (metadata color, not decoration — distinguishes authors)
function authorColor(author: string): string {
  let h = 0;
  for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) % 360;
  return `hsl(${h}, 32%, 68%)`;
}

/* ── מלאי ריפוים / Repo fleet — the ONE tone law for sync states ──────── */

const FLEET_TONE: Record<RepoSyncState, Semantic> = {
  'up-to-date': 'ok',
  behind: 'attention',
  ahead: 'attention',
  diverged: 'danger',
  dirty: 'attention',
  unreachable: 'danger',
  unknown: 'attention',
};

const FLEET_STATE_NAME: Record<RepoSyncState, { he: string; en: string }> = {
  'up-to-date': { he: 'מסונכרן', en: 'Up to date' },
  behind: { he: 'מאחורי המקור', en: 'Behind upstream' },
  ahead: { he: 'לפני המקור', en: 'Ahead of upstream' },
  diverged: { he: 'היסטוריה מפוצלת', en: 'Diverged history' },
  dirty: { he: 'שינויים מקומיים', en: 'Dirty tree' },
  unreachable: { he: 'לא נגיש', en: 'Unreachable' },
  unknown: { he: 'לא ידוע', en: 'Unknown' },
};

/** Wire drift guard: anything not a known sync state reads honestly as unknown. */
function syncStateOf(s: string): RepoSyncState {
  return s === 'up-to-date' || s === 'behind' || s === 'ahead' || s === 'diverged' || s === 'dirty' || s === 'unreachable' || s === 'unknown'
    ? s
    : 'unknown';
}

function RepoFleetRows({ fleet, lang }: { fleet?: RepoFleetView[]; lang: Lang }) {
  if (!fleet || fleet.length === 0) {
    // before the first inventory arrives — "unknown", never a fabricated green
    return (
      <div className="sl-row !min-h-[36px]">
        <span className="sl-dot" style={{ backgroundColor: semanticVar('neutral') }} aria-hidden="true" />
        <span className="text-[12px] text-[color:var(--ink-3)]" dir="auto">
          {lang === 'he' ? 'מלאי הריפויים — לא ידוע עדיין' : 'Repo fleet — unknown yet'}
        </span>
      </div>
    );
  }
  return (
    <>
      {fleet.map((r) => {
        const state = syncStateOf(r.syncState);
        const tone = FLEET_TONE[state];
        return (
          <div key={`${r.label}·${r.dir}`} className="sl-row !items-start !min-h-[36px]">
            <span className="mt-[5px] shrink-0">
              <span className="sl-dot" style={{ backgroundColor: semanticVar(tone) }} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-[12.5px] font-semibold text-[color:var(--ink)]" dir="auto">
                  {r.label}
                </span>
                <span className="sl-chip !py-0 !text-[11px] font-semibold" style={{ color: semanticVar(tone) }} dir="auto">
                  {FLEET_STATE_NAME[state][lang]}
                </span>
                {r.dirtyCount !== null && r.dirtyCount > 0 && (
                  <span className="sl-chip !py-0 !text-[11px] font-mono tabular-nums" style={{ color: semanticVar('attention') }} dir="auto">
                    {r.dirtyCount} {lang === 'he' ? 'שינויים' : 'changes'}
                  </span>
                )}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[color:var(--ink-3)]">
                <span className="font-mono" dir="ltr">
                  {r.branch}@{r.head || '—'}
                </span>
                <span className="font-mono tabular-nums" dir="ltr" title={lang === 'he' ? '↑ מקומי-בלבד · ↓ מקור-בלבד' : '↑ local-only · ↓ upstream-only'}>
                  ↑{r.ahead ?? '—'} ↓{r.behind ?? '—'}
                </span>
                {!r.upstreamConfigured && <span dir="auto">{lang === 'he' ? 'ללא upstream' : 'no upstream'}</span>}
                {r.lastFetchAt !== null && (
                  <span dir="auto">
                    {lang === 'he' ? 'משיכה אחרונה' : 'last fetch'}: {timeAgo(r.lastFetchAt, lang)}
                  </span>
                )}
              </span>
              {r.lastSyncError && (
                <span className="mt-0.5 block truncate text-[10.5px] leading-4" style={{ color: semanticVar('danger') }} dir="ltr" title={r.lastSyncError}>
                  {r.lastSyncError}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function GitEvidencePanel({ lang, git }: { lang: Lang; git?: GitPulse }) {
  return (
    <div className="flex min-h-0 flex-col" dir="auto">
      {/* מלאי ריפוים — truthful sync/health per authorized repo (read-only git) */}
      <div className="border-b border-[color:var(--line)] px-3.5 pb-1 pt-2.5">
        <div className="flex items-baseline gap-2 text-[11px] font-semibold tracking-[0.06em] text-[color:var(--ink-3)]">
          <span dir="auto">{lang === 'he' ? 'מלאי ריפוים' : 'Repo fleet'}</span>
          <span className="text-[10px] font-normal" dir="auto">
            {lang === 'he' ? 'גיט קריאה-בלבד · בלי fetch/push' : 'read-only git · no fetch/push'}
          </span>
        </div>
      </div>
      <div className="sl-scroll max-h-[124px] overflow-y-auto">
        <RepoFleetRows fleet={git?.fleet} lang={lang} />
      </div>
      {git && git.available ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] px-3.5 py-2.5 text-[12px]">
            <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--st-ok)' }}>
              <span className="sl-dot sl-dot-live" style={{ backgroundColor: 'var(--st-ok)' }} aria-hidden="true" />
              {t('gitLive', lang)}
            </span>
            <span className="text-[11.5px] text-[color:var(--ink-3)]" dir="auto">
              {t('lastUpdate', lang)}: {timeAgo(git.lastFetch, lang)} · {t('gitWireCap', lang)}
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
        </>
      ) : (
        <div className="sl-empty" dir="auto">
          <p>{t('gitUnavailable', lang)}</p>
          <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">{t('gitLive', lang)}</p>
        </div>
      )}
    </div>
  );
}
