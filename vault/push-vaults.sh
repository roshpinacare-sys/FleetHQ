#!/usr/bin/env bash
# ============================================================================
# PUSH VAULTS — both sealed homes, zero plaintext, guarded.
#   FleetHQ (PUBLIC)  : keys.env.enc + ssh-keys.tar.enc + vault tooling + docs
#                       (wraps/ and ssh plaintext NEVER go here)
#   fleet-vault (PRIVATE) : everything above + wraps/ (the trust registry)
# Guard: a 12-pattern secret scan runs over the outgoing trees; any hit = no push.
# ============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/vault/vaultlib.sh"

say() { printf '[push-vaults] %s\n' "$*"; }

scan_secrets() { # $1 = dir to scan (tracked candidate files only)
  # every pattern REQUIRES a value-shaped suffix, so the scanner's own regex
  # source lines cannot trigger it (bare pattern names are not values)
  local dir="$1" hits=0 f
  while IFS= read -r -d '' f; do
    if grep -qEi 'sk-or-v1-[A-Za-z0-9-]{20,}|xai-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|gsk_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|vck_[A-Za-z0-9]{20,}|rnd_[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9_-]{20,}|jina_[A-Za-z0-9_-]{20,}|[0-9a-f]{32}\.[A-Za-z0-9_-]{20,}|-----BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE|5[KJ][1-9A-HJ-NP-Za-km-z]{50}' "$f" 2>/dev/null; then
      say "SECRET-PATTERN HIT: $f"; hits=$((hits+1))
    fi
  done < <(find "$dir" -type f -not -path '*/.git/*' -print0)
  [ "$hits" = 0 ]
}

# ---- sanity -------------------------------------------------------------------
[ -f "$VAULT_DIR/keys.env.enc" ] || { say "no keys.env.enc — nothing to push"; exit 1; }

# ---- 1. FleetHQ (public) --------------------------------------------------------
cd "$ROOT"
git add vault/keys.env.enc vault/ssh-keys.tar.enc vault/vault.sh vault/vaultlib.sh vault/wrap.sh vault/boot-sovereign.sh vault/auto-unseal.sh vault/README.md vault/push-vaults.sh 2>/dev/null || true
git add -f vault/ssh/tool/git-ssh-shim.mjs vault/ssh/tool/package.json 2>/dev/null || true
if git diff --cached --quiet; then say "FleetHQ: vault already up to date"; else
  # value-shaped scan over staged TEXT files (*.enc are ciphertext, skipped)
  BAD=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    case "$f" in *.enc) continue ;; esac
    if grep -qEi 'sk-or-v1-[A-Za-z0-9-]{20,}|xai-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|gsk_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|vck_[A-Za-z0-9]{20,}|rnd_[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9_-]{20,}|jina_[A-Za-z0-9_-]{20,}|[0-9a-f]{32}\.[A-Za-z0-9_-]{20,}|-----BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE|5[KJ][1-9A-HJ-NP-Za-km-z]{50}' "$f" 2>/dev/null; then
      say "SECRET HIT in staged file: $f"; BAD=1
    fi
  done < <(git diff --cached --name-only)
  [ "$BAD" = 0 ] || { say "FleetHQ: staged tree FAILED the secret scan — aborting push"; exit 1; }
  git commit -q -m "sovereign vault v2: wrap-registry trust model (master pass P + credential wraps), boot-sovereign one-command restoration, SSH deploy keys (never-expiring tier), gateway failover hardening" && say "FleetHQ: committed"
fi
# push with an explicit authenticated URL (no credential helper exists on a
# fresh machine); rebase over whatever the cloud crew pushed meanwhile
discover_credentials
PUSH_OK=""
for c in $VAULT_CANDIDATES; do
  git fetch -q "https://x-access-token:${c}@github.com/roshpinacare-sys/FleetHQ.git" '+refs/heads/main:refs/remotes/origin/main' 2>/dev/null || continue
  git rebase -q origin/main >/dev/null 2>&1 || true
  if git push -q "https://x-access-token:${c}@github.com/roshpinacare-sys/FleetHQ.git" HEAD:main 2>/dev/null; then PUSH_OK=1; break; fi
