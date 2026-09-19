import { ConfigService } from "@nestjs/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PrismaIpGeolocationCacheRepository } from "../../../../src/domains/ip-geolocation-cache/infrastructure/prisma-ip-geolocation-cache.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/** Global table (no `userId`) — a fixed test-only IP prefix keeps this suite's rows disjoint
 * from anything a real login might ever write, and lets cleanup be a single `deleteMany`. */
const TEST_IP_PREFIX = "203.0.113."; // TEST-NET-3 (RFC 5737), never a real routable address

describe("PrismaIpGeolocationCacheRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaIpGeolocationCacheRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.ipGeolocationCache.deleteMany({
      where: { ip: { startsWith: TEST_IP_PREFIX } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("upsert then findFreshByIp round-trips the cached country", async () => {
    const ip = `${TEST_IP_PREFIX}1`;
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    await repo.upsert({ ip, country: "CL", expiresAt });
    const found = await repo.findFreshByIp(ip, new Date());

    expect(found).toEqual({ ip, country: "CL", expiresAt });
  });

  it("upsert on an existing IP overwrites the row instead of erroring (the unique constraint IS the concurrency guard)", async () => {
    const ip = `${TEST_IP_PREFIX}2`;
    await repo.upsert({ ip, country: "AR", expiresAt: new Date(Date.now() + 1000) });
    await repo.upsert({
      ip,
      country: "CL",
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });

    const found = await repo.findFreshByIp(ip, new Date());

    expect(found?.country).toBe("CL");
  });

  it("a row whose expiresAt has already passed is never returned as fresh", async () => {
    const ip = `${TEST_IP_PREFIX}3`;
    await repo.upsert({ ip, country: "CL", expiresAt: new Date(Date.now() - 1000) });

    const found = await repo.findFreshByIp(ip, new Date());

    expect(found).toBeNull();
  });

  it("findFreshByIp returns null on a genuine miss", async () => {
    const found = await repo.findFreshByIp(`${TEST_IP_PREFIX}99`, new Date());

    expect(found).toBeNull();
  });

  it("deleteExpired removes only rows past their TTL, leaving fresh ones untouched", async () => {
    const expiredIp = `${TEST_IP_PREFIX}4`;
    const freshIp = `${TEST_IP_PREFIX}5`;
    const now = new Date();
    await repo.upsert({ ip: expiredIp, country: "CL", expiresAt: new Date(now.getTime() - 1000) });
    await repo.upsert({
      ip: freshIp,
      country: "CL",
      expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    });

    const deleted = await repo.deleteExpired(now);

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await repo.findFreshByIp(expiredIp, now)).toBeNull();
    expect(await repo.findFreshByIp(freshIp, now)).not.toBeNull();
  });
});
