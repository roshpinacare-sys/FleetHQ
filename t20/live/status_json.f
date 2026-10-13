{
 "schema": "saos/grid-status/1",
 "generatedAt": "2026-10-12T22:19:17.389Z",
 "pulse": {
  "beatArteries": 40,
  "totalArteries": 265,
  "repos": 32
 },
 "summary": {
  "ALIVE": 28,
  "STALE": 1,
  "IDLE": 3
 },
 "teeth": {
  "reEnabled": [],
  "reLit": [
   {
    "repo": "Domain",
    "wf": "artery-integrity-twin.yml",
    "ok": true,
    "err": null
   },
   {
    "repo": "Domain",
    "wf": "office-artery.yml",
    "ok": true,
    "err": null
   },
   {
    "repo": "Domain",
    "wf": "office-pulse.yml",
    "ok": true,
    "err": null
   }
  ],
  "issue": "updated#22(ok)"
 },
 "apiCalls": 68,
 "repos": [
  {
   "repo": "Adsmarket",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "claims-guard.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9294,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9294,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "anchor-baseline",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "baseline-integrity.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "conformance-selftest.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9289,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9289,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "Autonomy",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "artery-catchup.yml",
     "v": "BEAT",
     "last": 15,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "artery-decision-truth.yml",
     "v": "WARM",
     "last": 63,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "artery-fleet.yml",
     "v": "WARM",
     "last": 99,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-flow.yml",
     "v": "WARM",
     "last": 99,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-grid.yml",
     "v": "WARM",
     "last": 99,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-integrity.yml",
     "v": "WARM",
     "last": 99,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "artery-participation.yml",
     "v": "WARM",
     "last": 63,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "artery-scribe.yml",
     "v": "WARM",
     "last": 99,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "artery-wallet.yml",
     "v": "WARM",
     "last": 85,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-watch.yml",
     "v": "BEAT",
     "last": 15,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "evo-windows-staleness.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "federation.yml",
     "v": "BEAT",
     "last": 15,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "fleet-heal.yml",
     "v": "BEAT",
     "last": 15,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "fleet-yield.yml",
     "v": "WARM",
     "last": 63,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "fresh-oracle.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "hive-probe.yml",
     "v": "BEAT",
     "last": 15,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "key-proof.yml",
     "v": "WARM",
     "last": 63,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "office-growth.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "profit-oracle.yml",
     "v": "WARM",
     "last": 63,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "research-lane.yml",
     "v": "WARM",
     "last": 52,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "retro.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "sovereign-decider.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "sovereign-state.yml",
     "v": "RUNNING",
     "last": 1,
     "concl": null,
     "st": "active"
    },
    {
     "p": "sovereign.yml",
     "v": "BEAT",
     "last": 15,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "token-watchdog.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "value-scan.yml",
     "v": "WARM",
     "last": 63,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "verifier.yml",
     "v": "BEAT",
     "last": 15,
     "concl": null,
     "st": "active"
    }
   ]
  },
  {
   "repo": "Console",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "agent-verify.yml",
     "v": "COOL",
     "last": 232,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "agents-watch.yml",
     "v": "COOL",
     "last": 378,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "chain-vitals.yml",
     "v": "COOL",
     "last": 362,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "console-publish.yml",
     "v": "COOL",
     "last": 375,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "dex-watch.yml",
     "v": "COOL",
     "last": 391,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "estate-scrub.yml",
     "v": "WARM",
     "last": 90,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "fee-law.yml",
     "v": "COOL",
     "last": 374,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "giants-beat.yml",
     "v": "COOL",
     "last": 556,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "grid-pulse.yml",
     "v": "COOL",
     "last": 688,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "key-verify.yml",
     "v": "BEAT",
     "last": 15,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "line-agreement.yml",
     "v": "WARM",
     "last": 147,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "money-watch.yml",
     "v": "COOL",
     "last": 307,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "pnl-desk.yml",
     "v": "COOL",
     "last": 532,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "rea-desk.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "trigger-mesh.yml",
     "v": "COOL",
     "last": 375,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "truth-gate.yml",
     "v": "COOL",
     "last": 423,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "weave-census.yml",
     "v": "WARM",
     "last": 90,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "dynamic/pages/pages-build-deployment",
     "v": "BEAT",
     "last": 13,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "Defi",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "canary.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9269,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9269,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "Domain",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "adsmarket-panel.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "agent-verify.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "anchor-execute.yml",
     "v": "WARM",
     "last": 37,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "arb-mesh-cron.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-integrity-twin.yml",
     "v": "RE-LIT",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "audience-analyst.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "blurt-connect.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "book-audit.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "bootstrap-pages.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "canary.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "cloud-heart.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "cloud-pulse.yml",
     "v": "BEAT",
     "last": 28,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "cognition-beat.yml",
     "v": "WARM",
     "last": 42,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "content-campaign.yml",
     "v": "RUNNING",
     "last": 37,
     "concl": null,
     "st": "active"
    },
    {
     "p": "content-gate.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "content-reviewer.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "content-truth-wave.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "daily-claim.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "daily-digest.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "dex-beat.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "dex-core-cron.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "dex-grid.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "dex-mirror.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "dex-router-cron.yml",
     "v": "WARM",
     "last": 42,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "dex-xc-cron.yml",
     "v": "WARM",
     "last": 56,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "earn-audit-cron.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "econ-desk.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "economy-engine.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "estate-scrub.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "evo-windows.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "exposure-gate.yml",
     "v": "BEAT",
     "last": 1,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "fill-ledger-cron.yml",
     "v": "WARM",
     "last": 42,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "fleet-census-cron.yml",
     "v": "WARM",
     "last": 56,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "foundry-mesh-tests.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "grid-doctor.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "grid-sentinel.yml",
     "v": "RUNNING",
     "last": 0,
     "concl": null,
     "st": "active"
    },
    {
     "p": "grid-trigger-twin.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "human-cadence.yml",
     "v": "WARM",
     "last": 56,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "ladder-refresh.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "market-grid-cron.yml",
     "v": "WARM",
     "last": 42,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "mirror-from-console.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "moment-watch.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "office-artery.yml",
     "v": "RE-LIT",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "office-feed.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "office-orders-twin.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "office-pulse-twin.yml",
     "v": "WARM",
     "last": 42,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "office-pulse.yml",
     "v": "RE-LIT",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "office-worldbeat.yml",
     "v": "BEAT",
     "last": 9,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "operator-console.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "org-gitleaks.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "org-selftests.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "pf-artery-keeper.yml",
     "v": "BEAT",
     "last": 25,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "proof-pipeline.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "public-pulse.yml",
     "v": "BEAT",
     "last": 15,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "recruit.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "sandbox-arteries.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "saos-act.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "seal-adopt.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "self-audience.yml",
     "v": "BEAT",
     "last": 8,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "site-link-audit.yml",
     "v": "BEAT",
     "last": 6,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "social-audit.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "soldiers-curate.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "sovereign-decider-twin.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "sovereign-pulse.yml",
     "v": "BEAT",
     "last": 28,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "sovereign-selftests.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "sovereign-tick-cron.yml",
     "v": "BEAT",
     "last": 28,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "steem-posting-repair.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "tick-keeper.yml",
     "v": "BEAT",
     "last": 27,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "token-forge.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "treasury-arm.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "treasury-route.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "tri-bridge.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "twin-audit.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "vault-transfer.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "voice-artery.yml",
     "v": "BEAT",
     "last": 20,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "watchdog.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "weave-anchor-lines.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "weave-anchor-ping.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "weave-ecosystem.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "weave-heart.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "weave-mirror.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "web-publish.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "dynamic/pages/pages-build-deployment",
     "v": "BEAT",
     "last": 1,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "FleetHQ",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "fresh-oracle.yml",
     "v": "COOL",
     "last": 260,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "office-3d.yml",
     "v": "WARM",
     "last": 129,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "office-ci.yml",
     "v": "WARM",
     "last": 94,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "office-heartbeat.yml",
     "v": "WARM",
     "last": 168,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "office-retro.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "office-window.yml",
     "v": "COOL",
     "last": 403,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "opens-closer.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "sovereign-decider.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "value-scan.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "dynamic/pages/pages-build-deployment",
     "v": "WARM",
     "last": 127,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "GridWatch",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "flow-map.yml",
     "v": "WARM",
     "last": 89,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "grid-watch.yml",
     "v": "WARM",
     "last": 91,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "Project-files",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "archive-keeper.yml",
     "v": "WARM",
     "last": 32,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "WARM",
     "last": 32,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "WARM",
     "last": 32,
     "concl": "failure",
     "st": "active"
    }
   ]
  },
  {
   "repo": "Pulse",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "heartbeat.yml",
     "v": "WARM",
     "last": 48,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "roshpina",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "controls-audit.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "fee-engine.yml",
     "v": "WARM",
     "last": 60,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9293,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9293,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "roshpinacare-sys.github.io",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "dynamic/pages/pages-build-deployment",
     "v": "BEAT",
     "last": 29,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "Sandbox",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "agent-access.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "agent-roster-reseal.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "artery-catchup.yml",
     "v": "BEAT",
     "last": 18,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-decision-truth.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-fleet.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-flow.yml",
     "v": "WARM",
     "last": 92,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-grid.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-integrity.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-participation.yml",
     "v": "WARM",
     "last": 64,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-scribe.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "artery-wallet.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "artery-watch.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "evo-windows-staleness.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "federation.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "fleet-heal.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "fleet-yield.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "fresh-oracle.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "hive-probe.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "key-proof.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "office-growth.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "pages.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "profit-oracle.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "research-lane.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "retro.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "sovereign-decider.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "sovereign-state.yml",
     "v": "BEAT",
     "last": 27,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "sovereign.yml",
     "v": "BEAT",
     "last": 18,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "token-forge.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "token-watchdog.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "value-scan.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "verifier.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    }
   ]
  },
  {
   "repo": "sandbox-private",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "sovereign-heart.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    }
   ]
  },
  {
   "repo": "saos-agents",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "gitleaks.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "selftest-gate.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    }
   ]
  },
  {
   "repo": "saos-control-center",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "control-center-build.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9292,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9292,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "saos-dex",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "arb-scan.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "ci.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "dex-beat.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "dex-grid.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "grid-trigger.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "llm-bridge.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "mm-supremacy.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "failure",
     "st": "active"
    }
   ]
  },
  {
   "repo": "saos-jummper",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9297,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "hive-intel.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "jumpper-tests.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "truthrail-anchor.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9297,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "saos-runtime",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "blurt-revival.yml",
     "v": "COOL",
     "last": 410,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "custody-recover.yml",
     "v": "WARM",
     "last": 41,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "escrow-payroll.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "fee-engine.yml",
     "v": "WARM",
     "last": 60,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "fleet-rotation-a.yml",
     "v": "WARM",
     "last": 47,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gen2-rotation.yml",
     "v": "COOL",
     "last": 398,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "grid-watchdog.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "owner-key-adopt.yml",
     "v": "COOL",
     "last": 331,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "sovereign-evolution.yml",
     "v": "COOL",
     "last": 374,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "sovereign-runtime.yml",
     "v": "WARM",
     "last": 37,
     "concl": null,
     "st": "active"
    },
    {
     "p": "treasury-ladder.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    }
   ]
  },
  {
   "repo": "saos-sovereign-foundry",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "ci.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 8482,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 8482,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "saos-sovereign-platform",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "foundry-tests.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9291,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "platform-selftest.yml",
     "v": "SILENT",
     "last": 10586,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9291,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "Saosmartwallet",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9296,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "wallet-verify.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9296,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "Sdk",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "gitleaks.yml",
     "v": "SILENT",
     "last": 9295,
     "concl": "failure",
     "st": "disabled_manually"
    },
    {
     "p": "sdk-live.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "sdk-verify.yml",
     "v": "WARM",
     "last": 95,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "SILENT",
     "last": 9295,
     "concl": "failure",
     "st": "disabled_manually"
    }
   ]
  },
  {
   "repo": "sovereign-beacon",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "beacon-pulse.yml",
     "v": "BEAT",
     "last": 13,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "dynamic/pages/pages-build-deployment",
     "v": "COOL",
     "last": 673,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "sovereign-lighthouse",
   "vis": "public",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "lighthouse-pulse.yml",
     "v": "WARM",
     "last": 53,
     "concl": "success",
     "st": "active"
    },
    {
     "p": "dynamic/pages/pages-build-deployment",
     "v": "COOL",
     "last": 664,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "steem",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "cloud-heart.yml",
     "v": "SILENT",
     "last": 6745,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "social-cadence.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "sovereign-cycle.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "ci-probe.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "token-forge.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    }
   ]
  },
  {
   "repo": "TruthRail",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "exposure-gate.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "dynamic/pages/pages-build-deployment",
     "v": "COOL",
     "last": 1362,
     "concl": "success",
     "st": "active"
    }
   ]
  },
  {
   "repo": "Zip",
   "vis": "private",
   "verdict": "ALIVE",
   "arteries": [
    {
     "p": "fleet-audit.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "gitleaks.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "secret-relay.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    },
    {
     "p": "weave-anchor-lines.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "weave-anchor-zero.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "disabled_manually"
    },
    {
     "p": "weave-anchor.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "disabled_manually"
    },
    {
     "p": "weave-brain-restore.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "weave-ecosystem.yml",
     "v": "WARM",
     "last": 96,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "weave-heart.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "web-probe.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "web-probe2.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "web-publish.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    },
    {
     "p": "workflow-yaml-guard.yml",
     "v": "WARM",
     "last": 97,
     "concl": "failure",
     "st": "active"
    }
   ]
  },
  {
   "repo": "SovereignConsole",
   "vis": "private",
   "verdict": "STALE",
   "arteries": [
    {
     "p": "office-mirror.yml",
     "v": "NEVER",
     "last": null,
     "concl": null,
     "st": "active"
    }
   ]
  },
  {
   "repo": "negen",
   "vis": "private",
   "verdict": "IDLE",
   "arteries": []
  },
  {
   "repo": "sovereign-runner-kit",
   "vis": "public",
   "verdict": "IDLE",
   "arteries": []
  },
  {
   "repo": "vault-home",
   "vis": "private",
   "verdict": "IDLE",
   "arteries": []
  }
 ]
}