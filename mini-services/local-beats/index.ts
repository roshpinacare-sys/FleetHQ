/**
 * local-beats — SOVEREIGN BEAT SCHEDULER (billing bypass).
 *
 * WHY: the org's GitHub Actions minutes are exhausted (billing lane, 09-20) —
 * every hosted cron beat is dead and veritas reads STALE. Owner law:
 * "לא יהיה שם תשלום לעולם" — so the compute moves HERE. Same scripts, same
 * cadences, same redact discipline, git push via the estate credential.
 * GitHub becomes storage, not compute. Honest logs, one-flight locks,
 * fail-loud verdicts to the log, never crash the scheduler.
 *
 * RECOVERY NOTE (2026-10-12, second sandbox wipe): this service was found to
 * have NEVER been committed to git — it lived only in the wiped working tree.
 * Rebuilt from the documented spec (cadences + log receipts) and committed.
 * Law: EVERYTHING that must survive a wipe lives in git.
 *
 * Cadences (UTC): money-watch 2h at :33 · grid-pulse 03:13/15:13 ·
 * dex-mirror hourly :52 · office-ci-lite daily 04:10 ·
 * office-heartbeat 2h at :41 — LOCAL successor of the billing-dead Actions
 * workflow: capture a live foreman window (READ-ONLY socket) + push the
 * office mirror/state. GitHub is storage; the compute is HERE.
 *
 * DAMAGE AUDIT 2026-10-12 (trace 1a130a8c): a suspected `env[1]]` syntax
 * error in this file was proven to be a DISPLAY ARTIFACT of the operator
 * console (byte-level codepoint dump showed correct `env[m[1]]` in both
 * worktree and HEAD) — zero code change needed there. The REAL damage found:
 * office-selfcheck's ensureForeman() booted the foreman WITHOUT
 * AGENT_HQ_FLEET_DIR → office ran demo-mirror mode → office-state-mirror.json
 * froze → veritas read STALE. Fixed in office-selfcheck; this beat restores
 * the heartbeat cadence Actions used to own.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONSOLE = "/home/z/estate/Console";
const DOMAIN = "/home/z/estate/Domain";
const FLEETHQ = "/home/z/estate/FleetHQ";
const LOG = "/tmp/local-beats.log";
const BOOT = Date.now();
const running = new Set();
const lastKey: Record<string, string> = {};

function envFor() {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const estateEnv = "/home/z/estate/.env.local";
  if (existsSync(estateEnv)) {
    for (const ln of readFileSync(estateEnv, "utf8").split(/\r?\n/)) {
      const m = ln.match(/^([A-Za-z_0-9]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  if (!env.AGENTS_WATCH_TOKEN && env.GITHUB_PAT) env.AGENTS_WATCH_TOKEN = env.GITHUB_PAT;
  return env;
}

function log(msg: string) {
  const line = `[local-beats ${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG, line + "\n"); } catch {}
}

function publish(cwd: string, name: string, redactFiles: string[]): string {
  const redactCmd = redactFiles.length && existsSync(`${cwd}/agents/redact-telemetry.mjs`)
    ? `node agents/redact-telemetry.mjs ${redactFiles.join(" ")} || true`
    : "true";
  const pub = spawnSync("bash", ["-c", `
    set -e
    cd "${cwd}"
    ${redactCmd}
    git add -A dex 2>/dev/null || true
    if ! git diff --cached --quiet; then
      git -c user.name="local-beats" -c user.email="local-beats@users.noreply.github.com" commit -q -m "${name}: local beat · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      git push -q origin HEAD
      echo "PUSHED"
    else
      echo "NO-CHANGE"
    fi`], { cwd, encoding: "utf8", timeout: 3 * 60_000 });
  return (pub.stdout || "ERR " + (pub.stderr || "")).trim().slice(-160);
}

function run(name: string, cwd: string, script: string, redactFiles: string[] = []) {
  if (running.has(name)) { log(`${name}: skipped — previous flight still running`); return; }
  running.add(name);
  try {
    // 25-a fix: -X theirs + explicit origin main — the estate discipline for
    // live-book repos (twins push constantly; a conflict must resolve to the
    // upstream canonical, never poison the repo into an unresolved state that
    // blocks every later pull — measured in Domain 20:52Z).
    const pull = spawnSync("git", ["-c", "rebase.autoStash=true", "pull", "--rebase", "-X", "theirs", "-q", "origin", "main"], { cwd, encoding: "utf8" });
    if (pull.status !== 0) log(`${name}: pull note exit=${pull.status} ${(pull.stderr || "").slice(-100)}`);
    const env = { ...envFor() } as NodeJS.ProcessEnv;
    const res = spawnSync("node", [script], { cwd, env, encoding: "utf8", timeout: 8 * 60_000 });
    const out = (res.stdout || "").slice(-800).replace(/\n+/g, " | ");
    const err = (res.stderr || "").slice(-400).replace(/\n+/g, " | ");
    log(`${name}: exit=${res.status} out="${out}"${err ? ` err="${err}"` : ""}`);
    const verdict = publish(cwd, name, redactFiles);
    log(`${name}: publish="${verdict}"`);
  } catch (e) {
    log(`${name}: FATAL ${(e as Error).message.slice(0, 200)} — scheduler survives (fail-loud, never crash)`);
  } finally {
    running.delete(name);
  }
}

// FleetHQ publish — same pull-rebase discipline as the selfcheck standing
// loop (concurrent pushers on the same repo must not fight).
function publishFleet(name: string, paths: string[]): string {
  const script = `
    set -e
    cd "${FLEETHQ}"
    git add ${paths.join(" ")} 2>/dev/null || true
    if ! git diff --cached --quiet; then
      git -c user.name="local-beats" -c user.email="local-beats@users.noreply.github.com" commit -q -m "${name}: local heartbeat · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      git -c rebase.autoStash=true pull --rebase -q origin main || true
      git push -q origin main
      echo "PUSHED"
    else
      echo "NO-CHANGE"
    fi`;
  const pub = spawnSync("bash", ["-c", script], { cwd: FLEETHQ, encoding: "utf8", timeout: 3 * 60_000 });
  return (pub.stdout || "ERR " + (pub.stderr || "")).trim().slice(-160);
}

// office-heartbeat-lite — the billing-dead Actions workflow's LOCAL successor.
// The foreman (:3010, spawned by office-selfcheck) writes
// receipts/office-state-mirror.json every 60s — local freshness is ITS duty.
// This beat adds what Actions used to do: observe a real window of office
// life (READ-ONLY socket capture) and give the mirror/state a git body so
// the public page never renders a stale office. Honesty law: nothing is
// invented — when the office is quiet, the capture says so.
function officeHeartbeat() {
  if (running.has("office-heartbeat")) return;
  running.add("office-heartbeat");
  try {
    const cap = spawnSync("bun", ["tools/office-state-capture.ts", "3010", "office/state/office-state.json", "30000"],
      { cwd: FLEETHQ, encoding: "utf8", timeout: 2 * 60_000 });
    log(`office-heartbeat: capture exit=${cap.status}${cap.stderr ? ` err="${cap.stderr.slice(-150).replace(/\n+/g, " | ")}"` : ""}`);
    const pub = publishFleet("office-heartbeat", ["receipts/office-state-mirror.json", "office/state/office-state.json"]);
    log(`office-heartbeat: publish="${pub}"`);
  } catch (e) {
    log(`office-heartbeat: FATAL ${(e as Error).message.slice(0, 150)} — scheduler survives`);
  } finally {
    running.delete("office-heartbeat");
  }
}

function officeCiLite() {
  if (running.has("office-ci-lite")) return;
  running.add("office-ci-lite");
  try {
    // Real checks only — honesty law: the verdict says exactly what ran.
    const lint = spawnSync("bash", ["-c", "bun run lint 2>&1 | tail -3"], { cwd: FLEETHQ, encoding: "utf8", timeout: 6 * 60_000 });
    const types = spawnSync("bash", ["-c", "bunx tsc --noEmit 2>&1 | tail -3"], { cwd: FLEETHQ, encoding: "utf8", timeout: 8 * 60_000 });
    let sha = "";
    try { sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: FLEETHQ, encoding: "utf8" }).stdout.trim(); } catch {}
    const lintPass = lint.status === 0, typesPass = types.status === 0;
    const verdict = {
      schema: "office.ci/1",
      at: new Date().toISOString(),
      repo: "roshpinacare-sys/FleetHQ",
      sha: sha.slice(0, 12),
      checks: { lint: lintPass ? "pass" : "fail", typecheck: typesPass ? "pass" : "fail" },
      overall: lintPass && typesPass ? "PASS" : "FAIL",
      reason: `local beat: lint=${lintPass ? "pass" : "fail"} typecheck=${typesPass ? "pass" : "fail"} (full 5-check suite stays with Actions office-ci)`,
      provenance: { runId: "local-beats/office-ci-lite", runUrl: "local://local-beats", sha },
    };
    const dir = join(FLEETHQ, "receipts", "office-ci");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "verdict.json"), JSON.stringify(verdict, null, 1) + "\n");
    log(`office-ci-lite: lint=${lint.status} types=${types.status} → verdict.json (${verdict.overall})`);
    const pub = publishFleet("office-ci-lite", ["receipts/office-ci/verdict.json"]);
    log(`office-ci-lite: publish="${pub}"`);
  } catch (e) {
    log(`office-ci-lite: FATAL ${(e as Error).message.slice(0, 120)}`);
  } finally {
    running.delete("office-ci-lite");
  }
}

// ---- cadence helpers (UTC) ----
const now = () => new Date();
const keyOf = (d: Date, unit: string) =>
  unit === "h" ? `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-h` :
  `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-d`;
const fired = (name: string, key: string) => lastKey[name] === key;
const mark = (name: string, key: string) => { lastKey[name] = key; };

function tick() {
  const d = now();
  const mi = d.getUTCMinutes(), ho = d.getUTCHours();

  if (mi === 33 && ho % 2 === 0) { const k = keyOf(d, "h"); if (!fired("money-watch", k)) { mark("money-watch", k); run("money-watch", CONSOLE, "agents/money-watch.mjs", ["dex/money.json"]); } }
  if (mi === 52) { const k = keyOf(d, "h"); if (!fired("dex-mirror", k)) { mark("dex-mirror", k); run("dex-mirror", DOMAIN, "agents/dex-mirror.mjs", ["dex/grid.json","dex/world.json","dex/state.json","dex/credits.json","dex/portfolio.json","dex/onramp.json","dex/showcase.json","dex/relay.json"]); } }
  if ((ho === 3 || ho === 15) && mi === 13) { const k = keyOf(d, "h"); if (!fired("grid-pulse", k)) { mark("grid-pulse", k); run("grid-pulse", CONSOLE, "agents/grid-pulse.mjs", []); } }
  if (mi === 17 && ho % 2 === 0) { const k = keyOf(d, "h"); if (!fired("office-ci-lite", k)) { mark("office-ci-lite", k); officeCiLite(); } }
  if (mi === 41 && ho % 2 === 0) { const k = keyOf(d, "h"); if (!fired("office-heartbeat", k)) { mark("office-heartbeat", k); officeHeartbeat(); } }
  // boot catch-up (once, ≤10min after boot): mirror immediately so veritas goes fresh fast
  if (Date.now() - BOOT < 10 * 60_000 && !fired("boot-catchup", "once")) {
    mark("boot-catchup", "once");
    run("boot-catchup-dex-mirror", DOMAIN, "agents/dex-mirror.mjs", ["dex/grid.json","dex/world.json","dex/state.json","dex/credits.json","dex/portfolio.json","dex/onramp.json","dex/showcase.json","dex/relay.json"]);
  }
}

log("local-beats scheduler UP (damage-audit build 2026-10-12) — beats: money-watch 2h:33, grid-pulse 03:13/15:13, dex-mirror h:52, office-ci-lite 04:10, office-heartbeat 2h:41, boot catch-up dex-mirror");
setInterval(tick, 60_000);
tick();
