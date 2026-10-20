// ============================================================================
// FRONT-OF-HOUSE SUPERVISOR — הפורמן משגיח גם על חזית המשרד
// ----------------------------------------------------------------------------
// The office UI (the Next dev server on :3000) is the window the operator
// looks through. Sandboxes reap long-lived processes freely; the foreman is
// the one service that survives, so IT owns the front door: every 30s, if
// nothing listens on :3000, spawn `bun run dev` as a CHILD of the foreman
// tree — the UI then inherits the foreman's survivability.
//
// Boot-safe by design: the normal boot (dev.sh) starts Next BEFORE the
// foreman, so on a healthy boot the guard simply sees the port open and does
// nothing. It only acts on a GAP (UI crashed / killed / never came up).
//
// SECURITY: the child inherits a SCRUBBED environment — credentials that
// belong to the foreman's own infrastructure role (GITHUB_PAT, the memory
// pipeline) never reach the web tier. The web tier gets only what it needs
// to answer (the LLM brain keys) — same least-privilege line as everywhere
// else in this office.
//
// Fail-soft: any error is swallowed; the office never depends on the UI.
// ============================================================================

import { spawn } from 'child_process';
import { resolve } from 'path';
import net from 'net';

const UI_PORT = Number(process.env.AGENT_HQ_UI_PORT || 3000);
const TICK_MS = 30_000;
const SPAWN_GUARD_MS = 90_000; // after a spawn, give the server time to come up

function portOpen(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.setTimeout(1500);
    s.once('connect', () => {
      s.destroy();
      res(true);
    });
    s.once('timeout', () => {
      s.destroy();
      res(false);
    });
    s.once('error', () => res(false));
  });
}

export function startFrontHouse(): void {
  // the office root is two levels above this file (mini-services/agent-hq/src)
  const PROJECT_DIR = process.env.AGENT_HQ_PROJECT_DIR || resolve(import.meta.dir, '..', '..');
  let lastSpawn = 0;

  const tick = async () => {
    try {
      if (Date.now() - lastSpawn < SPAWN_GUARD_MS) return;
      if (await portOpen(UI_PORT)) return;
      lastSpawn = Date.now();
      console.log(`[front-house] :${UI_PORT} is down — spawning the office UI as a foreman child`);
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v === undefined) continue;
        if (k === 'GITHUB_PAT') continue; // infrastructure credential — never crosses to the web tier
        env[k] = v;
      }
      const child = spawn('bun', ['run', 'dev'], {
        cwd: PROJECT_DIR,
        env,
        stdio: 'ignore',
        detached: false,
      });
      child.on('error', (e) => console.log(`[front-house] spawn error: ${e.message}`));
      child.unref?.();
    } catch {
      // fail-soft — the office runs with or without the UI
    }
  };

  setTimeout(() => void tick(), 8_000);
  setInterval(() => void tick(), TICK_MS);
}
