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

  it("rejects a non-positive amount on either leg", () => {
    expect(() => TransferPolicy.validate({ ...input, amountOut: "0" }, from, to)).toThrowError(
      /INVALID_AMOUNT/,
    );
    expect(() => TransferPolicy.validate({ ...input, amountIn: "-5" }, from, to)).toThrowError(
      /INVALID_AMOUNT/,
    );
  });
});
