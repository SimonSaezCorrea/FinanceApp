import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaStorageDeletionRepository } from "../../../../src/domains/storage-deletion/infrastructure/prisma-storage-deletion.repository";
import { PrismaAttachmentRepository } from "../../../../src/domains/transaction-attachment/infrastructure/prisma-attachment.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * Security run-3: deleting an attachment row — directly, or by cascade from its movement or its
 * user — queues its file for the maintenance cron (database trigger), so no path leaves a file in
 * object storage with nothing pointing at it.
 */
describe("storage-deletion trigger (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaStorageDeletionRepository(prisma);
  const userId = `u_${randomUUID()}`;
  const keys: string[] = [];

  async function attachment(transactionId: string): Promise<string> {
    const storageKey = randomUUID();
    keys.push(storageKey);
    await prisma.transactionAttachment.create({
      data: {
        userId,
        transactionId,
        storageKey,
        fileName: "boleta.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
      },
    });
    return storageKey;
  }

  async function movement(): Promise<string> {
    const row = await prisma.transaction.create({
      data: { userId, type: "EXPENSE", amount: "1000", currency: "CLP", occurredAt: new Date() },
    });
    return row.id;
  }

  const queued = async (storageKey: string) =>
    prisma.storageDeletion.count({ where: { storageKey } });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.storageDeletion.deleteMany({ where: { storageKey: { in: keys } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("queues the file when the attachment row is deleted", async () => {
    const key = await attachment(await movement());
    expect(await queued(key)).toBe(0);
    await prisma.transactionAttachment.deleteMany({ where: { storageKey: key } });
    expect(await queued(key)).toBe(1);
  });

  it("queues the files of a movement deleted with its attachments (cascade)", async () => {
    const tx = await movement();
    const a = await attachment(tx);
    const b = await attachment(tx);
    await prisma.transaction.delete({ where: { id: tx } });
    expect(await queued(a)).toBe(1);
    expect(await queued(b)).toBe(1);
  });

  it("queues every file of a deleted user (cascade)", async () => {
    const otherUser = `u_${randomUUID()}`;
    await prisma.user.create({
      data: { id: otherUser, email: `${otherUser}@test.local`, passwordHash: "x", name: "Gone" },
    });
    const tx = await prisma.transaction.create({
      data: {
        userId: otherUser,
        type: "EXPENSE",
        amount: "1",
        currency: "CLP",
        occurredAt: new Date(),
      },
    });
    const storageKey = randomUUID();
    keys.push(storageKey);
    await prisma.transactionAttachment.create({
      data: {
        userId: otherUser,
        transactionId: tx.id,
        storageKey,
        fileName: "x.pdf",
        contentType: "application/pdf",
        sizeBytes: 1,
      },
    });
    await prisma.user.delete({ where: { id: otherUser } });
    expect(await queued(storageKey)).toBe(1);
  });

  it("the repository lists, counts failures on and forgets queued files; ids are UUID v7", async () => {
    const key = await attachment(await movement());
    await prisma.transactionAttachment.deleteMany({ where: { storageKey: key } });
    const row = await prisma.storageDeletion.findFirstOrThrow({ where: { storageKey: key } });
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    await repo.recordFailure([row.id]);
    expect(
      (await prisma.storageDeletion.findUniqueOrThrow({ where: { id: row.id } })).attempts,
    ).toBe(1);
    const pending = await repo.listPending(10_000);
    expect(pending.some((p) => p.id === row.id)).toBe(true);
    await repo.remove([row.id]);
    expect(await queued(key)).toBe(0);
  });

  it("the orphan sweep's reads: which keys still have a row, and which are queued", async () => {
    const attachments = new PrismaAttachmentRepository(prisma);
    const live = await attachment(await movement());
    const orphan = randomUUID();
    keys.push(orphan);
    expect([...(await attachments.existingStorageKeys([live, orphan]))]).toEqual([live]);

    expect((await repo.queuedKeys([orphan])).size).toBe(0);
    await repo.enqueue([orphan]);
    expect([...(await repo.queuedKeys([orphan, live]))]).toEqual([orphan]);
  });
});
