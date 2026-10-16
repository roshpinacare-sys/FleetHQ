#!/usr/bin/env bash
# flush.sh — DRAIN THE ESTATE (auto-flush every unpushed commit the moment a
# valid credential exists). Deployed as a local-beats beat every 15min.
#
# WHY (wipe #3, 2026-10-12): every GitHub credential died with the box while
# local voices kept committing — FleetHQ piled 36+ unpushed commits. Unpushed
# work is EPHEMERAL (a wipe destroys it); the pile is also a lagging mirror
# for the public site. The cure must be AUTONOMOUS: no operator, no
# engineering — one valid PAT anywhere in the estate and everything travels.
#
# Credential hunt order (never printed, fingerprints only):
#   1. $GIT_PAT / $GITHUB_PAT (env, incl. estate .env.local)
#   2. /home/z/.secrets/keys/Tt.txt (last-known token; may be revoked)
# Validation: GET api.github.com/user → HTTP 200. Anything else = invalid.
#
# Until a valid credential exists this script publishes an honest receipt
# (receipts/push-queue.json) of WHAT IS STUCK — the gap is measured, never
# hidden. Push discipline mirrors the estate law: pull --rebase -X theirs
# with autostash before every push (twins push constantly; upstream wins).
set -u

ESTATE="${AGENT_HQ_FLEET_DIR:-/home/z/estate}"
FLEET="$ESTATE/FleetHQ"
QUEUE="$FLEET/receipts/push-queue.json"
OWNER_REPO="roshpinacare-sys"
# 27-b (2026-10-13): Sandbox joined the drain — the four office arteries
# (wallet/grid/fleet/sovereign-tick in Domain/office/data.json) are fed by
# Sandbox receipts; local sbx-* beats commit them in the Sandbox clone and
# THIS drain is what carries them to origin (the private repo's Actions are
# minutes-dead). A private repo is drained by the same PAT law as the rest.
REPOS=(Console Domain FleetHQ Sandbox)
AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------- credential hunt ----------
PAT="${GIT_PAT:-${GITHUB_PAT:-}}"
if [ -z "$PAT" ] && [ -f "$ESTATE/.env.local" ]; then
  PAT="$(sed -n 's/^GIT_PAT=//p;s/^GITHUB_PAT=//p' "$ESTATE/.env.local" | head -1 | tr -d '"'"'"'"' || true)"
  PAT="$(echo "$PAT" | tr -d '"')" # belt & suspenders
fi
if [ -z "$PAT" ] && [ -s /home/z/.secrets/keys/Tt.txt ]; then
  PAT="$(head -1 /home/z/.secrets/keys/Tt.txt | tr -d '[:space:]')"
fi

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 \
  -H "Authorization: token $PAT" https://api.github.com/user 2>/dev/null || echo 000)"

# ---------- helpers ----------
divergence() { # repo -> "ahead behind"
  local d="$ESTATE/$1"
  git -C "$d" fetch -q origin 2>/dev/null || true
  git -C "$d" rev-list --left-right --count main...origin/main 2>/dev/null || echo "0 0"
}

emit_queue() { # $1 = credential verdict, $2 = push results json ("" when none)
  local cred="$1" results="$2"
  local rows="["; local first=1
  for r in "${REPOS[@]}"; do
    read -r A B <<<"$(divergence "$r")"
    [ "$first" = 0 ] && rows+=","
    rows+="{\"name\":\"$OWNER_REPO/$r\",\"ahead\":${A:-0},\"behind\":${B:-0}}"
    first=0
  done
  rows+="]"
  if [ -n "$results" ]; then
    printf '{\n "schema": "push.queue/1", "at": "%s", "credential": "%s", "repos": %s, "pushed": %s\n}\n' \
      "$AT" "$cred" "$rows" "$results" > "$QUEUE"
  else
    printf '{\n "schema": "push.queue/1", "at": "%s", "credential": "%s", "repos": %s, "pushed": null\n}\n' \
      "$AT" "$cred" "$rows" > "$QUEUE"
  fi
}

# ---------- no valid credential: measure the gap honestly ----------
if [ "$code" != "200" ]; then
  emit_queue "none-valid(http:$code)" ""
  echo "flush: NO-VALID-CREDENTIAL (http:$code) — queue receipt written, gap measured"
  exit 0
fi

# ---------- valid credential: drain ----------
export GIT_PAT="$PAT"
export GIT_ASKPASS="${GIT_ASKPASS:-/home/z/.gitcred/askpass.sh}"
export GIT_TERMINAL_PROMPT=0

results="["; first=1; any_push=0
for r in "${REPOS[@]}"; do
  d="$ESTATE/$r"
  read -r A B <<<"$(divergence "$r")"
  verdict="in-sync"
  if [ "${A:-0}" -gt 0 ] || [ "${B:-0}" -gt 0 ]; then
    if git -C "$d" -c rebase.autoStash=true pull --rebase -X theirs -q origin main 2>/dev/null &&
       git -C "$d" push -q origin main 2>/dev/null; then
      verdict="pushed"; any_push=1
    else
      verdict="push-failed"
    fi
  fi
  read -r A2 B2 <<<"$(divergence "$r")"
  [ "$first" = 0 ] && results+=","
  results+="{\"name\":\"$OWNER_REPO/$r\",\"verdict\":\"$verdict\",\"aheadBefore\":${A:-0},\"behindBefore\":${B:-0},\"aheadAfter\":${A2:-0}}"
  first=0
done
results+="]"
emit_queue "valid" "$results"
echo "flush: DRAINED (any_push=$any_push) — $results"
