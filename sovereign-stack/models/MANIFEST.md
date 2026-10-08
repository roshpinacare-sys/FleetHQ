# 🧠 Model Manifest — staged for the local llama.cpp lane

Decision recorded (operator question #1, answered autonomously 2026-10-08):
**coder-first staging** — the fleet's daily work is code/ops/serialization, so
Qwen2.5-Coder leads; size scales with the host, not with wishful thinking.

| Tier | Model | File (GGUF) | Size | Needs | Role |
|---|---|---|---|---|---|
| 0 — default | Qwen2.5-Coder-7B-Instruct | `qwen2.5-coder-7b-instruct-q4_k_m*.gguf` | ~4.7 GB | 8 GB RAM, CPU-ok | daily lane, sandbox-class hosts; `LOCAL_MODEL_FILE` default in docker-compose |
| 1 — heavy | Qwen2.5-Coder-32B-Instruct | `qwen2.5-coder-32b-instruct-q4_k_m*.gguf` | ~20 GB | ~24 GB RAM/VRAM | architectural reasoning, serialization debugging, the `BACKUP_MODEL_NAME` of the operator's original manifest |
| 2 — flag | Llama-3.3-70B-Instruct | `*-70b-instruct-q4_k_m*.gguf` | ~40-43 GB | ~48 GB RAM or 2×24 GB VRAM | optional long-form reasoning (gated upstream — license acceptance required) |

Sources (official / trusted GGUF publishers):
- Qwen (official, Apache-2.0): huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF · …-32B-Instruct-GGUF
- Llama-3.3 (gated): huggingface.co/meta-llama (accept license) — GGUF mirrors only from established quant publishers (e.g. bartowski)

## Placement

```bash
mkdir -p sovereign-stack/models
# Tier 0 (default): drop the 7B q4_k_m file into sovereign-stack/models/
docker compose up -d llamacpp     # serves localhost:8080/v1 (OpenAI-compatible)
```

Tier switch = one env var in `.env`: `LOCAL_MODEL_FILE=<file>.gguf`
(+ `LOCAL_GPU_LAYERS` when a GPU exists; 0 = pure CPU, verified default).

## Lane law (from MANIFEST.md §2, unchanged)

`localhost:8080` (llama.cpp, Tier 0) → `localhost:4000` (LiteLLM gateway) →
free public lanes (api.llm7.io, `unused`) — best-effort only, quota-congested
evenings measured live. The local tier is the sovereignty baseline; remote
lanes are opportunistic amplifiers, never the floor.
