import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { VerifyMfaLoginHandler } from "../../../../../src/domains/user/application/commands/verify-mfa-login.handler";
import { VerifyMfaLoginCommand } from "../../../../../src/domains/user/application/commands/verify-mfa-login.command";
import { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";
import { buildMfaRecoveryCodeRepo, buildUserRepo } from "../../../support/repositories";
import { getMfaEncryptionKey } from "../../../../../src/infra/config/mfa.config";
import { encryptMfaSecret } from "../../../../../src/domains/user/application/mfa-secret-cipher";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Proves the `SELECT ... FOR UPDATE` row lock in `findByIdForUpdateWithTx` genuinely closes the
 * concurrent-attempt race: without it, N concurrent invalid codes reading the same stale
 * `mfaFailedAttempts` value would all write back the same incremented value instead of N
 * distinct increments (the exact bug class `debt`'s `register-payment` had before specs/015).
 */
describe("MFA login rate limit under concurrency (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const recoveryCodeRepo = buildMfaRecoveryCodeRepo(prisma);
  const tokenIssuer = new TokenIssuer({ sign: () => "t" } as never, new ConfigService());
  const email = `int_mfarate_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const config = new ConfigService();
    const mfaSecretEncrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP", getMfaEncryptionKey(config));
    const user = await prisma.user.create({
      data: { email, name: "Rate Test", mfaEnabled: true, mfaSecretEncrypted },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("5 concurrent invalid attempts against a fresh counter each count exactly once", async () => {
    // mfaSecretEncrypted is garbage on purpose — every attempt is guaranteed invalid, isolating
    // this test to the counter-increment race, not TOTP validity.
    const handler = new VerifyMfaLoginHandler(
      { publish: () => {} } as never,
      userRepo,
      recoveryCodeRepo,
      tokenIssuer,
      prisma,
    );

    const attempts = Array.from({ length: 5 }, () =>
      handler.execute(new VerifyMfaLoginCommand(userId, { code: "000000" })).catch((e) => e),
    );
    await Promise.all(attempts);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.mfaFailedAttempts).toBe(5);
    expect(row.mfaLockedUntil).not.toBeNull();
  });
});
