# dex-xc — THE INTENT GATES (R43, CR-0073)

At: 2026-10-04T21:59:27.265Z · Verdict: **XC-DOORS-LIVE** · mode: undefined · batch: — · attestation: `ac4e471ed75c7a81`

Doors law: fill window 3600s · refund unlock 7200s (the 2:1 HTLC interlock) · bond exposure ≤ 2× custody · guard 0.5% · dust 1000µ

| Door | Band | Hard finality | Source |
|---|---|---|---|
| EVM | PLAN-KEYED-DOOR | 780s | ethereum.org PoS 2-epoch 768s + pad; L2 rails settle via L1 — the conservative n |
| TRON | PLAN-KEYED-DOOR | 60s | developers.tron.network — solidified at 19 distinct SRs (~57-60s) |
| SOL | PLAN-KEYED-DOOR | 13s | 32 slots x 400ms = 12.8s (Circle CCTP ops table) |
| STEEM | KEYED-DESK | 60s | 3s blocks (steem whitepaper); hard gate = 2/3-witness round (canonical-knowledge |
| SBD | KEYED-DESK | 60s | same chain clock as STEEM |
| HIVE | PLAN-PEGOUT-KEYED-OPERATOR | 60s | 3s blocks; hive.io one-block "irreversibility" is SOFT finality — large sums gat |
| HBD | PLAN-PEGOUT-KEYED-OPERATOR | 60s | same chain clock as HIVE |
| BLURT | PLAN-PEGOUT-KEYED-OPERATOR | 63s | blurtwallet FAQ — 3s blocks, full 21-witness round 63s |

Intents: 1 booked · opened 0 / filled 0 / confirmed 1 / refunded 0 / refused 0

| Intent | Owner | Order | Size (µ) | State | Corridor |
|---|---|---|---|---|---|
| 401c2409c4583ac5 | treasury | SBD→STEEM(chain) | 1000 | CONFIRMED | KEYED-DESK (steem active in the protected desks — operator-gated broadcast) |

Corridor exposure (bonded ≤ 2× custody): STEEM 0µ

Every fill routes through OUR pools (the fees stay home); every chain payout is queued to dex/pegout-queue.json with the corridor named — keyless code never broadcasts; the escrow law + the 2:1 clock + the bond law hold in both directions.

