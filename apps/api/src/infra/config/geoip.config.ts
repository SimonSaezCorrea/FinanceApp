import { ConfigService } from "@nestjs/config";

/**
 * Optional, unlike every other secret/config in this file's siblings — a session's
 * approximate country is a nice-to-have, never required. `null` (unset, or blank) means
 * `GeoIpLookup` simply never resolves a country; it must NEVER throw at boot the way
 * `getOrThrow` does for the required secrets.
 */
export function getGeoIpDbPath(config: ConfigService): string | null {
  const value = config.get<string>("GEOIP_DB_PATH");
  return value && value.trim().length > 0 ? value : null;
}
