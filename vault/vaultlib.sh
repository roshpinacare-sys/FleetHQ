#!/usr/bin/env bash
# ============================================================================
# FLEET VAULT LIB — credential discovery + passphrase unwrap (sovereign core)
# ----------------------------------------------------------------------------
# The trust model (SOVEREIGNTY v2 — the vault owns itself):
#
#   P (random master passphrase) seals: keys.env.enc + ssh-keys.tar.enc
#   P never equals any credential; it travels ONLY as WRAPS:
#       vault/wraps/<sha256(C)>.enc = openssl(P, key=sha256hex(C))
#
#   Any machine that holds ANY registered credential C can:
#     pull the private vault repo → unwrap P via its wrap → open everything.
#   Registered credentials so far (managed automatically by boot-sovereign.sh):
#     · the operator's GitHub PAT (Tier 2 anchor)
#     · the fleet-vault SSH deploy key (Tier 1 anchor — never expires)
#   A booted machine auto-registers its own working credential → the wrap set
#   self-extends with every legitimate boot. No plaintext secret ever in git.
#
# Every function prints NOTHING secret. Candidates/wraps are consumed silently.
# ============================================================================

VAULT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT_DIR="$VAULT_ROOT/vault"
WRAPS_DIR="$VAULT_DIR/wraps"
SSH_DIR="$VAULT_DIR/ssh"
SESSION_PASS="$VAULT_DIR/.session-pass"
VAULT_REPO="${VAULT_PRIVATE_REPO:-roshpinacare-sys/fleet-vault}"

# --- credential discovery ----------------------------------------------------
# Collect candidate GitHub credentials in the order a platform/owner might
# provide them. Output is a newline list in VAULT_CANDIDATES (global).
discover_credentials() {
  VAULT_CANDIDATES=""
  local c
  for c in "${VAULT_GH_TOKEN:-}" "${GITHUB_TOKEN:-}" "${GH_TOKEN:-}" "${GITHUB_PAT:-}" "${INPUT_GITHUB_TOKEN:-}"; do
    [ -n "$c" ] && add_candidate "$c"
  done
  if [ -f "$VAULT_ROOT/upload/pat.env" ]; then
    c="$(awk '{ if (length($0) > m) { m = length($0); l = $0 } } END { print l }' "$VAULT_ROOT/upload/pat.env")"
    [ -n "$c" ] && add_candidate "$c"
  fi
  if [ -f "$HOME/.git-credentials" ]; then
    c="$(awk -F'[/:@]' '/github\.com/ { for (i=1;i<=NF;i++) if ($i ~ /^[A-Za-z0-9_-]{20,}$/) { print $i; exit } }' "$HOME/.git-credentials")"
    [ -n "$c" ] && add_candidate "$c"
  fi
  if [ -f "$HOME/.netrc" ]; then
    c="$(awk '/github\.com/ { getline; if ($1=="login") { getline; if ($1=="password") print $2 } }' "$HOME/.netrc")"
    [ -n "$c" ] && add_candidate "$c"
  fi
  if command -v gh >/dev/null 2>&1; then
    c="$(gh auth token 2>/dev/null)"; [ -n "$c" ] && add_candidate "$c"
  fi
  # Tier 1 anchor: the never-expiring fleet-vault SSH deploy key — a machine
  # holding it can pull the private repo AND unwrap its dedicated wrap.
  # SECURITY: credentials MUST be single-line (candidates iterate line-wise);
  # file-based credentials enter as their sha256 DIGEST, never raw content.
  if [ -f "$SSH_DIR/deploy_fleet-vault" ]; then
    c="$(sha_hex "$(cat "$SSH_DIR/deploy_fleet-vault")")"
    [ -n "$c" ] && add_candidate "$c"
  fi
  # git credential helper (platform-managed stores land here)
  if [ -z "$VAULT_CANDIDATES" ] && command -v git >/dev/null 2>&1; then
    c="$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | awk -F= '$1=="password" {print $2}')"
    [ -n "$c" ] && add_candidate "$c"
  fi
}
add_candidate() { # dedupe, keep order; REJECT multiline/degenerate entries
  case "$1" in
    *$'\n'*|*$'\r'*) return 1 ;;
  esac
  [ "${#1}" -ge 20 ] || return 1
  case "
$VAULT_CANDIDATES" in
    *"
$1"*) return 0 ;;
  esac
  VAULT_CANDIDATES="${VAULT_CANDIDATES}${1}
"
}

sha_hex() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

