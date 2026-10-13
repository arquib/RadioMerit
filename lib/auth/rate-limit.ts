import "server-only";

// In-memory login throttle (single Node process): 5 failures per IP → locked for 15 minutes.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60_000;
const fails = new Map<string, { count: number; first: number; lockedUntil: number }>();

export function lockedFor(ip: string): number {
  const f = fails.get(ip);
  if (!f) return 0;
  if (f.lockedUntil > Date.now()) return Math.ceil((f.lockedUntil - Date.now()) / 60_000);
  if (Date.now() - f.first > WINDOW_MS) fails.delete(ip);
  return 0;
}

export function recordFailure(ip: string) {
  const now = Date.now();
  const f = fails.get(ip);
  const entry = !f || now - f.first > WINDOW_MS ? { count: 0, first: now, lockedUntil: 0 } : f;
  entry.count += 1;
  if (entry.count >= MAX_FAILS) entry.lockedUntil = now + WINDOW_MS;
  fails.set(ip, entry);
}

export function clearFailures(ip: string) {
  fails.delete(ip);
}
