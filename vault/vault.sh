#!/usr/bin/env bash
# ============================================================================
# FLEET HQ SEALED VAULT — הכספת החתומה של המפקדה
# ----------------------------------------------------------------------------
# The law: keys NEVER travel through git in plaintext. The ONLY key artifact
# that is committed is keys.env.enc — AES-256 encrypted with PBKDF2 (200k
# iterations). The passphrase lives ONLY with the owner (and optionally in a
# gitignored vault/.passphrase for unattended restarts).
#
#   VAULT_PASSPHRASE=... bash vault/vault.sh seal    # plaintext → .enc (then commit .enc)
#   VAULT_PASSPHRASE=... bash vault/vault.sh open    # .enc → keys.env + deploy
#   bash vault/vault.sh deploy                       # keys.env → .env.local + agent-hq/.env
#   bash vault/vault.sh status
#
# Deployed files (gitignored, chmod 600):
#   .env.local                     — Next.js reception (עמית)
#   mini-services/agent-hq/.env    — the foreman crew
# ============================================================================
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS="$DIR/keys.env"
ENC="$DIR/keys.env.enc"
ROOT="$(dirname "$DIR")"
CIPHER="aes-256-cbc"
KDF="-pbkdf2 -iter 200000 -salt"

require_pass() { : "${VAULT_PASSPHRASE:?set VAULT_PASSPHRASE first (the fleet vault passphrase)}"; }

cmd="${1:-status}"
case "$cmd" in
  seal)
    require_pass
    [ -f "$KEYS" ] || { echo "no $KEYS to seal — fill it first (see vault/README.md)"; exit 1; }
    openssl enc -"$CIPHER" $KDF -in "$KEYS" -out "$ENC" -pass env:VAULT_PASSPHRASE
    chmod 600 "$ENC" "$KEYS"
    echo "sealed → $ENC  (safe to git commit; the plaintext stays gitignored)"
    ;;
  open)
    require_pass
    [ -f "$ENC" ] || { echo "no $ENC in the repo"; exit 1; }
    TMP="$(mktemp)"
    if ! openssl enc -d -"$CIPHER" $KDF -in "$ENC" -out "$TMP" -pass env:VAULT_PASSPHRASE 2>/dev/null; then
      rm -f "$TMP"; echo "WRONG PASSPHRASE — vault stays sealed"; exit 1
    fi
    chmod 600 "$TMP"
    mv "$TMP" "$KEYS"
    echo "opened → $KEYS"
    "$DIR/vault.sh" deploy
    ;;
  deploy)
    [ -f "$KEYS" ] || { echo "no $KEYS — run: VAULT_PASSPHRASE=... bash vault/vault.sh open"; exit 1; }
    cp "$KEYS" "$ROOT/.env.local"
    cp "$KEYS" "$ROOT/mini-services/agent-hq/.env"
    chmod 600 "$ROOT/.env.local" "$ROOT/mini-services/agent-hq/.env"
    echo "deployed → .env.local + mini-services/agent-hq/.env (both 600, both gitignored)"
    ;;
  status)
    [ -f "$ENC" ] && echo "present: keys.env.enc (sealed, committed)" || echo "missing: keys.env.enc"
    [ -f "$KEYS" ] && echo "present: keys.env (plaintext, gitignored)" || echo "missing: keys.env"
    ;;
  *)
    echo "usage: vault.sh {seal|open|deploy|status}   (VAULT_PASSPHRASE required for seal/open)"
    exit 1
    ;;
esac
