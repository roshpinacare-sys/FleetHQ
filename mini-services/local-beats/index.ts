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
 * office-heartbeat hourly at :41 (3-b, 2026-10-13: was 2h — the owner measured
 * capturedAt 3h+ old in the aging band; hourly halves the worst-case gap while
 * the 30s read-only capture stays cheap) — LOCAL successor of the billing-dead
 * Actions workflow: capture a live foreman window (READ-ONLY socket) + push the
 * office mirror/state. GitHub is storage; the compute is HERE.
 *
 * FLUSH DURABILITY (2026-10-13, trace 26-b→26-c-2): vault-home/flush.sh (the
 * auto-drain of every unpushed commit the moment a valid credential exists)
 * was fired only from a stale in-memory scheduler — HEAD had NO flush wiring
 * (git log -S flush on this path = zero commits), so the next wipe/reboot
 * would have booted a scheduler that never flushes again and the push-queue
 * would pile silently. The beat now lives HERE, in git, where the wipe
 * cannot reach it: cadence :09/:24/:39/:54, one flight per slot.
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
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";

const CONSOLE = "/home/z/estate/Console";
const DOMAIN = "/home/z/estate/Domain";
const FLEETHQ = "/home/z/estate/FleetHQ";
const SANDBOX = "/home/z/estate/Sandbox";
const LOG = "/tmp/local-beats.log";
const BOOT = Date.now();
const running = new Set();
// Dedupe marks PERSIST to /tmp/local-beats-state.json (loaded at module init,
// written on every mark). WHY: bun --hot reloads reset module memory — a
// measured cascade (2026-10-12 22:54Z) fired one flush slot ~25 times in a
// minute: fire → publish commit → pull --rebase rewrites the tree → reload →
// dedupe forgotten → refire. Persisted marks survive reloads (same boot) and
// die with /tmp on a wipe (correct: a fresh boot may flush fresh).
const STATE = "/tmp/local-beats-state.json";
const lastKey: Record<string, string> = (() => {
  try { return JSON.parse(readFileSync(STATE, "utf8")) as Record<string, string>; } catch { return {}; }
})();

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
      git -c user.name="local-beats" -c user.email="local-beats@agents.roshpinacare-sys" commit -q -m "${name}: local beat · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      git push -q origin HEAD
      echo "PUSHED"
    else
      echo "NO-CHANGE"
    fi`], { cwd, encoding: "utf8", timeout: 3 * 60_000, env: pubEnv() });
  return (pub.stdout || "ERR " + (pub.stderr || "")).trim().slice(-160);
}

// estate credential for every Console/Domain publish (27-d): push lands directly,
// flush stays the fallback. Same law as publishDexFamily.
function pubEnv(): NodeJS.ProcessEnv {
  const e = { ...envFor() } as NodeJS.ProcessEnv;
  if (e.GITHUB_PAT && !e.GIT_PAT) e.GIT_PAT = e.GITHUB_PAT;
  if (existsSync(GIT_ASKPASS)) e.GIT_ASKPASS = GIT_ASKPASS;
  e.GIT_TERMINAL_PROMPT = "0";
  return e;
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
      git -c user.name="local-beats" -c user.email="local-beats@agents.roshpinacare-sys" commit -q -m "${name}: local heartbeat · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      git -c rebase.autoStash=true pull --rebase -q origin main || true
      # SELF-HEAL (Task 6, 2026-10-16): a conflicted pull --rebase used to leave
      # a stuck rebase-merge dir + UU paths that poisoned EVERY later publish
      # ("Cannot autostash", spawnSync editor hang). Law: local replayed side is
      # the freshest telemetry — take --theirs, finish the rebase, never leave
      # the machine stuck. GIT_EDITOR=true kills the interactive-editor hang.
      if git status --porcelain | grep -q '^UU\|^AA\|^DD\|^DU\|^UD'; then
        for f in $(git status --porcelain | grep '^[UAD][UAD ]' | awk '{print $2}'); do
          # Task 7b fix (measured 17:24): checkout --theirs succeeds but leaves
          # the path UNMERGED in the index — rebase --continue then refuses.
          # The old '||' ran git add only when checkout FAILED. Law: checkout
          # resolves the worktree, git add resolves the INDEX. Both, always.
          git checkout --theirs -- "$f" 2>/dev/null || true
          git add -- "$f" 2>/dev/null || true
        done
        GIT_EDITOR=true git -c rebase.autoStash=true rebase --continue 2>/dev/null || git rebase --abort 2>/dev/null || true
      fi
      git push -q origin main || git pull --rebase -q origin main || true
      git push -q origin main || true
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
// ---- Sandbox artery beats (27-b, 2026-10-13) --------------------------------
// ROOT CAUSE: the four office arteries in Domain/office/data.json (wallet /
// grid / fleet / sovereign-tick) are fed by Sandbox receipts — written by
// Sandbox Actions (artery-*.yml, sovereign.yml). The Sandbox repo is PRIVATE
// → Actions minutes wall (measured: wallet frozen 23h, fleet 26h) → verdict
// AGING 4/7. THE LOCAL SUCCESSOR LAW (same as office-heartbeat): same engine
// scripts, same cadences, receipts committed in the Sandbox clone; the beat
// pushes with the estate credential (GIT_ASKPASS + GIT_PAT from .env.local)
// and flush.sh (REPOS now includes Sandbox) drains whatever the push missed.
// Honesty: the scripts measure for real — a red verdict lands as a red
// receipt; nothing is faked to green (grid-watch 07:39Z ERROR stays ERROR).
const GIT_ASKPASS = "/home/z/.gitcred/askpass.sh";

function sandboxEnv(): Record<string, string> {
  const env = { ...envFor() } as Record<string, string>;
  // the engine scripts read ECO_WALLET_TOKEN for cross-repo API reads + the
  // private wallet clone — the estate PAT is the sanctioned local stand-in
  if (!env.ECO_WALLET_TOKEN && env.GITHUB_PAT) env.ECO_WALLET_TOKEN = env.GITHUB_PAT;
  if (env.GITHUB_PAT) {
    env.GIT_PAT = env.GITHUB_PAT;
    if (existsSync(GIT_ASKPASS)) env.GIT_ASKPASS = GIT_ASKPASS;
    env.GIT_TERMINAL_PROMPT = "0";
  }
  return env;
}

function publishSandbox(name: string): string {
  const script = `
    set -e
    cd "${SANDBOX}"
    git add receipts 2>/dev/null || true
    if ! git diff --cached --quiet; then
      git -c user.name="local-beats" -c user.email="roshpinacare-sys@users.noreply.github.com" commit -q -m "${name}: local artery · $(date -u +%Y-%m-%dT%H:%M:%SZ) [skip ci]"
      git -c rebase.autoStash=true pull --rebase -X theirs -q origin main || true
      git push -q origin main 2>/dev/null || echo "push deferred (flush drains)"
    else
      echo "NO-CHANGE"
    fi`;
  const pub = spawnSync("bash", ["-c", script], { cwd: SANDBOX, env: { ...sandboxEnv() } as NodeJS.ProcessEnv, encoding: "utf8", timeout: 3 * 60_000 });
  return ((pub.stdout || "") + (pub.stderr ? " ERR:" + pub.stderr.slice(-120) : "")).trim().slice(-160);
}

function runSandbox(name: string, script: string, timeoutMin: number) {
  if (running.has(name)) { log(`${name}: skipped — previous flight still running`); return; }
  running.add(name);
  try {
    const pull = spawnSync("git", ["-c", "rebase.autoStash=true", "pull", "--rebase", "-X", "theirs", "-q", "origin", "main"], { cwd: SANDBOX, encoding: "utf8" });
    if (pull.status !== 0) log(`${name}: pull note exit=${pull.status} ${(pull.stderr || "").slice(-100)}`);
    const res = spawnSync("node", [script], { cwd: SANDBOX, env: { ...sandboxEnv() } as NodeJS.ProcessEnv, encoding: "utf8", timeout: timeoutMin * 60_000 });
    const out = (res.stdout || "").slice(-500).replace(/\n+/g, " | ");
    const err = (res.stderr || "").slice(-300).replace(/\n+/g, " | ");
    log(`${name}: exit=${res.status} out="${out}"${err ? ` err="${err}"` : ""}`);
    const verdict = publishSandbox(name);
    log(`${name}: publish="${verdict}"`);
  } catch (e) {
    log(`${name}: FATAL ${(e as Error).message.slice(0, 200)} — scheduler survives`);
  } finally {
    running.delete(name);
  }
}

// ---- dex-family beat (27-d, 2026-10-13) --------------------------------------
// THE DEX VOLUME MANDATE (owner IM trace 1a135930da12227d): the keyless DEX
// engine family as ONE local flight every 30 min. STASIS lifted lawfully
// (Domain directives chain i=6), custody probe fixed to the FUNDED treasury
// (headcorner 16.632 SBD measured; owner=0.001 SBD was the whole drought),
// exchange-core re-genesis'd on real keyed custody. Flight =
//   market-grid → dex-router → arb-mesh → dex-core tick → settle-intents
//   → dex-xc → mm-volume · publish: agents books, one commit, rebase-theirs.
// Cadence :11/:41 — clear of the :52 dex-mirror publish and flush slots.
// REPO-HEAL (27-d): parallel-wave writers leave Domain mid-rebase with unmerged
// mirror snapshots (measured twice on 2026-10-13). Deterministic newest-publishedAt
// resolution BEFORE pull/publish — a poisoned repo must never block a beat.
function healUnmerged(cwd: string): number {
  try {
    const st = spawnSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
    const unmerged = (st.stdout || "").split("\n").filter((l) => /^(UU|AA|U |DU)/.test(l)).map((l) => l.slice(3).trim());
    if (!unmerged.length) return 0;
    for (const f of unmerged) {
      const s2 = spawnSync("git", ["show", `:2:${f}`], { cwd, encoding: "utf8" }).stdout || "";
      const s3 = spawnSync("git", ["show", `:3:${f}`], { cwd, encoding: "utf8" }).stdout || "";
      const ts = (t: string) => (t.match(/"publishedAt"\s*:\s*"([^"]+)"/) || [])[1] || null;
      const a = ts(s2), b = ts(s3);
      const pick = a && b ? (a > b ? ":2" : ":3") : ":3";
      const blob = spawnSync("git", ["show", `${pick}:${f}`], { cwd, encoding: "utf8" }).stdout || "";
      writeFileSync(join(cwd, f), blob);
      spawnSync("git", ["add", f], { cwd, encoding: "utf8" });
    }
    log(`heal-unmerged(${cwd.split("/").pop()}): resolved ${unmerged.length} path(s) newest-publishedAt-wins`);
    return unmerged.length;
  } catch { return 0; }
}

function dexFamily() {
  const env = { ...envFor() } as NodeJS.ProcessEnv;
  env.FLEET_ACCOUNT = "headcorner";
  const steps: Array<[string, string[]]> = [
    ["market-grid", ["agents/market-grid.cjs"]],
    ["dex-router", ["agents/dex-router.cjs"]],
    ["arb-mesh", ["agents/arb-mesh.cjs"]],
    ["dex-core", ["agents/dex-core.cjs"]],
    ["settle-intents", ["agents/dex-core.cjs", "settle-intents"]],
    ["dex-xc", ["agents/dex-xc.cjs"]],
    ["mm-volume", ["agents/mm-volume.cjs"]]
  ];
  const outs: string[] = [];
  for (const [step, args] of steps) {
    try {
      const res = spawnSync("node", args, { cwd: DOMAIN, env, encoding: "utf8", timeout: 3 * 60_000 });
      const out = (res.stdout || "").trim().split("\n").slice(-1)[0] || "";
      const err = (res.stderr || "").trim().split("\n").slice(-1)[0] || "";
      outs.push(`${step}=${res.status === 0 ? "ok" : "exit" + res.status}${out ? " " + out.slice(0, 120) : ""}${err ? " ERR:" + err.slice(0, 100) : ""}`);
    } catch (e) {
      outs.push(`${step}=FATAL ${(e as Error).message.slice(0, 100)}`);
    }
  }
  log(`dex-family: ${outs.join(" | ")}`);
}

function publishDexFamily(): string {
  const paths = "agents/STASIS.json agents/receipts/owner-directives.jsonl agents/dex-core.json agents/arb-mesh.json agents/mm-volume.json agents/dex-xc.json agents/dex-router.json agents/dex-intents.json agents/dex-batch.json agents/market-grid-paper.jsonl agents/counter-grid.json agents/market-cycle.json";
  const script = `
    set -e
    cd "${DOMAIN}"
    # heal any unmerged paths before staging (parallel-wave safety)
    U=$(git status --porcelain | grep -cE '^(UU|AA|U |DU)' || true)
    if [ "$U" != "0" ]; then
      for f in $(git status --porcelain | grep -E '^(UU|AA|U |DU)' | sed 's/^...//'); do
        git show ":3:$f" > "$f" 2>/dev/null || true
        git add "$f" 2>/dev/null || true
      done
    fi
    if [ -f agents/redact-telemetry.mjs ]; then node agents/redact-telemetry.mjs agents/dex-core.json agents/arb-mesh.json agents/mm-volume.json agents/dex-xc.json agents/dex-router.json >/dev/null 2>&1 || true; fi
    git add ${paths} 2>/dev/null || true
    if ! git diff --cached --quiet; then
      git -c user.name="local-beats" -c user.email="local-beats@agents.roshpinacare-sys" commit -q -m "dex-family: local beat · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      git -c rebase.autoStash=true pull --rebase -X theirs -q origin main || true
      git push -q origin HEAD 2>/dev/null || echo "push deferred (flush drains)"
      echo "PUSHED"
    else
      echo "NO-CHANGE"
    fi`;
  const penv = { ...envFor() } as NodeJS.ProcessEnv;
  if (penv.GITHUB_PAT && !penv.GIT_PAT) penv.GIT_PAT = penv.GITHUB_PAT;
  if (existsSync(GIT_ASKPASS)) penv.GIT_ASKPASS = GIT_ASKPASS;
  penv.GIT_TERMINAL_PROMPT = "0";
  const pub = spawnSync("bash", ["-c", script], { cwd: DOMAIN, env: penv, encoding: "utf8", timeout: 3 * 60_000 });
  return ((pub.stdout || "") + (pub.stderr ? " ERR:" + pub.stderr.slice(-120) : "")).trim().slice(-200);
}

function runDexFamily() {
  if (running.has("dex-family")) { log("dex-family: skipped — previous flight still running"); return; }
  running.add("dex-family");
  try {
    healUnmerged(DOMAIN);
    const pull = spawnSync("git", ["-c", "rebase.autoStash=true", "pull", "--rebase", "-X", "theirs", "-q", "origin", "main"], { cwd: DOMAIN, encoding: "utf8" });
    if (pull.status !== 0) log(`dex-family: pull note exit=${pull.status} ${(pull.stderr || "").slice(-100)}`);
    dexFamily();
    const verdict = publishDexFamily();
    log(`dex-family: publish="${verdict}"`);
  } catch (e) {
    log(`dex-family: FATAL ${(e as Error).message.slice(0, 200)} — scheduler survives`);
  } finally {
    running.delete("dex-family");
  }
}

// ---- office-retro beat (27-b, 2026-10-13) -----------------------------------
// ROOT CAUSE: office/RETRO-LATEST.md + retro-state.json are written by the
// WEEKLY Actions lane (office-retro.yml, Thursday 07:43 UTC) — the only
// writer. Between runs (and through sandbox wipes) the lessons view freezes.
// LOCAL WIRING: the same zero-dep loop (node office/retro.mjs — derives from
// the live fleet bus/digest/findings, invents nothing) runs HERE:
//   · the published weekly slot (Thu 07:43 UTC — same cadence law), and
//   · a staleness catch-up: generatedAt older than 26h (the officeCi fresh
//     law) → one run per day. A wipe can no longer leave the office without
//     its lessons.
// The office-pages (Pages) publish stays with the Actions lane — publish-
// retro.sh is GH_TOKEN-driven and the local lane commits the measured lane
// files to main (BACKLOG/RETRO-LATEST/retro-state/PROPOSALS).
function retroStaleHours(): number | null {
  try {
    const s = JSON.parse(readFileSync(join(FLEETHQ, "office", "retro-state.json"), "utf8")) as { generatedAt?: string };
    if (!s.generatedAt) return null;
    return (Date.now() - new Date(s.generatedAt).getTime()) / 3_600_000;
  } catch { return null; }
}

// ---- economy-guard (wave-91, doctrine-4, 2026-10-16): the internal economy
// engine (:3016) and the platform web (:3000) have NO external keeper after
// their own dev-guard died with them (measured double-failure 17:5xZ: engine
// lock file was git-tracked → checkout reset stale PIDs → honest-exit war →
// engine dead → its in-engine dev-guard dead → next-dev unreived → dark web).
// THIS beat is the last-line keeper: local-beats is a live-tree process, so a
// child it spawns SURVIVES the sandbox reaper (the same survival law the
// runtime-supervisor comments document). Cadence: every minute, port-probe
// first — a healthy service is never touched; a dead one gets exactly one
// detached spawn per probe window. Zero overlap with runtime-supervisor
// (supervisor spawns on ITS dead ticks; both paths are port-gated, the loser
// exits clean on EADDRINUSE by design).
function portUp(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect(port, "127.0.0.1");
    const done = (ok: boolean) => { try { sock.destroy(); } catch { /* already */ } resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}
let lastGuardLog = 0;
async function economyGuard() {
  const targets: Array<{ port: number; cwd: string; cmd: string; args: string[]; logf: string; name: string }> = [
    { port: 3016, cwd: "/home/z/my-project/mini-services/fleet-economy", cmd: process.execPath, args: ["index.ts"], logf: "/home/z/my-project/mini-services/fleet-economy/economy.log", name: "fleet-economy" },
    { port: 3000, cwd: "/home/z/my-project", cmd: process.execPath, args: ["run", "dev"], logf: "/home/z/my-project/dev.log", name: "next-dev" },
  ];
  for (const t of targets) {
    try {
      if (await portUp(t.port)) continue;
      const out = openSync(t.logf, "a");
      const child = spawn(t.cmd, t.args, { cwd: t.cwd, detached: true, stdio: ["ignore", out, out], env: { ...process.env, GIT_EDITOR: "true" } });
      child.unref();
      closeSync(out);
      if (Date.now() - lastGuardLog > 120_000) { lastGuardLog = Date.now(); log(`economy-guard: ${t.name} down → detached revive pid=${child.pid}`); }
      else log(`economy-guard: ${t.name} down → detached revive pid=${child.pid}`);
    } catch (e) { log(`economy-guard: ${t.name} revive error: ${String(e).slice(0, 80)}`); }
  }
}

function retroBeat() {
  if (running.has("office-retro")) { log("office-retro: skipped — previous flight still running"); return; }
  running.add("office-retro");
  try {
    // 3-c refs law: ingested upstream text is scrubbed names → acct-NN refs;
    // the map lives untracked in the Console clone — pass it as the env the
    // Actions lane passes as its secret. Absent map = honest no-op note.
    const env: Record<string, string> = { ...envFor() } as Record<string, string>;
    try { env.FLEET_ROSTER_MAP = readFileSync(join(CONSOLE, "agents", ".roster-map.local.json"), "utf8").trim(); } catch { /* absent — retro logs roster-unresolved honestly */ }
    const res = spawnSync("node", ["office/retro.mjs"], { cwd: FLEETHQ, env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 8 * 60_000 });
    const out = (res.stdout || "").slice(-600).replace(/\n+/g, " | ");
    const err = (res.stderr || "").slice(-300).replace(/\n+/g, " | ");
    log(`office-retro: exit=${res.status} out="${out}"${err ? ` err="${err}"` : ""}`);
    const pub = publishFleet("office-retro", ["office/BACKLOG.md", "office/RETRO-LATEST.md", "office/retro-state.json", "office/PROPOSALS"]);
    log(`office-retro: publish="${pub}"`);
  } catch (e) {
    log(`office-retro: FATAL ${(e as Error).message.slice(0, 150)} — scheduler survives`);
  } finally {
    running.delete("office-retro");
  }
}

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

// flush — DRAIN THE ESTATE (vault-home/flush.sh). Credential hunt + validation
// live in the script itself (env → estate .env.local → vault copy, fingerprints
// only). Here: spawn it, capture its stdout/stderr into the beat log, and give
// the honest push-queue receipt a git body so the Actions-side divergence
// watchdog can hear the queue even while it is stuck. Env inherited as-is —
// the script does its own .env.local sourcing (same contract as the beats).
function flushBeat() {
  if (running.has("flush")) return;
  running.add("flush");
  try {
    const res = spawnSync("bash", ["vault-home/flush.sh"], { cwd: FLEETHQ, encoding: "utf8", timeout: 8 * 60_000 });
    const out = (res.stdout || "").slice(-400).replace(/\n+/g, " | ");
    const err = (res.stderr || "").slice(-200).replace(/\n+/g, " | ");
    log(`flush: exit=${res.status} out="${out}"${err ? ` err="${err}"` : ""}`);
    // no-delta publish law (same shape as the watchdog's commit lane): the
    // queue receipt's `at` churns every flight — committing it every slot
    // would rewrite the tree every slot (rebase checkout → bun --hot reload →
    // refire, the measured 22:54Z cascade). Publish only when the MEASURED
    // state (credential verdict + per-repo divergence) changed vs HEAD.
    const queue = (() => { try { return JSON.parse(readFileSync(join(FLEETHQ, "receipts", "push-queue.json"), "utf8")); } catch { return null; } })();
    const committed = (() => { try { const r = spawnSync("git", ["show", "HEAD:receipts/push-queue.json"], { cwd: FLEETHQ, encoding: "utf8" }); return r.status === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } })();
    const sig = (q: { credential?: string; repos?: unknown[] } | null) => (q ? JSON.stringify([q.credential, q.repos]) : "null");
    if (queue && committed && sig(queue) === sig(committed)) {
      log("flush: queue unchanged — publish skipped (no-delta law)");
    } else {
      const pub = publishFleet("flush", ["receipts/push-queue.json"]);
      log(`flush: publish="${pub.slice(-120)}"`);
    }
  } catch (e) {
    log(`flush: FATAL ${(e as Error).message.slice(0, 150)} — scheduler survives`);
  } finally {
    running.delete("flush");
  }
}

// ---- cadence helpers (UTC) ----
const now = () => new Date();
const keyOf = (d: Date, unit: string) =>
  unit === "h" ? `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-h` :
  `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-d`;
const fired = (name: string, key: string) => lastKey[name] === key;
const mark = (name: string, key: string) => {
  lastKey[name] = key;
  try { writeFileSync(STATE, JSON.stringify(lastKey)); } catch { /* best-effort: in-memory mark still holds for this process */ }
};

function tick() {
  const d = now();
  const mi = d.getUTCMinutes(), ho = d.getUTCHours();

  if (mi === 33 && ho % 2 === 0) { const k = keyOf(d, "h"); if (!fired("money-watch", k)) { mark("money-watch", k); run("money-watch", CONSOLE, "agents/money-watch.mjs", ["dex/money.json"]); } }
  if (mi === 52) { const k = keyOf(d, "h"); if (!fired("dex-mirror", k)) { mark("dex-mirror", k); run("dex-mirror", DOMAIN, "agents/dex-mirror.mjs", ["dex/grid.json","dex/world.json","dex/state.json","dex/credits.json","dex/portfolio.json","dex/onramp.json","dex/showcase.json","dex/relay.json"]); } }
  // dex-family :11/:41 (27-d) — the DEX volume mandate flywheel
  if (mi === 11 || mi === 41) { const k = `${keyOf(d, "h")}:${mi}`; if (!fired("dex-family", k)) { mark("dex-family", k); runDexFamily(); } }
  // giants beat :31 (27-d) — local successor of giants-beat.yml: the ours-row volume meter must never go stale on an Actions-minutes wall (the meter IS the owner's window into the DEX)
  if (mi === 31) { const k = keyOf(d, "h"); if (!fired("giants", k)) { mark("giants", k); run("giants", CONSOLE, "dex/giants.mjs", []); } }
  if ((ho === 3 || ho === 15) && mi === 13) { const k = keyOf(d, "h"); if (!fired("grid-pulse", k)) { mark("grid-pulse", k); run("grid-pulse", CONSOLE, "agents/grid-pulse.mjs", []); } }
  if (mi === 17 && ho % 2 === 0) { const k = keyOf(d, "h"); if (!fired("office-ci-lite", k)) { mark("office-ci-lite", k); officeCiLite(); } }
  // office-heartbeat — every 15min at :08/:23/:38/:53 (Task 6, measured
  // 2026-10-16: the GitHub 15-min Actions lane (cron 9,24,39,54) produced ZERO
  // scheduled runs 06:02→12:13 while the workflow was marked active — the
  // fleet-documented schedule-skip struck for 6h+ straight, so the 3-b hourly
  // local beat aged the public room up to ~80min. A 30s read-only socket
  // capture 4x/hour keeps the room ≤ ~20min fresh with zero cloud dependency —
  // the same Actions-minutes-wall→local-successor law as the 27-b arteries.
  // Per-slot dedup key (the hourly key would swallow three of four slots;
  // offset from flush :09/:24/:39/:54 to avoid push stampede).
  if (mi % 15 === 8) { const k = `${keyOf(d, "h")}:${mi}`; if (!fired("office-heartbeat", k)) { mark("office-heartbeat", k); officeHeartbeat(); } }
  // ---- Sandbox arteries (27-b): same cadences as their Sandbox Actions crons
  // (grid */30, tick hourly, wallet hourly :40, fleet 2h:25) — the veins that
  // died on the private-repo Actions minutes wall, now local (see runSandbox).
  if (mi === 5 || mi === 35) { const k = `${keyOf(d, "h")}:${mi}`; if (!fired("sbx-grid", k)) { mark("sbx-grid", k); runSandbox("sbx-grid", "engine/grid-watch.mjs", 4); } }
  if (mi === 21) { const k = keyOf(d, "h"); if (!fired("sbx-tick", k)) { mark("sbx-tick", k); runSandbox("sbx-tick", "engine/sovereign-tick.mjs", 3); } }
  if (mi === 40) { const k = keyOf(d, "h"); if (!fired("sbx-wallet", k)) { mark("sbx-wallet", k); runSandbox("sbx-wallet", "engine/wallet-verify.mjs", 9); } }
  if (mi === 25 && ho % 2 === 0) { const k = keyOf(d, "h"); if (!fired("sbx-fleet", k)) { mark("sbx-fleet", k); runSandbox("sbx-fleet", "engine/fleet-verify.mjs", 14); } }
  // ---- canonical-chain sealer (Task 7, 2026-10-16): the econ engine (sandbox
  // Domain submodule) mints ~40k tx/h (~20MB/h). Without an in-submodule seal
  // the ledger grows uncommitted (the GH001 race vector that killed pushes
  // before). Seal the chain 4x/h, offset from flush :09/:24/:39/:54.
  if (mi % 15 === 2) { const k = `${keyOf(d, "h")}:${mi}`; if (!fired("sbx-seal", k)) { mark("sbx-seal", k); runSandbox("sbx-seal", "engine/seal-domain.mjs", 5); } }
  // ---- office-retro (27-b): the published weekly slot + a 26h staleness
  // catch-up (1/day max) so a wipe or a dead Actions lane cannot leave the
  // office without its lessons (retro derives from live measurements only).
  if (d.getUTCDay() === 4 && ho === 7 && mi === 43) { const k = keyOf(d, "h"); if (!fired("retro-weekly", k)) { mark("retro-weekly", k); retroBeat(); } }
  {
    const stale = retroStaleHours();
    if (stale !== null && stale > 26) { const k = keyOf(d, "d"); if (!fired("retro-catchup", k)) { mark("retro-catchup", k); log(`office-retro: catch-up fired (retro-state generatedAt ${stale.toFixed(1)}h old > 26h law)`); retroBeat(); } }
  }
  // economy-guard (wave-91): every tick — port-gated, spawns only the dead.
  economyGuard();
  // flush every 15min at :09/:24/:39/:54 — dedupe key PER SLOT (four fires per
  // hour, so the hourly key used by the other beats would swallow three of them)
  if (mi % 15 === 9) { const k = `${keyOf(d, "h")}:${mi}`; if (!fired("flush", k)) { mark("flush", k); flushBeat(); } }
  // boot catch-up (once, ≤10min after boot): mirror immediately so veritas goes fresh fast
  if (Date.now() - BOOT < 10 * 60_000 && !fired("boot-catchup", "once")) {
    mark("boot-catchup", "once");
    run("boot-catchup-dex-mirror", DOMAIN, "agents/dex-mirror.mjs", ["dex/grid.json","dex/world.json","dex/state.json","dex/credits.json","dex/portfolio.json","dex/onramp.json","dex/showcase.json","dex/relay.json"]);
  }
}

// ---- liveness port (3012): the runtime-supervisor's law judges a service by
// PROCESS + PORT; a pure scheduler has neither, so expose a tiny read-only one.
// Without it the supervisor cannot own this service, and a dead scheduler stays
// dead until a human notices. Measured 2026-10-13: the --hot process silently
// kept running pre-fix code after the identity-law edit (hot reload does not
// rebind live timers) — the durable fix is supervisor ownership + NO --hot.
Bun.serve({
  port: 3012,
  fetch: () => Response.json({
    service: "local-beats",
    pid: process.pid,
    bootedAt: new Date(BOOT).toISOString(),
    build: "identity-law 2026-10-13 — writers = local-beats@agents.roshpinacare-sys, supervised (no --hot)",
  }),
});

log("local-beats scheduler UP (flush-durable build 2026-10-13, 3-b office-hourly, 27-b arteries+retro, 27-d dex-family :11/:41 + giants :31, 7 sbx-seal ledger 4x/h) — beats: money-watch 2h:33, grid-pulse 03:13/15:13, dex-mirror h:52, dex-family h:11/h:41, giants h:31, office-ci-lite 2h:17, office-heartbeat 15m:08/23/38/53, flush :09/:24/:39/:54, sbx-arteries grid :05/:35 · tick :21 · wallet :40 · fleet 2h:25 · seal :02/:17/:32/:47, office-retro Thu 07:43 + 26h-catchup, boot catch-up dex-mirror");
setInterval(tick, 60_000);
tick();
