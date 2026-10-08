import type { Lang } from "./types";

/** UI dictionary for the Fleet World HUD — he/en, RTL-first. */
export const T = {
  title: { he: "עולם-הצי", en: "Fleet World" },
  subtitle: {
    he: "מפת-הריבונות החיה · הכל נמדד מהספרים הרשמיים",
    en: "The living sovereignty atlas · everything measured from the official books",
  },
  tagline: {
    he: "סוכנים עובדים בעולמם — והעולם הזה נבנה לעיניך",
    en: "Agents at work in their world — and the world is built before your eyes",
  },
  live: { he: "חי", en: "LIVE" },
  loading: { he: "מדליק את האחוזה…", en: "Lighting the estate…" },
  loadingHint: { he: "קורא את ספרי-האמת: מפקד, בורסה, שערים", en: "Reading the truth books: census, exchange, gates" },
  errorTitle: { he: "העולם לא נדלק", en: "The world did not light" },
  errorHint: {
    he: "הספרים לא נענו — יושם בהתאם לחוק-היושר, בלי המצאה",
    en: "The books did not answer — fail-closed per the honesty law, nothing invented",
  },
  retry: { he: "נסה שוב", en: "Retry" },
  console: { he: "הקונסולה", en: "Console" },
  // panels
  tape: { he: "סרט-התלושים", en: "The Receipt Tape" },
  tapeHint: { he: "אירועים אמיתיים לפי זמן פרסום", en: "Real events by publish time" },
  tokenTab: { he: "טוקן SAOS", en: "SAOS Token" },
  gatesTab: { he: "שערים", en: "Gates" },
  linesTab: { he: "מסילות", en: "Lines" },
  rosterTab: { he: "אזרחים", en: "Citizens" },
  timelineTab: { he: "ציר-זמן", en: "Timeline" },
  // camera
  zoomHint: { he: "גלגלת = זום · גרירה = תנועה · לחיצה = בחירה", en: "Wheel = zoom · drag = pan · click = select" },
  resetView: { he: "איפוס-תצפית", en: "Reset view" },
  minimap: { he: "מפה-קטנה", en: "Minimap" },
  // token
  internalPrice: { he: "מחיר-ייחוס פנימי", en: "Internal ref price" },
  swaps: { he: "החלפות", en: "Swaps" },
  fills: { he: "מילויים", en: "Fills" },
  liveOrders: { he: "פקודות חיות", en: "Live orders" },
  engineHeight: { he: "גובה-מנוע", en: "Engine height" },
  feeLaw: { he: "חוק-העמלה הדינמי", en: "Dynamic fee law" },
  feeLawOn: { he: "פעיל — העמלה עולה עם התנודתיות הנמדדת", en: "Active — fees rise with measured volatility" },
  feeLawOff: { he: "בבסיס — אין σ נמדד, אין המצאה", en: "At base — no measured σ, no invention" },
  pool: { he: "בריכה", en: "Pool" },
  base: { he: "בסיס", en: "Base" },
  fee: { he: "עמלה", en: "Fee" },
  sigma: { he: "תנודתיות σ", en: "Volatility σ" },
  poolsTitle: { he: "בריכות-המנוע (מהספר הרשמי)", en: "Engine pools (from the official book)" },
  poolReserves: { he: "עתודות", en: "Reserves" },
  poolMid: { he: "מחיר-אמצע", en: "Mid" },
  poolSwaps: { he: "החלפות", en: "Swaps" },
  lpYield: { he: "תשואת-LP", en: "LP yield" },
  custodyTitle: { he: "כוננות-מטמון רבת-שרשרת", en: "Multi-chain custody watch" },
  priceMove: { he: "תזוזת-מחיר (מילויים אחרונים)", en: "Price move (recent fills)" },
  honestBox: { he: "הכסף-האמיתי (חוק-היושר)", en: "Real money (honesty law)" },
  realCustody: { he: "מקופה-אמיתית מסומנת", en: "Marked real custody" },
  realizedLoss: { he: "הפסד-ממומש", en: "Realized loss" },
  simBook: { he: "ספר-סימולציה", en: "SIM book" },
  notRealMoney: { he: "לא כסף אמיתי", en: "NOT REAL MONEY" },
  externalBid: { he: "ביד-חוץ ל-SAOS", en: "External bid for SAOS" },
  none: { he: "אין — וזה הכנות שלנו", en: "None — and that is our honesty" },
  conservation: { he: "שימור-מלא", en: "Conservation" },
  holds: { he: "מחזיק", en: "HOLDS" },
  broken: { he: "נפרץ", en: "BROKEN" },
  swapHere: { he: "לחלון-ההחלפות בקונסולה", en: "To the swap window in the console" },
  // gates
  stasisTitle: { he: "משמר-הסטאזיס", en: "The Stasis Guard" },
  stasisArmed: { he: "חמוש — מסילות מדורגות בלבד", en: "Armed — staged lanes only" },
  stasisOpen: { he: "פתוח — לפי שערי-הבעלים", en: "Open — per the owner gates" },
  openLanes: { he: "מסילות פתוחות", en: "Open lanes" },
  ownerTitle: { he: "דוכן-הבעלים", en: "The Owner Podium" },
  ownerOpen: { he: "שערים פתוחים", en: "Open gates" },
  ownerNone: { he: "אין שערים פתוחים — ההון עומד עד למילה-הבעלים הבאה", en: "No gates open — capital stands until the next owner word" },
  // lines
  linesTitle: { he: "מסילות-העוגן", en: "Anchor lines" },
  latency: { he: "השהיה", en: "Latency" },
  head: { he: "ראש", en: "Head" },
  // roster
  searchCitizen: { he: "חפש אזרח…", en: "Search citizen…" },
  focusOnMap: { he: "מקד על המפה", en: "Focus on map" },
  working: { he: "עובד", en: "working" },
  idle: { he: "במנוחה", en: "idle" },
  citizensOf: { he: "אזרחי האחוזה", en: "Citizens of the estate" },
  // timeline
  truthChronicle: { he: "כרוניקת-שער-האמת", en: "The truth-gate chronicle" },
  truthChronicleHint: {
    he: "כל ריבוע = ריצת-שער אמיתית מההיסטוריה הרשמית",
    en: "Every square = a real gate run from the official history",
  },
  uptime: { he: "זמינות", en: "Uptime" },
  runs: { he: "ריצות", en: "runs" },
  coordLog: { he: "יומן-אוטובוס התיאום (מהשרשרת)", en: "Coordination bus log (from chain)" },
  indicatorsTitle: { he: "מדדי-הצי", en: "Fleet indicators" },
  grow: { he: "צומח", en: "grow" },
  decline: { he: "שוקע", en: "decline" },
  held: { he: "מחזיק", en: "held" },
  // district / citizen
  district: { he: "רובע", en: "District" },
  citizen: { he: "אזרח", en: "Citizen" },
  role: { he: "תפקיד", en: "Role" },
  lane: { he: "מסילת-CI", en: "CI lane" },
  tier: { he: "דרגה", en: "Tier" },
  status: { he: "מצב", en: "Status" },
  lastFed: { he: "הספר הוזן", en: "Book fed" },
  hoursAgo: { he: "לפני שעות", en: "h ago" },
  minutesAgo: { he: "לפני דקות", en: "m ago" },
  now: { he: "עכשיו", en: "now" },
  books: { he: "ספרים", en: "Books" },
  keyMode: { he: "מצב-מפתח", en: "Key mode" },
  close: { he: "סגור", en: "Close" },
  healthAlive: { he: "חי", en: "alive" },
  healthWaiting: { he: "ממתין", en: "waiting" },
  healthStale: { he: "מזדקן", en: "stale" },
  healthDown: { he: "יורד", en: "down" },
  activity: { he: "פעילות נמדדת", en: "Measured activity" },
  // legend / footer
  legend: { he: "הרבעים", en: "Districts" },
  measuredFrom: { he: "הכל נמדד מהספרים · אפס המצאה · כל מנורה היא זמן-פרסום אמיתי", en: "All measured from the books · zero invention · every lamp is a real publish time" },
  censusLine: { he: "מסילות", en: "lanes" },
  censusCaps: { he: "יכולות", en: "capabilities" },
  censusDesks: { he: "שולחנות", en: "desks" },
  censusLive: { he: "חיים", en: "live" },
  utc: { he: "שעון-עולם", en: "World clock" },
  synced: { he: "סונכרן", en: "synced" },
  syncedAgo: { he: "לפני", en: "ago" },
  nextSync: { he: "סנכרון בעוד", en: "next sync in" },
  seconds: { he: "שנ׳", en: "s" },
  night: { he: "לילה על האחוזה", en: "Night over the estate" },
  day: { he: "יום על האחוזה", en: "Day over the estate" },
  engineTapeTitle: { he: "מילויים חיים מהמנוע", en: "Live fills from the engine" },
  noFills: { he: "אין מילויים בסרט האחרון — המנוע שקט", en: "No fills on the recent tape — the engine is quiet" },
} as const;

export type TKey = keyof typeof T;

export function t(key: TKey, lang: Lang): string {
  return T[key][lang];
}

export function healthWord(h: string, lang: Lang): string {
  if (h === "alive") return t("healthAlive", lang);
  if (h === "waiting") return t("healthWaiting", lang);
  if (h === "stale") return t("healthStale", lang);
  return t("healthDown", lang);
}

export function ago(iso: string | null, lang: Lang): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return t("now", lang);
  if (m < 120) return `${m} ${t("minutesAgo", lang)}`;
  const h = Math.floor(m / 60);
  return `${h} ${t("hoursAgo", lang)}`;
}

export function fmtClock(d: Date): string {
  return d.toISOString().slice(11, 19) + " UTC";
}

/** Continuous daylight factor 0..1 from the real UTC hour (measured, not invented). */
export function dayFactor(d: Date): number {
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const sun = Math.sin(((h - 6) / 12) * Math.PI); // sunrise 06:00, sunset 18:00 UTC
  return Math.min(1, Math.max(0, sun));
}
