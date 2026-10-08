#!/usr/bin/env bash
# ============================================================================
# FLEET HQ — AUTONOMOUS VAULT UNSEAL (no owner action required)
# ----------------------------------------------------------------------------
# Sovereignty law v2: a fresh machine must be able to restore the office's
# keys WITHOUT the operator. The trust layers, strongest first:
#
#   Tier 1  SSH deploy key (never expires)      → pull + unwrap via w-ssh wrap
#   Tier 2  any registered GitHub credential    → pull + unwrap via its wrap
#   Tier 3  legacy seals (pass == credential)   → opened directly
#
# The sealed keys live in TWO git homes: FleetHQ (public, ciphertext only)
# and the PRIVATE repo roshpinacare-sys/fleet-vault (wraps live here only).
# This script prints NOTHING secret, exits 0 on success, 1 when the vault
# cannot be opened (boot continues keyless — honest, not broken).
# ============================================================================
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$DIR")"
ENC="$DIR/keys.env.enc"
# shellcheck source=vaultlib.sh
source "$DIR/vaultlib.sh"

[ -f "$ENC" ] || { echo "[vault] no $ENC — nothing to unseal"; exit 0; }

# already deployed with real content? then this is a no-op
deployed_ok() {
  local f="$1"
  [ -f "$f" ] || return 1
  grep -qE "^[A-Z_]+=.+" "$f" 2>/dev/null
}

# ---- 1) refresh the freshest sealed copy from the private repo when needed
# DOCTRINE (fixed 2026-10-08): a local keys.env.enc IS the authority (the box
# that sealed last); the private repo pull exists for FRESH machines.
# FIXED 2026-10-08b (sovereign-audit): ALSO pull when the local WRAPS are
# absent — a fresh machine may hold a valid seal but zero wraps, and without
# wraps no credential can unwrap P (the "keyless-honest" false negative).
NEED_PULL=NO
[ ! -s "$ENC" ] && NEED_PULL=YES
[ ! -d "$WRAPS_DIR" ] && NEED_PULL=YES
[ -d "$WRAPS_DIR" ] && [ -z "$(ls "$WRAPS_DIR" 2>/dev/null)" ] && NEED_PULL=YES
if [ "$NEED_PULL" = "YES" ]; then
  TMPCLONE="/tmp/sovereign-vault-$(date +%s)"
  if vault_repo_pull "$TMPCLONE" clone; then
    [ -f "$TMPCLONE/keys.env.enc" ] && cp "$TMPCLONE/keys.env.enc" "$ENC" && chmod 600 "$ENC"
    [ -d "$TMPCLONE/wraps" ] && rm -rf "$WRAPS_DIR" && cp -r "$TMPCLONE/wraps" "$WRAPS_DIR" && chmod 700 "$WRAPS_DIR"
    echo "[vault] pulled sealed vault from private repo $VAULT_REPO (via a discovered credential)"
  fi
  rm -rf "$TMPCLONE"
fi

# ---- 2) unwrap the master passphrase (wraps → session → legacy credential) --
if vault_unwrap; then
  PASS="$VAULT_PASS"
else
  # explicit operator override, last resort
  if [ -n "${VAULT_PASSPHRASE:-}" ]; then PASS="$VAULT_PASSPHRASE"; else
    echo "[vault] no credential can open the vault — continuing keyless (honest degradation)"
    exit 1
  fi
fi

# ---- 3) open + deploy --------------------------------------------------------
export VAULT_PASSPHRASE="$PASS"
if bash "$DIR/vault.sh" open >/dev/null 2>&1; then
  bash "$DIR/vault.sh" deploy >/dev/null 2>&1 || true
  rm -f "$DIR/keys.env"
  # infrastructure bootstrap: the foreman's domain-sync needs a GitHub token
  # (git auth ONLY — agents and the model never see it). Seed from the boot
  # credential when the vault carries none.
  FHQ_ENV="$ROOT/mini-services/agent-hq/.env"
  BOOTCRED="${VAULT_CANDIDATES%%$'\n'*}"
  if [ -f "$FHQ_ENV" ] && [ -n "$BOOTCRED" ] && ! grep -qE "^GITHUB_PAT=.+" "$FHQ_ENV"; then
    if grep -qE "^GITHUB_PAT=" "$FHQ_ENV"; then
      sed -i "s|^GITHUB_PAT=.*|GITHUB_PAT=${BOOTCRED}|" "$FHQ_ENV"
    else
      printf 'GITHUB_PAT=%s\n' "$BOOTCRED" >> "$FHQ_ENV"
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
