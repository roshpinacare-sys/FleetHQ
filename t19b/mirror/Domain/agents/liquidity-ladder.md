# Liquidity Ladder — what we hold, what flows with certainty (Z-32 bridge)

_liquidity-desk v1.0.0 · 2026-10-02T14:51:56.383Z · read-only census (zero keys) · census: 3435ms_

## Fleet totals per chain

| chain | alive | liquid | debt | pending liquid | pending debt | pending vests | VP mean |
|---|---|---|---|---|---|---|---|
| steem | 11/11 | 17.335 | 43.785 | 0 | 0 | 0 | 74.490098% |
| hive | 11/11 | 0.035 | 0.003 | 0 | 0 | 0 | 98.908588% |
| blurt | 11/11 | 82.551 | 0 | 0 | 0 | 0 | 97.475599% |

## The certain-flow ladder (every rung = a machine that already exists)

| rung | what | certainty | executors | now |
|---|---|---|---|---|
| R1-CLAIMS | pending rewards → liquid/SP (chain rule, posting-only, idempotent) | DETERMINISTIC | fleet-claim.cjs (steem, daily CI) + treasury-desk.cjs (hive+blurt) | `{"steemPendingVests":0,"hivePendingVests":0,"blurtPendingVests":0}` |
| R2-CURATION | idle VP × effective SP cast by public policy (soldiers desk 2x/day + head desk) | DETERMINISTIC accrual, USD measured at next claim delta | soldiers-curate.cjs + treasury-desk.cjs curation lane | `{"steemVpMean":74.490098,"hiveVpMean":98.908588}` |
| R3-DEBT-CONVERT | SBD/HBD via internal market when premium ≥ fees | CONDITIONAL (premium gate) | treasury-desk armed rail (EXEC_ENABLED=1) | `{"steemDebt":43.785,"hiveDebt":0.003}` |
| R4-HE-BOOKS | idle HE tokens into live books above keep-law | GATED (RAIL-HEALTH + GHOST-BOOK) | econ-desk.cjs 4h CI | `{}` |
| R5-FUEL-PACE | powerdown pacing: extend runway while earn side proves | DETERMINISTIC math, op needs active key (operator-gated option) | OPTIONS ONLY this wave | `{"weeklySp":475.828133,"remainingSp":1903.312533,"remainingWeeks":4,"nextPayout":"2026-10-03T02:01:27"}` |

## Fuel pacing options (runway math, operator-gated active-key op — nothing executed here)

- as-is: SP runs out in ~4w
- pace 50%: draw 237.914067 SP/wk → runway ~8w (RC/capital needs reviewed first)
- pace 25%: draw 118.957033 SP/wk → runway ~16w

_Per-account detail in liquidity-ladder.json. Execution: fleet-claim (steem daily) + treasury-desk (hive/blurt claims + curation) + econ-desk (HE, gated). This desk measures; it never signs._
