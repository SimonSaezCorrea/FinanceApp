import { describe, expect, it, vi } from "vitest";

import { PurgeExpiredCacheCommand } from "../../../../src/domains/ip-geolocation-cache/application/commands/purge-expired-cache.command";
import { PurgeExpiredCacheHandler } from "../../../../src/domains/ip-geolocation-cache/application/commands/purge-expired-cache.handler";
import type { IpGeolocationCacheRepositoryPort } from "../../../../src/domains/ip-geolocation-cache/domain/ports/ip-geolocation-cache.repository.port";

function fakeRepo(
  overrides: Partial<IpGeolocationCacheRepositoryPort> = {},
): IpGeolocationCacheRepositoryPort {
  return {
    findFreshByIp: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("PurgeExpiredCacheHandler", () => {
  it("is a system-scoped command, not tied to any user", () => {
    const command = new PurgeExpiredCacheCommand();
    expect(command.scope).toBe("system");
  });

  it("delegates to the repository's deleteExpired with the command's cutoff", async () => {
    const deleteExpired = vi.fn().mockResolvedValue(3);
    const repo = fakeRepo({ deleteExpired });
    const handler = new PurgeExpiredCacheHandler({ publish: vi.fn() } as never, repo);
    const now = new Date("2026-09-19T00:00:00Z");

    const result = await handler.execute(new PurgeExpiredCacheCommand(now));

    expect(result).toBe(3);
    expect(deleteExpired).toHaveBeenCalledWith(now);
  });

  it("returns 0 without error when nothing is expired", async () => {
    const repo = fakeRepo();
    const handler = new PurgeExpiredCacheHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(new PurgeExpiredCacheCommand());

    expect(result).toBe(0);
  });
});
