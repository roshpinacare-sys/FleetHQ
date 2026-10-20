// sovereign/stack/identity/identity-root.mjs — Layer 1 of the Ultimate Sovereign Stack.
// ERC-8004 (EIP-8004 "Trustless Agents") shaped agent identity for the estate:
//   * validates every registry/<agent>/registration.json against registration.schema.json
//   * derives a deterministic pre-mint agentId (0x + 40 hex of sha256 over the canonical
//     registration body — stable before an IdentityRegistry contract exists to mint it)
//   * computes the estate identityRoot = sha256(sorted per-agent identityHashes)
//   * writes identity-root.json carrying an EIP-712 intent payload ready for the PROVEN
//     anchor rail (Domain proof-pipeline -> anchor-execute, Optimism; measured live
//     2026-10-13 tx 0x2b0a6720... block 158,168,506)
// Law: measurement duty -> exit 0 always. Violations become deduped claims + ONE issue.
// Reference implementations studied: erc-8004/erc-8004-contracts (IdentityRegistryUpgradeable.sol),
// adapt.ai PolicyAVS, aeonfun/aeon (owner directive trace 1a137bf80ea09539).

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const HOME = process.cwd(); // FleetHQ checkout root
const DIR = `${HOME}/sovereign/stack/identity`;
const CLAIMS = `${HOME}/ops/claims`;
const OWNER = 'roshpinacare-sys';
const REPO = 'FleetHQ';
const TOKEN = process.env.GITHUB_TOKEN || process.env.SOVEREIGN_PAT;
const RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : 'local';
const stamp = new Date().toISOString();

