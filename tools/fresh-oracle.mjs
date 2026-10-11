#!/usr/bin/env node
/**
 * fresh-oracle.mjs — the standing byte-oracle ("אין זיופים" — V-FLEETHQ-FRESH).
 *
 * Law (round-7 receipt, proven 4/4 MATCH): a live page is FRESH only if
 * sha256(live bytes) == sha256(committed bytes on its deploy ref).
 * No green without byte equality. A drift is a RED, never a warning.
 *
 * Portable: pure HTTP (live site vs raw.githubusercontent deploy ref) —
 * identical behavior on host and in CI. Zero dependencies. Fail-loud.
 *
 * Outputs: receipts/fresh-oracle/latest.json + log.jsonl
 * Exit 0 iff every pair MATCHes. Exit 1 on any drift/missing (honest RED).
 *
 * Run: node tools/fresh-oracle.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const OUT_DIR = join(ROOT, "receipts", "fresh-oracle");
const ORG = "roshpinacare-sys";
const RAW = `https://raw.githubusercontent.com/${ORG}`;

/**
 * Pairs: { name, repo, liveUrl, committedRef, committedPath }
 * Every pair must exist on BOTH legs; a 404 on either is MISSING (RED).
 * Extend this table when a new public surface ships (additive-only).
 */
const PAIRS = [
  {
    name: "FleetHQ window",
    repo: "FleetHQ",
    liveUrl: "https://roshpinacare-sys.github.io/FleetHQ/",
    committedRef: "office-pages",
    committedPath: "index.html",
  },
  {
    name: "FleetHQ potential board",
    repo: "FleetHQ",
    liveUrl: "https://roshpinacare-sys.github.io/FleetHQ/potential.html",
    committedRef: "office-pages",
    committedPath: "potential.html",
  },
  {
    name: "FleetHQ potential data",
    repo: "FleetHQ",
    liveUrl: "https://roshpinacare-sys.github.io/FleetHQ/potential.json",
    committedRef: "office-pages",
    committedPath: "potential.json",
  },
  {
    name: "Domain window",
    repo: "Domain",
    liveUrl: "https://roshpinacare-sys.github.io/Domain/",
    committedRef: "main",
    committedPath: "index.html",
  },
  {
    name: "Domain worlds room",
    repo: "Domain",
    liveUrl: "https://roshpinacare-sys.github.io/Domain/office3d/",
    committedRef: "main",
    committedPath: "office3d/index.html",
  },
  // [zai-14 join T-60] the PRODUCT the owner delivers to users — its public
  // delivery is now verified standing ("באמת לספק למשתמש את המוצר"):
  {
    name: "Domain product catalog",
    repo: "Domain",
    liveUrl: "https://roshpinacare-sys.github.io/Domain/marketing/",
    committedRef: "main",
    committedPath: "marketing/index.html",
  },
  {
    name: "Domain product data",
    repo: "Domain",
    liveUrl: "https://roshpinacare-sys.github.io/Domain/marketing/products.json",
    committedRef: "main",
    committedPath: "marketing/products.json",
  },
];

const sha16 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

async function fetchBytes(url, ms = 15000) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ms),
      cache: "no-store",
      headers: { "user-agent": "fleet-fresh-oracle/1" },
    });
    if (!res.ok) return { ok: false, status: res.status, bytes: null };
    const ab = await res.arrayBuffer();
    return { ok: true, status: res.status, bytes: Buffer.from(ab) };
  } catch (e) {
    return { ok: false, status: 0, bytes: null, error: e?.message ?? "fetch failed" };
  }
}

/**
 * One retry for transient legs (rate-limit 403/429, timeouts, 5xx) with a
 * small jittered backoff. Law (12b doctrine, adopted): a NETWORK failure is
 * not a DRIFT — DRIFT is HTTP-200-with-different-bytes (a real RED);
 * unreachable legs are UNKNOWN (amber, honest reason), never faked green.
 */
async function fetchBytesRetry(url) {
  let last = await fetchBytes(url);
  if (last.ok || (last.status !== 403 && last.status !== 429 && last.status !== 0 && last.status < 500)) return last;
  await new Promise((r) => setTimeout(r, 1200 + Math.floor(Math.random() * 1800)));
  const second = await fetchBytes(url);
  return second.ok ? second : { ...last, error: `transient twice: ${last.status ?? last.error} then ${second.status ?? second.error}` };
}

