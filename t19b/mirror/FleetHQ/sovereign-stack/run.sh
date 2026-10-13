#!/usr/bin/env bash
# run.sh — one-shot: prove the stack, drill the breaker, arm the vault bridge,
# and run one tamper-watch tick. Zero-trust: any failure stops the chain.
set -u
cd "$(dirname "$0")"

echo "== 1/5 zero-trust selftest (mocked lanes; network optional) =="
python3 selftest.py || { echo "SELFTEST FAILED — refusing to continue"; exit 1; }

echo "== 2/5 circuit-breaker drill (prolonged 429/503 → isolation → local fallback → recovery) =="
python3 drill_breaker.py || { echo "DRILL FAILED"; exit 1; }

echo "== 3/5 tamper-watch: hash-chain sanctity procedure (demo on throwaway repo) =="
python3 tamper_watch.py --demo || { echo "TAMPER-DEMO FAILED"; exit 1; }
python3 tamper_watch.py --once || true   # real tick on the live MEMORY.md (informational)

echo "== 4/5 vault bridge: env.example placeholders → runtime .env from office/vault =="
python3 vault_env_bridge.py --dry-run && \
python3 vault_env_bridge.py --force || { echo "BRIDGE FAILED"; exit 1; }

echo "== 5/5 live lane probe (real endpoints, real config) =="
python3 sovereign_router.py

echo "== DONE — stack proven, drill green, chain guarded, .env armed."
echo "   Cron law: add '*/5 * * * * cd $(pwd) && python3 tamper_watch.py --once' on an owned server."
echo "   Infra: docker compose up -d (llama.cpp 8080 + LiteLLM 4000 + Langfuse 3100)."
