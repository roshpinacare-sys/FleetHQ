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

const results = [];
for (const p of PAIRS) {
  const [live, committed] = await Promise.all([
    fetchBytes(p.liveUrl),
    fetchBytes(`${RAW}/${p.repo}/${p.committedRef}/${p.committedPath}`),
  ]);
  const liveSha = live.ok ? sha16(live.bytes) : null;
  const committedSha = committed.ok ? sha16(committed.bytes) : null;
  let verdict;
  if (!live.ok || !committed.ok) verdict = "MISSING";
  else if (liveSha === committedSha) verdict = "MATCH";
  else verdict = "DRIFT";
  results.push({
    name: p.name,
    liveUrl: p.liveUrl,
    source: `${p.repo}@${p.committedRef}:${p.committedPath}`,
    liveStatus: live.status,
    committedStatus: committed.status,
    liveSha16: liveSha,
    committedSha16: committedSha,
    liveBytes: live.ok ? live.bytes.length : null,
    verdict,
  });
  // evidence to stdout, one line per pair (law: hex or it did not happen)
  console.log(`${verdict.padEnd(7)} ${p.name}  live=${liveSha ?? `HTTP${live.status}`}  committed=${committedSha ?? `HTTP${committed.status}`}`);
}

const match = results.filter((r) => r.verdict === "MATCH").length;
const drift = results.filter((r) => r.verdict === "DRIFT").length;
const missing = results.filter((r) => r.verdict === "MISSING").length;
const overall = drift === 0 && missing === 0 && match === results.length ? "FRESH" : "STALE-OR-BROKEN";

const receipt = {
  schema: "fleet.fresh-oracle/1",
  at: new Date().toISOString(),
  law: "live page is FRESH only if sha256(live bytes) == sha256(committed deploy-ref bytes); drift/missing = RED",
  results,
  summary: { checked: results.length, match, drift, missing, verdict: overall },
  method: "https GET live URL + raw.githubusercontent deploy ref → sha256-16 byte equality",
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "latest.json"), JSON.stringify(receipt, null, 1) + "\n");
appendFileSync(join(OUT_DIR, "log.jsonl"), JSON.stringify({ at: receipt.at, overall, match, drift, missing }) + "\n");

console.log(`FRESH-ORACLE: ${overall} (${match}/${results.length} MATCH, drift=${drift}, missing=${missing})`);
process.exit(overall === "FRESH" ? 0 : 1);
