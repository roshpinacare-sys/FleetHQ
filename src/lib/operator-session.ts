/**
 * operator-session — in-memory session store shared by operator routes.
 * Memory-only by doctrine: tokens survive nothing, leak nothing.
 */
const TOKEN_TTL_MS = 10 * 60 * 1000;

const sessions = new Map<string, number>(); // token → issuedAt

export function issueToken(): { token: string; ttlMs: number } {
  const now = Date.now();
  for (const [t, issued] of sessions) if (now - issued > TOKEN_TTL_MS) sessions.delete(t);
  const token = Array.from({ length: 48 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  sessions.set(token, now);
  return { token, ttlMs: TOKEN_TTL_MS };
}

export function verifyToken(token: string): boolean {
  const issued = sessions.get(token);
  if (!issued) return false;
  if (Date.now() - issued > TOKEN_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}
