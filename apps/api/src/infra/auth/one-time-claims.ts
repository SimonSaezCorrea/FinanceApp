/**
 * Makes a short-lived signed token single-use: the passkey ceremony's challenge cookie and the
 * "second factor pending" cookie are stateless JWTs valid for 5 minutes, so without this a copy
 * could be presented again inside that window. Each carries a random `jti`; `claimOnce` says
 * whether this is the first time it is seen.
 *
 * Kept in this process's memory, like the request limits (infra/http/rate-limit.ts): with one
 * server it is the whole picture. It is lost on a restart, and during the minute of a deploy the
 * two API containers don't share it — accepted, as for the request limits (docs/PENDING.md).
 */

/** More than the claims that 5 minutes of rate-limited sign-ins can produce. */
const MAX_ENTRIES = 100_000;

const used = new Map<string, number>();

function purgeExpired(now: number): void {
  for (const [key, expiresAt] of used) if (expiresAt <= now) used.delete(key);
}

/**
 * `true` the first time `key` is claimed before `expiresAtMs`; `false` when it was claimed
 * already. Past its expiry a key is forgotten — the token itself is no longer valid by then.
 */
export function claimOnce(key: string, expiresAtMs: number, now = Date.now()): boolean {
  const seen = used.get(key);
  if (seen !== undefined && seen > now) return false;
  if (used.size >= MAX_ENTRIES) {
    purgeExpired(now);
    // Still full of live claims: drop the oldest (Map keeps insertion order). Those are the
    // closest to expiring, so the window a forgotten one leaves is the shortest.
    while (used.size >= MAX_ENTRIES) used.delete(used.keys().next().value as string);
  }
  used.set(key, expiresAtMs);
  return true;
}

/** Gives a claim back, so the same token can be presented again (a mistyped second factor). */
export function releaseClaim(key: string): void {
  used.delete(key);
}

/** Tests only: start from an empty record. */
export function resetOneTimeClaims(): void {
  used.clear();
}
