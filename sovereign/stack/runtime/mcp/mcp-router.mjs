// sovereign/stack/runtime/mcp/mcp-router.mjs — Layer 3's MCP edge over git transport.
// Whitelisted READ tools answered in-thread: issues labeled `mcp-invoke` with a
// JSON body {"tool": "...", "args": {...}} get the tool result as a comment and
// the `mcp-done` label (dedupe guard: never answers twice).
// tools manifest: ../mcp/tools.json (SAOS-MCP-TOOLS/1) — MCP-server-shaped so an
// HTTP adapter can front it later without changing the tool contract.
// Law: exit 0 always; one pass per flight; bounded work (max 5 issues/flight).

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const HOME = process.cwd();
const OWNER = 'roshpinacare-sys';
const REPO = 'FleetHQ';
const TOKEN = process.env.GITHUB_TOKEN || process.env.SOVEREIGN_PAT;
const RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local';
const stamp = new Date().toISOString();
const MAX_PER_FLIGHT = 5;

function ghInit() {
  const h = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sovereign-mcp-router', 'Content-Type': 'application/json' };
  return h;
}

async function listInvokeIssues() {
  if (!TOKEN) return [];
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?state=open&labels=mcp-invoke&per_page=20`, { headers: ghInit() });
  if (!res.ok) { console.error(`list issues failed: ${res.status}`); return []; }
  return res.json();
}
async function addLabel(num, label) {
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${num}/labels`, { method: 'POST', headers: ghInit(), body: JSON.stringify({ labels: [label] }) }).then(r => r.status).catch(() => null);
}
async function comment(num, body) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${num}/comments`, { method: 'POST', headers: ghInit(), body: JSON.stringify({ body }) });
  return res.status;
}

// ---- tool implementations (whitelisted READS over the committed books)
const tools = {
  sovereign_get_state: () => JSON.parse(readFileSync(`${HOME}/network/STATE.json`, 'utf8')),
  sovereign_get_scores: () => JSON.parse(readFileSync(`${HOME}/sovereign/stack/runtime/scores.json`, 'utf8')),
  sovereign_get_policy_verdicts: () => existsSync(`${HOME}/sovereign/stack/policy/verdicts.json`) ? JSON.parse(readFileSync(`${HOME}/sovereign/stack/policy/verdicts.json`, 'utf8')) : { note: 'gate has not flown yet' },
  sovereign_get_identity_root: () => existsSync(`${HOME}/sovereign/stack/identity/identity-root.json`) ? JSON.parse(readFileSync(`${HOME}/sovereign/stack/identity/identity-root.json`, 'utf8')) : { note: 'identity root has not flown yet' },
  sovereign_list_claims: (args) => {
    const limit = Math.min(Number(args?.limit) || 50, 200);
    const dir = `${HOME}/ops/claims`;
    const out = [];
    if (existsSync(dir)) for (const f of readdirSync(dir).sort().slice(0, limit)) { try { out.push(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))); } catch {} }
    return { protocol: 'SAOS-CLAIMS/1', count: out.length, claims: out };
  },
  sovereign_validate_policy: () => {
    try {
      const out = execFileSync('node', [`${HOME}/sovereign/stack/policy/policy-engine.mjs`, '--selftest'], { encoding: 'utf8', timeout: 30000 });
      const policy = JSON.parse(readFileSync(`${HOME}/sovereign/stack/policy/policy.json`, 'utf8'));
      return { selftestOutput: out.trim().split('\n'), policy };
    } catch (e) { return { selftestError: e.message }; }
  }
};

if (!TOKEN) { console.log('(no token) mcp-router: nothing to serve — exit 0'); process.exit(0); }

const manifest = JSON.parse(readFileSync(`${HOME}/sovereign/stack/runtime/mcp/tools.json`, 'utf8'));
const whitelist = new Set(manifest.tools.map(t => t.name));

const issues = await listInvokeIssues();
let served = 0;
for (const iss of issues) {
  if (served >= MAX_PER_FLIGHT) break;
  if ((iss.labels || []).some(l => l.name === 'mcp-done')) continue; // already answered
  let req = null;
  try {
    const m = String(iss.body || '').match(/\{[\s\S]*\}/);
    req = m ? JSON.parse(m[0]) : { tool: String(iss.body || '').trim() };
  } catch { req = null; }
  const toolName = req?.tool;
  if (!toolName || !whitelist.has(toolName)) {
    await comment(iss.number, `**MCP router** — cannot serve.\n\n- unknown/missing tool. Whitelist: ${[...whitelist].map(t => `\`${t}\``).join(', ')}\n- usage: issue body \`{"tool":"sovereign_get_state"}\` + label \`mcp-invoke\`\n- run: ${RUN_URL}`);
    await addLabel(iss.number, 'mcp-done');
    served++;
    continue;
  }
  try {
    const result = await tools[toolName](req.args || {});
    let body = JSON.stringify(result, null, 2);
    if (body.length > 55000) body = body.slice(0, 55000) + '\n…[truncated — full book lives in the repo file]';
    await comment(iss.number, `**MCP router** — \`${toolName}\` result (${stamp}):\n\n\`\`\`json\n${body}\n\`\`\`\n\nrun: ${RUN_URL}`);
  } catch (e) {
    await comment(iss.number, `**MCP router** — \`${toolName}\` failed honestly: \`${e.message}\`\n\nrun: ${RUN_URL}`);
  }
  await addLabel(iss.number, 'mcp-done');
  served++;
  try { writeFileSync(`${HOME}/ops/decisions.jsonl`, readFileSync(`${HOME}/ops/decisions.jsonl`, 'utf8') + `\n${stamp} | mcp-router | served ${toolName} on issue #${iss.number}\n`); } catch {}
}
console.log(`mcp-router: served ${served}/${issues.length} invoke issues`);
process.exit(0);
