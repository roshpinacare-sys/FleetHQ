#!/usr/bin/env node
// evolution-digest — T10 perpetual learning loop (master plan, 2026-10-11)
// Daily self-examination of the fleet, entirely on GitHub infrastructure:
//   1. Actions runs of the 4 live repos (yesterday) — throughput + success rate
//   2. Economics: Domain pnl-book + public pulse + Console honest-econ
//   3. Exposure re-check: P0-1 purge regression probe (must stay clean)
//   4. Content dedupe: latest content-review report (dup pairs must be 0)
// Writes learning/evolution-<date>.json, appends learning/ledger.jsonl,
// commits (skip ci). SLO breach → gh issue (deduped per day).
// Runs on schedule; no sandbox, no local machine — GitHub only.
import { execSync } from "node:child_process";
import { writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";

const OWNER = "roshpinacare-sys";
const REPOS = ["Domain", "Console", "Sandbox", "saos-runtime"];
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const H = TOKEN ? { Authorization: `token ${TOKEN}`, Accept: "application/vnd.github+json" } : { Accept: "application/vnd.github+json" };

async function jget(url, ms = 15000) {
  const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 90)}`);
  return r.json();
}
async function raw(repo, path) {
  const r = await fetch(`https://raw.githubusercontent.com/${OWNER}/${repo}/main/${path}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}
const day = (d) => d.toISOString().slice(0, 10);

const now = new Date();
const yest = new Date(now.getTime() - 86400e3);
const digest = { at: now.toISOString(), window: { from: day(yest), to: day(now) }, sections: {}, slos: [] };
const slos = digest.slos;
function slo(id, name, ok, detail) { slos.push({ id, name, ok, detail }); }

// 1) Actions throughput
digest.sections.runs = {};
for (const repo of REPOS) {
  try {
    const runs = await jget(`https://api.github.com/repos/${OWNER}/${repo}/actions/runs?per_page=100&created=${day(yest)}..${day(now)}`);
    const list = runs?.workflow_runs || [];
    const hist = {};
    for (const x of list) hist[x.conclusion || x.status] = (hist[x.conclusion || x.status] || 0) + 1;
    digest.sections.runs[repo] = { count: runs?.total_count ?? null, sampled: list.length, hist };
  } catch (e) { digest.sections.runs[repo] = { error: String(e).slice(0, 80) }; }
}

// 2) economics
digest.sections.econ = {};
try {
  const pnl = await raw("Domain", "agents/pnl-book.json");
  digest.sections.econ.pnlBook = pnl ? { realized: pnl.realizedSbd ?? pnl.realized ?? null, edge: pnl.edge ?? pnl.edgePct ?? null, verdict: pnl.verdict ?? null, fields: Object.keys(pnl).slice(0, 12) } : { missing: true };
} catch (e) { digest.sections.econ.pnlBook = { error: String(e).slice(0, 80) }; }
try {
  const pulse = await raw("Domain", "public/pulse.json");
  digest.sections.econ.pulse = pulse ? { realizedUsd: pulse?.econ?.realizedUsd ?? pulse?.realizedUsd ?? null } : { missing: true };
} catch {}
try {
  const he = await raw("Console", "dex/honest-econ.json");
  digest.sections.econ.honestEcon = he ? { realChainMarkedUsd: he?.realChain?.markedUsd ?? null, saosExternalBid: he?.saosExternalBid?.exists ?? null } : { missing: true };
} catch {}

