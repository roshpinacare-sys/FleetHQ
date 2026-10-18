// ifixai-audit-build.mjs — builds office-window/dist/ifixai-audit.json from iFixAi run reports.
// Honesty law: every field is a measured fact from the report files. A missing/failed run is
// recorded as such (ran:false + reason) — never faked green, never partial substitution.
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";

const ARG_OUT = process.argv[2] || "office-window/dist/ifixai-audit.json";
const MOCK_DIR = process.env.MOCK_DIR || "/tmp/ifixai-mock";
const BRAIN_DIR = process.env.BRAIN_DIR || "/tmp/ifixai-brain";
const BRAIN_MODEL = process.env.BRAIN_MODEL || "";
const BRAIN_HOST = process.env.BRAIN_HOST || ""; // host only — never the key

function latestJson(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => `${dir}/${f}`)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files.length ? JSON.parse(readFileSync(files[0], "utf8")) : null;
}
function summarize(dir) {
  let rep = null;
  try {
    rep = latestJson(dir);
  } catch {
    return { ran: false, reason: "report-unreadable" };
  }
  if (!rep) return { ran: false, reason: "no-report" };
  const tests = Array.isArray(rep.test_results) ? rep.test_results : [];
  return {
    ran: tests.length > 0,
    grade: rep.overall?.grade ?? null,
    passed: rep.overall?.passed ?? null,
    strategicScorePct: rep.overall?.strategic_score_pct ?? null,
    selfJudged: rep.metadata?.self_judged ?? null,
    system: rep.metadata?.system_name ?? null,
    tests: tests.map((t) => ({
      id: t.test_id,
      name: t.name,
      category: t.category,
      scorePct: t.score_pct,
      passing: t.passing,
      path: t.evaluation_path,
    })),
  };
}

mkdirSync("office-window/dist", { recursive: true });
const mock = summarize(MOCK_DIR);
const brain = BRAIN_HOST ? summarize(BRAIN_DIR) : { ran: false, reason: "secret-missing" };
// measured-lane reason: if the sandbox lane owns the brain audit (runner→NIM chat is
// starved by the vendor — models 200/0.17s, raw chat 000/45s, measured 2026-10-18),
// the workflow records that honestly instead of a bare "no-report"
if (!brain.ran && process.env.BRAIN_REASON) brain.reason = process.env.BRAIN_REASON;
if (brain.ran) {
  brain.model = BRAIN_MODEL || null;
  brain.endpointHost = BRAIN_HOST;
  brain.doctrineFile = "office-window/ifixai-doctrine.txt";
}
// the mock fixture ships seeded defects BY DESIGN (vendor doc) — the honest signal is
// "pipeline alive + full scorecard produced", not the grade itself.
if (mock.ran) mock.note = "seeded-defect fixture fails by design — proof is that the pipeline ran and produced a full scorecard";
if (brain.ran) brain.note = "vanilla LLM + SAOS doctrine system-prompt; smoke structural suite; self-judged (single vendor credential) — not a citable cross-vendor grade";

const out = {
  schema: "saos.ifixai-audit/1",
  generatedAt: new Date().toISOString(),
  tool: {
    name: "ifixai",
    repo: "https://github.com/ifixai-ai/iFixAi",
    role: "independent misalignment auditor for the fleet's LLM decision brains",
  },
  mock,
  brain,
  honesty:
    "measured facts only — a missing or failed run is recorded, never faked green; secrets never appear in this file",
};
writeFileSync(ARG_OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`ifixai-audit-build: wrote ${ARG_OUT} (mock.ran=${mock.ran}, brain.ran=${brain.ran})`);
