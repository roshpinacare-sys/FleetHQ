# TOMBSTONE — liquidity-desk (Z-71 deep-audit F2, CR-0050)
liquidity-desk.cjs was measured DEAD by agents/deep-audit.cjs (F2-dead-agent: zero references across all agents, evals, workflows — the name-mention graph, fixed for false-deads before booking).
Superseded by: treasury-desk.cjs (assets book incl. powerdown pacing) + market-exec.cjs (band/band-capped ladders) + drip-canon.cjs (fuel pacing canon) — the four deterministic machines it described (claims/curation/ladder/pacing) live in those desks and in sovereign-policy.json.
Revival path: `git mv agents/retired/liquidity-desk.cjs.retired agents/liquidity-desk.cjs` + wire into a cadence + white-box — never blind.

---
TOMBSTONE — cmmq governed-client (R31, WO-unwired-cmmq-host, trace 1a1…6fd5)
cmmq.sh was the Rung-9 governed MCP client (CR-0032) for the governed host (mini-services/mcp-host, CR-0031). Measured 2026-10-11 across all 6 estate clones (Domain/FleetHQ/Sandbox/saos-dex/saos-runtime/steem): the host exists in ZERO of them — a client that cannot reach its server is misleading noise in agents/. JSONL destination question answered honestly: the host never ran anywhere, so the host-side deny-receipt JSONL stream NEVER EXISTED — there was no fork and nothing to relocate; the client itself is read-only (health/tools/tools-call only).
Revival path: build CR-0031's governed host (analysis-profile belt, /health + /tools + POST /mcp tools/call on :3041, deny receipts to JSONL), then `git mv agents/retired/cmmq.sh.retired agents/cmmq/cmmq.sh && chmod +x` — never blind.
