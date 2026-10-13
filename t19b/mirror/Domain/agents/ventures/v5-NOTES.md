# V5 · Fuel grid — NOTEBOOK (Z-34 cycle, 2026-10-02)

**Goal:** external fills on the fuel grid — the only currently-measured
external USD inflow (lifetime $0.060386, KPI-measured).

**Done**
- Board reads KPI oracle lifetime figure each run (Z-34 verified).

**Running**
- routes.json + route-desk.cjs; grid alive within fuel-pacing constraints.

**Learned**
- External fills are lifetime-cumulative, not a rate (D-012 method fix).

**Next**
- Kill watch: no external fill in 21d → freeze grid spend (IDLE).
- Fuel pacing (4w/8w/16w) = OPERATOR-GATED decision, options on the ladder.

**Tools known:** route-desk.cjs · routes.json · KPI.json
