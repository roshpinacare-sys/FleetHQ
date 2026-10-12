# V1 · Curation house — NOTEBOOK (Z-34 cycle, 2026-10-02)

**Goal:** deterministic public-external curation earn across steem/hive/blurt
(10 soldiers CI lane + headcorner head lanes); first measured accrual → per-day line.

**Done**
- Z-34 audit: soldiers lane verified ALIVE by DRYRUN probe — 78 candidates across
  8/10 soldiers (music + health lanes honestly empty at that hour); the zero tally
  of 11:38-11:55Z was transient, NOT starvation → kill-rule NOT triggered.
- Head lanes chain-truthed (Z-33): steem 4 verified votes × 5 runs; blurt first
  fleet blurt votes in history; hive debut (horz, cruciform @14:50Z).
- VP canon hardened: manabar-first in treasury-desk + liquidity-desk (Z-33) and
  now blurt-curate.cjs (Z-34 — the lane that was missed).
- Gates live-probed: 13-29 candidates pass per lane (photography/life/food).

**Running**
- soldiers CI lane (MAXVOTES=2/run, verify-then-sign, 7d fleet dedupe + 48h
  chain-truth recon); head lanes via weave daemon.

**Learned**
- Pending curation matures 7d; blurt is dust-of-dust in USD; full-activation
  ceiling ≈ $0.016-0.033/day at current stake (Z-33 measured).
- Blurt legacy voting_power field is lazily stale — manabar is canon (scale verified).

**Next**
- Book first REAL accrual when the 7d window matures (≈2026-10-09); set the
  per-day earn line from the book (honest TBD until then).
- Watch lane kill-rules: 3 consecutive zero-accrual cycles → weight→0.

**Tools known:** soldiers-curate.cjs · treasury-desk.cjs (head lanes) ·
blurt-curate.cjs · liquidity-desk.cjs (census) · curation-book.json ·
money-ledger.json · ventures.json
