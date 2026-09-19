import { afterEach, describe, expect, it, vi } from "vitest";

import { GeoIpLookup } from "../../../../../src/domains/user/application/geoip-lookup";
import type { IpGeolocationCacheRepositoryPort } from "../../../../../src/domains/ip-geolocation-cache/domain/ports/ip-geolocation-cache.repository.port";

function fakeConfig(env: Record<string, string | undefined>): {
  get: (key: string) => string | undefined;
} {
  return { get: (key: string) => env[key] };
}

function fakeCache(
  overrides: Partial<IpGeolocationCacheRepositoryPort> = {},
): IpGeolocationCacheRepositoryPort {
  return {
    findFreshByIp: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

describe("GeoIpLookup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns no location when neither IPINFO_TOKEN nor GEOIP_DB_PATH is configured", async () => {
    const lookup = new GeoIpLookup(fakeConfig({}) as never, fakeCache());

    const result = await lookup.lookup("8.8.8.8");

    expect(result).toEqual({ country: null, city: null });
  });

  it("with IPINFO_TOKEN and a cache hit, never calls the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const cache = fakeCache({
      findFreshByIp: vi
        .fn()
        .mockResolvedValue({ ip: "8.8.8.8", country: "US", expiresAt: new Date() }),
    });
    const lookup = new GeoIpLookup(fakeConfig({ IPINFO_TOKEN: "tok" }) as never, cache);

    const result = await lookup.lookup("8.8.8.8");

    expect(result).toEqual({ country: "US", city: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("on a cache miss, calls IPinfo and caches the successful result — city always null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ country_code: "CL" }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = fakeCache();
    const lookup = new GeoIpLookup(fakeConfig({ IPINFO_TOKEN: "tok" }) as never, cache);

    const result = await lookup.lookup("190.196.0.1");

    expect(result).toEqual({ country: "CL", city: null });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.ipinfo.io/lite/190.196.0.1?token=tok"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(cache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "190.196.0.1", country: "CL" }),
    );
  });

  it("a non-2xx IPinfo response resolves to no location and is NEVER cached", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false));
    vi.stubGlobal("fetch", fetchMock);
    const cache = fakeCache();
    const lookup = new GeoIpLookup(fakeConfig({ IPINFO_TOKEN: "badtoken" }) as never, cache);

    const result = await lookup.lookup("190.196.0.1");

    expect(result).toEqual({ country: null, city: null });
    expect(cache.upsert).not.toHaveBeenCalled();
  });

  it("a network error/timeout resolves to no location and is NEVER cached", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const cache = fakeCache();
    const lookup = new GeoIpLookup(fakeConfig({ IPINFO_TOKEN: "tok" }) as never, cache);

    const result = await lookup.lookup("190.196.0.1");

    expect(result).toEqual({ country: null, city: null });
    expect(cache.upsert).not.toHaveBeenCalled();
  });

  it("without IPINFO_TOKEN, never touches the cache or the network (falls back to MaxMind path)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const cache = fakeCache();
    const lookup = new GeoIpLookup(fakeConfig({}) as never, cache);

    const result = await lookup.lookup("8.8.8.8");

    // No GEOIP_DB_PATH either, so the MaxMind reader never opens — resolves to no location.
    expect(result).toEqual({ country: null, city: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.findFreshByIp).not.toHaveBeenCalled();
  });
});
