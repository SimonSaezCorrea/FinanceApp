import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PayCreditStatementCommand } from "../../../../../src/domains/credit-statement/application/commands/pay-credit-statement.command";
import { PayCreditStatementHandler } from "../../../../../src/domains/credit-statement/application/commands/pay-credit-statement.handler";
import { PrepayOpenPeriodCommand } from "../../../../../src/domains/credit-statement/application/commands/prepay-open-period.command";
import { PrepayOpenPeriodHandler } from "../../../../../src/domains/credit-statement/application/commands/prepay-open-period.handler";
import { StatementPaymentCurrencyAmbiguousError } from "../../../../../src/domains/credit-statement/domain/errors";
import { PrismaTransactionSumsRepository } from "../../../../../src/domains/transaction/infrastructure/prisma-transaction-sums.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import {
  buildBankAccountRepo,
  buildCategoryLookup,
  buildCreditStatementRepo,
  buildIdempotencyRecordRepo,
  buildInstallmentPlanRepo,
  buildTransactionWriterRepo,
} from "../../../support/repositories";

/**
 * Spec 030 (absorbing spec 028 US2) against a real database: a statement in ANOTHER currency
 * is settled with two amounts. The whole payment commits or rolls back together, and two
 * simultaneous payments with DIFFERENT idempotency keys can never both be accepted — the row
 * lock inside the transaction, not the idempotency reservation, is what serializes them.
 */
