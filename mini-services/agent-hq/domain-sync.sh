#!/usr/bin/env bash
# ============================================================================
# FLEET HQ · domain-sync — the memory commit pipeline (infrastructure, not agents)
# ----------------------------------------------------------------------------
# The foreman writes the office memory (and any locally-updated books) into the
# Domain clone, but only THIS pipeline commits and pushes them. The agents and
# the model NEVER touch credentials — this script is the operator's hand, not
# a brain.
#
# Credentials: reads GITHUB_PAT from mini-services/agent-hq/.env (gitignored,
# chmod 600) or a GITHUB_PAT env. The PAT is passed to git via a temp askpass
# and never echoed, never logged.
#
#   ./domain-sync.sh once     # single sync (used by the loop and by setup)
#   ./domain-sync.sh loop     # sync every DOMAIN_SYNC_INTERVAL secs (default 600)
#
# Fail-soft: any failure is logged and retried on the next tick. The office
# keeps working even when the network is gone — memory persists locally and
# reaches git as soon as the wire is back.
# ============================================================================
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HQ_DIR="$(dirname "$DIR")"                       # FleetHQ root (repo checkout)
ENV_FILE=""
for c in "$HQ_DIR/mini-services/agent-hq/.env" "$DIR/.env" "$HQ_DIR/foreman/.env"; do
  [ -f "$c" ] && ENV_FILE="$c" && break
done

INTERVAL="${DOMAIN_SYNC_INTERVAL:-600}"
DATA_DIR="${AGENT_HQ_DATA_DIR:-/home/z/my-project/Domain}"

log() { echo "[domain-sync $(date -u +%FT%TZ)] $*"; }

# ---- resolve the PAT (never printed) ---------------------------------------
PAT="${GITHUB_PAT:-}"
if [ -z "$PAT" ] && [ -n "$ENV_FILE" ]; then
  PAT="$(sed -n 's/^GITHUB_PAT=//p' "$ENV_FILE" | head -1 | tr -d '\r"')"
fi
if [ -z "$PAT" ]; then
  log "no GITHUB_PAT found — memory stays local-only (books still work)"
  exit 0
fi

ASKPASS="$(mktemp)"
trap 'rm -f "$ASKPASS"' EXIT
printf '#!/bin/sh\ncat <<__PAT__\n%s\n__PAT__\n' "$PAT" > "$ASKPASS"
chmod 700 "$ASKPASS"
export GIT_ASKPASS="$ASKPASS"

sync_once() {
  cd "$DATA_DIR" || { log "no data dir $DATA_DIR"; return 1; }
  # INDEPENDENCE PREFLIGHT (Task 46): the data dir must be its OWN repository.
  # A plain directory inside another work tree (rev-parse walks up!) can never
  # be committed here — saying "fetch failed (offline?)" would be a lie.
  local top
  top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -z "$top" ] || [ "$top" != "$(pwd -P)" ]; then
    log "not an independent repository — memory stays local-only (restore the Domain clone to resume git sync)"
    return 1
  fi
  # keep the clone fresh; rebase our local commits on top if the wire moved
  git fetch origin main >/dev/null 2>&1 || { log "fetch failed (offline?)"; return 1; }
  local behind
  behind=$(git rev-list --count main..origin/main 2>/dev/null || echo 0)
  if [ "$behind" -gt 0 ]; then
    git stash -u >/dev/null 2>&1 || true
    git pull --rebase origin main >/dev/null 2>&1 || { log "pull --rebase failed"; return 1; }
    git stash pop >/dev/null 2>&1 || true
  fi
  # what the office wrote since the last commit
  local changed
  changed=$(git status --porcelain -- agents/ books/ reports/ truth/ 2>/dev/null | head -50)
  if [ -z "$changed" ]; then
    log "nothing to commit"
    return 0
  fi
  # add only the book dirs that actually exist (a missing pathspec aborts git add)
  local addpaths=""
  for d in agents books reports truth; do
    [ -d "$d" ] && addpaths="$addpaths $d"
  done
  if [ -n "$addpaths" ]; then
    git add $addpaths 2>/dev/null || true
  fi
  if git diff --cached --quiet; then
    log "nothing staged"
    return 0
  fi
  git commit -m "office-memory: foreman books sync $(date -u +%FT%TZ) [skip ci]" >/dev/null 2>&1 || return 0
  if git push origin main >/dev/null 2>&1; then
    log "pushed: $(git rev-parse --short HEAD)"
  else
    log "push FAILED — will retry next tick"
    return 1
  fi
}

case "${1:-once}" in
  once)
    sync_once
    ;;
  loop)
    log "loop started (every ${INTERVAL}s, data: $DATA_DIR)"
    while true; do
      sync_once || true
      sleep "$INTERVAL"
    done
    ;;
  *)
    echo "usage: $0 once|loop" >&2
    exit 1
    ;;
esac
