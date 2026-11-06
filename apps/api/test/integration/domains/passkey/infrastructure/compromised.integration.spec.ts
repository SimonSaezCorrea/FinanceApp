import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildUserRepo } from "../../../support/repositories";
import { PrismaPasskeyRepository } from "../../../../../src/domains/passkey/infrastructure/prisma-passkey.repository";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { generateRowId } from "../../../../../src/infra/id/generate-row-id";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/** Integration (specs/041): marking passkeys of a compromised model, and closing their sessions. */
describe("Compromised passkeys (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const passkeys = new PrismaPasskeyRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const AAGUID = `aaguid-${randomUUID()}`;
  let userId: string;
  let verifiedId: string;
  let unverifiedId: string;
  let otherModelId: string;

  const passkey = (data: Record<string, unknown>) =>
    prisma.passkey.create({
      data: {
        userId,
        name: "Llave",
        credentialId: `cred_${randomUUID()}`,
        publicKey: "AQID",
        ...data,
      },
    });

  beforeAll(async () => {
    await prisma.$connect();
    userId = (
      await userRepo.create({
        email: `int_passkey_compromised_${randomUUID()}@test.local`,
        name: "Compromised",
        passwordHash: "x",
        birthDate: new Date("1990-01-01"),
      })
    ).id;
    verifiedId = (
      await passkey({ aaguid: AAGUID, authenticatorName: "Key", verifiedAt: new Date() })
    ).id;
    // Same AAGUID but never verified (e.g. a "none" attestation): never marked.
    unverifiedId = (await passkey({ aaguid: AAGUID })).id;
    otherModelId = (await passkey({ aaguid: "other", verifiedAt: new Date() })).id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.passkey.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("marks only verified passkeys of the model, once, and counts usable ones", async () => {
    expect(await passkeys.countUsable(userId)).toBe(3);
    const reasons = new Map([[AAGUID, "REVOKED"]]);
    const now = new Date();
    const first = await prisma.$transaction((tx) =>
      passkeys.markCompromisedWithTx(tx, reasons, now),
    );
    expect(first.map((p) => p.id)).toEqual([verifiedId]);
    const again = await prisma.$transaction((tx) =>
      passkeys.markCompromisedWithTx(tx, reasons, now),
    );
    expect(again).toEqual([]);

    const row = await passkeys.findByIdOwned(userId, verifiedId);
    expect(row?.compromisedReason).toBe("REVOKED");
    expect((await passkeys.findByIdOwned(userId, unverifiedId))?.compromisedAt).toBeNull();
    expect((await passkeys.findByIdOwned(userId, otherModelId))?.compromisedAt).toBeNull();
    expect(await passkeys.countUsable(userId)).toBe(2);
  });

  it("closes only the open sessions opened with the given passkeys", async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const mk = (passkeyId: string | null) =>
      sessions.create({
        id: generateRowId(),
        userId,
        deviceLabel: null,
        country: null,
        city: null,
        expiresAt,
        passkeyId,
      });
    const withKey = await mk(verifiedId);
    const withOther = await mk(otherModelId);
    const withPassword = await mk(null);

    const closed = await prisma.$transaction((tx) =>
      sessions.closeByPasskeysWithTx(tx, [verifiedId], new Date()),
    );
    expect(closed).toBe(1);
    const open = (await sessions.listByUser(userId)).filter((s) => s.closedAt === null);
    expect(open.map((s) => s.id).sort()).toEqual([withOther.id, withPassword.id].sort());
    expect(open.some((s) => s.id === withKey.id)).toBe(false);
    expect(
      await prisma.$transaction((tx) => sessions.closeByPasskeysWithTx(tx, [], new Date())),
    ).toBe(0);
  });
});