describe("Settling a statement in another currency (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const writer = buildTransactionWriterRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let creditAccountId: string;
  let cardId: string;
  let fromAccountId: string;

  const payHandler = () =>
    new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      buildIdempotencyRecordRepo(prisma),
      accountRepo,
      statementRepo,
      writer,
      buildInstallmentPlanRepo(prisma),
      prisma,
      buildCategoryLookup(prisma),
    );
  const prepayHandler = () =>
    new PrepayOpenPeriodHandler(
      { publish: vi.fn() } as never,
      buildIdempotencyRecordRepo(prisma),
      accountRepo,
      statementRepo,
      writer,
      prisma,
      buildCategoryLookup(prisma),
    );
  const pay = (statementId: string, amount?: string, chargedAmount?: string) =>
    payHandler().execute(
      new PayCreditStatementCommand(
        userId,
        creditAccountId,
        statementId,
        fromAccountId,
        randomUUID(),
        amount,
        undefined,
        undefined,
        chargedAmount,
      ),
    );
  const prepay = (statementId: string, amount: string, chargedAmount?: string) =>
    prepayHandler().execute(
      new PrepayOpenPeriodCommand(
        userId,
        creditAccountId,
        statementId,
        fromAccountId,
        amount,
        randomUUID(),
        undefined,
        undefined,
        chargedAmount,
      ),
    );

  /** A USD period with a US$50 purchase on the card; `closed` makes it a statement to pay. */
  async function usdPeriod(closed: boolean): Promise<string> {
    const open = await statementRepo.findOrCreateOpenForAccount(
      creditAccountId,
      new Date(),
      "USD",
    );
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: creditAccountId,
        cardId,
        type: "EXPENSE",
        amount: "50",
        currency: "USD",
        occurredAt: new Date(),
        creditStatementId: open.id,
      },
    });
    if (closed) {
      await prisma.creditStatement.update({
        where: { id: open.id },
        data: { closedAt: new Date(), dueDate: new Date(Date.now() + 864e5) },
      });
    }
    return open.id;
  }

  /** Each case starts from a clean slate of periods and movements. */
  async function reset() {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { accountId: creditAccountId } });
    await prisma.bankAccount.update({
      where: { id: fromAccountId },
      data: { currentBalance: "1000000" },
    });
    await prisma.bankAccount.update({
      where: { id: creditAccountId },
      data: { creditUsed: "0" },
    });
  }

  const balanceOfSource = async () =>
    (await prisma.bankAccount.findUniqueOrThrow({ where: { id: fromAccountId } })).currentBalance.toFixed(0);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, email: `${userId}@test.local` } });
    const credit = await accountRepo.createWithCards(userId, {
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
      creditLimit: "900000",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [
        {
          name: "Visa",
          kind: "CREDIT",
          last4: "7774",
          expiryMonth: 6,
          expiryYear: 2031,
          isActive: true,
          isPrimary: true,
          isVirtual: false,
          isAdditional: false,
          cardholderName: null,
          network: "VISA",
          limits: [{ currency: "USD", limitAmount: "100", usedInitial: "0" }],
        },
      ],
    });
    creditAccountId = credit.id;
    cardId = credit.cards.find((c) => c.isPrimary)!.id;
    const source = await accountRepo.createWithCards(userId, {
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
    fromAccountId = source.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { accountId: creditAccountId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("pays a USD statement from a CLP account: two movements, source balance, statement PAID, pool untouched", async () => {
    await reset();
    const statementId = await usdPeriod(true);

    const result = await pay(statementId, undefined, "49394");

    expect(result.status).toBe("PAID");
    expect(await balanceOfSource()).toBe("950606"); // 1.000.000 − 49.394
    const moved = await prisma.transaction.findMany({
      where: { userId, OR: [{ settlesStatementId: statementId }, { id: result.paidTransactionId! }] },
      orderBy: { type: "asc" },
    });
    const income = moved.find((t) => t.type === "INCOME")!;
    const expense = moved.find((t) => t.type === "EXPENSE")!;
    expect(income).toMatchObject({
      bankAccountId: creditAccountId,
      cardId,
      currency: "USD",
      settlesStatementId: statementId,
      creditStatementId: null,
    });
    expect(income.amount.toFixed(2)).toBe("50.00");
    expect(expense).toMatchObject({ bankAccountId: fromAccountId, currency: "CLP" });
    expect(expense.amount.toFixed(0)).toBe("49394");
    const credit = await prisma.bankAccount.findUniqueOrThrow({ where: { id: creditAccountId } });
    expect(credit.creditUsed.toFixed(0)).toBe("0");
    const stored = await prisma.creditStatement.findUniqueOrThrow({ where: { id: statementId } });
    expect(stored.settlementTransactionId).toBe(income.id);
  });

  it("is atomic: without the debited amount nothing is written", async () => {
    await reset();
    const statementId = await usdPeriod(true);
    const before = await prisma.transaction.count({ where: { userId } });

    await expect(pay(statementId)).rejects.toThrow(StatementPaymentCurrencyAmbiguousError);

    expect(await prisma.transaction.count({ where: { userId } })).toBe(before);
    expect(await balanceOfSource()).toBe("1000000");
    expect((await prisma.creditStatement.findUniqueOrThrow({ where: { id: statementId } })).paidAt).toBeNull();
  });

  it("three simultaneous payments with different keys: exactly one is accepted, the rest see it settled", async () => {
    await reset();
    const statementId = await usdPeriod(true);

    const outcomes = await Promise.all(
      [0, 1, 2].map(() =>
        pay(statementId, "50", "49000")
          .then(() => "ok" as const)
          .catch(() => "rejected" as const),
      ),
    );

    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(await balanceOfSource()).toBe("951000"); // debited ONCE
    expect(await prisma.transaction.count({ where: { userId, settlesStatementId: statementId } })).toBe(1);
  });

  it("a short payment rolls the shortfall into the OPEN period of the SAME currency", async () => {
    await reset();
    const statementId = await usdPeriod(true);

    const result = await pay(statementId, "30", "29400");

    expect(result.status).toBe("PARTIALLY_PAID");
    const periods = await prisma.creditStatement.findMany({
      where: { accountId: creditAccountId, currency: "USD" },
    });
    const next = periods.find((p) => p.id !== statementId)!;
    expect(next.closedAt).toBeNull();
    expect(next.carriedOverAmount.toFixed(2)).toBe("20.00");
  });

  it("prepays the open USD period: movements written, the period stays open, the pool is untouched", async () => {
    await reset();
    const statementId = await usdPeriod(false);

    const result = await prepay(statementId, "20", "19600");

    expect(result.status).toBe("OPEN");
    expect(result.prepaidAmount).toBe("20.0000");
    expect(await balanceOfSource()).toBe("980400");
    const credit = await prisma.bankAccount.findUniqueOrThrow({ where: { id: creditAccountId } });
    expect(credit.creditUsed.toFixed(0)).toBe("0");
    expect(await prisma.transaction.count({ where: { userId, settlesStatementId: statementId } })).toBe(2);
  });

  it("five simultaneous prepayments never exceed what the period owes", async () => {
    await reset();
    const statementId = await usdPeriod(false);

    // US$50 owed; 5 attempts of US$30 → only one fits.
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        prepay(statementId, "30", "29400")
          .then(() => "ok" as const)
          .catch(() => "rejected" as const),
      ),
    );

    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    const stored = await prisma.creditStatement.findUniqueOrThrow({ where: { id: statementId } });
    expect(stored.prepaidAmount.toFixed(2)).toBe("30.00");
    expect(await balanceOfSource()).toBe("970600"); // debited once
  });

  /** What the card's USD limit counts as used: purchases minus settlements still owed. */
  async function usdUsage(): Promise<string> {
    const sums = new PrismaTransactionSumsRepository(prisma);
    const rows = (await sums.sumsByCard(userId, [{ id: cardId, since: null }])).filter(
      (r) => r.currency === "USD",
    );
    const sum = (type: "INCOME" | "EXPENSE") =>
      Number(rows.find((r) => r.type === type)?.sum ?? "0");
    return (sum("EXPENSE") - sum("INCOME")).toFixed(2);
  }

  it("the USD limit's usage drops by what was prepaid, then to zero once the period is paid (no double count)", async () => {
    await reset();
    const statementId = await usdPeriod(false);
    expect(await usdUsage()).toBe("50.00");

    await prepay(statementId, "20", "19600");
    expect(await usdUsage()).toBe("30.00");

    await prisma.creditStatement.update({
      where: { id: statementId },
      data: { closedAt: new Date(), dueDate: new Date(Date.now() + 864e5) },
    });
    await pay(statementId, undefined, "29400");
    // The purchases leave with the paid period AND so does the settlement that paid it.
    expect(await usdUsage()).toBe("0.00");
  });
});
