import { ConfigService } from "@nestjs/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { IdempotencyRecord } from "../../../../src/domains/idempotency-record/domain/idempotency-record.aggregate";
import { PrismaIdempotencyRecordRepository } from "../../../../src/domains/idempotency-record/infrastructure/prisma-idempotency-record.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * THE test for the invariant the entire feature rests on
 * (specs/015-idempotent-money-writes/research.md §3, quickstart scenario 16).
 *
 * Because the effect and the COMPLETED mark commit in the SAME transaction,
 * only two outcomes exist: both or neither. From that follows
 *
 *     IN_FLIGHT  ⟹  the effect did not commit
 *
 * which is what makes taking over a stale reservation safe rather than a gamble,
 * and what makes a retry after a crash correct rather than a duplicate.
 *
 * Without this test nothing stops someone from "simplifying" the design into
 * marking COMPLETED *after* the effect commits — which looks equivalent and
 * silently reintroduces the exact duplication the feature removes.
 */
describe("Idempotency: effect and COMPLETED commit together, or not at all (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaIdempotencyRecordRepository(prisma);
  let userId: string;
  let accountId: string;

  const plan = (key: string) =>
    IdempotencyRecord.planReservation({
      key,
      operation: "transaction.create",
      requestHash: "hash-a",
      now: new Date(),
    });

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `rollback-${Date.now()}@test.local`, name: "Rollback test" },
    });
    userId = user.id;
    const account = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Cuenta de prueba",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "123456",
        initialBalance: "100000",
        currentBalance: "100000",
      },
    });
    accountId = account.id;
  });

  afterEach(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.idempotencyRecord.deleteMany({ where: { userId } });
    await prisma.bankAccount.update({
      where: { id: accountId },
      data: { currentBalance: "100000" },
    });
  });

  afterAll(async () => {
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("commits the movement, the balance AND the COMPLETED mark together", async () => {
    const reservation = await repo.reserve(userId, plan("key-commit-00000000"));
    const recordId = reservation.record.id;

    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          userId,
          bankAccountId: accountId,
          type: "EXPENSE",
          amount: "12000",
          currency: "CLP",
          occurredAt: new Date(),
        },
      });
      await tx.bankAccount.update({
        where: { id: accountId },
        data: { currentBalance: { decrement: 12000 } },
      });
      await repo.completeWithTx(tx, recordId, { id: "t1" }, 201);
    });

    expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.currentBalance.toString()).toBe("88000");
    const record = await prisma.idempotencyRecord.findUniqueOrThrow({ where: { id: recordId } });
    expect(record.status).toBe("COMPLETED");
  });

  it("leaves NOTHING behind when the effect fails after the reservation", async () => {
    const reservation = await repo.reserve(userId, plan("key-rollback-000000"));
    const recordId = reservation.record.id;

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            userId,
            bankAccountId: accountId,
            type: "EXPENSE",
            amount: "12000",
            currency: "CLP",
            occurredAt: new Date(),
          },
        });
        await tx.bankAccount.update({
          where: { id: accountId },
          data: { currentBalance: { decrement: 12000 } },
        });
        await repo.completeWithTx(tx, recordId, { id: "t1" }, 201);
        // Fails AFTER the mark — the hardest ordering, and the one a two-phase
        // design would get wrong.
        throw new Error("effect failed");
      }),
    ).rejects.toThrow("effect failed");

    expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.currentBalance.toString()).toBe("100000");

    // The heart of it: the attempt did NOT end up marked as applied.
    const record = await prisma.idempotencyRecord.findUniqueOrThrow({ where: { id: recordId } });
    expect(record.status).toBe("IN_FLIGHT");
    expect(record.responseBody).toBeNull();
  });

  it("an IN_FLIGHT record never coexists with a committed effect", async () => {
    // The invariant stated directly: after a failed attempt, taking the record
    // over cannot resurrect an effect, because there is none to resurrect.
    const reservation = await repo.reserve(userId, plan("key-invariant-00000"));

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            userId,
            bankAccountId: accountId,
            type: "EXPENSE",
            amount: "5000",
            currency: "CLP",
            occurredAt: new Date(),
          },
        });
        await repo.completeWithTx(tx, reservation.record.id, { id: "t1" }, 201);
        throw new Error("boom");
      }),
    ).rejects.toThrow();

    const stored = await prisma.idempotencyRecord.findUniqueOrThrow({
      where: { id: reservation.record.id },
    });
    const effects = await prisma.transaction.count({ where: { userId } });

    expect(stored.status).toBe("IN_FLIGHT");
    expect(effects).toBe(0);
  });
});