done
if [ -n "$PUSH_OK" ]; then say "FleetHQ: pushed ($(git rev-parse --short HEAD))"; else say "FleetHQ: push failed with every discovered credential"; fi

# ---- 2. fleet-vault (private) ---------------------------------------------------
PVT="$ROOT/.vault-private-repo"
if [ ! -d "$PVT/.git" ]; then
  discover_credentials
  ok=""
  for c in $VAULT_CANDIDATES; do
    rm -rf "$PVT"; git clone -q "https://x-access-token:${c}@github.com/${VAULT_REPO}.git" "$PVT" 2>/dev/null && { ok=1; break; }
  done
  [ -n "$ok" ] || { say "private repo: could not clone with any credential"; exit 1; }
fi
mkdir -p "$PVT/wraps" "$PVT/ssh-tool"
# hygiene: a previous era committed plaintext identity/ credentials in this
# private repo — the scan guard below blocks pushes while they exist, so
# remove them from HEAD and disk (the live PAT is vaulted elsewhere)
( cd "$PVT" && git rm -rq --cached identity 2>/dev/null; rm -rf identity; printf 'identity/\n' >> .gitignore; sort -u .gitignore -o .gitignore ) || true
cp -f "$VAULT_DIR/keys.env.enc" "$PVT/" 2>/dev/null
[ -f "$VAULT_DIR/ssh-keys.tar.enc" ] && cp -f "$VAULT_DIR/ssh-keys.tar.enc" "$PVT/"
[ -d "$WRAPS_DIR" ] && cp -f "$WRAPS_DIR/"*.enc "$PVT/wraps/" 2>/dev/null
cp -f "$VAULT_DIR/vault.sh" "$VAULT_DIR/vaultlib.sh" "$VAULT_DIR/wrap.sh" "$VAULT_DIR/boot-sovereign.sh" "$VAULT_DIR/auto-unseal.sh" "$VAULT_DIR/README.md" "$PVT/" 2>/dev/null
mkdir -p "$PVT/ssh-tool" && cp -f "$VAULT_DIR/ssh/tool/git-ssh-shim.mjs" "$VAULT_DIR/ssh/tool/package.json" "$PVT/ssh-tool/" 2>/dev/null
[ -f "$ROOT/SOVEREIGNTY.md" ] && cp -f "$ROOT/SOVEREIGNTY.md" "$PVT/"
[ -f "$ROOT/sovereign/ROAST.md" ] && mkdir -p "$PVT/sovereign" && cp -f "$ROOT/sovereign/ROAST.md" "$PVT/sovereign/"
cd "$PVT"
if scan_secrets "$PVT"; then :; else say "private repo: secret scan hit — aborting"; exit 1; fi
git add -A
if git diff --cached --quiet; then say "private repo: already up to date"; else
  git commit -q -m "sovereign vault v2: wrap registry + rekey + ssh-keys tar + boot kit (ciphertext only; plaintext identity/ removed from HEAD)"
  PVC=""
  for c in $VAULT_CANDIDATES; do
    git fetch -q "https://x-access-token:${c}@github.com/${VAULT_REPO}.git" '+refs/heads/main:refs/remotes/origin/main' 2>/dev/null || continue
    git rebase -q origin/main >/dev/null 2>&1 || true
    if git push -q "https://x-access-token:${c}@github.com/${VAULT_REPO}.git" HEAD:main 2>/dev/null; then PVC=1; break; fi
  done
  if [ -n "$PVC" ]; then say "private repo: pushed ($(git rev-parse --short HEAD))"; else say "private repo: push failed with every discovered credential"; fi
fi
cd "$ROOT"
say "done."
