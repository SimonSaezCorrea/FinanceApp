export const IP_GEOLOCATION_CACHE_TTL_DAYS = 60;

export interface IpGeolocationCacheEntry {
  ip: string;
  country: string | null;
  expiresAt: Date;
}

/**
 * The row to write after a genuine 2xx response from IPinfo — never called after a network
 * error/timeout/non-2xx status (research.md R4): a transient provider failure must never poison
 * an IP for the full TTL.
 */
export function planCacheEntry(
  ip: string,
  country: string | null,
  now: Date,
): IpGeolocationCacheEntry {
  return {
    ip,
    country,
    expiresAt: new Date(now.getTime() + IP_GEOLOCATION_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}
