"use client";

// עולם-הצי 2.0 — the living sovereignty atlas (client shell).
// HUD: receipt tape, SAOS token layer (pools + custody + honesty), gates, lines,
// citizens roster with focus, truth timeline, minimap, keyboard shortcuts.
// Everything measured from the fleet's real books via /api/world.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorldCanvas, { type Selection, type WorldCanvasApi } from "./WorldCanvas";
import MiniMap from "./MiniMap";
import { ago, fmtClock, healthWord, t } from "@/lib/fleet-world/i18n";
import type { Citizen, District, Lang, WorldState } from "@/lib/fleet-world/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Flame, KeyRound, Landmark, Map as MapIcon, RefreshCw, ScrollText, Shield,
  Users, Waypoints, History, Search,
} from "lucide-react";

const HEALTH_DOT: Record<string, string> = {
  alive: "#22c55e",
  waiting: "#eab308",
  stale: "#f97316",
  down: "#ef4444",
};

const KIND_COLOR: Record<string, string> = {
  gate: "#f0d060",
  beat: "#22c55e",
  receipt: "#5eead4",
  pulse: "#d8d3c2",
  "fee-law": "#f0b23c",
  moment: "#e8a0bf",
  delta: "#c9b892",
  fill: "#f0b23c",
  coord: "#5eead4",
};

type Tab = "token" | "gates" | "lines" | "roster" | "timeline";

