#!/usr/bin/env node
// git-health — THE REPO-LEVEL VITALS CHECK (boot stage + selfcheck step).
//
// 26-b backlog P0: a wipe-recovery clone can come back detached (races have
// left repos on detached HEAD before — the 25-d twin-race ledger), object
// stores can rot silently, and divergence drifts while nobody looks. This
// tool asserts, per estate repo (Console / Domain / FleetHQ):
//   · headAttached — `git symbolic-ref -q HEAD` exits 0 (attached, not detached)
//   · ahead/behind — vs origin/main after a real fetch (same measure flush.sh
//     and the watchdog's divergence voice speak)
//   · fsck — `git fsck --no-dangling --connectivity-only`, bounded at 60s per
//     repo (Domain's object store is the big one; a bound keeps boot fast)
// Receipt: $ESTATE/FleetHQ/receipts/git-health.json {schema, at, repos:
// [{name, headAttached, ahead, behind, fsck}]} — the receipts dir is created
// if missing.
// Exit: 0 all healthy · 1 any repo detached, fsck-unhealthy, or unmeasurable
// (fail-loud; callers scope their own set +e / non-fatal handling).
//
// Run: node tools/git-health.mjs [ESTATE_DIR]

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ESTATE = process.argv[2] || "/home/z/estate";
const FLEETHQ = join(ESTATE, "FleetHQ");
const OUT = join(FLEETHQ, "receipts", "git-health.json");
const FSCK_TIMEOUT_MS = 60_000;

const g = (args, opts = {}) =>
  execFileSync("git", args, { encoding: "utf8", timeout: opts.timeout ?? 30_000, cwd: opts.cwd, stdio: ["ignore", "pipe", "ignore"] }).trim();
// safe run: returns {ok, out} — a non-zero exit (e.g. detached HEAD answering
// `symbolic-ref -q` with exit 1) is a MEASUREMENT, not an exception.
const safe = (args, opts = {}) => {
  try { return { ok: true, out: g(args, opts) }; } catch (e) { return { ok: false, out: String(e && e.message ? e.message : e) }; }
};

const receipt = { schema: "git.health/1", at: new Date().toISOString(), repos: [] };
let unhealthy = 0;

for (const name of ["Console", "Domain", "FleetHQ"]) {
  const dir = join(ESTATE, name);
  const row = { name, headAttached: false, ahead: null, behind: null, fsck: "unmeasurable" };
  try {
    g(["rev-parse", "--git-dir"], { cwd: dir }); // throws when the clone is absent/mangled
    // detached HEAD: `symbolic-ref -q` exits 1 — that is the assertion failing,
    // recorded as headAttached:false (not as a tool error)
    const sr = safe(["symbolic-ref", "-q", "HEAD"], { cwd: dir });
    row.headAttached = sr.ok && sr.out.length > 0;
    const fetched = safe(["fetch", "-q", "origin", "main"], { cwd: dir });
    const ab = fetched.ok ? safe(["rev-list", "--left-right", "--count", "HEAD...origin/main"], { cwd: dir }) : { ok: false, out: "fetch-failed" };
    if (ab.ok) {
      const [a, b] = ab.out.split(/\s+/).map(Number);
      row.ahead = a || 0;
      row.behind = b || 0;
    }
    const fk = safe(["fsck", "--no-dangling", "--connectivity-only"], { cwd: dir, timeout: FSCK_TIMEOUT_MS });
    row.fsck = fk.ok ? "ok" : (String(fk.out).includes("timed out") ? "timeout(60s)" : "fail");
  } catch (e) {
    row.fsck = "error: " + String(e && e.message ? e.message : e).slice(0, 60);
  }
  if (!row.headAttached || row.ahead == null || row.fsck !== "ok") unhealthy++;
  receipt.repos.push(row);
  console.log(`git-health: ${name} attached=${row.headAttached} ahead=${row.ahead} behind=${row.behind} fsck=${row.fsck}`);
}

mkdirSync(join(FLEETHQ, "receipts"), { recursive: true });
writeFileSync(OUT, JSON.stringify(receipt, null, 1) + "\n");
console.log(`GIT-HEALTH: ${unhealthy === 0 ? "ALL REPOS HEALTHY" : unhealthy + " REPO(S) UNHEALTHY"} · receipt receipts/git-health.json`);
process.exit(unhealthy === 0 ? 0 : 1);
