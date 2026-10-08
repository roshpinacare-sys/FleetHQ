#!/usr/bin/env bash
# run.sh — one-shot: prove the stack, then report lane status.
set -u
cd "$(dirname "$0")"

echo "== 1/2 zero-trust selftest (mocked lanes; network optional) =="
python3 selftest.py || { echo "SELFTEST FAILED — refusing to continue"; exit 1; }

echo "== 2/2 live lane probe (real endpoints, real config) =="
python3 sovereign_router.py

echo "== DONE — stack proven. Bring infra with: docker compose up -d =="
