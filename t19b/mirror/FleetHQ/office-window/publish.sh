#!/usr/bin/env bash
# publish.sh — מפרסם את תוצרי המשרד לענף office-pages של FleetHQ (Pages).
# Rules honored (COORDINATION.md): rebase-before-push, no force-push, [zai] prefix, additive-only.
# Zero secrets: the only credential is GH_TOKEN/GITHUB_TOKEN passed via env; it is never printed.
# Implementation note: publishing happens in a THROWAWAY GIT WORKTREE so the current
# checkout never switches branches (a checkout would delete this very script mid-run).
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root (stays on whatever branch was checked out)

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "publish: GH_TOKEN/GITHUB_TOKEN missing — refusing to push anonymously (fail-closed)" >&2
  exit 1
fi

REPO_SLUG="${GITHUB_REPOSITORY:-roshpinacare-sys/FleetHQ}"
DIST_INDEX="$(pwd)/office-window/dist/index.html"
DIST_DIGEST="$(pwd)/office-window/dist/digest.json"
[ -f "$DIST_INDEX" ] || { echo "publish: office-window/dist/index.html missing — run render.mjs first" >&2; exit 1; }
[ -f "$DIST_DIGEST" ] || { echo "publish: office-window/dist/digest.json missing — run fleet-digest.mjs first" >&2; exit 1; }

# identity: noreply only (gmail=0 law)
git config user.name "fleet-office-bot"
git config user.email "roshpinacare-sys@users.noreply.github.com"
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/${REPO_SLUG}.git"

# rebase-first: fetch the branch explicitly
git fetch origin "+office-pages:refs/remotes/origin/office-pages"
if git show-ref --verify --quiet refs/remotes/origin/office-pages; then
  BASE="refs/remotes/origin/office-pages"
else
  BASE="$(git rev-parse HEAD)"   # first publish ever: start from current tip (orphan-style)
fi

WT="$(mktemp -d)"
cleanup() { git worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
git worktree add --detach "$WT" "$BASE" >/dev/null

# the MAIN checkout (not the worktree) holds public/office3d + office/state
ROOT="$(pwd)"

(
  cd "$WT"
  cp "$DIST_INDEX" index.html
  cp "$DIST_DIGEST" digest.json
  git add index.html digest.json
  # the living 3D office (whole folder) + the latest captured office-state,
  # so the published scene self-feeds from ./office-state.json (Pages has no /api)
  STATE_SRC="$ROOT/office/state/office-state.json"
  if [ -d "$ROOT/public/office3d" ]; then
    rm -rf office3d
    cp -r "$ROOT/public/office3d" office3d
    [ -f "$STATE_SRC" ] && cp "$STATE_SRC" office3d/office-state.json
    git add office3d
  fi
  if [ -f "$STATE_SRC" ]; then
    cp "$STATE_SRC" office-state.json
    git add office-state.json
  fi
  # potential ledger (measured open work + recruiting board) — additive, optional
  for PF in potential.json potential.html; do
    if [ -f "$ROOT/office-window/dist/$PF" ]; then
      cp "$ROOT/office-window/dist/$PF" "$PF"
      git add "$PF"
    fi
  done
  if git diff --cached --quiet; then
    echo "publish: dist identical to office-pages HEAD — nothing to commit"
  else
    git commit -q -m "[zai] office-window: daily render + living 3D office $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  fi
  # drift guard: rebase onto the latest remote tip before pushing (no force-push, ever)
  git fetch origin "+office-pages:refs/remotes/origin/office-pages"
  git rebase refs/remotes/origin/office-pages
  git push origin HEAD:office-pages
  HEADSHA="$(git rev-parse --short HEAD)"
  SUMMARY_LINES="## office-window publish
- branch: \`office-pages\` @ \`${HEADSHA}\`
- files: \`index.html\`, \`digest.json\`, \`office3d/\` (living 3D office), \`office-state.json\`
- rebase-before-push honored · no force-push · GITHUB_TOKEN only"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$SUMMARY_LINES" >> "$GITHUB_STEP_SUMMARY"
  else
    printf '%s\n' "$SUMMARY_LINES"
  fi
)
