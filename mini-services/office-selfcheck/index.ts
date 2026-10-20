/**
 * office-selfcheck — the office trains and checks itself, standing loop.
 * (zai-14, owner trace 1a12…7d71: [owner-directive] — self-train and self-check without trusting claims; turn descriptions into autonomous sovereign deeds)
 *
 * What it does (every 30 min + once at boot):
 *   1. BOOT: ensures the FleetHQ office app is live (:3002) and the foreman
 *      socket is live (:3010) — spawning them detached if down, and POINTING
 *      THE FOREMAN AT THE REAL BOOKS (/home/z/estate/Domain — the actual
 *      agents/ + truth/ data, not a demo, not a stale path). The office must
 *      always work: children are left running, never torn down.
 *   2. CHECK: runs the three standing proofs, fail-loud:
 *        a. security-regression  (the secret-gate suite, sections A–J, against
 *           the LIVE boot — synthetic credentials only)
 *        b. connectivity-audit   (the office asks what is NOT connected)
 *        c. fresh-oracle         (public surfaces byte-equal to deploy refs)
 *   3. RECORD: receipts/self-check/latest.json + log.jsonl — every verdict
 *      with exit codes and sha16 of the artifacts it produced.
 *   4. TRAVEL: commits + pushes the receipts (x3 jittered rebase retries,
 *      GIT_ASKPASS env — the PAT is never in argv or git config).
 *
 * Honesty laws honored here:
 *   - a skipped/failed check lands in the receipt as what it IS (never green).
 *   - the office app and foreman are infrastructure the office OWNS: booting
 *     them is a deed, recorded with pids, not a claim.
 *   - zero secrets printed; suite output is marker-names only by design.
 *
 * Run: bun run dev   (mini-service law: bun --hot, own port)
 * Port: 3040 (SELFCHECK_PORT). Health: GET /health
 */
