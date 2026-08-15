import { describe, expect, it } from "vitest";

import { TransferPolicy } from "../../../../../src/domains/transaction/domain/transfer-policy";

const from = { id: "a1", type: "CHECKING" };
const to = { id: "a2", type: "SAVINGS" };

const input = {
  fromBankAccountId: "a1",
  toBankAccountId: "a2",
  amountOut: "1000",
  amountIn: "1000",
};

describe("TransferPolicy", () => {
  it("accepts a transfer between two of the user's accounts", () => {
    expect(() => TransferPolicy.validate(input, from, to)).not.toThrow();
  });

  it("accepts different currencies without comparing them", () => {
    // Each leg is in its own account's currency; no FX exists in this app.
    expect(() =>
      TransferPolicy.validate({ ...input, amountIn: "1.05" }, from, { id: "a2", type: "CHECKING" }),
    ).not.toThrow();
  });

  it("rejects source == destination", () => {
    expect(() =>
      TransferPolicy.validate({ ...input, toBankAccountId: "a1" }, from, from),
    ).toThrowError(/TRANSFER_SAME_ACCOUNT/);
  });

  it("rejects a destination that is a credit line", () => {
    expect(() =>
      TransferPolicy.validate(input, from, { id: "a2", type: "CREDIT_LINE" }),
    ).toThrowError(/TRANSFER_TO_CREDIT_ACCOUNT/);
  });

  it("rejects an account that isn't the user's (or doesn't exist)", () => {
    expect(() => TransferPolicy.validate(input, from, null)).toThrowError(
      /TRANSFER_ACCOUNT_NOT_FOUND/,
    );
    expect(() => TransferPolicy.validate(input, null, to)).toThrowError(
      /TRANSFER_ACCOUNT_NOT_FOUND/,
    );
  });

  it("rejects any card on a transfer", () => {
    expect(() => TransferPolicy.validate({ ...input, cardId: "c1" }, from, to)).toThrowError(
      /CARD_NOT_ALLOWED/,
    );
  });

  it("accepts a prepaid account as destination — that IS how it gets funded", () => {
    expect(() =>
      TransferPolicy.validate(input, from, { id: "a2", type: "PREPAID", currentBalance: "0" }),
    ).not.toThrow();
  });

  it("bounds an outgoing transfer by the prepaid account's balance", () => {
    const prepaidFrom = { id: "a1", type: "PREPAID", currentBalance: "1000" };
    expect(() => TransferPolicy.validate(input, prepaidFrom, to)).not.toThrow();
    expect(() =>
      TransferPolicy.validate({ ...input, amountOut: "1000.01" }, prepaidFrom, to),
    ).toThrowError(/PREPAID_INSUFFICIENT_BALANCE/);
  });

  it("checks an edited transfer against the balance before its own old leg", () => {
    const prepaidFrom = { id: "a1", type: "PREPAID", currentBalance: "200" };
    expect(() =>
      TransferPolicy.validate({ ...input, amountOut: "1000" }, prepaidFrom, to, "800"),
    ).not.toThrow();
    expect(() =>
      TransferPolicy.validate({ ...input, amountOut: "1001" }, prepaidFrom, to, "800"),
    ).toThrowError(/PREPAID_INSUFFICIENT_BALANCE/);
  });

  it("leaves other source account types unbounded", () => {
    expect(() =>
      TransferPolicy.validate({ ...input, amountOut: "999999" }, from, to),
    ).not.toThrow();
  });

  it("rejects a non-positive amount on either leg", () => {
    expect(() => TransferPolicy.validate({ ...input, amountOut: "0" }, from, to)).toThrowError(
      /INVALID_AMOUNT/,
    );
    expect(() => TransferPolicy.validate({ ...input, amountIn: "-5" }, from, to)).toThrowError(
      /INVALID_AMOUNT/,
    );
  });
});
