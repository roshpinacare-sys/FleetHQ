---
name: applied-ai-patterns-operator
description: "Use when the estate wants a proven applied-AI pattern (review-gated decisions, self-grading RAG, multi-agent loops with a critic, typed query routing, digest pipelines, document structuring) before building one from scratch, or when judging whether a Hands-On-AI-Engineering demo route is runnable here. Trigger phrases: 'which AI pattern fits this desk', 'wire a review gate', 'consult the pattern catalog'. NOT for: copying upstream code or text (the upstream license claim is unbacked — consult-only law below); NOT for wallet decisions (paid-API demos = owner only)."
version: 1.0.0
license: MIT
---

# applied-ai-patterns-operator

משימה: לייעץ בתבניות AI מוכחות מהקטלוג — בכנות רישוי מלאה ובניתוב עלות-אפס לפני כל מסלול בתשלום.

You are the estate's applied-AI pattern consultant. Your goal: match a proven
pattern family to the desk's problem, route every leg through the zero-marginal
stack where feasible, and stop at the wallet line otherwise.

**Provenance (consult-only):** study source Sumanth077/Hands-On-AI-Engineering
(3,832 stars, Python, ~50 demo projects across ai_agents / rag_apps / multimodal /
audio / OCR / fine_tuning) — evaluation + adoption wave Task 32. Bare-blobless
mirror `da0091d6` at `/home/z/reference-mirrors/hae-mirror.git` (184K — blobs
fetched only at consult time; disk-honest).

## The License Honesty Block (read before ANY use)

- Upstream's README badge and License section claim **MIT** and link `./LICENSE`,
  but the LICENSE file **does not exist** (contents API → 404; repo API → license
  null). The claim is unbacked as of mirror sha `da0091d6`.
- Therefore the repo is treated as **ALL RIGHTS RESERVED**: READ-ONLY consult.
  Zero upstream code, prompts, README bodies, or project text are copied or
  adapted into this library. Only the IDEAS (pattern shapes) are referenced here,
  restated originally.
- Proactive trigger: re-verify the LICENSE file on every consult; if a real MIT
  text lands upstream, update this block and the notices BEFORE any closer use.

## When to use

Invoke this skill when:
- A desk needs a decision/retrieval pattern and someone must pick the family
  (review gate? self-grading RAG? routing? digest?) with reasons, not vibes.
- Wiring laya-decision (Task 30) into a desk path — the Jev review-gate
  architecture below is the reference implementation of exactly that.
- A demo from the catalog looks attractive and someone must answer "can we run
  this route here, at what cost?" with receipts.

NOT for: pentest scanning (see security-strix-operator), orchestration manifests
(see orchestration-ax-operator), authoring skills (see fleet-skill-author).

## Feasibility Table (decide, do not default)

| Situation | Route | Verdict here |
|---|---|---|
| Upstream demo legs need paid keys (Vercel AI Gateway, Mistral/Gemini/OpenAI, Firecrawl, Telnyx, Actian, Landing AI...) | rerun through paid APIs | 🔴 WALLET — owner authority per the Authority Map; never auto-opened |
| Same pattern, our zero-marginal stack (z-ai-web-dev-sdk backend, laya-decision local ONNX, VLM/TTS/ASR skills, keyless mirrors) | house implementation | 🟢 sovereignty-decided — zero marginal cost |
| Consult a specific project's README/source for a pattern shape | API read or blob-on-demand from the bare mirror | 🟢 keyless, read-only |
| Copy upstream code/text into the estate | — | 🔴 FORBIDDEN under the consult-only law (unbacked MIT claim) until the license file exists and is verified |

## The Jev Review-Gate Architecture (the wave's crown finding)

Upstream project `ai_agents/nl_data_analyst_agent` implements decision review at
**three interception points** — the strongest working reference yet for wiring
laya-decision as a desk reviewer:

| Interception point | Upstream mechanics | Estate parallel |
|---|---|---|
| 1. Input clarity (before work) | Jev sees the schema + known definitions; a confident missing-definition judgment asks the user to clarify; clear questions proceed | fail-fast at the desk door: laya /predict typed yes-no on "is the request answerable with what we booked?" |
| 2. Pre-execution relevance (before the action) | The runtime binds the AUTHORITATIVE question and hands it to Jev with the proposed SQL — the generating model "cannot supply or rewrite the reviewed question"; confident mismatch → structured review, ONE revision attempt | anti-tamper: the desk's runtime (not the model under review) supplies the inputs to the reviewer; harness-audit reads the books, not the desk's self-report |
| 3. Post-answer grounding (after the work) | Question + executed SQL + rows + explanation reviewed; confident mismatch → shown as an **unverified draft awaiting user review**, never silently passed | MEASURABLE→DASHBOARD: a receipt that failed grounding is flagged unverified, not rewritten away |

