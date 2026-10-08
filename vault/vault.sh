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
    # MERGE-DEPLOY (non-destructive): vault slots with real values win; slots
    # that are empty in the vault NEVER stomp a value already living in the
    # target (e.g. the infrastructure-only GITHUB_PAT in agent-hq/.env);
    # target-only lines are preserved.
    # NOTE: env names may contain DIGITS (OPENROUTER_API_KEY_2) — the key
    # regex must allow them or numbered slots get silently dropped.
    merge_env() {
      src="$1"; dst="$2"
      [ -f "$src" ] || return 0
      if [ ! -f "$dst" ]; then cp "$src" "$dst"; chmod 600 "$dst"; return 0; fi
      awk -F= '
        FNR==NR { if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/ && length(substr($0, index($0,"=")+1)) > 0) want[$1]=$0; next }
        {
          if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/ && ($1 in want)) { print want[$1]; delete want[$1] }
          else print
        }
        END { for (k in want) print want[k] }
      ' "$src" "$dst" > "$dst.tmp" && mv "$dst.tmp" "$dst" && chmod 600 "$dst"
    }
    merge_env "$KEYS" "$ROOT/.env.local"
    merge_env "$KEYS" "$ROOT/mini-services/agent-hq/.env"
    chmod 600 "$ROOT/.env.local" "$ROOT/mini-services/agent-hq/.env" 2>/dev/null || true
    echo "deployed → .env.local + mini-services/agent-hq/.env (merged, 600, gitignored)"
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
