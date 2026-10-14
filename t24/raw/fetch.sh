#!/bin/bash
# double-fetch with md5 + timestamps, honest staleness
fetch2() {
  local name="$1"; local url="$2"
  local t1=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  curl -s --max-time 25 -o "/home/z/my-project/t24/raw/${name}.1" "$url"
  local t2=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  curl -s --max-time 25 -o "/home/z/my-project/t24/raw/${name}.2" "$url"
  local m1=$(md5sum "/home/z/my-project/t24/raw/${name}.1" | cut -d' ' -f1)
  local m2=$(md5sum "/home/z/my-project/t24/raw/${name}.2" | cut -d' ' -f1)
  local sz=$(stat -c%s "/home/z/my-project/t24/raw/${name}.1" 2>/dev/null || echo 0)
  if [ "$m1" = "$m2" ]; then stab="STABLE"; else stab="UNSTABLE"; fi
  echo "$name|$t1|$t2|$m1|$m2|$stab|$sz|$url"
}
fetch2 world-state "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/world-state.json"
fetch2 world-journal "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/world-journal.jsonl"
fetch2 queue "https://raw.githubusercontent.com/roshpinacare-sys/ops-intake/main/ops/QUEUE.json"
fetch2 receipts "https://raw.githubusercontent.com/roshpinacare-sys/ops-forge/main/ops/RECEIPTS.jsonl"
fetch2 selfhood-journal "https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/state/selfhood/journal.jsonl"
fetch2 fleet-health "https://raw.githubusercontent.com/roshpinacare-sys/GridWatch/main/state/fleet-health.json"
fetch2 claims "https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/state/selfhood/claims.jsonl"
fetch2 fhq-office-state "https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office-state.json"
fetch2 fhq-office-state2 "https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office/state.json"
fetch2 fhq-foreman-state "https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/foreman/state.json"
