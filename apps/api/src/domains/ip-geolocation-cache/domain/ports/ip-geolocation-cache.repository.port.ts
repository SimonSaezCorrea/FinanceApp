import type { IpGeolocationCacheEntry } from "../ip-geolocation-cache.entity";

export const IP_GEOLOCATION_CACHE_REPOSITORY = Symbol("IP_GEOLOCATION_CACHE_REPOSITORY");

/** Adapter (Principle VI) — the ONLY port allowed to touch the `ip-geolocation-cache` table. */
export interface IpGeolocationCacheRepositoryPort {
  /**
   * `null` on a miss OR a row whose `expiresAt` has already passed — both treated identically by
   * `GeoIpLookup`: resolved as if never cached. The `expiresAt` filter lives INSIDE the query, so
   * an expired-but-not-yet-swept row is never served as fresh regardless of whether the cron has
   * run yet.
   */
  findFreshByIp(ip: string, now: Date): Promise<IpGeolocationCacheEntry | null>;

  /** Upsert keyed on the unique `ip` column — atomic at the Postgres level, so two concurrent
   * first-time lookups of the same brand-new IP can't collide (research.md R6). */
  upsert(entry: IpGeolocationCacheEntry): Promise<void>;

  /** Daily cron sweep. Returns how many rows were dropped. */
  deleteExpired(now: Date): Promise<number>;
}
