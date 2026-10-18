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

# ---------------------------------------------------------------- 0.5 steem vault
# TASK-16 (2026-10-19): the upload copies are GONE (upload/ holds pat.env only) —
# the canonical key vault is now the PRIVATE repo roshpinacare-sys/steem@main
# (.secrets/: army-keys.json · exec-armed.json · headcorner.key). This stage
# pulls them fresh on EVERY boot (wipe-proof), verifies by fingerprint
# (fail-honest), never logs contents. sha256 prefixes recorded in worklog.md
# (Task 16, 2026-10-18): 1f629a9245ca122b / 87d7d1a958dcc4b0 / 3c5ecf21d0050b83.
log "stage0.5: steem key vault from private repo (fingerprint law)"
if [ -n "${GIT_PAT:-}" ]; then
  mkdir -p /home/z/.secrets/steem
  STEEM_OK=0
  for f in army-keys.json exec-armed.json headcorner.key; do
    curl -sS -m 30 -H "Authorization: Bearer ${GIT_PAT}" \
      "https://raw.githubusercontent.com/roshpinacare-sys/steem/main/.secrets/$f" \
      -o "/home/z/.secrets/steem/$f" 2>/dev/null
    SZ=$(stat -c %s "/home/z/.secrets/steem/$f" 2>/dev/null || echo 0)
    if [ "$SZ" -gt 8 ]; then STEEM_OK=$((STEEM_OK+1)); else log "  WARN: $f fetch failed (size=$SZ) — fail-honest"; rm -f "/home/z/.secrets/steem/$f"; fi
  done
  FP=$(sha256sum /home/z/.secrets/steem/headcorner.key 2>/dev/null | cut -c1-16)
  if [ "$FP" = "3c5ecf21d0050b83" ]; then log "  headcorner.key fingerprint VERIFIED"; else log "  WARN: headcorner fingerprint mismatch ($FP) — operator gate may need upload copy (fail-honest)"; fi
  unset FP STEEM_OK SZ
  chmod 700 /home/z/.secrets/steem 2>/dev/null; chmod 600 /home/z/.secrets/steem/* 2>/dev/null
else
  log "  WARN: GIT_PAT absent — steem vault not fetched (fail-honest)"
fi

# ---------------------------------------------------------------- 1. secrets
log "stage1: secrets vault from upload copies (fingerprint law)"
mkdir -p /home/z/.secrets/keys
# EXPOSURE LAW (2026-10-13): one upload copy's FILENAME is itself an account
# handle (acct-00's posting key) — the tracked tree must stay handle-free, so
# that copy is discovered by SHAPE (the only ASCII lowercase h*.txt in upload)
# and verified by FINGERPRINT (canon sha256 prefix recorded in worklog.md,
# 2026-10-12). Never spelled, never logged; a mismatch skips the copy
# (fail-honest) instead of restoring a wrong file.
ACCT00_COPY=""
for c in "$UPLOAD"/*.txt; do
  [ -f "$c" ] || continue
  case "$(basename "$c")" in h*.txt) ACCT00_COPY="$(basename "$c")";; esac
done
if [ -n "$ACCT00_COPY" ]; then
  FP="$(sha256sum "$UPLOAD/$ACCT00_COPY" 2>/dev/null | cut -c1-16)"
  if [ "$FP" = "8ae2b7fabe235586" ]; then
    if [ ! -f "/home/z/.secrets/keys/$ACCT00_COPY" ]; then
      cp -f "$UPLOAD/$ACCT00_COPY" "/home/z/.secrets/keys/$ACCT00_COPY"
      log "  restored posting-key copy (shape-discovered, fingerprint verified)"
    fi
  else
    log "  WARN: h*.txt upload copy fingerprint mismatch ($FP) — skipped (fail-honest)"
  fi
else
  log "  WARN: posting-key upload copy not found by shape (h*.txt)"
fi
unset ACCT00_COPY FP
for f in "בלורט.evm" "Tt.txt" "בחן.txt" "הדקור.txt" "הדקור (2).txt" "קונמי.txt"; do
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
# TASK-16: prefer the upload copy; fall back to the steem vault (stage0.5) — wipe-proof.
GATE_KEYFILE="/home/z/.secrets/keys/בלורט.evm"
[ -f "$GATE_KEYFILE" ] || GATE_KEYFILE="/home/z/.secrets/steem/headcorner.key"
if [ ! -f /home/z/.operator/config.json ] && [ -f "$GATE_KEYFILE" ]; then
  KEY=$(tr -d '[:space:]' < "$GATE_KEYFILE")
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
# TASK-16: same fallback law as stage3 (upload copy → steem vault headcorner.key).
MASTER_KEYFILE="/home/z/.secrets/keys/בלורט.evm"
[ -f "$MASTER_KEYFILE" ] || MASTER_KEYFILE="/home/z/.secrets/steem/headcorner.key"
if [ ! -f "$ESTATE/.env.local" ] && [ -f "$MASTER_KEYFILE" ]; then
  KEY=$(tr -d '[:space:]' < "$MASTER_KEYFILE")
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
# WIPE-#4 LESSON (2026-10-13): a FULL clone of FleetHQ died mid-boot (receipts
# jsonl history bloats the pack; the boot OOM'd with the web app also starting).
# --filter=blob:none keeps the commit graph (ahead/behind math intact) and
# fetches blobs only for the checked-out tree — measured 20s vs death.
# Sandbox holds the organism-console feeds (ops/office/potential.json,
# ops/flow/flow-map.json, proof/out/KEY-PROOF-LATEST.json, ops/TOKEN-TRUTH.md)
# and is PRIVATE — needs GIT_PAT in the env; absent token = fail-honest warn,
# the console shows those feeds as declared-missing (never faked).
log "stage5: estate clones (public anonymous + private Sandbox via GIT_PAT)"
for r in Console Domain; do
  if [ ! -d "$ESTATE/$r/.git" ]; then
    git clone -q "$ORG/$r.git" "$ESTATE/$r" && log "  cloned $r" || log "  CLONE FAILED $r"
  else
    log "  $r present"
  fi
done
if [ ! -d "$ESTATE/FleetHQ/.git" ]; then
  git clone -q --filter=blob:none "$ORG/FleetHQ.git" "$ESTATE/FleetHQ" && log "  cloned FleetHQ (blob:none)" || log "  CLONE FAILED FleetHQ"
else
  log "  FleetHQ present"
fi
if [ ! -d "$ESTATE/Sandbox/.git" ]; then
  if [ -n "${GIT_PAT:-}" ]; then
    git clone -q --filter=blob:none "https://x-access-token:${GIT_PAT}@${ORG#https://}/Sandbox.git" "$ESTATE/Sandbox" \
      && git -C "$ESTATE/Sandbox" remote set-url origin "$ORG/Sandbox.git" \
      && log "  cloned Sandbox (private; token stripped from remote after clone)" \
      || log "  CLONE FAILED Sandbox (check GIT_PAT scope)"
  else
    log "  WARN: Sandbox NOT cloned — GIT_PAT absent in env; organism-console feeds will show declared-missing (fail-honest)"
  fi
else
  log "  Sandbox present"
fi

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

# econ-engine — the economy's single writer (Task 6, 2026-10-16). Measured:
# every econ-engine instance spawned from an interactive shell died within
# ~2-5min (platform session-reaping; setsid/nohup/watchdog did not survive —
# 7 silent deaths), while BOOT-SESSION processes (local-beats 08:47, engine
# 11:55→14:14) lived for hours. Law: the engine must be born from the boot
# session. CWD-probe identity (the local-beats lesson: cmdline strings lie),
# watchdog loop for self-heal, single canonical chain lives in the SANDBOX
# submodule (estate worktree churn kills residents — measured).
EE_DIR="/home/z/my-project/t19b/Domain"
EE_PID=""
for p in $(pgrep -f "econ-engine.cjs" 2>/dev/null); do
  if [ "$(readlink -f "/proc/$p/cwd" 2>/dev/null)" = "$EE_DIR" ]; then EE_PID=$p; break; fi
done
if [ -n "$EE_PID" ]; then
  log "  econ-engine already running (pid $EE_PID)"
else
  # Task 7 (2026-10-16): the fleet sources (rig journal / guard events / FleetHQ
  # git cadence) are REAL measured work on THIS host — the engine must settle
  # them (owner mandate Task 59: scale). Without ECON_FLEET_ROOT they skip
  # honestly (cloud-safe), but on the host that meant silent under-settlement;
  # the resurrected engine's state src-map proves past instances ran WITH them.
  # Measured mint rate ~40k tx/h — the sbx-seal lane (local-beats, 4x/h) commits
  # the chain to origin/Domain; the engine's own 30MB rotation (GH001) bounds it.
  export ECON_FLEET_ROOT=/home/z/my-project
  nohup bash -c "cd $EE_DIR && while true; do node agents/econ-engine.cjs --loop 60; echo \"[boot-watchdog] exited code=\$? at \$(date -u +%H:%M:%SZ)\" >> /tmp/econ-engine.log; sleep 3; done" >> /tmp/econ-engine.log 2>&1 < /dev/null &
  log "  econ-engine started (boot-session, single-writer sandbox law, fleet sources ON)"
fi

# shift-history — the office's operational-log transcriptor (task 27-b, wipe-#4
# law: a STANDING service, not a UI-dependent one). Before this it was only
# plantable by /api/foreman/health — which (a) nobody may poll for hours and
# (b) planted hardcoded /home/z/my-project paths, so every spawn was born dead
# and the office history froze 2026-10-10→13 (owner saw "0 shifts"). It
# compiles receipts/shift-history-latest.md + history.jsonl + state.json every
# 60s from the live office journal (Domain/agents/office-events.jsonl).
# Identity probe by CWD (the local-beats lesson: cmdline strings lie).
SH_DIR="$ESTATE/FleetHQ/mini-services/agent-hq/tools"
SH_PID=""
for p in $(pgrep -f "shift-history.ts" 2>/dev/null); do
  if [ "$(readlink -f "/proc/$p/cwd" 2>/dev/null)" = "$ESTATE/FleetHQ" ]; then SH_PID=$p; break; fi
done
if [ -n "$SH_PID" ]; then
  log "  shift-history already running (pid $SH_PID)"
else
  nohup env AGENT_HQ_FLEET_DIR="$ESTATE/FleetHQ" AGENT_HQ_DATA_DIR="$ESTATE/Domain" \
    bun "$SH_DIR/shift-history.ts" >> /tmp/boot-shift-history.log 2>&1 &
  log "  shift-history started"
fi

# ---------------------------------------------------------------- 8. verdict
log "stage8: verdict"
UP=""
for p in 3002 3010 3040 3041 3042 3011; do
  (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && UP="$UP $p" || UP="$UP !$p"
done
echo "$UP" > /tmp/boot-ports-verdict.txt
log "ports:$UP"

# ---------------------------------------------------------------- 9. git-health
# Repo-level vitals: attached HEAD (a wipe-recovery clone must never come back
# detached — the 25-d twin-race class), ahead/behind vs origin/main after a
# real fetch, bounded fsck. NON-FATAL BY LAW: a red verdict must never block
# the boot — the receipt (receipts/git-health.json) and the watchdog speak.
# Idempotent: pure measurement, safe on every re-run.
log "stage9: git-health (attached-HEAD assert + divergence + bounded fsck)"
(
  set +e
  node "$ESTATE/FleetHQ/tools/git-health.mjs" "$ESTATE" >> /tmp/boot-git-health.log 2>&1
  rc=$?
  [ $rc -ne 0 ] && log "  git-health rc=$rc (non-fatal — see /tmp/boot-git-health.log + receipts/git-health.json)"
  exit 0
)
log "DONE — verify with: curl -s :3002/api/veritas | jq .aggregate"
