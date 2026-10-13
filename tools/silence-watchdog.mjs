#!/usr/bin/env node
// silence-watchdog — THE ALARM CHANNEL THAT SURVIVES THE SANDBOX.
//
// Owner law (trace 1a1319c4): "לכסות דברים שאנחנו לא רואים" + "שתישאר גם
// בלי שום תלות בסנדבוקס". The local silence-ledger measures the estate from
// INSIDE the box — useless the moment the box dies (3 wipes today). This
// tool runs on GitHub Actions, sees only PUBLIC truth, and speaks through
// GitHub Issues (GITHUB_TOKEN — zero secrets, zero sandbox, email to owner):
//
//   voices (actions-scope):
//     · origin/{repo}        — HEAD commit age via anonymous GitHub API
//     · divergence/{repo}    — origin divergence per repo: ahead/behind. In the
//                              sandbox measured directly (fetch + rev-list
//                              HEAD...origin/main); on Actions heard through
//                              git from the sandbox's own honest receipt
//                              (receipts/push-queue.json, written by the flush
//                              beat every 15min). Alarms: ahead > 10 for more
//                              than 1h (push-queue stuck — persistence proven
//                              from the receipt's git history, not assumed) or
//                              behind > 20 (silent fork drift).
//     · sandbox-ledger       — age of receipts/silence-ledger.json AT ORIGIN
//                              (the sandbox voice heard through git; stuck
//                              without PAT = honest alarm, that is the point)
//     · pages/money          — dex/money.json publishedAt age (live site truth)
//     · pages/site-audit     — audit verdict FAIL = the live site is broken
//
// Lanes: (1) Issue "SILENCE ALARM" — TRANSITION-ONLY writes (Anti-Storm Law §2,
//        trace 1a1374da43d52c39 "one signature, one escalation"): the issue is
//        edited/created ONLY when the verdict signature changes (a voice went
//        down or recovered); an unchanged signature with the issue already open
//        gets ZERO emails; (2) receipt committed ONLY when the verdict signature
//        changes (no-noise law); (3) state/silence-watchdog/state.json committed
//        EVERY run — its commit timestamp at origin is the meta-voice.
// DRY=1 → measure + receipt + state preview only, no issue/commit lanes (safe anywhere).
//
// Run: node tools/silence-watchdog.mjs    (exit 0 always; verdict in receipt)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const REPO_FULL = process.env.GITHUB_REPOSITORY || "roshpinacare-sys/FleetHQ";
const ORG = REPO_FULL.split("/")[0];
const DRY = process.env.DRY === "1";
const PAGES = "https://roshpinacare-sys.github.io/Domain";
const now = Date.now();
const minutes = (ms) => Math.round(ms / 60000);

const ledger = { schema: "silence.watchdog/1", at: new Date().toISOString(), scope: "actions", voices: [], alarms: [], summary: "" };
const addVoice = (name, lastActivityMs, maxMin, detail) => {
  const ageMin = lastActivityMs == null ? null : minutes(now - lastActivityMs);
  const verdict = ageMin == null ? "no-data" : ageMin > maxMin ? "SILENT-ALARM" : "alive";
  ledger.voices.push({ name, lastActivity: lastActivityMs ? new Date(lastActivityMs).toISOString() : null, ageMin, maxSilenceMin: maxMin, verdict, ...(detail ? { detail } : {}) });
  if (verdict === "SILENT-ALARM") ledger.alarms.push(`${name}: silent ${ageMin}min (limit ${maxMin})`);
  if (verdict === "no-data") ledger.alarms.push(`${name}: no data (cannot prove alive)`);
};

