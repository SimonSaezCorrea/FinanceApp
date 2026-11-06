import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { ConfirmPasskeyRegistrationHandler } from "../../../../../../src/domains/user/application/commands/confirm-passkey-registration.handler";
import { ConfirmPasskeyRegistrationCommand } from "../../../../../../src/domains/user/application/commands/confirm-passkey-registration.command";
import type { AuthenticatorCatalog } from "../../../../../../src/domains/user/application/authenticator-catalog";
import type { PasskeyAttestation } from "../../../../../../src/domains/user/application/passkey-attestation";
import {
  PasskeyAuthenticatorCompromisedError,
  PasskeyChallengeInvalidError,
} from "../../../../../../src/domains/user/domain/errors";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";

function fakePasskeys(overrides: Partial<PasskeyRepositoryPort> = {}): PasskeyRepositoryPort {
  return {
    createWithTx: vi.fn(async (_tx: unknown, plan: Record<string, unknown>) => ({
      id: "p1",
      userId: "u1",
      name: plan.name as string,
      credentialId: "cred1",
      publicKey: "pk",
      counter: 0,
      transports: [],
      createdAt: "2024-01-01T00:00:00Z",
      lastUsedAt: null,
      aaguid: (plan.aaguid as string | null) ?? null,
      authenticatorName: (plan.authenticatorName as string | null) ?? null,
      verifiedAt: plan.verifiedAt ? "2024-01-01T00:00:00Z" : null,
      compromisedAt: null,
      compromisedReason: null,
    })) as never,
    findByUserId: vi.fn(),
    findByCredentialId: vi.fn(),
    findByIdOwned: vi.fn(),
    updateCounterAndLastUsedWithTx: vi.fn(),
    deleteOwned: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    countUsable: vi.fn().mockResolvedValue(0),
    markCompromisedWithTx: vi.fn().mockResolvedValue([]),
    renameOwned: vi.fn(),
    ...overrides,
  };
}

const VERIFIED = {
  verified: true,
  registrationInfo: {
    credential: { id: "cred1", publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
  },
};

function setup(opts: { outcome?: unknown; throws?: boolean; compromised?: string | null }) {
  const passkeys = fakePasskeys();
  const publish = vi.fn();
  const attestation = {
    verifyRegistration: opts.throws
      ? vi.fn().mockRejectedValue(new Error("bad origin"))
      : vi.fn().mockResolvedValue(opts.outcome),
  } as unknown as PasskeyAttestation;
  const catalog = {
    compromisedStatus: vi.fn().mockResolvedValue(opts.compromised ?? null),
  } as unknown as AuthenticatorCatalog;
  const handler = new ConfirmPasskeyRegistrationHandler(
    { publish } as never,
    passkeys,
    new ConfigService({ CORS_ORIGIN: "http://localhost:5173" }),
    {} as unknown as PrismaService,
    attestation,
    catalog,
  );
  const run = () =>
    handler.execute(
      new ConfirmPasskeyRegistrationCommand("u1", "MacBook", { fake: "response" }, "challenge123"),
    );
  return { passkeys, publish, run };
}

describe("ConfirmPasskeyRegistrationHandler", () => {
  it("creates an unverified Passkey when the authenticator proved no model", async () => {
    const { passkeys, run, publish } = setup({
      outcome: { verification: VERIFIED, authenticator: null },
    });
    const result = await run();
    expect(result).toMatchObject({
      name: "MacBook",
      status: "unverified",
      authenticatorName: null,
    });
    const plan = (passkeys.createWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(plan).toMatchObject({
      userId: "u1",
      credentialId: "cred1",
      aaguid: null,
      verifiedAt: null,
    });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "PASSKEY_ADDED", model: undefined }),
    );
  });

  it("stores the verified model and names it in the notice (specs/041)", async () => {
    const { passkeys, run, publish } = setup({
      outcome: { verification: VERIFIED, authenticator: { aaguid: "a-1", name: "YubiKey 5" } },
    });
    const result = await run();
    expect(result).toMatchObject({ status: "verified", authenticatorName: "YubiKey 5" });
    const plan = (passkeys.createWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(plan.aaguid).toBe("a-1");
    expect(plan.verifiedAt).toBeInstanceOf(Date);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "PASSKEY_ADDED", model: "YubiKey 5" }),
    );
  });

  it("refuses a verified model the catalog declares compromised, saving nothing", async () => {
    const { passkeys, run } = setup({
      outcome: { verification: VERIFIED, authenticator: { aaguid: "a-1", name: "Bad key" } },
      compromised: "ATTESTATION_KEY_COMPROMISE",
    });
    await expect(run()).rejects.toThrow(PasskeyAuthenticatorCompromisedError);
    expect(passkeys.createWithTx).not.toHaveBeenCalled();
  });

  it("rejects and creates nothing when verification fails", async () => {
    const { passkeys, run } = setup({
      outcome: { verification: { verified: false }, authenticator: null },
    });
    await expect(run()).rejects.toThrow(PasskeyChallengeInvalidError);
    expect(passkeys.createWithTx).not.toHaveBeenCalled();
  });

  it("rejects when the library throws (e.g. bad challenge/origin)", async () => {
    const { run } = setup({ throws: true });
    await expect(run()).rejects.toThrow(PasskeyChallengeInvalidError);
  });
});
