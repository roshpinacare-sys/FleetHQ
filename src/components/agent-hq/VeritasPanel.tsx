'use client';

/**
 * VeritasPanel — the no-forgery gate, visible.
 *
 * Polls /api/veritas (live sha256+bytes+age verdicts over the estate's
 * critical receipts) and /api/recruit (the office's evidence-bound roles).
 * FAIL-LOUD: a failed fetch renders a RED block — never silence, never a fake.
 * The office's honesty = its WORST source, shown at the top.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Lang } from './i18n';

interface VeritasVerdict {
  source: string;
  producedAt: string;
  sha256: string;
  bytes: number;
  status: 'fresh' | 'stale' | 'missing' | 'tampered';
  ageMs: number | null;
  reason: string;
}

interface VeritasPayload {
  gate: string;
  checkedAt: string;
  aggregate: {
    allFresh: boolean;
    worst: string;
    staleSources: string[];
    tamperedSources: string[];
    missingSources: string[];
    worstReason: string;
  };
  verdicts: VeritasVerdict[];
}

interface RoleNeeded {
  role: string;
  roleHe: string;
  count: number;
  targets: string[];
  evidence: string[];
  derivedFrom: string;
}

interface RecruitPayload {
  ok: boolean;
  generatedAt?: string;
  sha256?: string;
  rolesNeeded?: RoleNeeded[];
  totals?: { reposScanned: number; staleRepos: number; roles: number };
  error?: string;
}

type Tone = 'fresh' | 'stale' | 'tampered' | 'missing';

const TONE_COLOR: Record<Tone, string> = {
  fresh: 'var(--sem-ok, #16a34a)',
  stale: 'var(--sem-warn, #d97706)',
  tampered: 'var(--sem-danger, #dc2626)',
  missing: 'var(--sem-muted, #71717a)',
};

const STATUS_HE: Record<string, string> = {
  fresh: 'טרי',
  stale: 'קפוא',
  tampered: 'נפגע',
  missing: 'חסר',
};

function ageLabel(ageMs: number | null, lang: Lang): string {
  if (ageMs === null || !Number.isFinite(ageMs)) return lang === 'he' ? 'לא ידוע' : 'unknown';
  const m = Math.round(ageMs / 60000);
  if (m < 60) return lang === 'he' ? `${m} דק׳` : `${m}m`;
  const h = Math.floor(m / 60);
  return lang === 'he' ? `${h} שע׳` : `${h}h`;
}

export default function VeritasPanel({ lang }: { lang: Lang }) {
  const [veritas, setVeritas] = useState<VeritasPayload | null>(null);
  const [recruit, setRecruit] = useState<RecruitPayload | null>(null);
  const [veritasError, setVeritasError] = useState<string | null>(null);
  const [recruitError, setRecruitError] = useState<string | null>(null);
  const [openRole, setOpenRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/veritas', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setVeritas((await r.json()) as VeritasPayload);
      setVeritasError(null);
    } catch (e) {
      setVeritasError(e instanceof Error ? e.message : 'fetch failed');
    }
    try {
      const r = await fetch('/api/recruit', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRecruit((await r.json()) as RecruitPayload);
      setRecruitError(null);
    } catch (e) {
      setRecruitError(e instanceof Error ? e.message : 'fetch failed');
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const he = lang === 'he';

  return (
    <section className="sl-panel mb-4" aria-label={he ? 'שער-האמת (וריטס) וגיוס המשרד' : 'Veritas gate + office recruitment'}>
      <header className="sl-panel-head flex flex-wrap items-center justify-between gap-2">
        <h2 className="sl-panel-title" dir="auto">
          {he ? 'שער-האמת · אין זיופים' : 'Veritas · no forgery'}
        </h2>
        {veritas && (
          <span
            dir="ltr"
            className="rounded px-2 py-0.5 font-mono text-xs"
            style={{
              backgroundColor: TONE_COLOR[veritas.aggregate.worst as Tone] ?? TONE_COLOR.missing,
              color: '#fff',
            }}
          >
            {veritas.aggregate.allFresh
              ? he ? 'הכל טרי' : 'ALL FRESH'
              : `worst: ${he ? STATUS_HE[veritas.aggregate.worst] ?? veritas.aggregate.worst : veritas.aggregate.worst}`}
          </span>
        )}
      </header>

      {/* fail-loud: no fake fallback */}
      {veritasError && (
        <div className="rounded p-3 font-mono text-xs" style={{ backgroundColor: TONE_COLOR.tampered, color: '#fff' }} dir="ltr">
          VERITAS RED: {veritasError} — fail-loud, no fake fallback
        </div>
      )}

      {veritas && (
        <>
          <p className="px-3 pt-2 text-xs opacity-70" dir={he ? 'rtl' : 'ltr'}>
            {he
              ? 'כל מקור נבדק חי: sha256 + בתים + גיל (חלון 3ש). כנות המשרד = המקור הגרוע ביותר. מקור קפוא מוצג כקפוא.'
              : 'Every source re-verified live: sha256 + bytes + age (3h window). Office honesty = worst source. Frozen displays as frozen.'}
          </p>
          <ul className="px-3 py-2 font-mono text-xs" dir="ltr">
            {veritas.verdicts.map((v) => (
              <li key={v.source} className="flex items-center gap-2 border-b border-[color:var(--line)] py-1 last:border-0">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: TONE_COLOR[v.status] }}
                />
                <span className="min-w-0 flex-1 truncate" title={`${v.source} · ${v.reason}`}>{v.source}</span>
                <span className="shrink-0 tabular-nums opacity-60">{v.sha256 ? v.sha256.slice(0, 8) : '—'}</span>
                <span className="w-12 shrink-0 text-right tabular-nums opacity-60">{fmtBytes(v.bytes)}</span>
                <span className="w-14 shrink-0 text-right tabular-nums">{ageLabel(v.ageMs, lang)}</span>
                <span className="w-16 shrink-0 text-right">{he ? STATUS_HE[v.status] : v.status}</span>
              </li>
            ))}
          </ul>
          {!veritas.aggregate.allFresh && (
            <p className="px-3 pb-2 text-xs" dir={he ? 'rtl' : 'ltr'} style={{ color: TONE_COLOR[veritas.aggregate.worst as Tone] }}>
              {veritas.aggregate.worstReason}
            </p>
          )}
        </>
      )}

      {/* recruitment — the office as manager */}
      <header className="sl-panel-head flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--line)]">
        <h3 className="sl-panel-title text-sm" dir="auto">{he ? 'גיוס עובדים · המשרד כמנהל' : 'Recruitment · office as manager'}</h3>
        {recruit?.totals && (
          <span className="font-mono text-xs opacity-60" dir="ltr">
            {recruit.totals.reposScanned} repos · {recruit.totals.roles} roles
          </span>
        )}
      </header>

      {recruitError && (
        <div className="m-3 rounded p-3 font-mono text-xs" style={{ backgroundColor: TONE_COLOR.tampered, color: '#fff' }} dir="ltr">
          RECRUIT RED: {recruitError} — fail-loud
        </div>
      )}

      {recruit && !recruit.ok && (
        <p className="px-3 pb-2 text-xs opacity-70" dir="ltr">recruit receipt: {recruit.error} (honest absence)</p>
      )}

      {recruit?.ok && recruit.rolesNeeded && recruit.rolesNeeded.length > 0 && (
        <ul className="px-3 py-2">
          {recruit.rolesNeeded.map((role) => (
            <li key={role.role} className="border-b border-[color:var(--line)] py-1 last:border-0">
              <button
                type="button"
                onClick={() => setOpenRole(openRole === role.role ? null : role.role)}
                className="flex w-full items-center gap-2 text-start"
                aria-expanded={openRole === role.role}
              >
                <span className="font-medium" dir="auto">
                  {he ? role.roleHe : role.role}
                </span>
                <span className="rounded bg-[color:var(--surface-2,#f4f4f5)] px-1.5 font-mono text-xs" dir="ltr">×{role.count}</span>
                <span className="min-w-0 flex-1 truncate text-xs opacity-60" dir="ltr">
                  {role.targets.slice(0, 3).join(', ')}
                  {role.targets.length > 3 ? ` +${role.targets.length - 3}` : ''}
                </span>
                <span aria-hidden="true" className="opacity-50">{openRole === role.role ? '▾' : '▸'}</span>
              </button>
              {openRole === role.role && (
                <div className="mt-1 mb-2 rounded bg-[color:var(--surface-2,#f4f4f5)] p-2 text-xs">
                  <p className="opacity-70" dir={he ? 'rtl' : 'ltr'}>{role.derivedFrom}</p>
                  <ul className="mt-1 font-mono" dir="ltr">
                    {role.evidence.slice(0, 6).map((ev, i) => (
                      <li key={i} className="truncate opacity-80">· {ev}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {recruit?.ok && recruit.rolesNeeded?.length === 0 && (
        <p className="px-3 pb-2 text-xs opacity-70" dir={he ? 'rtl' : 'ltr'}>
          {he ? 'אין תפקידים נדרשים — כל האותות בריאים.' : 'No roles needed — all signals healthy.'}
        </p>
      )}
    </section>
  );
}

function fmtBytes(n: number): string {
  if (!n) return '—';
  return n >= 1024 ? `${(n / 1024).toFixed(1)}K` : String(n);
}