import { writeFileSync, appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";

const SELFCHECK_PORT = Number(process.env.SELFCHECK_PORT || 3040);
const FLEETHQ = process.env.FLEETHQ_DIR || "/home/z/estate/FleetHQ";
const APP_PORT = Number(process.env.OFFICE_APP_PORT || 3002);
const FOREMAN_PORT = Number(process.env.FOREMAN_PORT || 3010);
const REAL_BOOKS_DIR = process.env.REAL_BOOKS_DIR || "/home/z/estate/Domain";
const INTERVAL_MS = Number(process.env.SELFCHECK_INTERVAL_MS || 30 * 60 * 1000);
const ASKPASS = "/home/z/.gitcred/askpass.sh";

const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/* חוק-PATH-המובטח (85-c: יתומי-דור-ישן נולדו-בלי-bun ב-PATH → posix_spawn ENOENT):
 *   bun/bunx נפתרים-מוחלט + כל-צאצא מקבל PATH עם /home/z/.bun/bin. */
const GUARANTEED_PATH = ["/home/z/.bun/bin", "/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/usr/sbin", "/bin", "/sbin", process.env.PATH ?? ""].join(":");
function resolveBun(name: "bun" | "bunx"): string {
  for (const base of ["/home/z/.bun/bin", "/usr/local/bin"]) {
    const cand = `${base}/${name}`;
    if (fs.existsSync(cand)) return cand;
  }
  return name; // נפילה-כנה
}
const BUN = resolveBun("bun");
const BUNX = resolveBun("bunx");

type BootInfo = { wasUp: boolean; spawned: boolean; pid?: number; note?: string };

let lastRun: Record<string, unknown> = { at: null, state: "booting" };
let running = false;

function sh(cmd: string, args: string[], cwd: string, timeoutMs: number, extraEnv: Record<string, string> = {}): { code: number; out: string } {
  try {
    const out = execFileSync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      encoding: "utf8",
      env: { ...process.env, PATH: GUARANTEED_PATH, ...extraEnv, GIT_ASKPASS: ASKPASS, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string; message?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}` };
  }
}

async function httpOk(url: string, ms = 8000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    return res.status < 500; // 202 "degraded but answering" still means the server is alive
  } catch {
    return false;
  }
}

function tcpOpen(port: number, ms = 3000): Promise<boolean> {
  return new Promise((resolveP) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    const t = setTimeout(() => { s.destroy(); resolveP(false); }, ms);
    s.on("connect", () => { clearTimeout(t); s.destroy(); resolveP(true); });
    s.on("error", () => { clearTimeout(t); resolveP(false); });
  });
}

function spawnDetached(cmd: string, args: string[], cwd: string, logFile: string, extraEnv: Record<string, string> = {}): number {
  const out = fs.openSync(logFile, "a");
  const child = spawn(cmd, args, {
    cwd,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, PATH: GUARANTEED_PATH, ...extraEnv },
  });
  child.unref();
  return child.pid ?? -1;
}

function memAvailableKb(): number {
  try {
    const m = fs.readFileSync("/proc/meminfo", "utf8");
    const hit = /^MemAvailable:\s+(\d+) kB/m.exec(m);
    return hit ? parseInt(hit[1], 10) : -1;
  } catch { return -1; }
}

async function ensureApp(): Promise<BootInfo> {
  if (await httpOk(`http://localhost:${APP_PORT}/api/fleet-health`))
    return { wasUp: true, spawned: false };
  /* gal-94·mem-gate (measured twice): booting this 500-900MB app while the box
     is starved makes the OOM killer execute the SOVEREIGN SPINE instead (console
     3050 died twice mid-compile). Gate: only boot when >= 2.5GB truly free.
     Honest receipt, no fake success — the spine outranks the office. */
  const avail = memAvailableKb();
  if (avail >= 0 && avail < 2_500_000)
    return { wasUp: false, spawned: false, note: `mem-gate: ${avail}kB available < 2.5GB — spine outranks office, skipping boot` };
  // self-heal: the office app needs its install tree too
  if (!existsSync(join(FLEETHQ, "node_modules"))) {
    const inst = sh(BUN, ["install", "--frozen-lockfile"], FLEETHQ, 300_000);
    if (inst.code !== 0)
      return { wasUp: false, spawned: false, note: `bun install failed: ${inst.out.slice(0, 200)}` };
  }
  const pid = spawnDetached(BUNX, ["next", "dev", "-p", String(APP_PORT)], FLEETHQ, "/tmp/office-selfcheck-app.log", { NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: "--max-old-space-size=768" });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (await httpOk(`http://localhost:${APP_PORT}/api/fleet-health`))
      return { wasUp: false, spawned: true, pid, note: "office app booted by selfcheck (it must always work)" };
  }
  return { wasUp: false, spawned: true, pid, note: "spawned but health not confirmed within 90s — receipts will show the truth" };
}

async function ensureForeman(): Promise<BootInfo> {
  if (await tcpOpen(FOREMAN_PORT))
    return { wasUp: true, spawned: false };
  // self-heal: the foreman mini-service needs its deps — install if absent
  // (measured first run: 'Cannot find package socket.io' — the office repairs itself)
  const svcDir = join(FLEETHQ, "mini-services", "agent-hq");
  if (!existsSync(join(svcDir, "node_modules"))) {
    const inst = sh(BUN, ["install"], svcDir, 120_000);
    if (inst.code !== 0)
      return { wasUp: false, spawned: false, note: `bun install failed: ${inst.out.slice(0, 200)}` };
  }
  const pid = spawnDetached(BUN, ["run", "dev"], svcDir, "/tmp/office-selfcheck-foreman.log", {
    AGENT_HQ_PORT: String(FOREMAN_PORT),
    AGENT_HQ_DATA_DIR: REAL_BOOKS_DIR, // the REAL Domain books — wired, not demo
    // env parity with the security suite (the suite got it, the boot didn't —
    // 2026-10-12 damage audit: foreman booted demo-mode forever, mirror froze,
    // veritas read STALE). Without FLEET_DIR the office never mirrors durable
    // state into receipts/ and the public page + veritas go dark.
    AGENT_HQ_FLEET_DIR: FLEETHQ,
  });
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (await tcpOpen(FOREMAN_PORT))
      return { wasUp: false, spawned: true, pid, note: `foreman booted by selfcheck on the REAL books (${REAL_BOOKS_DIR})` };
  }
  return { wasUp: false, spawned: true, pid, note: "spawned but socket not confirmed within 30s — receipts will show the truth" };
}

