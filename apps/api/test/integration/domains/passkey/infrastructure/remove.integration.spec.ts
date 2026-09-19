import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildUserRepo } from "../../../support/repositories";
import { PrismaPasskeyRepository } from "../../../../../src/domains/passkey/infrastructure/prisma-passkey.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("PrismaPasskeyRepository.deleteOwned (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const passkeyRepo = new PrismaPasskeyRepository(prisma);
  const email = `int_passkey_remove_${randomUUID()}@test.local`;
  let userId: string;
  let otherUserId: string;
  let passkeyId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({ email, name: "Remove Test", passwordHash: "x" });
    userId = user.id;
    const other = await userRepo.create({
      email: `int_passkey_remove_other_${randomUUID()}@test.local`,
      name: "Other",
      passwordHash: "x",
    });
    otherUserId = other.id;
    const row = await prisma.passkey.create({
      data: { userId, name: "To Delete", credentialId: `cred_${randomUUID()}`, publicKey: "AQID" },
    });
    passkeyId = row.id;
  });

  afterAll(async () => {
    await prisma.passkey.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("refuses to delete a passkey belonging to a different user", async () => {
    const deleted = await passkeyRepo.deleteOwned(otherUserId, passkeyId);
    expect(deleted).toBe(false);
    expect(await prisma.passkey.findUnique({ where: { id: passkeyId } })).not.toBeNull();
  });

  it("deletes the row and a subsequent lookup finds nothing", async () => {
    const deleted = await passkeyRepo.deleteOwned(userId, passkeyId);
    expect(deleted).toBe(true);
    expect(await prisma.passkey.findUnique({ where: { id: passkeyId } })).toBeNull();
    expect(await passkeyRepo.findByUserId(userId)).toHaveLength(0);
  });
});
