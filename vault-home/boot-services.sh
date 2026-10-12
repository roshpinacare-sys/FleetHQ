#!/usr/bin/env bash
# estate-bootstrap — THE WIPE-RECOVERY LAW, EXECUTED.
#
# WHY THIS EXISTS (measured, three times: 2026-10-12 ~11:00, ~15:20, ~19:00):
# the operator sandbox is ephemeral. Every wipe destroys /home/z/estate,
# /home/z/.secrets, /home/z/.operator, /home/z/.gitcred and /tmp — while
# /home/z/my-project survives. Git holds all code+receipts (push discipline);
# the owner's own upload copies in /home/z/my-project/upload hold the
# credentials (verified by sha256 fingerprints recorded in worklog.md).
# This script rebuilds the WHOLE organism from those two sources, idempotently,
# in minutes. It contains ZERO secret material — only paths and derivations.
#
# LAW: this file is COMMITTED to FleetHQ. A boot script that lives only in
# the working tree dies with the working tree. Never again.
#
# Usage: bash vault-home/boot-services.sh [--install]   (install = bun install too)
set -u

ESTATE=/home/z/estate
UPLOAD=/home/z/my-project/upload
ORG=https://github.com/roshpinacare-sys
INSTALL=0
[ "${1:-}" = "--install" ] && INSTALL=1

log(){ echo "[boot $(date -u +%H:%M:%S)] $*"; }

# ---------------------------------------------------------------- 1. secrets
log "stage1: secrets vault from upload copies (fingerprint law)"
mkdir -p /home/z/.secrets/keys
for f in "בלורט.evm" "headcorner.txt" "Tt.txt" "בחן.txt" "הדקור.txt" "הדקור (2).txt" "קונמי.txt"; do
  if [ -f "$UPLOAD/$f" ]; then
    if [ ! -f "/home/z/.secrets/keys/$f" ]; then
      cp -f "$UPLOAD/$f" "/home/z/.secrets/keys/$f"
      log "  restored $f"
    fi
  else
    log "  WARN: upload copy missing: $f"
  fi
