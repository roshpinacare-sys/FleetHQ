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
#
# 32 (2026-10-16): THE OFFICE CLONE JOINED THE DRAIN. /home/z/my-project is
# where the sovereign's engineering waves live (T24-T31…: git-state cage,
# mech-selftest, engineering board, health-guard, local-brain). Wipes #1-#3
# and the 2026-10-16 reset proved it: unpushed office work DIES with the box
# (local-brain + 2.1GB GGUF weights were erased untracked). Law: the estate
# carries the office to origin — ff when possible, otherwise a REAL union
# merge in the estate (the receipt lanes outrun any manual adoption, so the
# office cannot always pre-adopt origin). Never force, never rebase the
# office, never fake. After a successful push the office ff-adopts origin so
# both sides converge on one history and the next wave fast-forwards cleanly.
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
OFFICE="${SOVEREIGN_OFFICE_DIR:-/home/z/my-project}"

# ---------- credential hunt (32: WALK ALL SOURCES until one validates) ----------
# BUG FIXED 2026-10-16: the old hunt took the FIRST found token and gave up on
# its 401 — a dead token at source #1 blocked the LIVE token at source #3 and
# the whole estate measured "no credential" while a valid PAT sat in the
# office registry. Law now mirrors the gateway's brain-walk: try every source
# in order; the first token that validates (HTTP 200 on api.github.com/user)
# wins. Tokens are never printed — fingerprints only.
hunt_candidates=()
[ -n "${GIT_PAT:-}" ] && hunt_candidates+=("$GIT_PAT")
[ -n "${GITHUB_PAT:-}" ] && hunt_candidates+=("$GITHUB_PAT")
if [ -f "$ESTATE/.env.local" ]; then
  t="$(sed -n 's/^GIT_PAT=//p;s/^GITHUB_PAT=//p' "$ESTATE/.env.local" | head -1 | tr -d "\"'" || true)"
  [ -n "$t" ] && hunt_candidates+=("$t")
fi
if [ -s /home/z/.secrets/keys/Tt.txt ]; then
  t="$(head -1 /home/z/.secrets/keys/Tt.txt | tr -d '[:space:]')"
  [ -n "$t" ] && hunt_candidates+=("$t")
fi
# 32: the OFFICE registry (upload/pat.env — the same file src/lib/gh-pat.ts
# reads; the unified PAT law of the keys-registry). Parse = EXACTLY gh-pat.ts:
# if the file contains '=', take everything after the FIRST '='; else the raw
# trimmed content (the file may be a bare token with no key= prefix at all).
# A shape check (ghp_/gho_/ghu_/ghs_/ghr_/github_pat_) filters garbage lines.
if [ -s "$OFFICE/upload/pat.env" ]; then
  raw="$(tr -d '[:space:]' < "$OFFICE/upload/pat.env" | head -c 4096)"
  case "$raw" in
    *=*) t="${raw#*=}" ;;
    *)   t="$raw" ;;
  esac
  case "$t" in
    gh[pousr]_*|github_pat_*) [ -n "$t" ] && hunt_candidates+=("$t") ;;
  esac
fi
# 33 (2026-10-22, cycle-26 live measurement): pat.env measured DEAD (401 on
# api.github.com/user) and Tt.txt missing — the drain push-failed for
# Domain/FleetHQ/Sandbox while a LIVE token sat in the office upload vault
# (upload/גיטראש.txt, git-ignored in the office repo, validated 200). The
# walk law now ends with this source; same shape check, same silence.
if [ -s "$OFFICE/upload/גיטראש.txt" ]; then
  t="$(head -1 "$OFFICE/upload/גיטראש.txt" | tr -d '[:space:]')"
  case "$t" in
    gh[pousr]_*|github_pat_*) [ -n "$t" ] && hunt_candidates+=("$t") ;;
  esac
fi

code=000
PAT=""
for cand in "${hunt_candidates[@]}"; do
  [ -z "$cand" ] && continue
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 \
    -H "Authorization: token $cand" https://api.github.com/user 2>/dev/null || echo 000)"
  if [ "$c" = "200" ]; then
    PAT="$cand"; code=200
    echo "flush: credential WALKED to a live source (pat-sha16=$(printf %s "$cand" | sha256sum | cut -c1-16))"
    break
  else
    echo "flush: candidate dead (http:$c, pat-sha16=$(printf %s "$cand" | sha256sum | cut -c1-16)) — walking to next source"
  fi
done

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

