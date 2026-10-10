import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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
 * IP→location lookup (specs/023 R5, rewritten by specs/026). With `IPINFO_TOKEN` configured it asks
 * IPinfo Lite through the `ip-geolocation-cache` table; without it there is no location. The local
 * MaxMind (GeoLite2) path and its `GEOIP_DB_PATH` were removed on 2026-10-10. IPinfo Lite gives the
 * country only, so `city` is always `null` (kept in the shape for sessions stored before). Never
 * throws — every failure resolves to `{country: null, city: null}`, a session is created either way.
 */
@Injectable()
export class GeoIpLookup {
  constructor(
    private readonly config: ConfigService,
    @Inject(IP_GEOLOCATION_CACHE_REPOSITORY)
    private readonly cache: IpGeolocationCacheRepositoryPort,
  ) {}

  async lookup(ip: string | undefined): Promise<GeoLocation> {
    if (!ip) return NO_LOCATION;
    const effectiveIp = this.resolveEffectiveIp(ip);
    const token = getIpinfoToken(this.config);
    return token ? this.lookupViaIpinfo(effectiveIp, token) : NO_LOCATION;
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
}
