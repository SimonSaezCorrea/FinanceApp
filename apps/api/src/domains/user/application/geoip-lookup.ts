import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { open, type CityResponse, type Reader } from "maxmind";

import { getGeoIpDbPath } from "../../../infra/config/geoip.config";

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
// TEMPORARY dev-only test aid: on localhost the server only ever sees a loopback IP,
// which never resolves to a location. Swap in a real public IP so the feature is
// visible while developing against `localhost`. Remove once no longer needed — never
// active outside NODE_ENV !== "production" (see the guard below).
const DEV_FALLBACK_IP = "190.196.0.1"; // Chile

export interface GeoLocation {
  country: string | null;
  city: string | null;
}

const NO_LOCATION: GeoLocation = { country: null, city: null };

/**
 * Local-only IP→location lookup (research.md R5) — never a network call. Opens the
 * `.mmdb` reader lazily, once, and caches it (or the fact that it's unavailable) for the
 * process lifetime. Entirely optional: no configured path, a missing/corrupt file, or
 * any lookup failure all resolve to `{country: null, city: null}` — a session is
 * created either way, just without a location. Never throws. Expects a GeoLite2-CITY
 * database (`CityResponse` is a superset of the country-only shape, so a
 * GeoLite2-Country file still works — `city` just stays `null`).
 */
@Injectable()
export class GeoIpLookup {
  private readerPromise: Promise<Reader<CityResponse> | null> | undefined;

  constructor(private readonly config: ConfigService) {}

  private load(): Promise<Reader<CityResponse> | null> {
    if (!this.readerPromise) {
      const path = getGeoIpDbPath(this.config);
      this.readerPromise = path
        ? open<CityResponse>(path).catch(() => null)
        : Promise.resolve(null);
    }
    return this.readerPromise;
  }

  async lookup(ip: string | undefined): Promise<GeoLocation> {
    if (!ip) return NO_LOCATION;
    const reader = await this.load();
    if (!reader) return NO_LOCATION;
    const effectiveIp =
      LOOPBACK_IPS.has(ip) && this.config.get<string>("NODE_ENV") !== "production"
        ? DEV_FALLBACK_IP
        : ip;
    try {
      const result = reader.get(effectiveIp);
      // `country` is the physical-location country; some IPs (notably anycast, e.g.
      // 1.1.1.1) carry no `country` record at all, only `registered_country` (where
      // the IP block itself is registered) — falling back to it is still a reasonable
      // approximation of "where this login came from", better than showing nothing.
      const country = result?.country?.iso_code ?? result?.registered_country?.iso_code ?? null;
      const city = result?.city?.names.es ?? result?.city?.names.en ?? null;
      return { country, city };
    } catch {
      return NO_LOCATION;
    }
  }
}
