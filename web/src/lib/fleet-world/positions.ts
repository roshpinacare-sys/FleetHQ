// Shared world geometry — one canon for the canvas, the minimap and the HUD focus law.

export const W = 1600;
export const H = 1000;

export interface P {
  x: number;
  y: number;
}

/** The Flame of Sovereignty — the estate heart. */
export const FLAME: P = { x: 800, y: 505 };

/** District anchors (hand-placed estate plan). */
export const DISTRICT_POS: Record<string, P> = {
  exchange: { x: 800, y: 205 },
  truth: { x: 1090, y: 315 },
  mint: { x: 1165, y: 585 },
  stasis: { x: 985, y: 830 },
  herald: { x: 800, y: 715 },
  library: { x: 610, y: 830 },
  anchors: { x: 435, y: 585 },
  census: { x: 510, y: 315 },
};

export const DISTRICT_IDS = Object.keys(DISTRICT_POS);

/** Ring road order (the caravan route). */
export const RING: string[] = [
  "exchange",
  "truth",
  "mint",
  "stasis",
  "herald",
  "library",
  "anchors",
  "census",
  "exchange",
];

export const HEALTH_COLOR: Record<string, string> = {
  alive: "#22c55e",
  waiting: "#eab308",
  stale: "#f97316",
  down: "#ef4444",
};

export const TIER_COLOR: Record<string, string> = {
  A: "#f0d060",
  B: "#5eead4",
  C: "#d8d3c2",
};

/** Which district a coordination-bus proto/action reports to (measured mapping). */
export function coordDistrict(proto: string, action: string): string | null {
  const p = proto.toLowerCase();
  const a = action.toLowerCase();
  if (p.includes("grid") || p.includes("dex") || p.includes("swap")) return "exchange";
  if (p.includes("truth") || p.includes("verify") || p.includes("checkpoint")) return "truth";
  if (p.includes("pulse") || p.includes("herald") || p.includes("wave")) return "herald";
  if (p.includes("census") || p.includes("roster")) return "census";
  if (p.includes("money") || p.includes("mint") || p.includes("treasury")) return "mint";
  if (p.includes("anchor") || p.includes("bridge")) return "anchors";
  if (p.includes("skill") || p.includes("learn")) return "library";
  if (p.includes("stasis") || p.includes("guard")) return "stasis";
  if (a.includes("checkpoint") || a.includes("attest")) return "truth";
  if (a.includes("beat") || a.includes("tick")) return "exchange";
  return null;
}
