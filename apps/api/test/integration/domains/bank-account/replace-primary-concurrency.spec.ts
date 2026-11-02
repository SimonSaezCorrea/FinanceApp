import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ReplacePrimaryCardCommand } from "../../../../src/domains/bank-account/application/commands/replace-primary-card.command";
import { ReplacePrimaryCardHandler } from "../../../../src/domains/bank-account/application/commands/replace-primary-card.handler";
import { CardNotPrimaryError } from "../../../../src/domains/bank-account/domain/errors";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import {
  buildBankAccountRepo,
  buildIdempotencyRecordRepo,
  buildTransactionSumsRepo,
} from "../../support/repositories";

/**
 * Spec 039: two replacements of the same primary at once (different idempotency keys) run one
 * after the other — the account row is locked — so exactly one wins and the account never ends
 * with two primaries (the partial unique index is the database's own guard).
 */
describe("replace-primary concurrency (integration, spec 039)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let accountId: string;
  let primaryId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "T" },
    });
    const account = await accountRepo.createWithCards(userId, {
      name: "Visa",
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
      cards: [
        {
          name: "Visa",
          kind: "CREDIT",
          last4: "1111",
          expiryMonth: 6,
          expiryYear: 2031,
          isActive: true,
          isPrimary: true,
          isVirtual: false,
          isAdditional: false,
          cardholderName: null,
          network: null,
          limits: [],
        },
      ],
    });
    accountId = account.id;
    primaryId = account.cards[0]!.id;
  });

  afterAll(async () => {
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.idempotencyRecord.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("one replacement wins, the other finds the card no longer primary", async () => {
    const handler = new ReplacePrimaryCardHandler(
      { publish: vi.fn() } as never,
      buildIdempotencyRecordRepo(prisma),
      accountRepo,
      buildTransactionSumsRepo(prisma),
      { existsForCard: async () => false, list: async () => [] } as never,
      { carriedOverOwed: async () => new Map() } as never,
      prisma,
    );
    const attempt = (last4: string) =>
      handler.execute(
        new ReplacePrimaryCardCommand(
          userId,
          accountId,
          primaryId,
          {
            action: "DEACTIVATE",
            replacement: {
              newCard: {
                name: `Visa ${last4}`,
                last4,
                expiryMonth: 4,
                expiryYear: 2032,
                isVirtual: false,
                isAdditional: false,
              },
            },
          },
          randomUUID(),
        ),
      );

    const results = await Promise.allSettled([attempt("8888"), attempt("9999")]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(CardNotPrimaryError);

    const cards = await prisma.cardAccount.findMany({ where: { accountId } });
    expect(cards.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(cards.filter((c) => c.isPrimary)[0]!.isActive).toBe(true);
    // The losing attempt rolled back with its card.
    expect(cards).toHaveLength(2);
  });
});
