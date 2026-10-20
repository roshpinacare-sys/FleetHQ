#!/usr/bin/env bash
# brain-audit-sandbox.sh — weekly iFixAi brain audit on the SANDBOX lane [G8].
# Why this lane: NIM chat completions are starved from GitHub-Actions runners
# (MEASURED 2026-10-18: /models 200 @0.17s, raw chat 000 @45s, 4/4 SDK hangs) while
# the sandbox lane reaches NIM in ~2s. The workflow keeps the mock proof + egress
# diagnostics + honest reason; THIS script owns the real brain audit and publishes
# its results to the same office-pages branch.
# Laws: zero secrets in outputs (key read at runtime, passed via env only, never
# printed); additive publish (rebase-first, no force); fail-honest (a failed audit
# publishes nothing — the workflow's honest reason stays).
set -uo pipefail

FLEETHQ_DIR="${FLEETHQ_DIR:-/home/z/audit/repos/FleetHQ}"
NIM_ENV="${NIM_ENV:-/home/z/my-project/upload/nvidia-nim.env}"
MODEL="${MODEL:-z-ai/glm-5.3-flash}"
OUT_DIR="/tmp/ifixai-brain-sandbox"
MOCK_DIR="/tmp/ifixai-mock-sandbox"
ASKPASS="${GIT_ASKPASS:-/home/z/audit/bin/git-askpass.sh}"

die() { echo "brain-audit-sandbox: $*" >&2; exit 1; }

[ -f "$NIM_ENV" ] || die "NIM key file missing: $NIM_ENV (recover per RECOVERY.md)"
[ -d "$FLEETHQ_DIR/.git" ] || die "FleetHQ clone missing: $FLEETHQ_DIR (recover per RECOVERY.md)"
export GIT_ASKPASS="$ASKPASS"
command -v ifixai >/dev/null 2>&1 || python3 -m pip install -q "ifixai[openai]" || die "ifixai not installable"
IFIXAI="$(command -v ifixai || echo /home/z/.venv/bin/ifixai)"

NIMKEY="$(tr -d ' \n\r' < "$NIM_ENV")"
[ -n "$NIMKEY" ] || die "NIM key file empty"

# freshness gate (idempotent — safe to call from ANY cycle): if a brain audit was
# published < 6 days ago, the weekly cadence is already satisfied — skip honestly.
# Reads the office-pages branch HEAD via git — exact, no CDN lag (raw.* lags ~5min).
git -C "$FLEETHQ_DIR" fetch origin "+office-pages:refs/remotes/origin/office-pages" -q 2>/dev/null || true
FRESH="$(git -C "$FLEETHQ_DIR" show "origin/office-pages:ifixai-audit.json" 2>/dev/null | python3 -c "
import json, sys, datetime
try:
    d = json.load(sys.stdin)
    b = d.get('brain', {})
    if b.get('ran'):
        age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(d['generatedAt'].replace('Z', '+00:00'))
        print('FRESH' if age < datetime.timedelta(days=6) else 'STALE')
    else:
        print('STALE')
except Exception:
    print('STALE')
")" || FRESH="STALE"
if [ "$FRESH" = "FRESH" ]; then
  echo "brain-audit-sandbox: fresh brain audit already published (< 6 days) — weekly cadence satisfied, skipping (zero token burn)"
  exit 0
fi
echo "brain-audit-sandbox: published brain audit stale/missing — running the weekly audit"

DOCTRINE="$FLEETHQ_DIR/office-window/ifixai-doctrine.txt"
[ -f "$DOCTRINE" ] || die "doctrine file missing: $DOCTRINE"

echo "── mock pipeline proof (zero-cost) ──"
rm -rf "$MOCK_DIR"; mkdir -p "$MOCK_DIR"
"$IFIXAI" run --provider mock --api-key not-used --eval-mode self \
  --format json --output "$MOCK_DIR" >/dev/null 2>&1 || true

echo "── brain audit vs NIM ($MODEL) ──"
rm -rf "$OUT_DIR"; mkdir -p "$OUT_DIR"
BRAIN_OK=0
for ATTEMPT in 1 2 3; do
  echo "attempt $ATTEMPT/3"
  # iFixAi exits nonzero on scoped runs (no headline B08/P01) and on low scores —
  # success is MEASURED AS: a report with test_results exists (the verdict is data,
  # not an exit code). Each attempt costs NIM tokens — never retry on a real report.
  "$IFIXAI" run --provider openai \
    --endpoint "https://integrate.api.nvidia.com/v1" \
    --api-key "$NIMKEY" \
    --model "$MODEL" \
    --name "saos-sovereign-brain" \
    --timeout 90 \
    --system-prompt "$(cat "$DOCTRINE")" \
    --grounding fixture --suite smoke --eval-mode self \
    --format json --output "$OUT_DIR" >/dev/null 2>&1 || true
  if ls "$OUT_DIR"/*.json >/dev/null 2>&1; then
    BRAIN_OK=1; break
  fi
  sleep 15
done
[ "$BRAIN_OK" = "1" ] || die "brain audit failed after 3 attempts — publishing nothing (fail-honest; the workflow's honest reason remains)"
unset NIMKEY

echo "── build ifixai-audit.json (sandbox lane: real brain report) ──"
cd "$FLEETHQ_DIR" || die "cd failed"
git fetch origin main -q && git rebase origin/main -q || die "main rebase failed"
mkdir -p office-window/dist
MOCK_DIR="$MOCK_DIR" BRAIN_DIR="$OUT_DIR" \
BRAIN_HOST="https://integrate.api.nvidia.com" BRAIN_MODEL="$MODEL" \
  node office-window/ifixai-audit-build.mjs office-window/dist/ifixai-audit.json || die "build failed"
python3 - << 'PYEOF' || die "sanity: brain.ran must be true in the built JSON"
import json
d = json.load(open("office-window/dist/ifixai-audit.json"))
assert d["brain"].get("ran") is True, "brain.ran is not true — refusing to publish"
assert d["mock"].get("ran") is True, "mock.ran is not true — refusing to publish"
print("sanity OK: mock.ran=true, brain.ran=true,", len(d["brain"].get("tests", [])), "tests")
PYEOF

echo "── publish to office-pages (worktree, rebase-first, no force) ──"
git fetch origin "+office-pages:refs/remotes/origin/office-pages" -q
BASE="refs/remotes/origin/office-pages"
WT="$(mktemp -d)"
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
git worktree add --detach "$WT" "$BASE" >/dev/null || die "worktree add failed"
(
  cd "$WT" || exit 1
  cp "$FLEETHQ_DIR/office-window/dist/ifixai-audit.json" ifixai-audit.json
  git add ifixai-audit.json
  if git diff --cached --quiet; then
    echo "publish: identical — nothing to commit"
  else
    git commit -q -m "[zai] ifixai weekly brain audit (sandbox lane — runner→NIM chat measured blocked): real brain report, zero secrets"
    git fetch origin "+office-pages:refs/remotes/origin/office-pages" -q
    git rebase refs/remotes/origin/office-pages -q || exit 1
    git push origin HEAD:office-pages || exit 1
    echo "published: office-pages @ $(git rev-parse --short HEAD)"
  fi
) || die "publish failed"
echo "brain-audit-sandbox: DONE"
