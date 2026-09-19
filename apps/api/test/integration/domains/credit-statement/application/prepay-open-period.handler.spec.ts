import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { RemoveTransactionCommand } from "../../../../../src/domains/transaction/application/commands/remove-transaction.command";
import { RemoveTransactionHandler } from "../../../../../src/domains/transaction/application/commands/remove-transaction.handler";
import { UpdateTransactionCommand } from "../../../../../src/domains/transaction/application/commands/update-transaction.command";
import { UpdateTransactionHandler } from "../../../../../src/domains/transaction/application/commands/update-transaction.handler";
import { PrepayOpenPeriodCommand } from "../../../../../src/domains/credit-statement/application/commands/prepay-open-period.command";
import { PrepayOpenPeriodHandler } from "../../../../../src/domains/credit-statement/application/commands/prepay-open-period.handler";
import { PaymentExceedsRemainingError } from "../../../../../src/domains/credit-statement/domain/errors";
import { PrismaCardAccountRepository } from "../../../../../src/domains/card-account/infrastructure/prisma-card-account.repository";
import { PrismaCardLimitRepository } from "../../../../../src/domains/card-limit/infrastructure/prisma-card-limit.repository";
import { PrismaInstallmentPaymentRepository } from "../../../../../src/domains/installment-payment/infrastructure/prisma-installment-payment.repository";
import { PrismaTransactionRepository } from "../../../../../src/domains/transaction/infrastructure/prisma-transaction.repository";
import {
  buildBankAccountRepo,
  buildCreditStatementRepo,
  buildIdempotencyRecordRepo,
  buildTransactionWriterRepo,
} from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("PrepayOpenPeriodHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const transactionWriter = buildTransactionWriterRepo(prisma);
  const transactionRepo = new PrismaTransactionRepository(prisma, accountRepo);
  const cardRepo = new PrismaCardAccountRepository(prisma, new PrismaCardLimitRepository(prisma));
  const installmentPaymentLookup = new PrismaInstallmentPaymentRepository(prisma);

  const userId = `u_${randomUUID()}`;
  let creditAccountId: string;
  let fromAccountId: string;
  let statementId: string;

  function prepayHandler() {
    return new PrepayOpenPeriodHandler(
      { publish: vi.fn() } as never,
      buildIdempotencyRecordRepo(prisma),
      accountRepo,
      statementRepo,
      transactionWriter,
      prisma,
    );
  }

  function updateHandler() {
    return new UpdateTransactionHandler(
      { publish: vi.fn() } as never,
      transactionRepo,
      accountRepo,
      cardRepo,
      new PrismaCardLimitRepository(prisma),
      statementRepo,
      installmentPaymentLookup,
      transactionWriter,
      prisma,
    );
  }

  function removeHandler() {
    return new RemoveTransactionHandler(
      { publish: vi.fn() } as never,
      transactionRepo,
      accountRepo,
      cardRepo,
      new PrismaCardLimitRepository(prisma),
      statementRepo,
      installmentPaymentLookup,
      transactionWriter,
      prisma,
    );
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, email: `${userId}@test.local` } });
    const creditAccount = await accountRepo.createWithCards(userId, {
      name: "Visa Crédito",
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
      creditLimit: "1000000",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
    creditAccountId = creditAccount.id;
    const fromAccount = await accountRepo.createWithCards(userId, {
      name: "Cuenta Corriente",
      type: "CHECKING",
      status: "ACTIVE",
      currency: "CLP",
      institution: null,
      institutionId: null,
      accountNumber: "123",
      accountAlias: null,
      initialBalance: "1000000",
      overdraftLimit: "0",
      balanceCeiling: null,
      creditLimit: "0",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
    fromAccountId = fromAccount.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { accountId: creditAccountId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("opens a real gross total on the account's OPEN period (a $200.000 purchase)", async () => {
    const statement = await statementRepo.findOrCreateOpenForAccount(creditAccountId, new Date());
    statementId = statement.id;
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: creditAccountId,
        type: "EXPENSE",
        amount: "200000",
        currency: "CLP",
        occurredAt: new Date(),
        creditStatementId: statementId,
      },
    });
    // The raw insert above doesn't move `creditUsed` (that's the handlers' job) —
    // seed it directly to match, same convention `pay-credit-statement.transaction.spec.ts` uses.
    await prisma.bankAccount.update({
      where: { id: creditAccountId },
      data: { creditUsed: "200000" },
    });
  });

  it("US1: creates a real EXPENSE on the source account and lowers creditUsed immediately, without closing the period", async () => {
    const result = await prepayHandler().execute(
      new PrepayOpenPeriodCommand(
        userId,
        creditAccountId,
        statementId,
        fromAccountId,
        "50000",
        randomUUID(),
      ),
    );

    expect(result.status).toBe("OPEN");
    expect(result.prepaidAmount).toBe("50000.0000");
    expect(result.amount).toBe("150000.0000");

    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.creditUsed).toBe("150000.0000");

    const [tx] = (await transactionRepo.list(userId, { bankAccountId: fromAccountId })).items;
    expect(tx.amount).toBe("50000.0000");
    expect(tx.snapshot().prepaymentStatementId).toBe(statementId);
    expect(tx.snapshot().prepaymentAccountId).toBe(creditAccountId);
    expect(tx.creditStatementId).toBeNull();
  });

  it("US2: a second prepago accumulates on the same still-OPEN period", async () => {
    const result = await prepayHandler().execute(
      new PrepayOpenPeriodCommand(
        userId,
        creditAccountId,
        statementId,
        fromAccountId,
        "30000",
        randomUUID(),
      ),
    );

    expect(result.status).toBe("OPEN");
    expect(result.prepaidAmount).toBe("80000.0000");
    expect(result.amount).toBe("120000.0000");

    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.creditUsed).toBe("120000.0000");
  });

  it("US2: rejects a prepago exceeding what's left, with no side effects", async () => {
    await expect(
      prepayHandler().execute(
        new PrepayOpenPeriodCommand(
          userId,
          creditAccountId,
          statementId,
          fromAccountId,
          "999999",
          randomUUID(),
        ),
      ),
    ).rejects.toThrow(PaymentExceedsRemainingError);

    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.creditUsed).toBe("120000.0000"); // unchanged
  });

  it("FR-010: replaying the same Idempotency-Key returns the same result without duplicating the effect", async () => {
    const key = randomUUID();
    const command = new PrepayOpenPeriodCommand(
      userId,
      creditAccountId,
      statementId,
      fromAccountId,
      "10000",
      key,
    );
    const first = await prepayHandler().execute(command);
    const second = await prepayHandler().execute(
      new PrepayOpenPeriodCommand(
        userId,
        creditAccountId,
        statementId,
        fromAccountId,
        "10000",
        key,
      ),
    );

    expect(second).toEqual(first);
    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.creditUsed).toBe("110000.0000"); // decremented ONCE, not twice
  });

  it("research.md R8: N concurrent prepagos never let the total exceed what's owed", async () => {
    // 110000 owed right now; five concurrent attempts of 30000 each (150000 total)
    // must accept only as many as fit (3 of them, 90000) and reject the rest.
    const attempts = Array.from({ length: 5 }, () =>
      prepayHandler()
        .execute(
          new PrepayOpenPeriodCommand(
            userId,
            creditAccountId,
            statementId,
            fromAccountId,
            "30000",
            randomUUID(),
          ),
        )
        .then(() => "ok" as const)
        .catch(() => "rejected" as const),
    );
    const outcomes = await Promise.all(attempts);
    const accepted = outcomes.filter((o) => o === "ok").length;
    expect(accepted).toBe(3); // 110000 / 30000 = 3.67 -> 3 fit, 2 rejected

    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.creditUsed).toBe("20000.0000"); // 110000 - 3*30000

    const statement = await statementRepo.findById(userId, creditAccountId, statementId);
    expect(statement?.prepaidAmount).toBe("180000.0000"); // 90000 + 3*30000, never more
  });

  it("FR-012: editing a prepago's own movement reconciles creditUsed and prepaidAmount", async () => {
    const [firstPrepay] = (
      await transactionRepo.list(userId, { bankAccountId: fromAccountId })
    ).items
      .filter((t) => t.snapshot().prepaymentStatementId === statementId)
      .sort((a, b) => Number(a.amount) - Number(b.amount)); // the 10000 one

    await updateHandler().execute(
      new UpdateTransactionCommand(userId, firstPrepay.id, { amount: "15000" }),
    );

    const account = await accountRepo.findById(userId, creditAccountId);
    // Was 20000 used; raising this prepago by +5000 frees 5000 more.
    expect(account?.creditUsed).toBe("15000.0000");

    const statement = await statementRepo.findById(userId, creditAccountId, statementId);
    expect(statement?.prepaidAmount).toBe("185000.0000"); // 180000 + 5000
  });

  it("FR-012: deleting a prepago's movement fully reverses it", async () => {
    const [firstPrepay] = (
      await transactionRepo.list(userId, { bankAccountId: fromAccountId })
    ).items
      .filter((t) => t.snapshot().prepaymentStatementId === statementId)
      .sort((a, b) => Number(a.amount) - Number(b.amount)); // the 15000 one now

    await removeHandler().execute(new RemoveTransactionCommand(userId, firstPrepay.id));

    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.creditUsed).toBe("30000.0000"); // 15000 + 15000 back

    const statement = await statementRepo.findById(userId, creditAccountId, statementId);
    expect(statement?.prepaidAmount).toBe("170000.0000"); // 185000 - 15000
  });
});