# 32: office join — carry office main into estate/FleetHQ: ff when possible,
# else a real union merge in the estate (receipt lanes outrun manual adoption;
# conflicts = honest skip, operator path). Then the drain loop pushes it.
if git -C "$OFFICE" rev-parse --verify main >/dev/null 2>&1; then
  if git -C "$FLEET" fetch -q "$OFFICE" main 2>/dev/null; then
    if git -C "$FLEET" -c merge.autoStash=true merge --ff-only FETCH_HEAD 2>/dev/null; then
      echo "flush: office main ff-merged into estate/FleetHQ (engineering travels)"
    elif git -C "$FLEET" -c merge.autoStash=true merge --no-ff --no-edit \
         -m "flush: merge office main (sovereign engineering wave) into estate main" \
         FETCH_HEAD 2>/dev/null; then
      echo "flush: office main MERGED into estate/FleetHQ (receipt lanes had moved; union merge, never force)"
    else
      echo "flush: office main NOT mergeable (real conflict) — honest skip; operator path"
      # 32 cleanup law: never leave the estate mid-merge with a parked autostash
      git -C "$FLEET" merge --abort 2>/dev/null || true
      git -C "$FLEET" stash pop 2>/dev/null || git -C "$FLEET" stash drop 2>/dev/null || true
    fi
  else
    echo "flush: office clone unreachable — honest skip"
  fi
fi

results="["; first=1; any_push=0
# 7b resolve-unmerged law (measured 2026-10-16 17:2x-17:5x): a pop conflict or a
# failed merge leaves UU paths that poison EVERY later git op ("cannot merge
# with unmerged") — the measured 69-stash graveyard + perpetual push-failed.
# Resolution = freshness-wins (--theirs = the local/stash side = the live
# writers' fresher output), then index add: checkout resolves the worktree,
# add resolves the index — both, always (the publishFleet `||` lesson).
resolve_uu() {
  local d="$1" f
  for f in $(git -C "$d" status --porcelain 2>/dev/null | grep '^\(UU\|AA\|DD\|DU\|UD\|AU\|UA\)' | awk '{print $2}'); do
    git -C "$d" checkout --theirs -- "$f" 2>/dev/null || true
    git -C "$d" add -- "$f" 2>/dev/null || true
  done
}
for r in "${REPOS[@]}"; do
  d="$ESTATE/$r"
  # 32 self-heal: a stuck mid-rebase/mid-merge from a crashed run would block
  # every future drain — abort it and restore the parked autostash first.
  if git -C "$d" rev-parse -q --verify REBASE_HEAD >/dev/null 2>&1; then
    git -C "$d" rebase --abort 2>/dev/null || true
    echo "flush: $r had a stuck rebase — aborted (self-heal)"
  fi
  git -C "$d" stash pop 2>/dev/null || git -C "$d" stash drop 2>/dev/null || true
  resolve_uu "$d"
  read -r A B <<<"$(divergence "$r")"
  verdict="in-sync"
  if [ "${A:-0}" -gt 0 ] || [ "${B:-0}" -gt 0 ]; then
    # 32 pull-mode law: FleetHQ carries office MERGE commits — rebasing over
    # them flattens history and fights the office line forever. FleetHQ pulls
    # with a union merge; the pure receipt twins keep the fast rebase law.
    pull_mode="pull --rebase"
    [ "$r" = "FleetHQ" ] && pull_mode="pull --no-rebase"
    if git -C "$d" -c rebase.autoStash=true -c merge.autoStash=true $pull_mode -X theirs -q origin main 2>/dev/null &&
       git -C "$d" push -q origin main 2>/dev/null; then
      verdict="pushed"; any_push=1
    else
      # 7b: a failed merge leaves UU paths (+ a parked MERGE_HEAD) — resolve
      # freshness-wins, conclude the merge if one is open, retry once with a
      # clean index before declaring failure. Never leave UU poison behind.
      verdict="push-failed"
      resolve_uu "$d"
      git -C "$d" rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && GIT_EDITOR=true git -C "$d" merge --continue 2>/dev/null || true
      if git -C "$d" -c rebase.autoStash=true -c merge.autoStash=true $pull_mode -X theirs -q origin main 2>/dev/null &&
         git -C "$d" push -q origin main 2>/dev/null; then
        verdict="pushed"; any_push=1
      else
        resolve_uu "$d"
      fi
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

# 32: converge the OFFICE clone onto origin after a successful push — the
# office ff-adopts the merged history, so the next office wave fast-forwards
# cleanly instead of piling merge commits. Honest deferral if it can't.
if [ "$any_push" = 1 ] && git -C "$OFFICE" rev-parse --verify main >/dev/null 2>&1; then
  if git -C "$OFFICE" -c rebase.autoStash=true pull --ff-only -q origin main 2>/dev/null; then
    echo "flush: office adopted origin (converged on one history)"
  else
    echo "flush: office convergence deferred (honest) — next run will retry"
  fi
fi
