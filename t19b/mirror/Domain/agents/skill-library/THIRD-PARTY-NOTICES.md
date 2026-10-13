# Third-Party Notices — agents/skill-library/

This directory adapts open-source material. This file records provenance and license as the
MIT license requires (retain the license + copyright notice).

## 1. alirezarezvani/claude-skills

- **Source:** https://github.com/alirezarezvani/claude-skills
- **License:** MIT — https://github.com/alirezarezvani/claude-skills/blob/main/LICENSE
- **Pinned mirror sha:** `19392f7a` (cloned keyless to `/home/z/reference-mirrors/claude-skills`,
  outside the 16-repo estate on purpose: the mirror is reference, not fleet)
- **Author (upstream):** Alireza Rezvani and claude-skills contributors
- **What was adopted:**
  - `SKILL-AUTHORING-STANDARD.md` — the SKILL.md skeleton (frontmatter rules, namespaced-name
    law and the bare-built-in-shadowing lesson from upstream issue #885, when-to-use triggers,
    proactive triggers, output-artifact tables, related-skills disambiguation,
    bottom-line-first + confidence-tagging communication standard, "never sign off on prose
    alone — attach the tool outputs").
  - The idea of a skill **package** as a directory with a gate-checked `SKILL.md`.
  - The gate-as-merge-authority discipline (`scripts/check_skill_names.py` in CI upstream →
    `agents/skill-library-gate.cjs` here).
- **What was NOT taken:** none of their content files, tools, or persona text. Zero upstream
  SKILL.md bodies were copied. Only the authoring standard's structural ideas were adapted,
  then house-hardened (Evidence Artifact mandatory, tier declaration, no silent scope,
  renumbering doctrine, bilingual header).

## 2. f/prompts.chat (prior wave, Z-37/Task 20 lineage)

- **Source:** https://github.com/f/prompts.chat
- **License:** MIT
- **What was adopted (earlier, already on main):** roles-as-data CSV registry pattern and
  `${Var:default}` binding — the skill library sits ON TOP of that adoption
  (`feat-008` → `feat-011` lineage).

## 3. usestrix/strix (Task 28 evaluation → Task 29 adoption)

- **Source:** https://github.com/usestrix/strix
- **License:** Apache-2.0 — https://github.com/usestrix/strix/blob/main/LICENSE
  (Apache License, Version 2.0, January 2004; full text preserved at the pinned mirror's
  `LICENSE` file — a copy ships inside the mirror clone)
- **Pinned mirror sha:** `99c0711` (cloned keyless to `/home/z/reference-mirrors/strix`,
  outside the 16-repo estate on purpose: the mirror is reference, not fleet; depth-50
  clone of HEAD 2026-10-02 — matches API commit 99c0711687)
- **Author (upstream):** usestrix and strix contributors
- **What was adopted:**
  - The honest-engineering patterns as REFERENCE for the house package
    `skills/security-strix-operator/`: exit-code honesty (`0` = clean in what was
    analyzed, with documented budget-wrap caveats), `run.json` cost-vs-budget
    transparency, digest-bound two-step approvals (`--approve-sha256`), unknown-state
    honesty flags (`launch_outcome_unknown`), decision tables ("choose honestly,
    do not default"), and the authorization guardrail ("only scan targets the user is
    authorized to test") — adopted as the estate's scan-boundary law.
  - The 9 upstream consumer skills (`skills/*` in the mirror) are kept as a pinned
    REFERENCE family for the security domain — consulted in the mirror, not imported.
- **What was NOT taken:** zero upstream SKILL.md bodies were copied into this library;
  no upstream source code, prompts, or tools were vendored. The house package is an
  original adaptation whose Apache-2.0-derived references are limited to documented
  patterns and short quoted guardrail phrases, attributed here.
- **State of changes:** the house package materially adapts (does not reproduce) the
  referenced patterns; this notice is the required Apache-2.0 attribution and
  change-state declaration.

## 4. google/ax (Task 31 evaluation → same-wave adoption)

- **Source:** https://github.com/google/ax
- **License:** Apache-2.0 — https://github.com/google/ax/blob/main/LICENSE
  (Apache License, Version 2.0, January 2004; full text preserved at the pinned
  mirror's `LICENSE` file — a copy ships inside the mirror clone)
- **Pinned mirror sha:** `ac23328` (cloned keyless to `/home/z/reference-mirrors/ax`,
  outside the 16-repo estate on purpose: the mirror is reference, not fleet;
  depth-50 clone of HEAD 2026-09-26 — matches API commit `ac2332829f22360ff97b0ba34d94dd0dd782f17e`)
- **Author (upstream):** Google and ax contributors ("Google's open agentic
  orchestration runtime")
- **What was adopted:**
  - The honest-orchestration patterns as REFERENCE for the house package
    `skills/orchestration-ax-operator/`: declarative resource manifests
    (`ax.io/v1alpha1` Task/Workspace/Model), task immutability (CreateTask with
    enforced immutability, UpdateTask removed), up-front RFC 1123 validation at
    apply-time (reject early instead of failing as `ActorCreationFailed` later),
    the conditions chain (`WorkspaceReady` → `Ready`), per-task resource
    requests/limits as budget guards, checkpointing suspend/resume semantics,
    Model credentials referenced by `secretKey` (never inlined), and Workspace
    skill-registries materialized to `/.agents/skills` — each mapped to its estate
    parallel in the house package's doctrine table.
- **What was NOT taken:** zero upstream code, manifests, YAML, or documentation
  bodies were copied into this library; nothing was vendored. The house package is
  an original adaptation whose Apache-2.0-derived references are limited to
  documented patterns and their short names, attributed here. Running AX itself
  (K8s cluster + Agent Substrate) is booked as wallet/possession-gated, not adopted.
- **State of changes:** the house package materially adapts (does not reproduce) the
  referenced patterns; this notice is the required Apache-2.0 attribution and
  change-state declaration.

## 5. Sumanth077/Hands-On-AI-Engineering (Task 32 evaluation → consult-only reference)

- **Source:** https://github.com/Sumanth077/Hands-On-AI-Engineering
- **License status (honesty finding):** the upstream README badge and License
  section claim **MIT**, but the LICENSE file **does not exist** (contents API
  returns 404; repo API reports license: null) as of mirror sha `da0091d6`
  (2026-10-01). Until a real LICENSE file lands upstream, the repository is
  treated as **ALL RIGHTS RESERVED**.
- **Mirror:** bare-blobless clone (184K, blobs on demand) at
  `/home/z/reference-mirrors/hae-mirror.git` @ `da0091d6452e18dae9fd3119a194019f35306d27`
  — outside the 16-repo estate on purpose: the mirror is reference, not fleet.
  A full working-tree mirror was attempted and discarded (315 MB) in favor of the
  treeless form — disk-honest at 719 MB free.
- **Author (upstream):** Sumanth077 and the Hands-On-AI-Engineering community.
- **What was adopted:** NOTHING was copied — no upstream code, prompts, README
  bodies, or project text. The house package `skills/applied-ai-patterns-operator`
  references only the PATTERN SHAPES (ideas), restated originally: the Jev
  three-point decision-review-gate architecture with its fail-open-with-notes /
  reviewer-only / no-silent-retry honesty rules (from `ai_agents/nl_data_analyst_agent`),
  self-grading agentic RAG, multi-agent loops with a critic, typed query routing
  with fallback, digest pipelines, document structuring, and the CONTRIBUTING
  project-hygiene standard — each mapped to an estate lane in the house package.
- **Why no gate pin (unlike sections 3 and 4):** the lineage pins enforced by
  skill-library-gate.cjs exist because Apache-2.0/MIT attributions are REQUIRED
  for adopted material from licensed sources. Here nothing is copied or adapted,
  so no attribution obligation exists; the consult-only posture and the LICENSE
  -404 finding are documented here instead. If upstream ships a verified LICENSE
  file, this section is updated and a pin may be added at that point.
- **State of changes:** consult-only, zero-copy; this notice documents provenance
  and the license-mismatch finding, and is the standing re-verification trigger.

## 6. SWE-agent/mini-swe-agent (Task 33 evaluation → same-wave adoption)

- **Source:** https://github.com/SWE-agent/mini-swe-agent
- **License:** MIT — verified IN-FILE at the pinned mirror (`LICENSE.md`,
  1,094 bytes, "Copyright (c) 2025 Kilian A. Lieret and Carlos E. Jimenez");
  the repo API independently reports spdx_id MIT. Unlike §5, the license
  claim is backed by the file itself.
- **Pinned mirror sha:** `04d809c` (cloned keyless to
  `/home/z/reference-mirrors/mini-swe-agent`, outside the 16-repo estate on
  purpose: the mirror is reference, not fleet; depth-50 clone of main HEAD
  2026-09-03 — full sha `04d809ceab9df28f9adaed044884180159172930`)
- **Author (upstream):** Kilian A. Lieret, Carlos E. Jimenez, and the
  SWE-agent/mini-swe-agent contributors (the Princeton & Stanford team behind
  SWE-bench)
- **What was adopted:**
  - The minimal-agent doctrine as REFERENCE for the house package
    `skills/swe-mini-operator/`: bash-as-the-only-tool, stateless per-action
    execution with process-group kill on timeout, a completely linear
    append-only history (trajectory == messages), exceptions-as-control-flow
    where every exception carries its messages into the trajectory (never
    swallowed), hard step/cost/wall-time limits as first-class config
    (upstream ships `cost_limit=3.0` as a default), the
    consecutive-format-error circuit breaker with billed-cost honesty, jinja
    StrictUndefined templates (a missing variable is a loud error, never a
    silent blank), the explicit machine-checkable submit signal
    (`COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT` + returncode==0),
    save-every-step checkpointing, and the AGENTS.md minimalism/test law
    ("do not mock anything you're not explicitly asked to"; "every test
    targets at least one point of failure") — each mapped to its estate
    parallel in the house package's doctrine table.
- **What was NOT taken:** zero upstream Python code, configs, prompts, or
  docs bodies were copied into this library; the runtime was not vendored or
  installed (its litellm model legs require paid provider keys = wallet
  domain); the containerized environment legs (docker/podman/singularity/
  apptainer/bubblewrap/modal/contree) are booked as wallet/possession-gated,
  not adopted.
- **State of changes:** the house package materially adapts (does not
  reproduce) the referenced patterns; this notice is the required MIT
  attribution and change-state declaration.

## 7. vercel-labs/openreview (Task 34 evaluation → consult-only reference)

- **Source:** https://github.com/vercel-labs/openreview — "An open-source,
  self-hosted AI code review bot powered by Vercel." 1,697 stars, TypeScript.
- **License status (honesty finding, second occurrence of the Task 32
  pattern):** the upstream README states "## License — MIT", but NO LICENSE
  file exists in the repository (repo API reports license: null) at mirror
  sha `672deb2` (HEAD 2026-03-06, full sha
  `672deb21e70e471e0536d5ad7a67c14b8359e97e`). Unbacked MIT claim → the
  repository is treated as **ALL RIGHTS RESERVED** → consult-only,
  zero-copy.
- **Mirror:** shallow clone at `/home/z/reference-mirrors/openreview`
  (outside the 16-repo estate on purpose: the mirror is reference, not
  fleet). Depth-50 clone of HEAD 2026-03-06 — the repo has been DORMANT for
  seven months and its README declares beta ("built as an internal project
  to help the Vercel team test their technologies together").
- **Author (upstream):** Vercel Labs and openreview contributors.
- **What was adopted:** NOTHING was copied — no upstream code, configs,
  prompts, README bodies, or text. The house package
  `skills/ai-review-operator/` references only the PATTERN SHAPES (ideas),
  restated originally: the authority pre-flight before any push (archived /
  installation-permissions / branch-restrictions checks, each refusal with a
  named reason), reviewer-only separation of powers (suggestions applied by
  human reaction, 👍/❤️ vs 👎/😕), the autonomy gradient (auto-push for
  mechanical fixes only, judgment-shaped findings as suggestions), on-demand
  @mention triggers, the uncommitted-changes honesty check before
  commit-and-push, progressive skill loading (names + descriptions as the
  routing surface, full body loaded on demand), and the per-skill
  `skills-lock.json` hash pattern (skills as pinned dependencies).
- **Why no gate pin (unlike sections 3, 4, and 6):** pins exist because
  license attribution is REQUIRED for adopted material from licensed
  sources. Here the license claim is unbacked and nothing is copied, so no
  attribution obligation exists; the consult-only posture and the
  LICENSE-missing finding are documented here instead. If upstream ships a
  real LICENSE file, this section is updated and a pin may be added.
- **State of changes:** consult-only, zero-copy; this notice documents
  provenance and the license-mismatch finding, and is the standing
  re-verification trigger.

## 8. Alishahryar1/free-claude-code (Task 35 evaluation → same-wave adoption, first AGPL lineage)

- **Source:** https://github.com/Alishahryar1/free-claude-code — "a local
  proxy connecting coding agents to OpenAI-compatible AI providers"
  (59 provider integrations, 11 coding-agent harnesses; 56,409 stars,
  Python, created 2026-01-28, pushed 2026-10-03).
- **License:** AGPL-3.0-only — verified IN-FILE at the pinned mirror
  (`LICENSE`, 34,108 bytes: standard GNU AGPL v3 text with
  `SPDX-License-Identifier: AGPL-3.0-only` and "Copyright (c) 2026 Ali
  Khokhar"). The repo API reports license `NOASSERTION`/"Other" — a FALSE
  NEGATIVE overridden by reading the file (the Task 33 rule: the file is the
  truth). Unlike §5/§7, the license claim is backed by the file itself.
- **Pinned mirror sha:** `03aca36` (cloned keyless to
  `/home/z/reference-mirrors/free-claude-code`, outside the 16-repo estate
  on purpose: the mirror is reference, not fleet; depth-50 clone of main
  HEAD 2026-10-02 — full sha
  `03aca36eb3b9f2bf07805b1c39ec4d61f6f740c1`; repo pushed_at 2026-10-03 ⇒
  non-main pushes exist, trust the pin).
- **Author (upstream):** Ali Khokhar and the free-claude-code contributors.
- **Copyleft boundary (first non-permissive lineage the gate pins):** the
  pin certifies STUDY PROVENANCE, not redistribution permission. This wave
  adopted DOCTRINE ONLY — zero upstream Python code, configs, or docs bodies
  were copied into this library — so no AGPL obligation is triggered. Any
  future CODE incorporation would impose AGPL-3.0 obligations (including
  §13 network-service source offer) estate-wide and is booked as an
  owner-gated license decision, never desk-defaulted.
- **What was adopted (reference patterns for the house package
  `skills/frugal-router-operator/`):** never spend a model call on
  mechanical work (local fast-path handlers answer quota probes, prefix
  detection, titles, suggestions, filepath extraction without a provider
  call), the StrictSlidingWindowLimiter with its guarantee stated in the
  docstring, admission budgets independent of client lifetime with one
  protection budget per provider, classified failures each carrying a named
  remedy, authorized request/stream recovery replayed from history, the SSRF
  egress guard that pins connections to resolved addresses against DNS
  rebinding, reviewable installers, exact dependency pins, harness
  capability preservation at the protocol boundary, and ToS-friendliness as
  enforced design (integrations removed when disallowed) — each mapped to
  its estate parallel in the house package's doctrine table.
- **What was NOT taken:** zero upstream code copied (AGPL boundary above);
  the runtime was not installed or executed (running FCC requires
  user-supplied provider API keys = credentials = possession = OWNER
  authority, and is redundant here — the desk's model leg is the z-ai SDK);
  headline claims ("59 ToS-friendly providers", "1.3B+ free tokens/month",
  "up to 90% fewer tokens", model failover) booked as upstream claims, not
  desk-verified facts.
- **State of changes:** the house package materially adapts (does not
  reproduce) the referenced patterns; this notice is the required AGPL-3.0
  attribution and change-state declaration.

## 9. trailhq/Graft (Task 36 five-repo sweep → same-wave adoption)

- **Source:** https://github.com/trailhq/Graft (owner linked
  https://github.com/NanoNets/Graft — the repo MOVED org NanoNets→trailhq;
  the pin follows the current canonical name) — "open-source context layer
  for large codebases": persistent code-graph context + managed
  CLAUDE.md/AGENTS.md memory for coding agents. 9,512 stars, TypeScript,
  created 2026-07-03, pushed 2026-10-02.
- **License:** MIT — verified IN-FILE at the pinned mirror (`LICENSE`,
  1,090 bytes, "Copyright (c) 2026 Context Graph Engine contributors").
- **Pinned mirror sha:** `fe30ead` (keyless depth-50 clone at
  `/home/z/reference-mirrors/Graft`, outside the 16-repo estate; main HEAD
  2026-09-30).
- **Author (upstream):** Trail (NanoNets) and Graft contributors.
- **What was adopted (reference patterns, restated originally into
  `skills/frugal-router-operator` v1.1.0):** hook-over-note ("the ones that
  can't break get a hook that blocks it, not a note it ignores" — the
  estate's "a rule not enforced in code is not a rule" independently
  re-derived at scale), correction→persistent-rule memory (every correction
  folds back into managed memory; src/upkeep.ts maintains CLAUDE.md and
  AGENTS.md), and blast-radius-before-action (src/blast: diff → owners →
  rendered impact before proceeding).
- **What was NOT taken:** zero upstream TypeScript code, configs, or docs
  bodies copied; the npm package (@nanonets/graft) not installed; headline
  metrics (4× cheaper, 3× faster, +46% tool-call reduction, correctness
  54%→66% on SWE-bench Verified) booked as upstream claims. The cloud
  "Trail" service is upstream distribution — not evaluated, not touched.
- **State of changes:** the house package materially adapts (does not
  reproduce) the referenced patterns; this notice is the required MIT
  attribution and change-state declaration.

## 10. msitarzewski/agency-agents (Task 36 five-repo sweep → same-wave adoption)

- **Source:** https://github.com/msitarzewski/agency-agents — "The Agency":
  a catalog of specialized AI-agent role files (pure markdown) organized in
  division directories. 155,836 stars, Shell, created 2025-10-13, pushed
  2026-10-01.
- **License:** MIT — verified IN-FILE at the pinned mirror (`LICENSE`,
  1,079 bytes, "Copyright (c) 2025 AgentLand Contributors").
- **Pinned mirror sha:** `d3f71c4` (keyless depth-50 clone at
  `/home/z/reference-mirrors/agency-agents`, outside the estate; main HEAD
  2026-10-01).
- **Author (upstream):** Michael Sitarzewski and the AgentLand contributors.
- **What was adopted (reference patterns, restated originally into the new
  house package `skills/agency-catalog-operator/`):** role-as-single-markdown
  shape (identity & memory / core mission / critical rules / deliverables /
  success metrics), catalog-as-machine-checked-source-of-truth
  (divisions.json is consumed by tooling and scripts/check-divisions.sh
  FAILS THE BUILD if the catalog disagrees with the directories on disk —
  catalog-vs-disk drift is a build failure, not a note), named divisions
  with display metadata, and the multi-harness install surface (one roster,
  many clients).
- **What was NOT taken:** zero upstream agent markdown bodies copied (the
  estate adopts SHAPES and writes roles originally in house voice — 319
  division-level agent files at the pinned sha remain upstream's); no
  install into agent config dirs; the companion desktop app and brew cask
  not evaluated. Count-drift honesty: README-era claims say "232 agents /
  16 divisions"; the pinned mirror holds 319 division-level agent .md
  files across 13+ divisions — counts are a pulse, the sha is the truth.
- **State of changes:** the house package materially adapts (does not
  reproduce) the referenced patterns; this notice is the required MIT
  attribution and change-state declaration.

## 11. DeusData/codebase-memory-mcp (Task 36 five-repo sweep → same-wave adoption)

- **Source:** https://github.com/DeusData/codebase-memory-mcp — "codebase
  memory": a pure-C code-intelligence engine that indexes repositories into
  a persistent knowledge graph (tree-sitter AST + in-memory SQLite) and
  serves structural queries over MCP. 45,707 stars, C, created 2026-02-24,
  pushed 2026-10-02.
- **License:** MIT — verified IN-FILE at the pinned mirror (`LICENSE`,
  1,107 bytes, "Copyright (c) 2025 DeusData").
- **Pinned mirror sha:** `96c3f41c` (keyless depth-50 clone at
  `/home/z/reference-mirrors/codebase-memory-mcp`, outside the estate;
  main HEAD 2026-10-02).
- **Author (upstream):** DeusData and codebase-memory-mcp contributors.
- **What was adopted (reference patterns, restated originally into the new
  house package `skills/codebase-graph-operator/`):** index-once-query-
  forever (tree-sitter AST → persistent graph of functions, classes, call
  chains, HTTP routes, cross-service links), query-the-book-not-the-files
  (structural answers instead of grep/read cycles), RAM-first
  release-after persistence (internal/cbm/sqlite_writer.c; memory released
  after indexing), honest supply chain (SECURITY.md release policy,
  VirusTotal-scanned release candidates with pinned SHA-256, SLSA 3, OSSF
  scorecard), and catalog-as-contract client activation (45 surfaces
  configured only when documented markers exist).
- **What was NOT taken:** zero upstream C code or docs bodies copied; the
  native binary NOT downloaded or executed (the desk reads source, does not
  self-install binaries); MCP client configuration writes not performed;
  headline claims (162 languages, Linux kernel in 3 minutes, <1ms answers,
  120× fewer tokens, 8,050 tests, 83% answer quality across 31 repos per
  the arXiv preprint) booked as upstream claims.
- **State of changes:** the house package materially adapts (does not
  reproduce) the referenced patterns; this notice is the required MIT
  attribution and change-state declaration.

## 12. calesthio/OpenMontage (Task 36 five-repo sweep → pinned reference, no house package)

- **Source:** https://github.com/calesthio/OpenMontage — "the first
  open-source, agentic video production system": prompt-driven pipelines
  (storyboard → script → assets → edit → render) with per-harness context
  files (AGENTS.md/CLAUDE.md/CODEX.md/COPILOT.md/CURSOR.md), schemas,
  skills/, PROMPT_GALLERY. 62,496 stars, Python, created 2026-03-29,
  pushed 2026-09-06.
- **License:** AGPL-3.0 — verified IN-FILE at the pinned mirror (`LICENSE`,
  34,523 bytes, standard GNU AGPL v3 text). Copyleft boundary identical to
  §8: the pin certifies STUDY PROVENANCE; zero upstream code copied; any
  code incorporation would trigger AGPL §13 obligations estate-wide and is
  owner-gated.
- **Pinned mirror sha:** `08e2151` (keyless depth-50 clone at
  `/home/z/reference-mirrors/OpenMontage`, outside the estate; main HEAD
  2026-09-05 — the repo's last push, ~4 weeks before the sweep).
- **Author (upstream):** calesthio and OpenMontage contributors.
- **What was adopted (reference patterns, booked in CR-0016 — no house
  package, scope discipline: the estate runs no media pipeline today):**
  creative pipelines as stage-gated flows where each stage hand-off is
  schema-checked (schemas/ = parse-gates between creative stages, the
  workflow-parse-gate parallel), per-harness context files as first-class
  artifacts, and a prompt gallery as curated regression material. The
  runnable legs (GPU render requirements, video providers) are
  possession/wallet-gated and were not provisioned.
- **What was NOT taken:** zero upstream Python/pipeline code copied; no
  runtime installed; no video-provider keys touched.
- **State of changes:** consult-level doctrine booking with pin; this
  notice is the required AGPL-3.0 attribution and change-state declaration.

## 13. stablyai/orca (Task 36 five-repo sweep → same-wave adoption)

- **Source:** https://github.com/stablyai/orca — "The AI Orchestrator for
  100x builders": runs Codex/ClaudeCode/OpenCode/Pi side-by-side, each in
  its own git worktree, tracked in one place, with a mobile companion to
  monitor and steer. 83,962 stars, TypeScript (Electron), created
  2026-03-17, pushed 2026-10-03.
- **License:** MIT — verified IN-FILE at the pinned mirror (`LICENSE`,
  1,070 bytes, "Copyright (c) 2026 Lovecast Inc.").
- **Pinned mirror sha:** `843607b1` (keyless depth-50 clone at
  `/home/z/reference-mirrors/orca`, outside the estate; main HEAD
  2026-10-02).
- **Author (upstream):** Stably AI (Lovecast Inc.) and orca contributors.
- **What was adopted (reference patterns, booked in CR-0016; the parallel
  surfaces already live in the estate's lane law):** worktree-per-agent
  isolation (each agent owns a git worktree — lanes never share working
  state; the fills-ledger/lane parallel), worktree LINEAGE PRUNING
  (src/main/worktree-lineage-pruning — stale parallel states are reaped,
  the STASIS/collapse-drill parallel), one tracking surface over many
  parallel agents (the one-bloc parallel: many lanes, one book), and
  remote monitor/steer with finish-notifications (the pulse-book
  parallel). The estate doctrine match: parallel execution is safe only
  when isolation is real (worktrees, not shared directories) and the
  tracking surface is single-writer.
- **What was NOT taken:** zero upstream TypeScript code copied; the desktop
  app not built or run (Electron GUI — no display on this box); mobile
  companion/store distribution not evaluated; no cloud legs touched.
- **State of changes:** consult-level doctrine booking with pin; this
  notice is the required MIT attribution and change-state declaration.

## MIT License (reference text)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, subject to the following
conditions: the above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