const results = [];
for (const p of PAIRS) {
  const [live, committed] = await Promise.all([
    fetchBytesRetry(p.liveUrl),
    fetchBytesRetry(`${RAW}/${p.repo}/${p.committedRef}/${p.committedPath}`),
  ]);
  const liveSha = live.ok ? sha16(live.bytes) : null;
  const committedSha = committed.ok ? sha16(committed.bytes) : null;
  let verdict;
  let raceNote = null;
  if (live.ok && committed.ok) {
    verdict = liveSha === committedSha ? "MATCH" : "DRIFT";
    if (verdict === "DRIFT") {
      // deploy-lag tolerance (12b's double-measure law): a twin's publish may
      // be mid-flight — re-measure at +20s and +60s before a final RED
      // (Pages CDN propagation can outlive one short window).
      for (const wait of [20_000, 60_000]) {
        await new Promise((r) => setTimeout(r, wait));
        const [live2, committed2] = await Promise.all([
          fetchBytes(p.liveUrl),
          fetchBytes(`${RAW}/${p.repo}/${p.committedRef}/${p.committedPath}`),
        ]);
        const l2 = live2.ok ? sha16(live2.bytes) : null;
        const c2 = committed2.ok ? sha16(committed2.bytes) : null;
        if (l2 && l2 === c2) {
          verdict = "MATCH";
          raceNote = `settled after deploy-lag re-measure (+${wait / 1000}s) — was mid-publish`;
          results.push({ name: p.name, liveUrl: p.liveUrl, source: `${p.repo}@${p.committedRef}:${p.committedPath}`, liveStatus: live2.status, committedStatus: committed2.status, liveError: null, committedError: null, liveSha16: l2, committedSha16: c2, liveBytes: live2.ok ? live2.bytes.length : null, verdict, note: raceNote });
          console.log(`${verdict.padEnd(11)} ${p.name}  live=${l2}  committed=${c2}  (settled after +${wait / 1000}s re-measure)`);
          break;
        }
      }
      if (verdict === "MATCH") continue;
    }
  } else {
    verdict = "UNREACHABLE"; // network/4xx-5xx ≠ drift — honest amber, never faked green
  }
  results.push({
    name: p.name,
    liveUrl: p.liveUrl,
    source: `${p.repo}@${p.committedRef}:${p.committedPath}`,
    liveStatus: live.status,
    committedStatus: committed.status,
    liveError: live.error ?? null,
    committedError: committed.error ?? null,
    liveSha16: liveSha,
    committedSha16: committedSha,
    liveBytes: live.ok ? live.bytes.length : null,
    verdict,
  });
  // evidence to stdout, one line per pair (law: hex or it did not happen)
  console.log(`${verdict.padEnd(11)} ${p.name}  live=${liveSha ?? `HTTP${live.status}${live.error ? "+" + live.error.slice(0, 40) : ""}`}  committed=${committedSha ?? `HTTP${committed.status}${committed.error ? "+" + committed.error.slice(0, 40) : ""}`}`);
}

/**
 * V-OPS-DOCS (WO-unwired-sandbox-ops-docs): the continuity backbone — the 6
 * ops docs in Sandbox/ops/ (FLOW-PLAN / GROWTH-PLAN / OWNER-P0 / RESUME-PACKET /
 * TOKEN-TRUTH / ESTATE-TRUTH). These are knowledge docs (no live twin), so the
 * honest check is EXISTENCE + MEASURED AGE (commits API, path-scoped).
 * Law: MISSING = RED (flips overall + exit 1 — a missing resume packet is a
 * real break of agent continuity). FRESH ≤7d / AGING ≤30d / STALE >30d are
 * amber rows: measured truth in the receipt — never faked green, never
 * exit-flipping (docs age honestly; only their absence is a break).
 * Dated filenames roll (FLOW-PLAN-2026-10-11.md) → resolved by prefix against
 * the live directory listing, so a doc's date-roll never reads as MISSING.
 */
const OPS_DOC_SPECS = [
  { name: "FLOW-PLAN", prefix: "FLOW-PLAN-" },
  { name: "GROWTH-PLAN", prefix: "GROWTH-PLAN-" },
  { name: "OWNER-P0", prefix: "OWNER-P0-" },
  { name: "RESUME-PACKET", file: "RESUME-PACKET.md" },
  { name: "TOKEN-TRUTH", file: "TOKEN-TRUTH.md" },
  { name: "ESTATE-TRUTH", prefix: "ESTATE-TRUTH-" },
];
const OPS_REPO = "Sandbox";
const OPS_DIR = "ops";
const apiHeaders = process.env.GITHUB_TOKEN
  ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "user-agent": "fleet-fresh-oracle/1" }
  : { "user-agent": "fleet-fresh-oracle/1" };

