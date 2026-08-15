import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildBankAccountRepo, buildCreditStatementRepo } from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing at
 * a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not part
 * of `test:unit` (SC-002/SC-005).
 */
describe("PrismaCreditStatementRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let accountId: string;
  let fromAccountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const account = await accountRepo.createWithCards(userId, {
      name: "Test credit line",
      type: "CREDIT_CARD",
      status: "ACTIVE",
      currency: "CLP",
      institution: null,
      institutionId: null,
      accountNumber: undefined,
      initialBalance: "0",
      overdraftLimit: "0",
      creditLimit: "100000",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
    accountId = account.id;
    const fromAccount = await accountRepo.createWithCards(userId, {
      name: "Checking (pays the statement)",
      type: "CHECKING",
      status: "ACTIVE",
      currency: "CLP",
      institution: null,
      institutionId: null,
      accountNumber: "1234567890",
      initialBalance: "0",
      overdraftLimit: "0",
      creditLimit: "0",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
    fromAccountId = fromAccount.id;
  });

  afterAll(async () => {
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("finds no OPEN statement before any transaction has ever linked to one", async () => {
    const open = await statementRepo.findOpenForAccount(accountId);
    expect(open).toBeNull();
  });

  it("creates, closes, pays, and lists a statement end to end", async () => {
    const created = await prisma.creditStatement.create({
      data: { accountId, periodStart: new Date("2026-01-01") },
    });

    const open = await statementRepo.findOpenForAccount(accountId);
    expect(open?.id).toBe(created.id);

    open!.close(new Date("2026-02-01"));
    await statementRepo.save(open!);

    const afterClose = await statementRepo.findById(userId, accountId, created.id);
    expect(afterClose?.state.name).toBe("PENDING");

    const paymentTx = await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: fromAccountId,
        type: "EXPENSE",
        amount: "5000",
        currency: "CLP",
        occurredAt: new Date("2026-02-05"),
      },
    });

    afterClose!.payTowards("5000", "5000", fromAccountId, paymentTx.id, new Date("2026-02-05"));
    await statementRepo.save(afterClose!);

    const afterPay = await statementRepo.findById(userId, accountId, created.id);
    expect(afterPay?.state.name).toBe("PAID");
    expect(afterPay?.amount).toBe("5000.0000");

    const list = await statementRepo.listForAccount(userId, accountId);
    expect(list.some((s) => s.id === created.id)).toBe(true);
  });

  it("sumLinkedTransactions returns 0 for a statement with no linked transactions", async () => {
    const created = await prisma.creditStatement.create({
      data: { accountId, periodStart: new Date("2026-03-01") },
    });
    const sum = await statementRepo.sumLinkedTransactions(created.id);
    expect(sum).toBe("0");
  });
});
