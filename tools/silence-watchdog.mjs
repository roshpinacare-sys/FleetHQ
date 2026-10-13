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
// Lanes: (1) Issue "SILENCE ALARM" created/updated/closed idempotently;
//        (2) receipt committed ONLY when the alarm set changes (no-noise law).
// DRY=1 → measure + receipt only, no issue/commit lanes (safe anywhere).
//
// Run: node tools/silence-watchdog.mjs    (exit 0 always; verdict in receipt)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
const prevRaw = (() => { try { return execFileSync("git", ["show", `HEAD:${RECEIPT}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } })();
writeFileSync(RECEIPT, JSON.stringify(ledger, null, 1) + "\n");
if (DRY) { console.log("DRY: lanes skipped"); process.exit(0); }

const prevAlarms = (() => { try { return JSON.stringify(JSON.parse(prevRaw).alarms || []); } catch { return "[]"; } })();
const nextAlarms = JSON.stringify(ledger.alarms);

// ---- issue lane (the owner's email) ----
const ISSUE_TITLE = "🚨 SILENCE ALARM — a voice of the organism stopped";
const ghCli = (args) => execFileSync("gh", args, { encoding: "utf8", timeout: 30000 });
const table = ledger.voices.map((v) => `| ${v.name} | ${v.lastActivity || "—"} | ${v.ageMin ?? "—"}m | ${v.verdict} |`).join("\n");
const runbookLines = runbooksFor(ledger.alarms).map((c) => `Runbook: docs/runbooks/${c}.md`).join("\n");
const body = `Measured at ${ledger.at} (actions-scope, public truth only).\n\n| voice | last activity | age | verdict |\n|---|---|---|---|\n${table}\n\n**Summary:** ${ledger.summary}\n\n${runbookLines}\n\n_This issue is managed by silence-watchdog (every 15min). It closes itself when every visible voice recovers. Meta-law: if THIS issue stops updating, the watchdog itself is dead — that too is an alarm._`;

try {
  const open = JSON.parse(ghCli(["issue", "list", "--state", "open", "--search", "SILENCE ALARM in:title", "--json", "number,title"]));
  const existing = open.find((i) => i.title.startsWith("🚨 SILENCE ALARM"));
  if (ledger.alarms.length > 0) {
    if (existing) ghCli(["issue", "edit", String(existing.number), "--body", body]);
    else ghCli(["issue", "create", "--title", ISSUE_TITLE, "--body", body]);
  } else if (existing) {
    ghCli(["issue", "close", String(existing.number), "--comment", `recovered at ${ledger.at} — ${ledger.summary}`]);
  }
  console.log("issue-lane: done");
} catch (e) {
  console.log(`issue-lane: unavailable (${String(e.message).slice(0, 80)}) — receipt still recorded`);
}

// ---- commit lane (no-noise law: commit only when the alarm SET changed) ----
if (prevAlarms !== nextAlarms) {
  try {
    execFileSync("git", ["add", RECEIPT]);
    execFileSync("git", ["-c", "user.name=silence-watchdog", "-c", "user.email=silence-watchdog@agents.roshpinacare-sys",
      "commit", "-q", "-m", `silence-watchdog: ${ledger.alarms.length === 0 ? "all visible voices alive" : ledger.alarms.length + " alarm(s)"} [skip ci]`]);
    execFileSync("git", ["push", "-q", "origin", "HEAD"]);
    console.log("commit-lane: verdict-change committed");
  } catch (e) {
    console.log(`commit-lane: skipped (${String(e.message).slice(0, 80)})`);
  }
} else {
  try { execFileSync("git", ["checkout", "--", RECEIPT]); } catch {}
  console.log("commit-lane: no-delta — discarding (no-noise law)");
}
