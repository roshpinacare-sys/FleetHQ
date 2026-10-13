// ============================================================================
// GITFLEET-PROBE — repeatable honest check of the repo fleet inventory
// ----------------------------------------------------------------------------
// Runs collectRepoFleet() directly (no foreman restart needed) against the two
// repositories this office is ACTUALLY authorized to manage — exactly the
// foreman's study scope:
//   · Domain  — the fleet's data books (the foreman's data dir)
//   · FleetHQ — the office's own code (AGENT_HQ_FLEET_DIR ?? /home/z/my-project)
// The 22-repo fleet manifest lives in the separate private vault repo, outside
// this office's permission scope — it is NOT invented here (honest boundary).
//
// What it prints: the measured JSON — sync state, ahead/behind (null stays
// null, never fake 0), dirty count (sentinel churn on a live office is EXPECTED
// and honest), last-fetch age, sanitized errors. READ-ONLY: never fetch, never
// push, never `git remote -v`, no remote URLs in the payload.
// This is a REPORT script: exit 0 always — the human reads the truth.
// Run: bun mini-services/agent-hq/tools/gitfleet-probe.ts
// ============================================================================
import { collectRepoFleet } from '../src/gitfleet';

const fleet = await collectRepoFleet([
  { label: 'Domain · ספרי הצי', dir: process.env.AGENT_HQ_DATA_DIR ?? '/home/z/my-project/Domain', branch: 'main' },
  { label: 'FleetHQ · קוד המשרד', dir: process.env.AGENT_HQ_FLEET_DIR ?? '/home/z/my-project', branch: 'main' },
]);

console.log(JSON.stringify({ ts: Date.now(), repos: fleet.length, fleet }, null, 2));
process.exit(0);
