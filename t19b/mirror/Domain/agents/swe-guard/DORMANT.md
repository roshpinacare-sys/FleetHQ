# DORMANT — swe-guard (CR-0019 GuardedLocalEnvironment), R31 measurement

**Status: dormant local-lane asset — alive in-tree, zero deletion. Measured 2026-10-11 (WO-unwired-swe-guard, trace 1a1…6fd5).**

## The chain (verified, in-tree, single-room law kept)

```
reef-harness-evo.cjs (evo lane, WO-unwired-evo-windows resolved 2026-10-11)
  → spawns reef serve + episodes via VENVPY (/tmp/reef-venv/bin/python)
reef-rung3.cjs / reef/rung3_guarded_episode.py
  → imports agents/swe-guard/guard_env.py (rung3_guarded_episode.py:86,
    GUARD-IN-PATH law — every model-authored bash executes ONLY through
    GuardedLocalEnvironment, CR-0019)
```

## Why dormant (measured, not claimed)

- The harness self-declares the lane: `SKIPPED-NO-VENV — evolution is a
  local-lane measured run (CI off-budget by design)` (reef-harness-evo.cjs:103).
- `/tmp/reef-venv/bin/python` is absent in every estate clone measured
  (Domain, FleetHQ, Sandbox, saos-dex, saos-runtime, steem — ls 2026-10-11).
- The Sandbox-side weekly evo gate (Tue 06:37 UTC, WO-unwired-evo-windows
  resolution) is a white-box SKIP_RUN engine-alive pin — it gates honestly but
  does not execute guarded episodes (one-room law: no forked books).

## Revival path (never blind)

Provision the venv (`REEF_VENVPY` env or /tmp/reef-venv with the reef module),
then run one `reef-rung3.cjs` episode — the guard executes in-path with deny
receipts. If the lane is retired instead, move this directory to
`agents/retired/` with a TOMBSTONE row (convention: agents/retired/TOMBSTONE.md).
