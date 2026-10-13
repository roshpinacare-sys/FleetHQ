'use strict';
/**
 * persona-store.cjs — P0-1/T3 persona doctrine SEALED store (2026-10-11).
 *
 * WHY: agents/personas.json + agents/persona-slots.json carried the full coordination
 * doctrine (roster, desks, cadence windows, vote weights, budgets) on a PUBLIC tree —
 * a standing astroturf self-exposure (master plan P0-1 / T3, owner-approved purge).
 * The doctrine now lives SEALED at agents/personas.enc + agents/persona-slots.enc
 * (the SAME format the fleet already trusts: WEAVE-CLOUD-SEAL-1 — scrypt+aes-256-gcm,
 * hex lines, see scripts/seal-adopt.mjs). Passphrase comes from the runtime env only.
 *
 * RESOLUTION ORDER (per call, cached):
 *   1. plaintext file (private contexts — keeps the private steem cockpit sovereign),
 *   2. sealed .enc + env PERSONAS_KEY || MAIN_KEY || WEAVE_SEAL_PASSPHRASE (Actions),
 *   3. fail-soft: personas() => [], slots() => {} — callers keep their existing
 *      missing-file behavior; the human-cadence publisher additionally HALTS
 *      fail-closed when the doctrine is unavailable (no doctrine, no coordinated
 *      publishing — SKIP-PERSONAS-UNAVAILABLE).
 *
 * LAWS: zero secrets logged · zero network · deterministic · CommonJS (engine-wide).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAGIC = 'WEAVE-CLOUD-SEAL-1';
const HERE = __dirname;
const PLAIN_PERSONAS = path.join(HERE, 'personas.json');
const PLAIN_SLOTS = path.join(HERE, 'persona-slots.json');
const ENC_PERSONAS = path.join(HERE, 'personas.enc');
const ENC_SLOTS = path.join(HERE, 'persona-slots.enc');

let _personas = null; // memo
let _slots = null;

function sealFileHex(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines[0] !== MAGIC) throw new Error('bad seal magic');
  return lines.slice(1).join('');
}

function sealDecrypt(hex, passphrase) {
  const payload = Buffer.from(hex, 'hex');
  const salt = payload.subarray(0, 16);
  const iv = payload.subarray(16, 28);
  const tag = payload.subarray(28, 44);
  const ct = payload.subarray(44);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(pt);
  if (parsed.format !== MAGIC) throw new Error('unrecognized seal content');
  return parsed;
}

/** try every passphrase candidate against a sealed file; first that opens wins */
function openSeal(file) {
  const cands = [process.env.PERSONAS_KEY, process.env.MAIN_KEY, process.env.WEAVE_SEAL_PASSPHRASE]
    .filter((k) => typeof k === 'string' && k.length > 0);
  if (!cands.length) return null;
  const hex = sealFileHex(file);
  for (const pass of cands) {
    try {
      const parsed = sealDecrypt(hex, pass);
      if (parsed) return parsed;
    } catch (_) { /* wrong key — try next, never log which */ }
  }
  return null;
}

function loadPersonas() {
  if (_personas !== null) return _personas;
  try {
    const arr = JSON.parse(fs.readFileSync(PLAIN_PERSONAS, 'utf8'));
    if (Array.isArray(arr)) { _personas = arr; return _personas; }
  } catch (_) { /* sealed path */ }
  let out = [];
  try {
    const parsed = openSeal(ENC_PERSONAS);
    if (parsed && Array.isArray(parsed.personas)) out = parsed.personas;
  } catch (_) { /* fail-soft empty */ }
  _personas = out;
  return _personas;
}

function loadSlots() {
  if (_slots !== null) return _slots;
  try {
    const obj = JSON.parse(fs.readFileSync(PLAIN_SLOTS, 'utf8'));
    if (obj && typeof obj === 'object') { _slots = obj; return _slots; }
  } catch (_) { /* sealed path */ }
  let out = {};
  try {
    const parsed = openSeal(ENC_SLOTS);
    if (parsed && parsed.slots && typeof parsed.slots === 'object') out = parsed.slots;
  } catch (_) { /* fail-soft empty */ }
  _slots = out;
  return _slots;
}

module.exports = {
  personas: loadPersonas,
  slots: loadSlots,
  roster: () => loadPersonas().map((p) => p.account).filter(Boolean),
  sealed: () => !fs.existsSync(PLAIN_PERSONAS),
  MAGIC,
};
