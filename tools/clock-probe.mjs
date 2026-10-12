#!/usr/bin/env node
// clock-probe — EVERY VERDICT IN THE ESTATE IS AGE MATH; AGE MATH NEEDS A CLOCK.
//
// 26-b sharp-risk #4: freshness verdicts (veritas 3h window, watchdog silence
// limits, SLO error budgets) all compare server timestamps to the local clock —
// but the local clock itself was never measured. A drifting box would silently
// re-classify fresh data as stale (or stale as fresh) and every alarm lane
// would lie with a straight face. This probe measures the drift directly.
//
// Method: HEAD requests to three independent servers (api.github.com — the
// same host every git verdict flows through; www.github.com — the front door;
// the live Pages site — the public truth surface), read the Date response
// header, compare to the local clock at receive time. Any HTTP response
// carries Date — availability problems do not excuse a sample, only a missing
// or unparseable Date does (recorded honestly as no-data).
//
// Receipt: receipts/clock.json {schema, at, samples:[{host, serverDate,
// localDate, skewMs}], maxSkewMs, verdict OK|ALARM}. skewMs = server − local
// (positive = local clock behind server time).
// Fail-loud law: exit non-zero when ANY measured |skew| > 90s — the receipt is
// still written FIRST (evidence survives the alarm).
//
// Run: node tools/clock-probe.mjs   (verdict also on stdout)

import { writeFileSync, mkdirSync } from "node:fs";

const HOSTS = [
  "https://api.github.com",
  "https://www.github.com",
  "https://roshpinacare-sys.github.io/Domain/",
];
const LIMIT_MS = 90_000; // 90s — an order below the tightest estate freshness window (3h), far above honest network lag

const receipt = { schema: "clock.probe/1", at: new Date().toISOString(), samples: [], maxSkewMs: null, verdict: "OK" };
let measured = 0, worst = 0, anyBad = false;

for (const host of HOSTS) {
  const localDate = new Date().toISOString();
  let serverDate = null, skewMs = null, note = null;
  try {
    const res = await fetch(host, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    const h = res.headers.get("date");
    if (!h) note = "no-date-header";
    else {
      serverDate = new Date(h).toUTCString();
      skewMs = new Date(h).getTime() - Date.now();
      measured++;
      if (Math.abs(skewMs) > worst) worst = Math.abs(skewMs);
      if (Math.abs(skewMs) > LIMIT_MS) anyBad = true;
    }
  } catch (e) {
    note = `unreachable: ${String(e && e.message ? e.message : e).slice(0, 40)}`;
  }
  receipt.samples.push({ host, serverDate, localDate, skewMs, ...(note ? { note } : {}) });
  console.log(`${host} → skew=${skewMs == null ? "no-data" : skewMs + "ms"}${note ? ` (${note})` : ""}`);
}

receipt.maxSkewMs = measured ? worst : null;
if (!measured) receipt.verdict = "ALARM"; // cannot prove the clock at all
else if (anyBad) receipt.verdict = "ALARM";

mkdirSync("receipts", { recursive: true });
writeFileSync("receipts/clock.json", JSON.stringify(receipt, null, 1) + "\n");
console.log(`CLOCK-PROBE: ${receipt.verdict} — maxSkew=${receipt.maxSkewMs == null ? "no-data" : receipt.maxSkewMs + "ms"} (limit ${LIMIT_MS}ms) · receipt receipts/clock.json`);
process.exit(receipt.verdict === "ALARM" ? 1 : 0);
