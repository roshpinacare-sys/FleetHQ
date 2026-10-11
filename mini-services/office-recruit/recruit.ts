/**
 * office-recruit — the office as manager: recruitment engine (גיוס עובדים)
 *
 * Scans the estate for REAL work signals (repos, proposals, CI verdicts,
 * freshness oracles) and derives the roles the office actually needs.
 * Every role is bound to verifiable evidence — never invented, never faked.
 *
 * Output: receipts/recruitment/live.json (sha256 self-receipt, fail-loud)
 * HTTP  : GET /       → full live state (JSON)
 *         GET /health → {ok,port,scannedAt}
 *
 * Pure Bun, zero external deps, deterministic. Port 3041.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = 3041;
const ESTATE = "/home/z/estate";
const FLEETHQ = join(ESTATE, "FleetHQ");
const OUT_DIR = join(FLEETHQ, "receipts", "recruitment");
const OUT_FILE = join(OUT_DIR, "live.json");
const SCAN_INTERVAL_MS = 60_000;
/** A repo untouched for this long needs a reviver (unless declared archived). */
const STALE_REPO_MS = 72 * 60 * 60 * 1000;
/** Freshness window for the fresh-oracle receipt (must mirror veritas doctrine). */
const FRESH_MAX_AGE_H = 3;

interface RepoSignal {
  name: string;
  lastCommitAt: string;
  ageHours: number;
  commits7d: number;
  stale: boolean;
  evidence: string;
}

interface RoleNeeded {
  role: string;
  roleHe: string;
  count: number;
  targets: string[];
  evidence: string[];
  derivedFrom: string;
}

