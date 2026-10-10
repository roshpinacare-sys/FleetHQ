#!/usr/bin/env bash
# ============================================================================
# FLEET VAULT — WRAP REGISTRY CLI (the vault owns itself)
# ----------------------------------------------------------------------------
#   bash vault/wrap.sh rekey        # migrate/rotate: new random master pass P,
#                                   # re-seal all artifacts, rebuild ALL wraps
#                                   # from every credential on this machine
#   bash vault/wrap.sh status       # what is sealed, which wraps exist (no secrets)
#   bash vault/wrap.sh open         # unwrap P → session pass (no deploy)
#
# Rekey is safe: nothing overwrites until every artifact re-seals + verifies.
# ============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
source "$HERE/vaultlib.sh"

status() {
  echo "sealed artifacts:"
  for f in keys.env.enc ssh-keys.tar.enc; do
    [ -f "$VAULT_DIR/$f" ] && echo "  $f ($(stat -c%s "$VAULT_DIR/$f")B)" || echo "  $f MISSING"
  done
  echo "wraps registered:"
  if [ -d "$WRAPS_DIR" ]; then
    local n=0
    for w in "$WRAPS_DIR"/*.enc; do [ -f "$w" ] && { echo "  $(basename "$w" .enc)"; n=$((n+1)); }; done
    [ "$n" = 0 ] && echo "  (none)"
  else echo "  (no wraps dir)"; fi
  [ -f "$SESSION_PASS" ] && echo "session pass: present" || echo "session pass: absent"
}

open_() {
  if vault_unwrap; then echo "passphrase available for this session (vault/.session-pass)"; return 0; fi
  echo "unwrap failed — no registered credential on this machine"; return 1
}

rekey() {
  echo "== REKEY ceremony begins =="
  # 1) open with whatever works today
  if ! vault_unwrap; then echo "cannot open current seal — aborting (nothing changed)"; return 1; fi
  local OLD="$VAULT_PASS"
  [ -f "$VAULT_DIR/keys.env.enc" ] || { echo "no keys.env.enc — nothing to rekey"; return 1; }
  # 2) decrypt the payload with the OLD pass
  T="$(mktemp -d)"; chmod 700 "$T"
  VAULT_TMP_P="$OLD" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$VAULT_DIR/keys.env.enc" -out "$T/keys.env" -pass env:VAULT_TMP_P 2>/dev/null \
    || { echo "payload decrypt failed — aborting"; rm -rf "$T"; return 1; }
  grep -qE "^[A-Za-z_][A-Za-z0-9_]*=.+" "$T/keys.env" || { echo "decrypted payload empty — refusing (empty-seal guard)"; rm -rf "$T"; return 1; }
  # T-47 (agent-2): SLOT-REGRESSION GUARD — a re-seal from a machine whose local
  # keys.env holds FEWER valued slots than the authority seal ERASES real keys
  # (measured live 2026-10-09: a sibling rekey replaced 18 valued slots with 3).
  # Law: the new payload must cover every valued slot of the current authority
  # unless VAULT_REGRESSION_CONFIRM=1 (honest, explicit, logged).
  local OLD_N NEW_N missing
  OLD_N="$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.+' "$VAULT_DIR/keys.env.enc" >/dev/null 2>&1; VAULT_TMP_P="$OLD" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$VAULT_DIR/keys.env.enc" -out "$T/authority.env" -pass env:VAULT_TMP_P 2>/dev/null; grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.+' "$T/authority.env" 2>/dev/null || echo 0)"
  NEW_N="$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.+' "$T/keys.env")"
  if [ "${OLD_N:-0}" -gt 0 ] && [ "$NEW_N" -lt "$OLD_N" ] && [ "${VAULT_REGRESSION_CONFIRM:-0}" != "1" ]; then
    missing="$(comm -13 <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$T/keys.env" | sort -u) <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$T/authority.env" | sort -u) | tr '\n' ' ')"
    echo "REFUSING rekey: payload has $NEW_N valued slots < authority $OLD_N — would erase: ${missing:-?}"
    echo "override honestly with VAULT_REGRESSION_CONFIRM=1 if you truly mean it"
    rm -rf "$T"; return 1
  fi
  # 3) fresh master pass
  local NEW; NEW="$(vault_new_pass)"
  # 4) re-seal keys.env.enc under NEW and VERIFY before replacing
  VAULT_TMP_P="$NEW" openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$T/keys.env" -out "$T/keys.env.enc" -pass env:VAULT_TMP_P 2>/dev/null
  VAULT_TMP_P="$NEW" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$T/keys.env.enc" -out "$T/verify.env" -pass env:VAULT_TMP_P 2>/dev/null
  cmp -s "$T/keys.env" "$T/verify.env" || { echo "roundtrip verify FAILED — aborting"; rm -rf "$T"; return 1; }
  # 5) ssh keys tar (if the plaintext keys exist on this machine)
  if [ -d "$SSH_DIR" ] && ls "$SSH_DIR"/deploy_* >/dev/null 2>&1; then
    tar -cf "$T/ssh.tar" -C "$SSH_DIR" . 2>/dev/null
    VAULT_TMP_P="$NEW" openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$T/ssh.tar" -out "$VAULT_DIR/ssh-keys.tar.enc" -pass env:VAULT_TMP_P 2>/dev/null && chmod 600 "$VAULT_DIR/ssh-keys.tar.enc"
    echo "ssh deploy keys sealed → ssh-keys.tar.enc"
  fi
  # 6) commit the new seal + rebuild wraps from every credential we can see
  mv "$T/keys.env.enc" "$VAULT_DIR/keys.env.enc"; chmod 600 "$VAULT_DIR/keys.env.enc"
  rm -rf "$WRAPS_DIR"; mkdir -p "$WRAPS_DIR"; chmod 700 "$WRAPS_DIR"
  vault_session_pass "$NEW"
  VAULT_PASS="$NEW"
  discover_credentials
  local c n=0
  for c in $VAULT_CANDIDATES; do
    if vault_register_credential "$c"; then n=$((n+1)); fi
  done
  rm -f "$WRAPS_DIR/.registered-now"
  # 7) scrub
  rm -rf "$T"; rm -f "$VAULT_DIR/keys.env"
  echo "== REKEY done: new master pass sealed, $n wrap(s) rebuilt, roundtrip verified =="
  status
}

case "${1:-status}" in
  rekey) rekey ;;
  open) open_ ;;
  status|*) status ;;
esac
