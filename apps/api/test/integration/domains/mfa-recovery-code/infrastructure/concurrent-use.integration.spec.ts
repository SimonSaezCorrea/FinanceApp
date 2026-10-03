import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildMfaRecoveryCodeRepo, buildUserRepo } from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Proves `markUsedWithTx`'s atomic `UPDATE ... WHERE usedAt IS NULL` genuinely prevents a
 * double-claim — two concurrent requests racing the same recovery code must never both win.
 */
describe("MfaRecoveryCode concurrent use (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const recoveryCodeRepo = buildMfaRecoveryCodeRepo(prisma);
  const email = `int_mfarace_${randomUUID()}@test.local`;
  let userId: string;
  let codeId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({
      email,
      name: "Race Test",
      passwordHash: "x",
      birthDate: new Date("1990-01-01"),
    });
    userId = user.id;
    const row = await prisma.mfaRecoveryCode.create({ data: { userId, codeHash: "irrelevant" } });
    codeId = row.id;
  });

  afterAll(async () => {
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("exactly one of two concurrent claims on the same code succeeds", async () => {
    const results = await Promise.all([
      prisma.$transaction((tx) => recoveryCodeRepo.markUsedWithTx(tx, codeId)),
      prisma.$transaction((tx) => recoveryCodeRepo.markUsedWithTx(tx, codeId)),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const row = await prisma.mfaRecoveryCode.findUniqueOrThrow({ where: { id: codeId } });
    expect(row.usedAt).not.toBeNull();
  });
});
