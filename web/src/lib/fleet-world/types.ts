// Fleet World 2.0 — shared types between /api/world and the client canvas.
// Everything here is MEASURED from the fleet's own live books (no invention).
// The honesty law: every number on the world map traces back to a real book file.

export type Lang = "he" | "en";

export interface Bi {
  he: string;
  en: string;
}

/** Beacon lamp state — mirrors the console palette (sw-pass / sw-wait / sw-fail). */
export type Health = "alive" | "waiting" | "stale" | "down";

export interface Metric {
  k: Bi;
  v: string;
  hint?: Bi;
}

export interface District {
  id: string;
  glyph:
    | "exchange"
    | "truth"
    | "census"
    | "mint"
    | "anchors"
    | "stasis"
    | "library"
    | "herald";
  name: Bi;
  role: Bi;
  health: Health;
  /** publishedAt of the primary book (ISO) — the beacon measures THIS. */
  publishedAt: string | null;
  ageHours: number | null;
  /** 0..1 real activity measure — scales the district's skyline on the canvas. */
  intensity: number | null;
  metrics: Metric[];
  books: string[];
  note: Bi | null;
}

export interface Citizen {
  id: string;
  name: string;
  role: Bi;
  tier: "A" | "B" | "C";
  keyMode: string;
  /** cron workflow lane the desk runs on */
  lane: string;
  district: string;
  status: string;
  /** last activity source for the walk animation (book publishedAt if known) */
  lastAt: string | null;
  /** true when the district's book was fed in the last ~6h — the desk is working */
  busy: boolean;
}

export interface TapeEvent {
  id: string;
  at: string;
  source: string;
  kind: "receipt" | "pulse" | "delta" | "beat" | "gate" | "moment" | "fee-law" | "fill" | "coord";
  text: Bi;
  weight: 1 | 2 | 3;
}

/** A real fill measured from the engine's own tape (Console/dex/state.json). */
export interface EngineFill {
  id: string;
  at: number; // epoch ms from the engine
  price: number; // µUSDS per SAOS
  amountMu: number;
  taker: string;
  maker: string;
  h: number;
}

/** A real pool row measured from the engine's books. */
export interface PoolRow {
  key: string;
  mid: number | null;
  swaps: number;
  feeBps: number;
  lpYieldBps: number | null;
  reserves: string; // human short form "15.0M · 19.8M"
}

/** A real truth-gate run from Console/truth/history.json. */
export interface TruthRun {
  at: string;
  verdict: string;
  pass: number;
  fail: number;
  skip: number;
}

/** A real coordination-bus message (on-chain custom_json, keyless read). */
export interface CoordMsg {
  id: string;
  seq: number;
  at: string;
  proto: string;
  action: string;
}

/** Fleet indicators (fleet-indicators.json) — the measured mood of the world. */
export interface Indicators {
  verdict: string | null;
  grow: number | null;
  decline: number | null;
  held: number | null;
  at: string | null;
}

/** Multi-chain custody status (dex/watch.json). */
export interface CustodyChain {
  chain: string;
  status: string;
  ok: boolean;
}

export interface TokenState {
  symbol: string;
  name: Bi;
  refPriceMu: number | null; // µUSDS per SAOS (internal book)
  swaps: number | null;
  fills: number | null;
  liveOrders: number | null;
  height: number | null;
  engineAt: string | null;
  backing: { key: string; mu: number }[];
  feeLaw: {
    formula: Bi;
    live: boolean;
    pools: { market: string; baseBps: number; feeBps: number; sigmaBps: number }[];
    at: string | null;
  };
  honest: {
    realCustodyUsd: number | null;
    realizedLossSbd: number | null;
    simBookUsds: number | null;
    saosExternalBid: boolean;
    conservationHolds: boolean | null;
    doctrine: Bi;
  };
}

export interface GateState {
  stasis: {
    active: boolean;
    mode: string;
    since: string | null;
    lanes: string[];
    summary: Bi;
  };
  owner: {
    openGates: { id: string; opened: string[]; at: string | null }[];
    summary: Bi;
  };
}

export interface ChainLine {
  line: string;
  role: string;
  ok: boolean;
  latencyMs: number | null;
  headBlock: number | null;
}

export interface TruthState {
  verdict: string;
  pass: number;
  fail: number;
  skip: number;
  at: string | null;
  assertions: { total: number; passed: number; failed: number; verdict: string; at: string | null };
}

export interface WorldState {
  ok: true;
  at: string;
  generatedBy: string;
  census: {
    lanes: number | null;
    capabilities: number | null;
    desks: number | null;
    workflows: number | null;
    estateCommits: number | null;
    skills: number | null;
    liveDesks: number;
  };
  regime: {
    label: string | null;
    fearGreed: number | null;
    fearGreedLabel: string | null;
    steemUsd: number | null;
    btcUsd: number | null;
    gridVerdict: string | null;
  } | null;
  districts: District[];
  citizens: Citizen[];
  tape: TapeEvent[];
  token: TokenState;
  gates: GateState;
  lines: ChainLine[];
  truth: TruthState;
  /** 2.0 deepening — all measured from the fleet's own books: */
  engineTape: EngineFill[];
  pools: PoolRow[];
  truthHistory: TruthRun[];
  coord: CoordMsg[];
  indicators: Indicators;
  custody: CustodyChain[];
  pulseCount: number | null;
  gridMarkets: number | null;
  learningEntries: number | null;
}
