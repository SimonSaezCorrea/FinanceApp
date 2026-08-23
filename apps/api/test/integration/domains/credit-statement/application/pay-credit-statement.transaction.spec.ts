import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PayCreditStatementCommand } from "../../../../../src/domains/credit-statement/application/commands/pay-credit-statement.command";
import { PayCreditStatementHandler } from "../../../../../src/domains/credit-statement/application/commands/pay-credit-statement.handler";
import {
  buildBankAccountRepo,
  buildCreditStatementRepo,
  buildInstallmentPlanRepo,
  buildTransactionWriterRepo,
} from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Integration test (T029b, FR-020): forces a failure on the THIRD save inside
 * `PayCreditStatementHandler`'s cross-aggregate transaction and asserts the
 * CreditStatement + payment Transaction writes are ALSO rolled back — proves
 * the atomicity guarantee, not just that all three succeed on the happy path.
 * Requires a reachable Postgres (real test DB, not part of `test:unit`).
 */
describe("PayCreditStatementHandler cross-aggregate transaction (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let creditAccountId: string;
  let fromAccountId: string;
  let statementId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, email: `${userId}@test.local` } });
    const creditAccount = await accountRepo.createWithCards(userId, {
      name: "Credit line",
      type: "CREDIT_CARD",
      status: "ACTIVE",
      currency: "CLP",
      institution: null,
      institutionId: null,
      accountNumber: undefined,
      accountAlias: null,
      initialBalance: "0",
      overdraftLimit: "0",
      balanceCeiling: null,
      creditLimit: "100000",
      creditUsedInitial: "50000",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
    creditAccountId = creditAccount.id;
    const fromAccount = await accountRepo.createWithCards(userId, {
      name: "Checking",
      type: "CHECKING",
      status: "ACTIVE",
      currency: "CLP",
      institution: null,
      institutionId: null,
      accountNumber: "123",
      accountAlias: null,
      initialBalance: "0",
      overdraftLimit: "0",
      balanceCeiling: null,
      creditLimit: "0",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
    fromAccountId = fromAccount.id;

    const statement = await prisma.creditStatement.create({
      data: { accountId: creditAccountId, periodStart: new Date("2026-01-01") },
    });
    statementId = statement.id;
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: creditAccountId,
        type: "EXPENSE",
        amount: "10000",
        currency: "CLP",
        occurredAt: new Date(),
        creditStatementId: statementId,
      },
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { accountId: creditAccountId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rolls back the statement + payment transaction if the account save fails", async () => {
    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      buildTransactionWriterRepo(prisma),
      buildInstallmentPlanRepo(prisma),
      prisma,
    );
    // Force the third save (BankAccount) to fail by breaking its saveWithTx.
    vi.spyOn(accountRepo, "saveWithTx").mockRejectedValueOnce(new Error("forced failure"));

    await expect(
      handler.execute(
        new PayCreditStatementCommand(userId, creditAccountId, statementId, fromAccountId),
      ),
    ).rejects.toThrow("forced failure");

    const statement = await statementRepo.findById(userId, creditAccountId, statementId);
    expect(statement?.state.name).toBe("OPEN"); // NOT paid — rolled back

    const paymentTxCount = await prisma.transaction.count({
      where: { bankAccountId: fromAccountId, type: "EXPENSE" },
    });
    expect(paymentTxCount).toBe(0); // the payment Transaction was rolled back too

    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.creditUsed).toBe("50000.0000"); // unchanged — rolled back
  });
});
