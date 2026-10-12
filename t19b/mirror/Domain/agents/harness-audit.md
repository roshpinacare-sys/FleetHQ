# Harness Audit — the fleet's five-subsystem check (fresh-context judge node)

_harness-audit v1.0.0 · 2026-10-12T12:28:13.642Z · born from the learn-harness-engineering study (Z-35, extended Task 19)_

**harness NOT green: 12 FAIL — the audit is honest, the fails are the next work**

| # | Subsystem | Check | Status | Evidence |
|---|---|---|---|---|
| 1 | instructions | Defi/fleet/AGENTS.md present (coordination law) | FAIL | fleet/AGENTS.md |
| 2 | instructions | Defi/DOCTRINE.md present | FAIL | DOCTRINE.md |
| 3 | instructions | Domain/FLEET-NOTE.md present (per-repo living note) | PASS | FLEET-NOTE.md |
| 4 | instructions | Domain/AGENTS.md present at repo root (any-agent landing page) | PASS | AGENTS.md |
| 5 | instructions | agents carry doctrine headers (sample: venture-desk, econ-desk, treasury-desk) | PASS | 3 sampled agent headers |
| 6 | state | live books exist and fresh (<48h) | PASS | 8/10 books fresh |
| 7 | state | money-ledger books chain truth (not session memory) | PASS | money-ledger.json |
| 8 | state | self-heal layer proven (econ summary clean — string or object) | PASS | econ-book.json summary |
| 9 | verification | verify-then-sign bound in signing agents (4/4) | PASS | verify-then-sign markers |
| 10 | verification | independent judge node exists (agent-verify workflow, fresh context) | PASS | .github/workflows/agent-verify.yml |
| 11 | verification | read-back law (chain speaks last) | PASS | chain-truth recon in curation |
| 12 | verification | secret-leak gate on the wire (gitleaks) | PASS | gitleaks workflow |
| 13 | verification | eval discipline live (runnable expectations, E1-E6) | PASS | agents/evals/ |
| 14 | verification | workflow-parse gate: every workflow file parses (full YAML floor, idiom fallback) — no dead lane wears a green shape | PASS | 74 workflows · mode full · offenders 0 |
| 15 | verification | skill-library gate: every skill package passes the authoring standard (namespaced name, Use-when triggers, proactive triggers, Evidence Artifact, tier & scope, MIT provenance pinned to the mirror sha) | PASS | 14 skill packages · offenders 0 |
| 16 | verification | doctrine anchor: the Authority Map (owner-confirmed 2026-10-03) lives in fleet-desk-operator and all NINE lineage pins (strix security Apache-2.0 + ax orchestration Apache-2.0 + mini-swe-agent MIT + free-claude-code AGPL-3.0-only + Graft MIT + agency-agents MIT + codebase-memory-mcp MIT + OpenMontage AGPL-3.0 + orca MIT) are pinned in the notices | PASS | authority-map=true (wallet=owner / sovereignty=desk / possession rows) · strix=true · ax=true · mini-swe=true · fcc=true (AGPL in-file) · graft=true · agency=true · cbmem=true · montage=true (AGPL in-file) · orca=true — nine anchors checked here (+ claude-skills MIT via the gate's authoring-standard check) = the ten-lineage constitution |
| 17 | verification | ci-hands book: the fleet measures its own CI estate (16 repos sampled, failures classified, transient-aware verdicts, trajectory booked) | PASS | reached 2/16 · lanes 20/22 green · active-red 2 · startup-failures 0 · age 0h · mode keyless |
| 18 | scope | doctrine binds kill rules (ventures have them) | FAIL | DOCTRINE-economics.md §4 |
| 19 | scope | ventures board carries kill rules (5/5) | PASS | ventures.json |
| 20 | scope | resource floors/ceilings in code (VP floor, dust holds, RC gate) | PASS | treasury-desk CUR_VP_FLOOR |
| 21 | lifecycle | CLAIMS ledger fresh (receipts keep continuity) | FAIL | last receipt nullh ago |
| 22 | lifecycle | recovery path codified (RESUME-KIT + .fleet/restore.sh) | FAIL | canon reachable |
| 23 | graph-failures | Goodhart countermeasure: two-sided ledger, measured never estimated | FAIL | EARN-GOVERNOR LAW |
| 24 | graph-failures | Blindness-upward countermeasure: kill rules + operator gate | FAIL | kill rules + operator gates |
| 25 | graph-failures | Conflict countermeasure: rebase races + one-lock doctrine | PASS | recruit.yml pull --rebase |
| 26 | anchors | book timestamp hygiene (every live book stamps its run) | PASS | all live books stamped |
| 27 | anchors | earn fills pinned to chain arithmetic (seed provenance) | PASS | fills-ledger.json seeds |
| 28 | anchors | KPI names its method (oracle discipline) | FAIL | KPI.json method field |
| 29 | anchors | spot oracle measured at run time (not cached stories) | PASS | ventures.json priceOracle |
| 30 | graph | every FILLED role names a reachable worker artifact (role→worker wiring) | PASS | 6 FILLED roles · 6 wired |
| 31 | loop | all six loop primitives have live fleet instances (automations/worktrees/skills/connectors/sub-agents/external state) | FAIL | workflows:74 desks:119 receipts:true books:10 claims:false |
| 32 | sovereignty | role-registry integrity: every charter row names a real file (roles-as-data, no invented agents) | PASS | 57 rows · cols 9 · dupes 0 · missing files 0 |
| 33 | sovereignty | change-request ledger integrity: every CR well-formed, no PENDING abandoned >7d | FAIL | 78 CRs · malformed 4 · stale-pending 0 · schema family judged (charter + rung generations) |
| 34 | sovereignty | mechanical override live: destructive-command guard stamped, evals E7-E9 pin it | PASS | ledger at 2026-10-12T12:27:53.749Z · scan denies 0 · guardEvals green |
| 35 | sovereignty | cognitive rail governed: provider registry valid, forbidden rails never enabled, keyless probes booked, E10-E12 pin it | PASS | agents/inference-providers.csv + rail-ledger.json |
| 36 | fate-defense | Emergence-World adoption: FWI scorecard fresh (9 indicators, each with a mechanical evidence source) + STASIS breaker armed + engine obeys it | PASS | FWI DEGRADED fresh · 9 indicators · sources all named · stasis armed=true · engine gate=true |
| 37 | sovereignty | collapse drill containment-proof: 4 fault classes injected into throwaway trees, judge caught every one on a fresh run | FAIL | verdict BASELINE-RED · caught 4/4 · baseline green=false · age 25.4h · head 963e2382fbdf |
| 38 | sovereignty | one-bloc convergence book: the whole git (16 repos) measured mechanically into ONE map — roles, HEADs, honest statuses, laws armed | WARN | verdict DEGRADED · reached 2/16 · keyless 2 · age 0h · maps bound 3 |
| 39 | lifecycle | canon reachability proven: a live leg serves the Defi canon, legs booked, never DARK, receipt fits reality (Z-42) | FAIL | verdict CONTENT-SERVED · legs L1:SERVING L2:RAIL-DOWN L3:DEAD-AS-EXPECTED-PRIVATE · fresh · L1-now absent |
| 40 | sovereignty | hands book: execution surfaces probed, never claimed — every LIVE hand receipted, ABSENT honest, tier-C locks named, zero hopeful greens (Z-43) | PASS | hands 6 · LIVE 3 (receipted all) · ABSENT 1 · locks 3 · fresh |
| 41 | sovereignty | daily pulse book: the self-improvement loop closed under law — day ledger, typed proposals, judge+evals gates recorded, verify-only (Z-48/Z-49) | PASS | proposals 14 · PROPOSED-CR:6 GATED-BLOCKED:2 DEFERRED-TIER-C:4 BOOKED:2 · fresh · verifyOnly true |

**Books pulse:** econ-book.json (183.5h) · curation-book.json (189.8h) · money-ledger.json ✓ · ventures.json ✓ · fills-ledger.json ✓ · bridge-book.json ✓ · dex-book.json ✓ · learning-ledger.json ✓ · recruitment.json ✓ · hands-book.json ✓

**Four silent costs (watched, per the study):**
- **verificationDebt:** selftests cover past incidents; every NEW failure mode (concat family ×3, null-deref, dedupe) becomes a check within one wave of discovery
- **comprehensionRot:** notebooks (v1-v5-NOTES.md) rewritten per cycle; doctrine rewritten on amendment — no tribal memory
- **cognitiveSurrender:** judge nodes (agent-verify, this desk) are separate processes with fresh context
- **tokenBlowout:** CI does the deterministic work; agent sessions only where judgment is required (LABOR TIERING LAW)

_The model is smart, the harness makes it reliable. This desk is the checker node the producer cannot be (generator/evaluator separation)._