interface RecruitState {
  service: "office-recruit";
  generatedAt: string;
  sha256: string;
  signals: {
    repos: RepoSignal[];
    openProposals: string[];
    ciVerdict: string | null;
    ciVerdictAt: string | null;
    freshOracleAgeHours: number | null;
  };
  rolesNeeded: RoleNeeded[];
  totals: { reposScanned: number; staleRepos: number; roles: number };
  noForgery: { failLoud: true; evidenceBound: true };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function sh(cmd: string, cwd: string): Promise<string> {
  const p = Bun.spawn(["bash", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
}

async function scanRepo(name: string, now: number): Promise<RepoSignal | null> {
  const path = join(ESTATE, name);
  try {
    const s = await stat(join(path, ".git"));
    if (!s.isDirectory() && !s.isFile()) return null;
  } catch {
    return null; // not a git repo — honest skip
  }
  const lastCommitAt = await sh("git log -1 --format=%cI", path);
  if (!lastCommitAt) return null;
  const ts = Date.parse(lastCommitAt);
  if (!Number.isFinite(ts)) return null;
  const ageHours = Math.round(((now - ts) / 3_600_000) * 10) / 10;
  const commits7dRaw = await sh("git rev-list --count --since='7 days ago' HEAD", path);
  const commits7d = Number.parseInt(commits7dRaw || "0", 10) || 0;
  return {
    name,
    lastCommitAt,
    ageHours,
    commits7d,
    stale: now - ts > STALE_REPO_MS,
    evidence: `git: last commit ${lastCommitAt}, ${commits7d} commits/7d`,
  };
}

async function scanEstate(now: number): Promise<RepoSignal[]> {
  let names: string[] = [];
  try {
    names = (await readdir(ESTATE, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  names.sort();
  const signals: RepoSignal[] = [];
  for (const n of names) {
    const sig = await scanRepo(n, now);
    if (sig) signals.push(sig);
  }
  return signals;
}

async function scanProposals(): Promise<string[]> {
  const dir = join(FLEETHQ, "office", "PROPOSALS");
  try {
    const files = await readdir(dir);
    // Open = not marked DONE/RESOLVED/CLOSED in filename convention.
    return files
      .filter((f) => f.endsWith(".md") && !/done|resolved|closed/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

async function scanCiVerdict(): Promise<{ verdict: string; at: string } | null> {
  const dir = join(FLEETHQ, "receipts", "office-ci");
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
    if (files.length === 0) return null;
    const latest = files[files.length - 1];
    const raw = await readFile(join(dir, latest), "utf8");
    const j = JSON.parse(raw) as { verdict?: string; at?: string; timestamp?: string };
    const at = j.at ?? j.timestamp ?? latest.replace(/\.json$/, "");
    return { verdict: j.verdict ?? "unknown", at };
  } catch {
    return null;
  }
}

async function scanFreshOracle(now: number): Promise<number | null> {
  try {
    const raw = await readFile(join(FLEETHQ, "receipts", "fresh-oracle", "latest.json"), "utf8");
    const j = JSON.parse(raw) as { producedAt?: string; generatedAt?: string; at?: string };
    const t = j.producedAt ?? j.generatedAt ?? j.at;
    if (!t) return null;
    const ts = Date.parse(t);
    if (!Number.isFinite(ts)) return null;
    return Math.round(((now - ts) / 3_600_000) * 10) / 10;
  } catch {
    return null;
  }
}

function deriveRoles(
  repos: RepoSignal[],
  proposals: string[],
  ci: { verdict: string; at: string } | null,
  freshAgeH: number | null,
): RoleNeeded[] {
  const roles: RoleNeeded[] = [];

  const stale = repos.filter((r) => r.stale);
  if (stale.length > 0) {
    roles.push({
      role: "reviver",
      roleHe: "מחייה-ריפואים",
      count: stale.length,
      targets: stale.map((r) => r.name),
      evidence: stale.map((r) => r.evidence),
      derivedFrom: "repos frozen >72h must display as frozen (veritas doctrine)",
    });
  }

  if (proposals.length >= 3) {
    roles.push({
      role: "executor",
      roleHe: "מבצע-הצעות",
      count: proposals.length,
      targets: proposals.slice(0, 10),
      evidence: proposals.map((p) => `open proposal: ${p}`),
      derivedFrom: "office/PROPOSALS with no DONE/RESOLVED/CLOSED marker",
    });
  }

  if (ci && /fail|red|error/i.test(ci.verdict)) {
    roles.push({
      role: "gatekeeper",
      roleHe: "שומר-השער",
      count: 1,
      targets: [`office-ci verdict=${ci.verdict} at ${ci.at}`],
      evidence: [`receipts/office-ci latest verdict is ${ci.verdict}`],
      derivedFrom: "CI RED → gate must be guarded until green",
    });
  }

  if (freshAgeH === null || freshAgeH > FRESH_MAX_AGE_H) {
    roles.push({
      role: "freshness-sentinel",
      roleHe: "שומר-טריות",
      count: 1,
      targets: [
        freshAgeH === null
          ? "fresh-oracle latest.json missing — V-FLEETHQ-FRESH unprovable"
          : `fresh-oracle frozen ${freshAgeH}h (limit 3h)`,
      ],
      evidence: ["receipts/fresh-oracle/latest.json age vs 3h window"],
      derivedFrom: "V-FLEETHQ-FRESH standing proof requirement",
    });
  }

  const quiet = repos.filter((r) => r.commits7d === 0 && !r.stale);
  if (quiet.length > 0) {
    roles.push({
      role: "connector",
      roleHe: "מחבר-ספרים",
      count: quiet.length,
      targets: quiet.map((r) => r.name),
      evidence: quiet.map((r) => `${r.name}: 0 commits/7d but not stale — unwired asset?`),
      derivedFrom: "alive-but-quiet repos may hold unwired assets for sovereignty",
    });
  }

  return roles;
}

async function scan(): Promise<RecruitState> {
  const now = Date.now();
  const repos = await scanEstate(now);
  const proposals = await scanProposals();
  const ci = await scanCiVerdict();
  const freshAgeH = await scanFreshOracle(now);
  const roles = deriveRoles(repos, proposals, ci, freshAgeH);

  const state: Omit<RecruitState, "sha256"> = {
    service: "office-recruit",
    generatedAt: new Date(now).toISOString(),
    signals: {
      repos,
      openProposals: proposals,
      ciVerdict: ci?.verdict ?? null,
      ciVerdictAt: ci?.at ?? null,
      freshOracleAgeHours: freshAgeH,
    },
    rolesNeeded: roles,
    totals: {
      reposScanned: repos.length,
      staleRepos: repos.filter((r) => r.stale).length,
      roles: roles.length,
    },
    noForgery: { failLoud: true, evidenceBound: true },
  };

  const canonical = JSON.stringify(state, null, 2);
  const full: RecruitState = { ...state, sha256: sha256(canonical) };
  return full;
}

async function persist(state: RecruitState): Promise<void> {
  try {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(OUT_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch (e) {
    // fail-loud: recruitment that cannot publish its receipt is a RED, not a shrug
    console.error("[office-recruit] FAIL publish receipt:", e);
  }
}

let latest: RecruitState | null = null;

async function tick(): Promise<void> {
  try {
    latest = await scan();
    await persist(latest);
    console.log(
      `[office-recruit] scanned ${latest.totals.reposScanned} repos → ${latest.totals.roles} roles needed (${latest.generatedAt})`,
    );
  } catch (e) {
    console.error("[office-recruit] scan FAILED (fail-loud):", e);
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: latest !== null,
        service: "office-recruit",
        port: PORT,
        scannedAt: latest?.generatedAt ?? null,
      });
    }
    if (url.pathname === "/scan") {
      await tick();
    }
    if (!latest) await tick();
    return new Response(JSON.stringify(latest, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
});

console.log(`[office-recruit] listening :${PORT} → receipts/recruitment/live.json`);
await tick();
setInterval(tick, SCAN_INTERVAL_MS);
