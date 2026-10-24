import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaCardAccountRepository } from "../../../../../src/domains/card-account/infrastructure/prisma-card-account.repository";
import { PrismaCardLimitRepository } from "../../../../../src/domains/card-limit/infrastructure/prisma-card-limit.repository";
import { PrismaTransactionFieldValueRepository } from "../../../../../src/domains/transaction-field-value/infrastructure/prisma-transaction-field-value.repository";
import { PrismaTransactionScopeLookupRepository } from "../../../../../src/domains/transaction/infrastructure/prisma-transaction-scope-lookup.repository";
import { scopeWhere } from "../../../../../src/domains/transaction/domain/scope-where";
import { generateRowId } from "../../../../../src/infra/id/generate-row-id";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/** Real-test-DB integration test (specs/036): values, filters by value, cover and its
 * revert, and the scope lookup over movements. Requires `DATABASE_URL`. */
describe("custom field values and scope (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const values = new PrismaTransactionFieldValueRepository(prisma);
  const scope = new PrismaTransactionScopeLookupRepository(prisma);
  const cards = new PrismaCardAccountRepository(prisma, new PrismaCardLimitRepository(prisma));
  const userId = generateRowId();
  const otherId = generateRowId();
  const boolField = generateRowId();
  const numField = generateRowId();
  const textField = generateRowId();
  const tx: string[] = [];
  let accountId = "";
  let creditCard = "";

  const BOOL = { id: boolField, type: "BOOLEAN" as const };

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [userId, otherId]) {
      await prisma.user.create({
        data: { id, email: `${id}@test.local`, passwordHash: "x", name: "Test" },
      });
    }
    const account = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Tarjeta",
        currency: "CLP",
        type: "CREDIT_CARD",
        creditLimit: "1000000",
      },
    });
    accountId = account.id;
    creditCard = (
      await prisma.cardAccount.create({
        data: {
          userId,
          accountId,
          name: "Visa",
          kind: "CREDIT",
          last4: "1234",
          expiryMonth: 1,
          expiryYear: 2030,
          isPrimary: true,
        },
      })
    ).id;
    for (const [name, type] of [
      [boolField, "BOOLEAN"],
      [numField, "NUMBER"],
      [textField, "TEXT"],
    ] as const) {
      await prisma.customField.create({
        data: { id: name, userId, name, nameKey: name, type },
      });
    }
    const mk = async (data: {
      type: "EXPENSE" | "INCOME";
      cardId?: string;
      transferGroupId?: string;
    }) =>
      (
        await prisma.transaction.create({
          data: {
            userId,
            bankAccountId: accountId,
            amount: "1000",
            currency: "CLP",
            occurredAt: new Date(`2026-10-0${tx.length + 1}T12:00:00Z`),
            ...data,
          },
        })
      ).id;
    tx.push(await mk({ type: "EXPENSE", cardId: creditCard }));
    tx.push(await mk({ type: "EXPENSE", cardId: creditCard }));
    tx.push(await mk({ type: "EXPENSE", cardId: creditCard }));
    tx.push(await mk({ type: "INCOME" }));
    tx.push(await mk({ type: "EXPENSE", transferGroupId: generateRowId() }));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  it("writes typed values, reads them back per movement and counts them", async () => {
    await values.upsertManyWithTx(prisma, userId, [
      { transactionId: tx[0]!, customFieldId: boolField, type: "BOOLEAN", value: false },
      { transactionId: tx[1]!, customFieldId: boolField, type: "BOOLEAN", value: true },
      { transactionId: tx[0]!, customFieldId: numField, type: "NUMBER", value: "12.5" },
      { transactionId: tx[1]!, customFieldId: textField, type: "TEXT", value: "Viaje Japón" },
    ]);
    const read = await values.listForTransactions(userId, tx);
    expect(read.get(tx[0]!)).toEqual({ [boolField]: false, [numField]: "12.5" });
    expect(read.get(tx[1]!)).toEqual({ [boolField]: true, [textField]: "Viaje Japón" });
    expect(read.has(tx[2]!)).toBe(false);
    expect((await values.countByField(userId)).get(boolField)).toBe(2);
  });

  it("filters by an exact value, containing text and a number range", async () => {
    expect(
      await values.idsMatching(userId, boolField, {
        kind: "equals",
        type: "BOOLEAN",
        value: false,
      }),
    ).toEqual([tx[0]]);
    expect(
      await values.idsMatching(userId, textField, { kind: "contains", text: "japón" }),
    ).toEqual([tx[1]]);
    expect(
      await values.idsMatching(userId, numField, {
        kind: "range",
        type: "NUMBER",
        min: "10",
        max: "13",
      }),
    ).toEqual([tx[0]]);
    expect(
      await values.idsMatching(userId, numField, { kind: "range", type: "NUMBER", min: "13" }),
    ).toEqual([]);
    expect(await values.idsMatching(otherId, boolField, { kind: "any" })).toEqual([]);
  });

  it("'no value' is no row", async () => {
    await values.deleteManyWithTx(prisma, userId, numField, [tx[0]!]);
    expect((await values.listForTransactions(userId, [tx[0]!])).get(tx[0]!)).toEqual({
      [boolField]: false,
    });
  });

  it("the scope lookup counts kinds, card kinds and transfer legs apart", async () => {
    const kinds = await cards.kindsForUser(userId);
    expect(kinds.get(creditCard)).toBe("CREDIT");
    const creditExpenses = scopeWhere(
      {
        movementKinds: ["EXPENSE"],
        restrictAccounts: false,
        accountIds: [],
        cardKinds: ["CREDIT"],
      },
      kinds,
    );
    expect(await scope.countInScope(userId, creditExpenses)).toBe(3);
    const transfers = scopeWhere(
      { movementKinds: ["TRANSFER"], restrictAccounts: false, accountIds: [], cardKinds: [] },
      kinds,
    );
    expect(await scope.idsInScope(userId, transfers, 10)).toEqual([tx[4]]);
    const none = scopeWhere(
      { movementKinds: [], restrictAccounts: true, accountIds: [], cardKinds: [] },
      kinds,
    );
    expect(await scope.countInScope(userId, none)).toBe(0);
    expect(await scope.countInScope(otherId, creditExpenses)).toBe(0);
    expect(
      await scope.idsForFilter(userId, { excludeIds: [tx[0]!], scope: creditExpenses }, 10),
    ).toHaveLength(2);
  });

  it("reverts a bulk assignment only where the value is still the one it set", async () => {
    await values.upsertManyWithTx(prisma, userId, [
      { transactionId: tx[0]!, customFieldId: boolField, type: "BOOLEAN", value: true },
      { transactionId: tx[2]!, customFieldId: boolField, type: "BOOLEAN", value: true },
    ]);
    // tx[2] was edited by hand after the assignment.
    await values.upsertManyWithTx(prisma, userId, [
      { transactionId: tx[2]!, customFieldId: boolField, type: "BOOLEAN", value: false },
    ]);
    const result = await values.revertIfUnchangedWithTx(prisma, userId, BOOL, true, [
      { transactionId: tx[0]!, value: false },
      { transactionId: tx[2]!, value: null },
    ]);
    expect(result).toEqual({ restored: 1, kept: 1 });
    const read = await values.listForTransactions(userId, [tx[0]!, tx[2]!]);
    expect(read.get(tx[0]!)?.[boolField]).toBe(false);
    expect(read.get(tx[2]!)?.[boolField]).toBe(false);
  });

  it("a cover is undone by its transfer, respecting manual edits made since", async () => {
    const group = generateRowId();
    // tx[0] holds false, tx[2] holds false, tx[3] has no value.
    await values.deleteManyWithTx(prisma, userId, boolField, [tx[3]!]);
    await prisma.$transaction(async (t) => {
      const locked = await values.lockForCoverWithTx(t, userId, boolField, [
        tx[0]!,
        tx[2]!,
        tx[3]!,
      ]);
      await values.coverWithTx(
        t,
        userId,
        BOOL,
        true,
        group,
        [tx[0]!, tx[2]!, tx[3]!].map((id) => ({
          transactionId: id,
          previous: locked.get(id)?.value ?? null,
          existed: locked.has(id),
        })),
      );
    });
    expect(await values.coveredCount(userId, group)).toBe(3);
    // tx[2] edited by hand: no longer covered.
    await values.upsertManyWithTx(prisma, userId, [
      { transactionId: tx[2]!, customFieldId: boolField, type: "BOOLEAN", value: true },
    ]);
    expect(await values.coveredCount(userId, group)).toBe(2);

    expect(await values.revertCoverWithTx(prisma, userId, [group])).toBe(2);
    const read = await values.listForTransactions(userId, [tx[0]!, tx[2]!, tx[3]!]);
    expect(read.get(tx[0]!)?.[boolField]).toBe(false);
    expect(read.get(tx[2]!)?.[boolField]).toBe(true);
    expect(read.get(tx[3]!)?.[boolField]).toBeUndefined();
  });

  it("deleting a movement or a field deletes its values", async () => {
    await prisma.transaction.delete({ where: { id: tx[1]! } });
    expect((await values.listForTransactions(userId, [tx[1]!])).size).toBe(0);
    await prisma.customField.delete({ where: { id: textField } });
    expect((await values.countByField(userId)).get(textField)).toBeUndefined();
  });
});
