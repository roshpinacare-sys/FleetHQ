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
  log "no GITHUB_PAT env — pushing via the global credential helper (saos-git-cred.sh) if configured"
fi

if [ -n "$PAT" ]; then
  ASKPASS="$(mktemp)"
  trap 'rm -f "$ASKPASS"' EXIT
  printf '#!/bin/sh\ncat <<__PAT__\n%s\n__PAT__\n' "$PAT" > "$ASKPASS"
  chmod 700 "$ASKPASS"
  export GIT_ASKPASS="$ASKPASS"
fi

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
    # HONESTY GUARD (union law): a stash-pop conflict is not a resolution.
    # The living local writer holds the freshest memory — resolve conflicts to
    # its copy (--theirs during stash-apply), keep the stash as backup, and
    # NEVER commit markers. Fail-loud, fail-clean.
    local conflicts
    conflicts=$(git diff --name-only --diff-filter=U 2>/dev/null)
    if [ -n "$conflicts" ]; then
      log "stash-pop conflicts on: $(printf '%s ' $conflicts) — resolving to the living local copy (stash kept as backup)"
      for f in $conflicts; do
        git checkout --theirs -- "$f" 2>/dev/null || git checkout HEAD -- "$f" 2>/dev/null || true
      done
    fi
    # final gate: marker scan on the book dirs — markers = abort (no garbage push)
    if grep -rIl '^<<<<<<< ' agents books reports truth 2>/dev/null | head -1 | grep -q .; then
      log "conflict markers detected in books — aborting commit (fail-loud)"
      return 1
    fi
  fi
  # what the office wrote since the last commit
  local changed
  changed=$(git status --porcelain -- agents/ books/ reports/ truth/ 2>/dev/null | head -50)
  if [ -z "$changed" ]; then
    log "nothing to commit"
    return 0
  fi
  # ── VAULT LAW (2026-10-16, restore of commit 75520896): a books-sync commit
  # carries ONLY the four book dirs. Foreign work parked in the index (other
  # robots' staged deletions/adds) is evicted BEFORE staging — commit 75520896
  # wiped 94 Domain workflows by riding exactly such parked deletions into a
  # memory commit. Evicted paths stay in the working tree; their owner must
  # commit them through its own discipline. ──
  local parked
  parked=$(git diff --cached --name-only 2>/dev/null | grep -vE '^(agents|books|reports|truth)/' | head -8)
  if [ -n "$parked" ]; then
    log "VAULT LAW: evicting foreign staged paths (never ride a memory commit): $(printf '%s ' $parked)"
  fi
  git reset -q HEAD -- . 2>/dev/null || true
  # add only the book dirs that actually exist (a missing pathspec aborts git add)
  local addpaths=""
  for d in agents books reports truth; do
    [ -d "$d" ] && addpaths="$addpaths $d"
  done
  if [ -n "$addpaths" ]; then
    git add $addpaths 2>/dev/null || true
  fi
  # ── VAULT LAW v2 (t77-4c, measured disaster 9b24b2572): a books-sync commit
  # NEVER carries deletions. A sparse/partial clone worktree turns missing
  # files into staged deletes — 9b24b2572 erased 482 files (141K lines) of
  # agents/ + truth/ exactly this way, killing office-artery.mjs and
  # triggering the every-10-min failure email storm. Deletions belong to
  # their own explicit discipline — never to a memory commit. ──
  local dels
  dels=$(git diff --cached --name-only --diff-filter=D 2>/dev/null | head -50)
  if [ -n "$dels" ]; then
    log "VAULT LAW v2: blocking staged deletions (never ride a memory commit): $(printf '%s ' $dels | head -c 300)"
    for f in $dels; do git reset -q HEAD -- "$f" 2>/dev/null || true; done
  fi
  # second gate: the staged set must be book-pure — anything else aborts loud
  local foreign
  foreign=$(git diff --cached --name-only 2>/dev/null | grep -vE '^(agents|books|reports|truth)/' | head -5)
  if [ -n "$foreign" ]; then
    log "VAULT LAW VIOLATION: foreign paths staged after reset — aborting commit: $(printf '%s ' $foreign)"
    git reset -q HEAD -- . 2>/dev/null || true
    return 1
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
