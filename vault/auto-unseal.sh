#!/usr/bin/env bash
# ============================================================================
# FLEET HQ — AUTONOMOUS VAULT UNSEAL (no owner action required)
# ----------------------------------------------------------------------------
# Sovereignty law: a fresh machine must be able to restore the office's keys
# WITHOUT the operator. The two halves of the secret live in different homes:
#
#   KEYS (encrypted) : vault/keys.env.enc — committed to FleetHQ AND to the
#                      private repo roshpinacare-sys/fleet-vault (belt+braces).
#   PASSPHRASE       : upload/pat.env (also upload/pat.rar) — the owner's
#                      token, present on the box across resets; never in git.
#
# This script: find passphrase → open vault → deploy .env files → done.
# It prints NOTHING secret, exits 0 on success, 1 when the vault cannot be
# opened (boot continues keyless — the office stays honest, not broken).
# ============================================================================
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$DIR")"
ENC="$DIR/keys.env.enc"

[ -f "$ENC" ] || { echo "[vault] no $ENC — nothing to unseal"; exit 0; }

# already deployed with real content? then this is a no-op
deployed_ok() {
  local f="$1"
  [ -f "$f" ] || return 1
  grep -qE "^[A-Z_]+=.+" "$f" 2>/dev/null
}

# ---- 1) locate the passphrase (env → upload/pat.env → upload/pat.rar pass) --
PASS=""
if [ -n "${VAULT_PASSPHRASE:-}" ]; then
  PASS="$VAULT_PASSPHRASE"
elif [ -f "$ROOT/upload/pat.env" ]; then
  # the owner's token file — read the longest line, never echo it
  PASS="$(awk '{ if (length($0) > m) { m = length($0); l = $0 } } END { print l }' "$ROOT/upload/pat.env")"
fi
[ -n "$PASS" ] || { echo "[vault] no passphrase source (set VAULT_PASSPHRASE or restore upload/pat.env)"; exit 1; }

# ---- 2) try pulling the freshest sealed copy from the private vault repo ----
# (agents never touch credentials: the PAT is used only by this infrastructure
#  script as git auth AND as the vault passphrase — it is never logged)
if [ -n "${VAULT_PRIVATE_REPO:-}" ] || true; then
  REPO="${VAULT_PRIVATE_REPO:-roshpinacare-sys/fleet-vault}"
  TMPCLONE="$(mktemp -d)"
  if git clone --depth 1 -q "https://x-access-token:${PASS}@github.com/${REPO}.git" "$TMPCLONE" 2>/dev/null; then
    if [ -f "$TMPCLONE/keys.env.enc" ]; then
      if [ "$TMPCLONE/keys.env.enc" -nt "$ENC" ]; then
        cp "$TMPCLONE/keys.env.enc" "$ENC" && chmod 600 "$ENC"
        echo "[vault] refreshed sealed vault from private repo $REPO"
      fi
    fi
  fi
  rm -rf "$TMPCLONE"
fi

# ---- 3) open + deploy --------------------------------------------------------
export VAULT_PASSPHRASE="$PASS"
if bash "$DIR/vault.sh" open >/dev/null 2>&1; then
  bash "$DIR/vault.sh" deploy >/dev/null 2>&1 || true
  rm -f "$DIR/keys.env"
  # infrastructure bootstrap: the foreman's domain-sync needs the GitHub PAT
  # (git auth ONLY — agents and the model never see it). On a fresh machine
  # the vault carries no PAT, so seed it from the owner's token file.
  FHQ_ENV="$ROOT/mini-services/agent-hq/.env"
  if [ -f "$FHQ_ENV" ] && ! grep -qE "^GITHUB_PAT=.+" "$FHQ_ENV"; then
    if grep -qE "^GITHUB_PAT=" "$FHQ_ENV"; then
      sed -i "s|^GITHUB_PAT=.*|GITHUB_PAT=${PASS}|" "$FHQ_ENV"
    else
      printf 'GITHUB_PAT=%s\n' "$PASS" >> "$FHQ_ENV"
    fi
    chmod 600 "$FHQ_ENV"
  fi
  # verify the deploy actually produced keyed files
  if deployed_ok "$ROOT/.env.local" || deployed_ok "$ROOT/mini-services/agent-hq/.env" || deployed_ok "$ROOT/foreman/.env" || deployed_ok "$ROOT/.env"; then
    echo "[vault] keys deployed (autonomous unseal OK)"
    exit 0
  fi
  echo "[vault] unsealed but deploy produced empty slots — running keyless"
  exit 0
fi
echo "[vault] unseal failed — continuing keyless (honest degradation)"
exit 1
