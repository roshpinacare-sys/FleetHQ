# 🛡️ Sovereign Stack

Self-hosted, key-independent inference + resilience + memory + tools for the
sovereign agent fleet. Every component below was **verified live** before
entering this stack (see MANIFEST.md for the full zero-trust audit of the
original proposal this replaces).

## What's here

| File | Role | Proof |
|---|---|---|
| `MANIFEST.md` | Architecture manifest + audit verdicts of the pasted proposal | 13 claims checked live |
| `system-prompt.md` | Sovereign Executor system prompt (compliance-hardened) | inject-ready |
| `sovereign_router.py` | Rotation + backoff + Retry-After + circuit breaker | selftest T1/T2 |
| `compaction.py` | Deterministic lossy context compaction (LLMLingua-spirit) | selftest T3 |
| `fork_consensus.py` | Parallel forks + Jaccard consensus voting | selftest T4 |
| `memory_store.py` | Hash-chained MEMORY.md, tamper-evident | selftest T5 |
| `mcp_min.py` | Minimal MCP stdio client (stdlib) | selftest T6 |
| `selftest.py` | The whole proof, on this machine | exit 0 required |
| `content_rail.py` | Deterministic content-rail compiler (secret-scan → stage → anchor) | selftest T8 |
| `health_monitor.py` | 90000ms-law probe loop → status.json/history.jsonl + immutable alert receipts | selftest T9 |
| `tps_bench.py` | Honest Tier-0 TPS probe → deterministic compaction budget | exit 4 = UNREACHABLE (honest) |
| `drill_breaker.py` | Circuit-breaker recovery drill (Task 29) | 8/8 PASS |
| `tamper_watch.py` | Hash-chain watchdog: lock → quarantine → origin rebuild (Task 29) | scope-contract v2 |
| `vault_env_bridge.py` | Vault → .env (0600) with fingerprint-only receipts (Task 29) | fail-closed proven ×3 |
| `docker-compose.yml` + `litellm_config.yml` | llama.cpp + LiteLLM + Langfuse + Postgres | verified images |
| `env.example` | Fallback config shape (real values from office vault) | — |

## Verified live lanes (2026-10-08)

- `https://api.llm7.io/v1` with `Bearer unused` → 65 models listed; `GLM-5.3-Flash`
  answered live. Quota lanes return `Retry-After` — the router honors it.
- Local lanes: `localhost:4000` (LiteLLM), `localhost:8080` (llama.cpp).
- **NOT** `localhost:3000` — that is the Next.js control console in the sandbox.

## 60-second bring-up (your own server)

```bash
cp env.example .env            # fill the four LF_* secrets + LITELLM_MASTER_KEY
python3 selftest.py            # proof: router+compaction+consensus+memory+MCP
docker compose up -d           # lifts llama.cpp, LiteLLM, Langfuse, Postgres
bash run.sh                    # selftest + live lane probe
```

Drop a GGUF into `./models/` (e.g. Qwen2.5-Coder-7B-Instruct Q4_K_M ≈ 4.7 GB;
Qwen2.5-Coder-32B Q4_K_M ≈ 20 GB for heavy reasoning, needs ~24 GB RAM/VRAM).

## Task 30 — fusion layer (content rail + health + bench)

Zero-dependency production layer added on the recovered base (the sandbox was
reset again; the whole stack came back from the FleetHQ clone — `b3b9992`
verified present before any work). Layout — replicated per fleet repo:

```
sovereign-stack/
├── content/
│   ├── sources/                 # verified input data arrays (JSON)
│   ├── rails/<rail>/<date>/<slug>.md (+ .tokens.md + .sha256)
│   └── MANIFEST.md              # hash-chained index of every staged deliverable
├── health/
│   ├── targets.json             # probe config (written on first run)
│   ├── status.json              # latest snapshot (the Next.js console reads this)
│   ├── history.jsonl            # append-only, ts-ordered
│   └── tps.json                 # Tier-0 TPS / honest UNREACHABLE state
└── receipts/                    # append-only immutable alerts + RECEIPTS.chain
```

```bash
python3 content_rail.py compile --source content/sources/<file>.json
python3 content_rail.py verify
python3 health_monitor.py --once          # or --loop 300 (5-minute sentinel)
python3 tps_bench.py --endpoint http://localhost:8080
python3 selftest.py                       # T1–T9, must stay green
```

Laws enforced in this layer:

1. **Determinism**: same source JSON → byte-identical deliverable (manifest
   anchoring is idempotent — the same sha is never chained twice).
2. **Secrets never stage**: the pre-stage scan (incl. fleet-history WIF shapes)
   refuses with an immutable `REJECTED-*.json` receipt; findings are masked.
3. **Lineage = sha256 + hash chain, NOT GPG**: no GPG keys exist in the fleet;
   minting one to imitate "a verified r5 credential" would be a lie
   (same honest correction as FleetHQ `e1f33fe`).
4. **Anomalies are measured, never guessed**: probe timeout default 90000 ms;
   every anomaly becomes an append-only `ALERT-*.json` chained in
   `RECEIPTS.chain` (rewriting history breaks the chain by construction).
5. **Honest UNREACHABLE**: if the local inference host is down, `tps_bench`
   exits 4 and records `state=UNREACHABLE` — no number is invented.

## Why the evasion tricks from the original proposal are NOT here

TLS/browser impersonation, captcha crossing and geo-block circumvention turn a
routing problem into a permanent ban of the whole fleet. Ownership — your own
models on your own metal — achieves the same sovereignty with zero dependence
and zero bans. Blocked lane = dead lane; we route around by **owning**, not by
**disguising**. (MANIFEST.md §1 rows 8–10.)

## Legality note (GitHub ToS/AUP — checked)

Storing your own encrypted secrets in private repos is permitted; plaintext
secrets in public repos are not (push-protection blocks known token formats).
This stack ships zero secrets. Fleet practice already complies (audits 26/27).

## Integration with the fleet

- Routes/keys resolve: `SOVEREIGN_ROUTES_JSON` → office vault env
  (`SOVEREIGN_OFFICE_ENV`, default `../office/keys.env`) → defaults.
  The autonomy owns its keys (Task 27 law).
- `memory_store.py` is the `MEMORY.md` law of the system prompt: append findings
  at the end of every task loop; the chain detects any tampering.
- Telemetry goes to self-hosted Langfuse (`localhost:3100`), no cloud.
