# arb-mesh — THE MESH MARKET (R41, CR-0071)

At: 2026-10-04T21:24:40.643Z · Verdict: **GATED-WIRE (edge above floor but no free capital to arm the agents — named, never faked)** · batch: MESH-2026100421-3d45bf9e · protocol: SAOS-ARB-MESH/1

Roster: 11 accounts (headcorner + 10 soldiers) · Edge candidates: 1 · Intents drafted: 0 · Fills settled: 0 · Refusals: 0


| Edge row | Direction | Net bps | Floor | Source |
|---|---|---|---|---|
| A1 P3 STEEM/SBD pool mid vs CEX-implied fair | SBD→STEEM (sell the rich side) | 366.24 | 120 | dex-core.json (our pool — atomic, no bridge) |

## Size ladder (the large-sums law — exact BigInt, honest slippage)


**P1 WSTEEM/STEEM** (mid 1.07679262 STEEM/, fee 2bps):

| Size (% depth) | In | Out | Exec price | Slippage |
|---|---|---|---|---|
| 0.1% | 374µ | 376µ | 1.00534759 | -6.63bps |
| 1% | 3744µ | 3766µ | 1.00587607 | -6.58bps |
| 5% | 18721µ | 18762µ | 1.00219005 | -6.92bps |

**P2 WSBD/SBD** (mid 1 SBD/, fee 2bps):

| Size (% depth) | In | Out | Exec price | Slippage |
|---|---|---|---|---|
| 0.1% | 27µ | 26µ | 0.96296296 | -3.7bps |
| 1% | 274µ | 273µ | 0.99635036 | -0.36bps |
| 5% | 1372µ | 1365µ | 0.99489796 | -0.51bps |

**P3 STEEM/SBD** (mid 0.10673495 SBD/, fee 25bps):

| Size (% depth) | In | Out | Exec price | Slippage |
|---|---|---|---|---|
| 0.1% | 1545µ | 164µ | 0.10614887 | -0.54bps |
| 1% | 15456µ | 1629µ | 0.10539596 | -1.25bps |
| 5% | 77284µ | 7837µ | 0.10140521 | -4.99bps |

## Mesh P&L (lifetime, from the ledger — the core book is the source of truth)

Fills: 1 · Volume in: 5000µ · Edge captured: -7µ · Fees paid (LP revenue): 0µ
- headcorner: 1 fills · vol 5000µ · edge -7µ · fees 0µ

Laws: L1 L2 L3 L4 L5 L6 L7 L8 L9 L10 L11 L12 L13 L14 L15 · Gate law: the counter-grid gate follows CR-0074 (open = GATED-ARMED-BROADCAST-READY, closed = PLAN-POOL-GATED-NOT-BROADCAST) — the mesh never fires a keyed rail either way.

