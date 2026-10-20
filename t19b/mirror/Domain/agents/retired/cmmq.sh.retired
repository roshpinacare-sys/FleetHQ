#!/usr/bin/env bash
# cmmq — fleet consumer client for the governed MCP host (Rung 9 / CR-0032).
#
# The fleet's structural layer is GOVERNED at the host (mini-services/mcp-host,
# CR-0031): analysis-profile belt (13 read-only tools), engine child spawned
# with --tool-profile braces + CBM_ALLOWED_ROOT, deny receipts to JSONL.
# Consumers ride the host — never spawn the engine raw — so policy + receipts
# live in ONE place (the host-consumer wiring law).
#
# Usage:
#   cmmq health                    — GET /health (full host payload)
#   cmmq tools                     — GET /tools (profile-visible tool list)
#   cmmq <tool> '<json-args>'      — POST /mcp tools/call, e.g.
#                                    cmmq search_graph '{"project":"home-z-git-audit-Domain","query":"GuardedLocalEnvironment","limit":3}'
#                                    (project name comes from: cmmq list_projects '{}')
#
# Laws carried:
#   - fail-loud: JSON-RPC errors -> stderr + rc=1 (no silent fallbacks)
#   - reads only: the wrapper exposes no write/admin surface; the host belt
#     denies the write/admin quartet anyway (defense in depth, receipted)
#   - amortization: one long-lived engine child serves N calls (~8ms warm),
#     the Rung 7 latency ladder's fastest governed rung
#   - freshness is a discipline: detect_changes through this wrapper; reindex
#     is owner-gated (index_repository is invisible to this profile BY POLICY)
#
# Env: CMMQ_HOST (default http://localhost:3041)
set -uo pipefail

HOST="${CMMQ_HOST:-http://localhost:3041}"

fail() { echo "cmmq: $*" >&2; exit 1; }

case "${1:-}" in
  health)
    exec curl -fsS -m 10 "$HOST/health" || fail "host unreachable at $HOST"
    ;;
  tools)
    exec curl -fsS -m 10 "$HOST/tools" || fail "host unreachable at $HOST"
    ;;
  ""|-h|--help)
    sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    tool="$1"
    args="${2:-{\}}"
    case "$tool" in
      -*) fail "unknown option '$tool' (usage: cmmq health|tools|<tool> '<json-args>')" ;;
    esac
    resp="$(curl -fsS -m 30 -X POST "$HOST/mcp" \
      -H 'content-type: application/json' \
      -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}")" \
      || fail "host unreachable or HTTP error at $HOST"
    # fail-loud classification (python3 is the fleet's json oracle):
    #   rc 0 = result, rc 1 = JSON-RPC error surfaced, rc 2 = unparseable body
    printf '%s' "$resp" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(2)
sys.exit(1 if "error" in d else 0)
'
    rc=$?
    if [ "$rc" -eq 1 ]; then
      printf '%s\n' "$resp" >&2
      fail "JSON-RPC error (policy denials are receipted host-side)"
    elif [ "$rc" -eq 2 ]; then
      printf '%s\n' "$resp" >&2
      fail "unparseable response body"
    fi
    printf '%s\n' "$resp"
    ;;
esac
