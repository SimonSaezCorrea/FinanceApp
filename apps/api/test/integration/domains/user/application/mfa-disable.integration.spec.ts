import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DisableMfaHandler } from "../../../../../src/domains/user/application/commands/disable-mfa.handler";
import { DisableMfaCommand } from "../../../../../src/domains/user/application/commands/disable-mfa.command";
import { buildMfaRecoveryCodeRepo, buildUserRepo } from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("MFA disable (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const recoveryCodeRepo = buildMfaRecoveryCodeRepo(prisma);
  const email = `int_mfadisable_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const passwordHash = await hash("correct-pw", 4);
    const user = await prisma.user.create({
      data: { email, name: "Disable Test", passwordHash, mfaEnabled: true, mfaSecretEncrypted: null },
    });
    userId = user.id;
    await prisma.mfaRecoveryCode.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({ userId, codeHash: `hash-${i}` })),
    });
  });

  afterAll(async () => {
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("clears MFA state and deletes every recovery code row atomically", async () => {
    const handler = new DisableMfaHandler(
      { publish: () => {} } as never,
      userRepo,
      recoveryCodeRepo,
      prisma,
    );
    await handler.execute(new DisableMfaCommand(userId, { password: "correct-pw" }));

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.mfaEnabled).toBe(false);
    expect(row.mfaSecretEncrypted).toBeNull();

    const remaining = await prisma.mfaRecoveryCode.count({ where: { userId } });
    expect(remaining).toBe(0);
  });
});
