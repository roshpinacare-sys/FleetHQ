'use client';

/**
 * StackHealth — the sovereign-stack live health card (section 04).
 *
 * Polls /api/fleet-health (which re-verifies both hash chains from disk on
 * every call) and renders the honest state: green = measured ok, amber =
 * unreachable/absent (still honest), red = broken/tampered. No cached trust,
 * no invented numbers.
 */
import { useEffect, useState } from 'react';
import type { Lang } from './i18n';

interface FleetHealth {
  at: string;
  all_ok: boolean;
  chains: {
    manifest: { ok: boolean; records: number; detail: string };
    staged_rails: { ok: boolean; files: number; superseded: number; bad: string[] };
    receipts: { ok: boolean; records: number; detail: string };
  };
  status?: { ts?: string; all_ok?: boolean; results?: { name?: string; verdict?: string; latency_ms?: number }[] } | null;
  host_mem?: { mem_total_mb?: number; mem_available_mb?: number; state?: string; policy_max_chars?: number } | null;
  compaction_policy?: { low_mem?: boolean; max_chars?: number; reason?: string } | null;
  tps?: { state?: string; note?: string } | null;
  seal?: { state?: string; rails_merkle_root?: string; generation?: { parent_broadcast_root?: string; parent_from?: string } } | null;
  books_lineage?: { books?: number; root?: string } | null;
  unified_bridge?: { records: number } | null;
  shift_history?: { md_at?: string; closed_shifts?: number; last_closed?: { goal?: string; approvals?: number; cancellations?: number; redos?: number } | null } | null;
  lineage_guard?: { at?: string; last_event?: string; head?: string; origin?: string; behind?: number; ahead?: number; last_push?: { at?: string; from?: string; to?: string } | null } | null;
}

const L = {
  secStack: { he: 'בריאות הסטאק הריבוני', en: 'Sovereign stack health' },
  chains: { he: 'שרשראות', en: 'Chains' },
  manifest: { he: 'מניפסט', en: 'Manifest' },
  rails: { he: 'מסילות', en: 'Rails' },
  receipts: { he: 'קבלות', en: 'Receipts' },
  hostMem: { he: 'זיכרון מארח', en: 'Host memory' },
  policy: { he: 'מדיניות דחיסה', en: 'Compaction policy' },
  tps: { he: 'מד-TPS מקומי', en: 'Local TPS bench' },
  seal: { he: 'חותם שידור', en: 'Broadcast seal' },
  lineage: { he: 'ליניאז׳ ספרים', en: 'Books lineage' },
  bridge: { he: 'גשר טלמטריה', en: 'Telemetry bridge' },
  ok: { he: 'תקין', en: 'OK' },
  broken: { he: 'שבור', en: 'BROKEN' },
  unreachable: { he: 'לא-נגיש', en: 'UNREACHABLE' },
  absent: { he: 'לא-קיים', en: 'ABSENT' },
  ready: { he: 'מוכן-שידור', en: 'BROADCAST-READY' },
  halted: { he: 'עצור-שרשרת', en: 'HALT-CHAIN-BROKEN' },
  loading: { he: 'נמדד…', en: 'measuring…' },
  verified: { he: 'אומת מהדיסק בכל-קריאה', en: 're-verified from disk on every call' },
  probes: { he: 'גשושיות', en: 'probes' },
  shifts: { he: 'יומן-משמרות', en: 'Shift history' },
  shiftSub: { he: 'משמרת', en: 'shift' },
  lineageGuard: { he: 'שומר-היורש', en: 'Lineage guard' },
  linear: { he: 'ישר', en: 'linear' },
} as const;

function tr(k: keyof typeof L, lang: Lang): string {
  return L[k][lang];
}

function Dot({ tone }: { tone: 'ok' | 'warn' | 'bad' }) {
  const c = tone === 'ok' ? '#22c55e' : tone === 'warn' ? '#eab308' : '#ef4444';
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c }} aria-hidden="true" />;
}

function Cell({
  label, tone, value, sub, ltr = true,
}: {
  label: string; tone: 'ok' | 'warn' | 'bad'; value: string; sub?: string; ltr?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <span className="truncate text-[12px] font-semibold text-zinc-400" dir="auto">{label}</span>
      <span className="flex items-center gap-2 text-[13px] font-bold text-zinc-200" dir={ltr ? 'ltr' : 'auto'}>
        <Dot tone={tone} />
        <span className="truncate font-mono text-[12.5px]">{value}</span>
      </span>
      {sub ? <span className="truncate text-[11px] text-zinc-500" dir="ltr">{sub}</span> : null}
    </div>
  );
}

