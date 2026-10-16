import { describe, expect, it } from "vitest";

import type { transactions } from "@finance/contracts";

import { movementActions } from "./movementActions";

const ID = "0190f3a2-7b1c-7000-8000-000000000001";
const tx = (over: Partial<transactions.Transaction> = {}) =>
  ({
    installmentPlanId: null,
    settlesStatementId: null,
    transferStatementId: null,
    settlementPairId: null,
    paidStatementId: null,
    ...over,
  }) as transactions.Transaction;

describe("movementActions", () => {
  it("an ordinary movement can be edited and deleted", () => {
    expect(movementActions(tx())).toEqual({ edit: true, delete: true });
  });

  it("a statement's payment is never edited here, but deleting it undoes the payment", () => {
    expect(movementActions(tx({ paidStatementId: ID }))).toEqual({ edit: false, delete: true });
  });

  it("a movement corrected from where it came from offers neither", () => {
    for (const over of [
      { installmentPlanId: ID },
      { settlesStatementId: ID },
      { transferStatementId: ID },
    ]) {
      expect(movementActions(tx(over))).toEqual({ edit: false, delete: false });
    }
  });

  it("a prepayment in another currency is deleted as a pair, never edited", () => {
    expect(movementActions(tx({ settlesStatementId: ID, settlementPairId: ID }))).toEqual({
      edit: false,
      delete: true,
    });
  });
});
