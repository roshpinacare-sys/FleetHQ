#!/usr/bin/env bash
# publish.sh — מפרסם את תוצרי המשרד לענף office-pages של FleetHQ (Pages).
# Rules honored (COORDINATION.md): rebase-before-push, no force-push, [zai] prefix, additive-only.
# Zero secrets: the only credential is GH_TOKEN/GITHUB_TOKEN passed via env; it is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "publish: GH_TOKEN/GITHUB_TOKEN missing — refusing to push anonymously (fail-closed)" >&2
  exit 1
fi

REPO_SLUG="${GITHUB_REPOSITORY:-roshpinacare-sys/FleetHQ}"

# identity: noreply only (gmail=0 law)
git config user.name "fleet-office-bot"
git config user.email "roshpinacare-sys@users.noreply.github.com"
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/${REPO_SLUG}.git"

# rebase-first: fetch the branch explicitly, then rebase our commit on top of any drift
git fetch origin "+office-pages:refs/remotes/origin/office-pages"
git checkout -B office-pages "refs/remotes/origin/office-pages"

cp office-window/dist/index.html index.html
cp office-window/dist/digest.json digest.json
git add index.html digest.json

if git diff --cached --quiet; then
  echo "publish: dist identical to office-pages HEAD — nothing to commit"
else
  git commit -m "[zai] office-window: daily render $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
fi

# drift guard: rebase onto the latest remote tip before pushing (no force-push, ever)
git pull --rebase origin office-pages
git push origin office-pages

HEADSHA="$(git rev-parse --short HEAD)"
{
  echo "## office-window publish"
  echo ""
  echo "- branch: \`office-pages\` @ \`${HEADSHA}\`"
  echo "- files: \`index.html\`, \`digest.json\`"
  echo "- rebase-before-push honored · no force-push · GITHUB_TOKEN only"
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
