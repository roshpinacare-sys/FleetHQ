# market-grid — internal-market sovereignty instrument (Z-60+)

At: 2026-10-12T06:28:08.725Z · Verdict: **MARKET-GRID-LIVE** · Markets read: 3 · Errors: 0

| Market | Bid | Ask | Spread% | 24h% | Grid rungs | Step | Paper fills (snapshot) |
|---|---|---|---|---|---|---|---|
| HBD/HIVE (internal hive) | 0.05577898136424233 | 0.05581701327754277 | 0.0682 | 0.617 | 10 | 0.00022319 | 5 |
| SBD/STEEM (internal steem) | 0.10192784882611185 | 0.10271206001154068 | 0.7664 | 0 | 10 | 0.00040928 | 5 |

Hive-Engine basket (keyless RPC, per-token fee measured from the tokens contract): BEE spread 0.571% fee 0bps pond 191.64049198 SWAP.HIVE/24h FEASIBLE · SWAP.LTC spread 0.0563% fee 0bps pond 1609.03045357 SWAP.HIVE/24h thin · SWAP.DOGE spread 2.1902% fee 0bps pond 482.4277698 SWAP.HIVE/24h FEASIBLE · CENT spread 0.4515% fee 0bps pond 118.41095046 SWAP.HIVE/24h FEASIBLE · WAIV spread 0.7125% fee 0bps pond 2.11799764 SWAP.HIVE/24h FEASIBLE
HE daily-history probe: DARK (probed, honest) — HE-DAILY-HISTORY-DARK: marketHistory/history answered null (not RPC-exposed) — the day it answers, the pond becomes a series

Blurt internal market: DARK (probed, honest) — BLURT-SURFACE-DARK: getaddrinfo ENOTFOUND api.blurt.world

Laws: official sources only (chain nodes + sidechain RPC) · keyless: reads only, executor = owner-gated preview, never broadcast · paper is paper (labeled ledger, never laundered into realized book) · fail-loud per market · single canon (market-grid.json/.md) · the pond law: every venue carries its measured 24h volume (v1.3.0 CR-0062)

Executor preview: 20 prebuilt limit_order_create payloads, ALL stamped OWNER-GATED-NOT-BROADCAST (law 2). Paper fills: 20 rows appended to market-grid-paper.jsonl (law 3).

Sources: api.hive.blog, api.steemit.com (condenser_api), api.hive-engine.com/rpc/contracts — official chain surfaces, keyless reads.