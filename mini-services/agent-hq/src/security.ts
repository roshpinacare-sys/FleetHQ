// ============================================================================
// SECURITY GATE — שער האבטחה של המפקדה
// ----------------------------------------------------------------------------
// The doctrine (SECURITY.md) in code: every byte that comes from OUTSIDE the
// office (git history, book files, model replies) passes through this gate
// before it reaches a model prompt or the public socket. It guarantees:
//
//   1. Secrets can never reach a model, a log, a bubble, or a report —
//      anything shaped like a key/token/password is replaced by «redacted».
//   2. Sensitive paths (env files, vault, keys, pems) never appear in
//      learning digests — they are dropped, not scrubbed.
//   3. Similarity helpers power the anti-fixation (novelty) guard.
//
// This module is intentionally dependency-free and deterministic.
// ============================================================================

/** Anything shaped like a real credential. Match → redact. */
const SECRET_PATTERNS: RegExp[] = [
  /xai-[A-Za-z0-9]{16,}/g,
  /sk-or-v1-[A-Za-z0-9-]{16,}/g,
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /sk-[A-Za-z0-9_-]{28,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /gho_[A-Za-z0-9]{20,}/g,
  /ghu_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{18,}/g,
  /glpat-[A-Za-z0-9_-]{16,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /Bearer\s+[A-Za-z0-9._~+/-]{18,}/gi,
  /(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|password|passphrase)\s*[:=]\s*[^\s"']{8,}/gi,
];

const REDACTED = '«redacted»';

/** Redact anything that looks like a secret before the text leaves the office. */
export function scrubSecrets(text: string): string {
  let out = String(text ?? '');
  for (const re of SECRET_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

/**
 * The BROWSER gate — for text crossing to the public socket (logs, bubbles,
 * feed, tasks, decisions, reports, goal, git subjects). Same law as
 * scrubSecrets + the same control-character class stripControl removes, but
 * WITHOUT whitespace collapse or length slicing: those would corrupt ordinary
 * multi-line content (log results, report bodies). Length caps stay where they
 * are enforced today, at construction time.
 */
export function sanitizePublicText(text: string): string {
  return scrubSecrets(String(text ?? '')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
}

/** Strip control characters (injection hygiene) and hard-cap length. */
export function stripControl(text: string, max = 160): string {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Sensitive path detector — used by the git learning wire. A path that even
 * LOOKS like it could carry a secret is dropped entirely (never reported,
 * never summarized, never read).
 */
export function isSensitivePath(p: string): boolean {
  const norm = String(p ?? '').replace(/\\/g, '/');
  const segs = norm.split('/').filter(Boolean);
  const sensitiveName = /(^|\.)(env|pem|key|enc|p12|pfx)$|env\.|^\.env|passphrase|secret|credential|password|id_rsa|id_ed25519|id_ecdsa|^pat[.\-]|\.pat$|keystore/i;
  const sensitiveDir = /^(vault|upload|keys?|secrets?|\.git|\.github|node_modules|\.next)$/i;
  return segs.some((s, i) => (i === segs.length - 1 ? sensitiveName.test(s) : sensitiveDir.test(s)));
}

/** Jaccard token similarity in [0,1] — powers the anti-fixation novelty guard. */
export function jaccard(a: string, b: string): number {
  const tok = (s: string) => new Set(String(s ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 1));
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