async function pushReceipts(): Promise<{ ok: boolean; attempts: number; note: string }> {
  const git = (args: string[]) => sh("git", args, FLEETHQ, 60_000);
  git(["add", "receipts/self-check", "receipts/fresh-oracle", "receipts/silence-ledger.json", "office/state/connectivity.json"]);
  const st = git(["status", "--porcelain"]);
  if (!st.out.trim()) return { ok: true, attempts: 0, note: "no receipt delta" };
  git(["commit", "-m", "[selfcheck] standing loop receipts: security+connectivity+fresh-oracle [skip ci]"]);
  for (let i = 1; i <= 3; i++) {
    const pull = git(["-c", "rebase.autoStash=true", "pull", "--rebase", "-X", "theirs", "origin", "main"]);
    if (pull.code !== 0) {
      git(["rebase", "--abort"]);
      await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 5000)));
      continue;
    }
    const push = git(["push", "origin", "main"]);
    if (push.code === 0) return { ok: true, attempts: i, note: "pushed" };
    await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 5000)));
  }
  return { ok: false, attempts: 3, note: "push failed after 3 jittered attempts — receipts remain local, next cycle retries (honest, no fakes)" };
}

function parseSecurityVerdict(out: string): { verdict: string; detail: string } {
  const line = out.split("\n").map((l) => l.trim()).find((l) => l.startsWith("SECURITY-REGRESSION:"));
  if (!line) return { verdict: "NO-VERDICT-LINE", detail: "suite produced no verdict line — treat as RED" };
  return { verdict: line.includes("ALL GREEN") ? "GREEN" : "RED", detail: line };
}

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  const startedAt = new Date().toISOString();
  const checks: Record<string, unknown> = {};
  try {
    // 1. BOOT the office (deeds, recorded)
    const app = await ensureApp();
    const foreman = await ensureForeman();
    checks.boot = { app, foreman };

    // 2. security regression against the LIVE boot (synthetic creds only).
    // env parity law: the suite must measure the SAME reality the foreman
    // runs on (real estate Domain books + the real FleetHQ clone) — first
    // run measured a stale default path and honestly failed on it.
    const sec = sh(BUN, ["tools/security-regression.ts", String(APP_PORT), String(FOREMAN_PORT)], FLEETHQ, 180_000, {
      AGENT_HQ_DATA_DIR: REAL_BOOKS_DIR,
      AGENT_HQ_FLEET_DIR: FLEETHQ,
    });
    const secV = parseSecurityVerdict(sec.out);
    checks.security = { exit: sec.code, ...secV };

    // 3. connectivity audit (what is NOT connected — measured)
    const aud = sh("node", ["tools/connectivity-audit.mjs"], FLEETHQ, 120_000);
    let auditSha16: string | null = null;
    let auditVerdict: string | null = null;
    try {
      const p = join(FLEETHQ, "office", "state", "connectivity.json");
      if (existsSync(p)) {
        const body = readFileSync(p, "utf8");
        auditSha16 = sha16(body);
        auditVerdict = (JSON.parse(body) as { verdictHe?: string }).verdictHe ?? null;
      }
    } catch { /* receipt records the absence honestly */ }
    checks.connectivity = { exit: aud.code, verdictHe: auditVerdict, sha16: auditSha16 };

    // 4. fresh oracle (public bytes == committed bytes)
    const orc = sh("node", ["tools/fresh-oracle.mjs"], FLEETHQ, 120_000);
    let oracleVerdict: string | null = null;
    try {
      const p = join(FLEETHQ, "receipts", "fresh-oracle", "latest.json");
      if (existsSync(p)) oracleVerdict = (JSON.parse(readFileSync(p, "utf8")) as { summary?: { verdict?: string } }).summary?.verdict ?? null;
    } catch { /* honest absence */ }
    checks.freshOracle = { exit: orc.code, verdict: oracleVerdict };

    // 4.5 silence ledger — SEE THE SILENCE (owner law 2026-10-12: every voice
    // of the organism measured — repos, ports, beats, network posts — with
    // silent-alarm thresholds; absence recorded as absence, never invented).
    const sl = sh("node", ["tools/silence-ledger.mjs"], FLEETHQ, 180_000);
    let silenceSummary: string | null = null;
    let silenceAlarms: number | null = null;
    try {
      const p = join(FLEETHQ, "receipts", "silence-ledger.json");
      if (existsSync(p)) {
        const led = JSON.parse(readFileSync(p, "utf8")) as { summary?: string; alarms?: string[] };
        silenceSummary = led.summary ?? null;
        silenceAlarms = Array.isArray(led.alarms) ? led.alarms.length : null;
      }
    } catch { /* honest absence */ }
    checks.silence = { exit: sl.code, summary: silenceSummary, alarms: silenceAlarms };

    // 4.6 git-health — repo-level vitals (26-b backlog): attached-HEAD assert,
    // divergence vs origin/main after a real fetch, bounded fsck per repo.
    // The tool owns the measurement AND the receipt (receipts/git-health.json);
    // boot-services stage9 runs the same tool — same check, two callers.
    const ghh = sh("node", ["tools/git-health.mjs"], FLEETHQ, 300_000);
    let gitHealthRepos: unknown = null;
    try {
      const p = join(FLEETHQ, "receipts", "git-health.json");
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, "utf8")) as { repos?: { name: string; headAttached: boolean; ahead: number | null; behind: number | null; fsck: string }[] };
        gitHealthRepos = (j.repos ?? []).map((r) => ({ name: r.name, attached: r.headAttached, ahead: r.ahead, behind: r.behind, fsck: r.fsck }));
      }
    } catch { /* honest absence */ }
    checks.gitHealth = { exit: ghh.code, repos: gitHealthRepos };

    // 5. push receipts (travel)
    const push = await pushReceipts();
    checks.push = push;

    lastRun = { at: startedAt, finishedAt: new Date().toISOString(), checks, state: "ok" };
  } catch (e) {
    lastRun = { at: startedAt, finishedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e), state: "error" };
  } finally {
    // receipt always lands, even on error (fail-loud, never silent)
    try {
      const dir = join(FLEETHQ, "receipts", "self-check");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "latest.json"), JSON.stringify(lastRun, null, 1) + "\n");
      appendFileSync(join(dir, "log.jsonl"), JSON.stringify({ at: lastRun.at, state: lastRun.state }) + "\n");
    } catch { /* host may be read-only; health endpoint still serves the truth */ }
    running = false;
  }
}

Bun.serve({
  port: SELFCHECK_PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ service: "office-selfcheck", port: SELFCHECK_PORT, intervalMs: INTERVAL_MS, lastRun });
    }
    if (url.pathname === "/run" && req.method === "POST") {
      void runOnce();
      return Response.json({ accepted: true, note: "run started (or already running)" });
    }
    return new Response("office-selfcheck: /health GET, /run POST\n", { status: 404 });
  },
});

// first run shortly after boot, then standing cadence
setTimeout(() => void runOnce(), 5_000);
setInterval(() => void runOnce(), INTERVAL_MS);
console.log(`[office-selfcheck] listening :${SELFCHECK_PORT} — boot+check every ${INTERVAL_MS / 60000}min (app :${APP_PORT}, foreman :${FOREMAN_PORT}, books ${REAL_BOOKS_DIR})`);
