# Hands Book — the sovereignty's execution surfaces, probed (Z-43)

_hands-book v1.0.0 · 2026-10-12T12:28:26.003Z · cua-pattern adoption (probe-before-trust · permission-at-launch · action ladder)_

**hands green: 3 LIVE (receipted) · 1 ABSENT (honest) · 1 cross-ref · 3 tier-C locks — surfaces probed, never claimed**

| Hand | Surface | Verdict | Evidence |
|---|---|---|---|
| H1 shell-exec | bash + node + bun process execution | LIVE | bash -lc echo → exit 0, stdout matched |
| H2 git-rail | authenticated git fetch/push over the embedded remote creds | LIVE | git ls-remote origin/main → exit 0 (auth rail serves, creds never printed) |
| H3 browser-gui | agent-browser CLI computer-use (open/snapshot/screenshot) | ABSENT | agent-browser CLI absent in this context (honest CI answer — the hand exists as a pattern, not here) |
| H4 web-keyless | keyless public HTTP(S) fetch (reads, public data only) | LIVE | GET https://example.com → HTTP 200 (keyless) |
| H5 vm-container-stack | docker/podman/qemu/gvisor/VMX — the VM-sandbox runtime class | UNREACHABLE | docker/podman/qemu/runsc: present:docker,podman · cpu vmx/svm: yes — cua's Lume/VM runtime class does not exist in this sandbox (measured 20 |
| H6 inference-rails | LLM/VLM/TTS/ASR rails — owned canon: rail-ledger.json | REF | cross-ref agents/rail-ledger.json (one canon per question — this desk does not duplicate the rail desk): ledger stamped 2026-10-12T12:28:17Z |

**Tier-C policy locks (decided by law, not probes):**
- **LK1 cloud computer-use fleets (cua Fleet class):** new external account + key = tier C, operator gate (sovereignty §3); the pattern is adopted, the vendor is not
- **LK2 new API keys / key rotation / fuel pacing:** tier C — operator-only, never self-served
- **LK3 cross-chain execution surfaces:** execution-surface law: real money movement stays inside Hive/hive-engine/Blurt; bridges are reads, never writes

_cua (trycua/cua) lesson adopted: an agent's power is exactly its probed, receipted surfaces — everything else is theater._
