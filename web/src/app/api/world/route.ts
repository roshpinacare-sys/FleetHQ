import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import type {
  Bi,
  ChainLine,
  Citizen,
  CoordMsg,
  District,
  EngineFill,
  Health,
  Indicators,
  PoolRow,
  TapeEvent,
  TruthRun,
  WorldState,
} from "@/lib/fleet-world/types";

// ─── honesty helpers ──────────────────────────────────────────────────────────

const ROOT = process.cwd();

function bookPath(...seg: string[]): string {
  return path.join(ROOT, ...seg);
}

async function readJson<T = Record<string, unknown>>(...seg: string[]): Promise<T | null> {
  try {
    const raw = await readFile(bookPath(...seg), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function ageHours(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

/** The beacon law: green = fed recently, amber = fed but aging, red = old or dead. */
function lampFrom(iso: string | null, freshH = 6, warmH = 30): Health {
  const h = ageHours(iso);
  if (h === null) return "down";
  if (h <= freshH) return "alive";
  if (h <= warmH) return "waiting";
  return "stale";
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Short human form for big reserve numbers: 15033253 -> "15.0M". */
function shortNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

// ─── book reads ───────────────────────────────────────────────────────────────

interface TruthBook {
  at?: string;
  verdict?: string;
  counts?: { pass?: number; fail?: number; skip?: number };
  results?: { gate?: string; status?: string; measured?: string; at?: string }[];
}
interface VerifyBook {
  generatedAt?: string;
  summary?: { total?: number; passed?: number; failed?: number; verdict?: string };
}
interface VitalsBook {
  generatedAt?: string;
  verdict?: string;
  summary?: { lines?: number; up?: number; down?: number; worstLatencyMs?: number };
  lines?: {
    line?: string;
    role?: string;
    ok?: boolean;
    latencyMs?: number;
    detail?: { headBlock?: number };
  }[];
}
interface DexStateBook {
  publishedAt?: string;
  beat?: { runAt?: string; ticks?: number; cadenceMin?: number };
  state?: {
    height?: number;
    tps?: number;
    opsTotal?: number;
    fills?: number;
    swaps?: number;
    liveOrders?: number;
    halted?: boolean;
    haltReason?: string | null;
    ladder?: { refPrice?: number; lifts?: number };
    assets?: Record<string, { refPrice?: number; listed?: number }>;
    backing?: Record<string, number>;
  };
  tape?: {
    kind?: string;
    base?: string;
    quote?: string;
    price?: number;
    amountMu?: number;
    taker?: string;
    maker?: string;
    at?: number;
    h?: number;
  }[];
  pools?: {
    key?: string;
    ra?: number;
    rb?: number;
    mid?: number;
    swaps?: number;
    feeBps?: number;
    lpYieldBps?: number;
    feeAccruedTreasury?: number;
  }[];
}
interface FeeLawBook {
  publishedAt?: string;
  verdict?: string;
  law?: { formula?: string; formulaHe?: string };
  pools?: { key?: string; baseBps?: number; feeBps?: number; sigmaBps?: number }[];
  inputs?: { fresh?: boolean; ageHours?: number };
}
interface HonestEconBook {
  publishedAt?: string;
  saosExternalBid?: { exists?: boolean; internalPriceUsdsMu?: number; noteHe?: string; noteEn?: string };
  realChain?: { markedUsd?: number; unmarkedCount?: number };
  realPnl?: { realizedSbd?: number; realizedUsd?: number; verdict?: string };
  simBook?: { totalUsds?: number; totalUsdsMu?: number; label?: string };
  conservation?: { holds?: boolean };
  doctrine?: { he?: string; en?: string };
}
interface MoneyBook {
  publishedAt?: string;
  redemption?: { verdict?: string; action?: string };
  invariant?: { holds?: boolean; sumMu?: number; backingMu?: number };
  fuel?: { ok?: boolean };
}
interface StasisBook {
  active?: boolean;
  mode?: string;
  since?: string;
  stagedLanes?: { allow?: string[] };
  reason?: string;
}
interface RegistryBook {
  at?: string;
  identity?: { agentId?: string; metadata?: { role?: string; keyMode?: string; alive?: boolean } }[];
}
interface CensusBook {
  at?: string;
  inventory?: {
    lanes?: {
      id?: string;
      role?: string;
      status?: string;
      capabilities?: string[];
      extras?: { workflows?: number; desks?: number };
    }[];
  };
  summary?: Record<string, unknown>;
}
interface MomentBook {
  publishedAt?: string;
  market?: { steemUsd?: number; btcUsd?: number; fearGreed?: { value?: number; label?: string } };
  regime?: { label?: string };
  grid?: { verdict?: string };
}
interface PulseBook {
  at?: string;
  proposals?: { id?: string; kind?: string; disposition?: string; receipt?: string }[];
}
interface SkillLibBook {
  skills?: unknown[];
  count?: number;
}
interface TruthHistoryBook {
  runs?: { at?: string; verdict?: string; pass?: number; fail?: number; skip?: number }[];
}
interface CoordBusBook {
  at?: string;
  verdict?: string;
  messageCount?: number;
  messages?: {
    seq?: number;
    at?: string;
    id?: string;
    payload?: { action?: string; protocol?: string };
  }[];
}
interface IndicatorsBook {
  at?: string;
  verdict?: string;
  counts?: { GROW?: number; DECLINE?: number; HELD?: number };
}
interface WatchBook {
  publishedAt?: string;
  chains?: Record<string, string>;
}
interface GridBook {
  at?: string;
  markets?: unknown[];
}
interface LearningBook {
  // keys are entry ids
  [k: string]: unknown;
}

// ─── CSV (role registry) ──────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

interface RoleRow {
  act: string;
  ci: string;
  mission: string;
  tier: string;
  status: string;
}

const HE_ROLE: Record<string, string> = {
  "econ-desk": "שולחן-השוק: פעולות דו-צדדיות עם אימות-לפני-חתימה",
  "treasury-desk": "שולחן-האוצר והאצילות: תביעות ואישורי-פרסום",
  "blurt-curate": "האוצר-הראשי של blurt: מתמטיקת מנבר קודם-כל, הצבעות מאומתות",
  "soldiers-curate": "מסילת-החיילים: הצבעות עם חוק-ניסיונות ודה-דופליקציה מהשרשרת",
  "head-delegate": "שולחן-ההאצלות: האצלות-חלקיות עם קריאה-חזרה מהשרשרת בלבד",
  "daily-claim": "מכונת-התביעות: תביעות פרס יומיות עם קריאה-חזרה מאומתת",
  "fleet-claim": "מטאטא-התביעות של הצי: תביעות חיילים, אפס תביעה-כפולה",
  "anchor-execute": "מבצע-האנקורים: הרצת אנקורים עם מטענים מאומתים",
  "content-campaign": "שולחן-המסעות: גלי-תוכן מתוזמנים עם פרסום מאומת",
  "market-exec": "מבצע-החתימות: השוק הפנימי SBD/STEEM, אימות-ואז-חתימה",
  "fill-ledger": "רגל-המדידה: מדידת מילויים, רווח-והפסד בעלות-ממוצעת",
  "market-cycle": "מלחין-המחזור: עיניים → החלטה → ידיים",
  "market-grid": "מתבונן-השווקים חסר-המפתח: מילויי-נייר, סדרות-היסטוריה",
  "venture-desk": "ממשל-המיזמים: קציר או מוות לפי חוקי-המדידה",
  "arb-mesh": "רשת-הארביטרז': מסילת-מדידה חסרת-מפתח על הספרים הרשמיים",
  "dex-core": "ליבת-הבורסה: AMM ברצפה-שלמה, סורג-יוצר, פנקס",
  "dex-router": "נתב-הבורסה: מסלולי-החלפה על הספר הרשמי",
  "money-watch": "זקיף-דרך-הכסף: דלק-פנימה ופדיון-החוצה, שימור-מלא",
  "truth-fix": "מתקן-האמת: תיקוני-שקר עם תלושים",
  "fleet-census": "המפקד: ספירת-כל-המסילות, היכולות והשולחנות",
  "fleet-delta": "מודד-הדלתא: מה באמת זז באחוזה מאז הפעימה הקודמת",
  "capital-gate": "שער-ההון: כל סוכן חותם עובר דרכו — הסטאזיס נאכף בתוכו",
  "coord-bus": "אוטובוס-התיאום: חוזים בין-שולחניים עם מנעולי-גישה",
  "key-verify": "מאמת-המפתחות: בדיקת-חיות מפתחות עם תלושים",
  "claims-audit": "מבקר-התביעות: אפס תביעות-שקר על הפנקסים",
  "sovereign-trade": "הסוחר-הריבוני: מסילת-המסחר תחת שערי-הבעלים",
  "tick-keeper": "שומר-התקתוק: פעימת-הלב של הלוחות המתוזמנים",
  "public-pulse": "דופק-הציבור: מה רואה העולם החוץ",
  "measure-learn": "המודד-הלומד: כל מדידה נכנסת לפנקס-הלמידה",
  "community-founder": "מייסד-הקהילה: גידול-הסביבה האנושית של האחוזה",
};

/** Book-desks: citizens measured by the EXISTENCE of their official book (fail-soft). */
const BOOK_DESKS: [string, string][] = [
  ["dex-core", "Domain/agents/dex-core.json"],
  ["dex-router", "Domain/agents/dex-router.json"],
  ["arb-mesh", "Domain/agents/arb-mesh.json"],
  ["coord-bus", "Domain/agents/coord-bus.json"],
  ["command-guard", "Domain/agents/command-guard.json"],
  ["fleet-census", "Domain/agents/fleet-census.json"],
  ["sovereign-trade", "Domain/agents/sovereign-trade.json"],
  ["community-founder", "Domain/agents/community-founder.json"],
  ["capability-matrix", "Domain/agents/capability-matrix.json"],
  ["moment-watch", "Domain/agents/fleet-indicators.json"],
  ["claims-audit", "Domain/agents/claims-audit.json"],
  ["tick-keeper", "Domain/agents/tick-keeper.json"],
  ["bridge-desk", "Domain/agents/bridge-book.json"],
  ["public-wave", "Domain/agents/public-wave.json"],
];

function districtFor(act: string): string {
  if (
    ["market-exec", "market-grid", "fill-ledger", "market-cycle", "econ-desk", "arb-mesh", "dex-core", "dex-router", "counter-grid", "mm-volume"].includes(act)
  )
    return "exchange";
  if (["treasury-desk", "money-watch", "venture-desk", "sovereign-trade"].includes(act)) return "mint";
  if (["truth-fix", "claims-audit", "twin-audit", "harness-audit", "deep-audit"].includes(act)) return "truth";
  if (["fleet-census", "fleet-delta", "agent-registry", "capability-matrix"].includes(act)) return "census";
  if (["anchor-execute", "bridge-desk", "tribridge", "key-verify"].includes(act)) return "anchors";
  if (["capital-gate", "command-guard", "sovereign-tick", "owner-proof", "coord-bus", "tick-keeper", "head-delegate"].includes(act))
    return "stasis";
  if (["skill-library-gate", "measure-learn", "recruit", "selfmodel", "cadence-week"].includes(act)) return "library";
  return "herald";
}

// ─── tape building (real events only) ─────────────────────────────────────────

function pickAt(obj: Record<string, unknown>): string | null {
  for (const k of ["at", "publishedAt", "generatedAt", "timestamp", "when", "measuredAt", "runAt", "date"]) {
    const v = str(obj[k]);
    if (v && Number.isFinite(Date.parse(v))) return v;
  }
  return null;
}

function titleize(name: string): string {
  return name
    .replace(/\.json$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function receiptTape(): Promise<TapeEvent[]> {
  const events: TapeEvent[] = [];
  const dirs: [string, string][] = [
    ["Domain/agents/receipts", "Domain"],
    ["Console/receipts", "Console"],
  ];
  for (const [dir, home] of dirs) {
    try {
      const files = (await readdir(bookPath(dir))).filter((f) => f.endsWith(".json"));
      const withTime = await Promise.all(
        files.map(async (f) => {
          try {
            const st = await stat(bookPath(dir, f));
            return { f, mtime: st.mtimeMs };
          } catch {
            return null;
          }
        }),
      );
      withTime.sort((a, b) => (b?.mtime ?? 0) - (a?.mtime ?? 0));
      for (const item of withTime.slice(0, 8)) {
        if (!item) continue;
        const j = await readJson<Record<string, unknown>>(dir, item.f);
        if (!j) continue;
        const at = pickAt(j) ?? new Date(item.mtime).toISOString();
        const verdict = str(j.verdict) ?? str(j.ok) ?? "";
        const textHe = `תלוש נחתם: ${titleize(item.f)}${verdict && verdict !== "" ? ` · ${verdict}` : ""}`;
        const textEn = `Receipt sealed: ${titleize(item.f)}${verdict && verdict !== "" ? ` · ${verdict}` : ""}`;
        events.push({
          id: `${home}:${item.f}`,
          at,
          source: home,
          kind: "receipt",
          text: { he: textHe, en: textEn },
          weight: 2,
        });
      }
    } catch {
      /* honest absence — the tape simply carries fewer receipts */
    }
  }
  return events;
}

// ─── main aggregation ─────────────────────────────────────────────────────────

let cache: { at: number; data: WorldState } | null = null;
const TTL_MS = 30_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.data);
  }
  const data = await buildWorld();
  cache = { at: Date.now(), data };
  return NextResponse.json(data);
}

async function buildWorld(): Promise<WorldState> {
  const [
    truth,
    verify,
    vitals,
    dexState,
    feeLaw,
    honestEcon,
    money,
    stasis,
    registry,
    census,
    moment,
    pulse,
    skillLib,
    cr75,
    truthHistory,
    coordBus,
    indicators,
    watch,
    grid,
    learning,
  ] = await Promise.all([
    readJson<TruthBook>("Console/truth/latest.json"),
    readJson<VerifyBook>("Domain/agent/verify/results.json"),
    readJson<VitalsBook>("Console/weave/vitals.json"),
    readJson<DexStateBook>("Console/dex/state.json"),
    readJson<FeeLawBook>("Console/dex/fee-law.json"),
    readJson<HonestEconBook>("Console/dex/honest-econ.json"),
    readJson<MoneyBook>("Domain/dex/money.json"),
    readJson<StasisBook>("Domain/agents/STASIS.json"),
    readJson<RegistryBook>("Domain/agents/agent-registry.json"),
    readJson<CensusBook>("Domain/agents/fleet-census.json"),
    readJson<MomentBook>("Domain/moment/moment.json"),
    readJson<PulseBook>("Domain/agents/pulse-book.json"),
    readJson<SkillLibBook>("Domain/agents/skill-library.json"),
    readJson<{ opens?: string[]; at?: string; directive?: string }>(
      "Domain/agents/change-requests/CR-0075-owner-approval.json",
    ),
    readJson<TruthHistoryBook>("Console/truth/history.json"),
    readJson<CoordBusBook>("Domain/agents/coord-bus.json"),
    readJson<IndicatorsBook>("Domain/agents/fleet-indicators.json"),
    readJson<WatchBook>("Console/dex/watch.json"),
    readJson<GridBook>("Domain/agents/market-grid.json"),
    readJson<LearningBook>("Domain/agents/learning-ledger.json"),
  ]);

  // ── roles
  let roles: RoleRow[] = [];
  try {
    const raw = await readFile(bookPath("Domain/agents/role-registry.csv"), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    for (const line of lines.slice(1)) {
      const c = parseCsvLine(line);
      if (c.length >= 8 && c[0]) {
        roles.push({ act: c[0].trim(), ci: c[2]?.trim() ?? "", mission: c[3]?.trim() ?? "", tier: c[5]?.trim() ?? "C", status: c[8]?.trim() ?? "" });
      }
    }
  } catch {
    roles = [];
  }

  const preferred = [
    "dex-core", "market-grid", "market-exec", "fill-ledger", "market-cycle", "econ-desk", "arb-mesh",
    "dex-router", "money-watch", "treasury-desk", "capital-gate", "truth-fix", "fleet-census",
    "fleet-delta", "key-verify", "anchor-execute", "claims-audit", "coord-bus", "tick-keeper",
    "sovereign-trade", "measure-learn", "public-pulse", "blurt-curate", "content-campaign",
    "daily-claim", "fleet-claim", "soldiers-curate", "head-delegate", "venture-desk", "community-founder",
  ];
  const seen = new Set<string>();
  const citizens: Citizen[] = [];
  const pushCitizen = (id: string, mission: string, tier: string, lane: string, status: string, lastAt: string | null = null) => {
    if (seen.has(id) || citizens.length >= 28) return;
    seen.add(id);
    citizens.push({
      id,
      name: id,
      role: { he: HE_ROLE[id] ?? "סוכן הצי", en: mission.length > 110 ? mission.slice(0, 107) + "…" : mission || id },
      tier: (tier === "A" || tier === "B" || tier === "C" ? tier : "C") as Citizen["tier"],
      keyMode: lane ? lane.replace(/\.yml$/, "") : "keyless",
      lane: lane || "-",
      district: districtFor(id),
      status: status || "LIVE",
      lastAt,
      busy: false, // computed below from the district beacon
    });
  };
  // book-desks first: a desk is a citizen when its official book exists (measured, fail-soft)
  for (const [id, book] of BOOK_DESKS) {
    if (citizens.length >= 28) break;
    try {
      const st = await stat(bookPath(book));
      const j = await readJson<{ at?: string; publishedAt?: string; asOf?: string }>(book);
      pushCitizen(id, HE_ROLE[id] ? "" : id, "B", "book-lane", "LIVE", j?.at ?? j?.publishedAt ?? j?.asOf ?? new Date(st.mtimeMs).toISOString());
    } catch {
      /* honest absence — no book, no citizen */
    }
  }
  for (const act of preferred) {
    const row = roles.find((r) => r.act === act);
    if (row) pushCitizen(row.act, row.mission, row.tier, row.ci, row.status);
  }
  // the signing/market desks live in the ERC-8004-shaped identity registry, not the CSV
  for (const id of registry?.identity ?? []) {
    if (!id.agentId || citizens.length >= 28) break;
    pushCitizen(id.agentId, id.metadata?.role ?? id.agentId, "A", id.metadata?.keyMode ?? "keyless", id.metadata?.alive ? "LIVE" : "OFF");
  }
  for (const row of roles) {
    if (citizens.length >= 28) break;
    if (row.status === "LIVE") pushCitizen(row.act, row.mission, row.tier, row.ci, row.status);
  }

  // ── engine tape (real fills from the engine's own book)
  const engineTape: EngineFill[] = (dexState?.tape ?? [])
    .filter((t) => t.kind === "fill" && typeof t.at === "number" && typeof t.price === "number")
    .slice(-14)
    .reverse()
    .map((t, i) => ({
      id: `fill-${t.at}-${t.taker ?? "?"}-${t.maker ?? "?"}-${t.h ?? i}`,
      at: t.at as number,
      price: t.price as number,
      amountMu: t.amountMu ?? 0,
      taker: t.taker ?? "?",
      maker: t.maker ?? "?",
      h: t.h ?? 0,
    }));

  // ── pools (real engine pools)
  const pools: PoolRow[] = (dexState?.pools ?? []).slice(0, 6).map((p) => ({
    key: p.key ?? "?",
    mid: num(p.mid),
    swaps: p.swaps ?? 0,
    feeBps: p.feeBps ?? 0,
    lpYieldBps: num(p.lpYieldBps),
    reserves: `${shortNum(p.ra ?? 0)} · ${shortNum(p.rb ?? 0)}`,
  }));

  // ── truth history (real runs)
  const truthHistoryRuns: TruthRun[] = (truthHistory?.runs ?? [])
    .filter((r) => r.at && r.verdict)
    .slice(-64)
    .map((r) => ({
      at: r.at as string,
      verdict: r.verdict as string,
      pass: r.pass ?? 0,
      fail: r.fail ?? 0,
      skip: r.skip ?? 0,
    }));

  // ── coordination bus (real on-chain messages, keyless)
  const coord: CoordMsg[] = (coordBus?.messages ?? [])
    .slice(-12)
    .reverse()
    .map((m) => ({
      id: `coord-${m.seq ?? 0}`,
      seq: m.seq ?? 0,
      at: m.at ? (m.at.endsWith("Z") ? m.at : m.at + "Z") : (coordBus?.at ?? new Date().toISOString()),
      proto: m.id ?? "saos.*",
      action: m.payload?.action ?? m.id?.split(".").slice(-2, -1)[0] ?? "message",
    }));

  // ── indicators (the measured mood)
  const indicatorsState: Indicators = {
    verdict: indicators?.verdict ?? null,
    grow: num(indicators?.counts?.GROW),
    decline: num(indicators?.counts?.DECLINE),
    held: num(indicators?.counts?.HELD),
    at: indicators?.at ?? null,
  };

  // ── custody chains (multi-chain watch)
  const custody = Object.entries(watch?.chains ?? {})
    .slice(0, 8)
    .map(([chain, status]) => ({
      chain,
      status,
      ok: status.toLowerCase().startsWith("ok"),
    }));

  // ── learning entries
  const learningEntries = learning ? Object.keys(learning).filter((k) => !k.startsWith("_")).length : null;

  // ── districts
  const dexS = dexState?.state ?? {};
  const dexAt = dexState?.publishedAt ?? dexState?.beat?.runAt ?? null;
  const saosRef = dexS.assets?.SAOS?.refPrice ?? dexS.ladder?.refPrice ?? null;

  const truthPass = truth?.counts?.pass ?? null;
  const truthFail = truth?.counts?.fail ?? null;
  const vitalsUp = vitals?.summary?.up ?? null;
  const vitalsAll = vitals?.summary?.lines ?? null;

  const censusLanes = census?.inventory?.lanes?.length ?? null;
  const censusCaps = (census?.inventory?.lanes ?? []).reduce((a, l) => a + (l.capabilities?.length ?? 0), 0) || null;
  const censusDesks = (census?.inventory?.lanes ?? []).reduce((a, l) => a + (l.extras?.desks ?? 0), 0) || null;
  const censusWf = (census?.inventory?.lanes ?? []).reduce((a, l) => a + (l.extras?.workflows ?? 0), 0) || null;

  const feePools = (feeLaw?.pools ?? [])
    .map((f) => ({
      market: f.key ?? "SAOS/USDS",
      baseBps: f.baseBps ?? 0,
      feeBps: f.feeBps ?? 0,
      sigmaBps: f.sigmaBps ?? 0,
    }))
    .slice(0, 4);
  const feeLawLive = (feeLaw?.verdict ?? "").startsWith("LIVE");

  const conservationHolds = honestEcon?.conservation?.holds ?? money?.invariant?.holds ?? null;
  const poolFeeSum = (dexState?.pools ?? []).reduce((a, p) => a + (p.feeAccruedTreasury ?? 0), 0);
  const stasisLanes = stasis?.stagedLanes?.allow ?? [];
  const pulseCount = pulse?.proposals?.length ?? null;
  const skillsCount = skillLib?.skills?.length ?? skillLib?.count ?? null;

  const districts: District[] = [
    {
      id: "exchange",
      glyph: "exchange",
      name: { he: "רובע-הבורסה", en: "The Exchange" },
      role: { he: "ליבת SAOS/USDS: AMM שלם-מספרי, סורג-יוצר, פנקס מילויים", en: "SAOS/USDS core: integer-floor AMM, maker grid, fill ledger" },
      health: dexS.halted ? "down" : lampFrom(dexAt),
      publishedAt: dexAt,
      ageHours: ageHours(dexAt),
      intensity: dexS.swaps != null ? clamp01(dexS.swaps / 12000) : null,
      metrics: [
        { k: { he: "מחיר-ייחוס SAOS", en: "SAOS ref price" }, v: saosRef !== null ? `${(saosRef / 1000).toFixed(3)} µUSDS·k` : "—" },
        { k: { he: "החלפות", en: "Swaps" }, v: num(dexS.swaps)?.toLocaleString("en-US") ?? "—" },
        { k: { he: "מילויים", en: "Fills" }, v: num(dexS.fills)?.toLocaleString("en-US") ?? "—" },
        { k: { he: "פקודות חיות", en: "Live orders" }, v: num(dexS.liveOrders)?.toString() ?? "—" },
        { k: { he: "גובה-המנוע", en: "Engine height" }, v: num(dexS.height)?.toLocaleString("en-US") ?? "—" },
        { k: { he: "בריכות חיות", en: "Live pools" }, v: (dexState?.pools?.length ?? 0).toString() },
      ],
      books: ["Console/dex/state.json", "Console/dex/fee-law.json"],
      note: (feeLaw?.verdict ? { he: "חוק-העמלה הדינמית נמדד מהספר שלנו", en: "Dynamic fee law measured from our own book" } : null),
    },
    {
      id: "truth",
      glyph: "truth",
      name: { he: "מגדל-האמת", en: "The Truth Spire" },
      role: { he: "שערי-האמת + הצהרות A — כל עמוד נמדד, כל טענה נבדקת", en: "Truth gates + A-assertions — every page measured, every claim tested" },
      health: truthFail && truthFail > 0 ? "down" : lampFrom(truth?.at ?? null),
      publishedAt: truth?.at ?? null,
      ageHours: ageHours(truth?.at ?? null),
      intensity: verify?.summary?.total ? clamp01((verify.summary.passed ?? 0) / verify.summary.total) : null,
      metrics: [
        { k: { he: "שערים", en: "Gates" }, v: `${truthPass ?? "—"} pass · ${truthFail ?? "—"} fail` },
        { k: { he: "הצהרות", en: "Assertions" }, v: `${verify?.summary?.passed ?? "—"}/${verify?.summary?.total ?? "—"}` },
        { k: { he: "פסק-דין", en: "Verdict" }, v: truth?.verdict ?? "—" },
        { k: { he: "ריצות בהיסטוריה", en: "History runs" }, v: truthHistoryRuns.length.toString() },
      ],
      books: ["Console/truth/latest.json", "Domain/agent/verify/results.json", "Console/truth/history.json"],
      note: null,
    },
    {
      id: "census",
      glyph: "census",
      name: { he: "אולם-המפקד", en: "The Census Hall" },
      role: { he: "ספירת-האחוזה: מסילות, יכולות, שולחנות — לא רישום, מדידה", en: "Estate census: lanes, capabilities, desks — measurement, not registry" },
      health: lampFrom(census?.at ?? null, 48, 120),
      publishedAt: census?.at ?? null,
      ageHours: ageHours(census?.at ?? null),
      intensity: censusDesks ? clamp01(censusDesks / 79) : null,
      metrics: [
        { k: { he: "מסילות", en: "Lanes" }, v: censusLanes?.toString() ?? "—" },
        { k: { he: "יכולות", en: "Capabilities" }, v: censusCaps?.toString() ?? "—" },
        { k: { he: "שולחנות", en: "Desks" }, v: censusDesks?.toString() ?? "—" },
        { k: { he: "זרימות-CI", en: "Workflows" }, v: censusWf?.toString() ?? "—" },
      ],
      books: ["Domain/agents/fleet-census.json"],
      note: null,
    },
    {
      id: "mint",
      glyph: "mint",
      name: { he: "המטבעה", en: "The Mint" },
      role: { he: "שתי-קופות, אפס-ערבוב: כסף-אמיתי מול ספר-סימולציה", en: "Two ledgers, zero mixing: real money vs the SIM book" },
      health: conservationHolds === false ? "down" : lampFrom(honestEcon?.publishedAt ?? money?.publishedAt ?? null),
      publishedAt: honestEcon?.publishedAt ?? money?.publishedAt ?? null,
      ageHours: ageHours(honestEcon?.publishedAt ?? money?.publishedAt ?? null),
      intensity: clamp01(poolFeeSum / 400000),
      metrics: [
        { k: { he: "מקופה-אמיתית", en: "Real custody" }, v: honestEcon?.realChain?.markedUsd != null ? `$${honestEcon.realChain.markedUsd.toFixed(4)}` : "—" },
        { k: { he: "הפסד-ממומש", en: "Realized loss" }, v: honestEcon?.realPnl?.realizedSbd != null ? `${honestEcon.realPnl.realizedSbd} SBD` : "—" },
        { k: { he: "ספר-סימולציה", en: "SIM book" }, v: honestEcon?.simBook?.totalUsds != null ? `${honestEcon.simBook.totalUsds.toLocaleString("en-US")} USDS` : "—" },
        { k: { he: "שימור מלא", en: "Conservation" }, v: conservationHolds === true ? "HOLDS" : conservationHolds === false ? "BROKEN" : "—" },
        { k: { he: "עמלות-אוצר שנצברו", en: "Treasury fees accrued" }, v: poolFeeSum ? `${shortNum(poolFeeSum)} µ` : "—" },
      ],
      books: ["Console/dex/honest-econ.json", "Domain/dex/money.json"],
      note: { he: "כל \"רווח\" בתוך-הספר אינו רווח-אמיתי", en: "Any profit measured inside the book is not real profit" },
    },
    {
      id: "anchors",
      glyph: "anchors",
      name: { he: "גשרי-האנקור", en: "The Anchor Bridges" },
      role: { he: "דופק-מקביל חסר-מפתח על כל שרשרת שהאחוזה עוגנת בה", en: "Keyless parallel pulse on every chain the estate anchors to" },
      health: vitals && vitals.summary ? (vitals.summary.down === 0 ? "alive" : vitals.summary.up && vitals.summary.up > 0 ? "waiting" : "down") : "down",
      publishedAt: vitals?.generatedAt ?? null,
      ageHours: ageHours(vitals?.generatedAt ?? null),
      intensity: vitalsAll ? clamp01((vitalsUp ?? 0) / vitalsAll) : null,
      metrics: [
        { k: { he: "מסילות-עולן", en: "Lines up" }, v: `${vitalsUp ?? "—"}/${vitalsAll ?? "—"}` },
        { k: { he: "השהיה גרועה", en: "Worst latency" }, v: vitals?.summary?.worstLatencyMs != null ? `${vitals.summary.worstLatencyMs}ms` : "—" },
        { k: { he: "כוננות-מטמון", en: "Custody watch" }, v: custody.length ? `${custody.filter((c) => c.ok).length}/${custody.length} ok` : "—" },
      ],
      books: ["Console/weave/vitals.json", "Console/dex/watch.json"],
      note: null,
    },
    {
      id: "stasis",
      glyph: "stasis",
      name: { he: "משמר-הסטאזיס", en: "The Stasis Guard" },
      role: { he: "הבלם הריבוני: כל מסילת-הון עוברת דרך שער-הבעלים", en: "The sovereign brake: every capital lane passes the owner gate" },
      health: stasis?.active ? "waiting" : "alive",
      publishedAt: null,
      ageHours: null,
      intensity: clamp01(stasisLanes.length / 4),
      metrics: [
        { k: { he: "מצב", en: "Mode" }, v: stasis?.mode ?? (stasis?.active ? "armed" : "open") },
        { k: { he: "מסילות פתוחות", en: "Open lanes" }, v: stasisLanes.join(", ") || "—" },
        { k: { he: "מאז", en: "Since" }, v: stasis?.since?.slice(0, 10) ?? "—" },
      ],
      books: ["Domain/agents/STASIS.json"],
      note: { he: "ענבר = הבלם לפי הנחיית-הבעלים, לא תקלה", en: "Amber = the brake by owner directive, not a fault" },
    },
    {
      id: "library",
      glyph: "library",
      name: { he: "הספרייה", en: "The Library" },
      role: { he: "ספריית-הכישורים ופנקס-הלמידה: מה שנמדד נשמר", en: "Skill library + learning ledger: what is measured is kept" },
      health: skillLib ? "waiting" : "down",
      publishedAt: null,
      ageHours: null,
      intensity: skillsCount ? clamp01(skillsCount / 16) : null,
      metrics: [
        { k: { he: "כישורים", en: "Skills" }, v: (skillsCount ?? 0).toString() },
        { k: { he: "רשומות-למידה", en: "Learning entries" }, v: learningEntries?.toString() ?? "—" },
        { k: { he: "זהויות רשומות", en: "Registered identities" }, v: (registry?.identity?.length ?? 0).toString() },
      ],
      books: ["Domain/agents/skill-library.json", "Domain/agents/learning-ledger.json", "Domain/agents/agent-registry.json"],
      note: { he: "מראה ERC-8004 — מפתח-מקומי, רישום-שרשרת עתידי תחת שער-הבעלים", en: "ERC-8004-shaped — local keyless mirror; on-chain register is owner-gated" },
    },
    {
      id: "herald",
      glyph: "herald",
      name: { he: "רובע-ההצהרה", en: "The Herald Quarter" },
      role: { he: "תביעות, אצילות-תוכן וגלי-פרסום — קול האחוזה אל החוץ", en: "Claims, curation and content waves — the estate's voice outward" },
      health: lampFrom(pulse?.at ?? null, 12, 48),
      publishedAt: pulse?.at ?? null,
      ageHours: ageHours(pulse?.at ?? null),
      intensity: pulseCount ? clamp01(pulseCount / 8) : null,
      metrics: [
        { k: { he: "הצעות בדופק", en: "Pulse proposals" }, v: (pulseCount ?? 0).toString() },
        { k: { he: "שווקים נמדדים", en: "Measured markets" }, v: (grid?.markets?.length ?? 0).toString() },
        { k: { he: "דופק אחרון", en: "Last pulse" }, v: pulse?.at?.slice(0, 16).replace("T", " ") ?? "—" },
      ],
      books: ["Domain/agents/pulse-book.json", "Domain/agents/market-grid.json"],
      note: null,
    },
  ];

  // citizens inherit the working state of their district beacon (measured, not simulated)
  const healthOf: Record<string, Health> = Object.fromEntries(districts.map((d) => [d.id, d.health]));
  for (const c of citizens) c.busy = healthOf[c.district] === "alive";

  // ── tape
  const tape: TapeEvent[] = [];
  if (truth?.at) {
    tape.push({
      id: "truth-latest",
      at: truth.at,
      source: "truth-gate",
      kind: "gate",
      text: { he: `שער-האמת: ${truth.verdict ?? "—"} · ${truthPass ?? "?"} עברו, ${truthFail ?? "?"} נפלו`, en: `Truth gate: ${truth.verdict ?? "—"} · ${truthPass ?? "?"} passed, ${truthFail ?? "?"} failed` },
      weight: 3,
    });
  }
  if (verify?.generatedAt) {
    tape.push({
      id: "verify-latest",
      at: verify.generatedAt,
      source: "agent-verify",
      kind: "gate",
      text: { he: `ההצהרות: ${verify.summary?.passed ?? "?"}/${verify.summary?.total ?? "?"} ירוקות (${verify.summary?.verdict ?? "—"})`, en: `Assertions: ${verify.summary?.passed ?? "?"}/${verify.summary?.total ?? "?"} green (${verify.summary?.verdict ?? "—"})` },
      weight: 3,
    });
  }
  if (dexState?.beat?.runAt) {
    tape.push({
      id: "dex-beat",
      at: dexState.beat.runAt,
      source: "saos-dex",
      kind: "beat",
      text: { he: `פעימת-ענן: גובה ${(dexS.height ?? 0).toLocaleString("en-US")} · ${dexState.beat.ticks ?? "—"} תקתוקים · המנוע לא עצור`, en: `Cloud beat: height ${(dexS.height ?? 0).toLocaleString("en-US")} · ${dexState.beat.ticks ?? "—"} ticks · engine not halted` },
      weight: 2,
    });
  }
  if (feeLaw?.publishedAt) {
    tape.push({
      id: "fee-law",
      at: feeLaw.publishedAt,
      source: "fee-law",
      kind: "fee-law",
      text: { he: `חוק-העמלה: ${feeLaw.verdict ?? "—"} (σ נמדד מהספר הרשמי בלבד)`, en: `Fee law: ${feeLaw.verdict ?? "—"} (σ measured from the official book only)` },
      weight: 2,
    });
  }
  if (moment?.publishedAt) {
    tape.push({
      id: "moment",
      at: moment.publishedAt,
      source: "moment-watch",
      kind: "moment",
      text: { he: `רגע-הריבונות: ${moment.regime?.label ?? "—"} · F&G ${moment.market?.fearGreed?.value ?? "—"} (${moment.market?.fearGreed?.label ?? "—"})`, en: `Sovereign moment: ${moment.regime?.label ?? "—"} · F&G ${moment.market?.fearGreed?.value ?? "—"} (${moment.market?.fearGreed?.label ?? "—"})` },
      weight: 1,
    });
  }
  if (money?.publishedAt) {
    tape.push({
      id: "money-watch",
      at: money.publishedAt,
      source: "money-watch",
      kind: "beat",
      text: { he: `זקיף-דרך-הכסף: פדיון ${money.redemption?.verdict ?? "—"} · שימור ${money.invariant?.holds ? "מחזיק" : "נפרץ!"}`, en: `Money path: redemption ${money.redemption?.verdict ?? "—"} · conservation ${money.invariant?.holds ? "HOLDS" : "BROKEN!"}` },
      weight: 2,
    });
  }
  for (const p of (pulse?.proposals ?? []).slice(0, 3)) {
    if (!p.id) continue;
    tape.push({
      id: `pulse-${p.id}`,
      at: pulse?.at ?? new Date().toISOString(),
      source: "pulse",
      kind: "pulse",
      text: { he: `דופק: ${p.id} — ${p.disposition ?? p.kind ?? ""}`, en: `Pulse: ${p.id} — ${p.disposition ?? p.kind ?? ""}` },
      weight: 1,
    });
  }
  // live engine fills — the exchange floor speaking
  for (const f of engineTape.slice(0, 5)) {
    tape.push({
      id: f.id,
      at: new Date(f.at).toISOString(),
      source: "saos-engine",
      kind: "fill",
      text: {
        he: `מילוי חי: SAOS/USDS @ ${(f.price / 1000).toFixed(3)} µ·k · ${(f.amountMu / 1000).toFixed(1)} SAOS · ${f.taker}×${f.maker}`,
        en: `Live fill: SAOS/USDS @ ${(f.price / 1000).toFixed(3)} µ·k · ${(f.amountMu / 1000).toFixed(1)} SAOS · ${f.taker}×${f.maker}`,
      },
      weight: 1,
    });
  }
  // coordination bus — the estate's nervous system
  for (const m of coord.slice(0, 4)) {
    tape.push({
      id: m.id,
      at: m.at,
      source: "coord-bus",
      kind: "coord",
      text: {
        he: `אוטובוס-תיאום: ${m.proto} · ${m.action} · seq ${m.seq}`,
        en: `Coord bus: ${m.proto} · ${m.action} · seq ${m.seq}`,
      },
      weight: 1,
    });
  }
  if (indicatorsState.at) {
    tape.push({
      id: "indicators",
      at: indicatorsState.at,
      source: "fleet-indicators",
      kind: "moment",
      text: {
        he: `מדדי-הצי: ${indicatorsState.verdict ?? "—"} · ${indicatorsState.grow ?? "?"} צומחים, ${indicatorsState.decline ?? "?"} שוקעים, ${indicatorsState.held ?? "?"} מחזיקים`,
        en: `Fleet indicators: ${indicatorsState.verdict ?? "—"} · ${indicatorsState.grow ?? "?"} grow, ${indicatorsState.decline ?? "?"} decline, ${indicatorsState.held ?? "?"} held`,
      },
      weight: 1,
    });
  }
  tape.push(...(await receiptTape()));
  tape.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const tapeCut = tape.slice(0, 56);

  // ── lines
  const lines: ChainLine[] = (vitals?.lines ?? []).slice(0, 10).map((l) => ({
    line: l.line ?? "?",
    role: l.role ?? "",
    ok: !!l.ok,
    latencyMs: num(l.latencyMs),
    headBlock: num(l.detail?.headBlock),
  }));

  // ── gates
  const gates = {
    stasis: {
      active: !!stasis?.active,
      mode: stasis?.mode ?? "unknown",
      since: stasis?.since ?? null,
      lanes: stasisLanes,
      summary: {
        he: stasis?.active
          ? "הבלם חמוש — רק מסילות מדורגות פתוחות, כל השאר מדידה-בלבד"
          : "הבלם פתוח — המסילות פועלות בהתאם לשערי-הבעלים",
        en: stasis?.active
          ? "Brake armed — only staged lanes open, everything else measurement-only"
          : "Brake open — lanes run per the owner gates",
      },
    },
    owner: {
      openGates: cr75?.opens
        ? [{ id: "CR-0075", opened: cr75.opens, at: cr75.at ?? null }]
        : [],
      summary: {
        he: cr75?.opens?.length
          ? "שער-הבעלים CR-0075 פתוח: התיישבות-אצווה אחידה + חוק-עמלה במנוע — יחידות-ספר פנימיות בלבד"
          : "אין שערים פתוחים — ההון עומד עד למילה-הבעלים הבאה",
        en: cr75?.opens?.length
          ? "Owner gate CR-0075 open: uniform batch settlement + engine fee law — internal book units only"
          : "No gates open — capital stands until the next owner word",
      },
    },
  };

  return {
    ok: true,
    at: new Date().toISOString(),
    generatedBy: "fleet-world/2.0 · the living sovereignty atlas (deepened)",
    census: {
      lanes: censusLanes,
      capabilities: censusCaps,
      desks: censusDesks,
      workflows: censusWf,
      estateCommits: null,
      skills: skillsCount,
      liveDesks: roles.filter((r) => r.status === "LIVE").length,
    },
    regime: moment
      ? {
          label: moment.regime?.label ?? null,
          fearGreed: moment.market?.fearGreed?.value ?? null,
          fearGreedLabel: moment.market?.fearGreed?.label ?? null,
          steemUsd: moment.market?.steemUsd ?? null,
          btcUsd: moment.market?.btcUsd ?? null,
          gridVerdict: moment.grid?.verdict ?? null,
        }
      : null,
    districts,
    citizens,
    tape: tapeCut,
    token: {
      symbol: "SAOS",
      name: { he: "טוקן-הריבונות", en: "The Sovereignty Token" },
      refPriceMu: saosRef,
      swaps: num(dexS.swaps),
      fills: num(dexS.fills),
      liveOrders: num(dexS.liveOrders),
      height: num(dexS.height),
      engineAt: dexAt,
      backing: Object.entries(dexS.backing ?? {}).map(([key, mu]) => ({ key, mu })),
      feeLaw: {
        formula: {
          he: feeLaw?.law?.formulaHe ?? "fee = clamp(base + K_VOL × σ, base, 2×base)",
          en: feeLaw?.law?.formula ?? "fee = clamp(base + K_VOL × σ, base, 2×base)",
        },
        live: feeLawLive,
        pools: feePools,
        at: feeLaw?.publishedAt ?? null,
      },
      honest: {
        realCustodyUsd: honestEcon?.realChain?.markedUsd ?? null,
        realizedLossSbd: honestEcon?.realPnl?.realizedSbd ?? null,
        simBookUsds: honestEcon?.simBook?.totalUsds ?? null,
        saosExternalBid: honestEcon?.saosExternalBid?.exists ?? false,
        conservationHolds,
        doctrine: {
          he:
            honestEcon?.doctrine?.he ??
            "שתי-קופות, אפס-ערבוב: כסף-אמיתי = יתרות-שרשרת מ-RPC ציבורי · הכל-עוד = ספר פנימי ללא תביעת-ערך-חוץ · ל-SAOS אין ביד-חוץ ואין נזילות-חוץ",
          en:
            honestEcon?.doctrine?.en ??
            "Two ledgers, zero mixing: real money = chain balances from public RPCs · everything else = the internal book with no external value claim · SAOS has no external bid and no external liquidity",
        },
      },
    },
    gates,
    lines,
    truth: {
      verdict: truth?.verdict ?? "UNKNOWN",
      pass: truthPass ?? 0,
      fail: truthFail ?? 0,
      skip: truth?.counts?.skip ?? 0,
      at: truth?.at ?? null,
      assertions: {
        total: verify?.summary?.total ?? 0,
        passed: verify?.summary?.passed ?? 0,
        failed: verify?.summary?.failed ?? 0,
        verdict: verify?.summary?.verdict ?? "UNKNOWN",
        at: verify?.generatedAt ?? null,
      },
    },
    engineTape,
    pools,
    truthHistory: truthHistoryRuns,
    coord,
    indicators: indicatorsState,
    custody,
    pulseCount,
    gridMarkets: grid?.markets?.length ?? null,
    learningEntries,
  };
}

// keep the Bi type import honest (used by District/Tape builders above through the types)
export type { Bi };
