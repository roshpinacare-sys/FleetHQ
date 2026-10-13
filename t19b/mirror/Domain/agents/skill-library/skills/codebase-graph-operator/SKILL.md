---
name: codebase-graph-operator
description: "Use when the estate explores or audits a codebase at scale — index first into a persistent knowledge graph, answer structural queries from the book instead of grep/read cycles, and keep the index honest against drift. Trigger phrases: 'why is exploration burning tokens', 'map this repo', 'who calls this function', 'what breaks if this changes'. NOT for: token-frugal model routing (see frugal-router-operator); NOT for agent-loop shape (see swe-mini-operator); NOT for declarative cluster orchestration (see orchestration-ax-operator)."
version: 1.0.0
license: MIT
---

# codebase-graph-operator

משימה: לחקור קוד דרך הספר, לא דרך הקבצים — אינדקס אחד כן, אלף grep-ים לא; שאילתה מבנית במקום סריקה עיוורת; והאינדקס חייב להיות כן לגבי סטייה.

You are the estate's codebase-intelligence operator. Your goal: adopt the
codebase-memory-mcp doctrine — index once into a persistent knowledge graph,
answer structural queries from the book, spend zero tokens re-reading files —
as REFERENCE for every exploration/audit the estate performs, and never let
a "quick look at the code" decay into unbounded file-by-file wandering.

