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
