#!/usr/bin/env node
// silence-ledger — SEE THE SILENCE (owner law, 2026-10-12: "לראות דברים שאנחנו לא רואים").
//
// Measures EVERY voice of the organism and verdicts on silence:
//   · estate repos: last local commit age + divergence from origin (ls-remote, no auth)
//   · services: port liveness (3000..3042)
//   · beats: last fire per beat from /tmp/local-beats.log
//   · network posts: last post age per account (STEEM + HIVE condenser)
// Each voice has maxSilenceMin. Output: receipts/silence-ledger.json.
// Honesty law: absence is recorded as absence ("no-data"), never invented.
//
// Run: node tools/silence-ledger.mjs [ESTATE_DIR]   (exit 0 always; verdict inside)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ESTATE = process.argv[2] || "/home/z/estate";
const FLEETHQ = join(ESTATE, "FleetHQ");
const OUT = join(FLEETHQ, "receipts", "silence-ledger.json");
const now = Date.now();
const minutes = (ms) => Math.round(ms / 60000);

// voice → max allowed silence (minutes). Conservative: a voice older than this is an ALARM.
const REPO_MAX = { FleetHQ: 180, Domain: 180, Console: 180 };
const BEAT_MAX = { "money-watch": 130, "dex-mirror": 70, "grid-pulse": 730, "office-ci-lite": 130, "office-heartbeat": 130 };
const PORTS = { "console:3000": 3000, "fleethq:3002": 3002, foreman: 3010, gateway: 3011, selfcheck: 3040, recruit: 3041, "boot-verifier": 3042 };
const ACCOUNTS = ["headcorner", "hcsoldier4", "hcsoldier5", "hcsoldier6", "cashmachine"];
const POST_MAX = 2880; // 48h — network posting voice

const ledger = { schema: "silence.ledger/1", at: new Date().toISOString(), voices: [], alarms: [], summary: "" };
const addVoice = (name, kind, lastActivityMs, maxMin, detail) => {
  const ageMin = lastActivityMs == null ? null : minutes(now - lastActivityMs);
  const verdict = ageMin == null ? "no-data" : ageMin > maxMin ? "SILENT-ALARM" : "alive";
  ledger.voices.push({ name, kind, lastActivity: lastActivityMs ? new Date(lastActivityMs).toISOString() : null, ageMin, maxSilenceMin: maxMin, verdict, ...(detail ? { detail } : {}) });
  if (verdict === "SILENT-ALARM") ledger.alarms.push(`${name}: silent ${ageMin}min (limit ${maxMin})`);
  if (verdict === "no-data") ledger.alarms.push(`${name}: no data (cannot prove alive)`);
};

// ---- 1. repos ----
for (const [repo, max] of Object.entries(REPO_MAX)) {
  const dir = join(ESTATE, repo);
  try {
    const iso = execFileSync("git", ["log", "-1", "--format=%cI"], { cwd: dir, encoding: "utf8" }).trim();
    const subject = execFileSync("git", ["log", "-1", "--format=%s"], { cwd: dir, encoding: "utf8" }).trim().slice(0, 80);
    let aheadBehind = "";
    try {
      execFileSync("git", ["fetch", "-q", "origin"], { cwd: dir, timeout: 30000 });
      const ab = execFileSync("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"], { cwd: dir, encoding: "utf8" }).trim();
      const [ahead, behind] = ab.split(/\s+/);
      if (Number(ahead) > 0 || Number(behind) > 0) aheadBehind = `ahead:${ahead} behind:${behind}`;
    } catch { aheadBehind = "origin-unreachable"; }
    addVoice(`repo/${repo}`, "repo", new Date(iso).getTime(), max, { subject, divergence: aheadBehind || "in-sync" });
  } catch { addVoice(`repo/${repo}`, "repo", null, max); }
}

// ---- 2. ports ----
for (const [name, port] of Object.entries(PORTS)) {
  const up = (() => { try { execFileSync("bash", ["-c", `echo > /dev/tcp/127.0.0.1/${port}`], { timeout: 4000 }); return true; } catch { return false; } })();
  ledger.voices.push({ name: `port/${name}`, kind: "service", lastActivity: up ? ledger.at : null, ageMin: up ? 0 : null, maxSilenceMin: 0, verdict: up ? "alive" : "SILENT-ALARM" });
  if (!up) ledger.alarms.push(`port/${name}: DOWN (:${port})`);
}

// ---- 3. beats ----
try {
  const logPath = "/tmp/local-beats.log";
  if (!existsSync(logPath)) throw new Error("log missing");
  const lines = readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  for (const [beat, max] of Object.entries(BEAT_MAX)) {
    let last = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^\[local-beats ([^\]]+)\] ([a-z0-9-]+):/);
      if (m && m[2] === beat) { last = new Date(m[1]).getTime(); break; }
    }
    addVoice(`beat/${beat}`, "beat", last, max);
  }
} catch (e) {
  for (const [beat, max] of Object.entries(BEAT_MAX)) addVoice(`beat/${beat}`, "beat", null, max, { error: String(e.message).slice(0, 60) });
}

// ---- 4. network posts (STEEM + HIVE condenser) ----
async function lastPostAge(account, url) {
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "condenser_api.get_discussions_by_author_before_date", params: [{ author: account, limit: 1 }], id: 1 }),
      signal: AbortSignal.timeout(12000),
    });
    const j = await res.json();
    const created = j?.result?.[0]?.created;
    if (!created) return { age: null, detail: "no posts" };
    return { age: now - new Date(created + "Z").getTime(), detail: created };
  } catch (e) { return { age: null, detail: `api-error: ${String(e.message).slice(0, 40)}` }; }
}
const endpoints = { steem: "https://api.steemit.com", hive: "https://api.hive.blog" };
await Promise.all(ACCOUNTS.map(async (a) => {
  for (const [chain, url] of Object.entries(endpoints)) {
    const { age, detail } = await lastPostAge(a, url);
    // lastPostAge returns AGE-ms; addVoice wants last-activity timestamp
    addVoice(`post/${chain}/${a}`, "post", age == null ? null : now - age, POST_MAX, { lastCreated: detail });
  }
}));

// ---- verdict ----
ledger.summary = ledger.alarms.length === 0 ? "ALL VOICES ALIVE" : `${ledger.alarms.length} ALARM(S): ${ledger.alarms.join(" · ")}`;
try {
  mkdirSync(join(FLEETHQ, "receipts"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(ledger, null, 1) + "\n");
} catch {}
console.log(`SILENCE-LEDGER: ${ledger.summary}`);
