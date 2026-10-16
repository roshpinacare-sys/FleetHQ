#!/usr/bin/env node
/**
 * office-pulse (zai-code-3, E-series) - the office window engine.
 * Measures the Fleet HQ office + the network arteries from PUBLIC APIs only.
 * Zero secrets, zero LLM, deterministic. Any source that fails is recorded
 * as an error in the book - never faked, never skipped silently.
 * Owner mandate: the office opens first on the page, then the network;
 * the page must be alive, not a stale brochure.
 */
"use strict";
const fs = require("fs");

const OWNER = "roshpinacare-sys";
const FHQ = `${OWNER}/FleetHQ`;
const SBX = `${OWNER}/Sandbox`;
const RUN = `${OWNER}/saos-runtime`;

// freshness law (minutes) - one block, all measured against it
const FRESH = {
  officePush: 60 * 24 * 2, // office repo pushed <= 48h
  officeCi: 60 * 26,       // office-ci PASS <= 26h (daily backstop)
  artery: 180,             // wallet/fleet arteries <= 3h
  grid: 90,                // grid artery <= 90min (its own cadence)
  tick: 60,                // sovereign tick <= 1h
  runtime: 90,             // saos-runtime heartbeat success <= 90min
};
const HALF_LIFE = {
  officePush: 60 * 24 * 7,
  artery: 60 * 24 * 2,
  grid: 60 * 12,
  tick: 60 * 6,
  runtime: 60 * 6,
  officeCi: 60 * 24 * 3,
};

const now = Date.now();
const ageMin = (iso) => (iso ? Math.round((now - new Date(iso).getTime()) / 60000) : null);
const H = { "User-Agent": "office-pulse", Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) H.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function gh(path) {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const r = await fetch(url, { headers: H, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path.replace(/^https?:\/\/[^/]+/, "")}`);
  return r.json();
}
async function raw(repo, path, branch = "main") {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  const r = await fetch(url + `?t=${Date.now()}`, { headers: { "User-Agent": "office-pulse" }, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} raw:${path}`);
  return r.text();
}
async function safeJson(repo, path) {
  try { return JSON.parse(await raw(repo, path)); } catch (e) { return { __error: String(e.message || e) }; }
}
const ok = (o) => !(o && o.__error);

function fmtWire(commits) {
  return (commits || []).slice(0, 6).map((c) => ({
    sha: (c.sha || "").slice(0, 7),
    msg: String((c.commit && c.commit.message) || "").split("\n")[0].slice(0, 90),
    at: c.commit && c.commit.author && c.commit.author.date,
    ageMin: ageMin(c.commit && c.commit.author && c.commit.author.date),
    author: c.commit && c.commit.author && c.commit.author.name,
  }));
}

function parseWorklog(text) {
  const lines = (text || "").split("\n");
  const ids = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^Task ID:\s*(.+?)\s*$/.exec(lines[i]);
    if (m) {
      let title = "";
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const t = /^Task:\s*(.+?)\s*$/.exec(lines[j]);
        if (t) { title = t[1].slice(0, 120); break; }
      }
      ids.push({ id: m[1].slice(0, 40), title });
    }
  }
  return { tasks: ids.length, last: ids.slice(-3).reverse() };
}