// 3) exposure regression probe (P0-1 must stay clean)
const probePaths = {
  Domain: ["agent/inspections/INS-R66-001.json", "receipts/key-check.json", "about/team.json"],
  TruthRail: ["receipts/sovereign-bootstrap-20261008-190743.json", "receipts/blurt-gen2-rotation-2026-10-08.json"],
  FleetHQ: ["vault/ssh-keys.tar.enc", "vault/keys.env.enc"],
  "sovereign-lighthouse": ["state.json"],
  "sovereign-beacon": ["state.json"],
};
digest.sections.exposure = { regressions: [], probes: {} };
for (const [repo, paths] of Object.entries(probePaths)) {
  for (const p of paths) {
    const r = await fetch(`https://raw.githubusercontent.com/${OWNER}/${repo}/main/${p}`, { signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const body = await r.text();
      if (p === "state.json") {
        digest.sections.exposure.probes[`${repo}/${p}`] = body.includes("[REDACTED — P0-1") ? "redacted-ok" : "NOT-REDACTED";
        if (!body.includes("[REDACTED — P0-1")) digest.sections.exposure.regressions.push(`${repo}/${p} redaction missing`);
      } else {
        digest.sections.exposure.probes[`${repo}/${p}`] = "STILL-EXPOSED";
        digest.sections.exposure.regressions.push(`${repo}/${p} reappeared`);
      }
    } else digest.sections.exposure.probes[`${repo}/${p}`] = "clean";
  }
}
slo("P0-1", "no exposure regressions", digest.sections.exposure.regressions.length === 0, JSON.stringify(digest.sections.exposure.regressions));

// 4) content dedupe
try {
  const cr = await raw("Domain", `content-review/report-${day(now)}.json`) || await raw("Domain", `content-review/report-${day(yest)}.json`);
  const dup = cr?.topPairs?.filter((x) => (x.sim ?? 0) > 0.85).length ?? null;
  digest.sections.content = { report: cr ? "found" : "missing", highSimPairs: dup };
  if (dup !== null) slo("T3", "zero post pairs sim>0.85", dup === 0, `highSimPairs=${dup}`);
} catch (e) { digest.sections.content = { error: String(e).slice(0, 80) }; }

// SLO: heartbeat throughput
const domRuns = digest.sections.runs.Domain?.count ?? 0;
slo("T1", "Domain daily runs >= 30", domRuns >= 30, `runs=${domRuns}`);
const conRuns = digest.sections.runs.Console?.count ?? 0;
slo("T1", "Console daily runs >= 10", conRuns >= 10, `runs=${conRuns}`);
const rtRuns = digest.sections.runs["saos-runtime"]?.count ?? 0;
slo("T1", "saos-runtime daily runs >= 40 (self-pulse ~20min)", rtRuns >= 40, `runs=${rtRuns}`);

// verdict + files
digest.verdict = slos.every((s) => s.ok) ? "ALL-SLO-OK" : "SLO-BREACH";
const outPath = `learning/evolution-${day(now)}.json`;
writeFileSync(outPath, JSON.stringify(digest, null, 1) + "\n");
appendFileSync("learning/ledger.jsonl", JSON.stringify({ at: digest.at, verdict: digest.verdict, slos: slos.map((s) => `${s.id}:${s.ok ? 1 : 0}`) }) + "\n");
console.log(JSON.stringify({ verdict: digest.verdict, slos: slos.map((s) => ({ id: s.id, ok: s.ok, d: s.detail })) }, null, 1));

if (digest.verdict === "SLO-BREACH") {
  const gh = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (gh) {
    try {
      const list = JSON.parse(execSync(`gh issue list --search "evolution ${day(now)} in:title" --json number --limit 5`, { env: { ...process.env, GH_TOKEN: gh }, encoding: "utf8" }));
      if (!list.length) {
        const body = slos.filter((s) => !s.ok).map((s) => `- ${s.name}: ${s.detail}`).join("\n");
        execSync(`gh issue create --title "evolution: SLO breach ${day(now)}" --body ${JSON.stringify("Daily evolution digest found breaches:\n" + body + "\n\nDigest: learning/" + outPath.split("/").pop())}`, { env: { ...process.env, GH_TOKEN: gh }, stdio: "inherit" });
      }
    } catch (e) { console.error("issue creation skipped:", String(e).slice(0, 100)); }
  }
}
if (!existsSync("learning")) console.error("warning: learning dir missing");
if (process.argv.includes("--strict") && digest.verdict !== "ALL-SLO-OK") process.exit(1);