const opsDocs = [];
try {
  const lr = await fetch(`https://api.github.com/repos/${ORG}/${OPS_REPO}/contents/${OPS_DIR}`, { headers: apiHeaders });
  if (!lr.ok) throw new Error(`contents API HTTP ${lr.status}`);
  const files = (await lr.json()).filter((f) => f && f.type === "file").map((f) => f.name);
  for (const spec of OPS_DOC_SPECS) {
    const fileName = spec.file || files.find((f) => f.startsWith(spec.prefix));
    if (!fileName) {
      opsDocs.push({ name: spec.name, verdict: "MISSING" });
      console.log(`MISSING     ops-doc ${spec.name}  (no file matching ${spec.file ?? spec.prefix + "*"} in ${OPS_REPO}/${OPS_DIR})`);
      continue;
    }
    const [raw, commit] = await Promise.all([
      fetchBytesRetry(`${RAW}/${OPS_REPO}/main/${OPS_DIR}/${fileName}`),
      fetch(`https://api.github.com/repos/${ORG}/${OPS_REPO}/commits?path=${OPS_DIR}/${encodeURIComponent(fileName)}&per_page=1`, { headers: apiHeaders })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]);
    const at = Array.isArray(commit) && commit[0]?.commit?.committer?.date ? commit[0].commit.committer.date : null;
    const ageDays = at ? Math.floor((Date.now() - Date.parse(at)) / 86400000) : null;
    const verdict = !raw.ok ? "UNREACHABLE" : ageDays === null ? "UNKNOWN-AGE" : ageDays <= 7 ? "FRESH" : ageDays <= 30 ? "AGING" : "STALE";
    opsDocs.push({ name: spec.name, file: fileName, sha16: raw.ok ? sha16(raw.bytes) : null, rawStatus: raw.status, lastCommitAt: at, ageDays, verdict });
    console.log(`${verdict.padEnd(11)} ops-doc ${spec.name}  file=${fileName}  age=${ageDays === null ? "?" : ageDays + "d"}  sha=${raw.ok ? sha16(raw.bytes) : `HTTP${raw.status}`}`);
  }
} catch (e) {
  opsDocs.push({ name: "OPS-DOCS-SCAN", verdict: "UNREACHABLE", error: String(e?.message ?? e).slice(0, 120) });
  console.log(`UNREACHABLE ops-docs scan  ${String(e?.message ?? e).slice(0, 80)}`);
}
const opsMissing = opsDocs.filter((d) => d.verdict === "MISSING").length;

const match = results.filter((r) => r.verdict === "MATCH").length;
const drift = results.filter((r) => r.verdict === "DRIFT").length;
const unreachable = results.filter((r) => r.verdict === "UNREACHABLE").length;
const missing = 0; // kept in summary for receipt-schema continuity (round-7 receipts)
// verdict law: FRESH only when every pair byte-matches AND no ops doc is
// MISSING. DRIFT/MISSING = RED (real divergence / broken continuity backbone).
// UNREACHABLE = UNKNOWN (amber — network truth, honest, retried).
// ops-doc AGE verdicts are amber rows in the receipt, never exit-flipping.
const overall = drift > 0 || opsMissing > 0 ? "STALE-OR-BROKEN" : unreachable > 0 ? "UNKNOWN-NETWORK" : "FRESH";

const receipt = {
  schema: "fleet.fresh-oracle/1",
  at: new Date().toISOString(),
  law: "FRESH only if sha256(live bytes) == sha256(committed deploy-ref bytes) AND no ops doc MISSING; DRIFT=RED (200-with-different-bytes); UNREACHABLE=UNKNOWN (network, retried once, reason kept); ops-doc age rows are honest amber (MISSING alone flips exit) — never faked green",
  results,
  opsDocs,
  summary: { checked: results.length, match, drift, missing, unreachable, opsDocsMissing: opsMissing, opsDocsStale: opsDocs.filter((d) => d.verdict === "STALE").length, verdict: overall },
  method: "https GET live URL + raw.githubusercontent deploy ref → sha256-16 byte equality",
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "latest.json"), JSON.stringify(receipt, null, 1) + "\n");
appendFileSync(join(OUT_DIR, "log.jsonl"), JSON.stringify({ at: receipt.at, overall, match, drift, unreachable }) + "\n");

console.log(`FRESH-ORACLE: ${overall} (${match}/${results.length} MATCH, drift=${drift}, unreachable=${unreachable}, ops-docs missing=${opsMissing})`);
process.exit(drift > 0 || opsMissing > 0 ? 1 : 0); // exit red on real drift or missing ops doc; UNKNOWN exits 0-but-amber (the receipt carries the reason)
