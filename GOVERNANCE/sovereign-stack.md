# The Ultimate Sovereign Stack — v1

Owner directive (IM trace 1a137bf80ea09539, 2026-10-14): take the sovereignty to the
2026 state-of-the-art in **Production-Grade Runtimes, AVS-style verification, and
MCP edge integrations**, by integrating three verified reference architectures:

| Layer | Reference (verified, cloned & studied) | What we adopted |
|---|---|---|
| 1. Identity | [`erc-8004/erc-8004-contracts`](https://github.com/erc-8004/erc-8004-contracts) — EIP-8004 *Trustless Agents* (IdentityRegistry ERC-721+URIStorage, registration-v1 file, global id `{namespace}:{chainId}:{identityRegistry}`) | registration-v1 files per fleet agent + a git-native registry of record + cryptographic identity root (EIP-712-ready) staged for on-chain anchoring |
| 2. Guardrails | [`0xYudhishthra/adapt.ai`](https://github.com/0xYudhishthra/adapt.ai) — PolicyAVS on EigenLayer (agent drafts off-chain tasks w/ calldata → operator network validates against hard whitelists → refuses to sign, slashing on violation) | a deterministic policy engine + gate that validates every capital-touching intent **before** execution; violation = refuse + quarantine (our slashing) + ONE deduped issue |
| 3. Runtime | [`aeonfun/aeon`](https://github.com/aeonfun/aeon) — unattended cron agents on GitHub Actions, memory in git, `skill-health` scores runs → `skill-repair` repairs, no approval loops | run scoring over the network STATE + classification + deduped repair proposals + STRATEGY.md north-star + an MCP tool edge over issue-label transport |

## The integration law (the owner's "Ultimate Sovereign Stack")

1. **Identity** — every agent that acts on the estate gets a portable, verifiable
   identity (ERC-8004-shaped). The identity document LINKS its policy (`policyRef`)
   and its runtime skill (`runtimeRef`).
2. **Guardrails** — Layer 2 governs Layer 3: the runtime harness may only
   self-heal/rewrite inside the `autonomy` rulebook of `policy.json`. Full autonomy,
   hard rules, no capital loss. The agent is free INSIDE the fence.
3. **Runtime** — the unattended loop (cron, git memory, no approval loops) runs
   everything; every run is scored; every persistent failure becomes a deduped
   repair proposal; nothing storms the operator.

## Compose-not-replace (the estate already had organs — the stack is the layer ABOVE)

| Existing organ | Role it keeps | Stack layer it feeds |
|---|---|---|
| `agents/sovereign-policy.json` (Domain) | the market-exec gate laws (caps, band, ADD-ONLY, buy-premium breaker) | Layer 2 composes: stack ceilings are HARD OUTER bounds; existing gate stays the inner authority |
| `agents/STASIS.json` (Domain) | the one-file capital halt | Layer 2 reads it every flight; `active:true` ⇒ every capital verdict becomes ESCALATE |
| `agents/sovereign-pending.json` (Domain) | Tier-E escalation parking lot | Layer 2 writes nothing there (read-only v1); its violations escalate via claims/issues per the anti-storm law |
| `assets/sovereign/selfscan.mjs` + `claims-triage.mjs` | network awareness + decision ladder | Layer 3 consumes `network/STATE.json`; triage stays the quarantine (slashing) executor |
| `sovereign-decider.yml` | standing decision organ | peer organ; unaffected |
| `identity-guard.yml` / `identity-patrol.yml` | commit-author identity law (DECISIONS #10) | ORTHOGONAL scope (they police git authorship; Layer 1 registers AGENTS) — naming kept distinct |

## What is REAL today vs STAGED (honesty ledger)

- **REAL (live in git, this commit):** 5 founding agent identities (registration-v1
  shape, validated by schema + engine selftest each flight); identity root hash
  (sha256 over sorted per-agent hashes) computed and committed hourly; policy
  engine with 12 selftest vectors guarding the live intent books
  (`dex/xc-intents.json`, `dex/state.json` tape) with STASIS composition; run
  scores + repair proposals + MCP issue-label router — all keyless (GITHUB_TOKEN
  + public reads), all exit-0 measurement-duty, all deduped.
- **STAGED (documented path, blocked on one thing each):**
  - *On-chain ERC-721 mint of the IdentityRegistry:* needs a funded deployer key.
    Reference implementation studied: `IdentityRegistryUpgradeable.sol` (UUPS).
    Until then the root is anchored through the PROVEN rail (Domain
    proof-pipeline → anchor-execute, Optimism — measured live 2026-10-13,
    tx 0x2b0a6720…, block 158,168,506): the EIP-712 intent payload sits ready in
    `sovereign/stack/identity/identity-root.json`.
  - *Staked operators with real slashing:* our validator network is deterministic
    code (policy gate) + the triage ladder; "stake" = the agent's own schedule
    (violation ⇒ quarantine = schedule disabled — the slashing analogue). Real
    restaking is a protocol upgrade, not a code change — flagged for the operator.
  - *MCP over HTTP:* the estate is git-native by law (sandbox-hostile); transport
    is issue-label commands (`mcp-invoke`) answered in-thread. The `tools.json`
    manifest is MCP-server-shaped so an HTTP adapter can front it later.

## Cadence & anti-storm compliance

- `sovereign-identity` hourly (:53) · `sovereign-policy-gate` 2×/hour (:11,:41) ·
  `sovereign-harness` hourly (:47) — no collisions with selfscan (:21),
  triage (:04,:34), patrol/decider (:13,:43).
- All three: **exit 0 on measurement duty** (RED lives in books/claims/issues),
  publish = defer-not-fail (8 retries, rebase-before-push), **ONE deduped issue
  per new signature**, never sleep while holding a lock, never edit another
  lane's bytes (agent-scoped paths only: `sovereign/stack/**`).