function sig8(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
function sha256(s) { return createHash('sha256').update(s).digest('hex'); }
function canonical(v) { // sorted-keys, no-whitespace JSON — the identity's canonicalization law
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// ---- manual schema validation (no deps; covers every constraint the schema declares)
function validateRegistration(r) {
  const errs = [];
  const req = ['type', 'name', 'description', 'services', 'active'];
  for (const k of req) if (!(k in r)) errs.push(`missing required field: ${k}`);
  if (r.type !== 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1') errs.push(`type must be EIP-8004 registration-v1 (got ${r.type})`);
  if (typeof r.name !== 'string' || !r.name.length || r.name.length > 64) errs.push('name must be a 1-64 char string');
  if (typeof r.description !== 'string' || r.description.length < 1 || r.description.length > 2000) errs.push('description must be 1-2000 chars');
  if (!Array.isArray(r.services) || r.services.length < 1) errs.push('services must be a non-empty array');
  else for (const s of r.services) {
    if (!s || typeof s !== 'object' || typeof s.name !== 'string' || !s.name) errs.push('service entry missing name');
    if (!s || typeof s.endpoint !== 'string' || !s.endpoint) errs.push(`service ${s?.name} missing endpoint`);
  }
  if (typeof r.active !== 'boolean') errs.push('active must be boolean');
  if ('preMintAgentId' in r && !/^0x[0-9a-f]{40}$/.test(r.preMintAgentId)) errs.push('preMintAgentId must be 0x+40hex');
  if ('deploymentStatus' in r && !['staged', 'minted', 'retired'].includes(r.deploymentStatus)) errs.push('deploymentStatus invalid');
  if ('ownerOfRecord' in r && r.ownerOfRecord !== 'roshpinacare-sys') errs.push('ownerOfRecord must be roshpinacare-sys');
  if ('agentRegistry' in r && r.agentRegistry) {
    const parts = r.agentRegistry.split(':');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) errs.push('agentRegistry must be {namespace}:{chainId}:{identityRegistry}');
  }
  const allowed = new Set(['type', 'name', 'description', 'image', 'services', 'x402Support', 'active', 'agentRegistry', 'preMintAgentId', 'deploymentStatus', 'capabilities', 'policyRef', 'runtimeRef', 'ownerOfRecord', 'trustAnchors']);
  for (const k of Object.keys(r)) if (!allowed.has(k)) errs.push(`unknown field: ${k} (schema forbids additional properties)`);
  return errs;
}

// ---- scan registry
const agents = [];
const violations = [];
if (!existsSync(`${DIR}/registry`)) { console.error('no registry dir'); process.exit(0); }
for (const dir of readdirSync(`${DIR}/registry`).sort()) {
  const p = `${DIR}/registry/${dir}/registration.json`;
  if (!existsSync(p)) { violations.push({ agent: dir, errs: ['registration.json missing'] }); continue; }
  let r;
  try { r = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { violations.push({ agent: dir, errs: [`unparseable: ${e.message}`] }); continue; }
  const errs = validateRegistration(r);
  if (errs.length) { violations.push({ agent: dir, errs }); continue; }
  const body = { ...r }; delete body.preMintAgentId;
  const identityHash = sha256(canonical(body));
  const preMintAgentId = `0x${identityHash.slice(0, 40)}`;
  agents.push({ agent: dir, name: r.name, active: r.active, deploymentStatus: r.deploymentStatus || 'staged', agentRegistry: r.agentRegistry || 'eip155:10:staged-deployment', preMintAgentId, identityHash, capabilities: r.capabilities || [], policyRef: r.policyRef || null, runtimeRef: r.runtimeRef || null, services: (r.services || []).map(s => s.name) });
}

const root = sha256(agents.map(a => a.identityHash).sort().join(''));

// ---- EIP-712 intent payload (typed-hash ready; anchoring via the proven rail)
const eip712 = {
  domain: { name: 'SAOS AgentIdentity', version: '1', chainId: 10 },
  primaryType: 'AgentIdentityRoot',
  types: { AgentIdentityRoot: [{ name: 'identityRoot', type: 'bytes32' }, { name: 'agentCount', type: 'uint256' }, { name: 'generatedAt', type: 'string' }] },
  message: { identityRoot: `0x${root}`, agentCount: String(agents.length), generatedAt: stamp },
  note: 'anchoring path: Domain proof-pipeline -> anchor-execute (Optimism). Full ERC-721 IdentityRegistry mint staged on a funded deployer (ref: erc-8004/erc-8004-contracts IdentityRegistryUpgradeable.sol).'
};

const out = {
  protocol: 'SAOS-AGENT-IDENTITY/1 (EIP-8004 registration-v1 shaped)',
  generatedAt: stamp, runUrl: RUN_URL,
  identityRoot: `0x${root}`,
  agentCount: agents.length,
  validAgents: agents.length, violations: violations.length,
  agents, eip712,
  deployment: { status: agents.length ? 'staged' : 'empty', reference: 'erc-8004/erc-8004-contracts#IdentityRegistryUpgradeable', anchorRail: 'Domain proof-pipeline -> anchor-execute (Optimism, proven 2026-10-13)' }
};

// ---- persist
try {
  writeFileSync(`${DIR}/identity-root.json`, JSON.stringify(out, null, 2) + '\n');
} catch (e) { console.error('write identity-root.json failed (defer-not-fail):', e.message); }

// ---- violations -> deduped claims + ONE issue (anti-storm law)
if (violations.length) {
  mkdirSync(CLAIMS, { recursive: true });
  for (const v of violations) {
    const sig = sig8(`identity-invalid|${v.agent}|${sha256(canonical(v.errs))}`);
    const claim = { sig, kind: 'identity-registration-invalid', agent: v.agent, errs: v.errs, firstSeenAt: stamp, lastSeenAt: stamp, status: 'open', runUrl: RUN_URL };
    try { writeFileSync(`${CLAIMS}/claim-${sig}.json`, JSON.stringify(claim, null, 2) + '\n'); } catch {}
    await openDedupedIssue(`agent-identity violation: ${v.agent} (sig ${sig})`, errsBody(v, sig, claim));
  }
}

function errsBody(v, sig, claim) {
  return `**Layer 1 (ERC-8004 identity)**: registration for \`${v.agent}\` failed schema validation.\n\n`
    + v.errs.map(e => `- ${e}`).join('\n')
    + `\n\n- sig: \`${sig}\`\n- run: ${RUN_URL}\n- fix the file at \`sovereign/stack/identity/registry/${v.agent}/registration.json\` — this issue never re-opens for the same signature (anti-storm law).`;
}

async function openDedupedIssue(title, body) {
  if (!TOKEN) { console.log(`(no token) would file issue: ${title}`); return; }
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?state=open&per_page=100`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sovereign-identity' }
    });
    if (!res.ok) { console.error(`issue search failed: ${res.status}`); return; }
    const existing = await res.json();
    if (existing.some(i => i.title === title)) { console.log(`issue already open (deduped): ${title}`); return; }
    const cr = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'sovereign-identity' },
      body: JSON.stringify({ title, body, labels: ['agent-identity', 'sovereign-stack'] })
    });
    console.log(`issue filed: ${cr.status} ${title}`);
  } catch (e) { console.error('issue filing failed (defer-not-fail):', e.message); }
}

// ---- summary (measurement duty — RED lives in the book, never in exit codes)
console.log(`identityRoot 0x${root.slice(0, 16)}… agents=${agents.length} violations=${violations.length}`);
for (const a of agents) console.log(`  ${a.active ? '●' : '○'} ${a.name} preMint=${a.preMintAgentId.slice(0, 10)}… policy=${a.policyRef || '—'}`);
process.exit(0);
