import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaUserEmailRepository } from "../../../../src/domains/user-email/infrastructure/prisma-user-email.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/** Real-DB integration (specs/032): the partial unique indexes (one PRIMARY and one PENDING per
 * account) and the promote/add/remove transitions of the account's email registry. */
describe("PrismaUserEmailRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaUserEmailRepository(prisma);
  const email = `int_ue_${randomUUID()}@test.local`;
  let userId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email, name: "UE Int", passwordHash: "x" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("allows only one PRIMARY per account", async () => {
    await repo.createPrimaryWithTx(prisma, userId, email.toUpperCase(), null);
    await expect(
      prisma.userEmail.create({ data: { userId, address: "x@test.local", status: "PRIMARY" } }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect((await repo.findPrimary(userId))?.address).toBe(email);
  });

  it("allows only one PENDING per account; a new request retires the previous one", async () => {
    const now = new Date();
    const first = await prisma.$transaction((tx) =>
      repo.addPendingWithTx(tx, userId, "first@test.local", now),
    );
    await expect(
      prisma.userEmail.create({ data: { userId, address: "y@test.local", status: "PENDING" } }),
    ).rejects.toMatchObject({ code: "P2002" });

    const second = await prisma.$transaction((tx) =>
      repo.addPendingWithTx(tx, userId, "second@test.local", now),
    );
    expect((await repo.findPending(userId))?.id).toBe(second.id);
    expect((await repo.findById(first.id))?.status).toBe("PAST");
  });

  it("promoting the pending address moves the previous primary to history", async () => {
    const pending = await repo.findPending(userId);
    const previous = await repo.findPrimary(userId);
    const at = new Date();
    await prisma.$transaction((tx) => repo.promotePendingWithTx(tx, userId, pending!.id, at));

    const promoted = await repo.findById(pending!.id);
    expect(promoted).toMatchObject({ status: "PRIMARY" });
    expect(promoted?.verifiedAt).not.toBeNull();
    expect((await repo.findById(previous!.id))?.status).toBe("PAST");
    expect(await repo.findPending(userId)).toBeNull();
  });

  it("doesn't promote a pending address replaced meanwhile, and the rollback keeps the primary", async () => {
    const primaryBefore = await repo.findPrimary(userId);
    const stale = await prisma.$transaction((tx) =>
      repo.addPendingWithTx(tx, userId, "stale@test.local", new Date()),
    );
    // A newer request replaces it before its link is used.
    await prisma.$transaction((tx) =>
      repo.addPendingWithTx(tx, userId, "newer@test.local", new Date()),
    );

    await expect(
      prisma.$transaction(async (tx) => {
        if (!(await repo.promotePendingWithTx(tx, userId, stale.id, new Date()))) {
          throw new Error("not promoted");
        }
      }),
    ).rejects.toThrow("not promoted");
    expect((await repo.findPrimary(userId))?.id).toBe(primaryBefore!.id);
    expect((await repo.findById(stale.id))?.status).toBe("PAST");
  });

  it("removes only a non-primary address of its owner", async () => {
    const primary = await repo.findPrimary(userId);
    expect(await repo.removeOwned(userId, primary!.id)).toBe(false);

    const past = (await repo.listForUser(userId)).find((e) => e.status === "PAST");
    expect(await repo.removeOwned(randomUUID(), past!.id)).toBe(false);
    expect(await repo.removeOwned(userId, past!.id)).toBe(true);
  });
});
