import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", () => ({
  verifyRegistrationResponse: vi.fn(),
}));

import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { ConfirmPasskeyRegistrationHandler } from "../../../../../../src/domains/user/application/commands/confirm-passkey-registration.handler";
import { ConfirmPasskeyRegistrationCommand } from "../../../../../../src/domains/user/application/commands/confirm-passkey-registration.command";
import { PasskeyChallengeInvalidError } from "../../../../../../src/domains/user/domain/errors";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";

function fakePasskeys(overrides: Partial<PasskeyRepositoryPort> = {}): PasskeyRepositoryPort {
  return {
    createWithTx: vi.fn().mockResolvedValue({
      id: "p1",
      userId: "u1",
      name: "MacBook",
      credentialId: "cred1",
      publicKey: "pk",
      counter: 0,
      transports: [],
      createdAt: "2024-01-01T00:00:00Z",
      lastUsedAt: null,
    }),
    findByUserId: vi.fn(),
    findByCredentialId: vi.fn(),
    findByIdOwned: vi.fn(),
    updateCounterAndLastUsedWithTx: vi.fn(),
    deleteOwned: vi.fn(),
    renameOwned: vi.fn(),
    ...overrides,
  };
}

function config(): ConfigService {
  return new ConfigService({ CORS_ORIGIN: "http://localhost:5173" });
}

function fakePrisma(): PrismaService {
  return {} as unknown as PrismaService;
}

describe("ConfirmPasskeyRegistrationHandler", () => {
  it("creates a Passkey on a verified response", async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "cred1",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    } as never);
    const passkeys = fakePasskeys();
    const handler = new ConfirmPasskeyRegistrationHandler(
      { publish: vi.fn() } as never,
      passkeys,
      config(),
      fakePrisma(),
    );

    const result = await handler.execute(
      new ConfirmPasskeyRegistrationCommand("u1", "MacBook", { fake: "response" }, "challenge123"),
    );

    expect(result.name).toBe("MacBook");
    expect(passkeys.createWithTx).toHaveBeenCalledTimes(1);
    const plan = (passkeys.createWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(plan).toMatchObject({
      userId: "u1",
      name: "MacBook",
      credentialId: "cred1",
      counter: 0,
    });
  });

  it("rejects and creates nothing when verification fails", async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({ verified: false } as never);
    const passkeys = fakePasskeys();
    const handler = new ConfirmPasskeyRegistrationHandler(
      { publish: vi.fn() } as never,
      passkeys,
      config(),
      fakePrisma(),
    );

    await expect(
      handler.execute(
        new ConfirmPasskeyRegistrationCommand(
          "u1",
          "MacBook",
          { fake: "response" },
          "challenge123",
        ),
      ),
    ).rejects.toThrow(PasskeyChallengeInvalidError);
    expect(passkeys.createWithTx).not.toHaveBeenCalled();
  });

  it("rejects when the library throws (e.g. bad challenge/origin)", async () => {
    vi.mocked(verifyRegistrationResponse).mockRejectedValue(new Error("bad origin"));
    const passkeys = fakePasskeys();
    const handler = new ConfirmPasskeyRegistrationHandler(
      { publish: vi.fn() } as never,
      passkeys,
      config(),
      fakePrisma(),
    );

    await expect(
      handler.execute(
        new ConfirmPasskeyRegistrationCommand(
          "u1",
          "MacBook",
          { fake: "response" },
          "challenge123",
        ),
      ),
    ).rejects.toThrow(PasskeyChallengeInvalidError);
  });
});