export default function StackHealth({ lang }: { lang: Lang }) {
  const [h, setH] = useState<FleetHealth | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch('/api/fleet-health', { cache: 'no-store' });
        const j = (await r.json()) as FleetHealth;
        if (alive) { setH(j); setErr(false); }
      } catch {
        if (alive) setErr(true);
      }
    };
    void pull();
    const iv = setInterval(() => void pull(), 30_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const chainTone = (ok: boolean): 'ok' | 'bad' => (ok ? 'ok' : 'bad');
  const absentTone = (x: unknown): 'ok' | 'warn' => (x == null ? 'warn' : 'ok');

  return (
    <section className="mt-6" aria-label={tr('secStack', lang)}>
      <div className="hq-glass hq-rise-3 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-zinc-200" dir="auto">{tr('secStack', lang)}</span>
          {h ? (
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px]" dir="ltr">
              <Dot tone={h.all_ok ? 'ok' : 'bad'} />
              all_ok={String(h.all_ok)}
            </span>
          ) : null}
          <span className="ms-auto text-[11.5px] text-zinc-500" dir="auto">{tr('verified', lang)}</span>
        </div>

        {!h && !err ? (
          <div className="py-6 text-center text-[13px] text-zinc-500" dir="auto">{tr('loading', lang)}</div>
        ) : !h ? (
          <div className="py-6 text-center text-[13px] text-red-400" dir="auto">{tr('unreachable', lang)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <Cell label={tr('manifest', lang)} tone={chainTone(h.chains.manifest.ok)}
              value={h.chains.manifest.ok ? `${tr('ok', lang)} · n=${h.chains.manifest.records}` : tr('broken', lang)}
              sub={h.chains.manifest.detail} ltr={false} />
            <Cell label={tr('rails', lang)} tone={chainTone(h.chains.staged_rails.ok)}
              value={h.chains.staged_rails.ok ? `files=${h.chains.staged_rails.files}` : tr('broken', lang)}
              sub={`superseded=${h.chains.staged_rails.superseded}${h.chains.staged_rails.bad.length ? ` bad=${h.chains.staged_rails.bad.join(',')}` : ''}`} />
            <Cell label={tr('receipts', lang)} tone={chainTone(h.chains.receipts.ok)}
              value={h.chains.receipts.ok ? `${tr('ok', lang)} · n=${h.chains.receipts.records}` : tr('broken', lang)}
              sub={h.chains.receipts.detail} ltr={false} />
            <Cell label={tr('hostMem', lang)} tone={absentTone(h.host_mem)}
              value={h.host_mem ? `${Math.round(h.host_mem.mem_available_mb ?? 0)}/${Math.round(h.host_mem.mem_total_mb ?? 0)}MB` : tr('absent', lang)}
              sub={h.host_mem?.state ?? undefined} />
            <Cell label={tr('policy', lang)} tone={absentTone(h.compaction_policy)}
              value={h.compaction_policy ? `max_chars=${h.compaction_policy.max_chars ?? '?'}` : tr('absent', lang)}
              sub={h.compaction_policy?.reason ?? undefined} ltr={false} />
            <Cell label={tr('tps', lang)} tone={h.tps?.state === 'OK' ? 'ok' : 'warn'}
              value={h.tps?.state ?? tr('absent', lang)}
              sub={h.tps?.note ?? undefined} ltr={false} />
            <Cell label={tr('seal', lang)}
              tone={h.seal?.state === 'BROADCAST-READY' ? 'ok' : h.seal?.state ? 'bad' : 'warn'}
              value={h.seal?.state === 'BROADCAST-READY' ? tr('ready', lang) : (h.seal?.state === 'HALT-CHAIN-BROKEN' ? tr('halted', lang) : tr('absent', lang))}
              sub={h.seal ? `${(h.seal.rails_merkle_root ?? '').slice(0, 16)}… parent=${h.seal.generation?.parent_from ?? '?'}` : undefined} ltr={false} />
            <Cell label={tr('lineage', lang)} tone={absentTone(h.books_lineage)}
              value={h.books_lineage ? `books=${h.books_lineage.books ?? '?'}` : tr('absent', lang)}
              sub={h.books_lineage ? `${(h.books_lineage.root ?? '').slice(0, 16)}…` : undefined} />
            <Cell label={tr('bridge', lang)} tone={h.unified_bridge && h.unified_bridge.records > 0 ? 'ok' : 'warn'}
              value={`records=${h.unified_bridge?.records ?? 0}`} />
            <Cell label={tr('shifts', lang)}
              tone={h.shift_history?.md_at ? (Date.now() - new Date(h.shift_history.md_at).getTime() < 5 * 60_000 ? 'ok' : 'warn') : 'warn'}
              value={h.shift_history?.md_at ? `closed=${h.shift_history.closed_shifts ?? 0}` : tr('absent', lang)}
              sub={h.shift_history?.last_closed?.goal ? `${tr('shiftSub', lang)}: ${h.shift_history.last_closed.goal.slice(0, 60)}` : undefined} ltr={false} />
            <Cell label={tr('lineageGuard', lang)}
              tone={!h.lineage_guard ? 'warn'
                : Date.now() - new Date(h.lineage_guard.at ?? 0).getTime() < 5 * 60_000
                  ? (h.lineage_guard.last_event === 'secret_abort' || h.lineage_guard.last_event === 'syntax_fail' || h.lineage_guard.last_event === 'conflict_manual' ? 'bad' : 'ok')
                  : 'warn'}
              value={h.lineage_guard ? `${h.lineage_guard.last_event ?? '?'} · ${tr('linear', lang)}=${h.lineage_guard.head === h.lineage_guard.origin}` : tr('absent', lang)}
              sub={h.lineage_guard?.last_push ? `push ${h.lineage_guard.last_push.from} → ${h.lineage_guard.last_push.to}` : undefined} ltr={false} />
            <Cell label={tr('probes', lang)}
              tone={h.status?.results?.every((r) => r.verdict === 'OK') ? 'ok'
                : h.status?.results?.some((r) => r.verdict === 'OK') ? 'warn' : 'bad'}
              value={h.status?.results?.map((r) => `${r.name}:${r.verdict}`).join(' ') ?? tr('absent', lang)}
              sub={h.status?.results?.map((r) => `${r.name}=${r.latency_ms}ms`).join(' · ') || undefined} ltr={false} />
          </div>
        )}
      </div>
    </section>
  );
}
