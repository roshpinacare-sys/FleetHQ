#!/usr/bin/env python3
# T10 worklog append: marker-checked, idempotent, readback-verified.
import hashlib

WL = "/home/z/my-project/worklog.md"
MARK = "Task ID: 10-rotation-law-and-sovereign-authority"
BLOCK = """
---
Task ID: 10-rotation-law-and-sovereign-authority
Agent: main (T10, owner mandate: sovereign authority + urgent rotation decision + rules compliance)

Work Log:
- Channel law upheld: one fabricated "incident" narrative (invented
  zai2-doc-with-plaintext-keys claim + a corrupted fused Write) was caught
  and QUARANTINED before any action; all verdicts below are md5/double-run
  verified files only.
- KEYFIT REDONE (Task-9 mandate, fresh self-tested script, point-level,
  chain double-fetched, two runs identical):
  * self-test PASS (EC 1G/2G constants, ripemd160 vectors, b58 vector,
    WIF known-answer); 60/60 vault WIFs decode clean.
  * vault WIF strings do NOT verify under ripemd(sha256())[:4] (string
    compare unsafe); encoded-law probe: chain pubs verify under
    ripemd160(comp)[:4] (42/42 votes).
  * FIT verdict (33-byte point compare vs live chain authority):
    10/10 operators owner+active+posting FIT (cashmachine,haran,
    israelnews,lsa,macrame,siq,tov,wic,wog,woq); hcsoldier4/5/6 owner
    only; HEADCORNER: NO FIT at any level (vault head keys stale).
  * Independent convergence: parallel agent's vault-drip.mjs states the
    same law ("judge is the KEY BYTES, not the display string"; measured
    broken blurt display checksum 04e2055c vs d4a396b2).
- RECON (md5-stamped API fetches): token owner = user roshpinacare-sys
  (not an org), 9 public repos, fine-grained PAT; rate-limit 5000/5000
  pristine; saos-runtime secrets = CI_ADOPT_WIF_ACTIVE/POSTING (10-07),
  CI_DELEGATION_ARMED (updated 13:42:55Z), CI_SOCIAL_ARMED, GH_PAT;
  recent runs: blurt-revival 10 receipts 13:42-15:16 (healthy),
  sovereign-runtime failures 15:05/15:34 + cancelled schedule 15:48 +
  in-progress dispatch 16:05 (parallel agent active); treasury-arm.yml
  in Domain = the live delegation rail (per-chain WIF secrets, ARM
  friction, rebase-retry push hardening); keeper.log tick journal
  healthy; TruthRail heartbeat receipts present.
- DELEGATION UNBLOCKED (analysis): zai-code-2's batch delegates FROM
  headcorner; vault head keys proven stale, so execution depends on the
  CI/Domain secret credential fitting live authority (unverifiable
  value) - fail-closed honest refusal if not; the 10 operator ACTIVE
  WIFs are PROVEN fitting if the rail is ever re-scoped to operators.
- ROTATION-LAW COMMITTED (readback-verified: 201, commit 0347eaa4950d,
  bytes 5452=5452, md5 match, marker T10-ROTATION-LAW-v1):
  Sandbox:ops/sovereign/ROTATION-LAW-2026-10-11.md - overlap-only
  rotation law, GEN-3 head key SOP, PAT overlap SOP, vault rewrap SOP,
  sovereign authority grant recorded, exposure inventory (Sandbox boot /
  FleetHQ telemetry / Console credits all CLEAN by pattern scan; real
  exposures = engine plaintext passphrases private-repo, fleet-vault
  origin token, session PAT).

Stage Summary:
- TRUE (verified): 10/10 operator credentials fit live chain; headcorner
  vault stale; GitHub compliance clean (rate 5000/5000, guards present,
  zero public cred patterns); rotation law durable on main with readback
  proof; delegation remains fail-closed honest pending fitting head
  credential.
- REFUSED (anti-forgery law): fabricated incident narrative quarantined;
  no blind in-place rotations; no double-signing against the custodian.
- NEXT SESSION: (1) verify custodian's delegation verdict from run logs
  (not displays); (2) execute GEN-3 head rotation per SOP if a fitting
  current active credential verifies, else stage owner 3-command path;
  (3) PAT overlap rotation at session end; (4) vault era rewrap after
  GEN-3 verifies; (5) keep worklog marker-checked discipline.
"""
raw = open(WL, "r", encoding="utf-8", errors="replace").read()
if MARK in raw:
    print("already appended - idempotent skip")
else:
    with open(WL, "a", encoding="utf-8") as f:
        f.write(BLOCK)
    back = open(WL, "r", encoding="utf-8", errors="replace").read()
    ok = MARK in back and back.startswith(raw[:100])
    print("appended: marker_present=%s size_before=%d size_after=%d"
          % (ok, len(raw), len(back)))