done
chmod 700 /home/z/.secrets /home/z/.secrets/keys 2>/dev/null
chmod 600 /home/z/.secrets/keys/* 2>/dev/null

# ---------------------------------------------------------------- 2. gitcred
log "stage2: git credential helper (push needs GIT_PAT in env; clone is anonymous-public)"
mkdir -p /home/z/.gitcred
cat > /home/z/.gitcred/askpass.sh <<'EOF'
#!/bin/sh
case "$1" in
  Username*) echo "x-access-token" ;;
  Password*) echo "${GIT_PAT:-}" ;;
  *) echo ;;
esac
EOF
chmod 700 /home/z/.gitcred/askpass.sh

# ---------------------------------------------------------------- 3. operator gate
# Gate format (FleetHQ src/app/api/operator/unlock/route.ts): sha256(salt + key).
# The key itself lives only in the vault copy; the config holds salt+hash only.
log "stage3: operator gate config (salt regenerated, same credential unlocks)"
mkdir -p /home/z/.operator
if [ ! -f /home/z/.operator/config.json ]; then
  KEY=$(tr -d '[:space:]' < "/home/z/.secrets/keys/בלורט.evm")
  SALT=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
  HASH=$(printf '%s' "$SALT$KEY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(require('crypto').createHash('sha256').update(d).digest('hex')))")
  node -e "console.log(JSON.stringify({salt:process.argv[1],hash:process.argv[2]}))" "$SALT" "$HASH" > /home/z/.operator/config.json
  unset KEY SALT HASH
  log "  config.json written"
else
  log "  config.json already present (kept)"
fi
chmod 700 /home/z/.operator 2>/dev/null; chmod 600 /home/z/.operator/config.json 2>/dev/null

# ---------------------------------------------------------------- 4. estate env
log "stage4: /home/z/estate/.env.local (master credential from vault copy)"
mkdir -p "$ESTATE"
if [ ! -f "$ESTATE/.env.local" ]; then
  KEY=$(tr -d '[:space:]' < "/home/z/.secrets/keys/בלורט.evm")
  { echo "HEAD_CORNER_MASTER=$KEY"
    [ -n "${GIT_PAT:-}" ] && echo "GITHUB_PAT=$GIT_PAT"
  } > "$ESTATE/.env.local"
  unset KEY
  log "  .env.local written"
else
  log "  .env.local already present (kept)"
fi
chmod 600 "$ESTATE/.env.local" 2>/dev/null

# ---------------------------------------------------------------- 4.5 roster map
# The beats run OUTSIDE Actions, so the FLEET_ROSTER_MAP secret is absent;
# refs.mjs falls back to the untracked local map (agents/.roster-map.local.json).
# That file is untracked BY LAW (exposure), so a wipe destroys it — rebuild it
# at boot from Console git history (the pre-refs-sweep commit 36dca9f0 carries
# the original literal; the sweep itself guarantees zero names at HEAD).
# Measured 2026-10-12: without this, money-watch/grid-pulse/key-verify all
# exit "roster-unresolved" and money.json never refreshes (veritas red).
log "stage4.5: roster map (untracked by law — rebuilt from Console git history if missing)"
if [ -d "$ESTATE/Console/.git" ] && [ ! -f "$ESTATE/Console/agents/.roster-map.local.json" ]; then
  NAME=$(git -C "$ESTATE/Console" show 36dca9f0:agents/money-watch.mjs 2>/dev/null | grep -o 'const STEEM_ACCOUNT = "[^"]*"' | head -1 | sed 's/.*"\(.*\)"/\1/')
  if [ -n "$NAME" ]; then
    printf '{"refs":{"acct-00":"%s"}}\n' "$NAME" > "$ESTATE/Console/agents/.roster-map.local.json"
    chmod 600 "$ESTATE/Console/agents/.roster-map.local.json"
    log "  roster map rebuilt (acct-00 resolved from history; value never logged)"
  else
    log "  WARN: acct-00 not derivable from Console history — money-watch will fail-honest (roster-unresolved)"
  fi
  unset NAME
else
  log "  roster map present (or Console not cloned yet)"
fi

# ---------------------------------------------------------------- 5. clones
log "stage5: estate clones (public repos — anonymous)"
for r in Console Domain FleetHQ; do
  if [ ! -d "$ESTATE/$r/.git" ]; then
    git clone -q "$ORG/$r.git" "$ESTATE/$r" && log "  cloned $r" || log "  CLONE FAILED $r"
  else
    log "  $r present"
  fi
done

# ---------------------------------------------------------------- 6. installs
if [ "$INSTALL" = "1" ]; then
  log "stage6: bun install (FleetHQ root + agent-hq)"
  (cd "$ESTATE/FleetHQ" && bun install >/tmp/boot-install-root.log 2>&1) && log "  FleetHQ root ok" || log "  FleetHQ root install FAILED (see /tmp/boot-install-root.log)"
  (cd "$ESTATE/FleetHQ/mini-services/agent-hq" && bun install >/tmp/boot-install-hq.log 2>&1) && log "  agent-hq ok" || log "  agent-hq install FAILED (see /tmp/boot-install-hq.log)"
else
  log "stage6: skipped (--install not passed; node_modules assumed)"
fi

# ---------------------------------------------------------------- 7. services
# Each: (port probe) → start detached → wait for probe. One instance per port.
wait_port(){ # wait_port <port> <tries>
  for i in $(seq 1 "${2:-20}"); do
    (echo > /dev/tcp/127.0.0.1/"$1") 2>/dev/null && return 0
    sleep 2
  done
  return 1
}
ensure(){ # ensure <name> <port> <logfile> <cmd...>
  if (echo > /dev/tcp/127.0.0.1/"$2") 2>/dev/null; then log "  $1 already up :$2"; return 0; fi
  nohup "${@:4}" > "$3" 2>&1 &
  if wait_port "$2" 25; then log "  $1 UP :$2"; else log "  $1 FAILED to bind :$2 (log $3)"; fi
}

log "stage7: services"
# FleetHQ web app (operator gate + veritas + office pages)
ensure fleethq-app 3002 /tmp/boot-fleethq-app.log env NEXT_TELEMETRY_DISABLED=1 bash -c "cd $ESTATE/FleetHQ && bunx next dev -p 3002"
# foreman (agent-hq) — THE 2026-10-12 FIX: AGENT_HQ_FLEET_DIR must be present
# or the office boots demo-mode and the mirror/veritas freeze (root cause #1).
ensure foreman 3010 /tmp/boot-foreman.log env \
  AGENT_HQ_PORT=3010 \
  AGENT_HQ_DATA_DIR="$ESTATE/Domain" \
  AGENT_HQ_FLEET_DIR="$ESTATE/FleetHQ" \
  bash -c "cd $ESTATE/FleetHQ/mini-services/agent-hq && bun run dev"
# office-selfcheck — standing loop: boots app+foreman if down, security suite,
# connectivity audit, fresh oracle, receipts push every 30min
ensure selfcheck 3040 /tmp/boot-selfcheck.log env \
  SELFCHECK_PORT=3040 \
  FLEETHQ_DIR="$ESTATE/FleetHQ" \
  OFFICE_APP_PORT=3002 \
  FOREMAN_PORT=3010 \
  REAL_BOOKS_DIR="$ESTATE/Domain" \
  bash -c "cd $ESTATE/FleetHQ/mini-services/office-selfcheck && bun run dev"
# recruit + boot-verifier + sovereign gateway + beats scheduler
ensure recruit 3041 /tmp/boot-recruit.log bash -c "cd $ESTATE/FleetHQ/mini-services/office-recruit && bun run dev"
ensure boot-verifier 3042 /tmp/boot-bootverifier.log bash -c "cd $ESTATE/FleetHQ/mini-services/boot-verifier && bun run dev"
ensure sovereign-gateway 3011 /tmp/boot-gateway.log bash -c "cd $ESTATE/FleetHQ/mini-services/sovereign-gateway && bun run dev"
# local-beats has NO HTTP port (it is a setInterval scheduler, not a server) —
# probe by PROCESS IDENTITY, not port. Measured 2026-10-12 (bug 25-a): the old
# probe was `pgrep -f "local-beats"`, but the live scheduler's cmdline is
# `bun run dev` / `bun --hot index.ts` (bash exec-optimization drops the
# directory string) — pgrep NEVER matched, so EVERY boot respawned it and
# repeated boots piled up ~20 scheduler instances firing beats 10x a minute.
# Fix: match the bun process whose CWD is the local-beats dir.
LB_DIR="$ESTATE/FleetHQ/mini-services/local-beats"
LB_PID=""
for p in $(pgrep -f "bun" 2>/dev/null); do
  if [ "$(readlink -f "/proc/$p/cwd" 2>/dev/null)" = "$LB_DIR" ]; then LB_PID=$p; break; fi
done
if [ -n "$LB_PID" ]; then
  log "  local-beats already running (pid $LB_PID)"
else
  nohup bash -c "cd $LB_DIR && bun run dev" > /tmp/boot-localbeats.log 2>&1 &
  log "  local-beats started"
fi

# ---------------------------------------------------------------- 8. verdict
log "stage8: verdict"
UP=""
for p in 3002 3010 3040 3041 3042 3011; do
  (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && UP="$UP $p" || UP="$UP !$p"
done
echo "$UP" > /tmp/boot-ports-verdict.txt
log "ports:$UP"
log "DONE — verify with: curl -s :3002/api/veritas | jq .aggregate"
