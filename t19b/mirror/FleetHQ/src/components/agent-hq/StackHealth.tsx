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
import { HEALTH_TONE_SEMANTIC, semanticVar } from '@/components/hq/tokens';
import { Panel } from './panels';

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
  monitor?: { alive?: boolean; last_ts?: string | null; stale_min?: number | null } | null;
  post_batcher?: { alive?: boolean; at?: string | null; ready_count?: number | null; held_count?: number | null; lineage_root?: string | null; stale_min?: number | null } | null;
  boot_watcher?: { alive?: boolean; at?: string | null; port_ok?: boolean | null; spawns?: number | null; last_spawn_at?: string | null; stale_min?: number | null } | null;
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
  witnessMonitor: { he: 'מעקב-העדים', en: 'Witness monitor' },
  alive: { he: 'חי', en: 'alive' },
  down: { he: 'מת', en: 'DOWN' },
  lastTick: { he: 'תיק-אחרון', en: 'last tick' },
  postBatcher: { he: 'צובר-הפוסטים', en: 'Post batcher' },
  packed: { he: 'ארוזים', en: 'packed' },
  bootWatcher: { he: 'לב-המשמר', en: 'Boot watcher' },
  revives: { he: 'הקמות', en: 'revives' },
  portOk: { he: 'פורט', en: 'port' },
} as const;

function tr(k: keyof typeof L, lang: Lang): string {
  return L[k][lang];
}

function Dot({ tone }: { tone: 'ok' | 'warn' | 'bad' }) {
  return <span className="sl-dot" style={{ backgroundColor: semanticVar(HEALTH_TONE_SEMANTIC[tone]) }} aria-hidden="true" />;
}

function Cell({
  label, tone, value, sub, ltr = true,
}: {
  label: string; tone: 'ok' | 'warn' | 'bad'; value: string; sub?: string; ltr?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
      <span className="truncate text-[11.5px] font-semibold text-[color:var(--ink-2)]" dir="auto">{label}</span>
      <span className="flex items-center gap-2 text-[13px] font-bold text-[color:var(--ink)]" dir={ltr ? 'ltr' : 'auto'}>
        <Dot tone={tone} />
        <span className="truncate font-mono text-[12px]">{value}</span>
      </span>
      {sub ? <span className="truncate text-[10.5px] text-[color:var(--ink-3)]" dir="ltr">{sub}</span> : null}
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
    <section id="sec-stack" className="mt-6" aria-label={tr('secStack', lang)}>
      <Panel title={tr('secStack', lang)} actions={h ? (
        <span className="sl-chip font-mono" dir="ltr">
          <Dot tone={h.all_ok ? 'ok' : 'bad'} />
          all_ok={String(h.all_ok)}
        </span>
      ) : undefined} meta={tr('verified', lang)}>
        {!h && !err ? (
          <div className="py-6 text-center text-[13px] text-[color:var(--ink-3)]" dir="auto">{tr('loading', lang)}</div>
        ) : !h ? (
          <div className="py-6 text-center text-[13px]" style={{ color: 'var(--st-danger)' }} dir="auto">{tr('unreachable', lang)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
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
            <Cell label={tr('witnessMonitor', lang)}
              tone={!h.monitor?.alive ? 'bad'
                : !h.monitor.last_ts ? 'warn'
                  : h.monitor.stale_min != null && h.monitor.stale_min > 15 ? 'warn' : 'ok'}
              value={h.monitor ? `${h.monitor.alive ? tr('alive', lang) : tr('down', lang)}${h.monitor.stale_min != null ? ` · Δ=${h.monitor.stale_min}min` : ''}` : tr('absent', lang)}
              sub={h.monitor?.last_ts ? `${tr('lastTick', lang)}=${h.monitor.last_ts}` : undefined} ltr={false} />
            <Cell label={tr('postBatcher', lang)}
              tone={!h.post_batcher?.alive ? 'bad'
                : !h.post_batcher.at ? 'warn'
                  : (h.post_batcher.stale_min != null && h.post_batcher.stale_min > 60) || (h.post_batcher.held_count ?? 0) > 0 ? 'warn' : 'ok'}
              value={h.post_batcher?.ready_count != null ? `${tr('packed', lang)}=${h.post_batcher.ready_count}/11${h.post_batcher.held_count ? ` · held=${h.post_batcher.held_count}` : ''}` : tr('absent', lang)}
              sub={h.post_batcher?.lineage_root ? `${h.post_batcher.lineage_root.slice(0, 12)}…${h.post_batcher.stale_min != null ? ` · Δ=${h.post_batcher.stale_min}min` : ''}` : undefined} ltr={false} />
            <Cell label={tr('bootWatcher', lang)}
              tone={!h.boot_watcher?.alive ? 'bad'
                : h.boot_watcher.port_ok === false ? 'warn'
                  : h.boot_watcher.stale_min != null && h.boot_watcher.stale_min > 10 ? 'warn' : 'ok'}
              value={h.boot_watcher ? `${h.boot_watcher.alive ? tr('alive', lang) : tr('down', lang)} · ${tr('portOk', lang)}=${h.boot_watcher.port_ok == null ? '?' : h.boot_watcher.port_ok ? 'ok' : 'down'}` : tr('absent', lang)}
              sub={h.boot_watcher?.spawns != null ? `${tr('revives', lang)}=${h.boot_watcher.spawns}${h.boot_watcher.stale_min != null ? ` · Δ=${h.boot_watcher.stale_min}min` : ''}` : undefined} ltr={false} />
            <Cell label={tr('probes', lang)}
              tone={!h.status?.ts ? 'bad'
                : Date.now() - new Date(h.status.ts).getTime() > 10 * 60_000 ? 'warn'
                  : h.status.results?.every((r) => r.verdict === 'OK') ? 'ok'
                    : h.status.results?.some((r) => r.verdict === 'OK') ? 'warn' : 'bad'}
              value={h.status?.results?.map((r) => `${r.name}:${r.verdict}`).join(' ') ?? tr('absent', lang)}
              sub={h.status?.results?.map((r) => `${r.name}=${r.latency_ms}ms`).join(' · ') || undefined} ltr={false} />
          </div>
        )}
      </Panel>
    </section>
  );
}