// git transport: anonymous fetch of a public repo main → FETCH_HEAD. No API
// rate limits, no token, works from Actions and from a bare box alike.
const gitOrigin = (args) => {
  try { return execFileSync("git", args, { encoding: "utf8", timeout: 45000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
};
// exit-code truth: `git fetch -q` succeeds SILENTLY — empty stdout is success,
// not failure (measured bug caught by this round's own dry-run).
const gitOk = (args) => {
  try { execFileSync("git", args, { timeout: 45000, stdio: ["ignore", "ignore", "ignore"] }); return true; } catch { return false; }
};
const originTip = (repo) => {
  const url = `https://github.com/${ORG}/${repo}`;
  // explicit refspec: FETCH_HEAD would point at the LAST fetch, not this repo
  if (!gitOk(["fetch", "-q", url, "+main:refs/wd/" + repo])) return null;
  const meta = gitOrigin(["log", "-1", "--format=%cI|%s", "refs/wd/" + repo]);
  if (!meta) return null;
  const [iso, ...rest] = meta.split("|");
  return { iso, subject: rest.join("|").slice(0, 70) };
};

// ---- 1. origin repo HEAD ages (git transport, no API rate limits) ----
const tips = {};
for (const repo of ["FleetHQ", "Domain", "Console"]) {
  const tip = originTip(repo);
  tips[repo] = tip;
  if (tip) addVoice(`origin/${repo}`, new Date(tip.iso).getTime(), 240, { subject: tip.subject });
  else addVoice(`origin/${repo}`, null, 240, { error: "origin-unreachable" });
}

// ---- 2. origin divergence (the push-queue voice) ----
// Source per repo: direct git where the estate clone exists (sandbox), the
// flush beat's queue receipt through git everywhere else (Actions). The 1h
// persistence rule is proven from the receipt's OWN git history — the newest
// queue receipt committed ≥60min ago must show the same ahead>10 — a shallow
// checkout or a first-day queue reports persistence-unknown honestly instead
// of guessing.
const ESTATE = "/home/z/estate";
const queueOf = (raw) => { try { return JSON.parse(raw); } catch { return null; } };
const queueRows = (q) => (q && Array.isArray(q.repos) ? q.repos : []).map((r) => ({ repo: String(r.name || "").split("/")[1], ahead: Number(r.ahead) || 0, behind: Number(r.behind) || 0 }));
const persistedQueue = () => {
  const cutoff = new Date(now - 60 * 60_000).toISOString();
  const sha = gitOrigin(["log", "-1", "--format=%H", "--before=" + cutoff, "--", "receipts/push-queue.json"]);
  if (!sha) return { q: null, why: "queue-history-unavailable" };
  const q = queueOf(gitOrigin(["show", `${sha}:receipts/push-queue.json`]));
  return q ? { q, why: "ok" } : { q: null, why: "queue-history-unreadable" };
};
const persistence = persistedQueue();
for (const repo of ["FleetHQ", "Domain", "Console"]) {
  const localDir = `${ESTATE}/${repo}`;
  let ahead = null, behind = null, source = null, atMs = null;
  let isRepo = false;
  try { execFileSync("git", ["-C", localDir, "rev-parse", "--git-dir"], { timeout: 8000, stdio: ["ignore", "ignore", "ignore"] }); isRepo = true; } catch {}
  if (isRepo) {
    source = "local-git";
    if (gitOk(["-C", localDir, "fetch", "-q", "origin", "main"])) {
      const ab = gitOrigin(["-C", localDir, "rev-list", "--left-right", "--count", "HEAD...origin/main"]);
      if (ab) { const [a, b] = ab.split(/\s+/).map(Number); ahead = a || 0; behind = b || 0; atMs = now; }
    }
  } else {
    source = "push-queue-receipt (via git)";
    const q = tips["FleetHQ"] ? queueOf(gitOrigin(["show", "refs/wd/FleetHQ:receipts/push-queue.json"])) : null;
    const row = queueRows(q).find((r) => r.repo === repo);
    if (row) { ahead = row.ahead; behind = row.behind; atMs = q.at ? new Date(q.at).getTime() : null; }
  }
  const detail = { source, ahead, behind };
  if (ahead == null) detail.error = "divergence-unmeasurable";
  addVoice(`divergence/${repo}`, atMs, 75, detail);
  if (ahead == null) continue;
  if (behind > 20) ledger.alarms.push(`divergence/${repo}: silent fork drift — behind ${behind} > 20 (measured via ${source})`);
  if (ahead > 10) {
    const oldRow = queueRows(persistence.q).find((r) => r.repo === repo);
    if (oldRow && oldRow.ahead > 10) ledger.alarms.push(`divergence/${repo}: push-queue stuck — ahead ${ahead} > 10 for >1h (was ${oldRow.ahead} at ${persistence.q.at})`);
    else detail.note = `ahead ${ahead} > 10, persistence unknown (${persistence.why}) — stuck-alarm needs 1h of queue history`;
  }
}

// ---- 3. sandbox voice heard through git (origin silence-ledger receipt) ----
try {
  const raw = tips["FleetHQ"] ? gitOrigin(["show", "refs/wd/FleetHQ:receipts/silence-ledger.json"]) : "";
  const local = raw ? JSON.parse(raw) : null;
  addVoice("sandbox-ledger (via git)", local?.at ? new Date(local.at).getTime() : null, 180, { localSummary: String(local?.summary || "").slice(0, 80) });
} catch {
  addVoice("sandbox-ledger (via git)", null, 180, { error: "receipt-unreachable" });
}

// ---- 4. live Pages truth ----
const pickTs = (j) => {
  for (const k of ["producedAt", "publishedAt", "at", "checkedAt"]) if (j && j[k]) return new Date(j[k]).getTime();
  return null;
};
try {
  const res = await fetch(`${PAGES}/dex/money.json`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`http ${res.status}`);
  addVoice("pages/money", pickTs(await res.json()), 240, { url: "dex/money.json" });
} catch (e) {
  addVoice("pages/money", null, 240, { error: String(e.message).slice(0, 50) });
}
try {
  const res = await fetch(`${PAGES}/agents/site-audit.json`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const audit = await res.json();
  const findings = audit?.summary?.findings;
  addVoice("pages/site-audit", pickTs(audit), 360, { verdict: findings ? `findings:${findings}` : "unknown", at: audit?.at });
  if (Number(findings) > 0) ledger.alarms.push(`pages/site-audit: LIVE SITE BROKEN (${findings} findings at ${audit.at})`);
} catch (e) {
  addVoice("pages/site-audit", null, 360, { error: String(e.message).slice(0, 50) });
}

// ---- verdict ----
ledger.summary = ledger.alarms.length === 0 ? "ALL VISIBLE VOICES ALIVE" : `${ledger.alarms.length} ALARM(S): ${ledger.alarms.join(" · ")}`;
console.log(`SILENCE-WATCHDOG: ${ledger.summary}`);

// runbook lane: every alarm class carries its one-page runbook (docs/runbooks/
// — the issue body points the responder at the exact page, no memory needed).
const runbooksFor = (alarms) => {
  const classes = new Set(["silence"]);
  if (alarms.some((a) => /push-queue|divergence|flush/i.test(a))) classes.add("flush-stuck");
  if (alarms.some((a) => /site-audit|BROKEN/i.test(a))) classes.add("site-broken");
  if (alarms.some((a) => /pages\/money|veritas|stale/i.test(a))) classes.add("veritas-stale");
  if (alarms.some((a) => /key|census|drift-key/i.test(a))) classes.add("keys-drift");
  return [...classes];
};

// ---- receipt (always) ----
const RECEIPT = "receipts/silence-watchdog.json";
mkdirSync("receipts", { recursive: true });
writeFileSync(RECEIPT, JSON.stringify(ledger, null, 1) + "\n");

// ---- state: the transition-dedup brain (Anti-Storm Law §2) ----
// state/silence-watchdog/state.json stores per-voice last verdicts, the global
// verdict signature (sha256 of the sorted verdict table), the alarm issue's
// last-published body hash, and a bounded run history. The issue is touched
// ONLY when the signature changes — one signature, one escalation; no repeat
// emails for a known, still-open signature.
const STATE_DIR = "state/silence-watchdog";
const STATE_PATH = `${STATE_DIR}/state.json`;
gitOk(["fetch", "-q", "origin", "+main:refs/wd/self"]); // freshest origin state, best-effort
const loadPrevState = () => {
  for (const read of [
    () => gitOrigin(["show", `refs/wd/self:${STATE_PATH}`]),
    () => execFileSync("git", ["show", `HEAD:${STATE_PATH}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
    () => readFileSync(STATE_PATH, "utf8"),
  ]) {
    try { const s = JSON.parse(read()); if (s && typeof s === "object" && s.schema === "silence-watchdog.state/1") return s; } catch {}
  }
  return null; // first run — state created if missing
};
const prevState = loadPrevState();
const signatureOf = (voices) => {
  const sorted = voices.map((v) => [v.name, v.verdict]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return "sig:" + createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 16);
};
const signature = signatureOf(ledger.voices);
const perVoice = {};
for (const v of ledger.voices) perVoice[v.name] = v.verdict;
const sigChanged = !prevState || prevState.signature !== signature;
console.log(`transition-dedup: signature=${signature} changed=${sigChanged} (one signature, one escalation)`);

if (DRY) {
  console.log("DRY: lanes skipped");
  console.log("DRY state-preview: " + JSON.stringify({ signature, sigChanged, prevSignature: prevState?.signature ?? null, prevStateAt: prevState?.at ?? null, alarms: ledger.alarms.length, perVoice }));
  process.exit(0);
}

const bodyHashOf = (s) => "sha256:" + createHash("sha256").update(s).digest("hex").slice(0, 16);

// ---- issue lane (the owner's email — TRANSITION-ONLY) ----
const ISSUE_TITLE = "🚨 SILENCE ALARM — a voice of the organism stopped";
const ghCli = (args) => execFileSync("gh", args, { encoding: "utf8", timeout: 30000 });
const table = ledger.voices.map((v) => `| ${v.name} | ${v.lastActivity || "—"} | ${v.ageMin ?? "—"}m | ${v.verdict} |`).join("\n");
const runbookLines = runbooksFor(ledger.alarms).map((c) => `Runbook: docs/runbooks/${c}.md`).join("\n");
const body = `Measured at ${ledger.at} (actions-scope, public truth only). Signature: \`${signature}\`.\nThis issue is written ONLY when a voice changes state (Anti-Storm Law §2: one signature, one escalation — no repeat emails for a known, still-open signature).\n\n| voice | last activity | age | verdict |\n|---|---|---|---|\n${table}\n\n**Summary:** ${ledger.summary}\n\n${runbookLines}\n\n_This issue is managed by silence-watchdog (every 15min, transition-only). It closes itself when every visible voice recovers. Meta-law: because updates are transition-only, the watchdog's liveness is proven by the state commit — if state/silence-watchdog/state.json stops advancing at origin every ~15min, the watchdog itself is dead — that too is an alarm._`;

let issueNumber = null;
let issueBodyHash = prevState?.issue?.bodyHash || null;
let issueAction = "none";

try {
  const open = JSON.parse(ghCli(["issue", "list", "--state", "open", "--search", "SILENCE ALARM in:title", "--json", "number,title"]));
  const existing = open.find((i) => i.title.startsWith("🚨 SILENCE ALARM"));
  if (ledger.alarms.length > 0) {
    if (existing) {
      // [exec28/fh-1d] race-proof dedup: the issue body itself carries the
      // signature — the issue is the persistent record, so dedup must not
      // depend on the state commit winning a push race. Edit only when the
      // body's recorded signature differs from the live signature.
      let existingSig = null, issueViewOk = false;
      try {
        const cur = JSON.parse(ghCli(["issue", "view", String(existing.number), "--json", "body"]));
        existingSig = /Signature:\s*`(sig:[0-9a-f]+)`/.exec(String(cur.body || ""))?.[1] || null;
        issueViewOk = true;
      } catch {}
      const bodyDiffers = issueViewOk && existingSig !== signature;
      if (issueViewOk && !bodyDiffers) {
        issueNumber = existing.number; issueAction = "no-change";
        console.log("issue-lane: no-change — issue body already carries this signature → ZERO email (race-proof dedup)");
      } else if (!issueViewOk ? sigChanged : bodyDiffers) {
        ghCli(["issue", "edit", String(existing.number), "--body", body]);
        issueNumber = existing.number; issueBodyHash = bodyHashOf(body); issueAction = "edited";
        console.log(`issue-lane: refreshed #${existing.number} — body signature ${existingSig ?? "(none)"} → ${signature} (one transition email)`);
      } else {
        issueNumber = existing.number; issueAction = "no-change";
        console.log("issue-lane: no-change — signature unchanged and alarm issue already open → ZERO email");
      }
    } else if (!sigChanged && prevState?.issue?.number) {
      // the recorded alarm issue is not open anymore while the signature is
      // unchanged: a human closed it deliberately — respect that; re-opening
      // would fight the operator and storm. A signature CHANGE re-escalates.
      issueNumber = prevState.issue.number; issueAction = "external-close-respected";
      console.log(`issue-lane: alarm issue #${prevState.issue.number} closed externally with signature unchanged — respected, not re-opened (zero email)`);
    } else if (!sigChanged && prevState?.issue?.lastAction === "created-parse-unknown") {
      issueNumber = null; issueAction = "no-change";
      console.log("issue-lane: assuming the previous run's alarm issue exists (number unrecorded) — zero email");
    } else {
      const created = ghCli(["issue", "create", "--title", ISSUE_TITLE, "--body", body]);
      issueBodyHash = bodyHashOf(body); issueAction = "created";
      const m = /issues\/(\d+)\s*$/.exec(String(created).trim());
      if (m) { issueNumber = Number(m[1]); }
      else issueAction = "created-parse-unknown";
      console.log(`issue-lane: created alarm issue #${issueNumber ?? "?"} (new escalation — first run, prior create failed, or signature changed)`);
    }
  } else if (existing) {
    ghCli(["issue", "close", String(existing.number), "--comment", `recovered at ${ledger.at} — ${ledger.summary}`]);
    issueNumber = existing.number; issueBodyHash = null; issueAction = "closed";
    console.log(`issue-lane: all visible voices recovered → closed #${existing.number}`);
  } else {
    console.log("issue-lane: all clear, nothing to close");
  }
} catch (e) {
  if (issueAction === "none" || issueAction === "no-change") issueAction = "issue-lane-unavailable";
  console.log(`issue-lane: unavailable (${String(e.message).slice(0, 80)}) — receipt still recorded`);
}

// ---- state file (the run receipt lives here; written EVERY run) ----
const state = {
  schema: "silence-watchdog.state/1",
  at: ledger.at,
  signature,
  perVoice,
  issue: { number: issueNumber, bodyHash: issueBodyHash, lastAction: issueAction, at: ledger.at },
  runs: [...(prevState?.runs || []), { at: ledger.at, alarms: ledger.alarms.length, issueAction }].slice(-8),
};
mkdirSync(STATE_DIR, { recursive: true });
writeFileSync(STATE_PATH, JSON.stringify(state, null, 1) + "\n");

// ---- commit lane ----
// (a) verdict receipt: committed ONLY when the verdict signature changed (no-noise law);
// (b) state file: committed EVERY run — its commit timestamp at origin is the
//     meta-voice (liveness proof under transition-only issue updates).
// Push follows the fleet pattern: [skip ci], pull --rebase retry loop; a lost
// race names its terminal publish-deferred and exits 0 (Anti-Storm Law §5).
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };
try {
  // [exec28/fh-1d] repo-local identity BEFORE the loop: pull --rebase inside the
  // retry loop replays commits and needs a committer identity (measured:
  // "Committer identity unknown" silently killed retries 4-5).
  execFileSync("git", ["config", "user.name", "silence-watchdog"]);
  execFileSync("git", ["config", "user.email", "silence-watchdog@agents.roshpinacare-sys"]);
  const files = sigChanged ? [RECEIPT, STATE_PATH] : [STATE_PATH];
  if (!sigChanged) { try { execFileSync("git", ["checkout", "--", RECEIPT]); } catch {} }
  execFileSync("git", ["add", ...files]);
  execFileSync("git", ["-c", "user.name=silence-watchdog", "-c", "user.email=silence-watchdog@agents.roshpinacare-sys",
    "commit", "-q", "-m", `silence-watchdog: ${ledger.alarms.length === 0 ? "all visible voices alive" : ledger.alarms.length + " alarm(s)"} sig=${signature} [skip ci]`]);
  let pushed = false;
  for (let i = 1; i <= 5 && !pushed; i++) {
    try { execFileSync("git", ["pull", "--rebase", "-q", "origin", "main"]); } catch { try { execFileSync("git", ["rebase", "--abort"]); } catch {} }
    try { execFileSync("git", ["push", "-q", "origin", "HEAD"]); pushed = true; }
    catch { console.log(`commit-lane: push race lost (attempt ${i}/5) — rebase + retry`); if (i < 5) sleepSync(i * 4000); }
  }
  if (pushed) console.log(`commit-lane: state committed${sigChanged ? " + receipt (verdict transition)" : ""} — meta-voice advanced`);
  else console.log("commit-lane: publish-deferred — push lost the race after 5 retries; state survives in the run log; next flight re-lands it (law §5)");
} catch (e) {
  console.log(`commit-lane: skipped (${String(e.message).slice(0, 80)})`);
}
