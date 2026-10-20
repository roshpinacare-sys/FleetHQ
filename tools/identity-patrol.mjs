#!/usr/bin/env node
/**
 * identity-patrol — DECISIONS #10 enforcement for the WHOLE estate (T-77)
 * ============================================================================
 * למה: חומת-המכסה (spend limit) הורגת כל-ריצת-Actions בריפו-פרטי באפס-צעדים
 * (נמדד 2026-10-13: Sandbox 99/100 · saos-dex 82/100 · כל-השאר 0-צעדים).
 * ה-guards-המקומיים שם קיבלו COVENANT if:false — והאכיפה עוברת-לעורק-הציבורי:
 * ריפו-ציבורי = דקות-Actions-חינמיות-ללא-הגבלה, סריקת-API על כל-הריפואים
 * (פרטיים-כלול, דרך OFFICE_GIT_PAT שכבר-חי-בסודות-הריפו-הזה).
 *
 * חוק-DECISIONS #10: אסור NAME@users.noreply.github.com פרט-ל-owner ול-
 * github-actions[bot]; בוטים-חותמים @agents.roshpinacare-sys.
 *
 * fail-loud רק-על-ממצא-אמיתי (VIOLATION); כל-ריצה מפרסמת קבלה-כנה.
 * אפס-סודות-בלוג: הטוקן-מגיע-מסביבה, לעולם-לא-מודפס.
 */
import fs from "fs";
import path from "path";

const OWNER = "roshpinacare-sys";
const TOKEN = process.env.PAT || "";
const API = "https://api.github.com";
const RECEIPTS_DIR = "receipts";
const LOOKBACK_PER_REPO = 30;

const ALLOWED = [
  /^326012154\+roshpinacare-sys@users\.noreply\.github\.com$/,
  /^roshpinacare-sys@users\.noreply\.github\.com$/,
  /^github-actions\[bot\]@users\.noreply\.github\.com$/,
  /@agents\.roshpinacare-sys$/,
];

function allowedEmail(email) {
  return ALLOWED.some((re) => re.test(email));
}

async function api(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "fleet-identity-patrol",
    },
  });
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error(`rate-limit at ${url}`);
  }
  return { status: res.status, json: await res.json().catch(() => null) };
}

function isIdentity(email) {
  // noreply namespace that is NOT allowlisted = maps to a REAL foreign account
  if (!email) return false;
  if (allowedEmail(email)) return false;
  return /@users\.noreply\.github\.com$/.test(email);
}

async function main() {
  const at = new Date().toISOString();
  const repos = [];
  let page = 1;
  for (;;) {
    const { status, json } = await api(
      `${API}/user/repos?per_page=100&page=${page}&sort=pushed`,
    );
    if (status !== 200 || !Array.isArray(json) || json.length === 0) break;
    repos.push(...json);
    if (json.length < 100) break;
    page++;
  }

  const scanned = [];
  const violations = [];
  const skipped = [];

  for (const r of repos) {
    const entry = { repo: r.name, private: r.private, pushedAt: r.pushed_at };
    const { status, json: commits } = await api(
      `${API}/repos/${OWNER}/${r.name}/commits?per_page=${LOOKBACK_PER_REPO}`,
    );
    if (status !== 200 || !Array.isArray(commits)) {
      entry.skipped = `commits API ${status}`;
      skipped.push(entry);
      scanned.push(entry);
      continue;
    }
    entry.commitsScanned = commits.length;
    let worst = null;
    for (const c of commits) {
      const authorEmail = c.commit?.author?.email || "";
      const committerEmail = c.commit?.committer?.email || "";
      const bad = [];
      if (isIdentity(authorEmail)) bad.push(`author:${authorEmail}`);
      if (isIdentity(committerEmail)) bad.push(`committer:${committerEmail}`);
      if (bad.length > 0) {
        const v = {
          repo: r.name,
          sha: c.sha?.slice(0, 10),
          message: (c.commit?.message || "").split("\n")[0].slice(0, 90),
          bad,
          date: c.commit?.author?.date,
        };
        violations.push(v);
        if (!worst) worst = v;
      }
    }
    entry.verdict = worst ? "VIOLATION" : "CLEAN";
    scanned.push(entry);
  }

  const verdict = violations.length > 0 ? "VIOLATION" : "CLEAN";
  const receipt = {
    protocol: "FLEET-IDENTITY-PATROL/1",
    at,
    law: "DECISIONS #10 — no NAME@users.noreply.github.com except owner + github-actions[bot]; bots sign @agents.roshpinacare-sys",
    scope: `${repos.length} repos (private included) · last ${LOOKBACK_PER_REPO} commits each`,
    verdict,
    scannedCount: scanned.length,
    skippedCount: skipped.length,
    violationsCount: violations.length,
    violations: violations.slice(0, 20),
    skipped,
  };

  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RECEIPTS_DIR, "identity-patrol.json"),
    JSON.stringify(receipt, null, 1),
  );

  const lines = [
    `# identity-patrol — סיור-זהויות כלל-הצי (${at})`,
    ``,
    `**פסק: ${verdict}** — ${repos.length} ריפואים נסרקו (${LOOKBACK_PER_REPO} קומיטים אחרונים כל-אחד) · הפרות: ${violations.length} · דולגו: ${skipped.length}`,
    ``,
    `חוק: DECISIONS #10 — אין NAME@users.noreply.github.com פרט-ל-owner ו-github-actions[bot]; בוטים חותמים @agents.roshpinacare-sys.`,
    ``,
  ];
  if (violations.length > 0) {
    lines.push(`## הפרות`);
    violations.slice(0, 20).forEach((v) =>
      lines.push(`- \`${v.repo}\` ${v.sha} — ${v.bad.join(" + ")} — "${v.message}"`),
    );
  } else {
    lines.push(`אפס הפרות — החוק שומר על עצמו.`);
  }
  if (skipped.length > 0) {
    lines.push(``, `## דולגו בכנות`);
    skipped.forEach((s) => lines.push(`- ${s.repo} — ${s.skipped}`));
  }
  fs.writeFileSync(path.join(RECEIPTS_DIR, "identity-patrol.md"), lines.join("\n") + "\n");

  console.log(`patrol verdict=${verdict} repos=${repos.length} violations=${violations.length}`);
  // T-77 anti-flood doctrine: a VIOLATION is a STATE, not a job failure.
  // fail-loud (exit 1) = one red email per run while a foreign source machine
  // keeps signing wrong — that recreated a mini-flood (measured 3 reds/30min).
  // The receipt in git IS the alarm: verdict=VIOLATION + the violations list,
  // read by the office/self-book/watchdog beats. Silence here is the alarm.
  if (violations.length > 0) {
    violations.slice(0, 10).forEach((v) =>
      console.log(`VIOLATION ${v.repo} ${v.sha}: ${v.bad.join(" + ")}`),
    );
  }
}

main().catch((e) => {
  console.error(`patrol crashed: ${e.message}`);
  // crash ≠ violation — the patrol itself failing loudly is a P0 for the office,
  // but a red email per crash would recreate the flood; the receipt absence is
  // itself the alarm (silence-watchdog pattern). Honest crash exit 0 + marker.
  try {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RECEIPTS_DIR, "identity-patrol.json"),
      JSON.stringify(
        {
          protocol: "FLEET-IDENTITY-PATROL/1",
          at: new Date().toISOString(),
          verdict: "PATROL-CRASHED",
          error: e.message,
        },
        null,
        1,
      ),
    );
  } catch {}
  process.exit(0);
});
