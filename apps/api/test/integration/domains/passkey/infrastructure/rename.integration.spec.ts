import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildUserRepo } from "../../../support/repositories";
import { PrismaPasskeyRepository } from "../../../../../src/domains/passkey/infrastructure/prisma-passkey.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("PrismaPasskeyRepository.renameOwned (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const passkeyRepo = new PrismaPasskeyRepository(prisma);
  const email = `int_passkey_rename_${randomUUID()}@test.local`;
  let userId: string;
  let otherUserId: string;
  let passkeyId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({
      email,
      name: "Rename Test",
      passwordHash: "x",
      birthDate: new Date("1990-01-01"),
    });
    userId = user.id;
    const other = await userRepo.create({
      email: `int_passkey_rename_other_${randomUUID()}@test.local`,
      name: "Other",
      passwordHash: "x",
      birthDate: new Date("1990-01-01"),
    });
    otherUserId = other.id;
    const row = await prisma.passkey.create({
      data: {
        userId,
        name: "Original Name",
        credentialId: `cred_${randomUUID()}`,
        publicKey: "AQID",
      },
    });
    passkeyId = row.id;
  });

  afterAll(async () => {
    await prisma.passkey.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("refuses to rename a passkey belonging to a different user", async () => {
    const result = await passkeyRepo.renameOwned(otherUserId, passkeyId, "Hijacked");
    expect(result).toBeNull();
    const row = await prisma.passkey.findUniqueOrThrow({ where: { id: passkeyId } });
    expect(row.name).toBe("Original Name");
  });

  it("renames the row and preserves createdAt/lastUsedAt", async () => {
    const before = await prisma.passkey.findUniqueOrThrow({ where: { id: passkeyId } });

    const result = await passkeyRepo.renameOwned(userId, passkeyId, "New Name");

    expect(result?.name).toBe("New Name");
    const after = await prisma.passkey.findUniqueOrThrow({ where: { id: passkeyId } });
    expect(after.name).toBe("New Name");
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.lastUsedAt).toEqual(before.lastUsedAt);
  });
});
