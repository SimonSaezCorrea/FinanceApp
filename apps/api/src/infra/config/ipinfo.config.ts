import { ConfigService } from "@nestjs/config";

/**
 * Optional, same "inert without config" precedent as `getGeoIpDbPath` — a session's country is a
 * nice-to-have, never required. `null` means `GeoIpLookup` falls back to MaxMind (if
 * `GEOIP_DB_PATH` is set) or resolves no country at all; it must NEVER throw at boot the way
 * `getOrThrow` does for the required secrets.
 */
export function getIpinfoToken(config: ConfigService): string | null {
  const value = config.get<string>("IPINFO_TOKEN");
  return value && value.trim().length > 0 ? value : null;
}
