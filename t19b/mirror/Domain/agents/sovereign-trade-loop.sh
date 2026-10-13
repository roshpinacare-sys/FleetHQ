#!/usr/bin/env bash
# sovereign-trade-loop.sh — R33 THE SOVEREIGN HEARTBEAT (CR-0063).
#
# The local cadence driver of the sovereignty's trading hands. ONE pass every
# SOVEREIGN_HEARTBEAT_SEC (default 900s): sovereign-trade.cjs → market-cycle
# (fill-ledger → decideCycle → market-exec) → pnl-book verdict.
#
# LAWS:
#  - LOCAL ONLY: this loop arms where the derived-keys vault lives (sandbox
#    floor). CI never runs it — a CI pass books VAULT-ABSENT-LOCAL honestly.
#  - SOVEREIGN_TRADE_LIVE=1 must be exported for LIVE arms; without it every
#    pass is a DRY planning receipt (mode law of CR-0063).
#  - flock: the heartbeat is idempotent; overlapping passes would double-arm.
#  - Fail-soft: a failing pass is a booked row in the desk's canon, never a
#    crash of the loop.
set -u
cd "$(dirname "$0")/.."
: "${SOVEREIGN_HEARTBEAT_SEC:=600}"
: "${SOVEREIGN_TRADE_LOG:=/tmp/sovereign-trade.log}"
mkdir -p "$(dirname "$SOVEREIGN_TRADE_LOG")"
echo "[sovereign-heartbeat] armed at $(date -u +%FT%TZ) heartbeat=${SOVEREIGN_HEARTBEAT_SEC}s live=${SOVEREIGN_TRADE_LIVE:-0}" >> "$SOVEREIGN_TRADE_LOG"
while :; do
  flock -n /tmp/sovereign-trade.lock node agents/sovereign-trade.cjs >> "$SOVEREIGN_TRADE_LOG" 2>&1 || true
  sleep "$SOVEREIGN_HEARTBEAT_SEC"
done
