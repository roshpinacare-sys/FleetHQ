/**
 * NetworkSelf.tsx — מודעות-הרשת (T23) + מחסן-המפתחות וסגירות-הצוות והרוסט (T24).
 * ---------------------------------------------------------------------------
 * החלון של הבעלים אל-העצמיות של הרשת — ארבעה-אופנים אחד-מעל-השני:
 *   · עצמיות   — האיבר הקנוני בענן (Autonomy/state/selfhood): בדיקה-עצמית, יכולות, גילויים, הכרעות.
 *   · מפתחות  — מחסן-המפתחות: מלאי-אמת אחד + חוק-הדרישה ("לא דורשים מפתח בלי לבדוק את המלאי").
 *   · צוות     — מה נסגר עם כל-אחת: קבלות-סגירה מול צפים, מי עובדת עכשיו.
 *   · רוסט     — רוסט agentcraft המדוד + פתרונות-חריפים לאימוץ.
 * כל-מה-שמוצג נמדד ממקור — אין המצאה. כשל-אחזור מוצג כפי-שהוא.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Send, X, KeyRound, Users, Flame, BrainCircuit, Wrench } from 'lucide-react';
import { Engineering } from '@/components/owner/Engineering';

type Tab = 'self' | 'keys' | 'crew' | 'roast' | 'eng';

type SelfCheck = { allVerified?: boolean; at?: string; discoveries?: number; claimsProcessed?: number; brain?: string | { chain?: string[]; wired?: boolean; note?: string } | null; durationMs?: number };
type Summary = {
  measuredAt: string | null;
  organsMeasured: number;
  feedsAlive: number;
  feedsTotal: number;
  sitesOk: number;
  sitesTotal: number;
  activePrivateWorkflows: number | null;
  publicOrgans: number | null;
  topOrgans: Array<{ repo: string; workflow: string; success7d: number; failure7d: number; lastSuccessAgeH: number | null }>;
  feeds: Array<{ label: string; repo: string; alive: boolean; ageH: number | null }>;
};
type Discovery = { kind?: string; repo?: string; note?: string; at?: string };
type Claim = { key?: string; claim?: string; verdict?: { verdictHe?: string; confidence?: string }; brainUsed?: boolean; at?: string };
type NetSelfData = {
  organExists: boolean;
  reason: string | null;
  selfCheck?: SelfCheck | null;
  summary?: Summary | null;
  discoveries: Discovery[];
  claims: Claim[];
  fetchedAt: string;
};

type KeyEntry = { id: string; chain: string; account: string; role: string; status: string; pubPrefix?: string | null; where: string; fit: string; receipt: string; uses: string[] };
type DemandCheck = { id: string; component: string; needs: string; registryState: string; runtimeState: string; measured: string; ok: boolean };
type KeysData = {
  registry: { title: string; law: string[]; keys: KeyEntry[]; vaults: Array<{ id: string; generation: string; status: string; note: string }>; ownerGaps: string[]; adoption: { canonicalTarget: string; stagedBundle: string } };
  health: { keysTotal: number; byStatus: Record<string, number>; demandsTotal: number; demandsSatisfied: number; ownerGaps: number; runtime: { ownerKeyFile: boolean; sessionPat: boolean; zAiConfig: boolean } };
  checks: DemandCheck[];
  feeds: Array<{ name: string; alive: boolean; ageH?: number | null; error?: string | null }>;
  sandboxRuntime: { pat: string; note: string };
  fetchedAt: string;
};

type CrewMember = { id: string; heName: string; role: string; currentlyDoing: string; workingNow: boolean; evidence: string; closed24h: number; closedItems: Array<{ what: string; evidence?: string; when?: string }>; floating: Array<{ what: string; why: string }> };
type CrewData = { ok: boolean; error?: string | null; measuredAt: string | null; ageMin: number | null; crew: CrewMember[]; unownedOpenOrders: unknown[]; verdict: string | null; servedAt: string };

type Adoptable = { id: string; title: string; priority?: string; effort?: string; target?: string };
type RoastData = { ok: boolean; error?: string | null; repo?: string | null; loc?: number | { totalRealCode?: number } | null; measuredTests?: { total?: number; collected?: number; passed?: number; failed?: number; failedName?: string } | null; verdictSummary?: string | null; theirGaps: unknown[]; ourGaps: unknown[]; adoptables: Adoptable[]; notAdopt: unknown[]; servedAt: string };

const fresh = (iso?: string | null) => {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const m = Math.round(ms / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק'`;
  return `לפני ${Math.round(m / 60)} שע'`;
};

const stateColor = (s: string) =>
  s.startsWith('SATISFIED') ? 'var(--st-ok)' : s === 'DEGRADED' ? 'var(--st-attention)' : 'var(--st-danger)';

const keyStatusColor = (s: string) =>
  s === 'LIVE' ? 'var(--st-ok)' : s === 'SEALED' ? 'var(--st-attention)' : s === 'DEGRADED' ? 'var(--st-attention)' : 'var(--st-danger)';

export function NetworkSelf() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('self');
  const [data, setData] = useState<NetSelfData | null>(null);
  const [keysData, setKeysData] = useState<KeysData | null>(null);
  const [crewData, setCrewData] = useState<CrewData | null>(null);
  const [roastData, setRoastData] = useState<RoastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [claimText, setClaimText] = useState('');
  const [claimState, setClaimState] = useState<{ kind: 'idle' | 'sending' | 'ok' | 'fail'; msg?: string }>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/network-self', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as NetSelfData;
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(`כשל-אחזור (${String(e).slice(0, 40)})`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys-registry', { cache: 'no-store' });
      if (res.ok) setKeysData((await res.json()) as KeysData);
    } catch { /* כשל-שקט — הקודם נשאר */ }
  }, []);

  const loadCrew = useCallback(async () => {
    try {
      const res = await fetch('/api/crew-closure', { cache: 'no-store' });
      if (res.ok) setCrewData((await res.json()) as CrewData);
    } catch { /* כשל-שקט */ }
  }, []);

  const loadRoast = useCallback(async () => {
    try {
      const res = await fetch('/api/roast', { cache: 'no-store' });
      if (res.ok) setRoastData((await res.json()) as RoastData);
    } catch { /* כשל-שקט */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    if (tab === 'keys') void loadKeys();
    if (tab === 'crew') void loadCrew();
    if (tab === 'roast') void loadRoast();
    timer.current = setInterval(() => {
      void load();
      if (tab === 'keys') void loadKeys();
      if (tab === 'crew') void loadCrew();
    }, 90_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [open, tab, load, loadKeys, loadCrew]);

  async function sendClaim() {
    const text = claimText.trim();
    if (!text || claimState.kind === 'sending') return;
    setClaimState({ kind: 'sending' });
    try {
      const res = await fetch('/api/network-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const j = (await res.json()) as { ok?: boolean; verified?: boolean; commitSha?: string | null; error?: string };
      if (j.ok && j.verified) {
        setClaimState({ kind: 'ok', msg: `נרשמה-בגיט (${(j.commitSha ?? '').slice(0, 7)}) · הכרעה ≤20 דק'` });
        setClaimText('');
        void load();
      } else {
        setClaimState({ kind: 'fail', msg: j.error ?? 'כשל-לא-ידוע' });
      }
    } catch (e) {
      setClaimState({ kind: 'fail', msg: String(e).slice(0, 60) });
    }
  }

  const beat = data?.selfCheck?.at ? fresh(data.selfCheck.at) : null;
  const beatOk = !!data?.selfCheck?.allVerified;
  const beatColor = !data?.organExists ? 'var(--st-attention)' : beatOk && beat && !beat.includes('שע') ? 'var(--st-ok)' : 'var(--st-attention)';

  const tabs: Array<{ id: Tab; label: string; icon: typeof Eye }> = [
    { id: 'self', label: 'עצמיות', icon: BrainCircuit },
    { id: 'keys', label: 'מפתחות', icon: KeyRound },
    { id: 'crew', label: 'צוות', icon: Users },
    { id: 'roast', label: 'רוסט', icon: Flame },
    { id: 'eng', label: 'הנדסה', icon: Wrench },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="network-self-panel"
        className="fixed bottom-4 right-4 z-40 flex h-12 min-w-[44px] items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-4 text-[13px] font-semibold text-[color:var(--ink)] shadow-lg backdrop-blur transition hover:brightness-110"
      >
        <Eye size={15} aria-hidden="true" />
        <span className="hidden sm:inline">מודעות-הרשת</span>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: beatColor }} aria-hidden="true" />
      </button>

      {open && (
        <aside
          id="network-self-panel"
          dir="rtl"
          className="fixed bottom-20 right-4 z-40 flex max-h-[76dvh] w-[min(92vw,420px)] flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)]/98 shadow-2xl backdrop-blur"
          aria-label="מודעות-הרשת"
        >
          <header className="border-b border-[color:var(--line)] bg-[color:var(--surface-2)]/90">
            <div className="flex items-center justify-between gap-2 px-3 pt-2">
              <div className="leading-tight">
                <h2 className="text-[13px] font-bold">הרשת מודעת לעצמה</h2>
                <p className="text-[10.5px] text-[color:var(--ink-3)]">מדידה-בלבד · מקור-אמת: הגיט</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="rounded-md border border-[color:var(--line)] px-2 py-1 text-[11px] hover:brightness-110">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <div role="tablist" aria-label="אופני-מודעות" className="flex gap-1 px-2 pt-1.5 pb-0">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-t-md border-x border-t px-2 text-[11.5px] font-semibold transition ${
                      active
                        ? 'border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)]'
                        : 'border-transparent text-[color:var(--ink-3)] hover:text-[color:var(--ink-2)]'
                    }`}
                  >
                    <Icon size={13} aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </header>

          <div className="sl-scroll flex-1 overflow-y-auto p-3 text-[12.5px]" style={{ maxHeight: '52dvh' }}>
            {/* ── עצמיות ── */}
            {tab === 'self' && (
              <>
                {loading && !data && <p className="text-[color:var(--ink-3)]">טוען מדידה…</p>}
                {err && <p className="text-[11.5px] text-red-400">{err}</p>}
                {data && !data.organExists && (
                  <p className="rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2.5 text-[12px] text-[color:var(--ink-2)]">
                    {data.reason}
                  </p>
                )}
                {data?.selfCheck && (
                  <section className="mb-3 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">בדיקה-עצמית</span>
                      <span className="text-[11px]" style={{ color: beatColor }}>
                        {beatOk ? '✓ אומת' : '✗ כשל'} · {beat ?? '—'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">
                      גילויים: {data.selfCheck.discoveries ?? '—'} · הכרעות: {data.selfCheck.claimsProcessed ?? '—'} · מוח:{' '}
                      {typeof data.selfCheck.brain === 'string'
                        ? data.selfCheck.brain === 'wired'
                          ? 'מחובר'
                          : data.selfCheck.brain
                        : data.selfCheck.brain?.wired
                          ? `מחובר (${(data.selfCheck.brain.chain ?? []).join('+')})`
                          : 'דטרמיניסטי-v1'}{' '}
                      · קריאה-חזרה לכל-קובץ
                    </p>
                  </section>
                )}
                {data?.summary && (
                  <section className="mb-3">
                    <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">מפת-יכולות (נמדד {fresh(data.summary.measuredAt) ?? '—'})</h3>
                    <ul className="space-y-0.5 text-[11.5px] text-[color:var(--ink-2)]">
                      <li>· איברים-פעילים: {data.summary.organsMeasured} (פומביים {data.summary.publicOrgans ?? '—'})</li>
                      <li>· פידי-אמת חיים: {data.summary.feedsAlive}/{data.summary.feedsTotal}</li>
                      <li>· אתרים 200: {data.summary.sitesOk}/{data.summary.sitesTotal}</li>
                      <li>
                        · חוק-עצירת-הדימום (פרטי=0):{' '}
                        <span style={{ color: data.summary.activePrivateWorkflows === 0 ? 'var(--st-ok)' : 'var(--st-danger)' }}>
                          {data.summary.activePrivateWorkflows === null ? '—' : data.summary.activePrivateWorkflows === 0 ? 'קיים ✓' : `נשבר (${data.summary.activePrivateWorkflows})`}
                        </span>
                      </li>
                    </ul>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(data.summary.feeds ?? []).map((f) => (
                        <span
                          key={f.label + f.repo}
                          className="rounded border px-1.5 py-0.5 text-[10.5px]"
                          style={{ borderColor: 'var(--line)', color: f.alive ? 'var(--ink-2)' : 'var(--st-danger)' }}
                          title={`${f.repo} · ${f.alive ? `גיל ${f.ageH ?? '?'}h` : 'לא-זמין'}`}
                        >
                          {f.label} {f.alive ? '· חי' : '· ✗'}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
                {!!data?.discoveries.length && (
                  <section className="mb-3">
                    <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">הרשת שמה-לב (גילויים)</h3>
                    <ul className="space-y-1 text-[11.5px]">
                      {data.discoveries.map((d, i) => (
                        <li key={i} className="rounded border border-[color:var(--line)] px-2 py-1.5">
                          <span className="font-semibold">{d.repo ?? '—'}</span> · {d.note ?? d.kind}
                          <span className="block text-[9.5px] text-[color:var(--ink-3)]">{fresh(d.at) ?? ''}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {!!data?.claims.length && (
                  <section className="mb-3">
                    <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">פניות-שהוכרעו</h3>
                    <ul className="space-y-1 text-[11.5px]">
                      {data.claims.map((c, i) => (
                        <li key={i} className="rounded border border-[color:var(--line)] px-2 py-1.5">
                          <span className="text-[color:var(--ink-3)]">{c.claim?.slice(0, 90)}</span>
                          <span className="mt-0.5 block font-medium">{c.verdict?.verdictHe?.slice(0, 180) ?? '—'}</span>
                          <span className="block text-[9.5px] text-[color:var(--ink-3)]">
                            מוח: {c.brainUsed ? 'כן' : 'לא (fail-closed)'} · רמה: {c.verdict?.confidence ?? '—'} · {fresh(c.at) ?? ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}

            {/* ── מפתחות ── */}
            {tab === 'keys' && (
              <>
                {!keysData && <p className="text-[color:var(--ink-3)]">טוען את מחסן-המפתחות…</p>}
                {keysData && (
                  <>
                    <section className="mb-3 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">מחסן-המפתחות · מלאי-אמת אחד</span>
                        <span className="text-[10.5px] text-[color:var(--ink-3)]">{fresh(keysData.fetchedAt) ?? ''}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[color:var(--ink-2)]">
                        {keysData.health.keysTotal} מפתחות-רשומים · דרישות-מסופקות {keysData.health.demandsSatisfied}/{keysData.health.demandsTotal} · פערי-בעלים {keysData.health.ownerGaps}
                      </p>
                      <p className="mt-1 text-[10.5px]" style={{ color: keysData.health.runtime.sessionPat ? 'var(--st-ok)' : 'var(--st-attention)' }}>
                        אסימון-סשן: {keysData.sandboxRuntime.pat} · קובץ-בעלים: {keysData.health.runtime.ownerKeyFile ? 'קיים' : 'חסר'} · קונפיג-מוח: {keysData.health.runtime.zAiConfig ? 'קיים' : 'חסר'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {keysData.feeds.map((f) => (
                          <span key={f.name} className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--line)', color: f.alive ? 'var(--st-ok)' : 'var(--st-danger)' }}>
                            {f.name} {f.alive ? '· חי' : '· ✗'}
                          </span>
                        ))}
                      </div>
                    </section>

                    <section className="mb-3">
                      <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">חוק-הדרישה: בדיקת-מלאי לפני-כל-דרישה</h3>
                      <ul className="space-y-1 text-[11px]">
                        {keysData.checks.map((c) => (
                          <li key={c.id} className="rounded border border-[color:var(--line)] px-2 py-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium">{c.component}</span>
                              <span className="shrink-0 text-[10px] font-bold" style={{ color: stateColor(c.runtimeState) }}>
                                {c.runtimeState}
                              </span>
                            </div>
                            <span className="mt-0.5 block text-[10px] text-[color:var(--ink-3)]">דורש: {c.needs} · {c.measured}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="mb-3">
                      <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">המלאי (לפי-מחלקה)</h3>
                      <ul className="space-y-1 text-[11px]">
                        {keysData.registry.keys.map((k) => (
                          <li key={k.id} className="rounded border border-[color:var(--line)] px-2 py-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium">{k.account}</span>
                              <span className="shrink-0 text-[10px] font-bold" style={{ color: keyStatusColor(k.status) }}>
                                {k.status}
                              </span>
                            </div>
                            <span className="mt-0.5 block text-[10px] text-[color:var(--ink-3)]">
                              {k.chain} · {k.role} · {k.where}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[color:var(--ink-2)]">{k.fit}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    {!!keysData.registry.ownerGaps.length && (
                      <section className="mb-3 rounded-md border border-[color:var(--line)] p-2.5" style={{ background: 'color-mix(in srgb, var(--st-danger) 7%, transparent)' }}>
                        <h3 className="mb-1 text-[11.5px] font-bold">פערים-שרק-הבעלים סוגר</h3>
                        <ul className="list-inside list-disc space-y-0.5 text-[11px] text-[color:var(--ink-2)]">
                          {keysData.registry.ownerGaps.map((gp, i) => (
                            <li key={i}>{gp}</li>
                          ))}
                        </ul>
                      </section>
                    )}

                    <section className="mb-3">
                      <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">החוק</h3>
                      <ul className="list-inside list-disc space-y-0.5 text-[10.5px] text-[color:var(--ink-3)]">
                        {keysData.registry.law.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[10px] text-[color:var(--ink-3)]">
                        אימוץ-ענן: הרישום-הקנוני {keysData.registry.adoption.canonicalTarget} · חבילה-מוכנה {keysData.registry.adoption.stagedBundle}
                      </p>
                    </section>
                  </>
                )}
              </>
            )}

            {/* ── צוות ── */}
            {tab === 'crew' && (
              <>
                {!crewData && <p className="text-[color:var(--ink-3)]">טוען סגירות-הצוות…</p>}
                {crewData && !crewData.ok && <p className="text-[11.5px] text-red-400">{crewData.error}</p>}
                {crewData?.ok && (
                  <>
                    <p className="mb-2 text-[11px] text-[color:var(--ink-3)]">
                      מדידה {crewData.measuredAt ? fresh(crewData.measuredAt) : '—'} · 11 מקורות-גיט ציבוריים · md5-כפול
                    </p>
                    {crewData.verdict && <p className="mb-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2 text-[11px] text-[color:var(--ink-2)]">{crewData.verdict}</p>}
                    <ul className="space-y-1.5">
                      {crewData.crew.map((c) => (
                        <li key={c.id} className="rounded border border-[color:var(--line)] px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold">{c.heName}</span>
                            <span className="flex items-center gap-1 text-[10px]" style={{ color: c.workingNow ? 'var(--st-ok)' : 'var(--st-attention)' }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.workingNow ? 'var(--st-ok)' : 'var(--st-attention)' }} aria-hidden="true" />
                              {c.workingNow ? 'על-העמדה' : 'לא-נמדדה'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10.5px] text-[color:var(--ink-3)]">{c.role}</p>
                          <p className="mt-0.5 text-[11px] text-[color:var(--ink-2)]">עכשיו: {c.currentlyDoing}</p>
                          <p className="mt-0.5 text-[11px]">
                            סגרה ב-24 שע: <span style={{ color: c.closed24h > 0 ? 'var(--st-ok)' : 'var(--st-attention)' }} className="font-bold">{c.closed24h}</span>
                            {c.closedItems.length > 0 && <span className="text-[color:var(--ink-3)]"> · {c.closedItems.map((ci) => ci.what).slice(0, 2).join(' · ').slice(0, 70)}</span>}
                          </p>
                          {c.floating.length > 0 && (
                            <p className="mt-0.5 text-[10.5px]" style={{ color: 'var(--st-danger)' }}>
                              צף: {c.floating.map((f) => f.what).slice(0, 2).join(' · ').slice(0, 90)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {crewData.unownedOpenOrders.length > 0 && (
                      <p className="mt-2 text-[10.5px]" style={{ color: 'var(--st-attention)' }}>
                        {crewData.unownedOpenOrders.length} סדרי-עבודה פתוחים ללא-בעלות-צוות — ראו דוכן-ההחלטות
                      </p>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── רוסט ── */}
            {tab === 'roast' && (
              <>
                {!roastData && <p className="text-[color:var(--ink-3)]">טוען רוסט…</p>}
                {roastData && !roastData.ok && <p className="text-[11.5px] text-red-400">{roastData.error}</p>}
                {roastData?.ok && (
                  <>
                    <section className="mb-3 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-2.5">
                      <h3 className="text-[12px] font-bold">{roastData.repo}</h3>
                      <p className="mt-0.5 text-[10.5px] text-[color:var(--ink-3)]">
                        {roastData.loc && typeof roastData.loc === 'object' && 'totalRealCode' in roastData.loc
                          ? `≈${(Number(roastData.loc.totalRealCode) / 1000).toFixed(1)}K שורות-קוד`
                          : String(roastData.loc ?? '—')}{' '}· בדיקות-נמדדו: {roastData.measuredTests?.passed}/{roastData.measuredTests?.total ?? roastData.measuredTests?.collected} (נפל: {roastData.measuredTests?.failedName ?? roastData.measuredTests?.failed ?? '—'})
                      </p>
                      {roastData.verdictSummary && <p className="mt-1 text-[11px] text-[color:var(--ink-2)]">{roastData.verdictSummary}</p>}
                    </section>
                    <section className="mb-3">
                      <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">פתרונות-חריפים לאימוץ ({roastData.adoptables.length})</h3>
                      <ul className="space-y-1 text-[11px]">
                        {roastData.adoptables.map((a) => (
                          <li key={a.id} className="rounded border border-[color:var(--line)] px-2 py-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium">{a.title}</span>
                              <span className="shrink-0 text-[9.5px] font-bold text-[color:var(--ink-3)]">{a.id} · {a.effort}</span>
                            </div>
                            <span className="mt-0.5 block text-[10px] text-[color:var(--ink-3)]">יעד: {a.target}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    {!!roastData.notAdopt.length && (
                      <section className="mb-3">
                        <h3 className="mb-1 text-[11.5px] font-bold text-[color:var(--ink-2)]">מה-לא-מאמצים</h3>
                        <ul className="list-inside list-disc space-y-0.5 text-[10.5px] text-[color:var(--ink-3)]">
                          {roastData.notAdopt.map((n, i) => {
                            const s = typeof n === 'string' ? n : (n as { what?: string; why?: string }) ?? {};
                            const txt = typeof s === 'string' ? s : [s.what, s.why].filter(Boolean).join(' — ');
                            return <li key={i}>{txt.slice(0, 160)}</li>;
                          })}
                        </ul>
                      </section>
                    )}
                    <p className="text-[10px] text-[color:var(--ink-3)]">הרוסט-המלא: t24/agentcraft-roast.md · כל-הטענות עם-אסמכתאות-קוד</p>
                  </>
                )}
              </>
            )}
          </div>

          {/* ── הנדסה ── */}
          {tab === 'eng' && (
            <div className="sl-scroll flex-1 overflow-y-auto p-3 text-[12.5px]" style={{ maxHeight: '52dvh' }}>
              <Engineering />
            </div>
          )}

          <div className="border-t border-[color:var(--line)] p-3">
            <label htmlFor="claim-text" className="mb-1 block text-[11px] text-[color:var(--ink-3)]">
              פנייה-לריבונות (המפעיל-הוא-האוטונומיה — הכרעה ≤20 דק')
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="claim-text"
                value={claimText}
                onChange={(e) => setClaimText(e.target.value)}
                placeholder="למשל: למה הגריד של steem עומד? מה צריך כדי להפעיל?"
                rows={2}
                className="min-h-[44px] flex-1 resize-none rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[color:var(--accent,#b88a3a)]"
              />
              <button
                type="button"
                onClick={sendClaim}
                disabled={claimState.kind === 'sending' || !claimText.trim()}
                aria-label="שליחת-פנייה"
                className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--accent,#b88a3a)] text-white transition hover:brightness-110 disabled:opacity-50"
              >
                <Send size={16} aria-hidden="true" />
              </button>
            </div>
            {claimState.kind === 'ok' && <p className="mt-1 text-[11px]" style={{ color: 'var(--st-ok)' }}>{claimState.msg}</p>}
            {claimState.kind === 'fail' && <p className="mt-1 text-[11px] text-red-400">{claimState.msg}</p>}
            {claimState.kind === 'sending' && <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">נותב לגיט הקנוני…</p>}
          </div>
        </aside>
      )}
    </>
  );
}