# --- pull the freshest sealed vault from the private repo ---------------------
# Tries HTTPS with each candidate, then SSH deploy key (shim, no ssh binary
# needed). Uses FETCH when the repo already exists locally (keeps local seal
# authority — clone only into a scratch dir when absent).
vault_repo_pull() {
  local dst="$1" mode="${2:-fetch}" ok="" c
  discover_credentials
  if [ -d "$dst/.git" ] && [ "$mode" = "fetch" ]; then
    for c in $VAULT_CANDIDATES; do
      if (cd "$dst" && git -c credential.helper= fetch -q "https://x-access-token:${c}@github.com/${VAULT_REPO}.git" '+refs/heads/*:refs/remotes/origin/*' 2>/dev/null); then ok="$c"; break; fi
    done
  else
    local tmp; tmp="$(mktemp -d)"
    for c in $VAULT_CANDIDATES; do
      if git clone -q --depth 1 "https://x-access-token:${c}@github.com/${VAULT_REPO}.git" "$tmp" 2>/dev/null; then ok="$c"; break; fi
    done
    if [ -z "$ok" ] && [ -f "$SSH_DIR/deploy_fleet-vault" ]; then
      if GIT_SSH_COMMAND="bun $VAULT_ROOT/vault/ssh/tool/git-ssh-shim.mjs" SOVEREIGN_SSH_DIR="$SSH_DIR" \
         git clone -q --depth 1 "git@github.com:${VAULT_REPO}.git" "$tmp" 2>/dev/null; then ok="ssh-deploy-key"; fi
    fi
    if [ -n "$ok" ]; then rm -rf "$dst"; mv "$tmp" "$dst"; fi
  fi
  [ -n "$ok" ] || return 1
  VAULT_PULL_CRED="$ok"
  return 0
}

# --- unwrap the master passphrase P ------------------------------------------
# Order: session pass → wraps × candidates → legacy (pass==credential, the
# pre-2026-10-09 seal format). On success: VAULT_PASS (global), exit 0.
vault_unwrap() {
  VAULT_PASS=""
  if [ -s "$SESSION_PASS" ]; then VAULT_PASS="$(cat "$SESSION_PASS")"; return 0; fi
  [ -f "$VAULT_DIR/keys.env.enc" ] || return 1
  discover_credentials
  local c w tmp p
  # 1) wrap files (sha256-keyed)
  if [ -d "$WRAPS_DIR" ]; then
    for c in $VAULT_CANDIDATES; do
      for w in "$WRAPS_DIR"/*.enc; do
        [ -f "$w" ] || continue
        p="$(sha_hex "$c")"
        tmp="$(mktemp)"
        if VAULT_TMP_P="$p" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$w" -out "$tmp" -pass env:VAULT_TMP_P 2>/dev/null; then
          VAULT_PASS="$(cat "$tmp")"; rm -f "$tmp"
          [ -n "$VAULT_PASS" ] && { vault_session_pass "$VAULT_PASS"; return 0; }
        fi
        rm -f "$tmp"
      done
    done
  fi
  # 2) legacy seals: passphrase == the credential itself
  for c in $VAULT_CANDIDATES; do
    tmp="$(mktemp)"
    if VAULT_TMP_P="$c" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$VAULT_DIR/keys.env.enc" -out "$tmp" -pass env:VAULT_TMP_P 2>/dev/null; then
      # legacy mode: P *is* the credential (old world) — adopt as session pass
      VAULT_PASS="$c"; rm -f "$tmp"
      vault_session_pass "$VAULT_PASS"; return 0
    fi
    rm -f "$tmp"
  done
  return 1
}

vault_session_pass() { printf '%s' "$1" > "$SESSION_PASS"; chmod 600 "$SESSION_PASS"; }
vault_forget_pass() { rm -f "$SESSION_PASS"; }

# --- register a NEW credential as a wrap (self-extending trust) ---------------
vault_register_credential() {
  local c="$1" p h w tmp
  [ -n "$c" ] || return 1
  [ -n "$VAULT_PASS" ] || return 1
  mkdir -p "$WRAPS_DIR"; chmod 700 "$WRAPS_DIR"
  h="$(sha_hex "$c")"; w="$WRAPS_DIR/$h.enc"
  [ -f "$w" ] && return 0 # already registered
  p="$(sha_hex "$c")"
  tmp="$(mktemp)"
  VAULT_TMP_P="$p" VAULT_TMP_S="$VAULT_PASS" bash -c 'printf "%s" "$VAULT_TMP_S" | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -out "$1" -pass env:VAULT_TMP_P' bash "$tmp" 2>/dev/null || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$w"; chmod 600 "$w"
  printf '%s\n' "$h" > "$WRAPS_DIR/.registered-now" # marker for boot reporting
  return 0
}

# --- fresh random master passphrase ------------------------------------------
vault_new_pass() { openssl rand -base64 48 | tr -d '\n'; }
