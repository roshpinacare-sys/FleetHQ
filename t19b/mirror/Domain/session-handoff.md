# Session Handoff — Domain

## Blockers
- Owner-only keys: tov-hive + headcorner-hive exist in NO git folder (proven
  negative, Task 13) — cannot be wired from here; owner closes these.
- Realized >1¢/day needs days of maturing receipts — cadence, not code.

## Files
- `AGENTS.md` — the landing protocol (read first)
- `feature_list.json` / `progress.md` / this file — the state layer
- `agents/harness-audit.cjs` — judge node; its json/md are the latest verdict
- `agents/*.json` — machine books (external state; stamp before you leave)
- `.github/workflows/economy-engine.yml` — daily economy (dispatch = don't wait)
- Sibling canon: `../Defi/fleet/` (AGENTS, DOCTRINE, DOCTRINE-economics, CLAIMS)

## Next Session
1. `git pull --rebase origin main` first (parallel runtimes are real).
2. `./init.sh` — baseline green? If not, repair before new scope.
3. Read `agents/harness-audit.md` verdict + `Defi/fleet/CLAIMS.md` tail —
   never re-do what a receipt already closes.
4. Take exactly one feature from `feature_list.json` to done-with-evidence.
5. Update the three state files; push rebase-first; leave books fresher.

## R39 booked rungs (do not re-derive)
- THE SWAP NET is live (CR-0069, feat-064, E62, suite v1.48.0): dex-router.cjs
  hourly lane measures venues/routes/arb/counter-grids; execution stays with the
  owner-gated signing surfaces. Next: peg-out rail identity (R11 exit corridor),
  HBD/USDT real leg (A2 FEED-STALE until found), operator CEX keys (R7-R9),
  drip-day grid-cap expansion (2026-10-10).

## R40 booked rungs (do not re-derive)
- THE EXCHANGE CORE is live (CR-0070, feat-065, E63, suite v1.49.0): dex-core.cjs
  settles swaps atomically on our own ledger — CPMM volatile + stableswap peg pools,
  reserve-backed wrapped vault (mint 1:1, redeem ALWAYS 1:1), conservation identity,
  attestation sha256, deterministic ≤3-hop routing, rebalance FLOOR law on our own
  pool (LVR defense), pool-side counter-grids, drip-fuel loop (DEPOSIT-DELTA ops).
  Hourly lane: dex-core-cron.yml :41 (selftest then tick then commit).
- Next: a real SAOS claim measured into the vault arms P4 (PLANNED-NO-CLAIM today);
  peg-out rail identity (R11 exit corridor); HBD/USDT real leg (A2 FEED-STALE);
  operator CEX keys (R7-R9); drip-day custody delta books itself (2026-10-10).

## R41 booked rungs (do not re-derive)
- THE MESH MARKET is live (CR-0071, feat-066, E64, suite v1.50.0): arb-mesh.cjs drafts
  mandates (operator-40/soldiers-60, budget = 1% of first-hop depth, direction =
  sell-the-rich-side) and the core settles batches atomically (batch-idempotent, wires
  capped 10% of free treasury, fills ≤5% of depth, all-or-nothing hops, honest-or-null
  edge). Operator pipe-proof fill booked on the live ledger; first live tick NO-EDGE
  (the floor law protects the P&L). Hourly lane: arb-mesh-cron.yml :07.
- Next: a measured SAOS claim arms P4; operator CEX keys (R7-R9); drip-day expansion
  (2026-10-10); intents/bridges to EVM/TRON/SOL doors (ERC-7683 as the template).

## R42 booked rungs (do not re-derive)
- THE MULTI-NETWORK VAULT is live (CR-0072, feat-067, E65, suite v1.51.0): dex-core.cjs
  v1.2.0 holds what its keys can move and sees every network. Custody classes
  (MEASURED-KEYED mintable-only; OBSERVED-POST-KEYED BLURT 67.841; OBSERVED-UNCONTROLLED
  HIVE 0.034+0.003 HBD; PLANNED-NO-CLAIM SAOS; OBSERVED-ABSENT honest), keyless condenser
  probes with node provenance every tick, issuer identity SAOS-DEX-ISSUER/1
  (d7ff39690365bfa8), redeem corridor burn-before-payout + pegout queue
  (dex/pegout-queue.json, corridors: KEYED-DESK for STEEM/SBD, PLAN-PEGOUT-KEYED-OPERATOR
  for HIVE/HBD/BLURT), pool catalog P5-P9 (WHIVE/HIVE, WHBD/HBD, WBLURT/BLURT,
  HIVE/STEEM cross, WSBD/WHBD dollar bridge), cross-fair law (1.8692 HIVE per STEEM).
- Upgrade law: the custody class upgrades THE SAME TICK verified active key material
  appears in a protected desk (key-check law) — no new code on that day; the pools
  arm from the deterministic 25% genesis law.
- Next: hive/blurt active keys verify → P5/P6/P7/P9 arm + A2 wakes; a measured SAOS
  claim arms P4; operator CEX keys (R7-R9); drip-day (2026-10-10) books itself;
  EVM/TRON/SOL intent doors (ERC-7683 template).

## R43 booked rungs (do not re-derive)
- THE INTENT GATES are live (CR-0073, feat-068, E66, suite v1.51.0 → v1.52.0): dex-xc.cjs
  (SAOS-DEX-XC/1) runs the cross-chain intent doors — 8 networks with measured hard-finality
  clocks (EVM 780s / TRON 60s / SOL 13s / STEEM+HIVE 60s / BLURT 63s) and honest bands
  (KEYED-DESK / PLAN-PEGOUT-KEYED-OPERATOR / PLAN-KEYED-DOOR); the ERC-7683 lifecycle over
  ONE ledger (escrow-identity per intent, escrow-drain idempotency, quotes from OUR pools
  −0.5%, pool-default solver with P2P roster outbids, the 2:1 HTLC clock interlock, the bond
  law exposure ≤ 2× custody, the 5% split-fill cap, whole refunds). dex-core.cjs v1.3.0
  settles the doors' ops atomically (settleXcOps / settle-xc) and re-derives route rows after
  any pool move (the pool-mover's re-derivation law). LIVE PIPE-PROOF booked (seq 18→22):
  1000µ SBD → our pools → 9358µ WSTEEM → redeem 1:1 → pegout queued KEYED-DESK → confirmed
  at finality+1s, conservation true at every op.
- BASE-REPAIRS locked as E66 golden vectors: routeBest reversed-leg quoting (SBD→STEEM 1000µ
  quoted 105µ instead of 9402µ) + poolSwap b-side newRa/newRb transposition — both masked
  since R40 by 'ab'-only fills and symmetric peg pools.
- Hourly lane: dex-xc-cron.yml :53 (selftest → doors tick → commit, keyless, rebase-first).
- Next: hive/blurt active keys verify → P5-P9 + the EVM/TRON/SOL door bands arm (no new
  code); a measured SAOS claim arms P4; operator CEX keys (R7-R9); drip-day (2026-10-10)
  books itself; intent fill competition widens as the soldiers' desks come online.
