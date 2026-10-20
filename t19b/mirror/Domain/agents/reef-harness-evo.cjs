#!/usr/bin/env node
/**
 * reef-harness-evo.cjs — GEPA-class harness evolution over the guarded executor (Z-61, CR-0030).
 *
 * RENUMBER receipt: landed as CR-0029, renumbered CR-0029→CR-0030 (fifth collision,
 * later-mover law; sibling took CR-0029 for codebase-memory-mcp) — the renumber was
 * booked in the commit message only; Z-62 lands it in-file (zero content change).
 *
 * Z-62 FIX (v1.0.1, CR-0033): incumbentHarness() anchored on `return (` — an anchor
 * that matches NOTHING in the runner (the harness lives in `SYSTEM = (`). The committed
 * CR-0030 desk could NOT reproduce its own committed Z-61 book (the Z-61 run was made
 * by the pre-commit working-tree variant); the FIRST scheduled evolution window
 * (evo-windows.cjs FORCED, CR-0033) caught it live as INCUMBENT-UNREADABLE. Fix: anchor
 * on the real single source of truth. PROOF: the fixed extraction is BYTE-IDENTICAL
 * (689 chars) to Z-61's preserved pool seed (/tmp/reef-rung3/harness-0.txt).
 *
 * GEPA evolves the HARNESS (rules/skills/commands), not weights. Fleet adaptation
 * of the reef Rung-3 closed loop (CR-0027): the model REFLECTS on the booked failure
 * classes of the incumbent harness, PROPOSES candidate harness variants (system
 * prompts), and every candidate is MEASURED on fresh-integer episodes of the same
 * guarded executor — deterministic verifier, reef receipts end-to-end.
 *
 * LAWS BOUND IN:
 *   - VERIFY-ONLY: this desk MEASURES and BOOKS — it never rewrites the runner's
 *     harness. Adoption of a winning variant happens only via a judged tier-B CR
 *     (the pulse law generalized: proposals never auto-applied).
 *   - SERVE-WINDOW ×2: a shim v1.1.0 TEST instance on SHIM_EVO_PORT (CR-0024's
 *     booked parallel-instance pattern; the live :3040 service is untouched) AND a
 *     reef serve (upstream = that test instance) — both spawned per run, killed in
 *     finally, strays verified 0.
 *   - GUARD-IN-PATH: inherited from the rung-3 runner — every candidate harness
 *     runs behind the same CR-0019 GuardedLocalEnvironment; a hostile prompt
 *     cannot escape the guard, it can only lose.
 *   - FRESH-FIXTURE: every episode gets a distinct integer seed (derived from
 *     variant/episode indices) — nothing about the task is hardcodable; the
 *     verifier recomputes truth from disk regardless.
 *   - MEASURED-SELECTION: winner = best mean reward; tie → fewer mean bash-calling
 *     turns; final tie → incumbent (primacy law). All episodes reported to reef
 *     (score contract) — no cherry-picking, the attempt curve books itself.
 *   - CI-SAFE: honest SKIPPED rows when the shim source or reef venv is absent.
 *
 * Env: SHIM_ENTRY (default /home/z/my-project/mini-services/zai-openai-shim/index.ts),
 *      SHIM_EVO_PORT (default 3041), REEF_VENVPY, REEF_RUNG3_TIMEOUT_MS, EVO_VARIANTS (max 4).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const AG = __dirname;
const WORK = "/tmp/reef-rung3";
const REEF_PORT = 8900;
const SHIM_EVO_PORT = parseInt(process.env.SHIM_EVO_PORT ?? "3041", 10) || 3041;
const SHIM_ENTRY = process.env.SHIM_ENTRY || "/home/z/my-project/mini-services/zai-openai-shim/index.ts";
const VENVPY = process.env.REEF_VENVPY || "/tmp/reef-venv/bin/python";
const EP_TIMEOUT = parseInt(process.env.REEF_RUNG3_TIMEOUT_MS ?? "240000", 10) || 240000;
const MAX_VARIANTS = Math.min(4, parseInt(process.env.EVO_VARIANTS ?? "4", 10) || 4);
const EPS_PER_VARIANT = 2;
const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const log = (m) => console.log(`[reef-harness-evo] ${m}`);

const incumbentHarness = () => {
  // the canonical harness v1, read from the runner source (single source of truth)
  // Z-62: anchor is `SYSTEM = (` (the runner's real constant) — `return (` matched
  // nothing (caught live by the first CR-0033 scheduled window; see header receipt)
  const src = fs.readFileSync(path.join(AG, "reef", "rung3_guarded_episode.py"), "utf8");
  const m = src.match(/(?:SYSTEM|HARNESS)\s*=\s*\(\s*\n((?:\s*"[^"]*"\s*\n)+)\s*\)/);
  if (!m) return null;
  return m[1].split("\n").map((l) => { const s = l.trim(); return s.startsWith('"') ? s.slice(1, -1) : s; }).join("").replace(/\\"/g, '"').replace(/\\n/g, "\n");
};

function getJson(port, urlPath, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method: "GET", timeout: timeoutMs }, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(null));
    req.end();
  });
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };

function scrubEnv(extra) {
  const env = {};
  for (const k of ["PATH", "HOME", "LANG", "TERM", "TMPDIR"]) if (process.env[k]) env[k] = process.env[k];
  env.PATH = `${process.env.HOME || "/home/z"}/.local/bin:${env.PATH || "/usr/local/bin:/usr/bin:/bin"}`; // Z-58 git-lfs
  env.DO_NOT_TRACK = "1";
  return { ...env, ...extra };
}

async function main() {
  const rows = [];
  let reflection = null;
  let pool = [];
  let evaluations = [];
  let winner = null;
  const serve = { shim: { started: false, pid: null, killed: false, verified_dead: null }, reef: { started: false, pid: null, killed: false, verified_dead: null } };

  try {
    if (!fs.existsSync(VENVPY)) {
      rows.push({ id: "desk", status: "SKIPPED-NO-VENV", detail: `REEF_VENVPY=${VENVPY} absent — evolution is a local-lane measured run (CI off-budget by design)` });
    } else if (!fs.existsSync(SHIM_ENTRY)) {
      rows.push({ id: "desk", status: "SKIPPED-NO-SHIM-SOURCE", detail: `SHIM_ENTRY=${SHIM_ENTRY} absent — cannot start the v1.1.0 test instance` });
    } else {
      fs.mkdirSync(WORK, { recursive: true });

      // ---- shim v1.1.0 TEST instance (CR-0024 parallel-instance pattern) ----
      // storm ladder (Z-61 receipt: the ambient sandbox-IP 429 storm outlasted the
      // default 3×400-2000ms ladder — the classifier matched the REAL SDK string
      // "API request failed with status 429" every time; patience was the gap).
      // Env-tunable per the CR-0024 design: 6 attempts, 1s..16s cap ≈ ≤47s/request.
      // Z-62 v1.0.2: the ladder is NOW actually env-tunable — the Z-61 build
      // hardcoded the values into the child env (scrubEnv merges the extra OVER the
      // base, not process.env over the extra), so a caller could NOT raise patience
      // during an ambient storm. Caught live by the second CR-0033 window (the
      // 6-attempt ladder exhausted against the shared-IP 429; the 502 fail-loud was
      // correct behavior — the desk booked NON-ATTEMPTs and window WINDOW-NO-WINNER).
      const shim = spawn("bun", [SHIM_ENTRY], {
        env: scrubEnv({
          SHIM_PORT: String(SHIM_EVO_PORT),
          SHIM_RETRY_ATTEMPTS: process.env.SHIM_RETRY_ATTEMPTS || "6",
          SHIM_RETRY_BASE_MS: process.env.SHIM_RETRY_BASE_MS || "1000",
          SHIM_RETRY_CAP_MS: process.env.SHIM_RETRY_CAP_MS || "16000",
        }),
        stdio: ["ignore", "ignore", "pipe"], detached: true,
      });
      serve.shim.started = true; serve.shim.pid = shim.pid;
      let shimOk = false;
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        const h = await getJson(SHIM_EVO_PORT, "/health", 2000);
        if (h && h.status === 200) { shimOk = true; break; }
        if (!alive(shim.pid)) break;
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!shimOk) rows.push({ id: "shim", status: "SHIM-NO-HEALTH", detail: `test instance not healthy on ${SHIM_EVO_PORT} within 20s` });
      else rows.push({ id: "shim", status: "TEST-INSTANCE-UP", detail: `v1.1.0 queue instance on ${SHIM_EVO_PORT} (retry/backoff for the measured batch; live :3040 untouched)` });

      // ---- reef serve window (upstream = the test instance) ----
      let reefOk = false;
      if (shimOk) {
        const base = fs.readFileSync(path.join(AG, "reef", "rung3-stack.yaml"), "utf8");
        const evoYaml = path.join(WORK, "evo-stack.yaml");
        fs.writeFileSync(evoYaml, base.replace("http://127.0.0.1:3040", `http://127.0.0.1:${SHIM_EVO_PORT}`));
        const reef = spawn(VENVPY, ["-m", "reef", "serve", "-c", evoYaml], { cwd: WORK, env: scrubEnv({ REEF_TOKEN: "reef-rung3-local", REEF_UPSTREAM_API_KEY: "shim-keyless" }), stdio: ["ignore", "ignore", "pipe"], detached: true });
        serve.reef.started = true; serve.reef.pid = reef.pid;
        const t1 = Date.now();
        while (Date.now() - t1 < 60000) {
          const h = await getJson(REEF_PORT, "/healthz", 2000);
          if (h && h.status === 200) { reefOk = true; break; }
          if (!alive(reef.pid)) break;
          await new Promise((r) => setTimeout(r, 1500));
        }
        if (!reefOk) rows.push({ id: "reef", status: "SERVE-NO-HEALTH", detail: "reef (upstream evo-shim) not healthy within 60s" });
        else rows.push({ id: "reef", status: "SERVE-UP", detail: `reef on ${REEF_PORT} upstreaming to the ${SHIM_EVO_PORT} test instance` });
      }

      if (reefOk) {
        // ---- pool[0] = the incumbent (single source of truth: the runner source) ----
        const v1 = incumbentHarness();
        if (!v1) { rows.push({ id: "pool", status: "INCUMBENT-UNREADABLE", detail: "could not extract harness v1 from the runner source" }); }
        else {
          pool.push({ label: "v1-incumbent", prompt: v1, rationale: "seed (CR-0027 canonical harness, read from the runner source)" });

          // ---- reflection: the model sees the booked failure classes + harness, proposes variants ----
          const reflectionPrompt =
            "You are the harness gardener for the roshpinacare fleet's reef agent (GEPA-class evolution, CR-0029).\n" +
            "The CURRENT harness (the system prompt given to a bash-tool agent) is:\n---\n" + v1 + "\n---\n" +
            "Measured failure classes of this harness on a sum-the-files task (4 runs: rewards 0,0,0,1):\n" +
            "1. LAZY FINISH: the agent replied `FINAL: 0` on turn 1 without running any bash (reward 0 — no artifact).\n" +
            "2. PREMATURE FINAL IN A FENCE: the agent emitted multiple fenced blocks where one contained `FINAL: 42` next to the real command — the fenced FINAL is not protocol speech; the executor runs only the first non-FINAL block.\n" +
            "3. WRONG SCOPE: the agent summed only part of the files (wrote 17, truth 493 — reward 0).\n" +
            "4. Slow protocol recovery: non-protocol replies waste turns on generic nudges.\n" +
            "The executor parser already suppresses fenced FINALs; your harness text should PREVENT these behaviors, not rely on parser mercy.\n" +
            'Propose ' + (MAX_VARIANTS - 1) + ' improved harness variants. Respond with ONLY a JSON array (no prose), each element:\n' +
            '{"label": "short-kebab-label", "rationale": "one line", "prompt": "the FULL replacement system prompt text"}\n' +
            "Rules for each prompt: keep the command-guard description, the ONE command per turn via ```bash fence, the FINAL: <integer> finish convention, and the answer-file path (/tmp/reef-rung3/answer.txt). Improve turn economy and scope discipline (read ALL files before summing).";
          // reflection runs through reef via a tiny python call (keeps the receipt chain in the ledger)
          const reflScript = path.join(WORK, "reflect.py");
          fs.writeFileSync(reflScript, [
            "import json, sys, os",
            "from reef_client import ReefClient",
            "c = ReefClient('http://127.0.0.1:8900', token='reef-rung3-local', timeout_s=180.0)",
            "prompt = open(sys.argv[1]).read()",
            "body, receipt = c.inference_with_record('rung4-harness-evolution', '/v1/chat/completions', {'model': 'z-ai', 'messages': [{'role': 'user', 'content': prompt}]})",
            "content = body['choices'][0]['message']['content'] or ''",
            "print(json.dumps({'receipt': receipt, 'content': content}))",
          ].join("\n"));
          const reflPromptFile = path.join(WORK, "reflect-prompt.txt");
          fs.writeFileSync(reflPromptFile, reflectionPrompt);
          const rr = spawnSync(VENVPY, [reflScript, reflPromptFile], { cwd: WORK, env: scrubEnv(), timeout: 200000, encoding: "utf8" });
          let refl = null;
          try { refl = JSON.parse((rr.stdout || "").trim().split("\n").filter((l) => l.startsWith("{")).pop()); } catch (_) {}
          if (!refl) {
            rows.push({ id: "reflection", status: "REFLECTION-FAIL", detail: `no parseable reflection output (exit ${rr.status})`, stderr_tail: String(rr.stderr || "").slice(-200) });
          } else {
            // robust JSON-array extraction from the model's reply
            const mArr = refl.content.match(/\[\s*\{[\s\S]*\}\s*\]/);
            let variants = [];
            if (mArr) { try { variants = JSON.parse(mArr[0]); } catch (_) {} }
            variants = (Array.isArray(variants) ? variants : []).filter((v) => v && v.prompt && v.label).slice(0, MAX_VARIANTS - 1);
            reflection = { receipt: refl.receipt, proposed: variants.length, raw_chars: refl.content.length };
            for (const v of variants) pool.push({ label: String(v.label).slice(0, 40), prompt: String(v.prompt), rationale: String(v.rationale || "").slice(0, 140) });
            rows.push({ id: "reflection", status: "PROPOSED", detail: `receipt ${String(refl.receipt).slice(0, 8)}… · ${variants.length} variants accepted of ${MAX_VARIANTS - 1} requested` });
          }

          // ---- evaluation: every variant × EPS_PER_VARIANT episodes, fresh seeds ----
          for (let vi = 0; vi < pool.length; vi++) {
            const variant = pool[vi];
            const promptFile = path.join(WORK, `harness-${vi}.txt`);
            fs.writeFileSync(promptFile, variant.prompt);
            const eps = [];
            for (let e = 0; e < EPS_PER_VARIANT; e++) {
              // distinct integer sets per episode — nothing hardcodable
              const seed = [11 + vi * 7 + e * 3, 29 + vi * 5 + e * 11, 391 + vi + e * 17, 7 * (vi + 2 * e + 1), 101 + vi * 13 + e * 23].join(",");
              const r = spawnSync(VENVPY, [path.join(AG, "reef", "rung3_guarded_episode.py")], {
                cwd: WORK, timeout: EP_TIMEOUT, encoding: "utf8",
                env: scrubEnv({
                  REEF_SERVICE_URL: `http://127.0.0.1:${REEF_PORT}`, REEF_TOKEN: "reef-rung3-local",
                  RUNG3_SYSTEM: promptFile, RUNG3_SEED: seed, RUNG3_SCENARIO: "rung4-harness-evolution",
                  RUNG3_HARNESS: variant.label,
                }),
              });
              let res = null;
              try { res = JSON.parse(fs.readFileSync(path.join(WORK, "episode-result.json"), "utf8")); } catch (_) {}
              // status-aware honesty (run-1 lesson, booked): UPSTREAM-FAIL / VERIFIER-FAIL
              // are NON-ATTEMPTS — they never count as reward 0 in the mean
              const attempt = !!(res && res.ok);
              if (!res) { rows.push({ id: `ep:${variant.label}#${e}`, status: "NO-RESULT", detail: `exit ${r.status}` }); eps.push({ seed, attempt: false, reward: null, note: "no-result" }); continue; }
              if (!attempt) {
                rows.push({ id: `ep:${variant.label}#${e}`, status: "NON-ATTEMPT", detail: `status=${res.status} upstream_fail=${String(res.upstream_fail || "").slice(0, 80)}` });
                eps.push({ seed, attempt: false, reward: null, status: res.status, note: "non-attempt (never counted as reward 0)" });
                continue;
              }
              eps.push({ seed, attempt: true, reward: res.reward, turns: (res.turns || []).length, bash: res.bash_calls, denies: res.guard_denies, file: res.file_value, expected: res.expected, receiptCount: (res.receipts || []).length, ms: res.ms });
              rows.push({ id: `ep:${variant.label}#${e}`, status: res.reward === 1 ? "REWARD-1" : `REWARD-${res.reward}`, detail: `turns=${(res.turns || []).length} bash=${res.bash_calls} file=${res.file_value} truth=${res.expected}` });
            }
            const attempts = eps.filter((x) => x.attempt);
            const mean = attempts.length ? attempts.reduce((a, b) => a + b.reward, 0) / attempts.length : null; // null mean = never completed an attempt — excluded from selection, booked
            const meanTurns = attempts.length && attempts.every((x) => x.turns != null) ? attempts.reduce((a, b) => a + b.turns, 0) / attempts.length : null;
            evaluations.push({ label: variant.label, rationale: variant.rationale, eps, attempts: attempts.length, meanReward: mean, meanTurns, denies: eps.reduce((a, b) => a + (b.denies || 0), 0) });
          }

          // ---- MEASURED-SELECTION (attempts-only means; null-mean variants excluded;
          // stable sort; incumbent inserted first wins full ties) ----
          const ranked = evaluations.filter((x) => x.meanReward != null).sort((a, b) => (b.meanReward - a.meanReward) || ((a.meanTurns ?? 99) - (b.meanTurns ?? 99)));
          if (!ranked.length) rows.push({ id: "selection", status: "NO-ATTEMPTS", detail: "no variant completed a measurable attempt — honest null, nothing selected" });
          else { winner = ranked[0]; rows.push({ id: "selection", status: "MEASURED", detail: `winner=${winner.label} meanReward=${winner.meanReward} attempts=${winner.attempts}/${EPS_PER_VARIANT} (incumbent mean=${(evaluations.find((x) => x.label === "v1-incumbent") || {}).meanReward})` }); }
        }
      }
    }
  } catch (e) {
    rows.push({ id: "desk", status: "CRASH-BOOKED", detail: String(e && e.message).slice(0, 200) });
  } finally {
    // ---- serve windows close ALWAYS ----
    for (const [name, s] of [["shim", serve.shim], ["reef", serve.reef]]) {
      if (s.started && s.pid) {
        try { process.kill(-s.pid, "SIGTERM"); s.killed = true; } catch (_) { try { process.kill(s.pid, "SIGTERM"); s.killed = true; } catch (_) {} }
        const dl = Date.now() + 10000;
        while (alive(s.pid) && Date.now() < dl) await new Promise((r) => setTimeout(r, 400));
        s.verified_dead = !alive(s.pid);
        if (!s.verified_dead) { try { process.kill(-s.pid, "SIGKILL"); } catch (_) { try { process.kill(s.pid, "SIGKILL"); } catch (_) {} } await new Promise((r) => setTimeout(r, 800)); s.verified_dead = !alive(s.pid); }
        rows.push({ id: name, status: s.verified_dead ? "SERVE-WINDOW-CLOSED" : "SERVE-WINDOW-LEAK", detail: `${name} verified dead=${s.verified_dead}` });
      }
    }
  }

  const book = {
    ok: true,
    at,
    agent: "reef-harness-evo v1.0.2 (Z-61 CR-0030 [renumbered from CR-0029]; Z-62 v1.0.1 incumbent-anchor fix + v1.0.2 storm-ladder env-tunability, CR-0033 — GEPA-class harness evolution over the CR-0027 guarded executor)",
    laws: [
      "VERIFY-ONLY (the desk measures and books; adoption only via a judged tier-B CR)",
      "SERVE-WINDOW ×2 (shim v1.1.0 TEST instance + reef, killed in finally, verified dead; live :3040 untouched)",
      "GUARD-IN-PATH (every candidate runs behind the same CR-0019 guard — a hostile prompt can only lose)",
      "FRESH-FIXTURE (distinct integer seeds per episode; verifier recomputes truth from disk)",
      "MEASURED-SELECTION (best mean reward; tie → fewer mean turns; final tie → incumbent)",
    ],
    reflection,
    pool: pool.map((p) => ({ label: p.label, rationale: p.rationale, chars: p.prompt.length })),
    evaluations,
    winner: winner ? { label: winner.label, meanReward: winner.meanReward, meanTurns: winner.meanTurns } : null,
    winnerPromptFile: winner ? path.join(WORK, `harness-${pool.findIndex((p) => p.label === winner.label)}.txt`) : null,
    serve_windows: serve,
    rows,
    note: "adoption is a CR act, not a desk act — the winner prompt is preserved at winnerPromptFile for the judged landing",
  };
  fs.writeFileSync(path.join(AG, "reef-harness-evo.json"), JSON.stringify(book, null, 2) + "\n");

  const md = [`# reef harness evolution (GEPA-class) — ${at}`, "",
    "CR-0030 (renumbered from CR-0029): the model reflects on booked failure classes → proposes harness variants → every variant is measured on fresh-integer episodes behind the CR-0019 guard. VERIFY-ONLY: adoption via CR.", "",
    reflection ? `- reflection: receipt ${String(reflection.receipt).slice(0, 8)}… · ${reflection.proposed} variants accepted` : "- reflection: none this run",
    "", "| variant | rationale | eps (rewards) | mean reward | mean turns | denies |", "|---|---|---|---|---|---|"];
  for (const ev of evaluations) md.push(`| ${ev.label} | ${String(ev.rationale || "").replace(/\|/g, "/").slice(0, 60)} | ${ev.eps.map((e) => e.reward).join(", ")} | ${ev.meanReward} | ${ev.meanTurns ?? "—"} | ${ev.denies} |`);
  md.push("", winner ? `**measured winner: ${winner.label}** (mean reward ${winner.meanReward}) — adoption pending CR judgment (verify-only)` : "no winner measured this run", "");
  fs.writeFileSync(path.join(AG, "reef-harness-evo.md"), md.join("\n") + "\n");

  log(`winner=${winner ? winner.label : "none"} · rows=${rows.length}`);
}

// side-effect-free require (the Z-49 pulse lesson — caught on THIS desk live: a
// bare require() during a syntax check ran the whole measured batch. The run
// executes only as a main script.)
if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { log("fatal: " + (e && e.message)); process.exit(0); });
}
module.exports = { main };
