import { ConfigService } from "@nestjs/config";

/**
 * Optional, "inert without config" like the S3 block — a session's country is a nice-to-have,
 * never required. `null` means `GeoIpLookup` resolves no country at all; it must NEVER throw at boot the way
 * `getOrThrow` does for the required secrets.
 */
export function getIpinfoToken(config: ConfigService): string | null {
  const value = config.get<string>("IPINFO_TOKEN");
  return value && value.trim().length > 0 ? value : null;
}
