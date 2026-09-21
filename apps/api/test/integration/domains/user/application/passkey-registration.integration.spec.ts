import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return { ...actual, verifyRegistrationResponse: vi.fn() };
});

import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { ConfirmPasskeyRegistrationHandler } from "../../../../../src/domains/user/application/commands/confirm-passkey-registration.handler";
import { ConfirmPasskeyRegistrationCommand } from "../../../../../src/domains/user/application/commands/confirm-passkey-registration.command";
import { buildUserRepo } from "../../../support/repositories";
import { PrismaPasskeyRepository } from "../../../../../src/domains/passkey/infrastructure/prisma-passkey.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test. The WebAuthn cryptographic verification itself
 * (`verifyRegistrationResponse`) is stubbed — simulating a full authenticator ceremony (a real
 * ECDSA keypair + CBOR-encoded attestation object) is out of proportion for this suite; what this
 * test actually proves is that a verified response results in a real, correctly-shaped `Passkey`
 * row in Postgres.
 */
describe("Passkey registration (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const passkeyRepo = new PrismaPasskeyRepository(prisma);
  const email = `int_passkey_reg_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({
      email,
      name: "Passkey Reg Test",
      passwordHash: "x",
      birthDate: new Date("1990-01-01"),
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.passkey.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("persists credentialId/publicKey/counter from a verified response", async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: `cred_${randomUUID()}`,
          publicKey: new Uint8Array([9, 8, 7]),
          counter: 0,
        },
      },
    } as never);

    const handler = new ConfirmPasskeyRegistrationHandler(
      { publish: () => {} } as never,
      passkeyRepo,
      new ConfigService({ CORS_ORIGIN: "http://localhost:5173" }),
      prisma,
    );

    const created = await handler.execute(
      new ConfirmPasskeyRegistrationCommand(userId, "Integration Test Device", {}, "any-challenge"),
    );

    const row = await prisma.passkey.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.userId).toBe(userId);
    expect(row.name).toBe("Integration Test Device");
    expect(row.counter).toBe(0);
    expect(row.lastUsedAt).toBeNull();
  });
});
