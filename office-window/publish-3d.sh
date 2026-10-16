#!/usr/bin/env bash
# publish-3d.sh — מפרסם את חלון-המשרד + פריימי-ה-3D האפויים לענף office-pages.
# (Task 11-a — סקריפט נפרד: publish.sh של office-window נשאר בדיוק כשהוא.)
# Rules honored (COORDINATION.md): rebase-before-push, no force-push, [zai] prefix.
# Zero secrets: the only credential is GH_TOKEN/GITHUB_TOKEN passed via env.
# Fail-honest: missing artifacts → exit 1 BEFORE any push (never a half page).
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root
REPO_ROOT="$(pwd)"   # נשמר לפני-ה-worktree: הארטיפקטים-נבנים בשורש-הריפו, לא בענף

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "publish-3d: GH_TOKEN/GITHUB_TOKEN missing — refusing to push anonymously (fail-closed)" >&2
  exit 1
fi

REPO_SLUG="${GITHUB_REPOSITORY:-roshpinacare-sys/FleetHQ}"
DIST_INDEX="$(pwd)/office-window/dist/index.html"
DIST_DIGEST="$(pwd)/office-window/dist/digest.json"
DIST_3D="$(pwd)/office-window/dist/3d"
[ -f "$DIST_INDEX" ] || { echo "publish-3d: office-window/dist/index.html missing — run render.mjs first" >&2; exit 1; }
[ -f "$DIST_DIGEST" ] || { echo "publish-3d: office-window/dist/digest.json missing — run fleet-digest.mjs first" >&2; exit 1; }
[ -d "$DIST_3D" ] || { echo "publish-3d: office-window/dist/3d/ missing — run tools/office-3d-bake.mjs first (no fake frames)" >&2; exit 1; }
ls "$DIST_3D"/frame-*.png >/dev/null 2>&1 || { echo "publish-3d: no frame-*.png in dist/3d — refusing (honest bake only)" >&2; exit 1; }

# identity: noreply only (gmail=0 law)
git config user.name "roshpinacare-sys"
git config user.email "326012154+roshpinacare-sys@users.noreply.github.com"
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/${REPO_SLUG}.git"

# rebase-first: fetch the branch explicitly
git fetch origin "+office-pages:refs/remotes/origin/office-pages"
if git show-ref --verify --quiet refs/remotes/origin/office-pages; then
  BASE="refs/remotes/origin/office-pages"
else
  BASE="$(git rev-parse HEAD)"   # first publish ever: start from current tip
fi

WT="$(mktemp -d)"
cleanup() { git worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
git worktree add --detach "$WT" "$BASE" >/dev/null

(
  cd "$WT"
  cp "$DIST_INDEX" index.html
  cp "$DIST_DIGEST" digest.json
  # office-state.json — the office pulse feed (Task 15-a, measured 2026-10-16:
  # the root copy sat 14h stale with zero refreshes between daily publishes).
  # Freshest source wins: the heartbeat's committed capture on main, else the
  # mirror receipt it maintains every 15 min. Never fabricated — if both are
  # missing the previous copy stays and the publish log says so (fail-honest).
  STATE_SRC="$REPO_ROOT/office/state/office-state.json"
  if [ ! -s "$STATE_SRC" ]; then STATE_SRC="$REPO_ROOT/receipts/office-state-mirror.json"; fi
  if [ -s "$STATE_SRC" ]; then
    cp "$STATE_SRC" office-state.json
    node -e "const s=require('./office-state.json');const t=s.capturedAt||s.savedAt||'unknown';console.log('- office-state refreshed, timestamp:',t)"
  else
    echo "publish-3d: no office-state source — keeping previous copy (honest)" >&2
  fi
  mkdir -p 3d
  cp "$DIST_3D"/frame-*.png 3d/
  cp "$DIST_3D"/meta.json 3d/meta.json
  # office3d/ — עמוד-הכניסה-החדש: צופה-קולנועי של החדר-האמיתי (room-viewer),
  # והחדר-האינטראקטיבי-הקודם (v4) נשאר-זמין תחת office3d/legacy/ (additive-only).
  node "$REPO_ROOT/office-window/room-viewer.mjs" --3d "$DIST_3D" --out "$DIST_3D/../office3d/index.html" || true
  mkdir -p office3d/legacy
  if [ -f "$DIST_3D/../office3d/index.html" ]; then cp "$DIST_3D/../office3d/index.html" office3d/index.html; fi
  # החדר-האינטראקטיבי = הבאנדל-הטרי מ-vite (REPO_ROOT — לא ה-worktree: שם הארטיפקט
  # אף-פעם לא קיים, וזה בדיוק הבאג שהשאיר את legacy/ תקוע-על v4 מ-2026-10-14).
  # החלפה-כוללה (rm+cp): שאריות-ה-v4 הישן (vendor/, index.html ישן) לא שורדות.
  if [ -d "$REPO_ROOT/dist-office3d" ]; then
    rm -rf office3d/legacy
    mkdir -p office3d/legacy
    cp -r "$REPO_ROOT/dist-office3d/." office3d/legacy/
  else
    echo "publish-3d: dist-office3d missing at $REPO_ROOT — legacy/ keeps previous content (honest)" >&2
  fi
  git add index.html digest.json 3d/ office3d/
  [ -f office-state.json ] && git add office-state.json
  if git diff --cached --quiet; then
    echo "publish-3d: dist identical to office-pages HEAD — nothing to commit"
  else
    git commit -q -m "[zai] office-3d: baked frames + window render $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  fi
  # drift guard: rebase onto the latest remote tip before pushing (no force-push, ever)
  git fetch origin "+office-pages:refs/remotes/origin/office-pages"
  git rebase refs/remotes/origin/office-pages
  git push origin HEAD:office-pages
  HEADSHA="$(git rev-parse --short HEAD)"
  SUMMARY_LINES="## office-3d publish
- branch: \`office-pages\` @ \`${HEADSHA}\`
- files: \`index.html\`, \`digest.json\`, \`office-state.json\`, \`3d/frame-*.png\`, \`3d/meta.json\`
- rebase-before-push honored · no force-push · GITHUB_TOKEN only"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$SUMMARY_LINES" >> "$GITHUB_STEP_SUMMARY"
  else
    printf '%s\n' "$SUMMARY_LINES"
  fi
)
