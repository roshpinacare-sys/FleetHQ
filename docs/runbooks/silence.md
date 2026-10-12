# Runbook: silence (a voice of the organism stopped)

The organism speaks through many voices: repos, services, beats, network
posts, the live site. Silence is measured, never assumed. This page is the
first response when the silence alarm fires.

## Trigger

- Issue titled "SILENCE ALARM" open in roshpinacare-sys/FleetHQ, updated by
  silence-watchdog every 15 minutes.
- receipts/silence-watchdog.json carries `verdict: SILENT-ALARM` or
  `no-data` on any voice.
- Any voice silent past its maxSilenceMin in receipts/silence-ledger.json.

## First diagnostics (in order, all read-only)

1. `cat receipts/silence-watchdog.json | jq .summary` — which voices, which ages.
2. `cat receipts/silence-ledger.json | jq .summary` — the inside-the-box view.
3. `tail -50 /tmp/local-beats.log` — last beat fires and their exit codes.
4. Port sweep: `for p in 3002 3010 3040 3041 3042 3011; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "$p up" || echo "$p DOWN"; done`
5. `curl -s :3002/api/veritas | jq .aggregate` — the truth aggregate.
6. Origin ages: `for r in Console Domain FleetHQ; do git -C /home/z/estate/$r log -1 --format="%cI $r"; done`

## Decision tree

CONTAIN
- Sandbox dead (no ports, no beats, /tmp empty): the box was wiped. The
  organism is designed to survive this. Do not hunt losses locally — the
  estate rebuilds in ~20s from git plus the vault. Run
  `bash /home/z/estate/FleetHQ/vault-home/boot-services.sh --install`.
- One service down: boot-services.sh is idempotent, it starts only what is
  down and records the pid.
- One beat silent: read its last line in /tmp/local-beats.log. An
  "exit=0 out=roster-unresolved" line means the beat ran and did nothing —
  check the roster map first (see the veritas-stale runbook).

REPAIR
- Rebuild from boot-services.sh, never by hand-spawning services: the script
  carries the env wiring (AGENT_HQ_FLEET_DIR and friends) that a manual
  `bun run dev` loses.
- After repair, watch one full beat cycle before declaring recovery. A beat
  that fired once at boot-catchup is not yet a recovered voice.

VERIFY
- `cat receipts/silence-ledger.json | jq .summary` reads "ALL VOICES ALIVE".
- The SILENCE ALARM issue closes itself on the next watchdog flight after
  recovery. A manually closed issue that reopens is a real regression.

## Escalation

- If the alarm cannot be cleared within one watchdog hour, append the
  measured state (summary lines only, never logs with credential material)
  to the open issue. Title prefix stays "SILENCE ALARM".
- If the issue itself stops updating for 30+ minutes while other repos
  commit, the watchdog is the dead voice. Escalate by opening an issue with
  title prefix "WATCHDOG-DOWN" and attach receipts/silence-watchdog.json.

## Known past incidents

- 2026-10-12 ~19:00Z, wipe #3: /home/z/estate, /home/z/.secrets,
  /home/z/.gitcred and /tmp destroyed. Every local voice died at once. The
  Actions side kept committing (sovereign cycle every ~18 minutes) — the
  console read local state and showed death while the network lived. The
  quiet was the sandbox, not the organism.
- Same day, 25-a: money-watch "ran" green (exit=0) every flight while doing
  nothing — roster-unresolved. An exit code is not a verdict; the receipt is.
