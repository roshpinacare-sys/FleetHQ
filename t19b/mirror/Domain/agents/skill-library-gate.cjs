#!/usr/bin/env node
/**
 * skill-library-gate.cjs — Task 27 SKILL-LIBRARY GATE (adoption wave)
 *
 * Study lineage: alirezarezvani/claude-skills (MIT, pinned mirror sha 19392f7a,
 * 27.3k stars) — their SKILL-AUTHORING-STANDARD.md + gate-as-merge-authority
 * discipline (scripts/check_skill_names.py upstream) adapted and house-hardened.
 * Provenance: agents/skill-library/THIRD-PARTY-NOTICES.md (MIT notice retained).
 *
 * WHAT IT ENFORCES (every MUST in the authoring standard, mechanically):
 *   - frontmatter: namespaced name (kebab-case WITH hyphen, never a bare built-in
 *     command word — upstream issue #885 lesson), "Use when" description >= 60 chars,
 *     semver version, license: MIT
 *   - body sections: When to use / Proactive Triggers / Output Artifacts /
 *     Related Skills / Evidence Artifact (house ANTI-GOODHART law) / Tier & Scope (house law)
 *   - library-level: authoring standard present + credits the source, THIRD-PARTY-NOTICES
 *     present + pins ALL lineage mirror shas (claude-skills MIT + strix Apache-2.0 +
 *     google/ax Apache-2.0 + mini-swe-agent MIT), >= 6 packages
 *
 * VERDICT: exit 0 = library green (offenders []), exit 1 = offenders booked.
 * v1.0.1: the bare-built-in shadow reason now outranks the generic namespacing reason
 *          (E19 white-box caught the else-if chain reporting the duller verdict first).
 * v1.1.0 (Task 29): second lineage pin — the notices must retain the usestrix/strix
 *          Apache-2.0 mirror sha 99c0711 alongside the claude-skills MIT sha (a rule
 *          not enforced in code is not a rule); strix book stamp updated.
 * v1.2.0 (Task 31): third lineage pin — the notices must retain the google/ax
 *          Apache-2.0 mirror sha ac23328 (agentic-orchestration lineage, Task 31
 *          evaluation → same-wave adoption).
 * v1.3.0 (Task 33): fourth lineage pin — the notices must retain the
 *          SWE-agent/mini-swe-agent MIT mirror sha 04d809c (minimal-agent
 *          doctrine lineage, Task 33 evaluation → same-wave adoption).
 * v1.4.0 (Task 35): fifth lineage pin — the notices must retain the
 *          Alishahryar1/free-claude-code AGPL-3.0-only mirror sha 03aca36
 *          (frugal-routing doctrine lineage, license verified IN-FILE; first
 *          non-permissive pin: it certifies STUDY PROVENANCE, zero-copy only).
 * v1.5.0 (Task 36): five-repo sweep pins — the notices must retain the mirror
 *          shas for trailhq/Graft (MIT fe30ead), msitarzewski/agency-agents
 *          (MIT d3f71c4), DeusData/codebase-memory-mcp (MIT 96c3f41c),
 *          calesthio/OpenMontage (AGPL-3.0 08e2151), stablyai/orca (MIT
 *          843607b1) — the lineage constitution grows five→ten pins.
 * Books: agents/skill-library.json + agents/skill-library.md (single writer: this gate).
 * Zero dependencies. require()-safe: scanDir runs only under require.main === module CLI.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LIB_REL = 'skill-library';
const BARE_BUILTINS = new Set(['status', 'review', 'init', 'resume', 'config', 'help',
  'doctor', 'login', 'logout', 'install', 'uninstall', 'run', 'test', 'doctor']);
const REQUIRED_SECTIONS = ['## When to use', '## Proactive Triggers', '## Output Artifacts',
  '## Related Skills', '## Evidence Artifact', '## Tier & Scope'];
const MIRROR_SHA = '19392f7a';
const STRIX_MIRROR_SHA = '99c0711';
const AX_MIRROR_SHA = 'ac23328';
const MINI_SWE_MIRROR_SHA = '04d809c';
const FCC_MIRROR_SHA = '03aca36';
const GRAFT_MIRROR_SHA = 'fe30ead';
const AGENCY_MIRROR_SHA = 'd3f71c4';
const CBMEM_MIRROR_SHA = '96c3f41c';
const MONTAGE_MIRROR_SHA = '08e2151';
const ORCA_MIRROR_SHA = '843607b1';

function parseFrontmatter(text) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

function checkSkill(dirName, text) {
  const offenders = [];
  const fm = parseFrontmatter(text);
  if (!fm) { offenders.push({ skill: dirName, why: 'frontmatter block (--- ... ---) missing or malformed' }); return offenders; }
  if (!fm.name) offenders.push({ skill: dirName, why: 'frontmatter.name missing' });
  else if (BARE_BUILTINS.has(fm.name)) offenders.push({ skill: dirName, why: `name "${fm.name}" shadows a bare built-in command word (upstream issue #885 lesson)` });
  else if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(fm.name)) offenders.push({ skill: dirName, why: `name "${fm.name}" not namespaced kebab-case (must contain a hyphen)` });
  if (!fm.description) offenders.push({ skill: dirName, why: 'frontmatter.description missing' });
  else {
    if (fm.description.length < 60) offenders.push({ skill: dirName, why: `description too short (${fm.description.length} < 60) to carry real triggers` });
    if (!/use when/i.test(fm.description)) offenders.push({ skill: dirName, why: 'description lacks "Use when" trigger phrasing' });
  }
  if (!fm.version || !/^\d+\.\d+\.\d+$/.test(fm.version)) offenders.push({ skill: dirName, why: `version "${fm.version || ''}" missing or not semver` });
  if (!fm.license || fm.license !== 'MIT') offenders.push({ skill: dirName, why: `license "${fm.license || ''}" must be MIT` });
  for (const sec of REQUIRED_SECTIONS) {
    if (!text.includes(sec)) offenders.push({ skill: dirName, why: `required section "${sec}" missing` });
  }
  return offenders;
}

function scanDir(root) {
  const offenders = [];
  const skills = [];
  let scanned = 0;
  const skillsDir = path.join(root, 'skills');
  const standardPath = path.join(root, 'SKILL-AUTHORING-STANDARD.md');
  const noticesPath = path.join(root, 'THIRD-PARTY-NOTICES.md');

  if (!fs.existsSync(standardPath)) offenders.push({ skill: '(library)', why: 'SKILL-AUTHORING-STANDARD.md missing' });
  else {
    const std = fs.readFileSync(standardPath, 'utf8');
    if (!std.includes('alirezarezvani/claude-skills') || !std.includes('MIT')) offenders.push({ skill: '(library)', why: 'standard does not credit the MIT source repo' });
  }
  if (!fs.existsSync(noticesPath)) offenders.push({ skill: '(library)', why: 'THIRD-PARTY-NOTICES.md missing (MIT notice retention)' });
  else {
    const notices = fs.readFileSync(noticesPath, 'utf8');
    if (!notices.includes(MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the mirror sha ${MIRROR_SHA}` });
    if (!notices.includes('MIT')) offenders.push({ skill: '(library)', why: 'notices lack the MIT license reference' });
    if (!notices.includes(STRIX_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the strix mirror sha ${STRIX_MIRROR_SHA} (Apache-2.0 lineage, Task 29)` });
    if (!notices.includes(AX_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the ax mirror sha ${AX_MIRROR_SHA} (Apache-2.0 lineage, Task 31)` });
    if (!notices.includes(MINI_SWE_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the mini-swe mirror sha ${MINI_SWE_MIRROR_SHA} (MIT lineage, Task 33)` });
    if (!notices.includes(FCC_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the free-claude-code mirror sha ${FCC_MIRROR_SHA} (AGPL-3.0-only lineage verified in-file, Task 35)` });
    if (!notices.includes('AGPL-3.0')) offenders.push({ skill: '(library)', why: 'notices lack the AGPL-3.0 license reference (free-claude-code lineage, Task 35)' });
    if (!notices.includes(GRAFT_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the Graft mirror sha ${GRAFT_MIRROR_SHA} (MIT lineage, Task 36)` });
    if (!notices.includes(AGENCY_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the agency-agents mirror sha ${AGENCY_MIRROR_SHA} (MIT lineage, Task 36)` });
    if (!notices.includes(CBMEM_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the codebase-memory mirror sha ${CBMEM_MIRROR_SHA} (MIT lineage, Task 36)` });
    if (!notices.includes(MONTAGE_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the OpenMontage mirror sha ${MONTAGE_MIRROR_SHA} (AGPL-3.0 lineage verified in-file, Task 36)` });
    if (!notices.includes(ORCA_MIRROR_SHA)) offenders.push({ skill: '(library)', why: `notices do not pin the orca mirror sha ${ORCA_MIRROR_SHA} (MIT lineage, Task 36)` });
    if (!notices.includes('Apache-2.0')) offenders.push({ skill: '(library)', why: 'notices lack the Apache-2.0 license reference (strix + ax lineage)' });
  }

  if (!fs.existsSync(skillsDir)) {
    offenders.push({ skill: '(library)', why: 'skills/ directory missing' });
    return { ok: false, scanned: 0, skills, offenders };
  }
  for (const d of fs.readdirSync(skillsDir).sort()) {
    const dir = path.join(skillsDir, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    const p = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(p)) { offenders.push({ skill: d, why: 'SKILL.md missing in package dir' }); continue; }
    scanned++;
    skills.push(d);
    offenders.push(...checkSkill(d, fs.readFileSync(p, 'utf8')));
  }
  if (scanned < 6) offenders.push({ skill: '(library)', why: `only ${scanned} packages scanned (< 6) — the library is thinner than booked` });
  return { ok: offenders.length === 0, scanned, skills, offenders };
}

function writeBooks(root, res, at) {
  const AG = path.dirname(__filename);
  const jsonPath = path.join(AG, 'skill-library.json');
  const mdPath = path.join(AG, 'skill-library.md');
  const book = { ok: res.ok, at, gate: 'skill-library-gate.cjs v1.5.0 (Task 27+29+31+33+35+36, study: alirezarezvani/claude-skills MIT sha 19392f7a + usestrix/strix Apache-2.0 sha 99c0711 + google/ax Apache-2.0 sha ac23328 + SWE-agent/mini-swe-agent MIT sha 04d809c + Alishahryar1/free-claude-code AGPL-3.0-only sha 03aca36 zero-copy study + trailhq/Graft MIT sha fe30ead + msitarzewski/agency-agents MIT sha d3f71c4 + DeusData/codebase-memory-mcp MIT sha 96c3f41c + calesthio/OpenMontage AGPL-3.0 sha 08e2151 + stablyai/orca MIT sha 843607b1, all zero-copy doctrine study)', scanned: res.scanned, skills: res.skills, offenders: res.offenders };
  fs.writeFileSync(jsonPath, JSON.stringify(book, null, 2) + '\n');
  const md = [];
  md.push('# skill-library gate — role expertise as governed portable data (Task 27+29+31+33+35+36)');
  md.push('');
  md.push(`**verdict: ${res.ok ? 'GREEN' : 'RED'}** · ${res.scanned} packages · ${res.offenders.length} offenders · ${at}`);
  md.push('');
  md.push('_Authoring standard adapted from alirezarezvani/claude-skills (MIT, mirror sha 19392f7a); security lineage: usestrix/strix (Apache-2.0, mirror sha 99c0711, Task 29); orchestration lineage: google/ax (Apache-2.0, mirror sha ac23328, Task 31); minimal-agent lineage: SWE-agent/mini-swe-agent (MIT, mirror sha 04d809c, Task 33); frugal-routing lineage: Alishahryar1/free-claude-code (AGPL-3.0-only verified in-file, mirror sha 03aca36, Task 35 — study provenance, zero-copy); Task 36 five-repo sweep: trailhq/Graft (MIT fe30ead), msitarzewski/agency-agents (MIT d3f71c4), DeusData/codebase-memory-mcp (MIT 96c3f41c), calesthio/OpenMontage (AGPL-3.0 08e2151), stablyai/orca (MIT 843607b1). House-hardened: Evidence Artifact mandatory (ANTI-GOODHART), tier declaration, no silent scope. Provenance: skill-library/THIRD-PARTY-NOTICES.md_');
  md.push('');
  md.push('| package | verdict |');
  md.push('|---|---|');
  for (const s of res.skills) {
    const bad = res.offenders.filter((o) => o.skill === s);
    md.push(`| ${s} | ${bad.length ? 'RED: ' + bad.map((b) => b.why).join('; ') : 'GREEN'} |`);
  }
  for (const o of res.offenders.filter((x) => x.skill === '(library)')) md.push(`| (library) | RED: ${o.why} |`);
  md.push('');
  fs.writeFileSync(mdPath, md.join('\n') + '\n');
  return book;
}

module.exports = { scanDir, parseFrontmatter, checkSkill, BARE_BUILTINS, MIRROR_SHA, STRIX_MIRROR_SHA, AX_MIRROR_SHA, MINI_SWE_MIRROR_SHA, FCC_MIRROR_SHA, GRAFT_MIRROR_SHA, AGENCY_MIRROR_SHA, CBMEM_MIRROR_SHA, MONTAGE_MIRROR_SHA, ORCA_MIRROR_SHA };

if (require.main === module) {
  const AG = path.dirname(__filename);
  const root = path.join(AG, LIB_REL);
  const at = new Date().toISOString();
  const res = scanDir(root);
  writeBooks(root, res, at);
  const line = `skill-library-gate: ${res.ok ? 'GREEN' : 'RED'} · ${res.scanned} packages · offenders ${res.offenders.length}` +
    (res.offenders.length ? ' :: ' + res.offenders.slice(0, 5).map((o) => `${o.skill}: ${o.why}`).join(' | ') : '');
  console.log(line);
  process.exitCode = res.ok ? 0 : 1;
}
