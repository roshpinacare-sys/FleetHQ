# agent-registry — the fleet's ERC-8004-shaped trust surface (CR-0042)

_2026-10-03T19:24:08.005Z · keyless + offline · every reputation value carries a recomputable sha256 of its evidence rows_

## identity (6)
- **market-exec** — signing executor (SBD/STEEM internal market) · file://agents/market-exec.cjs · owner-gated-signing · registered CR-0036 · alive:true
- **fill-ledger** — fill measurement leg (fill_order virtual ops, µ-unit average-cost P&L) · file://agents/fill-ledger.cjs · keyless · registered CR-0039 · alive:true
- **market-cycle** — cycle composer (eyes → decision → hands) · file://agents/market-cycle.cjs · keyless-composer · registered CR-0039 · alive:true
- **market-grid** — keyless cross-market observer (paper fills, history time-series) · file://agents/market-grid.cjs · keyless · registered CR-0034 · alive:true
- **venture-desk** — venture harvest/kill governance · file://agents/venture-desk.cjs · keyless · registered Z-36 lineage · alive:true
- **principal-headcorner** — fleet principal account (the only signer today) · steem://headcorner · custody-of-operator · registered fleet charter · alive:true

## reputation (3) — evidence-derived only
- **market-exec** clean-run-pct=62 (broadcast-ops-9) · endpoint agents/market-exec.json · hash 6c829dd0f3391b0a… · evidence {"runs":13,"ok":8,"broadcastOps":9}
- **fill-ledger** fills-captured=11 (runs-6) · endpoint agents/fill-ledger.json · hash a89499e3078082f0… · evidence {"runs":6,"total_fills":10,"proceeds_unbased_sbd":0.508}
- **market-cycle** clean-cycle-pct=100 (decisions-2) · endpoint agents/market-cycle.json · hash 941b0197664b05fb… · evidence {"cycles":2,"ok":2}

## validation (4) — the evals are the validation requests
- **market-exec** E28 → VALIDATED (status PASS)
- **fill-ledger** E30 → VALIDATED (status PASS)
- **market-cycle** E30 → VALIDATED (status PASS)
- **market-exec** E31 → INVALID (status FAIL)

## summary: {"agents":6,"withEvidence":3,"validated":3,"totalFills":10}

On-chain registration (ERC-8004 IdentityRegistry.register) is an owner-gated future rung — this mirror is the portable, already-verified form.
