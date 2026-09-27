import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaTransactionSumsRepository } from "../../../../../src/domains/transaction/infrastructure/prisma-transaction-sums.repository";
import { PrismaTransactionWriterRepository } from "../../../../../src/domains/transaction/infrastructure/prisma-transaction-writer.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import { buildBankAccountRepo, buildCreditStatementRepo } from "../../../support/repositories";

/**
 * Spec 028 (research R4, FR-017): a period's recomputation only sees ITS currency,
 * and never the settlement INCOME of a foreign-currency statement — otherwise
 * "Sincronizar pagos" would count a payment as a credit of the next period, the
 * same money twice.
 */
describe("period sums per currency, settlements excluded (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const sums = new PrismaTransactionSumsRepository(prisma);
  const writer = new PrismaTransactionWriterRepository(prisma);
  const userId = `u_${randomUUID()}`;
  let accountId: string;
  let cardId: string;
  let usdStatementId: string;
  let clpStatementId: string;

  const FROM = new Date("2026-07-20T00:00:00.000Z");
  const TO = new Date("2026-08-20T00:00:00.000Z");
  const IN = new Date("2026-07-25T00:00:00.000Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const account = await accountRepo.createWithCards(userId, {
      name: "BCI Crédito",
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
      billingCycleDay: 20,
      paymentMethod: "MANUAL",
      cards: [
        {
          name: "Visa",
          kind: "CREDIT",
          last4: "7758",
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
    accountId = account.id;
    cardId = account.cards[0].id;
    clpStatementId = (await statementRepo.findOrCreateOpenForAccount(accountId, FROM, "CLP")).id;
    usdStatementId = (await statementRepo.findOrCreateOpenForAccount(accountId, FROM, "USD")).id;

    const base = { userId, bankAccountId: accountId, cardId, occurredAt: IN };
    await prisma.transaction.createMany({
      data: [
        { ...base, type: "EXPENSE", amount: "120000", currency: "CLP" },
        { ...base, type: "EXPENSE", amount: "30", currency: "USD" },
        { ...base, type: "EXPENSE", amount: "9.06", currency: "USD" },
        // The settlement of an earlier USD statement: never part of any period.
        {
          ...base,
          type: "INCOME",
          amount: "25",
          currency: "USD",
          settlesStatementId: usdStatementId,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("netForPeriod counts only the period's currency and skips settlements", async () => {
    const window = { accountId, cardIds: null, from: FROM, to: TO };
    expect(Number(await sums.netForPeriod({ ...window, currency: "CLP" }))).toBe(120000);
    expect(Number(await sums.netForPeriod({ ...window, currency: "USD" }))).toBeCloseTo(39.06, 4);
  });

  it("relinkToStatementWithTx links only its currency and never a settlement", async () => {
    await prisma.$transaction(async (tx) => {
      await writer.relinkToStatementWithTx(tx, {
        statementId: usdStatementId,
        accountId,
        cardIds: null,
        from: FROM,
        to: TO,
        currency: "USD",
      });
      await writer.relinkToStatementWithTx(tx, {
        statementId: clpStatementId,
        accountId,
        cardIds: null,
        from: FROM,
        to: TO,
        currency: "CLP",
      });
    });
    const rows = await prisma.transaction.findMany({ where: { userId } });
    for (const row of rows) {
      if (row.settlesStatementId) expect(row.creditStatementId).toBeNull();
      else if (row.currency === "USD") expect(row.creditStatementId).toBe(usdStatementId);
      else expect(row.creditStatementId).toBe(clpStatementId);
    }
    expect(Number(await sums.netForStatement(usdStatementId))).toBeCloseTo(39.06, 4);
  });
});
