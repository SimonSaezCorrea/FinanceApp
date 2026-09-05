import { describe, expect, it } from "vitest";

import {
  createTransferSchema,
  isTransfer,
  transferSide,
  updateTransferSchema,
  type Transaction,
} from "./index";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  type: "EXPENSE",
  amount: "1000",
  currency: "CLP",
  occurredAt: "2026-08-01T00:00:00.000Z",
  category: null,
  description: null,
  observation: null,
  emisor: null,
  receptor: null,
  lugar: null,
  bankAccountId: "a1",
  cardId: null,
  financeCharge: false,
  installmentPlanId: null,
  transferGroupId: null,
  debtId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const ACCOUNT_A = "018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e6f";
const ACCOUNT_B = "018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e70";

const validTransfer = {
  fromBankAccountId: ACCOUNT_A,
  toBankAccountId: ACCOUNT_B,
  amountOut: "1000",
  amountIn: "1000",
  currencyOut: "CLP",
  currencyIn: "CLP",
  occurredAt: "2026-08-01T00:00:00.000Z",
};

describe("createTransferSchema", () => {
  it("accepts a transfer between two different accounts", () => {
    expect(createTransferSchema.safeParse(validTransfer).success).toBe(true);
  });

  it("rejects source == destination", () => {
    const result = createTransferSchema.safeParse({
      ...validTransfer,
      toBankAccountId: ACCOUNT_A,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["toBankAccountId"]);
    }
  });

  it("accepts different currencies on each side (no comparison)", () => {
    expect(
      createTransferSchema.safeParse({
        ...validTransfer,
        currencyIn: "USD",
        amountIn: "1.05",
      }).success,
    ).toBe(true);
  });
});

describe("updateTransferSchema", () => {
  it("accepts a partial body", () => {
    expect(updateTransferSchema.safeParse({ amountOut: "500" }).success).toBe(true);
  });

  it("still rejects source == destination when both are sent", () => {
    expect(
      updateTransferSchema.safeParse({
        fromBankAccountId: ACCOUNT_A,
        toBankAccountId: ACCOUNT_A,
      }).success,
    ).toBe(false);
  });
});

describe("isTransfer / transferSide", () => {
  it("classifies an ordinary movement", () => {
    expect(isTransfer(tx())).toBe(false);
    expect(transferSide(tx())).toBeNull();
  });

  it("classifies both sides of a transfer", () => {
    expect(isTransfer(tx({ transferGroupId: "g1" }))).toBe(true);
    expect(transferSide(tx({ transferGroupId: "g1", type: "EXPENSE" }))).toBe("OUT");
    expect(transferSide(tx({ transferGroupId: "g1", type: "INCOME" }))).toBe("IN");
  });
});