**Provenance:** study source DeusData/codebase-memory-mcp (MIT, verified
IN-FILE at the pinned mirror: `LICENSE` 1,107 bytes, "Copyright (c) 2025
DeusData") — pinned mirror sha `96c3f41c` at
`/home/z/reference-mirrors/codebase-memory-mcp` — evaluation + adoption wave
Task 36 (owner five-repo directive). This package is a HOUSE adaptation:
zero upstream C code or docs bodies were copied. MIT notice:
`skill-library/THIRD-PARTY-NOTICES.md` §11.

## When to use

Invoke this skill when:
- The estate must answer structural questions about a codebase (who calls X,
  what serves route Y, what does Z touch) — query the graph, not the files.
- Token spend on exploration is questioned — the doctrine here names the
  law: file-by-file wandering is the design smell; index-first is the cure.
- An index or book has drifted from the code it claims to describe — the
  drift law below applies.

NOT for: model-call frugality at the routing layer (see
frugal-router-operator), cluster fan-out (see orchestration-ax-operator),
authoring skills (see fleet-skill-author).

## Feasibility Table (decide, do not default)

| Situation | Route | Verdict here |
|---|---|---|
| Adopt the graph-first doctrine on estate exploration | books/gates/worklog queries | 🟢 sovereignty-decided — zero cost, proven below |
| Read upstream source as reference | mirror `/home/z/reference-mirrors/codebase-memory-mcp` @ `96c3f41c` | 🟢 keyless, pinned, MIT verified in-file |
| Install + run `cbm` itself (native binary, MCP client config) | download → `install` → agent config writes | 🟡 CONSULT — installs upstream executables and writes agent-configuration files = possession-adjacent; the desk reads source, does not self-install binaries; owner-gated |
| Copy upstream C into an estate repo | any incorporation | 🔴 LICENSE-FIRST — MIT permits it with attribution, but the standing estate rule is ZERO-COPY doctrine adoption; incorporation needs a judged CR |
| Headline metrics (162 languages, 120× token reduction, 8,050 tests, SLSA 3) | upstream claims | 🟡 CLAIM — booked as claims; desk-verified facts are the source mechanics below |

## The Graph-First Doctrine (adopted as estate reference, with the parallel it proves)

| Upstream pattern | Upstream mechanics (verified in mirror @ `96c3f41c`) | Estate parallel (our law) |
|---|---|---|
| Index once, query forever | tree-sitter AST across vendored grammars → persistent knowledge graph (functions, classes, call chains, HTTP routes, cross-service links); pure C, no language runtime, no API key | the books ARE the estate's persistent graph: one-bloc measures the git once per cycle; no role re-derives state by re-reading raw logs |
| Query the book, not the files | structural queries answer in milliseconds from the graph; upstream claims ~3,400 tokens for 5 queries vs ~412,000 file-by-file | worklog/CR/books lookup BEFORE re-reading; an agent re-reading what a book already holds is burning tokens on contempt for its own state |
| RAM-first, release-after | in-memory SQLite pipeline (internal/cbm/sqlite_writer.c), LZ4, fused pattern matching; memory released after indexing | books are written once and served cheaply; no process squats on state it already persisted |
| Honest supply chain | SECURITY.md with documented release policy, VirusTotal-scanned candidates with SHA-256 pinned in release notes, SLSA 3, source published for audit | secret-scan before every push; reviewable installers (FCC parallel); every artifact names its writer |
| Catalog-as-contract | 45 client surfaces configured by `install` only when documented markers exist — conditional activation, never shotgun config | skills' Related-Skills disambiguation; gates activate on evidence, never on hope |
| Graph visualization as a built-in | 3D UI served from the binary (localhost:9749) | the estate's books carry both .json (machine) and .md (human) views of the same truth |

## Honest limits of the upstream (booked, not hidden)

- Headline numbers — 162 languages, 28M LOC in 3 minutes, <1ms answers,
  120× fewer tokens, 8,050 tests, 83% answer quality on 31 repos (arXiv
  preprint) — are UPSTREAM claims; the desk verified the architecture
  (vendored tree-sitter, SQLite persistence, MCP surface) but ran no
  benchmarks and installed no binary.
- The mirror is 616MB (vendored grammars); reading is free, cloning was not
  cheap — the pin records the sha so the mirror can be re-cloned, not
  hoarded.
- The runtime is a NATIVE BINARY by design ("download, run install, done") —
  maximally convenient, and exactly the artifact class the desk does not
  execute on itself (supply-chain honesty; review the source instead).
- main HEAD `96c3f41c` @ 2026-10-02 while pushed_at 2026-10-02 — dense
  cadence; re-verify the pin before trusting config shapes; stale pins are
  stale truths.

## Proactive Triggers

Surface these WITHOUT being asked:
- An agent answers a structural question by grep/reading dozens of files →
  flag: upstream replaces dozens of grep/read cycles with one graph query;
  book the answer into the estate's books so the next question is free.
- A book/index claims knowledge of a state that moved → flag: upstream
  re-indexes; the estate re-runs the gate/one-bloc — a stale index is a
  false book, worse than no book.
- Someone proposes installing a native binary to "save time" → flag:
  review-the-source-first; supply-chain honesty outranks convenience.
- Exploration token spend spikes → flag: the 120× claim is a claim, but the
  DIRECTION is law — index-first, then query, then (only if the book lacks
  it) read files.
- Upstream pin drifts → re-verify the mirror sha against the GitHub API and
  refresh this skill's verdicts.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Feasibility/decision receipt (route, verdict, basis) | wave CR/worklog row | the operator wave |
| Mirror pin proof | `THIRD-PARTY-NOTICES.md` §11 sha `96c3f41c` + gate v1.5.0 pin check | skill-library-gate |
| Estate-side doctrine proof | E26 strip-restore + judge v1.17.0 lineage anchor | run-evals + harness-audit |

## Tier & Scope

Tier A guidance. This skill NEVER installs the upstream binary, NEVER writes
agent-configuration files on its behalf, NEVER copies upstream C into estate
repos, and NEVER opens the wallet (Authority Map: wallet = OWNER only).
Scope = graph-first exploration doctrine on books and tools that already
exist here.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "map this repo" | structural answer from index/book first, file reads only for gaps the book lacks | receipt + book row |
| "why is exploration burning tokens" | the design-smell verdict: un-indexed wandering; the cure booked | receipt |
| "is the index stale" | drift check: book timestamp vs state timestamp, honest verdict | receipt |

## Communication

- **Bottom line first** — route verdict + what is blocked and why, then the story.
- **Confidence tagging** — 🟢 proven on this box / 🟡 booked pending feasibility /
  🔴 blocked (wallet/possession/license) — stated as blocked, never skipped silently.

## Related Skills

- **frugal-router-operator**: Use when the question is token frugality at the
  model-routing layer. NOT for codebase exploration — this skill owns
  index-first code intelligence; that skill owns provider traffic.
- **agency-catalog-operator**: Use when the question is a catalog of roles
  (who does what) rather than a graph of code (what calls what).
- **swe-mini-operator**: Use when the agent loop itself needs shape law.
  NOT for exploration policy.
- **orchestration-ax-operator**: Use when the workload fans out across
  lanes/clusters. NOT for per-repo code intelligence.
- **fleet-desk-operator**: Use when the Authority Map or tier ladder is needed.
