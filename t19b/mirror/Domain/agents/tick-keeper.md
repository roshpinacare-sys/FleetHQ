# Tick keeper · 2026-10-04T00:29:41.896Z

STASIS: false · fired: sovereign-tick-cron=status 404, fill-ledger-cron=status 404, market-grid-cron.yml=DISPATCHED, audience-analyst.yml=DISPATCHED

| desk | last receipt | law | verdict |
|---|---|---|---|
| earn-audit-cron | 2026-10-04T00:06:57.929Z | 45m | fresh 22.7m <= 45m |
| fleet-census-cron.yml | 2026-10-04T00:24:54.329Z | 1560m | fresh 4.8m <= 1560m |
| twin-audit.yml | 2026-10-03T22:43:11.481Z | 1560m | fresh 106.5m <= 1560m |
| self-audience.yml | 2026-10-03T22:43:34.930Z | 1560m | fresh 106.1m <= 1560m |
| public-pulse.yml | 2026-10-04T00:24:53.436Z | 1560m | fresh 4.8m <= 1560m |
| sovereign-tick-cron | 2026-10-03T22:43:14.918Z | 20m | RE-FIRED (book stale 106.4m > 20m) |
| fill-ledger-cron | 2026-10-03T22:45:37.515Z | 45m | RE-FIRED (book stale 104.1m > 45m) |
| market-grid-cron.yml | 2026-10-03T22:43:07.849Z | 45m | RE-FIRED (book stale 106.6m > 45m) |
| audience-analyst.yml | — | 1560m | RE-FIRED (no-receipt-yet) |

_the healer obeys the breaker: STASIS halts before any dispatch; cooldown 20m per desk; the arc's own receipts (pushed by the desks) are the only truth measured_
