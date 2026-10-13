#!/usr/bin/env node
/**
 * reef-rung3.cjs — guarded agent-bash episode desk (Z-60, CR-0027).
 *
 * Lands the booked reef Rung 3 condition (CR-0023): agent recipes whose bash
 * executes ONLY through the CR-0019 command-guard. The desk owns the reef
 * SERVE-WINDOW (started per run, stopped in finally, zero processes after),
 * preflights the CR-0015 shim (keyless tier B upstream), runs the python
 * episode (agents/reef/rung3_guarded_episode.py) in a SCRUBBED env (no key
 * material, no git creds — the guard-executed bash inherits only this env),
 * and books the evidence (receipts, denies, reward, causal chain).
 *
 * LAWS BOUND IN:
 *   - SERVE-WINDOW: reef serve spawned per run, SIGTERM in finally, liveness
 *     re-checked after kill — 0 reef processes after, proven. If 8900 is
 *     already healthy, REUSE (never duplicate a sibling's instance).
 *   - GUARD-IN-PATH: the episode imports GuardedLocalEnvironment from the
 *     fleet tree (agents/swe-guard/guard_env.py) and runs a liveness selftest
 *     (allow + scoped-deny) before the agent speaks — every run re-proves it.
 *   - KEYLESS-TIER-B: no keys in the episode env (allowlist scrub); the only
 *     token is the local reef service token (not a secret).
 *   - FAIL-LOUD: no receipts → no reef report (no ghost grading); skips and
 *     upstream failures are booked honestly.
 *   - CI-SAFE: REEF_VENVPY absent → honest SKIPPED row, exit 0 (the episode
 *     needs the reef venv + serve window — off-budget for CI by design).
 *
 * Env: REEF_VENVPY (default /tmp/reef-venv/bin/python), REEF_RUNG3_TIMEOUT_MS.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const AG = __dirname;
const WORK = "/tmp/reef-rung3";
const REEF_PORT = 8900;
const SHIM_PORT = 3040;
const VENVPY = process.env.REEF_VENVPY || "/tmp/reef-venv/bin/python";
const EP_TIMEOUT = parseInt(process.env.REEF_RUNG3_TIMEOUT_MS ?? "300000", 10) || 300000;
const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const log = (m) => console.log(`[reef-rung3] ${m}`);

function getJson(port, urlPath, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method: "GET", timeout: timeoutMs }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(null));
    req.end();
  });
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
};

// allowlist scrub — the episode (and guard-executed bash) sees ONLY this env
function scrubEnv() {
  const keep = ["PATH", "HOME", "LANG", "LC_ALL", "TERM", "TMPDIR"];
  const env = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  // reef's artifact backend shells out to `git lfs` — the sandbox PATH lacks the
  // user-local git-lfs 3.6.1 (Z-58 sovereign unpack at ~/.local/bin, no root)
  env.PATH = `${process.env.HOME || "/home/z"}/.local/bin:${env.PATH || "/usr/local/bin:/usr/bin:/bin"}`;
  env.REEF_SERVICE_URL = `http://127.0.0.1:${REEF_PORT}`;
  env.REEF_TOKEN = "reef-rung3-local"; // local service token (reef auth, not a secret)
  env.REEF_UPSTREAM_API_KEY = "shim-keyless"; // CR-0015 shim is keyless — placeholder, same value the Z-58 run resolved
  env.DO_NOT_TRACK = "1";
  return env;
}

async function main() {
  const rows = [];
  let episode = null;
  const serve = { started: false, reused: false, pid: null, killed: false, verified_dead: null, ms: 0 };

  try {
    if (!fs.existsSync(VENVPY)) {
      rows.push({ id: "desk", status: "SKIPPED-NO-VENV", detail: `REEF_VENVPY=${VENVPY} absent — reef serve-window desk is local-lane only (CI off-budget by design); nothing estimated` });
    } else {
      // ---- shim preflight (keyless tier B upstream) ----
      const shim = await getJson(SHIM_PORT, "/health");
      if (!shim || shim.status !== 200) {
        rows.push({ id: "desk", status: "SKIPPED-SHIM-DOWN", detail: `CR-0015 shim not healthy on ${SHIM_PORT} — refusing to start a second instance (reuse law)` });
      } else {
        fs.mkdirSync(WORK, { recursive: true }); // spawn cwd + serve run_dir home
        // ---- serve-window opens (REUSE if already healthy) ----
        const pre = await getJson(REEF_PORT, "/healthz");
        if (pre && pre.status === 200) {
          serve.reused = true;
          rows.push({ id: "serve", status: "REUSED-HEALTHY", detail: "reef already healthy on 8900 — reused, not duplicated" });
        } else {
          serve.started = true;
          const t0 = Date.now();
          // detached: true → own process group, so the finally-kill takes the
          // reef CLI AND its worker child (python -m reef.service) down together
          const child = spawn(VENVPY, ["-m", "reef", "serve", "-c", path.join(AG, "reef", "rung3-stack.yaml")], {
            cwd: WORK, env: { ...scrubEnv() }, stdio: ["ignore", "ignore", "pipe"], detached: true,
          });
          serve.pid = child.pid;
          let serveErr = "";
          child.stderr.on("data", (c) => (serveErr += String(c)));
          let healthy = false;
          while (Date.now() - t0 < 60000) {
            if (!alive(child.pid)) break;
            const h = await getJson(REEF_PORT, "/healthz", 2000);
            if (h && h.status === 200) { healthy = true; break; }
            await new Promise((r) => setTimeout(r, 1500));
          }
          serve.ms = Date.now() - t0;
          if (!healthy) rows.push({ id: "serve", status: "SERVE-NO-HEALTH", detail: `reef serve not healthy within 60s`, stderr_tail: serveErr.slice(-300) });
        }

        if (serve.reused || (serve.started && alive(serve.pid) && (await getJson(REEF_PORT, "/healthz"))?.status === 200)) {
          // ---- episode ----
          const runner = path.join(AG, "reef", "rung3_guarded_episode.py");
          const t1 = Date.now();
          const r = spawnSync(VENVPY, [runner], { cwd: WORK, env: scrubEnv(), timeout: EP_TIMEOUT, encoding: "utf8" });
          const ms = Date.now() - t1;
          const resFile = path.join(WORK, "episode-result.json");
          if (fs.existsSync(resFile)) {
            try { episode = JSON.parse(fs.readFileSync(resFile, "utf8")); } catch (_) {}
          }
          if (!episode) {
            rows.push({ id: "episode", status: "NO-RESULT", detail: `runner produced no parseable result (exit ${r.status}, signal ${r.signal})`, stderr_tail: String(r.stderr || "").slice(-300) });
          } else {
            episode.desk_ms = ms;
            rows.push({ id: "episode", status: episode.ok ? "EPISODE-COMPLETE" : "EPISODE-FAILED", detail: `status=${episode.status} reward=${episode.reward} turns=${(episode.turns || []).length} bash=${episode.bash_calls} denies=${episode.guard_denies}` });
          }
        }
      }
    }
  } catch (e) {
    rows.push({ id: "desk", status: "CRASH-BOOKED", detail: String(e && e.message).slice(0, 200) });
  } finally {
    // ---- serve-window closes ALWAYS (SERVE-WINDOW LAW) ----
    if (serve.started && serve.pid) {
      try { process.kill(-serve.pid, "SIGTERM"); serve.killed = true; } // process group (CLI + worker)
      catch (_) { try { process.kill(serve.pid, "SIGTERM"); serve.killed = true; } catch (_) {} }
      const deadline = Date.now() + 10000;
      while (alive(serve.pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
      serve.verified_dead = !alive(serve.pid); // pid check + stray pgrep below = the full receipt
      let strays = [];
      try {
        const out = spawnSync("pgrep", ["-f", "reef.service"], { encoding: "utf8" });
        if (out.stdout && out.stdout.trim()) strays = out.stdout.trim().split("\n");
      } catch (_) {}
      if (!serve.verified_dead || strays.length) {
        // second chance, SIGKILL the group — the law is ZERO processes, not best effort
        try { process.kill(-serve.pid, "SIGKILL"); } catch (_) { try { process.kill(serve.pid, "SIGKILL"); } catch (_) {} }
        await new Promise((r) => setTimeout(r, 1000));
        serve.verified_dead = !alive(serve.pid);
        try {
          const out2 = spawnSync("pgrep", ["-f", "reef.service"], { encoding: "utf8" });
          strays = out2.stdout && out2.stdout.trim() ? out2.stdout.trim().split("\n") : []; // recompute, never book a stale leak
        } catch (_) {}
      }
      if (!serve.verified_dead || strays.length) rows.push({ id: "serve", status: "SERVE-WINDOW-LEAK", detail: `pid alive=${alive(serve.pid)} strays=${strays.join(",") || "0"} — FAIL LOUD` });
      else rows.push({ id: "serve", status: "SERVE-WINDOW-CLOSED", detail: "SIGTERM → verified dead, pgrep reef.service = 0 processes" });
    }
  }

  const epOk = !!(episode && episode.ok && episode.reported && (episode.receipts || []).length > 0);
  const book = {
    ok: true,
    at,
    agent: "reef-rung3 v1.0.0 (Z-60, CR-0027 — guarded agent-bash episode over reef; the booked Rung-3 condition of CR-0023)",
    laws: [
      "SERVE-WINDOW (per-run serve, finally-kill, verified dead; reuse over duplicate)",
      "GUARD-IN-PATH (every model bash via in-tree GuardedLocalEnvironment + liveness selftest each run)",
      "KEYLESS-TIER-B (allowlist-scrubbed episode env; local reef token only)",
      "FAIL-LOUD (no receipts → no reef report; skips/failures booked honestly)",
      "RECORD→REWARD (report references every inference receipt it grades)",
    ],
    preflight: { venvpy: VENVPY, shim_port: SHIM_PORT },
    serve_window: serve,
    episode,
    counts: {
      receipts: episode ? (episode.receipts || []).length : 0,
      bash_calls: episode ? episode.bash_calls || 0 : 0,
      guard_denies: episode ? episode.guard_denies || 0 : 0,
      reward: episode ? episode.reward ?? null : null,
    },
    rows,
    closed: epOk,
    note: "evidence desk — the causal chain (turn receipts → report references) is readable back from the reef agent-record sqlite (hash(scenario) store file)",
  };
  fs.writeFileSync(path.join(AG, "reef-rung3.json"), JSON.stringify(book, null, 2) + "\n");

  const md = [`# reef Rung 3 — guarded agent episode · ${at}`, "",
    "CR-0027: the CR-0023 booked condition — agent bash ONLY through the CR-0019 guard, inside the reef record→verify→reward loop.", "",
    `- closed: **${epOk}** · serve: ${serve.reused ? "reused" : serve.started ? `started+${serve.verified_dead ? "verified dead" : "LEAK"}` : "not started"}`,
    episode ? `- episode: status=${episode.status} · reward=${episode.reward} (file=${episode.file_value} vs truth=${episode.expected}) · final=${episode.final_line}` : "- episode: none this run",
    episode ? `- turns: ${(episode.turns || []).length} · receipts: ${(episode.receipts || []).length} · bash: ${episode.bash_calls} · denies: ${episode.guard_denies} · guard selftest allow=${episode.guard_selftest?.allow_ok} deny=${episode.guard_selftest?.deny_ok}` : "",
    episode ? `- receipts: ${(episode.receipts || []).map((r) => String(r).slice(0, 8) + "…").join(" ") || "—"}` : "",
    "", "| row | status | detail |", "|---|---|---|"];
  for (const r of rows) md.push(`| ${r.id} | ${r.status} | ${String(r.detail || "").replace(/\|/g, "/").slice(0, 120)} |`);
  md.push("", `store: /tmp/reef-run/.reef/agent-record/<hash(rung3-guarded-agent)>.sqlite3 — shared ledger dir with Rung 2 (basic-arithmetic).`);
  fs.writeFileSync(path.join(AG, "reef-rung3.md"), md.filter((l) => l !== "").join("\n") + "\n");

  log(`closed=${epOk} rows=${rows.length}${episode ? ` reward=${episode.reward} denies=${episode.guard_denies}` : " (no episode)"}`);
}

main().then(() => process.exit(0)).catch((e) => { log("fatal: " + (e && e.message)); process.exit(0); });
