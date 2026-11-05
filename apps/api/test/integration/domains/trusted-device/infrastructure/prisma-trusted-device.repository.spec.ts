import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildUserRepo } from "../../../support/repositories";
import { PrismaTrustedDeviceRepository } from "../../../../../src/domains/trusted-device/infrastructure/prisma-trusted-device.repository";
import { generateRowId } from "../../../../../src/infra/id/generate-row-id";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/** Integration (specs/040 US2): the `trusted-device` adapter against a real Postgres. */
describe("PrismaTrustedDeviceRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const repo = new PrismaTrustedDeviceRepository(prisma);
  let userId: string;
  let otherId: string;

  const plan = (
    owner: string,
    createdAt: Date,
    expiresAt = new Date(createdAt.getTime() + 86_400_000),
  ) => ({
    id: generateRowId(),
    userId: owner,
    tokenHash: `h_${randomUUID()}`,
    deviceLabel: "Chrome · Windows",
    createdAt,
    expiresAt,
  });

  beforeAll(async () => {
    await prisma.$connect();
    const mk = (tag: string) =>
      userRepo.create({
        email: `int_trusted_${tag}_${randomUUID()}@test.local`,
        name: "Trusted",
        passwordHash: "x",
        birthDate: new Date("1990-01-01"),
      });
    userId = (await mk("a")).id;
    otherId = (await mk("b")).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  it("keeps at most 10 per account, dropping the oldest", async () => {
    const base = Date.now();
    for (let i = 0; i < 11; i++) {
      await prisma.$transaction((tx) =>
        repo.rememberWithTx(tx, plan(userId, new Date(base + i * 1000))),
      );
    }
    const rows = await repo.listForUser(userId, new Date(base));
    expect(rows).toHaveLength(10);
    expect(rows[rows.length - 1]!.createdAt.getTime()).toBe(base + 1000);
  });

  it("finds a device by its hash only while unexpired, and purges expired ones", async () => {
    const now = new Date();
    const live = plan(otherId, now);
    const dead = plan(
      otherId,
      new Date(now.getTime() - 2 * 86_400_000),
      new Date(now.getTime() - 1000),
    );
    await prisma.$transaction(async (tx) => {
      await repo.rememberWithTx(tx, live);
      await repo.rememberWithTx(tx, dead);
    });
    expect((await repo.findValidByTokenHash(live.tokenHash, now))?.id).toBe(live.id);
    expect(await repo.findValidByTokenHash(dead.tokenHash, now)).toBeNull();
    expect(await repo.purgeExpired(now)).toBeGreaterThanOrEqual(1);
  });

  it("deletes one only for its owner, and all of an account at once", async () => {
    const [mine] = await repo.listForUser(otherId, new Date());
    expect(await repo.deleteOwned(userId, mine!.id)).toBe(false);
    expect(await repo.deleteOwned(otherId, mine!.id)).toBe(true);

    await prisma.$transaction((tx) => repo.deleteAllForUserWithTx(tx, userId));
    expect(await repo.listForUser(userId, new Date(0))).toHaveLength(0);
  });
});