(async () => {
  const sources = {};
  const degraded = [];

  // ---- the office: FleetHQ ----
  let office = { __error: "not measured" };
  try {
    const [repo, commits, wlCommits] = await Promise.all([
      gh(`/repos/${FHQ}`),
      gh(`/repos/${FHQ}/commits?per_page=14`),
      gh(`/repos/${FHQ}/commits?path=worklog.md&per_page=1`),
    ]);
    const [worklogText, boot, ci] = await Promise.all([
      raw(FHQ, "worklog.md").catch(() => null),
      safeJson(FHQ, "receipts/boot-verify.json"),
      safeJson(FHQ, "receipts/office-ci/verdict.json"),
    ]);
    const wl = worklogText ? parseWorklog(worklogText) : { tasks: 0, last: [], __error: "worklog fetch failed" };
    const pushAge = ageMin(repo.pushed_at);
    office = {
      repo: FHQ,
      pushedAt: repo.pushed_at,
      pushedAgeMin: pushAge,
      openIssues: repo.open_issues_count,
      wire: fmtWire(commits),
      worklog: wl,
      worklogLastTouchAgeMin: wlCommits[0] ? ageMin(wlCommits[0].commit && wlCommits[0].commit.author && wlCommits[0].commit.author.date) : null,
      boot: ok(boot)
        ? { at: boot.at, ageMin: ageMin(boot.at), office: (boot.checks && boot.checks.office) || null, allOk: boot.all_ok }
        : { error: boot.__error },
      ci: ok(ci)
        ? { overall: ci.overall, at: ci.at, ageMin: ageMin(ci.at), reason: ci.reason, runUrl: ci.provenance && ci.provenance.runUrl, checks: ci.checks }
        : { pending: "first office-ci receipt not landed yet", error: ci.__error },
    };
    sources.fleetHQ = "ok";
  } catch (e) {
    office = { __error: String(e.message || e) };
    sources.fleetHQ = "error";
    degraded.push("fleetHQ");
  }

  // ---- arteries: Sandbox receipts (public) ----
  const artery = {};
  const arteryFiles = {
    wallet: ["receipts/wallet/verdict.json", "at", "overall"],
    grid: ["receipts/grid/verdict.json", "measuredAt", "overall"],
    fleet: ["receipts/fleet/verdict.json", "measuredAt", "overall"],
    tick: ["receipts/latest.json", "at", null],
  };
  for (const [k, [path, atKey, verdictKey]] of Object.entries(arteryFiles)) {
    try {
      const j = await safeJson(SBX, path);
      if (!ok(j)) throw new Error(j.__error);
      const at = atKey && j[atKey] ? j[atKey] : (j.at || null);
      artery[k] = {
        at,
        ageMin: ageMin(at),
        overall: verdictKey ? j[verdictKey] : undefined,
        alerts: Array.isArray(j.alerts) ? j.alerts.length : undefined,
        chain: j.chain ? String(j.chain).slice(0, 12) : undefined,
        runUrl: j.provenance && j.provenance.runUrl,
      };
      sources[`sbx-${k}`] = "ok";
    } catch (e) {
      artery[k] = { __error: String(e.message || e) };
      sources[`sbx-${k}`] = "error";
      degraded.push(k);
    }
  }

  // ---- runtime heartbeat: saos-runtime ----
  let runtime = { __error: "not measured" };
  try {
    const runs = await gh(`/repos/${RUN}/actions/runs?per_page=8`);
    const done = (runs.workflow_runs || []).filter((r) => r.status === "completed");
    const succ = done.find((r) => r.conclusion === "success");
    runtime = {
      lastSuccessAt: succ ? succ.run_started_at || succ.created_at : null,
      lastSuccessAgeMin: succ ? ageMin(succ.run_started_at || succ.created_at) : null,
      lastSuccessName: succ ? succ.name : null,
      lastConclusion: done[0] ? done[0].conclusion : null,
    };
    sources.runtime = "ok";
  } catch (e) {
    runtime = { __error: String(e.message || e) };
    sources.runtime = "error";
    degraded.push("runtime");
  }

  // ---- verdict law (measurable, printed in the reason) ----
  const checks = [];
  const push = (name, freshLimit, halfLimit, age) => {
    if (age == null) { checks.push({ name, state: "unknown", detail: "age not measured" }); return; }
    if (age <= freshLimit) checks.push({ name, state: "fresh", detail: `${age}min <= ${freshLimit}min` });
    else if (age <= halfLimit) checks.push({ name, state: "aging", detail: `${age}min <= ${halfLimit}min` });
    else checks.push({ name, state: "stale", detail: `${age}min > ${halfLimit}min` });
  };
  push("office-push", FRESH.officePush, HALF_LIFE.officePush, office.pushedAgeMin);
  if (office.ci && office.ci.overall) push("office-ci", FRESH.officeCi, HALF_LIFE.officeCi, office.ci.ageMin);
  else checks.push({ name: "office-ci", state: "pending", detail: office.ci && office.ci.error ? office.ci.error : "no receipt yet" });
  push("wallet-artery", FRESH.artery, HALF_LIFE.artery, artery.wallet && artery.wallet.ageMin);
  push("grid-artery", FRESH.grid, HALF_LIFE.grid, artery.grid && artery.grid.ageMin);
  push("fleet-artery", FRESH.artery, HALF_LIFE.artery, artery.fleet && artery.fleet.ageMin);
  push("sovereign-tick", FRESH.tick, HALF_LIFE.tick, artery.tick && artery.tick.ageMin);
  push("runtime-heartbeat", FRESH.runtime, HALF_LIFE.runtime, runtime.lastSuccessAgeMin);

  const states = checks.map((c) => c.state);
  const stale = states.filter((s) => s === "stale" || s === "unknown").length;
  const aging = states.filter((s) => s === "aging" || s === "pending").length;
  const verdict = stale === 0 && aging === 0 ? "ALIVE" : stale === 0 ? "AGING" : "STALE";

  const book = {
    schema: "office.pulse/1",
    generatedAt: new Date().toISOString(),
    generatedAgeNote: "this file is rewritten by the office-pulse workflow; judge freshness by generatedAt",
    verdict,
    verdictChecks: checks,
    degraded,
    sources,
    office,
    arteries: artery,
    runtime,
  };
  fs.mkdirSync("office", { recursive: true });
  fs.writeFileSync("office/data.json", JSON.stringify(book, null, 1) + "\n");
  console.log(`office-pulse: ${verdict} (stale=${stale} aging=${aging} degraded=${degraded.length}) -> office/data.json`);
})().catch((e) => {
  // fail-closed honesty: even a total crash must land a marked book, never silence
  try {
    fs.mkdirSync("office", { recursive: true });
    fs.writeFileSync(
      "office/data.json",
      JSON.stringify({ schema: "office.pulse/1", generatedAt: new Date().toISOString(), verdict: "STALE", fatal: String((e && e.message) || e), degraded: ["all"] }, null, 1) + "\n"
    );
    console.error("office-pulse FATAL (marked in book):", e && e.message);
    process.exit(1);
  } catch (e2) {
    console.error("office-pulse FATAL and book write failed:", e2 && e2.message);
    process.exit(1);
  }
});