export default function FleetWorld() {
  const [data, setData] = useState<WorldState | null>(null);
  const [error, setError] = useState(false);
  const [lang, setLang] = useState<Lang>("he");
  const [sel, setSel] = useState<Selection | null>(null);
  const [clock, setClock] = useState("--:--:--");
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>("token");
  const [mobileOpen, setMobileOpen] = useState<null | "tape" | "hud">(null);
  const [minimapOn, setMinimapOn] = useState(false);
  const [query, setQuery] = useState("");
  const canvasApi = useRef<WorldCanvasApi | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/world", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as WorldState;
      if (!j.ok) throw new Error("bad book");
      setData(j);
      setSyncedAt(Date.now());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = window.setInterval(load, 60_000);
    return () => window.clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setClock(fmtClock(new Date()));
      setTick((n) => n + 1);
    }, 1000);
    setClock(fmtClock(new Date()));
    return () => window.clearInterval(iv);
  }, []);

  // keyboard shortcuts: Esc close · T tape · L language · R refresh · M minimap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") setSel(null);
      else if (e.key === "t" || e.key === "T") setMobileOpen((m) => (m === "tape" ? null : m === "hud" ? "hud" : "tape"));
      else if (e.key === "l" || e.key === "L") setLang((l) => (l === "he" ? "en" : "he"));
      else if (e.key === "r" || e.key === "R") load();
      else if (e.key === "m" || e.key === "M") setMinimapOn((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load]);

  const dir = lang === "he" ? "rtl" : "ltr";
  const truthOk = data ? data.truth.verdict === "ALL-GREEN" && data.truth.assertions.failed === 0 : false;

  const district = useMemo(() => (sel?.type === "district" ? data?.districts.find((d) => d.id === sel.id) ?? null : null), [sel, data]);
  const citizen = useMemo(() => (sel?.type === "citizen" ? data?.citizens.find((c) => c.id === sel.id) ?? null : null), [sel, data]);

  const onSelect = useCallback((s: Selection | null) => setSel(s), []);

  const focusDistrict = useCallback((id: string) => {
    setSel({ type: "district", id });
    canvasApi.current?.focusDistrict(id);
  }, []);

  const focusCitizen = useCallback((id: string, dist: string) => {
    setSel({ type: "citizen", id });
    canvasApi.current?.focusCitizenDistrict(dist);
  }, []);

  const fmtNum = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));

  // sync countdown (client-measured, honest)
  const syncSecs = syncedAt ? Math.max(0, Math.round((Date.now() - syncedAt) / 1000)) : null;
  void tick;

  // day/night chip
  const hourUtc = new Date().getUTCHours();
  const isNight = hourUtc >= 19 || hourUtc < 5;

  const newest = data?.tape[0];

  const TapePanel = (opts?: { hideHeader?: boolean }) => (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {!opts?.hideHeader && (
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[13px] font-bold text-[#f0d060]">
            <ScrollText className="h-4 w-4" />
            {t("tape", lang)}
          </h3>
          <span className="font-mono text-[10px] text-[#8a9a7b]">{data?.tape.length ?? 0}</span>
        </div>
      )}
      <div className="fw-scroll min-h-0 flex-1 overflow-y-auto pe-1" style={{ maxHeight: "min(52vh, 470px)" }}>
        <ul className="space-y-1.5">
          {(data?.tape ?? []).map((ev) => (
            <li
              key={ev.id}
              className="rounded-lg border border-[#d8d3c2]/8 bg-black/30 px-2.5 py-1.5 transition-colors hover:border-[#f0d060]/30"
            >
              <div className="flex items-center gap-2 font-mono text-[10px] text-[#8a9a7b]">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[ev.kind] ?? "#d8d3c2" }} />
                <span>{ev.source}</span>
                <span className="ms-auto shrink-0">{ago(ev.at, lang)}</span>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-[#e8e4d8]/90">{ev.text[lang]}</p>
            </li>
          ))}
          {!data && <li className="py-6 text-center text-xs text-[#8a9a7b]">{t("loading", lang)}</li>}
        </ul>
      </div>
    </div>
  );

  const HudPanels = (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid grid-cols-5 gap-1 rounded-lg bg-black/40 p-1">
        {(
          [
            ["token", t("tokenTab", lang), Landmark],
            ["gates", t("gatesTab", lang), KeyRound],
            ["lines", t("linesTab", lang), Waypoints],
            ["roster", t("rosterTab", lang), Users],
            ["timeline", t("timelineTab", lang), History],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            title={label}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] font-bold transition-colors ${
              tab === k ? "bg-[#f0d060]/15 text-[#f0d060]" : "text-[#b8b2a0] hover:bg-white/5"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="leading-none">{label}</span>
          </button>
        ))}
      </div>

      <div className="fw-scroll min-h-0 flex-1 overflow-y-auto pe-1" style={{ maxHeight: "min(56vh, 520px)" }}>
        {tab === "token" && <TokenPanel data={data} lang={lang} fmtNum={fmtNum} />}
        {tab === "gates" && <GatesPanel data={data} lang={lang} />}
        {tab === "lines" && <LinesPanel data={data} lang={lang} fmtNum={fmtNum} />}
        {tab === "roster" && (
          <RosterPanel data={data} lang={lang} query={query} setQuery={setQuery} onPick={focusCitizen} />
        )}
        {tab === "timeline" && <TimelinePanel data={data} lang={lang} />}
      </div>
    </div>
  );

  return (
    <div dir={dir} lang={lang} className="flex min-h-screen flex-col bg-[#0b0e08] text-[#e8e4d8]">
      {/* screen-reader announcements of the newest real event */}
      <p aria-live="polite" className="sr-only">
        {newest ? `${newest.source}: ${newest.text[lang]}` : ""}
      </p>

      {/* ── header */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[#f0d060]/12 bg-[#0b0e08]/92 px-3 backdrop-blur md:px-5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-[#f0d060]/25 to-[#f0b23c]/10 ring-1 ring-[#f0d060]/40">
            <Flame className="h-4 w-4 text-[#f0d060]" />
          </span>
          <div className="leading-tight">
            <h1 className="text-[15px] font-extrabold tracking-tight text-[#f7e9b8]">{t("title", lang)}</h1>
            <p className="hidden text-[10.5px] text-[#8a9a7b] sm:block">{t("subtitle", lang)}</p>
          </div>
        </div>

        <div className="ms-auto flex items-center gap-2">
          {data && (
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-bold sm:flex ${
                truthOk ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#4ade80]" : "border-[#eab308]/40 bg-[#eab308]/10 text-[#eab308]"
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${truthOk ? "bg-[#22c55e]" : "bg-[#eab308]"}`} />
              {data.truth.verdict} · {data.truth.assertions.passed}/{data.truth.assertions.total}
            </span>
          )}
          <span className="hidden font-mono text-[11px] text-[#8a9a7b] md:inline">{clock}</span>
          {syncSecs != null && (
            <span className="hidden font-mono text-[9.5px] text-[#8a9a7b]/80 lg:inline" title={t("nextSync", lang)}>
              {t("synced", lang)} {syncSecs}{t("seconds", lang)}
            </span>
          )}
          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="rounded-md border border-[#f0d060]/25 px-2.5 py-1 text-[11px] font-bold text-[#f0d060] transition-colors hover:bg-[#f0d060]/10"
            aria-label="Toggle language"
          >
            {lang === "he" ? "EN" : "עב"}
          </button>
          <a
            href="/console/index.html"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md border border-[#d8d3c2]/20 px-2.5 py-1 text-[11px] font-bold text-[#d8d3c2] transition-colors hover:border-[#f0d060]/40 hover:text-[#f0d060] sm:inline-block"
          >
            {t("console", lang)} ↗
          </a>
          <button
            onClick={load}
            className="rounded-md border border-[#d8d3c2]/20 p-1.5 text-[#b8b2a0] transition-colors hover:border-[#f0d060]/40 hover:text-[#f0d060]"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${data ? "" : "animate-spin"}`} />
          </button>
        </div>
      </header>

      {/* ── world stage */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <WorldCanvas ref={canvasApi} data={data} lang={lang} selected={sel} onSelect={onSelect} />
        </div>

        {/* stats chips (desktop) */}
        {data && (
          <div className="pointer-events-none absolute inset-x-0 top-2 hidden justify-center gap-1.5 lg:flex">
            <Chip label="height" value={fmtNum(data.token.height)} />
            <Chip label="SAOS µ·k" value={data.token.refPriceMu != null ? (data.token.refPriceMu / 1000).toFixed(3) : "—"} />
            <Chip label="swaps" value={fmtNum(data.token.swaps)} />
            <Chip label="fills" value={fmtNum(data.token.fills)} />
            <Chip label="real $" value={data.token.honest.realCustodyUsd != null ? `$${data.token.honest.realCustodyUsd.toFixed(2)}` : "—"} />
            <Chip label={lang === "he" ? "חיים" : "live"} value={`${data.census.liveDesks}`} tone="green" />
            <Chip label={isNight ? t("night", lang) : t("day", lang)} value={isNight ? "☾" : "☀"} />
          </div>
        )}

        {/* desktop overlays */}
        <div className="pointer-events-none absolute inset-0 hidden p-3 pt-12 lg:block">
          <div className="flex h-full items-start justify-between gap-3">
            <aside className="pointer-events-auto flex w-[300px] flex-col gap-2">
              <div className="rounded-xl border border-[#f0d060]/15 bg-[#0b0e08]/72 p-4 shadow-2xl backdrop-blur-md">
                {TapePanel()}
              </div>
              <div className="rounded-xl border border-[#d8d3c2]/12 bg-[#0b0e08]/72 p-2 shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-between px-1 pb-1">
                  <span className="text-[9.5px] font-bold text-[#8a9a7b]">{t("minimap", lang)}</span>
                  <button
                    onClick={() => canvasApi.current?.reset()}
                    className="rounded border border-[#d8d3c2]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#b8b2a0] transition-colors hover:border-[#f0d060]/40 hover:text-[#f0d060]"
                  >
                    {t("resetView", lang)}
                  </button>
                </div>
                <MiniMap data={data} canvasApi={canvasApi} />
              </div>
            </aside>
            <aside className="pointer-events-auto w-[336px] rounded-xl border border-[#f0d060]/15 bg-[#0b0e08]/72 p-4 shadow-2xl backdrop-blur-md">
              {HudPanels}
            </aside>
          </div>
        </div>

        {/* mobile minimap toggle */}
        <button
          onClick={() => setMinimapOn(!minimapOn)}
          className="absolute end-3 top-3 z-20 rounded-lg border border-[#f0d060]/25 bg-[#0b0e08]/85 p-2 text-[#f0d060] backdrop-blur lg:hidden"
          aria-label={t("minimap", lang)}
        >
          <MapIcon className="h-4 w-4" />
        </button>
        {minimapOn && (
          <div className="absolute start-3 top-3 z-20 rounded-xl border border-[#d8d3c2]/15 bg-[#0b0e08]/85 p-1.5 backdrop-blur lg:hidden">
            <MiniMap data={data} canvasApi={canvasApi} />
          </div>
        )}

        {/* legend strip */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center p-3 lg:flex">
          <div className="pointer-events-auto flex max-w-[92%] flex-wrap items-center justify-center gap-1.5 rounded-xl border border-[#d8d3c2]/10 bg-[#0b0e08]/78 px-3 py-2 backdrop-blur-md">
            <span className="me-1 hidden font-mono text-[9.5px] text-[#8a9a7b]/70 xl:inline">{t("zoomHint", lang)}</span>
            {(data?.districts ?? []).map((d) => (
              <button
                key={d.id}
                onClick={() => focusDistrict(d.id)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-[#d8d3c2] transition-colors hover:bg-white/5 hover:text-[#f7e9b8]"
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: HEALTH_DOT[d.health], boxShadow: `0 0 8px ${HEALTH_DOT[d.health]}` }} />
                {d.name[lang]}
              </button>
            ))}
            {!data && <span className="px-3 py-1 text-[11px] text-[#8a9a7b]">{t("loading", lang)}</span>}
          </div>
        </div>

        {/* loading / error state */}
        {!data && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b0e08]/80 backdrop-blur-sm">
            {error ? (
              <div className="mx-4 max-w-sm rounded-xl border border-[#ef4444]/30 bg-black/60 p-6 text-center">
                <p className="text-sm font-bold text-[#ef4444]">{t("errorTitle", lang)}</p>
                <p className="mt-2 text-xs leading-relaxed text-[#b8b2a0]">{t("errorHint", lang)}</p>
                <Button onClick={load} className="mt-4 bg-[#f0d060] text-[#0b0e08] hover:bg-[#f7e08a]">
                  {t("retry", lang)}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <span className="relative flex h-14 w-14 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#f0d060]/20" />
                  <Flame className="h-8 w-8 animate-pulse text-[#f0d060]" />
                </span>
                <p className="text-sm font-bold text-[#f7e9b8]">{t("loading", lang)}</p>
                <p className="text-xs text-[#8a9a7b]">{t("loadingHint", lang)}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── footer (sticky bottom, honest) */}
      <footer className="z-30 mt-auto shrink-0 border-t border-[#f0d060]/12 bg-[#0b0e08]/92 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[10.5px] text-[#8a9a7b]">
          <span className="font-bold text-[#b8b2a0]">{t("measuredFrom", lang)}</span>
          {data && (
            <span className="ms-auto flex flex-wrap gap-x-3 gap-y-1 font-mono">
              <span>{data.census.lanes ?? "—"} {t("censusLine", lang)}</span>
              <span>· {data.census.capabilities ?? "—"} {t("censusCaps", lang)}</span>
              <span>· {data.census.desks ?? "—"} {t("censusDesks", lang)}</span>
              <span className="text-[#4ade80]">· {data.census.liveDesks} {t("censusLive", lang)}</span>
              {data.indicators.verdict && (
                <span className="text-[#e8a0bf]">· {t("indicatorsTitle", lang)} {data.indicators.verdict}</span>
              )}
            </span>
          )}
        </div>
      </footer>

      {/* ── mobile toolbar + sheets */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around gap-1 border-t border-[#f0d060]/15 bg-[#0b0e08]/95 px-2 py-1.5 backdrop-blur lg:hidden" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}>
        <button
          onClick={() => setMobileOpen("tape")}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold text-[#d8d3c2] active:bg-white/5"
        >
          <ScrollText className="h-4 w-4 text-[#f0d060]" />
          {t("tape", lang)}
        </button>
        <button
          onClick={() => setMobileOpen("hud")}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold text-[#d8d3c2] active:bg-white/5"
        >
          <Landmark className="h-4 w-4 text-[#f0d060]" />
          {t("tokenTab", lang)}
        </button>
        <a href="/console/index.html" target="_blank" rel="noreferrer" className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold text-[#d8d3c2]">
          <Shield className="h-4 w-4 text-[#f0d060]" />
          {t("console", lang)}
        </a>
      </nav>
      <div className="h-12 lg:hidden" />

      <Sheet open={mobileOpen === "tape"} onOpenChange={(o) => !o && setMobileOpen(null)}>
        <SheetContent side="bottom" className="h-[70vh] border-[#f0d060]/20 bg-[#0b0e08] p-4 text-[#e8e4d8]">
          <SheetHeader className="p-0 pb-2">
            <SheetTitle className="text-[#f0d060]">{t("tape", lang)}</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(70vh-72px)] overflow-y-auto">{TapePanel({ hideHeader: true })}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={mobileOpen === "hud"} onOpenChange={(o) => !o && setMobileOpen(null)}>
        <SheetContent side="bottom" className="h-[78vh] border-[#f0d060]/20 bg-[#0b0e08] p-4 text-[#e8e4d8]">
          <SheetHeader className="p-0 pb-2">
            <SheetTitle className="text-[#f0d060]">{t("tokenTab", lang)} · {t("gatesTab", lang)}</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(78vh-72px)] overflow-y-auto">{HudPanels}</div>
        </SheetContent>
      </Sheet>

      {/* ── selection dialog */}
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent aria-describedby={undefined} className="border-[#f0d060]/25 bg-[#0d110a] text-[#e8e4d8] sm:max-w-md" dir={dir}>
          {district && <DistrictBody d={district} lang={lang} />}
          {citizen && <CitizenBody c={citizen} lang={lang} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── panels ───────────────────────────────────────────────────────────────────

function Chip({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <span className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#d8d3c2]/12 bg-[#0b0e08]/80 px-2.5 py-1 font-mono text-[10px] text-[#b8b2a0] backdrop-blur">
      <span className="text-[#8a9a7b]">{label}</span>
      <span className={`font-bold ${tone === "green" ? "text-[#4ade80]" : "text-[#f7e9b8]"}`} dir="ltr">{value}</span>
    </span>
  );
}

function PriceSpark({ data, lang }: { data: WorldState; lang: Lang }) {
  const prices = data.engineTape.slice(0, 40).map((f) => f.price).reverse();
  if (prices.length < 2) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * 100},${28 - ((p - lo) / span) * 24}`).join(" ");
  const up = prices[prices.length - 1] >= prices[0];
  const delta = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
  return (
    <div className="rounded-lg border border-[#f0b23c]/20 bg-black/25 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-bold text-[#d8d3c2]">{t("priceMove", lang)}</p>
        <span className={`font-mono text-[10.5px] font-bold ${up ? "text-[#4ade80]" : "text-[#f87171]"}`} dir="ltr">
          {delta >= 0 ? "+" : ""}{delta.toFixed(2)}%
        </span>
      </div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-1 h-8 w-full">
        <polyline points={pts} fill="none" stroke={up ? "#4ade80" : "#f87171"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-0.5 font-mono text-[9px] text-[#8a9a7b]" dir="ltr">{prices.length} fills · engine tape</p>
    </div>
  );
}

function TokenPanel({ data, lang, fmtNum }: { data: WorldState | null; lang: Lang; fmtNum: (v: number | null | undefined) => string }) {
  if (!data) return null;
  const tk = data.token;
  return (
    <div className="space-y-3 pb-2">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold text-[#f7e9b8]">SAOS</span>
          <span className="text-[11px] text-[#8a9a7b]">{tk.name[lang]}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Stat k={t("internalPrice", lang)} v={tk.refPriceMu != null ? `${(tk.refPriceMu / 1000).toFixed(3)}` : "—"} u="µUSDS·k" mono />
          <Stat k={t("engineHeight", lang)} v={fmtNum(tk.height)} mono />
          <Stat k={t("swaps", lang)} v={fmtNum(tk.swaps)} mono />
          <Stat k={t("fills", lang)} v={fmtNum(tk.fills)} mono />
          <Stat k={t("liveOrders", lang)} v={fmtNum(tk.liveOrders)} mono />
          <Stat k={t("lastFed", lang)} v={ago(tk.engineAt, lang)} />
        </div>
      </div>

      <PriceSpark data={data} lang={lang} />

      <div className="rounded-lg border border-[#5eead4]/20 bg-black/25 p-2.5">
        <p className="text-[11px] font-bold text-[#5eead4]">{t("poolsTitle", lang)}</p>
        <table className="mt-1.5 w-full text-[10.5px]">
          <thead>
            <tr className="text-[#8a9a7b]">
              <th className="text-start font-medium">{t("pool", lang)}</th>
              <th className="text-end font-medium">{t("poolReserves", lang)}</th>
              <th className="text-end font-medium">{t("fee", lang)}</th>
              <th className="text-end font-medium">{t("lpYield", lang)}</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {data.pools.map((p) => (
              <tr key={p.key} className="border-t border-[#d8d3c2]/8">
                <td className="py-0.5 text-start text-[#e8e4d8]" dir="ltr">{p.key}</td>
                <td className="text-end text-[#8a9a7b]" dir="ltr">{p.reserves}</td>
                <td className="text-end text-[#d8d3c2]">{p.feeBps}</td>
                <td className="text-end text-[#4ade80]">{p.lpYieldBps != null ? `${(p.lpYieldBps / 100).toFixed(2)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.custody.length > 0 && (
        <div className="rounded-lg border border-[#d8d3c2]/12 bg-black/25 p-2.5">
          <p className="text-[11px] font-bold text-[#d8d3c2]">{t("custodyTitle", lang)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {data.custody.map((c) => (
              <span
                key={c.chain}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9.5px] ${
                  c.ok ? "border-[#22c55e]/35 text-[#4ade80]" : "border-[#ef4444]/35 text-[#f87171]"
                }`}
                dir="ltr"
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.ok ? "bg-[#22c55e]" : "bg-[#ef4444]"}`} />
                {c.chain}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#f0b23c]/25 bg-[#f0b23c]/6 p-2.5">
        <p className="text-[11px] font-bold text-[#f0b23c]">{t("feeLaw", lang)}</p>
        <p className="mt-0.5 text-[10.5px] text-[#b8b2a0]">{tk.feeLaw.live ? t("feeLawOn", lang) : t("feeLawOff", lang)}</p>
        <code className="mt-1 block rounded bg-black/40 px-2 py-1 text-[9.5px] text-[#d8d3c2]" dir="ltr">
          {tk.feeLaw.formula.en}
        </code>
        <table className="mt-1.5 w-full text-[10.5px]">
          <thead>
            <tr className="text-[#8a9a7b]">
              <th className="text-start font-medium">{t("pool", lang)}</th>
              <th className="text-end font-medium">{t("base", lang)}</th>
              <th className="text-end font-medium">{t("fee", lang)}</th>
              <th className="text-end font-medium">σ</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {tk.feeLaw.pools.map((p) => (
              <tr key={p.market} className="border-t border-[#d8d3c2]/8">
                <td className="py-0.5 text-start text-[#e8e4d8]" dir="ltr">{p.market}</td>
                <td className="text-end text-[#8a9a7b]">{p.baseBps}</td>
                <td className={`text-end font-bold ${p.feeBps > p.baseBps ? "text-[#f0b23c]" : "text-[#d8d3c2]"}`}>{p.feeBps}</td>
                <td className="text-end text-[#8a9a7b]">{p.sigmaBps || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-[#22c55e]/25 bg-[#22c55e]/5 p-2.5">
        <p className="text-[11px] font-bold text-[#4ade80]">{t("honestBox", lang)}</p>
        <div className="mt-1.5 space-y-1 text-[11px]">
          <Row k={t("realCustody", lang)} v={tk.honest.realCustodyUsd != null ? `$${tk.honest.realCustodyUsd.toFixed(4)}` : "—"} mono />
          <Row k={t("realizedLoss", lang)} v={tk.honest.realizedLossSbd != null ? `${tk.honest.realizedLossSbd} SBD` : "—"} tone="loss" mono />
          <Row
            k={t("simBook", lang)}
            v={tk.honest.simBookUsds != null ? `${tk.honest.simBookUsds.toLocaleString("en-US")} USDS` : "—"}
            badge={t("notRealMoney", lang)}
            mono
          />
          <Row k={t("externalBid", lang)} v={t("none", lang)} tone="honest" />
          <Row
            k={t("conservation", lang)}
            v={tk.honest.conservationHolds === true ? t("holds", lang) : tk.honest.conservationHolds === false ? t("broken", lang) : "—"}
            tone={tk.honest.conservationHolds === false ? "loss" : "ok"}
            mono
          />
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[#8a9a7b]">{tk.honest.doctrine[lang]}</p>
        <a
          href="/console/index.html#/exchange/swap"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#f0d060] underline-offset-2 hover:underline"
        >
          {t("swapHere", lang)} ↗
        </a>
      </div>

      {data.regime && (
        <div className="rounded-lg border border-[#d8d3c2]/12 bg-black/25 p-2.5">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#d8d3c2]">
            {data.regime.label ?? "—"}
            {data.regime.fearGreed != null && (
              <Badge variant="outline" className="border-[#f0d060]/30 text-[9.5px] text-[#f0d060]">
                F&G {data.regime.fearGreed} · {data.regime.fearGreedLabel}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex gap-3 font-mono text-[10.5px] text-[#8a9a7b]" dir="ltr">
            <span>STEEM ${data.regime.steemUsd?.toFixed(4) ?? "—"}</span>
            <span>BTC ${data.regime.btcUsd?.toLocaleString("en-US") ?? "—"}</span>
            <span>grid {data.regime.gridVerdict ?? "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GatesPanel({ data, lang }: { data: WorldState | null; lang: Lang }) {
  if (!data) return null;
  const g = data.gates;
  return (
    <div className="space-y-3 pb-2">
      <div className={`rounded-lg border p-2.5 ${g.stasis.active ? "border-[#eab308]/30 bg-[#eab308]/6" : "border-[#22c55e]/30 bg-[#22c55e]/6"}`}>
        <p className="flex items-center gap-2 text-[12px] font-bold text-[#e8e4d8]">
          <Shield className="h-4 w-4 text-[#eab308]" />
          {t("stasisTitle", lang)}
          <span className={`ms-auto rounded-full px-2 py-0.5 text-[9.5px] font-bold ${g.stasis.active ? "bg-[#eab308]/15 text-[#eab308]" : "bg-[#22c55e]/15 text-[#4ade80]"}`}>
            {g.stasis.active ? t("stasisArmed", lang) : t("stasisOpen", lang)}
          </span>
        </p>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#b8b2a0]">{g.stasis.summary[lang]}</p>
        <div className="mt-1.5 text-[10.5px]">
          <span className="text-[#8a9a7b]">{t("openLanes", lang)}: </span>
          {g.stasis.lanes.map((l) => (
            <Badge key={l} variant="outline" className="me-1 border-[#d8d3c2]/25 font-mono text-[9.5px] text-[#d8d3c2]">
              {l}
            </Badge>
          ))}
        </div>
        {g.stasis.since && <p className="mt-1 font-mono text-[9.5px] text-[#8a9a7b]">since {g.stasis.since.slice(0, 16).replace("T", " ")} UTC</p>}
      </div>

      <div className="rounded-lg border border-[#f0d060]/25 bg-[#f0d060]/5 p-2.5">
        <p className="flex items-center gap-2 text-[12px] font-bold text-[#f7e9b8]">
          <KeyRound className="h-4 w-4 text-[#f0d060]" />
          {t("ownerTitle", lang)}
        </p>
        {g.owner.openGates.length ? (
          <div className="mt-1.5 space-y-1.5">
            <p className="text-[10.5px] text-[#b8b2a0]">{g.owner.summary[lang]}</p>
            {g.owner.openGates.map((og) => (
              <div key={og.id} className="rounded-md bg-black/35 p-2">
                <p className="font-mono text-[11px] font-bold text-[#f0d060]">{og.id}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {og.opened.map((k) => (
                    <Badge key={k} variant="outline" className="border-[#22c55e]/40 text-[9px] text-[#4ade80]">
                      {k}
                    </Badge>
                  ))}
                </div>
                {og.at && <p className="mt-1 font-mono text-[9px] text-[#8a9a7b]">opened {og.at.slice(0, 16).replace("T", " ")} UTC</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[10.5px] text-[#b8b2a0]">{g.owner.summary[lang]}</p>
        )}
      </div>

      <div className="rounded-lg border border-[#d8d3c2]/12 bg-black/25 p-2.5">
        <p className="text-[11px] font-bold text-[#d8d3c2]">{t("linesTab", lang)} · truth</p>
        <p className="mt-1 font-mono text-[10.5px] text-[#8a9a7b]" dir="ltr">
          {data.truth.verdict} · gates {data.truth.pass}/{data.truth.pass + data.truth.fail + data.truth.skip} · A{data.truth.assertions.passed}/{data.truth.assertions.total} {data.truth.assertions.verdict}
        </p>
        <p className="mt-0.5 font-mono text-[9.5px] text-[#8a9a7b]" dir="ltr">
          measured {ago(data.truth.at, lang)}
        </p>
      </div>
    </div>
  );
}

function LinesPanel({ data, lang, fmtNum }: { data: WorldState | null; lang: Lang; fmtNum: (v: number | null | undefined) => string }) {
  if (!data) return null;
  return (
    <div className="space-y-1.5 pb-2">
      <p className="text-[11px] font-bold text-[#d8d3c2]">{t("linesTitle", lang)}</p>
      {data.lines.map((l) => (
        <div key={l.line} className="flex items-center gap-2 rounded-lg border border-[#d8d3c2]/10 bg-black/25 px-2.5 py-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${l.ok ? "bg-[#22c55e]" : "bg-[#ef4444]"}`} style={{ boxShadow: l.ok ? "0 0 8px #22c55e88" : "0 0 8px #ef444488" }} />
          <span className="font-mono text-[11.5px] font-bold text-[#e8e4d8]" dir="ltr">{l.line}</span>
          <span className="truncate text-[10px] text-[#8a9a7b]" dir="ltr">{l.role}</span>
          <span className="ms-auto shrink-0 font-mono text-[10px] text-[#8a9a7b]" dir="ltr">
            {l.headBlock != null ? `#${fmtNum(l.headBlock)} · ` : ""}
            {l.latencyMs != null ? `${l.latencyMs}ms` : "—"}
          </span>
        </div>
      ))}
      {data.custody.length > 0 && (
        <div className="mt-2 rounded-lg border border-[#d8d3c2]/10 bg-black/25 p-2.5">
          <p className="text-[10.5px] font-bold text-[#d8d3c2]">{t("custodyTitle", lang)}</p>
          <div className="mt-1 space-y-1">
            {data.custody.map((c) => (
              <div key={c.chain} className="flex items-center gap-2 text-[10px]">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.ok ? "bg-[#22c55e]" : "bg-[#ef4444]"}`} />
                <span className="font-mono text-[#e8e4d8]" dir="ltr">{c.chain}</span>
                <span className="ms-auto font-mono text-[#8a9a7b]" dir="ltr">{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.census.skills != null && (
        <div className="mt-2 rounded-lg border border-[#d8d3c2]/10 bg-black/25 p-2.5">
          <p className="text-[10.5px] font-bold text-[#d8d3c2]">
            {lang === "he" ? "הספרייה" : "Library"}: {data.census.skills} {lang === "he" ? "כישורים" : "skills"} · {data.learningEntries ?? "—"} {lang === "he" ? "רשומות-למידה" : "learning entries"}
          </p>
          <p className="mt-0.5 text-[9.5px] text-[#8a9a7b]">
            {lang === "he" ? "מה שנמדד נשמר — פנקס-הלמידה גדל עם כל מדידה" : "What is measured is kept — the learning ledger grows with every measurement"}
          </p>
        </div>
      )}
    </div>
  );
}

function RosterPanel({
  data, lang, query, setQuery, onPick,
}: {
  data: WorldState | null;
  lang: Lang;
  query: string;
  setQuery: (q: string) => void;
  onPick: (id: string, district: string) => void;
}) {
  if (!data) return null;
  const q = query.trim().toLowerCase();
  const list = data.citizens.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.role[lang].toLowerCase().includes(q) || c.district.includes(q),
  );
  return (
    <div className="pb-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-[#d8d3c2]">{t("citizensOf", lang)}</p>
        <span className="font-mono text-[10px] text-[#8a9a7b]">{list.length}/{data.citizens.length}</span>
      </div>
      <div className="relative mt-1.5">
        <Search className="absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8a9a7b]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchCitizen", lang)}
          className="w-full rounded-lg border border-[#d8d3c2]/15 bg-black/35 py-1.5 pe-2 ps-7 text-[11.5px] text-[#e8e4d8] placeholder:text-[#8a9a7b]/60 focus:border-[#f0d060]/40 focus:outline-none"
        />
      </div>
      <div className="mt-2 space-y-1">
        {list.map((c) => {
          const d = data.districts.find((x) => x.id === c.district);
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id, c.district)}
              title={c.lastAt ? `${t("lastFed", lang)} ${ago(c.lastAt, lang)}` : undefined}
              className="flex w-full items-center gap-2 rounded-lg border border-[#d8d3c2]/8 bg-black/25 px-2.5 py-1.5 text-start transition-colors hover:border-[#f0d060]/35"
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: c.tier === "A" ? "#f0d060" : c.tier === "B" ? "#5eead4" : "#d8d3c2" }}
              />
              <span className="shrink-0 font-mono text-[11px] font-bold text-[#e8e4d8]" dir="ltr">{c.name}</span>
              <span className="truncate text-[9.5px] text-[#8a9a7b]">{d?.name[lang] ?? c.district}</span>
              {c.busy ? (
                <span className="ms-auto shrink-0 rounded bg-[#22c55e]/12 px-1.5 py-0.5 text-[8.5px] font-bold text-[#4ade80]">{t("working", lang)}</span>
              ) : c.status !== "LIVE" ? (
                <span className="ms-auto shrink-0 rounded bg-[#eab308]/12 px-1.5 py-0.5 text-[8.5px] font-bold text-[#eab308]" dir="ltr">{c.status}</span>
              ) : (
                <span className="ms-auto shrink-0 text-[8.5px] font-bold text-[#8a9a7b]">{t("idle", lang)}</span>
              )}
            </button>
          );
        })}
        {list.length === 0 && <p className="py-4 text-center text-[11px] text-[#8a9a7b]">—</p>}
      </div>
    </div>
  );
}

function TimelinePanel({ data, lang }: { data: WorldState | null; lang: Lang }) {
  if (!data) return null;
  const runs = data.truthHistory;
  const green = runs.filter((r) => r.verdict === "ALL-GREEN").length;
  const uptime = runs.length ? Math.round((green / runs.length) * 100) : null;
  const ind = data.indicators;
  return (
    <div className="space-y-3 pb-2">
      <div className="rounded-lg border border-[#d8d3c2]/12 bg-black/25 p-2.5">
        <p className="text-[11px] font-bold text-[#d8d3c2]">{t("truthChronicle", lang)}</p>
        <p className="mt-0.5 text-[9.5px] text-[#8a9a7b]">{t("truthChronicleHint", lang)}</p>
        {uptime != null && (
          <p className="mt-1 font-mono text-[10.5px]" dir="ltr">
            <span className="text-[#4ade80]">{t("uptime", lang)} {uptime}%</span>
            <span className="text-[#8a9a7b]"> · {runs.length} {t("runs", lang)}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-[3px]" dir="ltr">
          {runs.map((r, i) => {
            const col = r.verdict === "ALL-GREEN" ? "#22c55e" : r.fail > 0 ? "#ef4444" : "#eab308";
            return (
              <span
                key={`${r.at}-${i}`}
                title={`${r.at.slice(0, 16).replace("T", " ")} · ${r.verdict} · ${r.pass}pass ${r.fail}fail ${r.skip}skip`}
                className="inline-block h-3 w-[7px] rounded-[1px]"
                style={{ background: col, opacity: 0.35 + 0.65 * (i / Math.max(1, runs.length - 1)) }}
              />
            );
          })}
          {runs.length === 0 && <span className="text-[10px] text-[#8a9a7b]">—</span>}
        </div>
      </div>

      {ind.verdict && (
        <div className="rounded-lg border border-[#e8a0bf]/25 bg-[#e8a0bf]/5 p-2.5">
          <p className="text-[11px] font-bold text-[#e8a0bf]">{t("indicatorsTitle", lang)}</p>
          <div className="mt-1.5 flex gap-2 font-mono text-[10.5px]">
            <span className="text-[#4ade80]">▲ {ind.grow ?? 0} {t("grow", lang)}</span>
            <span className="text-[#f87171]">▼ {ind.decline ?? 0} {t("decline", lang)}</span>
            <span className="text-[#d8d3c2]">■ {ind.held ?? 0} {t("held", lang)}</span>
          </div>
          <p className="mt-1 font-mono text-[9px] text-[#8a9a7b]" dir="ltr">{ind.verdict} · {ago(ind.at, lang)}</p>
        </div>
      )}

      <div className="rounded-lg border border-[#5eead4]/20 bg-black/25 p-2.5">
        <p className="text-[11px] font-bold text-[#5eead4]">{t("coordLog", lang)}</p>
        <ul className="mt-1.5 space-y-1">
          {data.coord.slice(0, 8).map((m) => (
            <li key={m.id} className="flex items-center gap-2 font-mono text-[9.5px] text-[#8a9a7b]" dir="ltr">
              <span className="shrink-0 text-[#5eead4]">#{m.seq}</span>
              <span className="truncate text-[#d8d3c2]">{m.proto}</span>
              <span className="ms-auto shrink-0">{m.action}</span>
            </li>
          ))}
          {data.coord.length === 0 && <li className="text-[10px] text-[#8a9a7b]">—</li>}
        </ul>
      </div>
    </div>
  );
}

function Stat({ k, v, u, mono }: { k: string; v: string; u?: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-black/30 px-2.5 py-1.5">
      <p className="text-[9.5px] text-[#8a9a7b]">{k}</p>
      <p className={`text-[13px] font-bold text-[#f7e9b8] ${mono ? "font-mono" : ""}`} dir="ltr">
        {v} {u && <span className="text-[9px] font-normal text-[#8a9a7b]">{u}</span>}
      </p>
    </div>
  );
}

function Row({
  k, v, tone, badge, mono,
}: {
  k: string;
  v: string;
  tone?: "ok" | "loss" | "honest";
  badge?: string;
  mono?: boolean;
}) {
  const toneCls = tone === "loss" ? "text-[#f87171]" : tone === "ok" ? "text-[#4ade80]" : tone === "honest" ? "text-[#f0d060]" : "text-[#e8e4d8]";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10.5px] text-[#8a9a7b]">{k}</span>
      <span className={`flex items-center gap-1.5 text-[11px] font-bold ${toneCls} ${mono ? "font-mono" : ""}`} dir="ltr">
        {v}
        {badge && <span className="rounded bg-[#ef4444]/15 px-1.5 py-0.5 text-[8.5px] font-bold text-[#f87171]">{badge}</span>}
      </span>
    </div>
  );
}

function DistrictBody({ d, lang }: { d: District; lang: Lang }) {
  return (
    <div>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-[#f7e9b8]">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: HEALTH_DOT[d.health], boxShadow: `0 0 10px ${HEALTH_DOT[d.health]}` }} />
          {d.name[lang]}
          <span className="ms-auto font-mono text-[10px] font-normal" style={{ color: HEALTH_DOT[d.health] }}>
            {healthWord(d.health, lang)}
          </span>
        </DialogTitle>
      </DialogHeader>
      <p className="mt-2 text-[12px] leading-relaxed text-[#b8b2a0]">{d.role[lang]}</p>
      {d.intensity != null && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[9.5px] text-[#8a9a7b]">
            <span>{t("activity", lang)}</span>
            <span className="font-mono">{Math.round(d.intensity * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f0b23c] to-[#f0d060] transition-all"
              style={{ width: `${Math.round(d.intensity * 100)}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {d.metrics.map((m) => (
          <div key={m.k.en} className="rounded-lg bg-black/35 px-2.5 py-1.5">
            <p className="text-[9.5px] text-[#8a9a7b]">{m.k[lang]}</p>
            <p className="font-mono text-[12.5px] font-bold text-[#f7e9b8]" dir="ltr">
              {m.v}
            </p>
          </div>
        ))}
      </div>
      {d.note && <p className="mt-2 rounded-lg bg-[#f0d060]/8 px-2.5 py-1.5 text-[10.5px] text-[#f0d060]">{d.note[lang]}</p>}
      <p className="mt-2 text-[10px] text-[#8a9a7b]">
        {t("lastFed", lang)}: <span className="font-mono">{ago(d.publishedAt, lang)}</span>
        {d.ageHours != null && <> · {d.ageHours.toFixed(1)}h</>}
      </p>
      <p className="mt-1 font-mono text-[9.5px] text-[#8a9a7b]" dir="ltr">
        {t("books", lang)}: {d.books.join(" · ")}
      </p>
    </div>
  );
}

function CitizenBody({ c, lang }: { c: Citizen; lang: Lang }) {
  return (
    <div>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-mono text-[#f7e9b8]" dir="ltr">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.tier === "A" ? "#f0d060" : c.tier === "B" ? "#5eead4" : "#d8d3c2" }} />
          {c.name}
        </DialogTitle>
      </DialogHeader>
      <p className="mt-2 text-[12px] leading-relaxed text-[#b8b2a0]">{c.role[lang]}</p>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="rounded-lg bg-black/35 px-2.5 py-1.5">
          <p className="text-[9.5px] text-[#8a9a7b]">{t("district", lang)}</p>
          <p className="font-bold text-[#e8e4d8]">{c.district}</p>
        </div>
        <div className="rounded-lg bg-black/35 px-2.5 py-1.5">
          <p className="text-[9.5px] text-[#8a9a7b]">{t("status", lang)}</p>
          <p className={`font-bold ${c.status === "LIVE" ? "text-[#4ade80]" : "text-[#eab308]"}`} dir="ltr">{c.status}</p>
        </div>
        <div className="rounded-lg bg-black/35 px-2.5 py-1.5">
          <p className="text-[9.5px] text-[#8a9a7b]">{t("tier", lang)}</p>
          <p className="font-mono font-bold text-[#f0d060]" dir="ltr">{c.tier}</p>
        </div>
        <div className="rounded-lg bg-black/35 px-2.5 py-1.5">
          <p className="text-[9.5px] text-[#8a9a7b]">{t("keyMode", lang)}</p>
          <p className="truncate font-mono font-bold text-[#e8e4d8]" dir="ltr">{c.keyMode}</p>
        </div>
      </div>
      <p className="mt-2 rounded-lg bg-black/30 px-2.5 py-1.5 text-[10.5px] text-[#8a9a7b]">
        {t("lane", lang)}: <span className="font-mono" dir="ltr">{c.lane}</span>
      </p>
      <p className="mt-1.5 text-[10px] text-[#8a9a7b]">
        {t("lastFed", lang)}: <span className="font-mono">{ago(c.lastAt, lang)}</span>
      </p>
      <p className="mt-1.5 rounded-lg bg-[#22c55e]/8 px-2.5 py-1.5 text-[10.5px]">
        <span className={c.busy ? "text-[#4ade80]" : "text-[#8a9a7b]"}>
          {t("activity", lang)}: {c.busy ? t("working", lang) : t("idle", lang)}
        </span>
        <span className="ms-1 text-[9px] text-[#8a9a7b]">
          — {lang === "he" ? "נמדד מבריאות-הספר של הרובע" : "measured from the district's book health"}
        </span>
      </p>
    </div>
  );
}
