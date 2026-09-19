import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { open, type CityResponse, type Reader } from "maxmind";

import { getGeoIpDbPath } from "../../../infra/config/geoip.config";
import { getIpinfoToken } from "../../../infra/config/ipinfo.config";
import { planCacheEntry } from "../../ip-geolocation-cache/domain/ip-geolocation-cache.entity";
import {
  IP_GEOLOCATION_CACHE_REPOSITORY,
  type IpGeolocationCacheRepositoryPort,
} from "../../ip-geolocation-cache/domain/ports/ip-geolocation-cache.repository.port";

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

type IpinfoFetchResult = { ok: true; country: string | null } | { ok: false };

/**
 * IP→location lookup (specs/023 R5, rewritten by specs/026). Public contract unchanged —
 * `SessionIssuer` never sees which of two internal sources answered a given call. Preference
 * order per call: `IPINFO_TOKEN` configured → IPinfo Lite (through the `ip-geolocation-cache`
 * table, never combined with MaxMind as an automatic fallback within the same call — research.md
 * R5); else `GEOIP_DB_PATH` configured → local MaxMind reader (unchanged since specs/023); else no
 * location. Never throws — every failure resolves to `{country: null, city: null}`, a session is
 * created either way.
 */
@Injectable()
export class GeoIpLookup {
  private readerPromise: Promise<Reader<CityResponse> | null> | undefined;

  constructor(
    private readonly config: ConfigService,
    @Inject(IP_GEOLOCATION_CACHE_REPOSITORY)
    private readonly cache: IpGeolocationCacheRepositoryPort,
  ) {}

  async lookup(ip: string | undefined): Promise<GeoLocation> {
    if (!ip) return NO_LOCATION;
    const effectiveIp = this.resolveEffectiveIp(ip);
    const token = getIpinfoToken(this.config);
    return token ? this.lookupViaIpinfo(effectiveIp, token) : this.lookupViaMaxMind(effectiveIp);
  }

  private resolveEffectiveIp(ip: string): string {
    return LOOPBACK_IPS.has(ip) && this.config.get<string>("NODE_ENV") !== "production"
      ? DEV_FALLBACK_IP
      : ip;
  }

  /** IPinfo Lite path: cache first, live call only on a miss (FR-002/FR-003). A transient
   * failure (network error, timeout, non-2xx — e.g. a bad token, confirmed to answer 403 during
   * research) never writes to the cache, so it self-heals on the very next login from the same IP
   * instead of poisoning it for the full 60-day TTL (research.md R4). */
  private async lookupViaIpinfo(ip: string, token: string): Promise<GeoLocation> {
    const now = new Date();
    const cached = await this.cache.findFreshByIp(ip, now);
    if (cached) return { country: cached.country, city: null };

    const result = await this.fetchFromIpinfo(ip, token);
    if (!result.ok) return NO_LOCATION;

    await this.cache.upsert(planCacheEntry(ip, result.country, now));
    return { country: result.country, city: null };
  }

  private async fetchFromIpinfo(ip: string, token: string): Promise<IpinfoFetchResult> {
    try {
      const res = await fetch(
        `https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${token}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (!res.ok) return { ok: false };
      const body = (await res.json()) as { country_code?: string };
      return { ok: true, country: body.country_code ?? null };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Local-only IP→location lookup (research.md R5 of specs/023) — never a network call. Opens
   * the `.mmdb` reader lazily, once, and caches it (or the fact that it's unavailable) for the
   * process lifetime. Entirely optional: no configured path, a missing/corrupt file, or any
   * lookup failure all resolve to `{country: null, city: null}`. Expects a GeoLite2-CITY
   * database (`CityResponse` is a superset of the country-only shape, so a GeoLite2-Country file
   * still works — `city` just stays `null`).
   */
  private load(): Promise<Reader<CityResponse> | null> {
    if (!this.readerPromise) {
      const path = getGeoIpDbPath(this.config);
      this.readerPromise = path
        ? open<CityResponse>(path).catch(() => null)
        : Promise.resolve(null);
    }
    return this.readerPromise;
  }

  private async lookupViaMaxMind(ip: string): Promise<GeoLocation> {
    const reader = await this.load();
    if (!reader) return NO_LOCATION;
    try {
      const result = reader.get(ip);
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