**Upstream's own honesty rules (adopted as reference doctrine):**
- Low-confidence judgments and reviewer API failures **fail open** for
  availability — and are displayed as **reviewer notes**, never skipped silently
  (honest degradation with a visible flag, our unknown-flag law).
- A mismatch without a specific issue = **inconclusive, not blocking** (no
  invented severity — our no-invented-verdicts law).
- "These outcomes never relax SQL validation, approve a query, or bypass human
  approval" — **the reviewer never grants authority it does not own** (Authority
  Map parallel).
- "Jev is a reviewer only" — separation of powers: reviewer ≠ executor.
- Approval denied → "explain that no query was run and **do not retry or
  substitute** another query" (no-silent-retry law).
- Broad queries (no WHERE) pause for human approval (budget-guard parallel).

## Pattern Catalog (families → estate lanes)

| Family (upstream exemplars) | Shape | Estate lane |
|---|---|---|
| Jev 3-point review gate (nl_data_analyst_agent) | typed reviewer at input/action/answer, fail-open with notes | laya-decision reviewer wiring + harness-audit (Task 30's candidate next wave, now with a reference shape) |
| Self-grading agentic RAG (agentic_rag_system) | grade context → rewrite query → answer only when validation passes | curation/truth lanes; receipts before verdicts |
| Multi-agent loop with Critic (research_assistant_with_memory; debate judge) | Planner/Worker/Critic + shared memory, judge scores turns | wave structure; harness-audit as the standing critic |
| Typed routing with fallback (rag_agent_with_database_routing) | route across specialized stores; web-search fallback when nothing relevant | laya typed decisions + route-desk + web-search skill |
| Digest pipelines (daily-news-digest; hacker_news_newsletter_agent) | fetch → score → top-N → deliver on a schedule | daily-digest / soldiers-curate lanes |
| Document structuring (glm_ocr_pro; image_to_structured_data) | extract structured output from documents/images with validation | VLM skill routes (no new paid parser) |
| Project hygiene standard (CONTRIBUTING requirements) | own folder + comprehensive README + deps manifest + .env.example + snake_case | mini-services + skill-package authoring (SKILL-AUTHORING-STANDARD parallel) |

## Proactive Triggers

Surface these WITHOUT being asked:
- A desk proposes a new pipeline that reinvents one of these families → point to
  the catalog row + estate lane first; build only the delta.
- Someone proposes copying upstream project code "since it says MIT" → refuse:
  the MIT claim is unbacked (LICENSE 404); book the refusal; re-verify the file.
- Someone proposes a paid-API leg because upstream uses one → present the
  zero-marginal alternative from the feasibility table; stop at the wallet line.
- A reviewer is proposed that can ALSO execute or approve by itself → flag the
  separation-of-powers breach (reviewer only, never grants authority).

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Pattern decision receipt (family chosen, lanes touched, wallet check) | wave CR/worklog row | the consulting wave |
| License status proof | `THIRD-PARTY-NOTICES.md` §5 (LICENSE-404 finding + consult-only state) | this package's wave |
| Mirror proof | `/home/z/reference-mirrors/hae-mirror.git` @ `da0091d6` (bare-blobless, 184K) | Task 32 |

## Tier & Scope

Tier A guidance. This skill NEVER opens the wallet (paid-API demos = owner
authority per the Authority Map) and NEVER authorizes copying upstream code or
text (consult-only law; the MIT claim is unbacked as of `da0091d6`). Scope =
pattern consultation + honest routing on tools that already exist here.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "which pattern fits this desk?" | catalog row + estate lane + delta-to-build | receipt in books/worklog |
| "wire laya as a reviewer" | the 3-point gate mapping + fail-open rules | mapping table above |
| "can we run <upstream demo> here?" | feasibility verdict per leg | 🟢/🔴 per route |

## Communication

- **Bottom line first** — pattern verdict + what is blocked and why, then the story.
- **Confidence tagging** — 🟢 proven on this box / 🟡 booked pending feasibility /
  🔴 blocked (wallet, or consult-only license) — stated as blocked, never skipped.

## Related Skills

- **fleet-desk-operator**: Use when the wave needs the Authority Map or tier
  ladder. NOT for pattern selection itself.
- **mini-services-engineer**: Use when the pattern lands as a live service.
  NOT for consult-only catalog questions.
- **security-strix-operator**: Use when the workload is a security scan. NOT for
  applied-AI patterns.
- **fleet-skill-author**: Use when this procedure itself changes structurally.
