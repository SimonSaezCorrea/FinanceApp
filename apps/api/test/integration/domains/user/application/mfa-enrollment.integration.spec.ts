import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import * as OTPAuth from "otpauth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StartMfaEnrollmentHandler } from "../../../../../src/domains/user/application/commands/start-mfa-enrollment.handler";
import { StartMfaEnrollmentCommand } from "../../../../../src/domains/user/application/commands/start-mfa-enrollment.command";
import { ConfirmMfaEnrollmentHandler } from "../../../../../src/domains/user/application/commands/confirm-mfa-enrollment.handler";
import { ConfirmMfaEnrollmentCommand } from "../../../../../src/domains/user/application/commands/confirm-mfa-enrollment.command";
import { buildMfaRecoveryCodeRepo, buildUserRepo } from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (Constitution VI/IX) — requires `DATABASE_URL` pointing at a
 * reachable Postgres. Exercises enroll->confirm end to end against real rows: verifies the
 * secret is stored ENCRYPTED (never plaintext) and that the 10 recovery codes land as separate
 * hashed rows with `usedAt: null`.
 */
describe("MFA enrollment (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const recoveryCodeRepo = buildMfaRecoveryCodeRepo(prisma);
  const email = `int_mfa_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({ email, name: "MFA Test", passwordHash: "x" });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("stores the secret encrypted and creates 10 unused recovery code rows on confirm", async () => {
    const startHandler = new StartMfaEnrollmentHandler({ publish: () => {} } as never, userRepo);
    const { secret } = await startHandler.execute(new StartMfaEnrollmentCommand(userId));

    // The raw column must never equal the plaintext secret.
    const rawRow = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(rawRow.mfaSecretEncrypted).not.toBeNull();
    expect(rawRow.mfaSecretEncrypted).not.toBe(secret);
    expect(rawRow.mfaEnabled).toBe(false);

    const code = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    }).generate();

    const confirmHandler = new ConfirmMfaEnrollmentHandler(
      { publish: () => {} } as never,
      userRepo,
      recoveryCodeRepo,
      prisma,
    );
    const { recoveryCodes } = await confirmHandler.execute(
      new ConfirmMfaEnrollmentCommand(userId, { code }),
    );
    expect(recoveryCodes).toHaveLength(10);

    const confirmedRow = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(confirmedRow.mfaEnabled).toBe(true);

    const rows = await prisma.mfaRecoveryCode.findMany({ where: { userId } });
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.usedAt === null)).toBe(true);
    expect(rows.every((r) => r.codeHash !== recoveryCodes[0])).toBe(true);
  });
});
