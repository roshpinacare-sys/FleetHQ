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

# sovereignty v2: if no explicit passphrase, unwrap via the wrap registry
# (session pass → wraps → legacy credential) — see vaultlib.sh
# T-47 (agent-2): EXPORT is mandatory — openssl -pass env: reads the child
# ENVIRONMENT; a plain shell assignment is invisible to it. This exact bug
# made the autonomous unwrap path fail with "WRONG PASSPHRASE" while the
# same passphrase succeeded when passed explicitly. Measured 2026-10-09.
if [ -z "${VAULT_PASSPHRASE:-}" ] && [ -f "$DIR/vaultlib.sh" ]; then
  # shellcheck source=vaultlib.sh
  source "$DIR/vaultlib.sh" >/dev/null 2>&1 || true
  vault_unwrap >/dev/null 2>&1 && export VAULT_PASSPHRASE="$VAULT_PASS" || true
fi

require_pass() { : "${VAULT_PASSPHRASE:?set VAULT_PASSPHRASE first (the fleet vault passphrase)}"; }

cmd="${1:-status}"
case "$cmd" in
  seal)
    require_pass
    [ -f "$KEYS" ] || { echo "no $KEYS to seal — fill it first (see vault/README.md)"; exit 1; }
    # SAFETY (2026-10-08): an empty-structure seal ERASES real keys on the next
    # open (this exact accident happened in a parallel re-seal). Refuse honestly.
    if ! grep -qE "^[A-Z_][A-Z0-9_]*=.+" "$KEYS"; then
      echo "REFUSING to seal: keys.env has ZERO valued slots (empty seal would erase the real keys)"
      exit 1
    fi
    # T-47 (agent-2): SLOT-REGRESSION GUARD — measured live 2026-10-09: a machine
    # with a thin local keys.env re-sealed over an 18-slot authority (→3 slots).
    # A seal may never carry FEWER valued slots than the current authority seal
    # unless VAULT_REGRESSION_CONFIRM=1 (honest, explicit override).
    if [ -f "$ENC" ]; then
      TMPG="$(mktemp)"
      if openssl enc -d -"$CIPHER" $KDF -in "$ENC" -out "$TMPG" -pass env:VAULT_PASSPHRASE 2>/dev/null; then
        AUTH_N="$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.+' "$TMPG" || true)"
        NEW_N="$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.+' "$KEYS" || true)"
        if [ "${AUTH_N:-0}" -gt 0 ] && [ "${NEW_N:-0}" -lt "$AUTH_N" ] && [ "${VAULT_REGRESSION_CONFIRM:-0}" != "1" ]; then
          echo "REFUSING to seal: $NEW_N valued slots < authority $AUTH_N — would erase real keys."
          echo "Union-merge first, or override honestly with VAULT_REGRESSION_CONFIRM=1"
          rm -f "$TMPG"; exit 1
        fi
      fi
      rm -f "$TMPG"
    fi
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
      # T-47: standalone-layout guard — create the parent dir so deploy NEVER
      # aborts `open` mid-flow on machines without the FleetHQ tree.
      mkdir -p "$(dirname "$dst")" 2>/dev/null || true
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
    # T-57: גשר-custody-Steem — שסלוטי-הכספת ← מועמדי-האימוץ-החוקיים-של-המנוע (CI_*).
    # המנוע-שופט-מול-השרשרת-ברגע-האימוץ; הכספת-רק-מאכילה. אפס-מפתחות-עוזבים-את-המכונה.
    STEEM_ENV="$ROOT/steem/mini-services/saos-engine/.env"
    if [ -d "$(dirname "$STEEM_ENV")" ]; then
      M="$(mktemp)"
      awk -F= '
        /^HEAD_CORNER_MASTER=/ { print "CI_HEADCORNER_CRED=" substr($0, index($0,"=")+1) }
        /^STEEM_POSTING_WIF_A=/ { print "CI_STEEM_POSTING_WIF=" substr($0, index($0,"=")+1) }
        /^STEEM_ACTIVE_WIF_A=/  { print "CI_STEEM_ACTIVE_WIF=" substr($0, index($0,"=")+1); print "CI_SA_HEAD_ACTIVE=" substr($0, index($0,"=")+1) }
        /^STEEM_ACCOUNT=/       { print "SAOS_ACCOUNT=" substr($0, index($0,"=")+1) }
      ' "$KEYS" > "$M"
      merge_env "$M" "$STEEM_ENV"
      rm -f "$M"
      echo "deployed → steem custody bridge (saos-engine/.env · CI_* · 600)"
    fi
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
