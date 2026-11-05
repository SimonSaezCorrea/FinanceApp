import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildUserRepo } from "../../../support/repositories";
import type { MfaCodePurpose } from "../../../../../src/domains/mfa-code/domain/mfa-code";
import { PrismaMfaCodeRepository } from "../../../../../src/domains/mfa-code/infrastructure/prisma-mfa-code.repository";
import { generateRowId } from "../../../../../src/infra/id/generate-row-id";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/** Integration (specs/040 US3): the `mfa-code` adapter against a real Postgres. */
describe("PrismaMfaCodeRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const repo = new PrismaMfaCodeRepository(prisma);
  let userId: string;

  const plan = (purpose: MfaCodePurpose, createdAt = new Date()) => ({
    id: generateRowId(),
    userId,
    purpose,
    channel: "EMAIL" as const,
    codeHash: `h_${randomUUID()}`,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 10 * 60_000),
  });

  beforeAll(async () => {
    await prisma.$connect();
    userId = (
      await userRepo.create({
        email: `int_mfacode_${randomUUID()}@test.local`,
        name: "Codes",
        passwordHash: "x",
        birthDate: new Date("1990-01-01"),
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("a new code replaces the active one of the same purpose, not of another", async () => {
    const first = plan("LOGIN");
    const other = plan("STEP_UP");
    await repo.issue(first);
    await repo.issue(other);
    const second = plan("LOGIN");
    expect(await repo.issue(second)).toEqual({ issued: true });

    const now = new Date();
    expect((await repo.findActive(userId, "LOGIN", now))?.id).toBe(second.id);
    expect((await repo.findActive(userId, "STEP_UP", now))?.id).toBe(other.id);
    expect(await repo.issuedSince(userId, "LOGIN", new Date(now.getTime() - 60_000))).toHaveLength(
      2,
    );
  });

  it("concurrent issues leave exactly one active code", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => repo.issue(plan("ENROLL"))));
    expect(results.some((r) => r.issued)).toBe(true);
    const active = await prisma.mfaCode.count({
      where: { userId, purpose: "ENROLL", usedAt: null },
    });
    expect(active).toBe(1);
  });

  it("consumes a code once, and never an expired one", async () => {
    const code = plan("STEP_UP");
    await repo.issue(code);
    const now = new Date();
    const [a, b] = await Promise.all([
      prisma.$transaction((tx) => repo.consumeWithTx(tx, code.id, now)),
      prisma.$transaction((tx) => repo.consumeWithTx(tx, code.id, now)),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);

    const old = plan("STEP_UP", new Date(Date.now() - 20 * 60_000));
    await repo.issue(old);
    expect(await repo.findActive(userId, "STEP_UP", new Date())).toBeNull();
    expect(await prisma.$transaction((tx) => repo.consumeWithTx(tx, old.id, new Date()))).toBe(
      false,
    );
  });

  it("purges codes used or expired before the cutoff", async () => {
    const purged = await repo.purgeStale(new Date(Date.now() + 60 * 60_000));
    expect(purged).toBeGreaterThan(0);
    expect(await prisma.mfaCode.count({ where: { userId } })).toBe(0);
  });
});
